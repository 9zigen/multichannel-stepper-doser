//
// Created by Aleksey Volkov on 03.10.2020.
//

#ifndef TFT_DOSER_EEPROM_H
#define TFT_DOSER_EEPROM_H

/* FRAM MAP */
#define EEPROM_SCHEDULE_STATUS_ADDR 0x32
#define EEPROM_TANK_STATUS_ADDR 0x64
#define EEPROM_MAGIC 0x82

//void i2c_scan_bus();

esp_err_t eeprom_write_byte(uint8_t deviceaddress, uint16_t eeaddress, uint8_t byte);
uint8_t eeprom_read_byte(uint8_t deviceaddress, uint16_t eeaddress);
esp_err_t eeprom_write(uint8_t deviceaddress, uint16_t eeaddress, uint8_t* data, size_t size);
esp_err_t eeprom_read(uint8_t deviceaddress, uint16_t eeaddress, uint8_t* data, size_t size) ;

#endif //TFT_DOSER_EEPROM_H
