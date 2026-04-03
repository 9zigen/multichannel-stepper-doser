/***
** Created by Aleksey Volkov on 22.03.2020.
***/

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_system.h"
#include <esp_log.h>
#include "driver/i2c.h"

#include "board.h"
#include "i2c_driver.h"
#include "mcp7940.h"

//static const char *TAG="MCP7940";

const uint8_t dev_address = 0x6f;

static uint8_t read_register(uint8_t reg_address)
{
  return i2c_read_reg_8bit(dev_address, reg_address);
}

static void write_register(uint8_t reg_address, uint8_t value)
{
  ESP_ERROR_CHECK(i2c_reg_write_8bit(dev_address, reg_address, value));
}

static void clear_bit(uint8_t reg_address, uint8_t bit)
{
  uint8_t reg = read_register(reg_address);
  reg &= ~(1 << bit);
  write_register(reg_address, reg);
}

static void set_bit(uint8_t reg_address, uint8_t bit)
{
  uint8_t reg = read_register(reg_address);
  reg |= 1 << bit;
  write_register(reg_address, reg);
}

static bool is_set_bit(uint8_t reg_address, uint8_t bit)
{
  return read_register(reg_address) & (1 << bit);
}

void mcp7940_init(void)
{
  /* Check if oscillator is running */
  if (!is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN))
  {
    /* Start Oscillator */
    set_bit(MCP7940_RTCSEC, MCP7940_ST);

    /* Wait while oscillator start */
    while(!is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN)) {};
  }

  /* Check if Backup Battery enabled */
  if (!is_set_bit(MCP7940_RTCWKDAY, MCP7940_VBATEN))
  {
    /* VBAT input enable */
    set_bit(MCP7940_RTCWKDAY, MCP7940_VBATEN);
  }
}

void mcp7940_get_datetime(datetime_t *datetime)
{
  uint8_t data[7];

  /* Read REGs 0x00 - 0x06 */
  i2c_read_reg_data(dev_address, MCP7940_RTCSEC, data, 7);

  /* Sec */
  uint8_t sec = data[0] & 0xF;            /* Second’s Ones Digit Contains a value from 0 to 9 */
  sec += ((data[0] & 0x70) >> 4) * 10;    /* Second’s Tens Digit Contains a value from 0 to 5 */

  /* Min */
  uint8_t min = data[1] & 0xF;            /* Minute’s Ones Digit Contains a value from 0 to 9 */
  min += ((data[1] & 0x70) >> 4) * 10;    /* Minute’s Tens Digit Contains a value from 0 to 5 */

  /* 12-hour format */
  uint8_t is_12h = data[2] & 0x40? 1:0;   /* true if 12h format */

  /* AM/PM */
  uint8_t is_PM = data[2] & 0x20? 1:0;    /* true if PM */

  /* Hour */
  uint8_t hour = data[2] & 0xF;           /* Hour’s Ones Digit Contains a value from 0 to 9 */
  if (is_12h)
  {
    hour += ((data[2] & 0x10) >> 4) * 10;   /* Hour’s Tens Digit Contains a value from 0 to 1 */
  } else {
    hour += ((data[2] & 0x30) >> 4) * 10;   /* Hour’s Tens Digit Contains a value from 0 to 2 */
  }

  /* Weekday */
  uint8_t weekday = data[3] & 0x7;        /* Weekday Contains a value from 1 to 7. */

  /* Day */
  uint8_t day = data[4] & 0xF;            /* Date’s Ones Digit Contains a value from 0 to 9 */
  day += ((data[4] & 0x30) >> 4) * 10;    /* Date’s Tens Digit Contains a value from 0 to 3 */

  /* Month */
  uint8_t month = data[5] & 0xF;          /* Month’s Ones Digit Contains a value from 0 to 9 */
  month += ((data[5] & 0x10) >> 4) * 10;  /* Month’s Tens Digit Contains a value from 0 to 1 */

  /* Year */
  uint8_t year = data[6] & 0xF;           /* Year’s Ones Digit Contains a value from 0 to 9 */
  year += ((data[6] & 0xF0) >> 4) * 10;   /* Year’s Tens Digit Contains a value from 0 to 9 */

  datetime->year = year;
  datetime->month = month;
  datetime->weekday = weekday;
  datetime->day = day;
  datetime->is_12h = is_12h;
  datetime->is_PM = is_PM;
  datetime->hour = hour;
  datetime->min = min;
  datetime->sec = sec;
}

static uint8_t dec2bcd(uint8_t num)
{
  uint8_t ones = 0;
  uint8_t tens = 0;
  uint8_t temp = 0;

  ones = num % 10;
  temp = num / 10;
  tens = (temp % 10) << 4;
  return (tens + ones);
}

void mcp7940_set_datetime(datetime_t *datetime)
{
  uint8_t data[8];

  /* Read REGs 0x00 - 0x06 */
  i2c_read_reg_data(dev_address, MCP7940_RTCSEC, data, 7);

  /* Check if oscillator is running */
  if (!is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN))
  {
    /* Stop Oscillator */
    clear_bit(MCP7940_RTCSEC, MCP7940_ST);

    /* Wait while oscillator stop */
    while(is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN)) {};
  }

  /* Start REG */
  /* Sec */
  data[0] &= 0x80;                        /* clear current time val */
  data[0] |= dec2bcd(datetime->sec);      /* Second’s BCD format */

  /* Min */
  data[1] &= 0x80;                        /* clear current time val */
  data[1] |= dec2bcd(datetime->min);      /* Minute’s BCD format */

  /* AM/PM if 12-hour format */
  if (datetime->is_12h && datetime->is_PM)
  {
    data[2] |= 0x40;                      /* set 12h bit*/
    data[2] |= 0x20;                      /* set PM bit*/
  }
  else if (datetime->is_12h && !datetime->is_PM)
  {
    data[2] |= 0x40;                      /* set 12h bit */
    data[2] &= ~0x20;                     /* clear PM bit, set AM */
  } else {
    data[2] &= ~0x40;                     /* clear 12h bit, set 24h format */
    data[2] &= ~0x20;                     /* clear PM bit, used as hour */
  };

  /* Hour */
  data[2] &= 0xE0;                        /* clear current time val */
  data[2] |= dec2bcd(datetime->hour);     /* Hour’s BCD format */

  /* Weekday */
  data[3] &= 0xF8;                        /* clear current time val */
  data[3] |= dec2bcd(datetime->weekday);  /* Weekday BCD format */

  /* Day */
  data[4] &= 0xC0;                        /* clear current time val */
  data[4] |= dec2bcd(datetime->day);      /* Date’s BCD format */

  /* Month */
  data[5] &= 0xE0;                        /* clear current time val */
  data[5] |= dec2bcd(datetime->month);    /* Month’s BCD format */

  /* Year */
  data[6] &= 0x00;                        /* clear current time val */
  data[6] |= dec2bcd(datetime->year);     /* Year’s BCD format */

  i2c_reg_write_data(dev_address, MCP7940_RTCSEC, data, 7);

  /* Check if oscillator is running */
  if (!is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN))
  {
    /* Start Oscillator */
    set_bit(MCP7940_RTCSEC, MCP7940_ST);

    /* Wait while oscillator start */
    while(!is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN)) {};
  }
}

esp_err_t mcp7940_read_ram(uint8_t offset, uint8_t *buf, uint8_t len)
{
  if (offset + len > MCP7940_RAM_BYTES)
    return ESP_ERR_NO_MEM;

  return i2c_read_reg_data(dev_address, MCP7940_RAM_ADDRESS + offset, buf, len);
}

esp_err_t mcp7940_write_ram(uint8_t offset, uint8_t *buf, uint8_t len)
{
  if (offset + len > MCP7940_RAM_BYTES)
    return ESP_ERR_NO_MEM;

  return i2c_reg_write_data(dev_address, MCP7940_RAM_ADDRESS + offset, buf, len);
}