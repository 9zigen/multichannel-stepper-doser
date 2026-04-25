#include "esp_log.h"

#include "app_pumps_priv.h"
#include "app_settings.h"
#include "app_settings_storage.h"

#define APP_PUMPS_SCHEDULE_STATE_MAGIC 0x53434832U

static const char *TAG = "APP_PUMPS_STORAGE";

typedef struct {
    uint8_t magic;
    double tank_current_vol[MAX_PUMP];
} app_pumps_tank_status_t;

typedef struct {
    uint32_t magic;
    uint32_t day_stamp;
    uint32_t last_run_hour[MAX_SCHEDULE];
} app_pumps_schedule_state_t;

static uint8_t pump_storage_i2c_addr(void)
{
    return get_eeprom_i2c_addr();
}

esp_err_t app_pumps_storage_restore_tank_status(void)
{
    app_pumps_tank_status_t tank = {0};
    esp_err_t err = eeprom_read(pump_storage_i2c_addr(),
                                EEPROM_TANK_STATUS_ADDR,
                                (uint8_t *)&tank,
                                sizeof(tank));
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "tank status restore failed: %s", esp_err_to_name(err));
        return err;
    }

    if (tank.magic != EEPROM_MAGIC) {
        ESP_LOGI(TAG, "tank status backup not initialized");
        return ESP_ERR_NOT_FOUND;
    }

    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        get_pump_config(pump_id)->tank_current_vol = tank.tank_current_vol[pump_id];
    }

    return ESP_OK;
}

esp_err_t app_pumps_storage_backup_tank_status(void)
{
    app_pumps_tank_status_t tank = {
        .magic = EEPROM_MAGIC,
    };

    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        tank.tank_current_vol[pump_id] = get_pump_config(pump_id)->tank_current_vol;
    }

    esp_err_t err = eeprom_write(pump_storage_i2c_addr(),
                                 EEPROM_TANK_STATUS_ADDR,
                                 (uint8_t *)&tank,
                                 sizeof(tank));
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "tank status backup failed: %s", esp_err_to_name(err));
    }

    return err;
}

bool app_pumps_storage_using_flash_fallback(void)
{
    return eeprom_using_fallback();
}

void app_pumps_storage_load_schedule_state(uint32_t *last_run_schedule_day_stamp,
                                           uint32_t last_run_schedule_hour[MAX_SCHEDULE])
{
    if (last_run_schedule_hour == NULL) {
        return;
    }

    const uint32_t current_day_stamp = app_pumps_current_local_day_stamp();
    if (last_run_schedule_day_stamp != NULL) {
        *last_run_schedule_day_stamp = current_day_stamp;
    }
    for (uint8_t schedule_id = 0; schedule_id < MAX_SCHEDULE; ++schedule_id) {
        last_run_schedule_hour[schedule_id] = 0xff;
    }

    app_pumps_schedule_state_t state = {0};
    esp_err_t err = eeprom_read(pump_storage_i2c_addr(),
                                EEPROM_SCHEDULE_STATUS_ADDR,
                                (uint8_t *)&state,
                                sizeof(state));
    if (err != ESP_OK) {
        ESP_LOGD(TAG, "schedule state restore skipped: %s", esp_err_to_name(err));
        return;
    }

    if (state.magic != APP_PUMPS_SCHEDULE_STATE_MAGIC || state.day_stamp != current_day_stamp) {
        ESP_LOGI(TAG, "schedule state not current (stored_day=%lu current_day=%lu)",
                 (unsigned long)state.day_stamp,
                 (unsigned long)current_day_stamp);
        return;
    }

    if (last_run_schedule_day_stamp != NULL) {
        *last_run_schedule_day_stamp = state.day_stamp;
    }
    for (uint8_t schedule_id = 0; schedule_id < MAX_SCHEDULE; ++schedule_id) {
        last_run_schedule_hour[schedule_id] = state.last_run_hour[schedule_id];
        ESP_LOGI(TAG, "restored schedule last_run:%u:%lu day:%lu",
                 (unsigned)schedule_id,
                 (unsigned long)last_run_schedule_hour[schedule_id],
                 (unsigned long)state.day_stamp);
    }
}

esp_err_t app_pumps_storage_save_schedule_state(uint32_t last_run_schedule_day_stamp,
                                                const uint32_t last_run_schedule_hour[MAX_SCHEDULE])
{
    if (last_run_schedule_hour == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    app_pumps_schedule_state_t state = {
        .magic = APP_PUMPS_SCHEDULE_STATE_MAGIC,
        .day_stamp = last_run_schedule_day_stamp,
    };
    for (uint8_t schedule_id = 0; schedule_id < MAX_SCHEDULE; ++schedule_id) {
        state.last_run_hour[schedule_id] = last_run_schedule_hour[schedule_id];
    }

    /*
     * Keep the persisted schedule marker separate from pump runtime state.
     * After a reset/power loss we may skip a duplicate periodic dose in the
     * same hour, but we never resume a pump that was actively running.
     */
    esp_err_t err = eeprom_write(pump_storage_i2c_addr(),
                                 EEPROM_SCHEDULE_STATUS_ADDR,
                                 (uint8_t *)&state,
                                 sizeof(state));

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "schedule state backup failed: %s", esp_err_to_name(err));
    }

    return err;
}
