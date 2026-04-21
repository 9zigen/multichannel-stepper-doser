#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "sdkconfig.h"

#include "cJSON.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_wifi.h"

#if defined(CONFIG_BT_CONTROLLER_ENABLED)
#include "esp_bt.h"
#endif

#include "app_monitor.h"
#include "app_settings.h"
#include "connect.h"

#include <protocomm.h>
#include <protocomm_ble.h>
#include <protocomm_security1.h>

#include "app_provisioning.h"

static const char *TAG = "APP_PROVISIONING";
static const uint8_t s_service_uuid[16] = {
    0x7d, 0xd2, 0x2f, 0x2c, 0x4a, 0x5e, 0x31, 0x9b,
    0x9f, 0x4e, 0x91, 0x5a, 0x01, 0x51, 0x34, 0x92,
};

enum {
    APP_PROVISIONING_UUID_SESSION = 0xFF51,
    APP_PROVISIONING_UUID_VERSION = 0xFF52,
    APP_PROVISIONING_UUID_CONFIG = 0xFF53,
    APP_PROVISIONING_UUID_STATUS = 0xFF54,
};

#define APP_PROVISIONING_ENDPOINT_SESSION "prov-session"
#define APP_PROVISIONING_ENDPOINT_VERSION "proto-ver"
#define APP_PROVISIONING_ENDPOINT_CONFIG "prov-config"
#define APP_PROVISIONING_ENDPOINT_STATUS "prov-status"

static bool s_initialized = false;
static bool s_active = false;
static bool s_classic_bt_mem_released = false;
static protocomm_t *s_pc = NULL;
static protocomm_security1_params_t s_security_params = {0};
static char s_device_name[MAX_BLE_DEVNAME_LEN + 1];
static char s_security_pop[65];
static char s_version_payload[160];

static protocomm_ble_name_uuid_t s_ble_endpoints[] = {
    { APP_PROVISIONING_ENDPOINT_SESSION, APP_PROVISIONING_UUID_SESSION },
    { APP_PROVISIONING_ENDPOINT_VERSION, APP_PROVISIONING_UUID_VERSION },
    { APP_PROVISIONING_ENDPOINT_CONFIG, APP_PROVISIONING_UUID_CONFIG },
    { APP_PROVISIONING_ENDPOINT_STATUS, APP_PROVISIONING_UUID_STATUS },
};

static protocomm_ble_config_t s_ble_config = {
    .device_name = "",
    .service_uuid = {0},
    .manufacturer_data = NULL,
    .manufacturer_data_len = 0,
    .nu_lookup_count = sizeof(s_ble_endpoints) / sizeof(s_ble_endpoints[0]),
    .nu_lookup = s_ble_endpoints,
    .ble_bonding = 0,
    .ble_sm_sc = 0,
    .ble_link_encryption = 0,
    .ble_addr = NULL,
    .keep_ble_on = 1,
    .ble_notify = 0,
};

static void app_provisioning_cleanup(void)
{
    if (s_pc != NULL) {
        protocomm_ble_stop(s_pc);
        protocomm_delete(s_pc);
        s_pc = NULL;
    }
    s_active = false;
}

static char *app_provisioning_build_result_json(bool success, const char *message)
{
    char *result = NULL;
    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        return NULL;
    }

    cJSON_AddBoolToObject(root, "success", success);
    if (message != NULL) {
        cJSON_AddStringToObject(root, "message", message);
    }

    result = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    return result;
}

static network_t *app_provisioning_find_wifi_slot(void)
{
    for (uint8_t i = 0; i < MAX_NETWORKS; ++i) {
        network_t *network = get_networks_config(i);
        if (network != NULL && network->type == NETWORK_TYPE_WIFI) {
            return network;
        }
    }

    return NULL;
}

static char *app_provisioning_build_status_json(void)
{
    char *result = NULL;
    system_status_t *status = get_system_status();
    services_t *services = get_service_config();
    cJSON *root = cJSON_CreateObject();
    if (root == NULL) {
        return NULL;
    }

    cJSON_AddBoolToObject(root, "success", true);
    cJSON_AddBoolToObject(root, "ble_active", s_active);
    cJSON_AddBoolToObject(root, "recovery_mode", connect_ap_recovery_is_active());
    cJSON_AddBoolToObject(root, "fallback_mode", connect_ap_fallback_is_active());
    cJSON_AddBoolToObject(root, "grace_mode", connect_ap_grace_is_active());
    cJSON_AddBoolToObject(root, "station_connected", status->station_connected);
    cJSON_AddStringToObject(root, "station_ssid", status->station_ssid);
    cJSON_AddStringToObject(root, "station_ip_address", status->station_ip_address);
    cJSON_AddStringToObject(root, "ap_ssid", status->ap_ssid);
    cJSON_AddStringToObject(root, "ap_ip_address", status->ap_ip_address);
    cJSON_AddNumberToObject(root, "ap_clients", status->ap_clients);
    cJSON_AddStringToObject(root, "hostname", services->hostname);
    cJSON_AddStringToObject(root, "time_zone", services->time_zone);

    result = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    return result;
}

static esp_err_t app_provisioning_status_handler(uint32_t session_id,
                                                 const uint8_t *inbuf,
                                                 ssize_t inlen,
                                                 uint8_t **outbuf,
                                                 ssize_t *outlen,
                                                 void *priv_data)
{
    (void)session_id;
    (void)inbuf;
    (void)inlen;
    (void)priv_data;

    if (outbuf == NULL || outlen == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    monitor_refresh_and_publish();

    char *response = app_provisioning_build_status_json();
    if (response == NULL) {
        return ESP_ERR_NO_MEM;
    }

    *outbuf = (uint8_t *)response;
    *outlen = (ssize_t)strlen(response);
    return ESP_OK;
}

static void app_provisioning_apply_ip_field(cJSON *parent, const char *name, uint8_t target[4])
{
    cJSON *value = cJSON_GetObjectItem(parent, name);
    if (cJSON_IsString(value) && value->valuestring != NULL) {
        string_to_ip(value->valuestring, target);
    }
}

static esp_err_t app_provisioning_apply_network(cJSON *network_json, bool *network_updated, char **error_response)
{
    network_t *network = NULL;
    cJSON *ssid = NULL;
    cJSON *password = NULL;

    if (!cJSON_IsObject(network_json)) {
        return ESP_OK;
    }

    network = app_provisioning_find_wifi_slot();
    if (network == NULL) {
        *error_response = app_provisioning_build_result_json(false, "No Wi-Fi network slot available");
        return ESP_ERR_NOT_FOUND;
    }

    ssid = cJSON_GetObjectItem(network_json, "ssid");
    password = cJSON_GetObjectItem(network_json, "password");

    if (cJSON_IsString(ssid) && ssid->valuestring != NULL) {
        strlcpy(network->ssid, ssid->valuestring, sizeof(network->ssid));
    }

    if (cJSON_IsString(password) && password->valuestring != NULL) {
        strlcpy(network->password, password->valuestring, sizeof(network->password));
    }

    if (strlen(network->ssid) < 2) {
        *error_response = app_provisioning_build_result_json(false, "Wi-Fi SSID is required");
        return ESP_ERR_INVALID_ARG;
    }

    cJSON *keep_ap_active = cJSON_GetObjectItem(network_json, "keep_ap_active");
    if (cJSON_IsBool(keep_ap_active)) {
        network->keep_ap_active = cJSON_IsTrue(keep_ap_active);
    }

    cJSON *dhcp = cJSON_GetObjectItem(network_json, "dhcp");
    if (cJSON_IsBool(dhcp)) {
        network->dhcp = cJSON_IsTrue(dhcp);
    }

    app_provisioning_apply_ip_field(network_json, "ip_address", network->ip_address);
    app_provisioning_apply_ip_field(network_json, "mask", network->mask);
    app_provisioning_apply_ip_field(network_json, "gateway", network->gateway);
    app_provisioning_apply_ip_field(network_json, "dns", network->dns);

    network->active = true;
    network->is_dirty = false;
    *network_updated = true;
    return ESP_OK;
}

static void app_provisioning_apply_services(cJSON *services_json, bool *services_updated)
{
    services_t *services = get_service_config();
    if (!cJSON_IsObject(services_json)) {
        return;
    }

    cJSON *hostname = cJSON_GetObjectItem(services_json, "hostname");
    if (cJSON_IsString(hostname) && hostname->valuestring != NULL) {
        strlcpy(services->hostname, hostname->valuestring, sizeof(services->hostname));
        *services_updated = true;
    }

    cJSON *time_zone = cJSON_GetObjectItem(services_json, "time_zone");
    if (cJSON_IsString(time_zone) && time_zone->valuestring != NULL) {
        strlcpy(services->time_zone, time_zone->valuestring, sizeof(services->time_zone));
        *services_updated = true;
    }
}

static void app_provisioning_apply_auth(cJSON *auth_json, bool *auth_updated)
{
    auth_t *auth = get_auth_config();
    if (!cJSON_IsObject(auth_json)) {
        return;
    }

    cJSON *username = cJSON_GetObjectItem(auth_json, "username");
    if (cJSON_IsString(username) && username->valuestring != NULL) {
        strlcpy(auth->username, username->valuestring, sizeof(auth->username));
        *auth_updated = true;
    }

    cJSON *password = cJSON_GetObjectItem(auth_json, "password");
    if (cJSON_IsString(password) && password->valuestring != NULL) {
        strlcpy(auth->password, password->valuestring, sizeof(auth->password));
        *auth_updated = true;
    }
}

static void app_provisioning_apply_app_state(cJSON *app_json, bool *app_updated)
{
    app_state_t *app_state = get_app_state_config();
    if (!cJSON_IsObject(app_json)) {
        return;
    }

    cJSON *onboarding_completed = cJSON_GetObjectItem(app_json, "onboarding_completed");
    if (cJSON_IsBool(onboarding_completed)) {
        app_state->onboarding_completed = cJSON_IsTrue(onboarding_completed);
        *app_updated = true;
    }
}

static esp_err_t app_provisioning_config_handler(uint32_t session_id,
                                                 const uint8_t *inbuf,
                                                 ssize_t inlen,
                                                 uint8_t **outbuf,
                                                 ssize_t *outlen,
                                                 void *priv_data)
{
    bool network_updated = false;
    bool services_updated = false;
    bool auth_updated = false;
    bool app_updated = false;
    esp_err_t result = ESP_OK;
    char *response = NULL;
    cJSON *root = NULL;

    (void)session_id;
    (void)priv_data;

    if (inbuf == NULL || inlen <= 0 || outbuf == NULL || outlen == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    root = cJSON_ParseWithLength((const char *)inbuf, (size_t)inlen);
    if (root == NULL) {
        response = app_provisioning_build_result_json(false, "Invalid provisioning payload");
        if (response == NULL) {
            return ESP_ERR_NO_MEM;
        }
        *outbuf = (uint8_t *)response;
        *outlen = (ssize_t)strlen(response);
        return ESP_OK;
    }

    result = app_provisioning_apply_network(cJSON_GetObjectItem(root, "network"), &network_updated, &response);
    if (result != ESP_OK) {
        goto finish;
    }

    app_provisioning_apply_services(cJSON_GetObjectItem(root, "services"), &services_updated);
    app_provisioning_apply_auth(cJSON_GetObjectItem(root, "auth"), &auth_updated);
    app_provisioning_apply_app_state(cJSON_GetObjectItem(root, "app"), &app_updated);

    if (network_updated) {
        save_network();
    }
    if (services_updated) {
        save_service();
    }
    if (auth_updated) {
        save_auth();
    }
    if (app_updated) {
        save_app_state();
    }

    if (network_updated) {
        connect_on_network_settings_updated();
    }

    monitor_refresh_and_publish();
    response = app_provisioning_build_status_json();
    result = response != NULL ? ESP_OK : ESP_ERR_NO_MEM;

finish:
    cJSON_Delete(root);
    if (response == NULL) {
        response = app_provisioning_build_result_json(false, "Provisioning update failed");
        if (response == NULL) {
            return ESP_ERR_NO_MEM;
        }
    }

    *outbuf = (uint8_t *)response;
    *outlen = (ssize_t)strlen(response);
    return ESP_OK;
}

static void app_provisioning_build_identity(void)
{
    uint8_t mac[6] = {0};

    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(s_device_name, sizeof(s_device_name), "%s-%02X%02X%02X",
             CONFIG_CONTROLLER_WIFI_SSID, mac[3], mac[4], mac[5]);

    if (strlen(CONFIG_CONTROLLER_WIFI_PASS) > 0) {
        strlcpy(s_security_pop, CONFIG_CONTROLLER_WIFI_PASS, sizeof(s_security_pop));
    } else {
        strlcpy(s_security_pop, s_device_name, sizeof(s_security_pop));
    }

    s_security_params.data = (const uint8_t *)s_security_pop;
    s_security_params.len = (uint16_t)strlen(s_security_pop);

    memset(s_version_payload, 0, sizeof(s_version_payload));
    snprintf(s_version_payload,
             sizeof(s_version_payload),
             "{\"app\":\"stepper-doser\",\"ver\":\"v1\",\"cap\":[\"prov-config\",\"prov-status\"]}");
}

esp_err_t app_provisioning_init(void)
{
    if (s_initialized) {
        return ESP_OK;
    }

    memcpy(s_ble_config.service_uuid, s_service_uuid, sizeof(s_service_uuid));
    s_initialized = true;
    return ESP_OK;
}

esp_err_t app_provisioning_start(void)
{
    if (s_active) {
        return ESP_OK;
    }

#if !CONFIG_BT_ENABLED
    ESP_LOGW(TAG, "BLE provisioning requested but Bluetooth is disabled in sdkconfig");
    return ESP_ERR_NOT_SUPPORTED;
#else
    esp_err_t err;

    if (!s_initialized) {
        err = app_provisioning_init();
        if (err != ESP_OK) {
            return err;
        }
    }

#if defined(CONFIG_BT_CONTROLLER_ENABLED)
    if (!s_classic_bt_mem_released) {
        err = esp_bt_mem_release(ESP_BT_MODE_CLASSIC_BT);
        if (err == ESP_OK || err == ESP_ERR_INVALID_STATE) {
            s_classic_bt_mem_released = true;
        } else {
            ESP_LOGW(TAG, "Failed to release classic BT memory: %s", esp_err_to_name(err));
        }
    }
#endif

    app_provisioning_build_identity();
    strlcpy(s_ble_config.device_name, s_device_name, sizeof(s_ble_config.device_name));

    s_pc = protocomm_new();
    if (s_pc == NULL) {
        return ESP_ERR_NO_MEM;
    }

    err = protocomm_ble_start(s_pc, &s_ble_config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start BLE transport: %s", esp_err_to_name(err));
        protocomm_delete(s_pc);
        s_pc = NULL;
        return err;
    }

    err = protocomm_set_security(s_pc,
                                 APP_PROVISIONING_ENDPOINT_SESSION,
                                 &protocomm_security1,
                                 &s_security_params);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to set BLE security endpoint: %s", esp_err_to_name(err));
        app_provisioning_cleanup();
        return err;
    }

    err = protocomm_set_version(s_pc, APP_PROVISIONING_ENDPOINT_VERSION, s_version_payload);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to set BLE version endpoint: %s", esp_err_to_name(err));
        app_provisioning_cleanup();
        return err;
    }

    err = protocomm_add_endpoint(s_pc, APP_PROVISIONING_ENDPOINT_CONFIG, app_provisioning_config_handler, NULL);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to add BLE config endpoint: %s", esp_err_to_name(err));
        app_provisioning_cleanup();
        return err;
    }

    err = protocomm_add_endpoint(s_pc, APP_PROVISIONING_ENDPOINT_STATUS, app_provisioning_status_handler, NULL);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to add BLE status endpoint: %s", esp_err_to_name(err));
        app_provisioning_cleanup();
        return err;
    }

    s_active = true;
    ESP_LOGI(TAG, "BLE provisioning active as %s", s_device_name);
    return ESP_OK;
#endif
}

void app_provisioning_stop(void)
{
    if (s_pc == NULL) {
        return;
    }

    ESP_LOGI(TAG, "Stopping BLE provisioning");
    app_provisioning_cleanup();
}

bool app_provisioning_is_active(void)
{
    return s_active;
}
