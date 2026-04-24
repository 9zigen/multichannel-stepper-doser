#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"
#include "app_pumps.h"

esp_err_t stepper_task_control(uint8_t id, float rpm, bool direction, int32_t duration_ms);
esp_err_t stepper_task_reload_config(void);
bool stepper_task_get_driver_status(uint8_t id, pump_driver_status_t *out_status);
void stepper_task(void *pvParameter);
