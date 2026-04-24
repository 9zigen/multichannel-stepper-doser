#pragma once

#include <stdint.h>

#include "esp_err.h"

typedef enum {
    MQTT_DISABLED = 0,
    MQTT_ENABLED_NOT_CONNECTED,
    MQTT_ENABLED_CONNECTED,
} mqtt_service_status_t;

void app_mqtt_task(void *pvParameters);
mqtt_service_status_t get_mqtt_status(void);
const char *get_mqtt_last_error(void);
