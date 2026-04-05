#pragma once

#include <stdbool.h>

#include "esp_err.h"

#define MCP7940_ADDRESS           0x6F
#define MCP7940_RTCSEC            0x00
#define MCP7940_RTCMIN            0x01
#define MCP7940_RTCHOUR           0x02
#define MCP7940_RTCWKDAY          0x03
#define MCP7940_RTCDATE           0x04
#define MCP7940_RTCMTH            0x05
#define MCP7940_RTCYEAR           0x06
#define MCP7940_CONTROL           0x07
#define MCP7940_OSCTRIM           0x08
#define MCP7940_ALM0SEC           0x0A
#define MCP7940_ALM0MIN           0x0B
#define MCP7940_ALM0HOUR          0x0C
#define MCP7940_ALM0WKDAY         0x0D
#define MCP7940_ALM0DATE          0x0E
#define MCP7940_ALM0MTH           0x0F
#define MCP7940_ALM1SEC           0x11
#define MCP7940_ALM1MIN           0x12
#define MCP7940_ALM1HOUR          0x13
#define MCP7940_ALM1WKDAY         0x14
#define MCP7940_ALM1DATE          0x15
#define MCP7940_ALM1MTH           0x16
#define MCP7940_PWRDNMIN          0x18
#define MCP7940_PWRDNHOUR         0x19
#define MCP7940_PWRDNDATE         0x1A
#define MCP7940_PWRDNMTH          0x1B
#define MCP7940_PWRUPMIN          0x1C
#define MCP7940_PWRUPHOUR         0x1D
#define MCP7940_PWRUPDATE         0x1E
#define MCP7940_PWRUPMTH          0x1F
#define MCP7940_RAM_ADDRESS       0x20
#define MCP7940_RAM_BYTES         64
#define MCP7940_ST                7
#define MCP7940_12_24             6
#define MCP7940_AM_PM             5
#define MCP7940_OSCRUN            5
#define MCP7940_PWRFAIL           4
#define MCP7940_VBATEN            3
#define MCP7940_LPYR              5
#define MCP7940_OUT               7
#define MCP7940_SQWEN             6
#define MCP7940_ALM1EN            5
#define MCP7940_ALM0EN            4
#define MCP7940_EXTOSC            3
#define MCP7940_CRSTRIM           2
#define MCP7940_SQWFS1            1
#define MCP7940_SQWFS0            0
#define MCP7940_SIGN              7
#define MCP7940_ALMPOL            7
#define MCP7940_ALM0IF            3
#define MCP7940_ALM1IF            3
#define SECONDS_PER_DAY           86400
#define SECONDS_FROM_1970_TO_2000 946684800

typedef struct {
    uint8_t year;
    uint8_t month;
    uint8_t weekday;
    uint8_t day;
    uint8_t is_12h;
    uint8_t is_PM;
    uint8_t hour;
    uint8_t min;
    uint8_t sec;
} datetime_t;

void mcp7940_init(void);
esp_err_t mcp7940_probe(void);
bool mcp7940_is_available(void);
void mcp7940_get_datetime(datetime_t *datetime);
void mcp7940_set_datetime(datetime_t *datetime);
esp_err_t mcp7940_read_ram(uint8_t offset, uint8_t *buf, uint8_t len);
esp_err_t mcp7940_write_ram(uint8_t offset, uint8_t *buf, uint8_t len);
