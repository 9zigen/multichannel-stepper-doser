#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "freertos/FreeRTOS.h"
#include "driver/gpio.h"
#include "esp_err.h"
#include "app_settings.h"

#define PUMP_SOFT_START 50
#define PUMP_TIMER_UNIT_IN_SEC 100
#define PUMP_TIMER_UNIT (1000 / PUMP_TIMER_UNIT_IN_SEC)
#define PUMP_TIMER_INTERVAL ((1000 / PUMP_TIMER_UNIT_IN_SEC) / portTICK_RATE_MS)
#define APP_PUMP_HISTORY_RETAINED_DAYS 28
#define APP_PUMP_HISTORY_HOURS 24

typedef enum {
    PUMP_HISTORY_SOURCE_NONE = 0,
    PUMP_HISTORY_SOURCE_MANUAL,
    PUMP_HISTORY_SOURCE_SCHEDULED,
    PUMP_HISTORY_SOURCE_CONTINUOUS,
    PUMP_HISTORY_SOURCE_CALIBRATION,
} pump_history_source_t;

typedef enum {
    PUMP_HISTORY_FLAG_SCHEDULED = 1 << 0,
    PUMP_HISTORY_FLAG_MANUAL = 1 << 1,
    PUMP_HISTORY_FLAG_CONTINUOUS = 1 << 2,
    PUMP_HISTORY_FLAG_CALIBRATION = 1 << 3,
} pump_history_flag_t;

typedef struct __attribute__((packed)) {
    uint16_t scheduled_volume_ml;
    uint16_t manual_volume_ml;
    uint16_t total_runtime_s;
    uint8_t flags;
    uint8_t reserved;
} pump_history_hour_t;

typedef struct __attribute__((packed)) {
    uint32_t day_stamp;
    pump_history_hour_t hours[APP_PUMP_HISTORY_HOURS];
} pump_history_day_t;

typedef enum {
    PUMP_OFF,
    PUMP_ON,
    PUMP_CONTINUOUS,
    PUMP_CAL
} pump_state_t;

typedef struct {
    uint32_t time;
    double volume;
    double flow_per_unit;
    float rpm;
    bool direction;
    pump_state_t state;
    pump_history_source_t history_source;
} pumps_status_t;

typedef struct {
    uint8_t pump_id;
    uint32_t time;
    double volume;
    double flow_per_unit;
    float rpm;
    bool direction;
    pump_state_t state;
} pump_runtime_event_t;

typedef struct {
    uint8_t magic;
    double tank_current_vol[MAX_PUMP];
} tank_status_t;

typedef struct {
    const char *name;
    bool supports_direction;
    bool supports_speed_control;
    esp_err_t (*start)(uint8_t pump_id, float speed, bool direction, int32_t duration_ms);
    void (*stop)(uint8_t pump_id);
} app_pumps_backend_t;

esp_err_t app_pumps_register_backend(const app_pumps_backend_t *backend);
const app_pumps_backend_t *app_pumps_get_backend(void);

int64_t get_tank_volume(uint8_t pump_id);
const pumps_status_t *get_pumps_runtime_status(void);
void run_pump_with_timeout(uint8_t pump_id, uint32_t timeout_ms, uint8_t speed);
void run_pump_on_volume(uint8_t pump_id, double volume_ml, float rpm);
esp_err_t run_pump_manual(uint8_t pump_id, float rpm, bool direction, int32_t time_minutes);
void run_pump_calibration(uint8_t pump_id, bool is_start, float rpm, bool direction);

int init_pumps(void);
void backup_eeprom_tank_status(void);
uint32_t app_pumps_history_get_current_day_stamp(void);
bool app_pumps_history_get_day(uint8_t pump_id, uint32_t day_stamp, pump_history_day_t *out_day);
bool app_pumps_history_get_today(uint8_t pump_id, pump_history_day_t *out_day);
esp_err_t app_pumps_history_backup(size_t *written_days);
