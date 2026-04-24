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

#include "app_events.h"
#include "app_time.h"
#include "main.h"
#include "connect.h"
#include "app_settings.h"
#include "i2c_driver.h"

static const char *TAG = "RTC";

typedef enum {
    APP_TIME_STATE_NOT_STARTED = 0,
    APP_TIME_STATE_RTC_CHECK,
    APP_TIME_STATE_RTC_VALID,
    APP_TIME_STATE_WAITING_WIFI,
    APP_TIME_STATE_SNTP_SYNCING,
    APP_TIME_STATE_VALID,
    APP_TIME_STATE_DEGRADED,
} app_time_state_t;

static uint8_t ntp_sync = 0;
static const char *rtc_backend = "System clock";
static bool rtc_fallback = true;
static bool time_valid = false;
static app_time_state_t time_state = APP_TIME_STATE_NOT_STARTED;
static esp_event_handler_instance_t services_updated_event_ctx;
static bool services_event_registered = false;
static TaskHandle_t ntp_wait_task_handle = NULL;

#define APP_TIME_VALID_YEAR_MIN 2024
#define APP_TIME_SNTP_WAIT_RETRIES 15
#define APP_TIME_SNTP_WAIT_INTERVAL_MS 2000

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

static const char *app_time_state_name(app_time_state_t state);
static void app_time_set_state(app_time_state_t state);
static void initialize_sntp(services_t *config);
static void app_time_reconfigure_services(const services_t *services, bool restart_sntp);
static void app_time_finalize_ntp_sync(void);
static bool app_time_wait_for_wifi(uint32_t timeout_ms);
static bool app_time_wait_for_sntp_sync(uint32_t timeout_ms);
static void app_time_cancel_ntp_wait_task(void);
static void app_time_start_ntp_wait_task(void);
static void app_time_apply_ntp_settings(const services_t *services, bool async_wait);
static void app_time_wait_for_sync_task(void *arg);
static void app_time_sync_ntp_at_startup(void);

static const char *app_time_state_name(app_time_state_t state)
{
    switch (state) {
        case APP_TIME_STATE_NOT_STARTED:
            return "not_started";
        case APP_TIME_STATE_RTC_CHECK:
            return "rtc_check";
        case APP_TIME_STATE_RTC_VALID:
            return "rtc_valid";
        case APP_TIME_STATE_WAITING_WIFI:
            return "waiting_wifi";
        case APP_TIME_STATE_SNTP_SYNCING:
            return "sntp_syncing";
        case APP_TIME_STATE_VALID:
            return "valid";
        case APP_TIME_STATE_DEGRADED:
            return "degraded";
        default:
            return "unknown";
    }
}

static void app_time_set_state(app_time_state_t state)
{
    if (time_state == state) {
        return;
    }

    ESP_LOGI(TAG, "Time state: %s -> %s", app_time_state_name(time_state), app_time_state_name(state));
    time_state = state;
}

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

static bool app_time_is_datetime_valid(const struct tm *timeinfo)
{
    if (timeinfo == NULL) {
        return false;
    }

    const int year = timeinfo->tm_year + 1900;
    return year >= APP_TIME_VALID_YEAR_MIN;
}

static void app_time_refresh_validity_from_system_clock(void)
{
    time_t now = 0;
    struct tm timeinfo = {0};
    time(&now);
    localtime_r(&now, &timeinfo);
    time_valid = app_time_is_datetime_valid(&timeinfo);
    app_time_set_state(time_valid ? APP_TIME_STATE_VALID : APP_TIME_STATE_DEGRADED);
}

static void app_time_apply_timezone(const services_t *services)
{
    const char *tz_spec = app_time_lookup_tz(services != NULL ? services->time_zone : NULL);
    if (tz_spec == NULL) {
        ESP_LOGW(TAG, "Unknown time zone '%s'. Falling back to UTC.", services != NULL ? services->time_zone : "");
        tz_spec = "UTC0";
    }

    setenv("TZ", tz_spec, 1);
    tzset();
    ESP_LOGI(TAG, "new TZ is: %s", getenv("TZ"));
}

static bool app_time_ntp_enabled(const services_t *services)
{
    return services != NULL && services->enable_ntp && strlen(services->ntp_server) > 5;
}

static void app_time_stop_sntp(void)
{
    app_time_cancel_ntp_wait_task();

    if (esp_sntp_enabled()) {
        ESP_LOGI(TAG, "Stopping SNTP");
        esp_sntp_stop();
    }

    ntp_sync = 0;
}

static void app_time_apply_ntp_settings(const services_t *services, bool async_wait)
{
    if (services == NULL) {
        return;
    }

    app_time_stop_sntp();

    if (app_time_ntp_enabled(services)) {
        initialize_sntp((services_t *)services);
        /* Runtime settings changes must not block the HTTP handler/event loop. */
        if (async_wait) {
            app_time_start_ntp_wait_task();
        }
    } else {
        ESP_LOGI(TAG, "SNTP disabled by services settings");
    }

    app_time_refresh_validity_from_system_clock();
}

static void app_time_reconfigure_services(const services_t *services, bool restart_sntp)
{
    if (services == NULL) {
        return;
    }

    app_time_apply_timezone(services);

    if (restart_sntp) {
        app_time_apply_ntp_settings(services, true);
    }
}

static void app_time_on_services_updated(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_base;
    (void)event_id;

    const services_t *services = event_data != NULL ? (const services_t *)event_data : get_service_config();
    ESP_LOGI(TAG, "Applying updated services settings to time subsystem");
    app_time_reconfigure_services(services, true);
}

static void app_time_register_services_handler(void)
{
    if (services_event_registered) {
        return;
    }

    app_events_register_handler(SERVICES_UPDATED, NULL, app_time_on_services_updated, &services_updated_event_ctx);
    services_event_registered = true;
}

static void time_sync_notification_cb(struct timeval *tv)
{
    (void)tv;
    ntp_sync = 1;
    app_time_refresh_validity_from_system_clock();
    ESP_LOGI(TAG, "Notification of a time synchronization event");
}

static void initialize_sntp(services_t *config)
{
    ESP_LOGI(TAG, "Starting SNTP with server %s", config->ntp_server);
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, config->ntp_server);
    esp_sntp_set_time_sync_notification_cb(time_sync_notification_cb);
    esp_sntp_init();
}

static void app_time_finalize_ntp_sync(void)
{
    time_t now = 0;
    struct tm timeinfo = {0};
    char strftime_buf[64];

    time(&now);
    localtime_r(&now, &timeinfo);
    time_valid = app_time_is_datetime_valid(&timeinfo);
    ntp_sync = time_valid ? 1 : ntp_sync;
    app_time_set_state(time_valid ? APP_TIME_STATE_VALID : APP_TIME_STATE_DEGRADED);

    strftime(strftime_buf, sizeof(strftime_buf), "%c", &timeinfo);
    ESP_LOGI(TAG, "The NTP date/time is: %s", strftime_buf);

    if (!time_valid) {
        return;
    }

    datetime_t datetime = {0};
    bool i2c_available = i2c_is_supported() && i2c_is_initialized();
    bool rtc_chip_available = i2c_available && (mcp7940_probe() == ESP_OK);

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

static void app_time_cancel_ntp_wait_task(void)
{
    if (ntp_wait_task_handle != NULL) {
        vTaskDelete(ntp_wait_task_handle);
        ntp_wait_task_handle = NULL;
    }
}

static bool app_time_wait_for_wifi(uint32_t timeout_ms)
{
    app_time_set_state(APP_TIME_STATE_WAITING_WIFI);

    EventBits_t bits = xEventGroupWaitBits(
        wifi_event_group,
        WIFI_CONNECTED_BIT,
        false,
        true,
        pdMS_TO_TICKS(timeout_ms));

    return (bits & WIFI_CONNECTED_BIT) != 0;
}

static bool app_time_wait_for_sntp_sync(uint32_t timeout_ms)
{
    const TickType_t deadline = xTaskGetTickCount() + pdMS_TO_TICKS(timeout_ms);

    app_time_set_state(APP_TIME_STATE_SNTP_SYNCING);
    ESP_LOGI(TAG, "Waiting up to %lu ms for SNTP sync", (unsigned long)timeout_ms);

    while (xTaskGetTickCount() < deadline) {
        sntp_sync_status_t sync_status = esp_sntp_get_sync_status();
        if (ntp_sync || sync_status == SNTP_SYNC_STATUS_COMPLETED) {
            app_time_finalize_ntp_sync();
            return app_time_is_valid();
        }

        vTaskDelay(pdMS_TO_TICKS(500));
    }

    app_time_refresh_validity_from_system_clock();
    return false;
}

static void app_time_start_ntp_wait_task(void)
{
    if (ntp_wait_task_handle != NULL) {
        return;
    }

    BaseType_t created = xTaskCreate(
        app_time_wait_for_sync_task,
        "app_time_sntp",
        4096,
        NULL,
        tskIDLE_PRIORITY + 1,
        &ntp_wait_task_handle);

    if (created != pdPASS) {
        ntp_wait_task_handle = NULL;
        ESP_LOGW(TAG, "Failed to create SNTP wait task");
    }
}

static void app_time_wait_for_sync_task(void *arg)
{
    (void)arg;

    /*
     * This task is created only for runtime NTP changes. Startup uses the same
     * wait/finalize helpers synchronously so boot can seed RTC before schedules run.
     */
    if (!app_time_ntp_enabled(get_service_config())) {
        ntp_wait_task_handle = NULL;
        vTaskDelete(NULL);
        return;
    }

    if (!app_time_wait_for_wifi(30000)) {
        ESP_LOGW(TAG, "Timed out waiting for Wi-Fi before SNTP sync");
        ntp_wait_task_handle = NULL;
        vTaskDelete(NULL);
        return;
    }

    if (!app_time_wait_for_sntp_sync(APP_TIME_SNTP_WAIT_RETRIES * APP_TIME_SNTP_WAIT_INTERVAL_MS)) {
        ESP_LOGW(TAG, "SNTP sync did not complete after enabling NTP at runtime");
    }

    ntp_wait_task_handle = NULL;
    vTaskDelete(NULL);
}

static void app_time_sync_ntp_at_startup(void)
{
    services_t *services = get_service_config();

    if (!app_time_ntp_enabled(services)) {
        app_time_refresh_validity_from_system_clock();
        return;
    }

    if (!app_time_wait_for_wifi(30000)) {
        ESP_LOGW(TAG, "Timed out waiting for Wi-Fi before startup SNTP sync");
        app_time_refresh_validity_from_system_clock();
        return;
    }

    app_time_apply_ntp_settings(services, false);
    if (!app_time_wait_for_sntp_sync(APP_TIME_SNTP_WAIT_RETRIES * APP_TIME_SNTP_WAIT_INTERVAL_MS)) {
        ESP_LOGW(TAG, "Startup SNTP sync did not complete");
    }
}

void init_clock(void)
{
    time_t now = 0;
    struct tm timeinfo = {0};
    char strftime_buf[64];

    services_t *services = get_service_config();
    time_valid = false;
    app_time_set_state(APP_TIME_STATE_RTC_CHECK);
    app_time_register_services_handler();
    app_time_reconfigure_services(services, false);

    /*
     * Boot priority:
     * 1. Restore the system clock from RTC when the chip is present.
     * 2. If NTP is enabled, refresh that clock from the network.
     * 3. Keep schedules paused when neither source can provide a sane date.
     */
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

        if (!app_time_is_datetime_valid(&timeinfo)) {
            ESP_LOGW(TAG, "RTC time is not valid yet.");
            app_time_set_state(APP_TIME_STATE_DEGRADED);
        } else {
            time_valid = true;
            app_time_set_state(APP_TIME_STATE_RTC_VALID);
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
        app_time_sync_ntp_at_startup();
    } else {
        ESP_LOGI(TAG, "NTP Disabled. Will use local available time source.");
    }

    time(&now);
    localtime_r(&now, &timeinfo);
    time_valid = app_time_is_datetime_valid(&timeinfo);
    app_time_set_state(time_valid ? APP_TIME_STATE_VALID : APP_TIME_STATE_DEGRADED);
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

bool app_time_is_valid(void)
{
    return time_valid;
}

const char *app_time_warning_message(void)
{
    if (time_valid) {
        return "";
    }

    return "Time is not set. Periodic schedules are paused until RTC or NTP provides a valid date.";
}
