/***
** Created by Aleksey Volkov on 19.12.2019.
***/
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <freertos/event_groups.h>
#include <esp_timer.h>
#include "app_time_rtc_mcp7940.h"

#include "esp_log.h"
#include "esp_system.h"
#include "esp_sntp.h"

#include "app_time.h"
#include "main.h"
#include "connect.h"
#include "app_settings.h"
#include "i2c_driver.h"

static const char *TAG = "RTC";

static uint8_t ntp_sync = 0;
static const char *rtc_backend = "System clock";
static bool rtc_fallback = true;

static void time_sync_notification_cb(struct timeval *tv)
{
    (void)tv;
    ESP_LOGI(TAG, "Notification of a time synchronization event");
}

static void initialize_sntp(services_t *config)
{
    ESP_LOGI(TAG, "Initializing SNTP");
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, config->ntp_server);
    esp_sntp_set_time_sync_notification_cb(time_sync_notification_cb);
    esp_sntp_init();
}

static void obtain_time(void)
{
    xEventGroupWaitBits(wifi_event_group, WIFI_CONNECTED_BIT, false, true, 1000 * 30 / portTICK_PERIOD_MS);

    services_t *services = get_service_config();

    if (services->enable_ntp && strlen(services->ntp_server) > 5) {
        initialize_sntp(services);
    }

    time_t now = 0;
    struct tm timeinfo = {0};
    int retry = 0;
    const int retry_count = 10;

    while (esp_sntp_get_sync_status() == SNTP_SYNC_STATUS_RESET && ++retry < retry_count) {
        ESP_LOGI(TAG, "Waiting for system time to be set... (%d/%d)", retry, retry_count);
        vTaskDelay(2000 / portTICK_PERIOD_MS);
    }

    time(&now);
    localtime_r(&now, &timeinfo);

    if (retry < retry_count) {
        ntp_sync = 1;
    }
}

void init_clock(void)
{
    time_t now;
    struct tm timeinfo;
    char strftime_buf[64];
    char tz_buff[32];

    services_t *services = get_service_config();

    if (services->utc_offset > 0) {
        snprintf(tz_buff, sizeof(tz_buff), "UTC-%d", services->utc_offset + ((uint8_t)services->ntp_dst));
    } else {
        uint8_t offset = fabs((double)services->utc_offset);
        snprintf(tz_buff, sizeof(tz_buff), "UTC+%d", offset + ((uint8_t)services->ntp_dst));
    }
    setenv("TZ", tz_buff, 1);
    tzset();
    ESP_LOGI(TAG, "new TZ is: %s", getenv("TZ"));

    datetime_t datetime = {0};
    bool i2c_available = i2c_is_supported() && i2c_is_initialized();
    bool rtc_chip_available = i2c_available && (mcp7940_probe() == ESP_OK);
    if (rtc_chip_available) {
        mcp7940_get_datetime(&datetime);

        timeinfo.tm_year = datetime.year + 2000 - 1900;
        timeinfo.tm_mon = datetime.month - 1;
        timeinfo.tm_mday = datetime.day;
        timeinfo.tm_wday = datetime.weekday - 1;
        timeinfo.tm_hour = datetime.hour;
        timeinfo.tm_min = datetime.min;
        timeinfo.tm_sec = datetime.sec;

        time_t stm_time = mktime(&timeinfo);
        struct timeval stm_now = {.tv_sec = stm_time};
        settimeofday(&stm_now, NULL);

        strftime(strftime_buf, sizeof(strftime_buf), "%c", &timeinfo);
        ESP_LOGI(TAG, "The current date/time is: %s", strftime_buf);

        if (timeinfo.tm_year < (2020 - 1900)) {
            ESP_LOGI(TAG, "Time is not set yet.");
        }

        rtc_backend = "MCP7940 RTC";
        rtc_fallback = false;
    } else if (!i2c_available) {
        ESP_LOGW(TAG, "I2C not supported. Falling back to network/system time.");
        rtc_backend = services->enable_ntp ? "NTP fallback" : "System clock";
        rtc_fallback = true;
    } else {
        ESP_LOGW(TAG, "MCP7940 not detected. Falling back to network/system time.");
        rtc_backend = services->enable_ntp ? "NTP fallback" : "System clock";
        rtc_fallback = true;
    }

    if (services->enable_ntp) {
        ESP_LOGI(TAG, "Connecting to WiFi and getting time over NTP.");
        obtain_time();

        if (ntp_sync) {
            time(&now);
            localtime_r(&now, &timeinfo);

            strftime(strftime_buf, sizeof(strftime_buf), "%c", &timeinfo);
            ESP_LOGI(TAG, "The NTP date/time is: %s", strftime_buf);

            datetime.year = 1900 + timeinfo.tm_year - 2000;
            datetime.month = timeinfo.tm_mon + 1;
            datetime.day = timeinfo.tm_mday;
            datetime.weekday = timeinfo.tm_wday + 1;
            datetime.hour = timeinfo.tm_hour;
            datetime.min = timeinfo.tm_min;
            datetime.sec = timeinfo.tm_sec;

            if (rtc_chip_available) {
                mcp7940_set_datetime(&datetime);
                rtc_backend = "MCP7940 RTC";
                rtc_fallback = false;
            } else {
                rtc_backend = "NTP fallback";
                rtc_fallback = true;
            }
        }
    } else {
        ESP_LOGI(TAG, "NTP Disabled. Will use local available time source.");
    }

    time(&now);
    localtime_r(&now, &timeinfo);
    strftime(strftime_buf, sizeof(strftime_buf), "%c", &timeinfo);
    ESP_LOGI(TAG, "The Local date/time is: %s", strftime_buf);
}

void print_time(void)
{
    time_t now;
    struct tm timeinfo;
    char strftime_buf[64];

    time(&now);
    localtime_r(&now, &timeinfo);

    strftime(strftime_buf, sizeof(strftime_buf), "%c", &timeinfo);
    ESP_LOGI(TAG, "The current date/time in %s is: %s", getenv("TZ"), strftime_buf);
}

void get_time_string(char *time_string)
{
    time_t now;
    struct tm timeinfo;

    if (time_string == NULL) {
        return;
    }

    time(&now);
    localtime_r(&now, &timeinfo);
    strftime(time_string, 6, "%R", &timeinfo);
}

void det_time_string_since_boot(char *time_string)
{
    uint64_t since_boot = (uint64_t)esp_timer_get_time();
    uint64_t seconds = since_boot / 1000000;
    uint16_t days = seconds / 86400;
    uint16_t remind_seconds = seconds % 86400;
    uint8_t hours = remind_seconds / 3600;
    remind_seconds = remind_seconds % 3600;
    uint8_t minutes = remind_seconds / 60;
    remind_seconds = remind_seconds % 60;

    sniprintf(time_string, 32, "%d days %d:%d:%d", days, hours, minutes, remind_seconds);
}

uint8_t get_ntp_sync_status(void)
{
    return ntp_sync;
}

const char *get_rtc_backend_name(void)
{
    return rtc_backend;
}

bool rtc_using_fallback(void)
{
    return rtc_fallback;
}
