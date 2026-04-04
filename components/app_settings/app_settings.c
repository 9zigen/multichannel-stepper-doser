/***
** Created by Aleksey Volkov on 16.12.2019.
***/
#include <stdio.h>
#include <esp_log.h>
#include <esp_system.h>
#include "string.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_system.h"
#include "nvs_flash.h"
#include "nvs.h"

#include "board.h"
#include "app_settings.h"

static const char *TAG = "APP SETTINGS";
const char *empty_str = "empty";

static SemaphoreHandle_t nvs_lock = NULL;

network_t network[MAX_NETWORKS];
services_t service;
pump_t pump[MAX_PUMP];
schedule_t schedule[MAX_SCHEDULE];
auth_t auth;

esp_err_t app_settings_get_blob(const char *key, void *data, size_t *data_len)
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

        size_t required_size = 0; /* value will default to 0, if not set yet in NVS */
        ret = nvs_get_blob(handle, key, NULL, &required_size);
        if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND && required_size != *data_len)
        {
            ESP_LOGE(TAG, "blob not saved yet! error: %s", esp_err_to_name(ret));
            xSemaphoreGive(nvs_lock);
            return ret;
        }

        ret = nvs_get_blob(handle, key, data, data_len);
        if (ret != ESP_OK)
        {
            ESP_LOGE(TAG, "Error (%s) reading!\n", esp_err_to_name(ret));
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

esp_err_t app_settings_set_blob(const char *key, const void *data, size_t data_len, bool commit)
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
            xSemaphoreGive(nvs_lock);
            return ret;
        }

        if (commit)
        {
            ret = nvs_commit(handle);
            if (ret != ESP_OK)
            {
                ESP_LOGE(TAG, "Failed to commit NVS");
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
    if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGE(TAG, "config not saved yet! error: %s", esp_err_to_name(ret));
    } else if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGI(TAG, "defauld networks config used.");
        set_default_network();
    }

    /* Read Services */
    required_size = sizeof(services_t);
    ret = app_settings_get_blob("service", &service, &required_size);
    if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGE(TAG, "config not saved yet! error: %s", esp_err_to_name(ret));
    } else if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGI(TAG, "defauld service config used.");
        set_default_service();
    }

    /* Read Pump Config */
    required_size = sizeof(pump_t) * MAX_PUMP;
    ret = app_settings_get_blob("pump", &pump, &required_size);
    if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGE(TAG, "config not saved yet! error: %s", esp_err_to_name(ret));
    } else if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGI(TAG, "defauld pump config used.");
        set_default_pump();
    }

    /* Read Schedule */
    required_size = sizeof(schedule_t) * MAX_SCHEDULE;
    ret = app_settings_get_blob("schedule", schedule, &required_size);
    if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGE(TAG, "config not saved yet! error: %s", esp_err_to_name(ret));
    } else if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGI(TAG, "defauld schedule config used.");
        set_default_schedule();
    }

    /* Read Auth */
    required_size = sizeof(auth_t);
    ret = app_settings_get_blob("auth", &auth, &required_size);
    if (ret != ESP_OK && ret != ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGE(TAG, "config not saved yet! error: %s", esp_err_to_name(ret));
    } else if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGI(TAG, "defauld auth config used.");
        set_default_auth();
    }
}

void set_default_network()
{
    for (int i = 0; i < MAX_NETWORKS; ++i)
    {
        strlcpy(network[i].ssid, empty_str, 32);
        strlcpy(network[i].password, empty_str, 64);

        network[i].ip_address[0] = 192;
        network[i].ip_address[1] = 168;
        network[i].ip_address[2] = 1;
        network[i].ip_address[3] = 100;

        network[i].mask[0] = 255;
        network[i].mask[1] = 255;
        network[i].mask[2] = 255;
        network[i].mask[3] = 0;

        network[i].gateway[0] = 192;
        network[i].gateway[1] = 168;
        network[i].gateway[2] = 1;
        network[i].gateway[3] = 1;

        network[i].dns[0] = 192;
        network[i].dns[1] = 168;
        network[i].dns[2] = 1;
        network[i].dns[3] = 1;

        network[i].dhcp = true;
        network[i].active = false; /* hide config in web ui */
    }
    save_network();
}

void set_default_service()
{
    strlcpy(service.hostname, "dosing_conroller", 32);

    /* OTA */
    strlcpy(service.ota_url, CONFIG_OTA_URL, 64);

    /* NTP */
    strlcpy(service.ntp_server, "es.pool.ntp.org", 32);
    service.utc_offset = 1;
    service.ntp_dst = false;
    service.enable_ntp = false;

    /*MQTT */
    strlcpy(service.mqtt_user, empty_str, 16);
    strlcpy(service.mqtt_password, empty_str, 16);
    service.mqtt_port = 1883;
    service.enable_mqtt = false;
    service.mqtt_qos = 0;
    save_service();
}

void set_default_pump()
{
    const char default_names[MAX_PUMP][32] = {
        {"CaRX"}, {"Magnesium"}, {"CaOH"}, {"Trace"}
    };

    for(size_t i = 0; i < MAX_PUMP; i++)
    {
        pump[i].id                        = i;
        pump[i].calibration_100ml_units      = 0;
        pump[i].tank_full_vol             = 0;
        pump[i].tank_concentration_total  = 0;
        pump[i].tank_concentration_active = 0;
        pump[i].tank_current_vol          = 0;
        pump[i].state                     = 0;
        strlcpy(pump[i].name, default_names[i], 32);    /* default name Calcium, Magnesium, Alkalinity */
    }
    save_pump();
}

void set_default_schedule()
{
    for(size_t i = 0; i < MAX_SCHEDULE; i++)
    {
        schedule[i].pump_id         = i;
        schedule[i].work_hours      = 0; /* Pump Work Hours */
        schedule[i].week_days       = 0; /* Pump Work Week days */
        schedule[i].speed           = 0; /* Pump speed flow */
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
    }
}

void save_pump(void)
{
    esp_err_t err = app_settings_set_blob("pump", &pump, sizeof(pump_t) * MAX_PUMP, true);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to save pumps.");
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

void ip_to_string(uint8_t ip[4], char *string) {
    snprintf(string, 16, "%d.%d.%d.%d", ip[0], ip[1], ip[2], ip[3]);
}

void string_to_ip(const char *ip_string, uint8_t *octets) {
    char *octet;
    char ip_address[16];

    memset(ip_address, 0, 16);
    strcpy(ip_address, ip_string);

    octet = strtok(ip_address, ".");
    for (int j = 0; j < 4; ++j) {
        octets[j] = (uint8_t) atoi(octet);
        octet = strtok(NULL, ".");
    }
}
