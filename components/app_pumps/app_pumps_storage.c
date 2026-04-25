#include "esp_log.h"

#include "app_pumps_priv.h"
#include "app_settings.h"
#include "app_settings_storage.h"

#define APP_PUMPS_SCHEDULE_MAGIC_ADDR 0x31

static const char *TAG = "APP_PUMPS_STORAGE";

typedef struct {
    uint8_t magic;
    double tank_current_vol[MAX_PUMP];
} app_pumps_tank_status_t;

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

void app_pumps_storage_load_schedule_state(uint32_t last_run_schedule_hour[MAX_SCHEDULE])
{
    if (last_run_schedule_hour == NULL) {
        return;
    }

    if (eeprom_read_byte(pump_storage_i2c_addr(), APP_PUMPS_SCHEDULE_MAGIC_ADDR) == EEPROM_MAGIC) {
        esp_err_t err = eeprom_read(pump_storage_i2c_addr(),
                                    EEPROM_SCHEDULE_STATUS_ADDR,
                                    (uint8_t *)last_run_schedule_hour,
                                    sizeof(uint32_t) * MAX_SCHEDULE);
        if (err == ESP_OK) {
            for (uint8_t schedule_id = 0; schedule_id < MAX_SCHEDULE; ++schedule_id) {
                ESP_LOGI(TAG, "restored schedule last_run:%u:%lu",
                         (unsigned)schedule_id,
                         (unsigned long)last_run_schedule_hour[schedule_id]);
            }
            return;
        }

        ESP_LOGW(TAG, "schedule state restore failed: %s", esp_err_to_name(err));
    }

    for (uint8_t schedule_id = 0; schedule_id < MAX_SCHEDULE; ++schedule_id) {
        last_run_schedule_hour[schedule_id] = 0xff;
    }
}

esp_err_t app_pumps_storage_save_schedule_state(const uint32_t last_run_schedule_hour[MAX_SCHEDULE])
{
    if (last_run_schedule_hour == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    /*
     * Keep the persisted schedule marker separate from pump runtime state.
     * After a reset/power loss we may skip a duplicate periodic dose in the
     * same hour, but we never resume a pump that was actively running.
     */
    esp_err_t err = eeprom_write(pump_storage_i2c_addr(),
                                 EEPROM_SCHEDULE_STATUS_ADDR,
                                 (uint8_t *)last_run_schedule_hour,
                                 sizeof(uint32_t) * MAX_SCHEDULE);
    if (err == ESP_OK) {
        err = eeprom_write_byte(pump_storage_i2c_addr(), APP_PUMPS_SCHEDULE_MAGIC_ADDR, EEPROM_MAGIC);
    }

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "schedule state backup failed: %s", esp_err_to_name(err));
    }

    return err;
}
