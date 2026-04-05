/***
** Created by Aleksey Volkov on 6.2.2022.
***/

#include <math.h>
#include <stdlib.h>
#include <time.h>

#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/timers.h>
#include <esp_err.h>
#include <esp_log.h>
#include <esp_timer.h>
#include <driver/gpio.h>

#include "app_settings.h"
#include "app_settings_storage.h"
#include "pumps.h"
#include "stepper_task.h"
#include "tools.h"

static const char *TAG = "PUMPS";

TimerHandle_t xBackupTimer;
TimerHandle_t xScheduleTimer;
pumps_status_t pumps[MAX_PUMP];
uint32_t last_run_schedule_hour[MAX_SCHEDULE];

uint8_t tank_volume_changed = 0;

static uint32_t current_local_day_stamp(void)
{
    time_t now;
    struct tm time_info;
    time(&now);
    localtime_r(&now, &time_info);
    return (uint32_t)((time_info.tm_year + 1900) * 1000 + time_info.tm_yday);
}

static double clamp_positive(double value)
{
    return value < 0.0 ? 0.0 : value;
}

static double pump_flow_ml_per_min(const pump_t *pump_config, float rpm)
{
    if (pump_config == NULL || rpm <= 0.0f) {
        return 0.0;
    }

    if (pump_config->calibration_count == 0) {
        if (pump_config->calibration_100ml_units == 0) {
            return 0.0;
        }
        return 100.0 * (double)PUMP_TIMER_UNIT_IN_SEC / (double)pump_config->calibration_100ml_units;
    }

    if (pump_config->calibration_count == 1) {
        return pump_config->calibration[0].flow;
    }

    const pump_calibration_t *points = pump_config->calibration;
    if (rpm <= points[0].speed) {
        return points[0].flow;
    }

    for (uint8_t i = 1; i < pump_config->calibration_count; ++i) {
        if (rpm <= points[i].speed) {
            double left_speed = points[i - 1].speed;
            double right_speed = points[i].speed;
            double left_flow = points[i - 1].flow;
            double right_flow = points[i].flow;
            if (right_speed <= left_speed) {
                return right_flow;
            }

            double ratio = ((double)rpm - left_speed) / (right_speed - left_speed);
            return left_flow + ((right_flow - left_flow) * ratio);
        }
    }

    return points[pump_config->calibration_count - 1].flow;
}

static esp_err_t start_pump(uint8_t pump_id, float rpm, bool direction)
{
    ESP_LOGI(TAG, "start pump:%u rpm=%.2f dir=%u", (unsigned)pump_id, rpm, direction);
    return stepper_task_control(pump_id, rpm, direction, -1);
}

static void stop_pump(uint8_t pump_id)
{
    ESP_LOGI(TAG, "stop pump:%u", (unsigned)pump_id);
    stepper_task_control(pump_id, 0.0f, false, 0);
}

static void run_timer_callback(void *arg)
{
    (void)arg;

    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        pump_t *pump_config = get_pump_config(pump_id);

        if (pumps[pump_id].state == PUMP_ON && pumps[pump_id].time > 0) {
            pumps[pump_id].volume += pumps[pump_id].flow_per_unit;
            pumps[pump_id].time--;
            pump_config->tank_current_vol = clamp_positive(pump_config->tank_current_vol - pumps[pump_id].flow_per_unit);
            pump_config->running_hours += 1.0f / (float)(PUMP_TIMER_UNIT_IN_SEC * 3600.0f);
            tank_volume_changed = 1;

            if (pumps[pump_id].time == 0) {
                pumps[pump_id].state = PUMP_OFF;
                stop_pump(pump_id);
            }
        } else if (pumps[pump_id].state == PUMP_CONTINUOUS) {
            pumps[pump_id].volume += pumps[pump_id].flow_per_unit;
            pump_config->tank_current_vol = clamp_positive(pump_config->tank_current_vol - pumps[pump_id].flow_per_unit);
            pump_config->running_hours += 1.0f / (float)(PUMP_TIMER_UNIT_IN_SEC * 3600.0f);
            tank_volume_changed = 1;
        } else if (pumps[pump_id].state == PUMP_CAL) {
            pumps[pump_id].time++;
        }
    }
}

void run_pump_with_timeout(uint8_t pump_id, uint32_t timeout_ms, uint8_t speed)
{
    if (pump_id >= MAX_PUMP || speed == 0) {
        return;
    }

    pump_t *pump_config = get_pump_config(pump_id);
    double flow_ml_per_min = pump_flow_ml_per_min(pump_config, (float)speed);
    if (flow_ml_per_min <= 0.0) {
        return;
    }

    pumps[pump_id].time = (uint32_t)llround(((double)timeout_ms / 1000.0) * PUMP_TIMER_UNIT_IN_SEC);
    if (pumps[pump_id].time == 0) {
        pumps[pump_id].time = 1;
    }
    pumps[pump_id].flow_per_unit = flow_ml_per_min / (double)PUMP_TIMER_UNIT_IN_SEC / 60.0;
    pumps[pump_id].volume = 0;
    pumps[pump_id].rpm = (float)speed;
    pumps[pump_id].direction = pump_config->direction;
    pumps[pump_id].state = PUMP_ON;
    start_pump(pump_id, (float)speed, pumps[pump_id].direction);
}

void run_pump_on_volume(uint8_t pump_id, double volume_ml, float rpm)
{
    if (pump_id >= MAX_PUMP) {
        return;
    }

    pump_t *pump_config = get_pump_config(pump_id);
    double flow_ml_per_min = pump_flow_ml_per_min(pump_config, rpm);
    if (flow_ml_per_min <= 0.0) {
        ESP_LOGE(TAG, "pump calibration not set for pump %u at %.2f rpm", (unsigned)pump_id, rpm);
        return;
    }

    double run_time_seconds = (volume_ml / flow_ml_per_min) * 60.0;
    uint32_t run_units = (uint32_t)llround(run_time_seconds * PUMP_TIMER_UNIT_IN_SEC);
    if (run_units == 0) {
        run_units = 1;
    }

    pumps[pump_id].time = run_units;
    pumps[pump_id].flow_per_unit = flow_ml_per_min / (double)PUMP_TIMER_UNIT_IN_SEC / 60.0;
    pumps[pump_id].volume = 0;
    pumps[pump_id].rpm = rpm;
    pumps[pump_id].direction = pump_config->direction;
    pumps[pump_id].state = PUMP_ON;

    ESP_LOGI(TAG, "run pump:%u volume=%.2f rpm=%.2f runtime=%.2fs",
             (unsigned)pump_id,
             volume_ml,
             rpm,
             run_time_seconds);

    if (start_pump(pump_id, rpm, pumps[pump_id].direction) != ESP_OK) {
        pumps[pump_id].state = PUMP_OFF;
    }
}

esp_err_t run_pump_manual(uint8_t pump_id, float rpm, bool direction, int32_t time_minutes)
{
    if (pump_id >= MAX_PUMP) {
        return ESP_ERR_INVALID_ARG;
    }

    if (time_minutes <= 0) {
        stop_pump(pump_id);
        pumps[pump_id].state = PUMP_OFF;
        pumps[pump_id].time = 0;
        return ESP_OK;
    }

    if (rpm <= 0.0f) {
        return ESP_ERR_INVALID_ARG;
    }

    pump_t *pump_config = get_pump_config(pump_id);
    double flow_ml_per_min = pump_flow_ml_per_min(pump_config, rpm);

    pumps[pump_id].time = (uint32_t)time_minutes * 60U * PUMP_TIMER_UNIT_IN_SEC;
    pumps[pump_id].flow_per_unit =
        flow_ml_per_min > 0.0 ? flow_ml_per_min / (double)PUMP_TIMER_UNIT_IN_SEC / 60.0 : 0.0;
    pumps[pump_id].volume = 0;
    pumps[pump_id].rpm = rpm;
    pumps[pump_id].direction = direction;
    pumps[pump_id].state = PUMP_ON;

    return start_pump(pump_id, rpm, direction);
}

void run_pump_calibration(uint8_t pump_id, bool is_start, float rpm, bool direction)
{
    if (pump_id >= MAX_PUMP) {
        return;
    }

    if (is_start) {
        pumps[pump_id].state = PUMP_CAL;
        pumps[pump_id].time = 0;
        pumps[pump_id].flow_per_unit = 0;
        pumps[pump_id].volume = 0;
        pumps[pump_id].rpm = rpm;
        pumps[pump_id].direction = direction;
        start_pump(pump_id, rpm, direction);
    } else {
        pumps[pump_id].state = PUMP_OFF;
        stop_pump(pump_id);
    }
}

int64_t get_tank_volume(uint8_t pump_id)
{
    return (int64_t)get_pump_config(pump_id)->tank_current_vol;
}

const pumps_status_t *get_pumps_runtime_status(void)
{
    return pumps;
}

static void restore_eeprom_tank_status(void)
{
    tank_status_t tank;
    eeprom_read(0x50, EEPROM_TANK_STATUS_ADDR, (uint8_t *)&tank, sizeof(tank_status_t));
    if (tank.magic == EEPROM_MAGIC) {
        for (int i = 0; i < MAX_PUMP; ++i) {
            get_pump_config(i)->tank_current_vol = tank.tank_current_vol[i];
        }
    }
}

void backup_eeprom_tank_status(void)
{
    tank_status_t tank;
    for (int i = 0; i < MAX_PUMP; ++i) {
        tank.tank_current_vol[i] = get_pump_config(i)->tank_current_vol;
    }
    tank.magic = EEPROM_MAGIC;
    eeprom_write(0x50, EEPROM_TANK_STATUS_ADDR, (uint8_t *)&tank, sizeof(tank_status_t));
}

void vBackupTimerHandler(TimerHandle_t pxTimer)
{
    (void)pxTimer;

    uint32_t day_stamp = current_local_day_stamp();
    if (day_stamp != get_pump_aging_day_stamp()) {
        save_pump_aging_state(day_stamp);
    }
}

void vScheduleTimerHandler(TimerHandle_t pxTimer)
{
    (void)pxTimer;

    time_t now;
    struct tm time_info;
    time(&now);
    localtime_r(&now, &time_info);

    bool continuous_mode[MAX_PUMP] = {false};
    for (uint8_t j = 0; j < MAX_SCHEDULE; ++j) {
        schedule_t *schedule = get_schedule_config(j);
        if (schedule->pump_id < MAX_PUMP && schedule->mode == SCHEDULE_MODE_CONTINUOUS) {
            continuous_mode[schedule->pump_id] = true;
        }
    }

    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        if (pumps[pump_id].state == PUMP_CONTINUOUS && !continuous_mode[pump_id]) {
            pumps[pump_id].state = PUMP_OFF;
            stop_pump(pump_id);
        }
    }

    for (uint8_t j = 0; j < MAX_SCHEDULE; ++j) {
        schedule_t *schedule = get_schedule_config(j);
        if (schedule->pump_id >= MAX_PUMP) {
            continue;
        }

        if (schedule->mode == SCHEDULE_MODE_CONTINUOUS) {
            if (pumps[schedule->pump_id].state == PUMP_OFF) {
                pumps[schedule->pump_id].flow_per_unit =
                    pump_flow_ml_per_min(get_pump_config(schedule->pump_id), schedule->speed) /
                    (double)PUMP_TIMER_UNIT_IN_SEC / 60.0;
                pumps[schedule->pump_id].rpm = schedule->speed;
                pumps[schedule->pump_id].direction = get_pump_config(schedule->pump_id)->direction;
                pumps[schedule->pump_id].volume = 0;
                pumps[schedule->pump_id].state = PUMP_CONTINUOUS;
                if (start_pump(schedule->pump_id, schedule->speed, pumps[schedule->pump_id].direction) != ESP_OK) {
                    pumps[schedule->pump_id].state = PUMP_OFF;
                }
            }
            continue;
        }

        if (schedule->mode != SCHEDULE_MODE_PERIODIC || !schedule->active || pumps[schedule->pump_id].state != PUMP_OFF) {
            continue;
        }

        if (last_run_schedule_hour[j] != (uint32_t)time_info.tm_hour &&
            (schedule->week_days & (1 << time_info.tm_wday)) &&
            (schedule->work_hours & (1 << time_info.tm_hour))) {
            last_run_schedule_hour[j] = time_info.tm_hour;

            double total_work_hours = 0.0;
            for (uint8_t h = 0; h < 24; h++) {
                if (schedule->work_hours & (1 << h)) {
                    total_work_hours++;
                }
            }

            double volume = 0.0;
            if (total_work_hours > 0.0) {
                volume = (double)schedule->day_volume / total_work_hours;
            }

            ESP_LOGD(TAG, "schedule:%d speed:%02f, workH:%f, Dvol:%lu, Hvol:%f",
                     schedule->pump_id, schedule->speed, total_work_hours, schedule->day_volume, volume);

            run_pump_on_volume(schedule->pump_id, volume, schedule->speed);

            eeprom_write(0x50, EEPROM_SCHEDULE_STATUS_ADDR, (uint8_t *)last_run_schedule_hour, sizeof(last_run_schedule_hour));
            eeprom_write_byte(0x50, 0x31, 0x82);
            break;
        }
    }
}

int init_pumps(void)
{
    for (int i = 0; i < MAX_PUMP; ++i) {
        pumps[i].time = 0;
        pumps[i].volume = 0;
        pumps[i].flow_per_unit = 0;
        pumps[i].rpm = 0;
        pumps[i].direction = get_pump_config(i)->direction;
        pumps[i].state = PUMP_OFF;
    }

    if (eeprom_read_byte(0x50, 0x31) == 0x82) {
        eeprom_read(0x50, EEPROM_SCHEDULE_STATUS_ADDR, (uint8_t *)last_run_schedule_hour, sizeof(last_run_schedule_hour));
        for (uint8_t j = 0; j < MAX_SCHEDULE; ++j) {
            ESP_LOGI(TAG, "EEPROM last_run:%d:%lu", j, last_run_schedule_hour[j]);
        }
    } else {
        for (int i = 0; i < MAX_SCHEDULE; ++i) {
            last_run_schedule_hour[i] = 0xff;
        }
    }

    restore_eeprom_tank_status();

    const esp_timer_create_args_t run_timer_args = {
        .callback = &run_timer_callback,
        .name = "run_timer_callback",
    };

    esp_timer_handle_t run_timer;
    ESP_ERROR_CHECK(esp_timer_create(&run_timer_args, &run_timer));
    ESP_ERROR_CHECK(esp_timer_start_periodic(run_timer, 10000));

    xScheduleTimer = xTimerCreate("scheduleTimer", (60 * 1000 / portTICK_PERIOD_MS), pdTRUE, 0, vScheduleTimerHandler);
    CHECK_TIMER(xTimerStart(xScheduleTimer, 100 / portTICK_PERIOD_MS));

    xBackupTimer = xTimerCreate("backupTimer", (1000 / portTICK_PERIOD_MS), pdTRUE, 0, vBackupTimerHandler);
    xTimerStart(xBackupTimer, 100 / portTICK_PERIOD_MS);

    return ESP_OK;
}

esp_err_t pumps_calibration(uint8_t pump_id, uint8_t is_start, uint16_t speed, uint16_t volume)
{
    (void)volume;
    run_pump_calibration(pump_id, is_start != 0, (float)speed, get_pump_config(pump_id)->direction);
    return ESP_OK;
}
