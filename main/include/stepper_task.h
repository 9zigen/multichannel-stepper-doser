#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

esp_err_t stepper_task_control(uint8_t id, float rpm, bool direction, int32_t duration_ms);
esp_err_t stepper_task_reload_config(void);
void stepper_task(void *pvParameter);
