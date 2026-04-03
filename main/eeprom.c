//
// Created by Aleksey Volkov on 03.10.2020.
//

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_system.h"
#include <esp_log.h>
#include "driver/i2c.h"
#include "eeprom.h"

#define EEPROM_SDA 21
#define EEPROM_SCL 22
#define I2C_MASTER_TX_BUF_DISABLE 0 /*!< I2C master doesn't need buffer */
#define I2C_MASTER_RX_BUF_DISABLE 0 /*!< I2C master doesn't need buffer */
#define WRITE_BIT I2C_MASTER_WRITE  /*!< I2C master write */
#define READ_BIT I2C_MASTER_READ    /*!< I2C master read */
#define ACK_CHECK_EN 0x1            /*!< I2C master will check ack from slave*/
#define ACK_CHECK_DIS 0x0           /*!< I2C master will not check ack from slave */
#define ACK_VAL 0x0                 /*!< I2C ack value */
#define NACK_VAL 0x1                /*!< I2C nack value */
#define EEPROM_WRITE_ADDR   0x00
#define EEPROM_READ_ADDR    0x01

#define EEPROM_PAGE_SIZE	256

static const char *TAG="EEPROM";
static int i2c_master_port = I2C_NUM_0;

const uint8_t eeprom_address = 0x50;
const uint16_t starting_address = 0x0000;
extern SemaphoreHandle_t i2c_semaphore;

/* When accessing the FM24CL16, the user addresses
2,048 locations each with 8 data bits. These data bits
are shifted serially. The 2,048 addresses are accessed
using the two-wire protocol, which includes a slave
address (to distinguish from other non-memory
devices), a row address, and a segment address. The
row address consists of 8-bits that specify one of 256
rows. The 3-bit segment address specifies one of 8
segments within each row. The complete 11-bit
address specifies each byte uniquely. */

esp_err_t eeprom_write_byte(uint8_t deviceaddress, uint16_t eeaddress, uint8_t byte)
{
  esp_err_t err = ESP_FAIL;
  if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE)
  {
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);

    /* Page address */
    uint8_t page = eeaddress / (EEPROM_PAGE_SIZE - 1);
    i2c_master_write_byte(cmd, (deviceaddress << 1) | EEPROM_WRITE_ADDR | (page & 0x7), 1);

    /* World address */
    uint8_t world_addr = eeaddress - (EEPROM_PAGE_SIZE * page);
    i2c_master_write_byte(cmd, world_addr, 1);

    ESP_LOGD(TAG, "eeprom page: %d word: %d", page, world_addr);

    i2c_master_write_byte(cmd, byte, 1);
    i2c_master_stop(cmd);
    err = i2c_master_cmd_begin(i2c_master_port, cmd, 1000 / portTICK_PERIOD_MS);
    i2c_cmd_link_delete(cmd);

    xSemaphoreGive(i2c_semaphore);
  }
  return err;
}

esp_err_t eeprom_write(uint8_t deviceaddress, uint16_t eeaddress, uint8_t* data, size_t size)
{
  esp_err_t err = ESP_FAIL;
  if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE)
  {
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);

    /* Page address */
    uint8_t page = eeaddress / (EEPROM_PAGE_SIZE-1);
    i2c_master_write_byte(cmd, (deviceaddress<<1)|EEPROM_WRITE_ADDR|(page&0x7), 1);

    /* World address */
    uint8_t world_addr = eeaddress - (EEPROM_PAGE_SIZE * page);
    i2c_master_write_byte(cmd, world_addr, 1);

    ESP_LOGD(TAG, "eeprom page: %d word: %d", page, world_addr);

    /* Data */
    i2c_master_write(cmd, data, size, 1);
    i2c_master_stop(cmd);
    err = i2c_master_cmd_begin(i2c_master_port, cmd, 1000/portTICK_PERIOD_MS);
    i2c_cmd_link_delete(cmd);

    xSemaphoreGive(i2c_semaphore);
  }
  return err;
}


uint8_t eeprom_read_byte(uint8_t deviceaddress, uint16_t eeaddress)
{
  uint8_t data = 0;
  if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE)
  {
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);

    /* Page address */
    uint8_t page = eeaddress / (EEPROM_PAGE_SIZE-1);
    i2c_master_write_byte(cmd, (deviceaddress<<1)|EEPROM_WRITE_ADDR|(page&0x7), 1);

    /* World address */
    uint8_t world_addr = eeaddress - (EEPROM_PAGE_SIZE * page);
    i2c_master_write_byte(cmd, world_addr, 1);

    ESP_LOGI(TAG, "eeprom page: %d word: %d", page, world_addr);

    /* Read */
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (deviceaddress<<1)|EEPROM_READ_ADDR|(page&0x7), 1);

    i2c_master_read_byte(cmd, &data, 1);
    i2c_master_stop(cmd);
    i2c_master_cmd_begin(i2c_master_port, cmd, 1000/portTICK_PERIOD_MS);
    i2c_cmd_link_delete(cmd);

    xSemaphoreGive(i2c_semaphore);
  }
  return data;
}


esp_err_t eeprom_read(uint8_t deviceaddress, uint16_t eeaddress, uint8_t* data, size_t size)
{
  esp_err_t err = ESP_FAIL;
  if (xSemaphoreTake(i2c_semaphore, (TickType_t)100) == pdTRUE)
  {
    i2c_cmd_handle_t cmd = i2c_cmd_link_create();
    i2c_master_start(cmd);

    /* Page address */
    uint8_t page = eeaddress / (EEPROM_PAGE_SIZE-1);
    i2c_master_write_byte(cmd, (deviceaddress<<1)|EEPROM_WRITE_ADDR|(page&0x7), 1);

    /* World address */
    uint8_t world_addr = eeaddress - (EEPROM_PAGE_SIZE * page);
    i2c_master_write_byte(cmd, world_addr, 1);

    /* Read */
    i2c_master_start(cmd);
    i2c_master_write_byte(cmd, (deviceaddress<<1)|EEPROM_READ_ADDR, 1);

    if (size > 1) {
      i2c_master_read(cmd, data, size-1, 0);
    }
    i2c_master_read_byte(cmd, data+size-1, 1);
    i2c_master_stop(cmd);
    err = i2c_master_cmd_begin(i2c_master_port, cmd, 1000/portTICK_PERIOD_MS);
    i2c_cmd_link_delete(cmd);

    xSemaphoreGive(i2c_semaphore);
  }
  return err;
}