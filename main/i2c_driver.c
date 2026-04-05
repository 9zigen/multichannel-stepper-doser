//
// Created by Aleksey Volkov on 31.03.2022.
//

#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"

#include <esp_wifi.h>
#include <esp_event.h>
#include <esp_log.h>
#include <esp_system.h>
#include <nvs_flash.h>
#include "driver/i2c.h"
#include <driver/gpio.h>

#include "board.h"
#include "i2c_driver.h"

#define TAG "I2C"
#define I2C_SDA (-1)
#define I2C_SCL (-1)

static void i2c_scanner();
static bool i2c_initialized = false;

i2c_port_t i2c_master_port = I2C_NUM_0;
SemaphoreHandle_t i2c_semaphore;

bool i2c_is_supported(void)
{
  return  (I2C_SDA != I2C_SCL) && (I2C_SDA >= 0) && (I2C_SCL >= 0);
}

bool i2c_is_initialized(void)
{
  return i2c_initialized;
}

void init_i2c()
{
  if (!i2c_is_supported()) {
    ESP_LOGW(TAG, "I2C disabled: SDA=%d SCL=%d. Falling back to non-I2C backends.", I2C_SDA, I2C_SCL);
    i2c_initialized = false;
    return;
  }

  i2c_semaphore = xSemaphoreCreateMutex();

  i2c_config_t conf;
  conf.mode = I2C_MODE_MASTER;
  conf.sda_io_num = I2C_SDA;
  conf.scl_io_num = I2C_SCL;
  conf.sda_pullup_en = GPIO_PULLUP_ENABLE;
  conf.scl_pullup_en = GPIO_PULLUP_ENABLE;
  conf.master.clk_speed = 400000;
  conf.clk_flags = 0;

  ESP_ERROR_CHECK(i2c_driver_install(i2c_master_port, I2C_MODE_MASTER, 0, 0, 0));
  ESP_ERROR_CHECK(i2c_param_config(i2c_master_port, &conf));
  i2c_initialized = true;

  i2c_scanner();
}

uint8_t i2c_read_reg_8bit(uint8_t dev_address, uint8_t reg)
{
  uint8_t data = 0;
  if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE)
  {
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();

    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (dev_address << 1), 1);
    i2c_master_write_byte(cmd, reg, 1);

    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (dev_address << 1) | 1, 1);
    i2c_master_read_byte(cmd, &data, I2C_MASTER_LAST_NACK);
    i2c_master_stop(cmd);

    ESP_ERROR_CHECK(i2c_master_cmd_begin(i2c_master_port, cmd, 1000 / portTICK_PERIOD_MS));
    i2c_cmd_link_delete(cmd);

    xSemaphoreGive(i2c_semaphore);
  }
  return data;
}

esp_err_t i2c_read_reg_data(uint8_t dev_address, uint8_t reg, uint8_t * p_data, uint8_t len)
{
  esp_err_t err = ESP_FAIL;
  if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE)
  {
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();

    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (dev_address<<1), 1);
    i2c_master_write_byte(cmd, reg, 1);

    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (dev_address<<1) | 1, 1);
    i2c_master_read(cmd, p_data, len, I2C_MASTER_LAST_NACK);
    i2c_master_stop(cmd);
    err = i2c_master_cmd_begin(i2c_master_port, cmd, 1000/portTICK_PERIOD_MS);
    i2c_cmd_link_delete(cmd);

    xSemaphoreGive(i2c_semaphore);
  }
  return err;
}

esp_err_t i2c_reg_write_8bit(uint8_t dev_address, uint8_t reg, uint8_t value)
{
  esp_err_t err = ESP_FAIL;
  if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE)
  {
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();

    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (dev_address << 1), 1);
    i2c_master_write_byte(cmd, reg, 1);
    i2c_master_write_byte(cmd, value, 1);
    i2c_master_stop(cmd);
    err = i2c_master_cmd_begin(i2c_master_port, cmd, 1000/portTICK_PERIOD_MS);
    i2c_cmd_link_delete(cmd);

    xSemaphoreGive(i2c_semaphore);
  }
  return err;
}

esp_err_t i2c_reg_write_data(uint8_t dev_address, uint8_t reg, uint8_t *p_data, uint8_t len)
{
  esp_err_t err = ESP_FAIL;
  if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE)
  {
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();

    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (dev_address << 1), 1);
    i2c_master_write_byte(cmd, reg, 1);
    i2c_master_write(cmd, p_data, len, 1);
    i2c_master_stop(cmd);
    err = i2c_master_cmd_begin(i2c_master_port, cmd, 1000/portTICK_PERIOD_MS);
    i2c_cmd_link_delete(cmd);

    xSemaphoreGive(i2c_semaphore);
  }
  return err;
}

static void i2c_scanner() {
  ESP_LOGD(TAG, ">> i2cScanner");
  int i;
  esp_err_t espRc;
  printf("     0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f\n");
  printf("00:         ");

  if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE)
  {
    for (i=3; i< 0x78; i++) {
      i2c_cmd_handle_t cmd = i2c_cmd_link_create();
      i2c_master_start(cmd);
      i2c_master_write_byte(cmd, (i << 1) | I2C_MASTER_WRITE, 1 /* expect ack */);
      i2c_master_stop(cmd);

      espRc = i2c_master_cmd_begin(I2C_NUM_0, cmd, 10/portTICK_PERIOD_MS);
      if (i%16 == 0) {
        printf("\n%.2x:", i);
      }
      if (espRc == 0) {
        printf(" %.2x", i);
      } else {
        printf(" --");
      }
      //ESP_LOGD(tag, "i=%d, rc=%d (0x%x)", i, espRc, espRc);
      i2c_cmd_link_delete(cmd);
    }
    xSemaphoreGive(i2c_semaphore);
  }
  printf("\n");
}
