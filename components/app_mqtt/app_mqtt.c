#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/timers.h"

#include "cJSON.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_app_desc.h"
#include "esp_system.h"
#include "mqtt_client.h"

#include "app_events.h"
#include "app_monitor.h"
#include "app_mqtt_discovery.h"
#include "app_pumps.h"
#include "app_settings.h"
#include "app_time.h"
#include "app_mqtt.h"

static const char *TAG = "APP_MQTT";
static const char *MQTT_DISCOVERY_PREFIX = "homeassistant";

typedef struct {
    uint8_t pump_id;
    bool active;
    const char *state;
    float speed;
    bool direction;
    uint32_t remaining_ticks;
    double remaining_seconds;
    double volume_ml;
    double tank_current_vol;
    double tank_full_vol;
    double running_hours;
    const char *name;
} mqtt_pump_snapshot_t;

typedef struct {
    bool enabled;
    uint8_t mqtt_ip_address[4];
    uint16_t mqtt_port;
    char mqtt_user[MAX_NETWORK_STR_LEN];
    char mqtt_password[MAX_NETWORK_STR_LEN];
    uint8_t mqtt_qos;
    uint8_t mqtt_retain;
    char hostname[sizeof(((services_t *)0)->hostname)];
} mqtt_runtime_config_t;

typedef enum {
    MQTT_CMD_RECONFIGURE = 1,
} mqtt_command_type_t;

typedef struct {
    mqtt_command_type_t type;
    mqtt_runtime_config_t config;
} mqtt_command_t;

static esp_mqtt_client_handle_t s_client;
static esp_event_handler_instance_t s_pump_runtime_event_ctx;
static esp_event_handler_instance_t s_services_updated_event_ctx;
static TimerHandle_t s_status_timer;
static QueueHandle_t s_command_queue;
static bool s_mqtt_enabled;
static bool s_mqtt_connected;
static bool s_discovery_published;
static char s_broker_uri[96];
static char s_availability_topic[96];
static mqtt_runtime_config_t s_runtime_config;
static bool s_runtime_config_valid;

static void mqtt_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data);

static const char *pump_state_to_string(pump_state_t state)
{
    switch (state) {
        case PUMP_ON:
            return "timed";
        case PUMP_CONTINUOUS:
            return "continuous";
        case PUMP_CAL:
            return "calibration";
        case PUMP_OFF:
        default:
            return "off";
    }
}

static void build_topic_base(char *buffer, size_t size)
{
    services_t *services = get_service_config();
    strlcpy(buffer, services->hostname, size);
}

static void build_topic_base_from_hostname(const char *hostname, char *buffer, size_t size)
{
    if (hostname == NULL || hostname[0] == '\0') {
        strlcpy(buffer, "device", size);
        return;
    }

    strlcpy(buffer, hostname, size);
}

static bool mqtt_runtime_config_is_usable(const mqtt_runtime_config_t *config)
{
    if (config == NULL || !config->enabled || config->mqtt_port == 0) {
        return false;
    }

    return config->mqtt_ip_address[0] != 0 || config->mqtt_ip_address[1] != 0 ||
           config->mqtt_ip_address[2] != 0 || config->mqtt_ip_address[3] != 0;
}

static void build_broker_uri(const services_t *services, char *buffer, size_t size)
{
    snprintf(buffer, size, "mqtt://%u.%u.%u.%u:%u",
             services->mqtt_ip_address[0],
             services->mqtt_ip_address[1],
             services->mqtt_ip_address[2],
             services->mqtt_ip_address[3],
             services->mqtt_port);
}

static void build_broker_uri_from_config(const mqtt_runtime_config_t *config, char *buffer, size_t size)
{
    snprintf(buffer, size, "mqtt://%u.%u.%u.%u:%u",
             config->mqtt_ip_address[0],
             config->mqtt_ip_address[1],
             config->mqtt_ip_address[2],
             config->mqtt_ip_address[3],
             config->mqtt_port);
}

static void mqtt_runtime_config_from_services(const services_t *services, mqtt_runtime_config_t *config)
{
    memset(config, 0, sizeof(*config));
    if (services == NULL) {
        return;
    }

    config->enabled = services->enable_mqtt;
    memcpy(config->mqtt_ip_address, services->mqtt_ip_address, sizeof(config->mqtt_ip_address));
    config->mqtt_port = services->mqtt_port;
    strlcpy(config->mqtt_user, services->mqtt_user, sizeof(config->mqtt_user));
    strlcpy(config->mqtt_password, services->mqtt_password, sizeof(config->mqtt_password));
    config->mqtt_qos = services->mqtt_qos;
    config->mqtt_retain = services->mqtt_retain;
    strlcpy(config->hostname, services->hostname, sizeof(config->hostname));
}

static bool mqtt_runtime_config_equal(const mqtt_runtime_config_t *left, const mqtt_runtime_config_t *right)
{
    if (left == NULL || right == NULL) {
        return false;
    }

    return left->enabled == right->enabled &&
           left->mqtt_port == right->mqtt_port &&
           left->mqtt_qos == right->mqtt_qos &&
           left->mqtt_retain == right->mqtt_retain &&
           memcmp(left->mqtt_ip_address, right->mqtt_ip_address, sizeof(left->mqtt_ip_address)) == 0 &&
           strcmp(left->mqtt_user, right->mqtt_user) == 0 &&
           strcmp(left->mqtt_password, right->mqtt_password) == 0 &&
           strcmp(left->hostname, right->hostname) == 0;
}

static void publish_string_topic(const char *topic, const char *payload, int qos, int retain)
{
    if (!s_mqtt_enabled || !s_mqtt_connected || s_client == NULL || topic == NULL || payload == NULL) {
        return;
    }

    esp_mqtt_client_publish(s_client, topic, payload, 0, qos, retain);
}

static void publish_json_topic(const char *topic, cJSON *root, int qos, int retain)
{
    char *payload = cJSON_PrintUnformatted(root);
    if (payload == NULL) {
        cJSON_Delete(root);
        return;
    }

    publish_string_topic(topic, payload, qos, retain);
    free(payload);
    cJSON_Delete(root);
}

static mqtt_pump_snapshot_t build_pump_snapshot(uint8_t pump_id)
{
    const pumps_status_t *runtime = get_pumps_runtime_status();
    pump_t *pump_config = get_pump_config(pump_id);

    mqtt_pump_snapshot_t snapshot = {
        .pump_id = pump_id,
        .active = runtime[pump_id].state != PUMP_OFF,
        .state = pump_state_to_string(runtime[pump_id].state),
        .speed = runtime[pump_id].rpm,
        .direction = runtime[pump_id].direction,
        .remaining_ticks = runtime[pump_id].time,
        .remaining_seconds = (double)runtime[pump_id].time / (double)PUMP_TIMER_UNIT_IN_SEC,
        .volume_ml = runtime[pump_id].volume,
        .tank_current_vol = pump_config->tank_current_vol,
        .tank_full_vol = pump_config->tank_full_vol,
        .running_hours = pump_config->running_hours,
        .name = pump_config->name,
    };

    return snapshot;
}

static void publish_availability(const char *payload)
{
    services_t *services = get_service_config();
    char topic[96];
    char topic_base[48];

    build_topic_base(topic_base, sizeof(topic_base));
    snprintf(topic, sizeof(topic), "%s/availability", topic_base);
    publish_string_topic(topic, payload, services->mqtt_qos, services->mqtt_retain);
}

static void publish_status(void)
{
    if (!s_mqtt_connected) {
        return;
    }

    services_t *services = get_service_config();
    system_status_t *system_status = get_system_status();
    const esp_app_desc_t *app_description = esp_app_get_description();
    char topic_base[48];
    char topic[96];
    char time_string[32];
    cJSON *root = cJSON_CreateObject();

    build_topic_base(topic_base, sizeof(topic_base));
    snprintf(topic, sizeof(topic), "%s/status", topic_base);

    det_time_string_since_boot(time_string);
    cJSON_AddStringToObject(root, "up_time", time_string);

    get_time_string(time_string);
    cJSON_AddStringToObject(root, "local_time", time_string);

    cJSON_AddStringToObject(root, "device_id", topic_base);
    cJSON_AddStringToObject(root, "hostname", services->hostname);
    cJSON_AddNumberToObject(root, "free_heap", (double)system_status->free_heap);
    cJSON_AddStringToObject(root, "wifi_mode", system_status->wifi_mode);
    cJSON_AddStringToObject(root, "ip_address", system_status->net_address);
    cJSON_AddStringToObject(root, "station_ssid", system_status->station_ssid);
    cJSON_AddBoolToObject(root, "station_connected", system_status->station_connected);
    cJSON_AddNumberToObject(root, "ap_clients", system_status->ap_clients);
    cJSON_AddNumberToObject(root, "wifi_disconnects", system_status->wifi_disconnects);
    cJSON_AddNumberToObject(root, "reboot_count", system_status->reboot_count);
    cJSON_AddStringToObject(root, "last_reboot_reason", system_status->last_reboot_reason);
    cJSON_AddStringToObject(root, "firmware_version", app_description->version);
    cJSON_AddStringToObject(root, "firmware_date", app_description->date);
    cJSON_AddStringToObject(root, "hardware_version", HARDWARE_VERSION);
    cJSON_AddStringToObject(root, "state", "online");

    publish_json_topic(topic, root, services->mqtt_qos, services->mqtt_retain);
}

static void publish_pump_state(uint8_t pump_id)
{
    if (!s_mqtt_connected || pump_id >= MAX_PUMP) {
        return;
    }

    services_t *services = get_service_config();
    char topic_base[48];
    char topic[128];
    mqtt_pump_snapshot_t snapshot = build_pump_snapshot(pump_id);
    cJSON *root = cJSON_CreateObject();

    build_topic_base(topic_base, sizeof(topic_base));
    snprintf(topic, sizeof(topic), "%s/pumps/%u/state", topic_base, pump_id);

    cJSON_AddNumberToObject(root, "id", snapshot.pump_id);
    cJSON_AddStringToObject(root, "name", snapshot.name);
    cJSON_AddBoolToObject(root, "active", snapshot.active);
    cJSON_AddStringToObject(root, "state", snapshot.state);
    cJSON_AddNumberToObject(root, "speed", snapshot.speed);
    cJSON_AddBoolToObject(root, "direction", snapshot.direction);
    cJSON_AddNumberToObject(root, "remaining_ticks", snapshot.remaining_ticks);
    cJSON_AddNumberToObject(root, "remaining_seconds", snapshot.remaining_seconds);
    cJSON_AddNumberToObject(root, "volume_ml", snapshot.volume_ml);
    cJSON_AddNumberToObject(root, "tank_current_vol", snapshot.tank_current_vol);
    cJSON_AddNumberToObject(root, "tank_full_vol", snapshot.tank_full_vol);
    cJSON_AddNumberToObject(root, "running_hours", snapshot.running_hours);

    publish_json_topic(topic, root, services->mqtt_qos, services->mqtt_retain);
}

static void publish_all_pump_states(void)
{
    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        publish_pump_state(pump_id);
    }
}

static void publish_today_history(void)
{
    if (!s_mqtt_connected) {
        return;
    }

    services_t *services = get_service_config();
    char topic_base[48];
    char topic[128];
    cJSON *root = cJSON_CreateObject();
    cJSON *pumps_json = cJSON_CreateArray();
    const uint32_t day_stamp = app_pumps_history_get_current_day_stamp();

    build_topic_base(topic_base, sizeof(topic_base));
    snprintf(topic, sizeof(topic), "%s/history/today", topic_base);

    cJSON_AddNumberToObject(root, "day_stamp", (double)day_stamp);

    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        pump_history_day_t day = {0};
        if (!app_pumps_history_get_today(pump_id, &day)) {
            continue;
        }

        cJSON *pump_json = cJSON_CreateObject();
        cJSON *hours_json = cJSON_CreateArray();

        cJSON_AddNumberToObject(pump_json, "id", pump_id);
        for (uint8_t hour = 0; hour < APP_PUMP_HISTORY_HOURS; ++hour) {
            const pump_history_hour_t *slot = &day.hours[hour];
            cJSON *hour_json = cJSON_CreateObject();
            cJSON_AddNumberToObject(hour_json, "hour", hour);
            cJSON_AddNumberToObject(hour_json, "scheduled_volume_ml", slot->scheduled_volume_ml);
            cJSON_AddNumberToObject(hour_json, "manual_volume_ml", slot->manual_volume_ml);
            cJSON_AddNumberToObject(hour_json, "total_runtime_s", slot->total_runtime_s);
            cJSON_AddNumberToObject(hour_json, "flags", slot->flags);
            cJSON_AddItemToArray(hours_json, hour_json);
        }

        cJSON_AddItemToObject(pump_json, "hours", hours_json);
        cJSON_AddItemToArray(pumps_json, pump_json);
    }

    cJSON_AddItemToObject(root, "pumps", pumps_json);
    publish_json_topic(topic, root, services->mqtt_qos, services->mqtt_retain);
}

static void publish_discovery_if_needed(void)
{
    if (!s_mqtt_connected || s_discovery_published) {
        return;
    }

    const esp_app_desc_t *app_description = esp_app_get_description();
    services_t *services = get_service_config();
    char topic_base[48];
    discovery_settings_t discovery = {
        .device_id = services->hostname,
        .device_model = HARDWARE_MODEL,
        .device_name = services->hostname,
        .device_manufacturer = HARDWARE_MANUFACTURER,
        .device_sw_version = app_description->version,
        .device_hw_version = HARDWARE_VERSION,
        .hass_prefix = MQTT_DISCOVERY_PREFIX,
        .topic_base = NULL,
    };

    build_topic_base(topic_base, sizeof(topic_base));
    discovery.topic_base = topic_base;

    if (hass_mqtt_discovery_init(&discovery) == ESP_OK) {
        hass_mqtt_discovery_configure_device(s_client, services->mqtt_qos, services->mqtt_retain);
        hass_mqtt_discovery_deinit();
        s_discovery_published = true;
    }
}

static void mqtt_stop_client(void)
{
    if (s_status_timer != NULL) {
        xTimerStop(s_status_timer, 0);
    }

    if (s_client != NULL) {
        esp_mqtt_client_unregister_event(s_client, ESP_EVENT_ANY_ID, mqtt_event_handler);
        esp_mqtt_client_stop(s_client);
        esp_mqtt_client_destroy(s_client);
        s_client = NULL;
    }

    if (s_mqtt_connected) {
        app_events_dispatch_system(MQTT_DISCONNECTED, NULL, 0);
    }

    s_mqtt_enabled = false;
    s_mqtt_connected = false;
    s_discovery_published = false;
    s_broker_uri[0] = '\0';
    s_availability_topic[0] = '\0';
}

static void status_timer_callback(TimerHandle_t timer)
{
    (void)timer;
    publish_status();
}

static void handle_restart_command(void)
{
    ESP_LOGI(TAG, "MQTT restart command received");
    vTaskDelay(pdMS_TO_TICKS(200));
    esp_restart();
}

static void handle_history_backup_command(void)
{
    services_t *services = get_service_config();
    char topic_base[48];
    char topic[128];
    size_t written_days = 0;
    cJSON *root = cJSON_CreateObject();

    build_topic_base(topic_base, sizeof(topic_base));
    snprintf(topic, sizeof(topic), "%s/history/backup/status", topic_base);

    esp_err_t err = app_pumps_history_backup(&written_days);
    cJSON_AddBoolToObject(root, "success", err == ESP_OK);
    cJSON_AddNumberToObject(root, "written_days", (double)written_days);
    if (err != ESP_OK) {
        cJSON_AddStringToObject(root, "error", esp_err_to_name(err));
    }

    publish_json_topic(topic, root, services->mqtt_qos, services->mqtt_retain);
    if (err == ESP_OK) {
        publish_today_history();
    }
}

static void handle_pump_run_command(uint8_t pump_id, const char *payload)
{
    cJSON *root = cJSON_Parse(payload);
    if (root == NULL) {
        ESP_LOGW(TAG, "invalid run payload for pump %u", (unsigned)pump_id);
        return;
    }

    const cJSON *speed = cJSON_GetObjectItem(root, "speed");
    const cJSON *time = cJSON_GetObjectItem(root, "time");
    const cJSON *direction = cJSON_GetObjectItem(root, "direction");

    float rpm = cJSON_IsNumber(speed) ? (float)speed->valuedouble : 0.0f;
    int32_t minutes = cJSON_IsNumber(time) ? time->valueint : 0;
    bool dir = cJSON_IsBool(direction) ? cJSON_IsTrue(direction) : true;

    if (run_pump_manual(pump_id, rpm, dir, minutes) != ESP_OK) {
        ESP_LOGW(TAG, "failed to start pump %u from MQTT command", (unsigned)pump_id);
    }

    cJSON_Delete(root);
}

static void handle_pump_calibration_command(uint8_t pump_id, bool start, const char *payload)
{
    float rpm = 1.0f;
    bool direction = true;

    if (payload != NULL && payload[0] == '{') {
        cJSON *root = cJSON_Parse(payload);
        if (root != NULL) {
            const cJSON *speed = cJSON_GetObjectItem(root, "speed");
            const cJSON *dir = cJSON_GetObjectItem(root, "direction");
            if (cJSON_IsNumber(speed)) {
                rpm = (float)speed->valuedouble;
            }
            if (cJSON_IsBool(dir)) {
                direction = cJSON_IsTrue(dir);
            }
            cJSON_Delete(root);
        }
    }

    run_pump_calibration(pump_id, start, rpm, direction);
}

static bool mqtt_match_pump_topic(const char *topic,
                                  const char *topic_base,
                                  const char *suffix,
                                  uint8_t *pump_id_out)
{
    char prefix[64];
    const char *cursor = NULL;
    char *endptr = NULL;
    unsigned long parsed_id = 0;

    if (topic == NULL || topic_base == NULL || suffix == NULL || pump_id_out == NULL) {
        return false;
    }

    snprintf(prefix, sizeof(prefix), "%s/pumps/", topic_base);
    if (strncmp(topic, prefix, strlen(prefix)) != 0) {
        return false;
    }

    cursor = topic + strlen(prefix);
    parsed_id = strtoul(cursor, &endptr, 10);
    if (endptr == cursor || parsed_id >= MAX_PUMP) {
        return false;
    }

    if (strcmp(endptr, suffix) != 0) {
        return false;
    }

    *pump_id_out = (uint8_t)parsed_id;
    return true;
}

static void handle_incoming_message(esp_mqtt_event_handle_t event)
{
    char topic[192];
    char data[256];
    services_t *services = get_service_config();
    char topic_base[48];
    char expected[192];
    uint8_t pump_id = 0;

    snprintf(topic, sizeof(topic), "%.*s", event->topic_len, event->topic);
    snprintf(data, sizeof(data), "%.*s", event->data_len, event->data);
    build_topic_base(topic_base, sizeof(topic_base));

    ESP_LOGI(TAG, "MQTT message received: topic=%s, data=%s", topic, data);

    snprintf(expected, sizeof(expected), "%s/command/restart", topic_base);
    if (strcmp(topic, expected) == 0) {
        if (strcmp(data, "restart") == 0 || strcmp(data, "1") == 0 || strcmp(data, "true") == 0) {
            ESP_LOGI(TAG, "Received restart command, initiating restart");
            handle_restart_command();
        }
        return;
    }

    snprintf(expected, sizeof(expected), "%s/command/history_backup", topic_base);
    if (strcmp(topic, expected) == 0) {
        if (strcmp(data, "backup") == 0 || strcmp(data, "1") == 0 || strcmp(data, "true") == 0) {
            ESP_LOGI(TAG, "Received history backup command, initiating backup");
            handle_history_backup_command();
        }
        return;
    }

    if (mqtt_match_pump_topic(topic, topic_base, "/run", &pump_id)) {
        ESP_LOGI(TAG, "Received pump run command for pump %u with data: %s", pump_id, data);
        handle_pump_run_command(pump_id, data);
        return;
    }

    if (mqtt_match_pump_topic(topic, topic_base, "/stop", &pump_id)) {
        pump_t *pump_config = get_pump_config(pump_id);
        ESP_LOGI(TAG, "Received pump stop command for pump %u", pump_id);
        run_pump_manual(pump_id, 1.0f, pump_config->direction, 0);
        return;
    }

    if (mqtt_match_pump_topic(topic, topic_base, "/calibration/start", &pump_id)) {
        ESP_LOGI(TAG, "Received pump calibration start command for pump %u with data: %s", pump_id, data);
        handle_pump_calibration_command(pump_id, true, data);
        return;
    }

    if (mqtt_match_pump_topic(topic, topic_base, "/calibration/stop", &pump_id)) {
        ESP_LOGI(TAG, "Received pump calibration stop command for pump %u with data: %s", pump_id, data);
        handle_pump_calibration_command(pump_id, false, data);
        return;
    }

    if (mqtt_match_pump_topic(topic, topic_base, "/state", &pump_id)) {
        ESP_LOGD(TAG, "Ignoring echoed pump state topic for pump %u", pump_id);
        return;
    }

    ESP_LOGI(TAG, "Unhandled MQTT topic: %s (qos=%u retain=%u)", topic, services->mqtt_qos, services->mqtt_retain);
}

static void subscribe_topics(void)
{
    services_t *services = get_service_config();
    char topic_base[48];
    char topic[128];

    build_topic_base(topic_base, sizeof(topic_base));

    snprintf(topic, sizeof(topic), "%s/command/#", topic_base);
    esp_mqtt_client_subscribe(s_client, topic, services->mqtt_qos);

    snprintf(topic, sizeof(topic), "%s/pumps/+/+", topic_base);
    esp_mqtt_client_subscribe(s_client, topic, services->mqtt_qos);

    snprintf(topic, sizeof(topic), "%s/pumps/+/calibration/+", topic_base);
    esp_mqtt_client_subscribe(s_client, topic, services->mqtt_qos);
}

static void mqtt_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    (void)handler_args;
    (void)base;
    esp_mqtt_event_handle_t event = event_data;

    switch ((esp_mqtt_event_id_t)event_id) {
        case MQTT_EVENT_CONNECTED:
            ESP_LOGI(TAG, "MQTT connected");
            s_mqtt_connected = true;
            s_discovery_published = false;
            app_events_dispatch_system(MQTT_CONNECTED, NULL, 0);
            subscribe_topics();
            publish_availability("online");
            publish_discovery_if_needed();
            publish_status();
            publish_all_pump_states();
            publish_today_history();
            if (s_status_timer != NULL) {
                xTimerStart(s_status_timer, 0);
            }
            break;
        case MQTT_EVENT_DISCONNECTED:
            ESP_LOGW(TAG, "MQTT disconnected");
            s_mqtt_connected = false;
            app_events_dispatch_system(MQTT_DISCONNECTED, NULL, 0);
            if (s_status_timer != NULL) {
                xTimerStop(s_status_timer, 0);
            }
            break;
        case MQTT_EVENT_DATA:
            handle_incoming_message(event);
            break;
        case MQTT_EVENT_ERROR:
            ESP_LOGW(TAG, "MQTT error event");
            break;
        default:
            break;
    }
}

static void on_pump_runtime_event(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_base;

    if (event_id != PUMP_RUNTIME_DATA || event_data == NULL) {
        return;
    }

    const pump_runtime_event_t *runtime = (const pump_runtime_event_t *)event_data;
    publish_pump_state(runtime->pump_id);
    publish_today_history();
}

static esp_err_t create_client(void)
{
    char topic_base[48];
    esp_mqtt_client_config_t mqtt_cfg = {0};

    if (!mqtt_runtime_config_is_usable(&s_runtime_config)) {
        return ESP_ERR_INVALID_STATE;
    }

    build_broker_uri_from_config(&s_runtime_config, s_broker_uri, sizeof(s_broker_uri));
    build_topic_base_from_hostname(s_runtime_config.hostname, topic_base, sizeof(topic_base));
    snprintf(s_availability_topic, sizeof(s_availability_topic), "%s/availability", topic_base);

    mqtt_cfg.broker.address.uri = s_broker_uri;
    mqtt_cfg.session.keepalive = 60;
    mqtt_cfg.session.last_will.topic = s_availability_topic;
    mqtt_cfg.session.last_will.msg = "offline";
    mqtt_cfg.session.last_will.retain = s_runtime_config.mqtt_retain;
    mqtt_cfg.session.last_will.qos = s_runtime_config.mqtt_qos;

    if (s_runtime_config.mqtt_user[0] != '\0') {
        mqtt_cfg.credentials.username = s_runtime_config.mqtt_user;
    }
    if (s_runtime_config.mqtt_password[0] != '\0') {
        mqtt_cfg.credentials.authentication.password = s_runtime_config.mqtt_password;
    }

    s_client = esp_mqtt_client_init(&mqtt_cfg);
    if (s_client == NULL) {
        return ESP_FAIL;
    }

    esp_mqtt_client_register_event(s_client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
    s_mqtt_enabled = s_runtime_config.enabled;
    return esp_mqtt_client_start(s_client);
}

static void mqtt_reconfigure(const mqtt_runtime_config_t *config)
{
    if (config == NULL) {
        return;
    }

    if (s_runtime_config_valid && mqtt_runtime_config_equal(&s_runtime_config, config)) {
        ESP_LOGI(TAG, "MQTT config unchanged");
        return;
    }

    mqtt_stop_client();
    s_runtime_config = *config;
    s_runtime_config_valid = true;
    s_mqtt_enabled = s_runtime_config.enabled;

    if (!mqtt_runtime_config_is_usable(&s_runtime_config)) {
        ESP_LOGI(TAG, "MQTT disabled or broker is not configured");
        return;
    }

    if (create_client() != ESP_OK) {
        ESP_LOGE(TAG, "failed to start MQTT client");
        mqtt_stop_client();
        s_mqtt_enabled = s_runtime_config.enabled;
    }
}

static void on_services_updated(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_base;

    if (event_id != SERVICES_UPDATED || s_command_queue == NULL) {
        return;
    }

    mqtt_command_t command = {
        .type = MQTT_CMD_RECONFIGURE,
    };
    mqtt_runtime_config_from_services(event_data != NULL ? (const services_t *)event_data : get_service_config(),
                                      &command.config);
    if (xQueueSend(s_command_queue, &command, 0) != pdTRUE) {
        ESP_LOGW(TAG, "dropping MQTT reconfigure command");
    }
}

void app_mqtt_task(void *pvParameters)
{
    (void)pvParameters;
    s_mqtt_connected = false;
    s_discovery_published = false;
    s_runtime_config_valid = false;

    s_status_timer = xTimerCreate("mqtt_status_timer",
                                  pdMS_TO_TICKS(30000),
                                  pdTRUE,
                                  NULL,
                                  status_timer_callback);
    s_command_queue = xQueueCreate(4, sizeof(mqtt_command_t));
    app_events_register_handler(PUMP_RUNTIME_DATA, NULL, on_pump_runtime_event, &s_pump_runtime_event_ctx);
    app_events_register_handler(SERVICES_UPDATED, NULL, on_services_updated, &s_services_updated_event_ctx);

    mqtt_command_t initial_command = {
        .type = MQTT_CMD_RECONFIGURE,
    };
    mqtt_runtime_config_from_services(get_service_config(), &initial_command.config);
    mqtt_reconfigure(&initial_command.config);

    for (;;) {
        mqtt_command_t command;
        if (xQueueReceive(s_command_queue, &command, pdMS_TO_TICKS(1000)) == pdTRUE) {
            if (command.type == MQTT_CMD_RECONFIGURE) {
                mqtt_reconfigure(&command.config);
            }
        }
    }
}

mqtt_service_status_t get_mqtt_status(void)
{
    if (s_mqtt_enabled && s_mqtt_connected) {
        return MQTT_ENABLED_CONNECTED;
    }

    if (s_mqtt_enabled) {
        return MQTT_ENABLED_NOT_CONNECTED;
    }

    return MQTT_DISABLED;
}
