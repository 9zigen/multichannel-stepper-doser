#pragma once

#include "esp_err.h"
#include "mqtt_client.h"

typedef struct {
    const char *device_id;
    const char *device_model;
    const char *device_name;
    const char *device_manufacturer;
    const char *device_sw_version;
    const char *device_hw_version;
    const char *hass_prefix;
    const char *topic_base;
} discovery_settings_t;

esp_err_t hass_mqtt_discovery_init(const discovery_settings_t *params);
void hass_mqtt_discovery_deinit(void);
void hass_mqtt_discovery_configure_device(esp_mqtt_client_handle_t mqtt_client_instance, int qos, int retain);
