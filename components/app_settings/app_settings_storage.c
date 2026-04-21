//
// Created by Aleksey Volkov on 03.10.2020.
//

#include <stdbool.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_system.h"
#include <esp_log.h>
#include "driver/i2c.h"
#include "nvs.h"

#include "app_settings.h"
#include "app_settings_storage.h"
#include "i2c_driver.h"

#define WRITE_BIT I2C_MASTER_WRITE
#define READ_BIT I2C_MASTER_READ
#define EEPROM_WRITE_ADDR   0x00
#define EEPROM_READ_ADDR    0x01
#define EEPROM_PAGE_SIZE    256
#define EEPROM_KEY_MAX_LEN  16

static const char *TAG = "EEPROM";
static int i2c_master_port = I2C_NUM_0;

extern SemaphoreHandle_t i2c_semaphore;

typedef enum {
    EEPROM_BACKEND_UNKNOWN = 0,
    EEPROM_BACKEND_I2C,
    EEPROM_BACKEND_NVS,
} eeprom_backend_t;

static eeprom_backend_t eeprom_backend = EEPROM_BACKEND_UNKNOWN;
static uint8_t eeprom_backend_address = 0;

static void eeprom_make_key(uint16_t eeaddress, char *key, size_t key_size)
{
    snprintf(key, key_size, "EE_%04X", eeaddress);
}

static esp_err_t eeprom_nvs_write(uint16_t eeaddress, const void *data, size_t size)
{
    char key[EEPROM_KEY_MAX_LEN];
    eeprom_make_key(eeaddress, key, sizeof(key));

    nvs_handle_t handle;
    esp_err_t err = nvs_open("storage", NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        return err;
    }

    err = nvs_set_blob(handle, key, data, size);
    if (err == ESP_OK) {
        err = nvs_commit(handle);
    }
    nvs_close(handle);
    return err;
}

static esp_err_t eeprom_nvs_read(uint16_t eeaddress, void *data, size_t size)
{
    char key[EEPROM_KEY_MAX_LEN];
    eeprom_make_key(eeaddress, key, sizeof(key));

    nvs_handle_t handle;
    esp_err_t err = nvs_open("storage", NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        return err;
    }

    size_t required_size = size;
    err = nvs_get_blob(handle, key, data, &required_size);
    nvs_close(handle);

    if (err == ESP_ERR_NVS_NOT_FOUND) {
        memset(data, 0, size);
        return ESP_OK;
    }

    if (err == ESP_OK && required_size != size) {
        memset(data, 0, size);
        return ESP_ERR_NVS_INVALID_LENGTH;
    }

    return err;
}

static esp_err_t eeprom_probe_i2c(uint8_t deviceaddress)
{
    if (i2c_semaphore == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) != pdTRUE) {
        return ESP_ERR_TIMEOUT;
    }

    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (deviceaddress << 1) | WRITE_BIT, true);
    i2c_master_stop(cmd);
    esp_err_t err = i2c_master_cmd_begin(i2c_master_port, cmd, 50 / portTICK_PERIOD_MS);
    i2c_cmd_link_delete(cmd);
    xSemaphoreGive(i2c_semaphore);
    return err;
}

static eeprom_backend_t eeprom_detect_backend(uint8_t deviceaddress)
{
    if (eeprom_backend_address != 0 && eeprom_backend_address != deviceaddress) {
        eeprom_backend = EEPROM_BACKEND_UNKNOWN;
    }

    if (eeprom_backend != EEPROM_BACKEND_UNKNOWN) {
        return eeprom_backend;
    }

    if (!i2c_is_supported() || !i2c_is_initialized()) {
        eeprom_backend = EEPROM_BACKEND_NVS;
        eeprom_backend_address = deviceaddress;
        ESP_LOGW(TAG, "I2C not supported. Using NVS fallback for EEPROM.");
        return eeprom_backend;
    }

    if (eeprom_probe_i2c(deviceaddress) == ESP_OK) {
        eeprom_backend = EEPROM_BACKEND_I2C;
        eeprom_backend_address = deviceaddress;
        ESP_LOGI(TAG, "Using I2C EEPROM backend");
    } else {
        eeprom_backend = EEPROM_BACKEND_NVS;
        eeprom_backend_address = deviceaddress;
        ESP_LOGW(TAG, "I2C EEPROM not detected, falling back to NVS");
    }

    return eeprom_backend;
}

const char *eeprom_backend_name(void)
{
    switch (eeprom_detect_backend(get_eeprom_i2c_addr())) {
        case EEPROM_BACKEND_I2C:
            return "I2C EEPROM";
        case EEPROM_BACKEND_NVS:
            return "NVS fallback";
        case EEPROM_BACKEND_UNKNOWN:
        default:
            return "Unknown";
    }
}

bool eeprom_using_fallback(void)
{
    return eeprom_detect_backend(get_eeprom_i2c_addr()) == EEPROM_BACKEND_NVS;
}

esp_err_t eeprom_write_byte(uint8_t deviceaddress, uint16_t eeaddress, uint8_t byte)
{
    if (eeprom_detect_backend(deviceaddress) == EEPROM_BACKEND_NVS) {
        return eeprom_nvs_write(eeaddress, &byte, sizeof(byte));
    }

    esp_err_t err = ESP_FAIL;
    if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE) {
        i2c_cmd_handle_t cmd = i2c_cmd_link_create();
        i2c_master_start(cmd);

        uint8_t page = eeaddress / (EEPROM_PAGE_SIZE - 1);
        i2c_master_write_byte(cmd, (deviceaddress << 1) | EEPROM_WRITE_ADDR | (page & 0x7), true);

        uint8_t word_addr = eeaddress - (EEPROM_PAGE_SIZE * page);
        i2c_master_write_byte(cmd, word_addr, true);
        i2c_master_write_byte(cmd, byte, true);
        i2c_master_stop(cmd);
        err = i2c_master_cmd_begin(i2c_master_port, cmd, 1000 / portTICK_PERIOD_MS);
        i2c_cmd_link_delete(cmd);
        xSemaphoreGive(i2c_semaphore);
    }

    if (err != ESP_OK) {
        eeprom_backend = EEPROM_BACKEND_NVS;
        eeprom_backend_address = deviceaddress;
        return eeprom_nvs_write(eeaddress, &byte, sizeof(byte));
    }

    return err;
}

esp_err_t eeprom_write(uint8_t deviceaddress, uint16_t eeaddress, uint8_t *data, size_t size)
{
    if (eeprom_detect_backend(deviceaddress) == EEPROM_BACKEND_NVS) {
        return eeprom_nvs_write(eeaddress, data, size);
    }

    esp_err_t err = ESP_FAIL;
    if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE) {
        i2c_cmd_handle_t cmd = i2c_cmd_link_create();
        i2c_master_start(cmd);

        uint8_t page = eeaddress / (EEPROM_PAGE_SIZE - 1);
        i2c_master_write_byte(cmd, (deviceaddress << 1) | EEPROM_WRITE_ADDR | (page & 0x7), true);

        uint8_t word_addr = eeaddress - (EEPROM_PAGE_SIZE * page);
        i2c_master_write_byte(cmd, word_addr, true);
        i2c_master_write(cmd, data, size, true);
        i2c_master_stop(cmd);
        err = i2c_master_cmd_begin(i2c_master_port, cmd, 1000 / portTICK_PERIOD_MS);
        i2c_cmd_link_delete(cmd);
        xSemaphoreGive(i2c_semaphore);
    }

    if (err != ESP_OK) {
        eeprom_backend = EEPROM_BACKEND_NVS;
        eeprom_backend_address = deviceaddress;
        return eeprom_nvs_write(eeaddress, data, size);
    }

    return err;
}

uint8_t eeprom_read_byte(uint8_t deviceaddress, uint16_t eeaddress)
{
    uint8_t data = 0;
    if (eeprom_detect_backend(deviceaddress) == EEPROM_BACKEND_NVS) {
        eeprom_nvs_read(eeaddress, &data, sizeof(data));
        return data;
    }

    if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE) {
        i2c_cmd_handle_t cmd = i2c_cmd_link_create();
        i2c_master_start(cmd);

        uint8_t page = eeaddress / (EEPROM_PAGE_SIZE - 1);
        i2c_master_write_byte(cmd, (deviceaddress << 1) | EEPROM_WRITE_ADDR | (page & 0x7), true);

        uint8_t word_addr = eeaddress - (EEPROM_PAGE_SIZE * page);
        i2c_master_write_byte(cmd, word_addr, true);
        i2c_master_start(cmd);
        i2c_master_write_byte(cmd, (deviceaddress << 1) | EEPROM_READ_ADDR | (page & 0x7), true);
        i2c_master_read_byte(cmd, &data, I2C_MASTER_LAST_NACK);
        i2c_master_stop(cmd);
        esp_err_t err = i2c_master_cmd_begin(i2c_master_port, cmd, 1000 / portTICK_PERIOD_MS);
        i2c_cmd_link_delete(cmd);
        xSemaphoreGive(i2c_semaphore);

        if (err != ESP_OK) {
            eeprom_backend = EEPROM_BACKEND_NVS;
            eeprom_backend_address = deviceaddress;
            eeprom_nvs_read(eeaddress, &data, sizeof(data));
        }
    }

    return data;
}

esp_err_t eeprom_read(uint8_t deviceaddress, uint16_t eeaddress, uint8_t *data, size_t size)
{
    if (eeprom_detect_backend(deviceaddress) == EEPROM_BACKEND_NVS) {
        return eeprom_nvs_read(eeaddress, data, size);
    }

    esp_err_t err = ESP_FAIL;
    if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE) {
        i2c_cmd_handle_t cmd = i2c_cmd_link_create();
        i2c_master_start(cmd);

        uint8_t page = eeaddress / (EEPROM_PAGE_SIZE - 1);
        i2c_master_write_byte(cmd, (deviceaddress << 1) | EEPROM_WRITE_ADDR | (page & 0x7), true);

        uint8_t word_addr = eeaddress - (EEPROM_PAGE_SIZE * page);
        i2c_master_write_byte(cmd, word_addr, true);
        i2c_master_start(cmd);
        i2c_master_write_byte(cmd, (deviceaddress << 1) | EEPROM_READ_ADDR, true);
        if (size > 1) {
            i2c_master_read(cmd, data, size - 1, I2C_MASTER_ACK);
        }
        i2c_master_read_byte(cmd, &data[size - 1], I2C_MASTER_LAST_NACK);
        i2c_master_stop(cmd);
        err = i2c_master_cmd_begin(i2c_master_port, cmd, 1000 / portTICK_PERIOD_MS);
        i2c_cmd_link_delete(cmd);
        xSemaphoreGive(i2c_semaphore);
    }

    if (err != ESP_OK) {
        eeprom_backend = EEPROM_BACKEND_NVS;
        eeprom_backend_address = deviceaddress;
        return eeprom_nvs_read(eeaddress, data, size);
    }

    return err;
}
