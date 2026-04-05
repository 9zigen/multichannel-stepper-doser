//
// Created by Aleksey Volkov on 31.03.2022.
//

#ifndef TFT_DOSER_I2C_DRIVER_H
#define TFT_DOSER_I2C_DRIVER_H

#include <stdbool.h>
#include "esp_err.h"

void init_i2c();
bool i2c_is_supported(void);
bool i2c_is_initialized(void);

uint8_t i2c_read_reg_8bit(uint8_t dev_address, uint8_t reg);
esp_err_t i2c_read_reg_data(uint8_t dev_address, uint8_t reg, uint8_t * p_data, uint8_t len);
esp_err_t i2c_reg_write_8bit(uint8_t dev_address, uint8_t reg, uint8_t value);
esp_err_t i2c_reg_write_data(uint8_t dev_address, uint8_t reg, uint8_t *p_data, uint8_t len);

#endif //TFT_DOSER_I2C_DRIVER_H
