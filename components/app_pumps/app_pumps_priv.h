#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#include "app_pumps.h"

uint32_t app_pumps_current_local_day_stamp(void);
uint8_t app_pumps_current_local_hour(void);

void app_pumps_history_restore_today_from_backup(void);
void app_pumps_history_record_activity(uint8_t pump_id, pump_history_source_t source,
                                       double volume_delta_ml, bool runtime_tick);
double app_pumps_history_get_pump_hour_volume_ml(uint8_t pump_id, uint8_t hour);
double app_pumps_history_get_pump_day_volume_ml(uint8_t pump_id);
double app_pumps_history_get_total_day_volume_ml(void);

esp_err_t app_pumps_storage_restore_tank_status(void);
esp_err_t app_pumps_storage_backup_tank_status(void);
bool app_pumps_storage_using_flash_fallback(void);
void app_pumps_storage_load_schedule_state(uint32_t last_run_schedule_hour[MAX_SCHEDULE]);
esp_err_t app_pumps_storage_save_schedule_state(const uint32_t last_run_schedule_hour[MAX_SCHEDULE]);
