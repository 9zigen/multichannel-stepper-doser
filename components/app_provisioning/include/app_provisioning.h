#pragma once

#include "esp_err.h"
#include <stdbool.h>

esp_err_t app_provisioning_init(void);
esp_err_t app_provisioning_start(void);
void app_provisioning_stop(void);
bool app_provisioning_is_active(void);
