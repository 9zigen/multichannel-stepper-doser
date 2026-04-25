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

#include "app_events.h"
#include "app_pumps.h"
#include "app_pumps_priv.h"
#include "app_time.h"
#include "app_settings.h"

static const char *TAG = "APP_PUMPS";

static TimerHandle_t xBackupTimer;
static TimerHandle_t xScheduleTimer;
static pumps_status_t pumps[MAX_PUMP];
static uint32_t last_run_schedule_hour[MAX_SCHEDULE];
static const app_pumps_backend_t *s_backend;
static bool runtime_event_dirty[MAX_PUMP];
static bool s_tank_volume_dirty;
static uint32_t s_tank_backup_elapsed_seconds;
static void mark_pump_runtime_dirty(uint8_t pump_id);

#define PUMP_ALERT_DRIVER_MASK (PUMP_ALERT_DRIVER_RESET | \
                                PUMP_ALERT_DRIVER_ERROR | \
                                PUMP_ALERT_DRIVER_UNDERVOLTAGE | \
                                PUMP_ALERT_DRIVER_OTPW | \
                                PUMP_ALERT_DRIVER_OT | \
                                PUMP_ALERT_DRIVER_SHORT | \
                                PUMP_ALERT_DRIVER_OPEN_LOAD | \
                                PUMP_ALERT_DRIVER_UART)

#define PUMP_ALERT_SAFETY_MASK (PUMP_ALERT_NO_CALIBRATION | \
                                PUMP_ALERT_LIMIT_SINGLE_RUN_SECONDS | \
                                PUMP_ALERT_LIMIT_SINGLE_RUN_VOLUME | \
                                PUMP_ALERT_LIMIT_HOURLY_VOLUME | \
                                PUMP_ALERT_LIMIT_DAILY_VOLUME | \
                                PUMP_ALERT_LIMIT_GLOBAL_DAILY_VOLUME)

#define APP_PUMPS_TANK_BACKUP_EEPROM_INTERVAL_S 1U
#define APP_PUMPS_TANK_BACKUP_NVS_INTERVAL_S 30U

uint32_t app_pumps_current_local_day_stamp(void)
{
    time_t now;
    struct tm time_info;
    time(&now);
    localtime_r(&now, &time_info);
    return (uint32_t)((time_info.tm_year + 1900) * 1000 + time_info.tm_yday);
}

uint8_t app_pumps_current_local_hour(void)
{
    time_t now;
    struct tm time_info;
    time(&now);
    localtime_r(&now, &time_info);
    return (uint8_t)time_info.tm_hour;
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
        return 0.0;
    }

    if (pump_config->calibration_count == 1) {
        return pump_config->calibration[0].flow > 0.0f ? pump_config->calibration[0].flow : 0.0;
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
                return right_flow > 0.0 ? right_flow : 0.0;
            }

            double ratio = ((double)rpm - left_speed) / (right_speed - left_speed);
            return left_flow + ((right_flow - left_flow) * ratio);
        }
    }

    return points[pump_config->calibration_count - 1].flow;
}

static bool pump_has_valid_calibration(const pump_t *pump_config)
{
    if (pump_config == NULL || pump_config->calibration_count == 0) {
        return false;
    }

    for (uint8_t i = 0; i < pump_config->calibration_count; ++i) {
        if (pump_config->calibration[i].speed > 0.0f &&
            pump_config->calibration[i].flow > 0.0f) {
            return true;
        }
    }

    return false;
}

static double projected_volume_ml(double flow_ml_per_min, int32_t time_seconds)
{
    if (flow_ml_per_min <= 0.0 || time_seconds <= 0) {
        return 0.0;
    }

    return (flow_ml_per_min * (double)time_seconds) / 60.0;
}

static void set_pump_alert_flags(uint8_t pump_id, uint32_t mask, bool enabled)
{
    if (pump_id >= MAX_PUMP || mask == 0) {
        return;
    }

    uint32_t before = pumps[pump_id].alert_flags;
    if (enabled) {
        pumps[pump_id].alert_flags |= mask;
    } else {
        pumps[pump_id].alert_flags &= ~mask;
    }

    if (before != pumps[pump_id].alert_flags) {
        mark_pump_runtime_dirty(pump_id);
    }
}

static void clear_pump_runtime_safety_alerts(uint8_t pump_id)
{
    set_pump_alert_flags(pump_id, PUMP_ALERT_SAFETY_MASK, false);
}

static uint32_t current_runtime_limit_flags(uint8_t pump_id)
{
    if (pump_id >= MAX_PUMP) {
        return PUMP_ALERT_NONE;
    }

    pump_t *pump_config = get_pump_config(pump_id);
    services_t *services = get_service_config();
    uint32_t flags = PUMP_ALERT_NONE;

    if (pump_config->safety.max_single_run_seconds > 0 &&
        pumps[pump_id].state != PUMP_CAL) {
        uint32_t elapsed_seconds = pumps[pump_id].run_ticks / PUMP_TIMER_UNIT_IN_SEC;
        if (elapsed_seconds >= pump_config->safety.max_single_run_seconds) {
            flags |= PUMP_ALERT_LIMIT_SINGLE_RUN_SECONDS;
        }
    }

    if (pump_config->safety.max_single_run_ml > 0 &&
        pumps[pump_id].volume >= (double)pump_config->safety.max_single_run_ml) {
        flags |= PUMP_ALERT_LIMIT_SINGLE_RUN_VOLUME;
    }

    const uint8_t hour = app_pumps_current_local_hour();
    if (pump_config->safety.max_hourly_ml > 0 &&
        app_pumps_history_get_pump_hour_volume_ml(pump_id, hour) >= (double)pump_config->safety.max_hourly_ml) {
        flags |= PUMP_ALERT_LIMIT_HOURLY_VOLUME;
    }

    if (pump_config->safety.max_daily_ml > 0 &&
        app_pumps_history_get_pump_day_volume_ml(pump_id) >= (double)pump_config->safety.max_daily_ml) {
        flags |= PUMP_ALERT_LIMIT_DAILY_VOLUME;
    }

    if (services->max_total_daily_ml > 0 &&
        app_pumps_history_get_total_day_volume_ml() >= (double)services->max_total_daily_ml) {
        flags |= PUMP_ALERT_LIMIT_GLOBAL_DAILY_VOLUME;
    }

    return flags;
}

static esp_err_t validate_run_request(uint8_t pump_id, float rpm, int32_t time_seconds, bool require_calibration,
                                      char *error, size_t error_size)
{
    if (error != NULL && error_size > 0) {
        error[0] = '\0';
    }

    if (pump_id >= MAX_PUMP || rpm <= 0.0f || time_seconds <= 0) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "Invalid pump run request");
        }
        return ESP_ERR_INVALID_ARG;
    }

    pump_t *pump_config = get_pump_config(pump_id);
    services_t *services = get_service_config();
    const bool needs_flow = require_calibration ||
                            pump_config->safety.max_single_run_ml > 0 ||
                            pump_config->safety.max_hourly_ml > 0 ||
                            pump_config->safety.max_daily_ml > 0 ||
                            services->max_total_daily_ml > 0;
    const bool has_calibration = pump_has_valid_calibration(pump_config);
    const double flow_ml_per_min = pump_flow_ml_per_min(pump_config, rpm);

    if (needs_flow && (!has_calibration || flow_ml_per_min <= 0.0)) {
        set_pump_alert_flags(pump_id, PUMP_ALERT_NO_CALIBRATION, true);
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "Pump calibration is required for this operation");
        }
        return ESP_ERR_INVALID_STATE;
    }

    const double projected_ml = projected_volume_ml(flow_ml_per_min, time_seconds);
    const uint8_t hour = app_pumps_current_local_hour();
    if (pump_config->safety.max_single_run_seconds > 0 &&
        (uint32_t)time_seconds > pump_config->safety.max_single_run_seconds) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "Run exceeds max_single_run_seconds");
        }
        return ESP_ERR_INVALID_ARG;
    }

    if (pump_config->safety.max_single_run_ml > 0 &&
        projected_ml > (double)pump_config->safety.max_single_run_ml) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "Run exceeds max_single_run_ml");
        }
        return ESP_ERR_INVALID_ARG;
    }

    if (pump_config->safety.max_hourly_ml > 0 &&
        app_pumps_history_get_pump_hour_volume_ml(pump_id, hour) + projected_ml >
            (double)pump_config->safety.max_hourly_ml) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "Run exceeds max_hourly_ml");
        }
        return ESP_ERR_INVALID_ARG;
    }

    if (pump_config->safety.max_daily_ml > 0 &&
        app_pumps_history_get_pump_day_volume_ml(pump_id) + projected_ml >
            (double)pump_config->safety.max_daily_ml) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "Run exceeds max_daily_ml");
        }
        return ESP_ERR_INVALID_ARG;
    }

    if (services->max_total_daily_ml > 0 &&
        app_pumps_history_get_total_day_volume_ml() + projected_ml >
            (double)services->max_total_daily_ml) {
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "Run exceeds max_total_daily_ml");
        }
        return ESP_ERR_INVALID_ARG;
    }

    clear_pump_runtime_safety_alerts(pump_id);
    return ESP_OK;
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
        .alert_flags = pumps[pump_id].alert_flags,
        .driver_status = pumps[pump_id].driver_status,
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
            pumps[pump_id].run_ticks++;
            pumps[pump_id].volume += pumps[pump_id].flow_per_unit;
            pumps[pump_id].time--;
            pump_config->tank_current_vol = clamp_positive(pump_config->tank_current_vol - pumps[pump_id].flow_per_unit);
            pump_config->running_hours += 1.0f / (float)(PUMP_TIMER_UNIT_IN_SEC * 3600.0f);
            app_pumps_history_record_activity(pump_id, pumps[pump_id].history_source, pumps[pump_id].flow_per_unit, true);
            s_tank_volume_dirty = true;

            uint32_t limit_flags = current_runtime_limit_flags(pump_id);
            if (limit_flags != PUMP_ALERT_NONE) {
                pumps[pump_id].state = PUMP_OFF;
                pumps[pump_id].time = 0;
                pumps[pump_id].run_ticks = 0;
                pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
                set_pump_alert_flags(pump_id, limit_flags, true);
                stop_pump(pump_id);
            }

            if (pumps[pump_id].time == 0) {
                pumps[pump_id].state = PUMP_OFF;
                pumps[pump_id].run_ticks = 0;
                pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
                stop_pump(pump_id);
            }
            mark_pump_runtime_dirty(pump_id);
        } else if (pumps[pump_id].state == PUMP_CONTINUOUS) {
            pumps[pump_id].run_ticks++;
            pumps[pump_id].volume += pumps[pump_id].flow_per_unit;
            pump_config->tank_current_vol = clamp_positive(pump_config->tank_current_vol - pumps[pump_id].flow_per_unit);
            pump_config->running_hours += 1.0f / (float)(PUMP_TIMER_UNIT_IN_SEC * 3600.0f);
            app_pumps_history_record_activity(pump_id, pumps[pump_id].history_source, pumps[pump_id].flow_per_unit, true);
            s_tank_volume_dirty = true;

            uint32_t limit_flags = current_runtime_limit_flags(pump_id);
            if (limit_flags != PUMP_ALERT_NONE) {
                pumps[pump_id].state = PUMP_OFF;
                pumps[pump_id].time = 0;
                pumps[pump_id].run_ticks = 0;
                pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
                set_pump_alert_flags(pump_id, limit_flags, true);
                stop_pump(pump_id);
            }
            mark_pump_runtime_dirty(pump_id);
        } else if (pumps[pump_id].state == PUMP_CAL) {
            pumps[pump_id].run_ticks++;
            pumps[pump_id].time++;
            app_pumps_history_record_activity(pump_id, pumps[pump_id].history_source, 0.0, true);
            mark_pump_runtime_dirty(pump_id);
        }
    }
}

static void vBackupTimerHandler(TimerHandle_t pxTimer)
{
    (void)pxTimer;

    uint32_t day_stamp = app_pumps_current_local_day_stamp();
    if (day_stamp != get_pump_aging_day_stamp()) {
        save_pump_aging_state(day_stamp);
    }

    if (!s_tank_volume_dirty) {
        s_tank_backup_elapsed_seconds = 0;
        return;
    }

    s_tank_backup_elapsed_seconds++;
    const uint32_t interval_s = app_pumps_storage_using_flash_fallback()
                                    ? APP_PUMPS_TANK_BACKUP_NVS_INTERVAL_S
                                    : APP_PUMPS_TANK_BACKUP_EEPROM_INTERVAL_S;
    if (s_tank_backup_elapsed_seconds < interval_s) {
        return;
    }

    if (app_pumps_storage_backup_tank_status() == ESP_OK) {
        s_tank_volume_dirty = false;
        s_tank_backup_elapsed_seconds = 0;
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
            pumps[pump_id].run_ticks = 0;
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
                pumps[schedule->pump_id].run_ticks = 0;
                pumps[schedule->pump_id].volume = 0;
                pumps[schedule->pump_id].history_source = PUMP_HISTORY_SOURCE_CONTINUOUS;
                pumps[schedule->pump_id].state = PUMP_CONTINUOUS;
                clear_pump_runtime_safety_alerts(schedule->pump_id);
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

            char schedule_error[96];
            esp_err_t validation = app_pumps_validate_periodic_schedule(schedule->pump_id, schedule->speed,
                                                                        schedule->day_volume,
                                                                        schedule_error,
                                                                        sizeof(schedule_error));
            if (validation != ESP_OK) {
                ESP_LOGW(TAG, "Skipping scheduled run for pump %u: %s",
                         (unsigned)schedule->pump_id,
                         schedule_error[0] != '\0' ? schedule_error : esp_err_to_name(validation));
                continue;
            }

            run_pump_on_volume(schedule->pump_id, volume, schedule->speed);

            app_pumps_storage_save_schedule_state(last_run_schedule_hour);
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

double app_pumps_estimate_flow_ml_per_min(uint8_t pump_id, float rpm)
{
    if (pump_id >= MAX_PUMP) {
        return 0.0;
    }

    return pump_flow_ml_per_min(get_pump_config(pump_id), rpm);
}

bool app_pumps_has_calibration(uint8_t pump_id)
{
    if (pump_id >= MAX_PUMP) {
        return false;
    }

    return pump_has_valid_calibration(get_pump_config(pump_id));
}

esp_err_t app_pumps_validate_periodic_schedule(uint8_t pump_id, float rpm, uint32_t day_volume_ml,
                                               char *error, size_t error_size)
{
    if (day_volume_ml == 0) {
        if (error != NULL && error_size > 0) {
            error[0] = '\0';
        }
        return ESP_OK;
    }

    if (!app_pumps_has_calibration(pump_id) || app_pumps_estimate_flow_ml_per_min(pump_id, rpm) <= 0.0) {
        set_pump_alert_flags(pump_id, PUMP_ALERT_NO_CALIBRATION, true);
        if (error != NULL && error_size > 0) {
            snprintf(error, error_size, "Periodic dosing requires calibration data");
        }
        return ESP_ERR_INVALID_STATE;
    }

    clear_pump_runtime_safety_alerts(pump_id);
    return ESP_OK;
}

esp_err_t app_pumps_validate_manual_run(uint8_t pump_id, float rpm, int32_t time_seconds,
                                        char *error, size_t error_size)
{
    return validate_run_request(pump_id, rpm, time_seconds, false, error, error_size);
}

void app_pumps_set_driver_status(uint8_t pump_id, const pump_driver_status_t *status)
{
    if (pump_id >= MAX_PUMP || status == NULL) {
        return;
    }

    if (memcmp(&pumps[pump_id].driver_status, status, sizeof(*status)) != 0) {
        pumps[pump_id].driver_status = *status;
        mark_pump_runtime_dirty(pump_id);
    }

    uint32_t driver_flags = PUMP_ALERT_NONE;
    if (!status->uart_ready) {
        driver_flags |= PUMP_ALERT_DRIVER_UART;
    }
    if (status->reset) {
        driver_flags |= PUMP_ALERT_DRIVER_RESET;
    }
    if (status->driver_error) {
        driver_flags |= PUMP_ALERT_DRIVER_ERROR;
    }
    if (status->undervoltage) {
        driver_flags |= PUMP_ALERT_DRIVER_UNDERVOLTAGE;
    }
    if (status->otpw) {
        driver_flags |= PUMP_ALERT_DRIVER_OTPW;
    }
    if (status->ot) {
        driver_flags |= PUMP_ALERT_DRIVER_OT;
    }
    if (status->s2ga || status->s2gb || status->s2vsa || status->s2vsb) {
        driver_flags |= PUMP_ALERT_DRIVER_SHORT;
    }
    if (status->ola || status->olb) {
        driver_flags |= PUMP_ALERT_DRIVER_OPEN_LOAD;
    }

    uint32_t before = pumps[pump_id].alert_flags;
    pumps[pump_id].alert_flags = (pumps[pump_id].alert_flags & ~PUMP_ALERT_DRIVER_MASK) | driver_flags;
    if (before != pumps[pump_id].alert_flags) {
        mark_pump_runtime_dirty(pump_id);
    }
}

void run_pump_with_timeout(uint8_t pump_id, uint32_t timeout_ms, uint8_t speed)
{
    if (pump_id >= MAX_PUMP || speed == 0) {
        return;
    }

    ESP_LOGI(TAG, "run_pump_with_timeout: pump_id=%u, timeout_ms=%u, speed=%u", pump_id, timeout_ms, speed);

    pump_t *pump_config = get_pump_config(pump_id);
    double flow_ml_per_min = pump_flow_ml_per_min(pump_config, (float)speed);
    if (flow_ml_per_min <= 0.0) {
        return;
    }

    clear_pump_runtime_safety_alerts(pump_id);
    pumps[pump_id].time = (uint32_t)llround(((double)timeout_ms / 1000.0) * PUMP_TIMER_UNIT_IN_SEC);
    pumps[pump_id].run_ticks = 0;
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

    ESP_LOGI(TAG, "run_pump_on_volume: pump_id=%u, volume_ml=%.2f, rpm=%.2f", pump_id, volume_ml, rpm);

    pump_t *pump_config = get_pump_config(pump_id);
    double flow_ml_per_min = pump_flow_ml_per_min(pump_config, rpm);
    if (flow_ml_per_min <= 0.0) {
        set_pump_alert_flags(pump_id, PUMP_ALERT_NO_CALIBRATION, true);
        ESP_LOGE(TAG, "pump calibration not set for pump %u at %.2f speed", (unsigned)pump_id, rpm);
        return;
    }

    clear_pump_runtime_safety_alerts(pump_id);
    double run_time_seconds = (volume_ml / flow_ml_per_min) * 60.0;
    uint32_t run_units = (uint32_t)llround(run_time_seconds * PUMP_TIMER_UNIT_IN_SEC);
    if (run_units == 0) {
        run_units = 1;
    }

    pumps[pump_id].time = run_units;
    pumps[pump_id].run_ticks = 0;
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

    ESP_LOGI(TAG, "run_pump_manual: pump_id=%u, rpm=%.2f, direction=%d, time_minutes=%d", pump_id, rpm, direction, time_minutes);

    if (time_minutes <= 0) {
        stop_pump(pump_id);
        pumps[pump_id].state = PUMP_OFF;
        pumps[pump_id].time = 0;
        pumps[pump_id].run_ticks = 0;
        pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
        mark_pump_runtime_dirty(pump_id);
        return ESP_OK;
    }

    if (rpm <= 0.0f) {
        return ESP_ERR_INVALID_ARG;
    }

    char error[96];
    esp_err_t validation = validate_run_request(pump_id, rpm, time_minutes * 60, false, error, sizeof(error));
    if (validation != ESP_OK) {
        ESP_LOGW(TAG, "Rejected manual run for pump %u: %s",
                 (unsigned)pump_id,
                 error[0] != '\0' ? error : esp_err_to_name(validation));
        return validation;
    }

    pump_t *pump_config = get_pump_config(pump_id);
    double flow_ml_per_min = pump_flow_ml_per_min(pump_config, rpm);

    pumps[pump_id].time = (uint32_t)time_minutes * 60U * PUMP_TIMER_UNIT_IN_SEC;
    pumps[pump_id].run_ticks = 0;
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

esp_err_t run_pump_manual_seconds(uint8_t pump_id, float rpm, bool direction, int32_t time_seconds)
{
    if (pump_id >= MAX_PUMP) {
        return ESP_ERR_INVALID_ARG;
    }

    ESP_LOGI(TAG, "run_pump_manual_seconds: pump_id=%u, rpm=%.2f, direction=%d, time_seconds=%d",
             pump_id, rpm, direction, time_seconds);

    if (time_seconds <= 0) {
        stop_pump(pump_id);
        pumps[pump_id].state = PUMP_OFF;
        pumps[pump_id].time = 0;
        pumps[pump_id].run_ticks = 0;
        pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
        mark_pump_runtime_dirty(pump_id);
        return ESP_OK;
    }

    if (rpm <= 0.0f) {
        return ESP_ERR_INVALID_ARG;
    }

    char error[96];
    esp_err_t validation = validate_run_request(pump_id, rpm, time_seconds, false, error, sizeof(error));
    if (validation != ESP_OK) {
        ESP_LOGW(TAG, "Rejected manual run for pump %u: %s",
                 (unsigned)pump_id,
                 error[0] != '\0' ? error : esp_err_to_name(validation));
        return validation;
    }

    pump_t *pump_config = get_pump_config(pump_id);
    double flow_ml_per_min = pump_flow_ml_per_min(pump_config, rpm);

    pumps[pump_id].time = (uint32_t)time_seconds * PUMP_TIMER_UNIT_IN_SEC;
    pumps[pump_id].run_ticks = 0;
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

    ESP_LOGI(TAG, "run_pump_calibration: pump_id=%u, is_start=%d, rpm=%.2f, direction=%d", pump_id, is_start, rpm, direction);

    if (is_start) {
        pumps[pump_id].state = PUMP_CAL;
        pumps[pump_id].time = 0;
        pumps[pump_id].run_ticks = 0;
        pumps[pump_id].flow_per_unit = 0;
        pumps[pump_id].volume = 0;
        pumps[pump_id].rpm = rpm;
        pumps[pump_id].direction = direction;
        pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_CALIBRATION;
        clear_pump_runtime_safety_alerts(pump_id);
        if (start_pump(pump_id, rpm, direction) != ESP_OK) {
            pumps[pump_id].state = PUMP_OFF;
            pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
        }
        mark_pump_runtime_dirty(pump_id);
    } else {
        pumps[pump_id].state = PUMP_OFF;
        pumps[pump_id].run_ticks = 0;
        pumps[pump_id].history_source = PUMP_HISTORY_SOURCE_NONE;
        stop_pump(pump_id);
        mark_pump_runtime_dirty(pump_id);
    }
}

void backup_eeprom_tank_status(void)
{
    if (app_pumps_storage_backup_tank_status() == ESP_OK) {
        s_tank_volume_dirty = false;
        s_tank_backup_elapsed_seconds = 0;
    }
}

int init_pumps(void)
{
    if (s_backend == NULL) {
        ESP_LOGE(TAG, "pump backend must be registered before init_pumps()");
        return ESP_ERR_INVALID_STATE;
    }

    for (int i = 0; i < MAX_PUMP; ++i) {
        pumps[i].time = 0;
        pumps[i].run_ticks = 0;
        pumps[i].volume = 0;
        pumps[i].flow_per_unit = 0;
        pumps[i].rpm = 0;
        pumps[i].direction = get_pump_config(i)->direction;
        pumps[i].state = PUMP_OFF;
        pumps[i].history_source = PUMP_HISTORY_SOURCE_NONE;
        runtime_event_dirty[i] = false;
    }
    s_tank_volume_dirty = false;
    s_tank_backup_elapsed_seconds = 0;

    /*
     * Safety policy after reset/power loss: persisted counters are restored,
     * but active pump runs are intentionally not resumed. Operators should see
     * the interrupted state and decide whether another dose is safe.
     */
    app_pumps_storage_load_schedule_state(last_run_schedule_hour);
    app_pumps_storage_restore_tank_status();
    app_pumps_history_restore_today_from_backup();

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
