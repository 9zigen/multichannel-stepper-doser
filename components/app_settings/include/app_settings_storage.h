//
// Created by Aleksey Volkov on 03.10.2020.
//

#ifndef TFT_DOSER_APP_SETTINGS_STORAGE_H
#define TFT_DOSER_APP_SETTINGS_STORAGE_H

#include <stdbool.h>
#include "esp_err.h"

/* FRAM MAP */
#define EEPROM_SCHEDULE_STATUS_ADDR 0x32
#define EEPROM_TANK_STATUS_ADDR 0x64
#define EEPROM_REBOOT_STATUS_ADDR 0x90
#define EEPROM_MAGIC 0x82

const char *eeprom_backend_name(void);
bool eeprom_using_fallback(void);

esp_err_t eeprom_write_byte(uint8_t deviceaddress, uint16_t eeaddress, uint8_t byte);
uint8_t eeprom_read_byte(uint8_t deviceaddress, uint16_t eeaddress);
esp_err_t eeprom_write(uint8_t deviceaddress, uint16_t eeaddress, uint8_t *data, size_t size);
esp_err_t eeprom_read(uint8_t deviceaddress, uint16_t eeaddress, uint8_t *data, size_t size);

#endif //TFT_DOSER_APP_SETTINGS_STORAGE_H
