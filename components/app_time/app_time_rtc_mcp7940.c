/***
** Created by Aleksey Volkov on 22.03.2020.
***/

#include <string.h>

#include <esp_log.h>
#include <esp_system.h>

#include "driver/i2c.h"

#include "app_settings.h"
#include "board.h"
#include "i2c_driver.h"
#include "app_time_rtc_mcp7940.h"

static bool mcp7940_available = false;

static uint8_t mcp7940_device_address(void)
{
    return get_rtc_i2c_addr();
}

esp_err_t mcp7940_probe(void)
{
    uint8_t value = 0;
    esp_err_t err = i2c_read_reg_data(mcp7940_device_address(), MCP7940_RTCSEC, &value, 1);
    mcp7940_available = (err == ESP_OK);
    return err;
}

bool mcp7940_is_available(void)
{
    return mcp7940_available;
}

static uint8_t read_register(uint8_t reg_address)
{
    return i2c_read_reg_8bit(mcp7940_device_address(), reg_address);
}

static void write_register(uint8_t reg_address, uint8_t value)
{
    ESP_ERROR_CHECK(i2c_reg_write_8bit(mcp7940_device_address(), reg_address, value));
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
    if (mcp7940_probe() != ESP_OK) {
        return;
    }

    if (!is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN)) {
        set_bit(MCP7940_RTCSEC, MCP7940_ST);
        while (!is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN)) {}
    }

    if (!is_set_bit(MCP7940_RTCWKDAY, MCP7940_VBATEN)) {
        set_bit(MCP7940_RTCWKDAY, MCP7940_VBATEN);
    }
}

void mcp7940_get_datetime(datetime_t *datetime)
{
    if (!mcp7940_available) {
        memset(datetime, 0, sizeof(*datetime));
        return;
    }

    uint8_t data[7];
    i2c_read_reg_data(mcp7940_device_address(), MCP7940_RTCSEC, data, 7);

    uint8_t sec = data[0] & 0xF;
    sec += ((data[0] & 0x70) >> 4) * 10;

    uint8_t min = data[1] & 0xF;
    min += ((data[1] & 0x70) >> 4) * 10;

    uint8_t is_12h = data[2] & 0x40 ? 1 : 0;
    uint8_t is_PM = data[2] & 0x20 ? 1 : 0;

    uint8_t hour = data[2] & 0xF;
    if (is_12h) {
        hour += ((data[2] & 0x10) >> 4) * 10;
    } else {
        hour += ((data[2] & 0x30) >> 4) * 10;
    }

    uint8_t weekday = data[3] & 0x7;

    uint8_t day = data[4] & 0xF;
    day += ((data[4] & 0x30) >> 4) * 10;

    uint8_t month = data[5] & 0xF;
    month += ((data[5] & 0x10) >> 4) * 10;

    uint8_t year = data[6] & 0xF;
    year += ((data[6] & 0xF0) >> 4) * 10;

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
    uint8_t ones = num % 10;
    uint8_t tens = ((num / 10) % 10) << 4;
    return tens + ones;
}

void mcp7940_set_datetime(datetime_t *datetime)
{
    if (!mcp7940_available) {
        return;
    }

    uint8_t data[8];
    i2c_read_reg_data(mcp7940_device_address(), MCP7940_RTCSEC, data, 7);

    if (!is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN)) {
        clear_bit(MCP7940_RTCSEC, MCP7940_ST);
        while (is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN)) {}
    }

    data[0] &= 0x80;
    data[0] |= dec2bcd(datetime->sec);

    data[1] &= 0x80;
    data[1] |= dec2bcd(datetime->min);

    if (datetime->is_12h && datetime->is_PM) {
        data[2] |= 0x40;
        data[2] |= 0x20;
    } else if (datetime->is_12h && !datetime->is_PM) {
        data[2] |= 0x40;
        data[2] &= ~0x20;
    } else {
        data[2] &= ~0x40;
        data[2] &= ~0x20;
    }

    data[2] &= 0xE0;
    data[2] |= dec2bcd(datetime->hour);

    data[3] &= 0xF8;
    data[3] |= dec2bcd(datetime->weekday);

    data[4] &= 0xC0;
    data[4] |= dec2bcd(datetime->day);

    data[5] &= 0xE0;
    data[5] |= dec2bcd(datetime->month);

    data[6] &= 0x00;
    data[6] |= dec2bcd(datetime->year);

    i2c_reg_write_data(mcp7940_device_address(), MCP7940_RTCSEC, data, 7);

    if (!is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN)) {
        set_bit(MCP7940_RTCSEC, MCP7940_ST);
        while (!is_set_bit(MCP7940_RTCWKDAY, MCP7940_OSCRUN)) {}
    }
}

esp_err_t mcp7940_read_ram(uint8_t offset, uint8_t *buf, uint8_t len)
{
    if (!mcp7940_available) {
        return ESP_ERR_NOT_FOUND;
    }
    if (offset + len > MCP7940_RAM_BYTES) {
        return ESP_ERR_NO_MEM;
    }

    return i2c_read_reg_data(mcp7940_device_address(), MCP7940_RAM_ADDRESS + offset, buf, len);
}

esp_err_t mcp7940_write_ram(uint8_t offset, uint8_t *buf, uint8_t len)
{
    if (!mcp7940_available) {
        return ESP_ERR_NOT_FOUND;
    }
    if (offset + len > MCP7940_RAM_BYTES) {
        return ESP_ERR_NO_MEM;
    }

    return i2c_reg_write_data(mcp7940_device_address(), MCP7940_RAM_ADDRESS + offset, buf, len);
}
