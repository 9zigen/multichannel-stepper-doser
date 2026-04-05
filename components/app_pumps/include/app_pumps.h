#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "freertos/FreeRTOS.h"
#include "driver/gpio.h"
#include "esp_err.h"
#include "app_settings.h"

#define PUMP_SOFT_START 50
#define PUMP_TIMER_UNIT_IN_SEC 100
#define PUMP_TIMER_UNIT (1000 / PUMP_TIMER_UNIT_IN_SEC)
#define PUMP_TIMER_INTERVAL ((1000 / PUMP_TIMER_UNIT_IN_SEC) / portTICK_RATE_MS)

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
