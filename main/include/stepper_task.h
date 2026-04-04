#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "tmc2209.h"

esp_err_t stepper_task_control(uint8_t id, float rpm, bool direction, int32_t duration_ms);
void stepper_task(void *pvParameter);
