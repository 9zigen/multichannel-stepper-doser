/***
** Created by Aleksey Volkov on 22.12.2019.
***/

#ifndef HV_CC_LED_DRIVER_RTOS_LIGHT_H
#define HV_CC_LED_DRIVER_RTOS_LIGHT_H

#include "driver/gpio.h"
#include "app_settings.h"

#define PUMP_SOFT_START 50
#define PUMP_TIMER_UNIT_IN_SEC 100
#define PUMP_TIMER_UNIT (1000/PUMP_TIMER_UNIT_IN_SEC)
#define PUMP_TIMER_INTERVAL ((1000/PUMP_TIMER_UNIT_IN_SEC)/portTICK_RATE_MS) /* 10 ms timer, 100 tik every second of pump work */

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
  uint8_t magic;
  double tank_current_vol[MAX_PUMP];             // Tank Current Volume in ml
} tank_status_t;

typedef struct {
  uint8_t pump_id;
  uint8_t speed;
  double volume;
} x_pump_run_message_t;

/* public */
int64_t get_tank_volume(uint8_t pump_id);
const pumps_status_t *get_pumps_runtime_status(void);
void run_pump_with_timeout(uint8_t pump_id, uint32_t timeout_ms, uint8_t speed);
void run_pump_on_volume(uint8_t pump_id, double volume_ml, float rpm);
esp_err_t run_pump_manual(uint8_t pump_id, float rpm, bool direction, int32_t time_minutes);
void run_pump_calibration(uint8_t pump_id, bool is_start, float rpm, bool direction);

int init_pumps(void);
void task_schedule(void *pvParameter);
void task_pump_queue(void *pvParameter);

void backup_eeprom_tank_status();

#endif //HV_CC_LED_DRIVER_RTOS_LIGHT_H
