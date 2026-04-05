/***
** Created by Aleksey Volkov on 6.2.2022.
***/

#include <math.h>
#include <stdlib.h>
#include <time.h>

#include <freertos/FreeRTOS.h>
#include <freertos/timers.h>
#include <esp_err.h>
#include <esp_log.h>
#include <esp_timer.h>

#include "app_events.h"
#include "app_pumps.h"
#include "app_settings.h"
#include "app_settings_storage.h"

static const char *TAG = "APP_PUMPS";

static TimerHandle_t xBackupTimer;
static TimerHandle_t xScheduleTimer;
static pumps_status_t pumps[MAX_PUMP];
static uint32_t last_run_schedule_hour[MAX_SCHEDULE];
static const app_pumps_backend_t *s_backend;
static bool runtime_event_dirty[MAX_PUMP];

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

static esp_err_t start_pump(uint8_t pump_id, float speed, bool direction)
{
    if (s_backend == NULL || s_backend->start == NULL) {
        ESP_LOGE(TAG, "pump backend is not registered");
        return ESP_ERR_INVALID_STATE;
    }

    ESP_LOGI(TAG, "backend=%s start pump:%u speed=%.2f dir=%u",
             s_backend->name != NULL ? s_backend->name : "unknown",
             (unsigned)pump_id,
             speed,
             direction);
    return s_backend->start(pump_id, speed, direction, -1);
}

static void stop_pump(uint8_t pump_id)
{
    if (s_backend == NULL || s_backend->stop == NULL) {
        ESP_LOGW(TAG, "pump backend is not registered");
        return;
    }

    ESP_LOGI(TAG, "backend=%s stop pump:%u",
             s_backend->name != NULL ? s_backend->name : "unknown",
             (unsigned)pump_id);
    s_backend->stop(pump_id);
}

static void dispatch_pump_runtime_event(uint8_t pump_id)
{
    if (pump_id >= MAX_PUMP) {
        return;
    }

    pump_runtime_event_t event = {
        .pump_id = pump_id,
        .time = pumps[pump_id].time,
        .volume = pumps[pump_id].volume,
        .flow_per_unit = pumps[pump_id].flow_per_unit,
        .rpm = pumps[pump_id].rpm,
        .direction = pumps[pump_id].direction,
        .state = pumps[pump_id].state,
    };

    app_events_dispatch_system(PUMP_RUNTIME_DATA, &event, sizeof(event));
}

static void mark_pump_runtime_dirty(uint8_t pump_id)
{
    if (pump_id >= MAX_PUMP) {
        return;
    }

    runtime_event_dirty[pump_id] = true;
}

static void runtime_event_flush_callback(void *arg)
{
    (void)arg;

    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        if (!runtime_event_dirty[pump_id]) {
            continue;
        }

        runtime_event_dirty[pump_id] = false;
        dispatch_pump_runtime_event(pump_id);
    }
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
            mark_pump_runtime_dirty(pump_id);
        } else if (pumps[pump_id].state == PUMP_CONTINUOUS) {
            pumps[pump_id].volume += pumps[pump_id].flow_per_unit;
            pump_config->tank_current_vol = clamp_positive(pump_config->tank_current_vol - pumps[pump_id].flow_per_unit);
            pump_config->running_hours += 1.0f / (float)(PUMP_TIMER_UNIT_IN_SEC * 3600.0f);
            tank_volume_changed = 1;
            mark_pump_runtime_dirty(pump_id);
        } else if (pumps[pump_id].state == PUMP_CAL) {
            pumps[pump_id].time++;
            mark_pump_runtime_dirty(pump_id);
        }
    }
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

static void vBackupTimerHandler(TimerHandle_t pxTimer)
{
    (void)pxTimer;

    uint32_t day_stamp = current_local_day_stamp();
    if (day_stamp != get_pump_aging_day_stamp()) {
        save_pump_aging_state(day_stamp);
    }
}

static void vScheduleTimerHandler(TimerHandle_t pxTimer)
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
            mark_pump_runtime_dirty(pump_id);
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
                mark_pump_runtime_dirty(schedule->pump_id);
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

esp_err_t app_pumps_register_backend(const app_pumps_backend_t *backend)
{
    if (backend == NULL || backend->start == NULL || backend->stop == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    s_backend = backend;
    ESP_LOGI(TAG, "registered pump backend: %s", backend->name != NULL ? backend->name : "unknown");
    return ESP_OK;
}

const app_pumps_backend_t *app_pumps_get_backend(void)
{
    return s_backend;
}

int64_t get_tank_volume(uint8_t pump_id)
{
    return (int64_t)get_pump_config(pump_id)->tank_current_vol;
}

const pumps_status_t *get_pumps_runtime_status(void)
{
    return pumps;
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
    if (start_pump(pump_id, (float)speed, pumps[pump_id].direction) != ESP_OK) {
        pumps[pump_id].state = PUMP_OFF;
    }
    mark_pump_runtime_dirty(pump_id);
}

void run_pump_on_volume(uint8_t pump_id, double volume_ml, float rpm)
{
    if (pump_id >= MAX_PUMP) {
        return;
    }

    pump_t *pump_config = get_pump_config(pump_id);
    double flow_ml_per_min = pump_flow_ml_per_min(pump_config, rpm);
    if (flow_ml_per_min <= 0.0) {
        ESP_LOGE(TAG, "pump calibration not set for pump %u at %.2f speed", (unsigned)pump_id, rpm);
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

    ESP_LOGI(TAG, "run pump:%u volume=%.2f speed=%.2f runtime=%.2fs",
             (unsigned)pump_id,
             volume_ml,
             rpm,
             run_time_seconds);

    if (start_pump(pump_id, rpm, pumps[pump_id].direction) != ESP_OK) {
        pumps[pump_id].state = PUMP_OFF;
    }
    mark_pump_runtime_dirty(pump_id);
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
        mark_pump_runtime_dirty(pump_id);
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
    esp_err_t err = start_pump(pump_id, rpm, direction);
    if (err != ESP_OK) {
        pumps[pump_id].state = PUMP_OFF;
    }
    mark_pump_runtime_dirty(pump_id);
    return err;
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
        if (start_pump(pump_id, rpm, direction) != ESP_OK) {
            pumps[pump_id].state = PUMP_OFF;
        }
        mark_pump_runtime_dirty(pump_id);
    } else {
        pumps[pump_id].state = PUMP_OFF;
        stop_pump(pump_id);
        mark_pump_runtime_dirty(pump_id);
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

int init_pumps(void)
{
    if (s_backend == NULL) {
        ESP_LOGE(TAG, "pump backend must be registered before init_pumps()");
        return ESP_ERR_INVALID_STATE;
    }

    for (int i = 0; i < MAX_PUMP; ++i) {
        pumps[i].time = 0;
        pumps[i].volume = 0;
        pumps[i].flow_per_unit = 0;
        pumps[i].rpm = 0;
        pumps[i].direction = get_pump_config(i)->direction;
        pumps[i].state = PUMP_OFF;
        runtime_event_dirty[i] = false;
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
    const esp_timer_create_args_t runtime_event_timer_args = {
        .callback = &runtime_event_flush_callback,
        .name = "pump_runtime_event_flush",
    };

    esp_timer_handle_t run_timer;
    esp_timer_handle_t runtime_event_timer;
    ESP_ERROR_CHECK(esp_timer_create(&run_timer_args, &run_timer));
    ESP_ERROR_CHECK(esp_timer_start_periodic(run_timer, 10000));
    ESP_ERROR_CHECK(esp_timer_create(&runtime_event_timer_args, &runtime_event_timer));
    ESP_ERROR_CHECK(esp_timer_start_periodic(runtime_event_timer, 500000));

    xScheduleTimer = xTimerCreate("scheduleTimer", (60 * 1000 / portTICK_PERIOD_MS), pdTRUE, 0, vScheduleTimerHandler);
    if (xScheduleTimer == NULL || xTimerStart(xScheduleTimer, 100 / portTICK_PERIOD_MS) != pdPASS) {
        return ESP_FAIL;
    }

    xBackupTimer = xTimerCreate("backupTimer", (1000 / portTICK_PERIOD_MS), pdTRUE, 0, vBackupTimerHandler);
    if (xBackupTimer == NULL || xTimerStart(xBackupTimer, 100 / portTICK_PERIOD_MS) != pdPASS) {
        return ESP_FAIL;
    }

    return ESP_OK;
}
