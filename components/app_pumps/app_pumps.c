/***
** Created by Aleksey Volkov on 6.2.2022.
***/

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include <freertos/FreeRTOS.h>
#include <freertos/timers.h>
#include <esp_err.h>
#include <esp_log.h>
#include <esp_timer.h>
#include <nvs.h>

#include "app_events.h"
#include "app_pumps.h"
#include "app_time.h"
#include "app_settings.h"
#include "app_settings_storage.h"

static const char *TAG = "APP_PUMPS";

static TimerHandle_t xBackupTimer;
static TimerHandle_t xScheduleTimer;
static pumps_status_t pumps[MAX_PUMP];
static uint32_t last_run_schedule_hour[MAX_SCHEDULE];
static const app_pumps_backend_t *s_backend;
static bool runtime_event_dirty[MAX_PUMP];
static pump_history_day_t s_today_history[MAX_PUMP];
static bool s_today_history_dirty[MAX_PUMP];
static uint8_t s_today_history_runtime_subticks[MAX_PUMP][APP_PUMP_HISTORY_HOURS];
static double s_today_history_scheduled_volume_accum[MAX_PUMP][APP_PUMP_HISTORY_HOURS];
static double s_today_history_manual_volume_accum[MAX_PUMP][APP_PUMP_HISTORY_HOURS];

#define APP_PUMP_HISTORY_NAMESPACE "pump_hist"
#define APP_PUMP_HISTORY_KEY_LEN 16

uint8_t tank_volume_changed = 0;

static uint32_t current_local_day_stamp(void)
{
    time_t now;
    struct tm time_info;
    time(&now);
    localtime_r(&now, &time_info);
    return (uint32_t)((time_info.tm_year + 1900) * 1000 + time_info.tm_yday);
}

static uint8_t current_local_hour(void)
{
    time_t now;
    struct tm time_info;
    time(&now);
    localtime_r(&now, &time_info);
    return (uint8_t)time_info.tm_hour;
}

static uint8_t history_day_slot_index(uint32_t day_stamp)
{
    return (uint8_t)(day_stamp % APP_PUMP_HISTORY_RETAINED_DAYS);
}

static void history_make_key(uint8_t pump_id, uint32_t day_stamp, char *key, size_t key_size)
{
    snprintf(key, key_size, "HIS_P%u_D%02u", (unsigned)(pump_id + 1U), (unsigned)history_day_slot_index(day_stamp));
}

static void history_reset_day(pump_history_day_t *day, uint32_t day_stamp)
{
    memset(day, 0, sizeof(*day));
    day->day_stamp = day_stamp;
}

static esp_err_t history_load_day_blob(uint8_t pump_id, uint32_t day_stamp, pump_history_day_t *out_day)
{
    char key[APP_PUMP_HISTORY_KEY_LEN];
    history_make_key(pump_id, day_stamp, key, sizeof(key));

    nvs_handle_t handle;
    esp_err_t err = nvs_open(APP_PUMP_HISTORY_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        return err;
    }

    size_t required_size = sizeof(*out_day);
    err = nvs_get_blob(handle, key, out_day, &required_size);
    nvs_close(handle);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        return err;
    }

    if (err == ESP_OK && required_size != sizeof(*out_day)) {
        return ESP_ERR_NVS_INVALID_LENGTH;
    }

    if (err == ESP_OK && out_day->day_stamp != day_stamp) {
        return ESP_ERR_NVS_NOT_FOUND;
    }

    return err;
}

static esp_err_t history_save_day_blob(uint8_t pump_id, const pump_history_day_t *day)
{
    char key[APP_PUMP_HISTORY_KEY_LEN];
    history_make_key(pump_id, day->day_stamp, key, sizeof(key));

    nvs_handle_t handle;
    esp_err_t err = nvs_open(APP_PUMP_HISTORY_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        return err;
    }

    err = nvs_set_blob(handle, key, day, sizeof(*day));
    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }
    nvs_close(handle);
    return err;
}

static uint8_t history_flag_for_source(pump_history_source_t source)
{
    switch (source) {
        case PUMP_HISTORY_SOURCE_SCHEDULED:
            return PUMP_HISTORY_FLAG_SCHEDULED;
        case PUMP_HISTORY_SOURCE_MANUAL:
            return PUMP_HISTORY_FLAG_MANUAL;
        case PUMP_HISTORY_SOURCE_CONTINUOUS:
            return PUMP_HISTORY_FLAG_CONTINUOUS | PUMP_HISTORY_FLAG_SCHEDULED;
        case PUMP_HISTORY_SOURCE_CALIBRATION:
            return PUMP_HISTORY_FLAG_CALIBRATION;
        case PUMP_HISTORY_SOURCE_NONE:
        default:
            return 0;
    }
}

static bool history_source_is_scheduled(pump_history_source_t source)
{
    return source == PUMP_HISTORY_SOURCE_SCHEDULED || source == PUMP_HISTORY_SOURCE_CONTINUOUS;
}

static void history_rollover_if_needed(void)
{
    const uint32_t day_stamp = current_local_day_stamp();

    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        if (s_today_history[pump_id].day_stamp == 0) {
            history_reset_day(&s_today_history[pump_id], day_stamp);
            continue;
        }

        if (s_today_history[pump_id].day_stamp != day_stamp) {
            if (s_today_history_dirty[pump_id]) {
                ESP_LOGW(TAG, "dropping unsaved history day %lu for pump %u during rollover",
                         (unsigned long)s_today_history[pump_id].day_stamp,
                         (unsigned)pump_id);
            }
            history_reset_day(&s_today_history[pump_id], day_stamp);
            s_today_history_dirty[pump_id] = false;
            memset(s_today_history_runtime_subticks[pump_id], 0, sizeof(s_today_history_runtime_subticks[pump_id]));
            memset(s_today_history_scheduled_volume_accum[pump_id], 0, sizeof(s_today_history_scheduled_volume_accum[pump_id]));
            memset(s_today_history_manual_volume_accum[pump_id], 0, sizeof(s_today_history_manual_volume_accum[pump_id]));
        }
    }
}

static void history_restore_today_from_backup(void)
{
    const uint32_t day_stamp = current_local_day_stamp();

    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        history_reset_day(&s_today_history[pump_id], day_stamp);
        s_today_history_dirty[pump_id] = false;
        memset(s_today_history_runtime_subticks[pump_id], 0, sizeof(s_today_history_runtime_subticks[pump_id]));
        memset(s_today_history_scheduled_volume_accum[pump_id], 0, sizeof(s_today_history_scheduled_volume_accum[pump_id]));
        memset(s_today_history_manual_volume_accum[pump_id], 0, sizeof(s_today_history_manual_volume_accum[pump_id]));

        pump_history_day_t persisted_day = {0};
        if (history_load_day_blob(pump_id, day_stamp, &persisted_day) == ESP_OK) {
            s_today_history[pump_id] = persisted_day;
            for (uint8_t hour = 0; hour < APP_PUMP_HISTORY_HOURS; ++hour) {
                s_today_history_scheduled_volume_accum[pump_id][hour] = persisted_day.hours[hour].scheduled_volume_ml;
                s_today_history_manual_volume_accum[pump_id][hour] = persisted_day.hours[hour].manual_volume_ml;
            }
            ESP_LOGI(TAG, "restored history for pump %u day %lu", (unsigned)pump_id, (unsigned long)day_stamp);
        }
    }
}

static void history_record_activity(uint8_t pump_id, pump_history_source_t source, double volume_delta_ml, bool runtime_tick)
{
    if (pump_id >= MAX_PUMP || source == PUMP_HISTORY_SOURCE_NONE) {
        return;
    }

    history_rollover_if_needed();

    const uint8_t hour = current_local_hour();
    pump_history_hour_t *hour_slot = &s_today_history[pump_id].hours[hour];
    hour_slot->flags |= history_flag_for_source(source);

    if (volume_delta_ml > 0.0) {
        if (history_source_is_scheduled(source)) {
            double next = s_today_history_scheduled_volume_accum[pump_id][hour] + volume_delta_ml;
            if (next > (double)UINT16_MAX) {
                next = (double)UINT16_MAX;
            }
            s_today_history_scheduled_volume_accum[pump_id][hour] = next;
            hour_slot->scheduled_volume_ml = (uint16_t)lround(next);
        } else {
            double next = s_today_history_manual_volume_accum[pump_id][hour] + volume_delta_ml;
            if (next > (double)UINT16_MAX) {
                next = (double)UINT16_MAX;
            }
            s_today_history_manual_volume_accum[pump_id][hour] = next;
            hour_slot->manual_volume_ml = (uint16_t)lround(next);
        }
    }

    if (runtime_tick) {
        uint8_t *subticks = &s_today_history_runtime_subticks[pump_id][hour];
        if (*subticks < (PUMP_TIMER_UNIT_IN_SEC - 1U)) {
            (*subticks)++;
        } else {
            *subticks = 0;
            uint32_t next_runtime = hour_slot->total_runtime_s + 1U;
            hour_slot->total_runtime_s = next_runtime > UINT16_MAX ? UINT16_MAX : (uint16_t)next_runtime;
        }
    }

    s_today_history_dirty[pump_id] = true;
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
            history_record_activity(pump_id, pumps[pump_id].history_source, pumps[pump_id].flow_per_unit, true);
            tank_volume_changed = 1;

            if (pumps[pump_id].time == 0) {
                pumps[pump_id].state = PUMP_OFF;
                pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
                stop_pump(pump_id);
            }
            mark_pump_runtime_dirty(pump_id);
        } else if (pumps[pump_id].state == PUMP_CONTINUOUS) {
            pumps[pump_id].volume += pumps[pump_id].flow_per_unit;
            pump_config->tank_current_vol = clamp_positive(pump_config->tank_current_vol - pumps[pump_id].flow_per_unit);
            pump_config->running_hours += 1.0f / (float)(PUMP_TIMER_UNIT_IN_SEC * 3600.0f);
            history_record_activity(pump_id, pumps[pump_id].history_source, pumps[pump_id].flow_per_unit, true);
            tank_volume_changed = 1;
            mark_pump_runtime_dirty(pump_id);
        } else if (pumps[pump_id].state == PUMP_CAL) {
            pumps[pump_id].time++;
            history_record_activity(pump_id, pumps[pump_id].history_source, 0.0, true);
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
            pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
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
                pumps[schedule->pump_id].history_source = PUMP_HISTORY_SOURCE_CONTINUOUS;
                pumps[schedule->pump_id].state = PUMP_CONTINUOUS;
                if (start_pump(schedule->pump_id, schedule->speed, pumps[schedule->pump_id].direction) != ESP_OK) {
                    pumps[schedule->pump_id].state = PUMP_OFF;
                    pumps[schedule->pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
                }
                mark_pump_runtime_dirty(schedule->pump_id);
            }
            continue;
        }

        if (schedule->mode != SCHEDULE_MODE_PERIODIC || !schedule->active || pumps[schedule->pump_id].state != PUMP_OFF) {
            continue;
        }

        if (!app_time_is_valid()) {
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
            pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_MANUAL;
            pumps[pump_id].state = PUMP_ON;
    if (start_pump(pump_id, (float)speed, pumps[pump_id].direction) != ESP_OK) {
        pumps[pump_id].state = PUMP_OFF;
        pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
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
    pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_SCHEDULED;
    pumps[pump_id].state = PUMP_ON;

    ESP_LOGI(TAG, "run pump:%u volume=%.2f speed=%.2f runtime=%.2fs",
             (unsigned)pump_id,
             volume_ml,
             rpm,
             run_time_seconds);

    if (start_pump(pump_id, rpm, pumps[pump_id].direction) != ESP_OK) {
        pumps[pump_id].state = PUMP_OFF;
        pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
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
        pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
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
    pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_MANUAL;
    pumps[pump_id].state = PUMP_ON;
    esp_err_t err = start_pump(pump_id, rpm, direction);
    if (err != ESP_OK) {
        pumps[pump_id].state = PUMP_OFF;
        pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
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
        pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_CALIBRATION;
        if (start_pump(pump_id, rpm, direction) != ESP_OK) {
            pumps[pump_id].state = PUMP_OFF;
            pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
        }
        mark_pump_runtime_dirty(pump_id);
    } else {
        pumps[pump_id].state = PUMP_OFF;
        pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
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
        pumps[i].history_source = PUMP_HISTORY_SOURCE_NONE;
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
    history_restore_today_from_backup();

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

uint32_t app_pumps_history_get_current_day_stamp(void)
{
    history_rollover_if_needed();
    return current_local_day_stamp();
}

bool app_pumps_history_get_today(uint8_t pump_id, pump_history_day_t *out_day)
{
    if (pump_id >= MAX_PUMP || out_day == NULL) {
        return false;
    }

    history_rollover_if_needed();
    *out_day = s_today_history[pump_id];
    return out_day->day_stamp != 0;
}

bool app_pumps_history_get_day(uint8_t pump_id, uint32_t day_stamp, pump_history_day_t *out_day)
{
    if (pump_id >= MAX_PUMP || out_day == NULL || day_stamp == 0) {
        return false;
    }

    history_rollover_if_needed();
    if (s_today_history[pump_id].day_stamp == day_stamp) {
        *out_day = s_today_history[pump_id];
        return true;
    }

    return history_load_day_blob(pump_id, day_stamp, out_day) == ESP_OK;
}

esp_err_t app_pumps_history_backup(size_t *written_days)
{
    history_rollover_if_needed();

    size_t written = 0;
    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        if (!s_today_history_dirty[pump_id] || s_today_history[pump_id].day_stamp == 0) {
            continue;
        }

        esp_err_t err = history_save_day_blob(pump_id, &s_today_history[pump_id]);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "failed to save history for pump %u day %lu: %s",
                     (unsigned)pump_id,
                     (unsigned long)s_today_history[pump_id].day_stamp,
                     esp_err_to_name(err));
            if (written_days != NULL) {
                *written_days = written;
            }
            return err;
        }

        s_today_history_dirty[pump_id] = false;
        written++;
    }

    if (written_days != NULL) {
        *written_days = written;
    }

    return ESP_OK;
}
