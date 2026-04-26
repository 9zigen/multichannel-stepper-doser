#include <math.h>
#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "nvs.h"

#include "app_pumps_priv.h"

#define APP_PUMP_HISTORY_NAMESPACE "pump_hist"
#define APP_PUMP_HISTORY_KEY_LEN 16

static const char *TAG = "APP_PUMPS_HISTORY";

static pump_history_day_t s_today_history[MAX_PUMP];
static bool s_today_history_dirty[MAX_PUMP];
static uint8_t s_today_history_runtime_subticks[MAX_PUMP][APP_PUMP_HISTORY_HOURS];
static double s_today_history_scheduled_volume_accum[MAX_PUMP][APP_PUMP_HISTORY_HOURS];
static double s_today_history_manual_volume_accum[MAX_PUMP][APP_PUMP_HISTORY_HOURS];

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
    ESP_LOGI(TAG, "Saving day blob for pump %u, day stamp %u", pump_id, day->day_stamp);
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

static uint32_t history_volume_ml_to_cml(double volume_ml)
{
    if (volume_ml <= 0.0) {
        return 0;
    }
    if (volume_ml >= APP_PUMP_HISTORY_VOLUME_MAX_ML) {
        return APP_PUMP_HISTORY_VOLUME_MAX_CML;
    }

    const long long volume_cml = llround(volume_ml * (double)APP_PUMP_HISTORY_VOLUME_SCALE);
    if (volume_cml > (long long)APP_PUMP_HISTORY_VOLUME_MAX_CML) {
        return APP_PUMP_HISTORY_VOLUME_MAX_CML;
    }

    return (uint32_t)volume_cml;
}

static void history_clear_runtime_accumulators(uint8_t pump_id)
{
    memset(s_today_history_runtime_subticks[pump_id], 0, sizeof(s_today_history_runtime_subticks[pump_id]));
    memset(s_today_history_scheduled_volume_accum[pump_id], 0, sizeof(s_today_history_scheduled_volume_accum[pump_id]));
    memset(s_today_history_manual_volume_accum[pump_id], 0, sizeof(s_today_history_manual_volume_accum[pump_id]));
}

static void history_rollover_if_needed(void)
{
    const uint32_t day_stamp = app_pumps_current_local_day_stamp();

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
            history_clear_runtime_accumulators(pump_id);
        }
    }
}

void app_pumps_history_restore_today_from_backup(void)
{
    const uint32_t day_stamp = app_pumps_current_local_day_stamp();

    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        history_reset_day(&s_today_history[pump_id], day_stamp);
        s_today_history_dirty[pump_id] = false;
        history_clear_runtime_accumulators(pump_id);

        pump_history_day_t persisted_day = {0};
        if (history_load_day_blob(pump_id, day_stamp, &persisted_day) == ESP_OK) {
            s_today_history[pump_id] = persisted_day;
            for (uint8_t hour = 0; hour < APP_PUMP_HISTORY_HOURS; ++hour) {
                s_today_history_scheduled_volume_accum[pump_id][hour] =
                    app_pumps_history_volume_cml_to_ml(persisted_day.hours[hour].scheduled_volume_cml);
                s_today_history_manual_volume_accum[pump_id][hour] =
                    app_pumps_history_volume_cml_to_ml(persisted_day.hours[hour].manual_volume_cml);
            }
            ESP_LOGI(TAG, "restored history for pump %u day %lu", (unsigned)pump_id, (unsigned long)day_stamp);
        }
    }
}

void app_pumps_history_record_activity(uint8_t pump_id, pump_history_source_t source,
                                       double volume_delta_ml, bool runtime_tick)
{
    if (pump_id >= MAX_PUMP || source == PUMP_HISTORY_SOURCE_NONE) {
        return;
    }

    history_rollover_if_needed();

    const uint8_t hour = app_pumps_current_local_hour();
    pump_history_hour_t *hour_slot = &s_today_history[pump_id].hours[hour];
    hour_slot->flags |= history_flag_for_source(source);

    if (volume_delta_ml > 0.0) {
        if (history_source_is_scheduled(source)) {
            double next = s_today_history_scheduled_volume_accum[pump_id][hour] + volume_delta_ml;
            if (next > APP_PUMP_HISTORY_VOLUME_MAX_ML) {
                next = APP_PUMP_HISTORY_VOLUME_MAX_ML;
            }
            s_today_history_scheduled_volume_accum[pump_id][hour] = next;
            hour_slot->scheduled_volume_cml = history_volume_ml_to_cml(next);
        } else {
            double next = s_today_history_manual_volume_accum[pump_id][hour] + volume_delta_ml;
            if (next > APP_PUMP_HISTORY_VOLUME_MAX_ML) {
                next = APP_PUMP_HISTORY_VOLUME_MAX_ML;
            }
            s_today_history_manual_volume_accum[pump_id][hour] = next;
            hour_slot->manual_volume_cml = history_volume_ml_to_cml(next);
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

double app_pumps_history_get_pump_hour_volume_ml(uint8_t pump_id, uint8_t hour)
{
    if (pump_id >= MAX_PUMP || hour >= APP_PUMP_HISTORY_HOURS) {
        return 0.0;
    }

    return s_today_history_scheduled_volume_accum[pump_id][hour] +
           s_today_history_manual_volume_accum[pump_id][hour];
}

double app_pumps_history_get_pump_scheduled_day_volume_ml(uint8_t pump_id)
{
    if (pump_id >= MAX_PUMP) {
        return 0.0;
    }

    history_rollover_if_needed();

    double total = 0.0;
    for (uint8_t hour = 0; hour < APP_PUMP_HISTORY_HOURS; ++hour) {
        total += s_today_history_scheduled_volume_accum[pump_id][hour];
    }

    return total;
}

double app_pumps_history_get_pump_day_volume_ml(uint8_t pump_id)
{
    if (pump_id >= MAX_PUMP) {
        return 0.0;
    }

    double total = 0.0;
    for (uint8_t hour = 0; hour < APP_PUMP_HISTORY_HOURS; ++hour) {
        total += app_pumps_history_get_pump_hour_volume_ml(pump_id, hour);
    }

    return total;
}

double app_pumps_history_get_total_day_volume_ml(void)
{
    double total = 0.0;
    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        total += app_pumps_history_get_pump_day_volume_ml(pump_id);
    }

    return total;
}

uint32_t app_pumps_history_get_current_day_stamp(void)
{
    history_rollover_if_needed();
    return app_pumps_current_local_day_stamp();
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

esp_err_t app_pumps_history_reset_today_scheduled(uint8_t pump_id, uint32_t *day_stamp)
{
    if (pump_id >= MAX_PUMP) {
        return ESP_ERR_INVALID_ARG;
    }

    history_rollover_if_needed();

    pump_history_day_t *today = &s_today_history[pump_id];
    pump_history_day_t reset_day = *today;
    if (reset_day.day_stamp == 0) {
        history_reset_day(&reset_day, app_pumps_current_local_day_stamp());
    }

    for (uint8_t hour = 0; hour < APP_PUMP_HISTORY_HOURS; ++hour) {
        reset_day.hours[hour].scheduled_volume_cml = 0;
        reset_day.hours[hour].flags &= (uint8_t)~(PUMP_HISTORY_FLAG_SCHEDULED | PUMP_HISTORY_FLAG_CONTINUOUS);
    }

    esp_err_t err = history_save_day_blob(pump_id, &reset_day);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "failed to reset scheduled history for pump %u day %lu: %s",
                 (unsigned)pump_id,
                 (unsigned long)reset_day.day_stamp,
                 esp_err_to_name(err));
        return err;
    }

    *today = reset_day;
    for (uint8_t hour = 0; hour < APP_PUMP_HISTORY_HOURS; ++hour) {
        s_today_history_scheduled_volume_accum[pump_id][hour] = 0.0;
    }
    s_today_history_dirty[pump_id] = false;
    if (day_stamp != NULL) {
        *day_stamp = today->day_stamp;
    }
    ESP_LOGI(TAG, "reset scheduled history for pump %u day %lu",
             (unsigned)pump_id,
             (unsigned long)today->day_stamp);
    return ESP_OK;
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
