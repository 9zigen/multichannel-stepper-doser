#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_log.h"

#include "app_settings.h"
#include "app_mqtt_discovery.h"

#define ATTR_NAME "name"
#define ATTR_DEVICE "device"
#define ATTR_IDENTIFIERS "identifiers"
#define ATTR_MODEL "model"
#define ATTR_MANUFACTURER "manufacturer"
#define ATTR_SW_VER "sw_version"
#define ATTR_HW_VER "hw_version"
#define ATTR_UNIQUE_ID "unique_id"
#define ATTR_STATE_TOPIC "state_topic"
#define ATTR_COMMAND_TOPIC "command_topic"
#define ATTR_AVAILABILITY "availability"
#define ATTR_TOPIC "topic"
#define ATTR_PAYLOAD_AVAILABLE "payload_available"
#define ATTR_PAYLOAD_NOT_AVAILABLE "payload_not_available"
#define ATTR_UNIT_OF_MEASUREMENT "unit_of_measurement"
#define ATTR_DEVICE_CLASS "device_class"
#define ATTR_STATE_CLASS "state_class"
#define ATTR_VALUE_TEMPLATE "value_template"
#define ATTR_PAYLOAD_ON "payload_on"
#define ATTR_PAYLOAD_OFF "payload_off"
#define ATTR_ENTITY_CATEGORY "entity_category"
#define ATTR_ICON "icon"
#define ATTR_CONFIGURATION_URL "configuration_url"
#define ATTR_PAYLOAD_PRESS "payload_press"

static const char *TAG = "APP MQTT DISCOVERY";
static const discovery_settings_t *cfg;

static cJSON *create_availability_array(void)
{
    cJSON *availability = cJSON_CreateArray();
    cJSON *availability_item = cJSON_CreateObject();
    char topic[128];

    snprintf(topic, sizeof(topic), "%s/availability", cfg->topic_base);
    cJSON_AddStringToObject(availability_item, ATTR_TOPIC, topic);
    cJSON_AddStringToObject(availability_item, ATTR_PAYLOAD_AVAILABLE, "online");
    cJSON_AddStringToObject(availability_item, ATTR_PAYLOAD_NOT_AVAILABLE, "offline");
    cJSON_AddItemToArray(availability, availability_item);
    return availability;
}

static cJSON *create_device_object(void)
{
    cJSON *device = cJSON_CreateObject();
    cJSON *identifiers = cJSON_CreateArray();
    char configuration_url[128];

    snprintf(configuration_url, sizeof(configuration_url), "http://%s.local", cfg->device_id);

    cJSON_AddStringToObject(device, ATTR_NAME, cfg->device_name);
    cJSON_AddStringToObject(device, ATTR_MODEL, cfg->device_model);
    cJSON_AddStringToObject(device, ATTR_MANUFACTURER, cfg->device_manufacturer);
    cJSON_AddStringToObject(device, ATTR_SW_VER, cfg->device_sw_version);
    cJSON_AddStringToObject(device, ATTR_HW_VER, cfg->device_hw_version);
    cJSON_AddItemToArray(identifiers, cJSON_CreateString(cfg->device_id));
    cJSON_AddItemToObject(device, ATTR_IDENTIFIERS, identifiers);
    cJSON_AddStringToObject(device, ATTR_CONFIGURATION_URL, configuration_url);
    return device;
}

static void publish_discovery_payload(esp_mqtt_client_handle_t client, const char *component,
                                      const char *object_id, cJSON *payload, int qos, int retain)
{
    char topic[192];
    char *message = cJSON_PrintUnformatted(payload);
    if (message == NULL) {
        cJSON_Delete(payload);
        return;
    }

    snprintf(topic, sizeof(topic), "%s/%s/%s/config", cfg->hass_prefix, component, object_id);
    esp_mqtt_client_publish(client, topic, message, 0, qos, retain);
    ESP_LOGD(TAG, "published discovery topic=%s", topic);

    free(message);
    cJSON_Delete(payload);
}

static void publish_sensor_config(esp_mqtt_client_handle_t client, const char *object_id, const char *name,
                                  const char *state_topic, const char *value_template, const char *unit,
                                  const char *device_class, const char *state_class, const char *icon,
                                  int qos, int retain)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, ATTR_NAME, name);
    cJSON_AddStringToObject(root, ATTR_UNIQUE_ID, object_id);
    cJSON_AddStringToObject(root, ATTR_STATE_TOPIC, state_topic);
    cJSON_AddStringToObject(root, ATTR_VALUE_TEMPLATE, value_template);
    cJSON_AddItemToObject(root, ATTR_AVAILABILITY, create_availability_array());
    cJSON_AddItemToObject(root, ATTR_DEVICE, create_device_object());

    if (unit != NULL) {
        cJSON_AddStringToObject(root, ATTR_UNIT_OF_MEASUREMENT, unit);
    }
    if (device_class != NULL) {
        cJSON_AddStringToObject(root, ATTR_DEVICE_CLASS, device_class);
    }
    if (state_class != NULL) {
        cJSON_AddStringToObject(root, ATTR_STATE_CLASS, state_class);
    }
    if (icon != NULL) {
        cJSON_AddStringToObject(root, ATTR_ICON, icon);
    }

    publish_discovery_payload(client, "sensor", object_id, root, qos, retain);
}

static void publish_binary_sensor_config(esp_mqtt_client_handle_t client, const char *object_id, const char *name,
                                         const char *state_topic, const char *value_template,
                                         const char *payload_on, const char *payload_off,
                                         const char *device_class, int qos, int retain)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, ATTR_NAME, name);
    cJSON_AddStringToObject(root, ATTR_UNIQUE_ID, object_id);
    cJSON_AddStringToObject(root, ATTR_STATE_TOPIC, state_topic);
    cJSON_AddStringToObject(root, ATTR_VALUE_TEMPLATE, value_template);
    cJSON_AddStringToObject(root, ATTR_PAYLOAD_ON, payload_on);
    cJSON_AddStringToObject(root, ATTR_PAYLOAD_OFF, payload_off);
    cJSON_AddItemToObject(root, ATTR_AVAILABILITY, create_availability_array());
    cJSON_AddItemToObject(root, ATTR_DEVICE, create_device_object());

    if (device_class != NULL) {
        cJSON_AddStringToObject(root, ATTR_DEVICE_CLASS, device_class);
    }

    publish_discovery_payload(client, "binary_sensor", object_id, root, qos, retain);
}

static void publish_button_config(esp_mqtt_client_handle_t client, const char *object_id, const char *name,
                                  const char *command_topic, const char *payload_press,
                                  const char *entity_category, const char *icon, int qos, int retain)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, ATTR_NAME, name);
    cJSON_AddStringToObject(root, ATTR_UNIQUE_ID, object_id);
    cJSON_AddStringToObject(root, ATTR_COMMAND_TOPIC, command_topic);
    cJSON_AddStringToObject(root, ATTR_PAYLOAD_PRESS, payload_press);
    cJSON_AddItemToObject(root, ATTR_AVAILABILITY, create_availability_array());
    cJSON_AddItemToObject(root, ATTR_DEVICE, create_device_object());

    if (entity_category != NULL) {
        cJSON_AddStringToObject(root, ATTR_ENTITY_CATEGORY, entity_category);
    }
    if (icon != NULL) {
        cJSON_AddStringToObject(root, ATTR_ICON, icon);
    }

    publish_discovery_payload(client, "button", object_id, root, qos, retain);
}

static void publish_device_entities(esp_mqtt_client_handle_t client, int qos, int retain)
{
    char state_topic[128];
    char command_topic[128];
    char object_id[96];

    snprintf(state_topic, sizeof(state_topic), "%s/status", cfg->topic_base);
    snprintf(command_topic, sizeof(command_topic), "%s/command/restart", cfg->topic_base);

    snprintf(object_id, sizeof(object_id), "%s_free_heap", cfg->device_id);
    publish_sensor_config(client, object_id, "Free heap", state_topic, "{{ value_json.free_heap }}",
                          "B", NULL, "measurement", "mdi:memory", qos, retain);

    snprintf(object_id, sizeof(object_id), "%s_wifi_disconnects", cfg->device_id);
    publish_sensor_config(client, object_id, "WiFi disconnects", state_topic, "{{ value_json.wifi_disconnects }}",
                          NULL, NULL, "total_increasing", "mdi:wifi-alert", qos, retain);

    snprintf(object_id, sizeof(object_id), "%s_reboot_count", cfg->device_id);
    publish_sensor_config(client, object_id, "Reboot count", state_topic, "{{ value_json.reboot_count }}",
                          NULL, NULL, "total_increasing", "mdi:restart", qos, retain);

    snprintf(object_id, sizeof(object_id), "%s_station_connected", cfg->device_id);
    publish_binary_sensor_config(client, object_id, "Station connected", state_topic,
                                 "{{ 'ON' if value_json.station_connected else 'OFF' }}",
                                 "ON", "OFF", "connectivity", qos, retain);

    snprintf(object_id, sizeof(object_id), "%s_restart", cfg->device_id);
    publish_button_config(client, object_id, "Restart device", command_topic, "restart",
                          "config", "mdi:restart", qos, retain);
}

static void publish_pump_entities(esp_mqtt_client_handle_t client, int qos, int retain)
{
    char state_topic[128];
    char command_topic[128];
    char object_id[96];
    char name[64];

    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        snprintf(state_topic, sizeof(state_topic), "%s/pumps/%u/state", cfg->topic_base, pump_id);
        snprintf(command_topic, sizeof(command_topic), "%s/pumps/%u/stop", cfg->topic_base, pump_id);

        snprintf(object_id, sizeof(object_id), "%s_pump_%u_tank_volume", cfg->device_id, pump_id);
        snprintf(name, sizeof(name), "Pump %u tank volume", pump_id);
        publish_sensor_config(client, object_id, name, state_topic, "{{ value_json.tank_current_vol }}",
                              "mL", NULL, "measurement", "mdi:cup-water", qos, retain);

        snprintf(object_id, sizeof(object_id), "%s_pump_%u_running_hours", cfg->device_id, pump_id);
        snprintf(name, sizeof(name), "Pump %u running hours", pump_id);
        publish_sensor_config(client, object_id, name, state_topic, "{{ value_json.running_hours }}",
                              "h", NULL, "total_increasing", "mdi:timer-outline", qos, retain);

        snprintf(object_id, sizeof(object_id), "%s_pump_%u_active", cfg->device_id, pump_id);
        snprintf(name, sizeof(name), "Pump %u active", pump_id);
        publish_binary_sensor_config(client, object_id, name, state_topic,
                                     "{{ 'ON' if value_json.active else 'OFF' }}",
                                     "ON", "OFF", "running", qos, retain);

        snprintf(object_id, sizeof(object_id), "%s_pump_%u_stop", cfg->device_id, pump_id);
        snprintf(name, sizeof(name), "Pump %u stop", pump_id);
        publish_button_config(client, object_id, name, command_topic, "stop",
                              "config", "mdi:pump-off", qos, retain);
    }
}

esp_err_t hass_mqtt_discovery_init(const discovery_settings_t *params)
{
    if (params == NULL || params->device_id == NULL || params->hass_prefix == NULL || params->topic_base == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (params->device_id[0] == '\0' || params->hass_prefix[0] == '\0' || params->topic_base[0] == '\0') {
        return ESP_ERR_INVALID_ARG;
    }

    cfg = params;
    return ESP_OK;
}

void hass_mqtt_discovery_deinit(void)
{
    cfg = NULL;
}

void hass_mqtt_discovery_configure_device(esp_mqtt_client_handle_t mqtt_client_instance, int qos, int retain)
{
    if (cfg == NULL || mqtt_client_instance == NULL) {
        return;
    }

    publish_device_entities(mqtt_client_instance, qos, retain);
    publish_pump_entities(mqtt_client_instance, qos, retain);
}
