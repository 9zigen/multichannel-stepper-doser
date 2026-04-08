/***
** Created by Aleksey Volkov on 16.12.2019.
***/
#include <stdio.h>
#include <stdlib.h>
#include <esp_log.h>
#include <esp_system.h>
#include "string.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_system.h"
#include "nvs_flash.h"
#include "nvs.h"

#include "app_events.h"
#include "board.h"
#include "app_settings.h"

static const char *TAG = "APP SETTINGS";
const char *empty_str = "empty";

static SemaphoreHandle_t nvs_lock = NULL;

#define APP_SETTINGS_NVS_KEY_MAX_LEN    16
#define APP_SETTINGS_PUMP_CFG_KEY_FMT   "PUMP%u_CFG"
#define APP_SETTINGS_PUMP_CAL_KEY_FMT   "PUMP%u_CAL%u"
#define APP_SETTINGS_PUMP_AGING_KEY     "PUMP_AGING"

network_t network[MAX_NETWORKS];
services_t service;
pump_t pump[MAX_PUMP];
schedule_t schedule[MAX_SCHEDULE];
auth_t auth;
stepper_board_config_t stepper_board_config;
static pump_aging_state_t pump_aging_state;

extern esp_event_loop_handle_t app_event_loop;

typedef struct {
    uint8_t id;
    char name[32];
    uint32_t calibration_100ml_units;
    uint8_t calibration_count;
    bool direction;
    uint32_t tank_full_vol;
    uint32_t tank_concentration_total;
    uint32_t tank_concentration_active;
    double tank_current_vol;
    bool state;
} pump_storage_t;

static esp_err_t app_settings_get_blob(const char *key, void *data, size_t *data_len);
static esp_err_t app_settings_set_blob(const char *key, const void *data, size_t data_len, bool commit);

static void app_settings_reset_ip(uint8_t ip[4], uint8_t a, uint8_t b, uint8_t c, uint8_t d)
{
    ip[0] = a;
    ip[1] = b;
    ip[2] = c;
    ip[3] = d;
}

static void app_settings_init_network_defaults(network_t *cfg, uint8_t id, network_type_t type)
{
    memset(cfg, 0, sizeof(*cfg));
    cfg->id = id;
    cfg->type = (uint8_t)type;
    cfg->keep_ap_active = (type == NETWORK_TYPE_WIFI);
    cfg->dhcp = true;
    cfg->channel = 13;
    cfg->force_dataset = true;
    cfg->can_node_id = id + 1;

    strlcpy(cfg->ssid, "", sizeof(cfg->ssid));
    strlcpy(cfg->password, "", sizeof(cfg->password));
    strlcpy(cfg->network_name, "OpenThread-8fab", sizeof(cfg->network_name));
    strlcpy(cfg->network_key, "0xdfd34f0f05cad978ec4e32b0413038ff", sizeof(cfg->network_key));
    strlcpy(cfg->pan_id, "0x8f28", sizeof(cfg->pan_id));
    strlcpy(cfg->ext_pan_id, "0xd63e8e3e495ebbc3", sizeof(cfg->ext_pan_id));
    strlcpy(cfg->pskc, "0xc23a76e98f1a6483639b1ac1271e2e27", sizeof(cfg->pskc));
    strlcpy(cfg->mesh_local_prefix, "fd53:145f:ed22:ad81::/64", sizeof(cfg->mesh_local_prefix));

    app_settings_reset_ip(cfg->ip_address, 0, 0, 0, 0);
    app_settings_reset_ip(cfg->mask, 255, 255, 255, 0);
    app_settings_reset_ip(cfg->gateway, 0, 0, 0, 0);
    app_settings_reset_ip(cfg->dns, 0, 0, 0, 0);
}

static void app_settings_make_pump_cfg_key(uint8_t pump_id, char *key, size_t key_size)
{
    snprintf(key, key_size, APP_SETTINGS_PUMP_CFG_KEY_FMT, (unsigned)(pump_id + 1));
}

static void app_settings_make_pump_cal_key(uint8_t pump_id, uint8_t calibration_id, char *key, size_t key_size)
{
    snprintf(key, key_size, APP_SETTINGS_PUMP_CAL_KEY_FMT,
             (unsigned)(pump_id + 1), (unsigned)(calibration_id + 1));
}

static void app_settings_apply_default_pump(uint8_t pump_id)
{
    static const char default_names[MAX_PUMP][32] = {
        {"CaRX"}, {"Magnesium"}, {"CaOH"}, {"Trace"}
    };

    memset(&pump[pump_id], 0, sizeof(pump[pump_id]));
    pump[pump_id].id = pump_id;
    pump[pump_id].calibration_100ml_units = 0;
    pump[pump_id].calibration_count = 0;
    pump[pump_id].direction = true;
    pump[pump_id].running_hours = 0;
    pump[pump_id].tank_full_vol = 0;
    pump[pump_id].tank_concentration_total = 0;
    pump[pump_id].tank_concentration_active = 0;
    pump[pump_id].tank_current_vol = 0;
    pump[pump_id].state = true;
    strlcpy(pump[pump_id].name, default_names[pump_id], sizeof(pump[pump_id].name));
}

static void app_settings_pump_to_storage(const pump_t *src, pump_storage_t *dst)
{
    memset(dst, 0, sizeof(*dst));
    dst->id = src->id;
    strlcpy(dst->name, src->name, sizeof(dst->name));
    dst->calibration_100ml_units = src->calibration_100ml_units;
    dst->calibration_count = src->calibration_count;
    dst->direction = src->direction;
    dst->tank_full_vol = src->tank_full_vol;
    dst->tank_concentration_total = src->tank_concentration_total;
    dst->tank_concentration_active = src->tank_concentration_active;
    dst->tank_current_vol = src->tank_current_vol;
    dst->state = src->state;
}

static void app_settings_storage_to_pump(const pump_storage_t *src, pump_t *dst)
{
    dst->id = src->id;
    strlcpy(dst->name, src->name, sizeof(dst->name));
    dst->calibration_100ml_units = src->calibration_100ml_units;
    dst->calibration_count = src->calibration_count > MAX_PUMP_CALIBRATION_POINTS
                                 ? MAX_PUMP_CALIBRATION_POINTS
                                 : src->calibration_count;
    dst->direction = src->direction;
    dst->tank_full_vol = src->tank_full_vol;
    dst->tank_concentration_total = src->tank_concentration_total;
    dst->tank_concentration_active = src->tank_concentration_active;
    dst->tank_current_vol = src->tank_current_vol;
    dst->state = src->state;
}

static esp_err_t app_settings_load_single_pump(uint8_t pump_id)
{
    char key[APP_SETTINGS_NVS_KEY_MAX_LEN];
    pump_storage_t storage;
    size_t required_size = sizeof(storage);

    app_settings_make_pump_cfg_key(pump_id, key, sizeof(key));
    esp_err_t ret = app_settings_get_blob(key, &storage, &required_size);
    if (ret != ESP_OK) {
        return ret;
    }

    memset(&pump[pump_id], 0, sizeof(pump[pump_id]));
    app_settings_storage_to_pump(&storage, &pump[pump_id]);

    for (uint8_t cal_idx = 0; cal_idx < pump[pump_id].calibration_count; ++cal_idx) {
        size_t calibration_size = sizeof(pump_calibration_t);
        app_settings_make_pump_cal_key(pump_id, cal_idx, key, sizeof(key));
        ret = app_settings_get_blob(key, &pump[pump_id].calibration[cal_idx], &calibration_size);
        if (ret != ESP_OK) {
            pump[pump_id].calibration_count = cal_idx;
            return ret;
        }
    }

    return ESP_OK;
}

static esp_err_t app_settings_save_single_pump(uint8_t pump_id)
{
    char key[APP_SETTINGS_NVS_KEY_MAX_LEN];
    pump_storage_t storage;
    const pump_t *cfg = &pump[pump_id];
    esp_err_t ret;
    nvs_handle_t handle;

    app_settings_pump_to_storage(cfg, &storage);
    if (xSemaphoreTake(nvs_lock, pdMS_TO_TICKS(2000)) != pdTRUE) {
        ESP_LOGE(TAG, "Failed to take NVS lock");
        return ESP_FAIL;
    }

    ret = nvs_open("storage", NVS_READWRITE, &handle);
    if (ret != ESP_OK) {
        xSemaphoreGive(nvs_lock);
        return ret;
    }

    app_settings_make_pump_cfg_key(pump_id, key, sizeof(key));
    ret = nvs_set_blob(handle, key, &storage, sizeof(storage));
    if (ret != ESP_OK) {
        nvs_close(handle);
        xSemaphoreGive(nvs_lock);
        return ret;
    }

    for (uint8_t cal_idx = 0; cal_idx < cfg->calibration_count; ++cal_idx) {
        app_settings_make_pump_cal_key(pump_id, cal_idx, key, sizeof(key));
        ret = nvs_set_blob(handle, key, &cfg->calibration[cal_idx], sizeof(cfg->calibration[cal_idx]));
        if (ret != ESP_OK) {
            nvs_close(handle);
            xSemaphoreGive(nvs_lock);
            return ret;
        }
    }

    for (uint8_t cal_idx = cfg->calibration_count; cal_idx < MAX_PUMP_CALIBRATION_POINTS; ++cal_idx) {
        app_settings_make_pump_cal_key(pump_id, cal_idx, key, sizeof(key));
        ret = nvs_erase_key(handle, key);
        if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND) {
            nvs_close(handle);
            xSemaphoreGive(nvs_lock);
            return ret;
        }
    }

    ret = nvs_commit(handle);
    nvs_close(handle);
    xSemaphoreGive(nvs_lock);
    return ret;
}

void load_pump_aging_state(void)
{
    size_t required_size = sizeof(pump_aging_state);
    esp_err_t ret = app_settings_get_blob(APP_SETTINGS_PUMP_AGING_KEY, &pump_aging_state, &required_size);
    if (ret != ESP_OK) {
        memset(&pump_aging_state, 0, sizeof(pump_aging_state));
        save_pump_aging_state(0);
    }

    for (uint8_t i = 0; i < MAX_PUMP; ++i) {
        pump[i].running_hours = pump_aging_state.running_hours[i];
    }
}

void save_pump_aging_state(uint32_t day_stamp)
{
    pump_aging_state.day_stamp = day_stamp;
    for (uint8_t i = 0; i < MAX_PUMP; ++i) {
        pump_aging_state.running_hours[i] = pump[i].running_hours;
    }

    esp_err_t err = app_settings_set_blob(APP_SETTINGS_PUMP_AGING_KEY, &pump_aging_state, sizeof(pump_aging_state), true);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save pump aging state.");
    }
}

uint32_t get_pump_aging_day_stamp(void)
{
    return pump_aging_state.day_stamp;
}

static esp_err_t app_settings_get_blob(const char *key, void *data, size_t *data_len)
{
    if (key == NULL || data == NULL || data_len == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    ESP_LOGI(TAG, "Reading %s ...", key);

    if (xSemaphoreTake(nvs_lock, pdMS_TO_TICKS(2000)) == pdTRUE) {
        nvs_handle_t handle;
        esp_err_t ret = nvs_open("storage", NVS_READWRITE, &handle);
        if (ret != ESP_OK)
        {
            ESP_LOGE(TAG, "Error: unable to open the NVS partition");
            xSemaphoreGive(nvs_lock);
            return ret;
        }

        size_t required_size = 0;
        ret = nvs_get_blob(handle, key, NULL, &required_size);
        if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND)
        {
            ESP_LOGE(TAG, "blob not saved yet! error: %s", esp_err_to_name(ret));
            nvs_close(handle);
            xSemaphoreGive(nvs_lock);
            return ret;
        }

        if (ret == ESP_ERR_NVS_NOT_FOUND) {
            nvs_close(handle);
            xSemaphoreGive(nvs_lock);
            return ret;
        }

        if (required_size != *data_len) {
            ESP_LOGW(TAG, "Blob %s size mismatch. expected=%u actual=%u",
                     key, (unsigned)*data_len, (unsigned)required_size);
            nvs_close(handle);
            xSemaphoreGive(nvs_lock);
            return ESP_ERR_NVS_INVALID_LENGTH;
        }

        ret = nvs_get_blob(handle, key, data, data_len);
        if (ret != ESP_OK)
        {
            ESP_LOGE(TAG, "Error (%s) reading!\n", esp_err_to_name(ret));
            nvs_close(handle);
            xSemaphoreGive(nvs_lock);
            return ret;
        }

        nvs_close(handle);
        xSemaphoreGive(nvs_lock);
        return ret;
    }
    else
    {
        ESP_LOGE(TAG, "Failed to take NVS lock");
        return ESP_FAIL;
    }
}

static esp_err_t app_settings_set_blob(const char *key, const void *data, size_t data_len, bool commit)
{
    if (key == NULL || data == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    ESP_LOGI(TAG, "Saving %s ... [commit: %s]", key, commit? "yes" : "no");

    if (xSemaphoreTake(nvs_lock, pdMS_TO_TICKS(2000)) == pdTRUE)
    {
        nvs_handle_t handle;
        esp_err_t ret = nvs_open("storage", NVS_READWRITE, &handle);
        if (ret != ESP_OK)
        {
            ESP_LOGE(TAG, "Error: unable to open the NVS partition");
            xSemaphoreGive(nvs_lock);
            return ret;
        }

        ret = nvs_set_blob(handle, key, data, data_len);
        if (ret != ESP_OK)
        {
            ESP_LOGE(TAG, "Failed to Update Network Config in NVS");
            nvs_close(handle);
            xSemaphoreGive(nvs_lock);
            return ret;
        }

        if (commit)
        {
            ret = nvs_commit(handle);
            if (ret != ESP_OK)
            {
                ESP_LOGE(TAG, "Failed to commit NVS");
                nvs_close(handle);
                xSemaphoreGive(nvs_lock);
                return ret;
            }
        }

        nvs_close(handle);
        xSemaphoreGive(nvs_lock);
        return ESP_OK;
    }
    else
    {
        ESP_LOGE(TAG, "Failed to take NVS lock");
        return ESP_FAIL;
    }
}

/* Initialize Settings */
void init_settings()
{
    /* Initialize NVS */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES)
    {
        ESP_LOGE(TAG, "NVS partition was truncated and needs to be erased");

        /* Retry nvs_flash_init */
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    /* Semaphore */
    nvs_lock = xSemaphoreCreateMutex();
    xSemaphoreGive(nvs_lock);

    /* Read Networks */
    size_t required_size = sizeof(network_t) * MAX_NETWORKS;
    ret = app_settings_get_blob("network", network, &required_size);
    if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND && ret != ESP_ERR_NVS_INVALID_LENGTH) {
        ESP_LOGE(TAG, "config not saved yet! error: %s", esp_err_to_name(ret));
    } else if (ret == ESP_ERR_NVS_NOT_FOUND || ret == ESP_ERR_NVS_INVALID_LENGTH) {
        ESP_LOGI(TAG, "defauld networks config used.");
        set_default_network();
    }

    /* Read Services */
    required_size = sizeof(services_t);
    ret = app_settings_get_blob("service", &service, &required_size);
    if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND && ret != ESP_ERR_NVS_INVALID_LENGTH) {
        ESP_LOGE(TAG, "config not saved yet! error: %s", esp_err_to_name(ret));
    } else if (ret == ESP_ERR_NVS_NOT_FOUND || ret == ESP_ERR_NVS_INVALID_LENGTH) {
        ESP_LOGI(TAG, "defauld service config used.");
        set_default_service();
    }

    /* Read Pump Config */
    bool pump_defaults_required = false;
    for (uint8_t i = 0; i < MAX_PUMP; ++i) {
        ret = app_settings_load_single_pump(i);
        if (ret == ESP_ERR_NVS_NOT_FOUND || ret == ESP_ERR_NVS_INVALID_LENGTH) {
            ESP_LOGI(TAG, "default pump config used for pump %u", (unsigned)i);
            app_settings_apply_default_pump(i);
            pump_defaults_required = true;
        } else if (ret != ESP_OK) {
            ESP_LOGE(TAG, "failed to load pump %u config: %s", (unsigned)i, esp_err_to_name(ret));
            app_settings_apply_default_pump(i);
            pump_defaults_required = true;
        }
    }
    if (pump_defaults_required) {
        save_pump();
    }
    load_pump_aging_state();

    /* Read Schedule */
    required_size = sizeof(schedule_t) * MAX_SCHEDULE;
    ret = app_settings_get_blob("schedule", schedule, &required_size);
    if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND && ret != ESP_ERR_NVS_INVALID_LENGTH) {
        ESP_LOGE(TAG, "config not saved yet! error: %s", esp_err_to_name(ret));
    } else if (ret == ESP_ERR_NVS_NOT_FOUND || ret == ESP_ERR_NVS_INVALID_LENGTH) {
        ESP_LOGI(TAG, "defauld schedule config used.");
        set_default_schedule();
    }

    /* Read Auth */
    required_size = sizeof(auth_t);
    ret = app_settings_get_blob("auth", &auth, &required_size);
    if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND && ret != ESP_ERR_NVS_INVALID_LENGTH) {
        ESP_LOGE(TAG, "config not saved yet! error: %s", esp_err_to_name(ret));
    } else if (ret == ESP_ERR_NVS_NOT_FOUND || ret == ESP_ERR_NVS_INVALID_LENGTH) {
        ESP_LOGI(TAG, "defauld auth config used.");
        set_default_auth();
    }

    /* Read Stepper Board Config */
    required_size = sizeof(stepper_board_config_t);
    ret = app_settings_get_blob("stepper_cfg", &stepper_board_config, &required_size);
    if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND && ret != ESP_ERR_NVS_INVALID_LENGTH) {
        ESP_LOGE(TAG, "config not saved yet! error: %s", esp_err_to_name(ret));
    } else if (ret == ESP_ERR_NVS_NOT_FOUND || ret == ESP_ERR_NVS_INVALID_LENGTH) {
        ESP_LOGI(TAG, "default stepper board config used.");
        set_default_stepper_board_config();
    }
}

void set_default_network()
{
    const network_type_t defaults[MAX_NETWORKS] = {
        NETWORK_TYPE_WIFI,
        NETWORK_TYPE_ETHERNET,
        NETWORK_TYPE_BLE,
        NETWORK_TYPE_THREAD,
        NETWORK_TYPE_CAN,
    };

    for (int i = 0; i < MAX_NETWORKS; ++i) {
        app_settings_init_network_defaults(&network[i], i, defaults[i]);
        network[i].active = false;
    }

    save_network();
}

void set_default_service()
{
    memset(&service, 0, sizeof(service));
    strlcpy(service.hostname, "stepper-doser", sizeof(service.hostname));

    /* OTA */
    strlcpy(service.ota_url, CONFIG_OTA_URL, sizeof(service.ota_url));

    /* NTP */
    strlcpy(service.ntp_server, "pool.ntp.org", sizeof(service.ntp_server));
    strlcpy(service.time_zone, "UTC", sizeof(service.time_zone));
    service.enable_ntp = false;

    /*MQTT */
    app_settings_reset_ip(service.mqtt_ip_address, 0, 0, 0, 0);
    strlcpy(service.mqtt_user, "", sizeof(service.mqtt_user));
    strlcpy(service.mqtt_password, "", sizeof(service.mqtt_password));
    service.mqtt_port = 1883;
    service.enable_mqtt = false;
    service.mqtt_qos = 0;
    service.mqtt_retain = 0;
    save_service();
}

void set_default_pump()
{
    for(size_t i = 0; i < MAX_PUMP; i++)
    {
        app_settings_apply_default_pump(i);
    }
    save_pump();
}

void set_default_schedule()
{
    for(size_t i = 0; i < MAX_SCHEDULE; i++)
    {
        memset(&schedule[i], 0, sizeof(schedule[i]));
        schedule[i].pump_id         = i;
        schedule[i].mode            = SCHEDULE_MODE_OFF;
        schedule[i].work_hours      = 0; /* Pump Work Hours */
        schedule[i].week_days       = 0; /* Pump Work Week days */
        schedule[i].speed           = 0; /* Pump speed flow */
        schedule[i].time            = 0;
        schedule[i].day_volume      = 0; /* Day volume in ml */
        schedule[i].active          = false;
    }
    save_schedule();
}

void set_default_auth()
{
    strlcpy(auth.username, "admin", 32);
    strlcpy(auth.password, "12345678", 32);
    save_auth();
}

void set_default_stepper_board_config(void)
{
    static const int32_t default_dir_pins[MAX_PUMP] = {GPIO_NUM_12, GPIO_NUM_26, GPIO_NUM_17, GPIO_NUM_32};
    static const int32_t default_en_pins[MAX_PUMP] = {GPIO_NUM_25, GPIO_NUM_25, GPIO_NUM_25, GPIO_NUM_25};
    static const int32_t default_step_pins[MAX_PUMP] = {GPIO_NUM_14, GPIO_NUM_27, GPIO_NUM_16, GPIO_NUM_33};

    memset(&stepper_board_config, 0, sizeof(stepper_board_config));
    stepper_board_config.uart = 2;
    stepper_board_config.tx_pin = GPIO_NUM_22;
    stepper_board_config.rx_pin = GPIO_NUM_21;
    stepper_board_config.motors_num = MAX_PUMP;

    for (uint8_t i = 0; i < MAX_PUMP; ++i) {
        stepper_board_config.channels[i].dir_pin = default_dir_pins[i];
        stepper_board_config.channels[i].en_pin = default_en_pins[i];
        stepper_board_config.channels[i].step_pin = default_step_pins[i];
        stepper_board_config.channels[i].micro_steps = 256;
    }

    save_stepper_board_config();
}

void save_network(void)
{
    esp_err_t err = app_settings_set_blob("network", network, sizeof(network_t) * MAX_NETWORKS, true);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save network.");
    }
}

void save_service(void)
{
    esp_err_t err = app_settings_set_blob("service", &service, sizeof(services_t), true);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save services.");
        return;
    }

    if (app_event_loop != NULL) {
        app_events_dispatch_system(SERVICES_UPDATED, &service, sizeof(service));
    }
}

void save_pump(void)
{
    esp_err_t err = ESP_OK;
    for (uint8_t i = 0; i < MAX_PUMP; ++i) {
        err = app_settings_save_single_pump(i);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to save pump %u.", (unsigned)i);
            return;
        }
    }
};

void save_schedule(void)
{
    esp_err_t err = app_settings_set_blob("schedule", &schedule, sizeof(schedule_t) * MAX_SCHEDULE, true);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save schedule.");
    }
}

void save_auth(void)
{
    esp_err_t err = app_settings_set_blob("auth", &auth, sizeof(auth_t), true);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save auth.");
    }
}

void save_stepper_board_config(void)
{
    esp_err_t err = app_settings_set_blob("stepper_cfg", &stepper_board_config, sizeof(stepper_board_config), true);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save stepper board config.");
    }
}

void erase_settings(void) {
    ESP_ERROR_CHECK(nvs_flash_erase());
}

network_t *get_networks_config(uint8_t network_id)
{
    if (network_id >= MAX_NETWORKS) {
        return NULL;
    }
    return &network[network_id];
}

services_t *get_service_config(void) {
    return &service;
}

pump_t *get_pump_config(uint8_t pump_id) {
    if (pump_id >= MAX_PUMP) {
        return NULL;
    }
    return &pump[pump_id];
}

schedule_t *get_schedule_config(uint8_t schedule_id)
{
    if (schedule_id >= MAX_SCHEDULE) {
        return NULL;
    }
    return &schedule[schedule_id];
}

auth_t *get_auth_config(void) {
    return &auth;
}

stepper_board_config_t *get_stepper_board_config(void)
{
    return &stepper_board_config;
}

void ip_to_string(uint8_t ip[4], char *string) {
    snprintf(string, 16, "%d.%d.%d.%d", ip[0], ip[1], ip[2], ip[3]);
}

void string_to_ip(const char *ip_string, uint8_t *octets) {
    char *octet;
    char ip_address[16];

    if (ip_string == NULL || octets == NULL || ip_string[0] == '\0') {
        app_settings_reset_ip(octets, 0, 0, 0, 0);
        return;
    }

    memset(ip_address, 0, 16);
    strlcpy(ip_address, ip_string, sizeof(ip_address));

    octet = strtok(ip_address, ".");
    for (int j = 0; j < 4; ++j) {
        if (octet == NULL) {
            octets[j] = 0;
            continue;
        }
        octets[j] = (uint8_t) atoi(octet);
        octet = strtok(NULL, ".");
    }
}
