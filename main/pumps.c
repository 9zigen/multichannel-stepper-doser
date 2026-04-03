/***
** Created by Aleksey Volkov on 6.2.2022.
***/

#include <stdlib.h>
#include <math.h>
#include <time.h>

#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <freertos/timers.h>
#include <esp_log.h>
#include <esp_err.h>
#include <esp_timer.h>
#include <driver/ledc.h>
#include <driver/gpio.h>

#include "tools.h"
#include "app_settings.h"
#include "pwm_driver.h"
#include "pumps.h"
#include "eeprom.h"

static const char *TAG = "PUMPS";

TimerHandle_t xBackupTimer;
TimerHandle_t xScheduleTimer;
pumps_status_t pumps[MAX_PUMP];
uint32_t last_run_schedule_hour[MAX_SCHEDULE];
const gpio_num_t dc_motor_pins[8] = {GPIO_NUM_14, GPIO_NUM_15, GPIO_NUM_16, GPIO_NUM_17,
                                     GPIO_NUM_19, GPIO_NUM_20, GPIO_NUM_21, GPIO_NUM_33};

uint8_t tank_volume_changed = 0;

static void start_pump(uint8_t pump_id, uint8_t speed)
{
    ESP_LOGI(TAG, "start pump:%d!", pump_id);
    gpio_set_level(pumps[pump_id].led_pin, 0);
    gpio_set_level(pumps[pump_id].motor_pin, 1);
//  fade_channel_percent(pump_id, PUMP_SOFT_START, speed);
}

static void stop_pump(uint8_t pump_id)
{
    ESP_LOGI(TAG, "stop pump:%d!", pump_id);
    gpio_set_level(pumps[pump_id].led_pin, 1);
    gpio_set_level(pumps[pump_id].motor_pin, 0);
//  fade_channel(pump_id, PUMP_SOFT_START, 0);
}

static void run_timer_callback(void* arg)
{
    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        if (pumps[pump_id].state == PUMP_ON && pumps[pump_id].time > 0)
        {
            pumps[pump_id].volume += pumps[pump_id].flow_per_unit;
            pumps[pump_id].time--; /* in units */

            /* update tank volume */
            pump_t * pump_config = get_pump_config(pump_id);
            pump_config->tank_current_vol = pump_config->tank_current_vol - pumps[pump_id].flow_per_unit;
            tank_volume_changed = 1;
        }
        else if (pumps[pump_id].state == PUMP_ON && pumps[pump_id].time == 0)
        {
            pumps[pump_id].state = PUMP_OFF;
            stop_pump(pump_id);
        }
        else if (pumps[pump_id].state == PUMP_CAL)
        {
            pumps[pump_id].time++; /* in units */
        }
    }
}

/* Run Pump with Timeout in milliseconds and speed 0 - 100% */
void run_pump_on_volume(uint8_t pump_id, double volume_ml, uint8_t speed)
{
    /* pump config */
    pump_t * pump_config = get_pump_config(pump_id);

    if (pump_config->calibration_100ml_units <= 0) {
        ESP_LOGE(TAG, "pump calibration not set");
        return;
    }

    /* flow every unit */
    double work_flow = 100.0 / pump_config->calibration_100ml_units;
    /* units for 1ml at selected speed */
    double ml_units = pump_config->calibration_100ml_units / 100.0;
    /* pump work for 1ml flow */
    double work_time_units = volume_ml * ml_units;

    ESP_LOGI(TAG, "pump work flow : %f ml/unit.", work_flow);
    ESP_LOGI(TAG, "units in 1ml   : %f units.", ml_units);
    ESP_LOGI(TAG, "calc work time : %f units. (%f)seconds", work_time_units, work_time_units / PUMP_TIMER_UNIT_IN_SEC);

    /* set working time */
    pumps[pump_id].time = (uint32_t)work_time_units;
    pumps[pump_id].flow_per_unit = work_flow * speed / 100.0;
    pumps[pump_id].volume = 0;
    pumps[pump_id].state = PUMP_ON;

    ESP_LOGI(TAG, "run_pump_on_volume: %f ml. flow_per_unit: %f", volume_ml, pumps[pump_id].flow_per_unit);

    start_pump(pump_id, speed);
}

/* Run 100 ml pump calibration */
void run_pump_calibration(uint8_t pump_id, uint8_t is_start)
{
    if (is_start)
    {
        pumps[pump_id].state = PUMP_CAL;
        pumps[pump_id].time = 0; /* unlimited */
        pumps[pump_id].flow_per_unit = 0;
        start_pump(pump_id, 100);
    } else {
        pumps[pump_id].state = PUMP_OFF;
        stop_pump(pump_id);

        pump_t * cfg = get_pump_config(pump_id);
        if (cfg->calibration_100ml_units != pumps[pump_id].time)
        {
            cfg->calibration_100ml_units = pumps[pump_id].time;
            ESP_LOGI(TAG, "calibration_100ml_units: %lu", pumps[pump_id].time);

            /* Save Pump NVS */
            save_pump();
        }
    }
}

/* return left volume in tank */
int64_t get_tank_volume(uint8_t pump_id)
{
    pump_t * pump = get_pump_config(pump_id);
    return pump->tank_current_vol;
}

/* restore eeprom tank status */
static void restore_eeprom_tank_status()
{
    tank_status_t tank;
    eeprom_read(0x50, EEPROM_TANK_STATUS_ADDR, (uint8_t*)&tank, sizeof(tank_status_t));
    if (tank.magic == EEPROM_MAGIC) {
        for (int i = 0; i < MAX_PUMP; ++i) {
            pump_t * pump = get_pump_config(i);
            pump->tank_current_vol = tank.tank_current_vol[i];
        }
    }
}

/* backup eeprom tank status */
void backup_eeprom_tank_status()
{
    tank_status_t tank;
    for (int i = 0; i < MAX_PUMP; ++i) {
        pump_t * pump = get_pump_config(i);
        tank.tank_current_vol[i] = pump->tank_current_vol;
    }
    tank.magic = EEPROM_MAGIC;
    eeprom_write(0x50, EEPROM_TANK_STATUS_ADDR, (uint8_t*)&tank, sizeof(tank_status_t));
}

void vBackupTimerHandler( TimerHandle_t pxTimer )
{
//    if (tank_volume_changed) {
//        tank_volume_changed = 0;
//        backup_eeprom_tank_status();
//    }
}

void vScheduleTimerHandler( TimerHandle_t pxTimer )
{
    /* get current local time */
    time_t now;
    struct tm time_info;
    time(&now);
    localtime_r(&now, &time_info);

    /* schedule ---> */
    for (uint8_t j = 0; j < MAX_SCHEDULE; ++j)
    {
        schedule_t *schedule = get_schedule_config(j);

        /* only enable schedule process */
        if (schedule->active && pumps[schedule->pump_id].state == PUMP_OFF)
        {
            /* check weekday and hour bits */
            if (last_run_schedule_hour[j] != time_info.tm_hour &&
                schedule->week_days & 1 << time_info.tm_wday &&
                schedule->work_hours & 1 << time_info.tm_hour)
            {
                /* save last run to prevent multiple dosing */
                last_run_schedule_hour[j] = time_info.tm_hour;

                /* prepare new queue message */
                double volume = 0.0;
                double total_work_hours = 0.0;

                /* count total work hours in day */
                for (uint8_t h = 0; h < 24; h++) {
                    if (schedule->work_hours & 1 << h)
                    {
                        total_work_hours++;
                    }
                }

                /* calc volume in hour */
                if (total_work_hours > 0) {
                    volume = (double)schedule->day_volume / total_work_hours;
                }

                ESP_LOGD(TAG, "schedule:%d speed:%02f, workH:%f, Dvol:%lu, Hvol:%f",
                         schedule->pump_id, schedule->speed, total_work_hours, schedule->day_volume, volume);

                run_pump_on_volume(schedule->pump_id, volume, schedule->speed);

                /* update eeprom last run */
                eeprom_write(0x50, EEPROM_SCHEDULE_STATUS_ADDR, (uint8_t*)last_run_schedule_hour, sizeof(last_run_schedule_hour));
                eeprom_write_byte(0x50, 0x31, 0x82);
                break;
            }
        }
    }
}

int init_pumps(void)
{
    for (int i = 0; i < MAX_PUMP; ++i) {
        pumps[i].time = 0;
        pumps[i].volume = 0;
        pumps[i].state = PUMP_OFF;
        pumps[i].motor_pin = dc_motor_pins[i];
        pumps[i].led_pin = GPIO_NUM_1 + i;

        /* dc motor gpio setup */
        gpio_set_direction(pumps[i].motor_pin, GPIO_MODE_OUTPUT);
        gpio_set_level(pumps[i].motor_pin, 0);

        /* led gpio setup */
        gpio_set_direction(pumps[i].led_pin, GPIO_MODE_OUTPUT);
        gpio_set_level(pumps[i].led_pin, 0);
        vTaskDelay(200 / portTICK_PERIOD_MS);
        gpio_set_level(pumps[i].led_pin, 1);
    }

    /* read eeprom last run, check MAGIC 0x82 */
    if ( eeprom_read_byte(0x50, 0x31) == 0x82 )
    {
        eeprom_read(0x50, EEPROM_SCHEDULE_STATUS_ADDR, (uint8_t*)last_run_schedule_hour, sizeof(last_run_schedule_hour));
        for (uint8_t j = 0; j < MAX_SCHEDULE; ++j) {
            ESP_LOGI(TAG, "EEPROM last_run:%d:%lu", j, last_run_schedule_hour[j]);
        }
    } else {
        for (int i = 0; i < MAX_SCHEDULE; ++i) {
            last_run_schedule_hour[i] = 0xff;
        }
    }

    /* read eeprom tank status */
    restore_eeprom_tank_status();

    /* Create pump auto stop timer with 10ms. period */
    const esp_timer_create_args_t run_timer_args = {
            .callback = &run_timer_callback,
            .name = "run_timer_callback"
    };

    esp_timer_handle_t run_timer;
    ESP_ERROR_CHECK(esp_timer_create(&run_timer_args, &run_timer));

    ESP_ERROR_CHECK(esp_timer_start_periodic(run_timer, 10000));

    /* Start schedule timer */
    xScheduleTimer = xTimerCreate( "scheduleTimer", ( 60 * 1000 / portTICK_PERIOD_MS), pdTRUE, 0, vScheduleTimerHandler);
    CHECK_TIMER(xTimerStart(xScheduleTimer, 100 / portTICK_PERIOD_MS));

    /* 1 sec backup timer */
    xBackupTimer = xTimerCreate( "backupTimer", ( 1000 / portTICK_PERIOD_MS), pdTRUE, 0, vBackupTimerHandler);
    xTimerStart(xBackupTimer, 100 / portTICK_PERIOD_MS);

    return ESP_OK;
}

/***
 * Peristaltic pump calibration function
 * @param pump_id
 * @param is_start
 * @param speed
 * @param volume
 * @return
 */
esp_err_t pumps_calibration(uint8_t pump_id, uint8_t is_start, uint16_t speed, uint16_t volume)
{
    if (pump_id >= MAX_PUMP) {
        return ESP_ERR_INVALID_ARG;
    }

    if (is_start)
    {
        pumps[pump_id].state = PUMP_CAL;
        pumps[pump_id].time = 0; /* unlimited */
        pumps[pump_id].flow_per_unit = 0;
        start_pump(pump_id, 100);
    } else {
        pumps[pump_id].state = PUMP_OFF;
        stop_pump(pump_id);

        pump_t * cfg = get_pump_config(pump_id);
        if (cfg->calibration_100ml_units != pumps[pump_id].time)
        {
            cfg->calibration_100ml_units = pumps[pump_id].time;
            ESP_LOGI(TAG, "calibration_100ml_units: %lu", pumps[pump_id].time);

            /* Save Pump NVS */
            save_pump();
        }
    }

    return ESP_OK;
}