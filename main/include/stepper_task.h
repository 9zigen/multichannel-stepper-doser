#pragma once
#include "tmc2209.h"

esp_err_t stepper_task_control(uint8_t id, uint32_t rpm, uint32_t direction, uint32_t loops);
void stepper_task(void *pvParameter);

