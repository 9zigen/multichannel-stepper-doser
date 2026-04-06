/***
** Created by Aleksey Volkov on 19.12.2019.
***/
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

typedef struct {
    const char *name;
    const char *tz;
} app_time_zone_entry_t;

static const app_time_zone_entry_t APP_TIME_ZONES[] = {
    {"UTC", "UTC0"},
    {"Europe/London", "GMT0BST,M3.5.0/1,M10.5.0"},
    {"Europe/Dublin", "IST-1GMT0,M10.5.0,M3.5.0/1"},
    {"Europe/Lisbon", "WET0WEST,M3.5.0/1,M10.5.0"},
    {"Europe/Madrid", "CET-1CEST,M3.5.0/2,M10.5.0/3"},
    {"Europe/Paris", "CET-1CEST,M3.5.0/2,M10.5.0/3"},
    {"Europe/Berlin", "CET-1CEST,M3.5.0/2,M10.5.0/3"},
    {"Europe/Rome", "CET-1CEST,M3.5.0/2,M10.5.0/3"},
    {"Europe/Athens", "EET-2EEST,M3.5.0/3,M10.5.0/4"},
    {"Europe/Helsinki", "EET-2EEST,M3.5.0/3,M10.5.0/4"},
    {"Europe/Kyiv", "EET-2EEST,M3.5.0/3,M10.5.0/4"},
    {"Europe/Istanbul", "<+03>-3"},
    {"Europe/Moscow", "MSK-3"},
    {"America/New_York", "EST5EDT,M3.2.0/2,M11.1.0/2"},
    {"America/Chicago", "CST6CDT,M3.2.0/2,M11.1.0/2"},
    {"America/Denver", "MST7MDT,M3.2.0/2,M11.1.0/2"},
    {"America/Phoenix", "MST7"},
    {"America/Los_Angeles", "PST8PDT,M3.2.0/2,M11.1.0/2"},
    {"America/Anchorage", "AKST9AKDT,M3.2.0/2,M11.1.0/2"},
    {"Pacific/Honolulu", "HST10"},
    {"America/Sao_Paulo", "<-03>3"},
    {"America/Argentina/Buenos_Aires", "<-03>3"},
    {"Africa/Johannesburg", "SAST-2"},
    {"Asia/Dubai", "<+04>-4"},
    {"Asia/Karachi", "PKT-5"},
    {"Asia/Kolkata", "IST-5:30"},
    {"Asia/Dhaka", "<+06>-6"},
    {"Asia/Bangkok", "<+07>-7"},
    {"Asia/Singapore", "<+08>-8"},
    {"Asia/Hong_Kong", "HKT-8"},
    {"Asia/Shanghai", "CST-8"},
    {"Asia/Tokyo", "JST-9"},
    {"Asia/Seoul", "KST-9"},
    {"Australia/Perth", "AWST-8"},
    {"Australia/Adelaide", "ACST-9:30ACDT,M10.1.0/2,M4.1.0/3"},
    {"Australia/Sydney", "AEST-10AEDT,M10.1.0/2,M4.1.0/3"},
    {"Pacific/Auckland", "NZST-12NZDT,M9.5.0/2,M4.1.0/3"},
    {"Etc/GMT+12", "GMT+12"},
    {"Etc/GMT+11", "GMT+11"},
    {"Etc/GMT+10", "GMT+10"},
    {"Etc/GMT+9", "GMT+9"},
    {"Etc/GMT+8", "GMT+8"},
    {"Etc/GMT+7", "GMT+7"},
    {"Etc/GMT+6", "GMT+6"},
    {"Etc/GMT+5", "GMT+5"},
    {"Etc/GMT+4", "GMT+4"},
    {"Etc/GMT+3", "GMT+3"},
    {"Etc/GMT+2", "GMT+2"},
    {"Etc/GMT+1", "GMT+1"},
    {"Etc/GMT", "GMT0"},
    {"Etc/GMT-1", "GMT-1"},
    {"Etc/GMT-2", "GMT-2"},
    {"Etc/GMT-3", "GMT-3"},
    {"Etc/GMT-4", "GMT-4"},
    {"Etc/GMT-5", "GMT-5"},
    {"Etc/GMT-6", "GMT-6"},
    {"Etc/GMT-7", "GMT-7"},
    {"Etc/GMT-8", "GMT-8"},
    {"Etc/GMT-9", "GMT-9"},
    {"Etc/GMT-10", "GMT-10"},
    {"Etc/GMT-11", "GMT-11"},
    {"Etc/GMT-12", "GMT-12"},
    {"Etc/GMT-13", "GMT-13"},
    {"Etc/GMT-14", "GMT-14"},
};

static const char *app_time_lookup_tz(const char *time_zone_name)
{
    if (time_zone_name == NULL || time_zone_name[0] == '\0') {
        return "UTC0";
    }

    for (size_t i = 0; i < sizeof(APP_TIME_ZONES) / sizeof(APP_TIME_ZONES[0]); ++i) {
        if (strcmp(APP_TIME_ZONES[i].name, time_zone_name) == 0) {
            return APP_TIME_ZONES[i].tz;
        }
    }

    return NULL;
}

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

    services_t *services = get_service_config();
    const char *tz_spec = app_time_lookup_tz(services->time_zone);
    if (tz_spec == NULL) {
        ESP_LOGW(TAG, "Unknown time zone '%s'. Falling back to UTC.", services->time_zone);
        tz_spec = "UTC0";
    }

    setenv("TZ", tz_spec, 1);
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
