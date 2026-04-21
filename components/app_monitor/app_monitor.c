/***
** Created by Aleksey Volkov on 16.12.2019.
***/

#include <esp_mac.h>
#include <time.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/timers.h"

#include "string.h"
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_err.h"
#include "esp_system.h"

#include "app_settings.h"
#include "app_settings_storage.h"
#include "app_events.h"
#include "app_time.h"
#include "connect.h"
#include "tools.h"
#include "app_monitor.h"

static TimerHandle_t xMonitorTimer;
static const char *TAG = "MONITOR";
static system_status_t system_status = {0};
static app_status_event_t last_status_event = {0};
static bool last_status_event_valid = false;

typedef struct {
    uint8_t magic;
    uint32_t reboot_count;
} reboot_status_t;

typedef enum {
    MQTT_DISABLED = 0,
    MQTT_ENABLED_NOT_CONNECTED,
    MQTT_ENABLED_CONNECTED,
} mqtt_service_status_t;

extern mqtt_service_status_t get_mqtt_status(void);

static uint8_t monitor_storage_i2c_addr(void)
{
    return get_eeprom_i2c_addr();
}

static const char *reset_reason_to_string(esp_reset_reason_t reason)
{
    switch (reason) {
        case ESP_RST_UNKNOWN: return "ESP_RST_UNKNOWN";
        case ESP_RST_POWERON: return "ESP_RST_POWERON";
        case ESP_RST_EXT: return "ESP_RST_EXT";
        case ESP_RST_SW: return "ESP_RST_SW";
        case ESP_RST_PANIC: return "ESP_RST_PANIC";
        case ESP_RST_INT_WDT: return "ESP_RST_INT_WDT";
        case ESP_RST_TASK_WDT: return "ESP_RST_TASK_WDT";
        case ESP_RST_WDT: return "ESP_RST_WDT";
        case ESP_RST_DEEPSLEEP: return "ESP_RST_DEEPSLEEP";
        case ESP_RST_BROWNOUT: return "ESP_RST_BROWNOUT";
        case ESP_RST_SDIO: return "ESP_RST_SDIO";
#if defined(ESP_RST_USB)
        case ESP_RST_USB: return "ESP_RST_USB";
#endif
#if defined(ESP_RST_JTAG)
        case ESP_RST_JTAG: return "ESP_RST_JTAG";
#endif
#if defined(ESP_RST_EFUSE)
        case ESP_RST_EFUSE: return "ESP_RST_EFUSE";
#endif
#if defined(ESP_RST_PWR_GLITCH)
        case ESP_RST_PWR_GLITCH: return "ESP_RST_PWR_GLITCH";
#endif
#if defined(ESP_RST_CPU_LOCKUP)
        case ESP_RST_CPU_LOCKUP: return "ESP_RST_CPU_LOCKUP";
#endif
        default: return "ESP_RST_UNKNOWN";
    }
}

static void init_reboot_status(void)
{
    reboot_status_t reboot_status = {0};
    eeprom_read(monitor_storage_i2c_addr(), EEPROM_REBOOT_STATUS_ADDR, (uint8_t *)&reboot_status, sizeof(reboot_status));

    if (reboot_status.magic == EEPROM_MAGIC) {
        reboot_status.reboot_count += 1;
    } else {
        reboot_status.magic = EEPROM_MAGIC;
        reboot_status.reboot_count = 1;
    }

    system_status.reboot_count = reboot_status.reboot_count;
    snprintf(system_status.last_reboot_reason,
             sizeof(system_status.last_reboot_reason),
             "%s",
             reset_reason_to_string(esp_reset_reason()));

    eeprom_write(monitor_storage_i2c_addr(), EEPROM_REBOOT_STATUS_ADDR, (uint8_t *)&reboot_status, sizeof(reboot_status));
}

static void update_system_info(void)
{
    wifi_mode_t mode;
    if (esp_wifi_get_mode(&mode) != ESP_OK) {
        return;
    }

    memset(system_status.wifi_mode, 0, sizeof(system_status.wifi_mode));
    memset(system_status.net_address, 0, sizeof(system_status.net_address));
    memset(system_status.net_mask, 0, sizeof(system_status.net_mask));
    memset(system_status.net_gateway, 0, sizeof(system_status.net_gateway));
    memset(system_status.mac, 0, sizeof(system_status.mac));
    memset(system_status.station_ssid, 0, sizeof(system_status.station_ssid));
    memset(system_status.station_ip_address, 0, sizeof(system_status.station_ip_address));
    memset(system_status.station_mac, 0, sizeof(system_status.station_mac));
    memset(system_status.ap_ssid, 0, sizeof(system_status.ap_ssid));
    memset(system_status.ap_ip_address, 0, sizeof(system_status.ap_ip_address));
    memset(system_status.ap_mac, 0, sizeof(system_status.ap_mac));
    memset(system_status.ssid, 0, sizeof(system_status.ssid));
    if (strlen(system_status.last_reboot_reason) == 0) {
        snprintf(system_status.last_reboot_reason,
                 sizeof(system_status.last_reboot_reason),
                 "%s",
                 reset_reason_to_string(esp_reset_reason()));
    }
    system_status.station_connected = connect_station_is_connected();
    system_status.ap_clients = connect_get_ap_client_count();
    system_status.rssi = 0;

    /* TODO use NTC or MCU sensor */
    system_status.board_temperature = 32;

    if (mode == WIFI_MODE_STA) {
        snprintf(system_status.wifi_mode, sizeof(system_status.wifi_mode), "STA");
    } else if (mode == WIFI_MODE_AP) {
        snprintf(system_status.wifi_mode, sizeof(system_status.wifi_mode), "AP");
    } else if (mode == WIFI_MODE_APSTA) {
        snprintf(system_status.wifi_mode, sizeof(system_status.wifi_mode), "AP+STA");
    }

    uint8_t mac[6];
    esp_netif_ip_info_t ip;
    esp_netif_dns_info_t dns;
    memset(&ip, 0, sizeof(esp_netif_ip_info_t));
    memset(&dns, 0, sizeof(esp_netif_dns_info_t));

    esp_netif_t *sta_netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    if (sta_netif != NULL && esp_netif_get_ip_info(sta_netif, &ip) == ESP_OK) {
        snprintf(system_status.station_ip_address, sizeof(system_status.station_ip_address), IPSTR, IP2STR(&ip.ip));
        snprintf(system_status.net_address, sizeof(system_status.net_address), IPSTR, IP2STR(&ip.ip));
        snprintf(system_status.net_mask, sizeof(system_status.net_mask), IPSTR, IP2STR(&ip.netmask));
        snprintf(system_status.net_gateway, sizeof(system_status.net_gateway), IPSTR, IP2STR(&ip.gw));
        esp_wifi_get_mac(WIFI_IF_STA, (uint8_t *)&mac);
        snprintf(system_status.station_mac, sizeof(system_status.station_mac), MACSTR, MAC2STR(mac));
        snprintf(system_status.mac, sizeof(system_status.mac), MACSTR, MAC2STR(mac));

        wifi_ap_record_t ap_record;
        if (esp_wifi_sta_get_ap_info(&ap_record) == ESP_OK) {
            snprintf(system_status.station_ssid, sizeof(system_status.station_ssid), "%s", (const char *)ap_record.ssid);
            snprintf(system_status.ssid, sizeof(system_status.ssid), "%s", (const char *)ap_record.ssid);
            system_status.rssi = (uint8_t)(ap_record.rssi < 0 ? -ap_record.rssi : ap_record.rssi);
        }
    }

    if (strlen(system_status.station_ssid) == 0) {
        snprintf(system_status.station_ssid, sizeof(system_status.station_ssid), "%s", connect_get_station_ssid());
        snprintf(system_status.ssid, sizeof(system_status.ssid), "%s", connect_get_station_ssid());
    }

    memset(&ip, 0, sizeof(esp_netif_ip_info_t));
    esp_netif_t *ap_netif = esp_netif_get_handle_from_ifkey("WIFI_AP_DEF");
    if (ap_netif != NULL && esp_netif_get_ip_info(ap_netif, &ip) == ESP_OK) {
        snprintf(system_status.ap_ip_address, sizeof(system_status.ap_ip_address), IPSTR, IP2STR(&ip.ip));
        if (strlen(system_status.net_address) == 0) {
            snprintf(system_status.net_address, sizeof(system_status.net_address), IPSTR, IP2STR(&ip.ip));
            snprintf(system_status.net_mask, sizeof(system_status.net_mask), IPSTR, IP2STR(&ip.netmask));
            snprintf(system_status.net_gateway, sizeof(system_status.net_gateway), IPSTR, IP2STR(&ip.gw));
        }
        esp_wifi_get_mac(WIFI_IF_AP, (uint8_t *)&mac);
        snprintf(system_status.ap_mac, sizeof(system_status.ap_mac), MACSTR, MAC2STR(mac));
        if (strlen(system_status.mac) == 0) {
            snprintf(system_status.mac, sizeof(system_status.mac), MACSTR, MAC2STR(mac));
        }

        wifi_config_t ap_config;
        memset(&ap_config, 0, sizeof(ap_config));
        if (esp_wifi_get_config(WIFI_IF_AP, &ap_config) == ESP_OK) {
            snprintf(system_status.ap_ssid, sizeof(system_status.ap_ssid), "%s", (const char *)ap_config.ap.ssid);
        }
    }

    ESP_LOGD(TAG, "net address: %s", system_status.net_address);
    ESP_LOGD(TAG, "net mac    : %s", system_status.mac);

    system_status.free_heap = heap_caps_get_free_size(MALLOC_CAP_8BIT);

    ESP_LOGD(TAG, "MainTask   : %d", uxTaskGetStackHighWaterMark(NULL));
    ESP_LOGD(TAG, "free_heap  : %lu", system_status.free_heap);
}

static void monitor_capture_status_event(app_status_event_t *event)
{
    time_t now = 0;
    struct tm timeinfo = {0};
    mqtt_service_status_t mqtt_status;
    services_t *services = get_service_config();

    memset(event, 0, sizeof(*event));

    det_time_string_since_boot(event->up_time);
    get_time_string(event->local_time);

    time(&now);
    localtime_r(&now, &timeinfo);
    strftime(event->local_date, sizeof(event->local_date), "%Y-%m-%d", &timeinfo);

    event->free_heap = system_status.free_heap;
    event->vcc = 0;
    strlcpy(event->wifi_mode, system_status.wifi_mode, sizeof(event->wifi_mode));
    strlcpy(event->ip_address, system_status.net_address, sizeof(event->ip_address));
    event->station_connected = system_status.station_connected;
    strlcpy(event->station_ssid, system_status.station_ssid, sizeof(event->station_ssid));
    strlcpy(event->station_ip_address, system_status.station_ip_address, sizeof(event->station_ip_address));
    strlcpy(event->ap_ssid, system_status.ap_ssid, sizeof(event->ap_ssid));
    strlcpy(event->ap_ip_address, system_status.ap_ip_address, sizeof(event->ap_ip_address));
    event->ap_clients = system_status.ap_clients;
    event->board_temperature = system_status.board_temperature;
    event->wifi_disconnects = system_status.wifi_disconnects;
    event->time_valid = app_time_is_valid();
    strlcpy(event->time_warning, app_time_warning_message(), sizeof(event->time_warning));

    mqtt_status = get_mqtt_status();
    event->mqtt_enabled = mqtt_status != MQTT_DISABLED;
    event->mqtt_connected = mqtt_status == MQTT_ENABLED_CONNECTED;
    event->ntp_enabled = services->enable_ntp;
    event->ntp_sync = get_ntp_sync_status() != 0;
}

static uint32_t monitor_detect_status_changes(const app_status_event_t *current)
{
    uint32_t changed_mask = 0;

    if (!last_status_event_valid) {
        return APP_STATUS_CHANGED_UP_TIME |
               APP_STATUS_CHANGED_LOCAL_TIME |
               APP_STATUS_CHANGED_LOCAL_DATE |
               APP_STATUS_CHANGED_FREE_HEAP |
               APP_STATUS_CHANGED_VCC |
               APP_STATUS_CHANGED_WIFI_MODE |
               APP_STATUS_CHANGED_IP_ADDRESS |
               APP_STATUS_CHANGED_STATION_CONNECTED |
               APP_STATUS_CHANGED_STATION_SSID |
               APP_STATUS_CHANGED_STATION_IP |
               APP_STATUS_CHANGED_AP_SSID |
               APP_STATUS_CHANGED_AP_IP |
               APP_STATUS_CHANGED_AP_CLIENTS |
               APP_STATUS_CHANGED_BOARD_TEMPERATURE |
               APP_STATUS_CHANGED_WIFI_DISCONNECTS |
               APP_STATUS_CHANGED_TIME_VALID |
               APP_STATUS_CHANGED_TIME_WARNING |
               APP_STATUS_CHANGED_MQTT_SERVICE |
               APP_STATUS_CHANGED_NTP_SERVICE;
    }

    if (strcmp(last_status_event.up_time, current->up_time) != 0) {
        changed_mask |= APP_STATUS_CHANGED_UP_TIME;
    }
    if (strcmp(last_status_event.local_time, current->local_time) != 0) {
        changed_mask |= APP_STATUS_CHANGED_LOCAL_TIME;
    }
    if (strcmp(last_status_event.local_date, current->local_date) != 0) {
        changed_mask |= APP_STATUS_CHANGED_LOCAL_DATE;
    }
    if (last_status_event.free_heap != current->free_heap) {
        changed_mask |= APP_STATUS_CHANGED_FREE_HEAP;
    }
    if (last_status_event.vcc != current->vcc) {
        changed_mask |= APP_STATUS_CHANGED_VCC;
    }
    if (strcmp(last_status_event.wifi_mode, current->wifi_mode) != 0) {
        changed_mask |= APP_STATUS_CHANGED_WIFI_MODE;
    }
    if (strcmp(last_status_event.ip_address, current->ip_address) != 0) {
        changed_mask |= APP_STATUS_CHANGED_IP_ADDRESS;
    }
    if (last_status_event.station_connected != current->station_connected) {
        changed_mask |= APP_STATUS_CHANGED_STATION_CONNECTED;
    }
    if (strcmp(last_status_event.station_ssid, current->station_ssid) != 0) {
        changed_mask |= APP_STATUS_CHANGED_STATION_SSID;
    }
    if (strcmp(last_status_event.station_ip_address, current->station_ip_address) != 0) {
        changed_mask |= APP_STATUS_CHANGED_STATION_IP;
    }
    if (strcmp(last_status_event.ap_ssid, current->ap_ssid) != 0) {
        changed_mask |= APP_STATUS_CHANGED_AP_SSID;
    }
    if (strcmp(last_status_event.ap_ip_address, current->ap_ip_address) != 0) {
        changed_mask |= APP_STATUS_CHANGED_AP_IP;
    }
    if (last_status_event.ap_clients != current->ap_clients) {
        changed_mask |= APP_STATUS_CHANGED_AP_CLIENTS;
    }
    if (last_status_event.board_temperature != current->board_temperature) {
        changed_mask |= APP_STATUS_CHANGED_BOARD_TEMPERATURE;
    }
    if (last_status_event.wifi_disconnects != current->wifi_disconnects) {
        changed_mask |= APP_STATUS_CHANGED_WIFI_DISCONNECTS;
    }
    if (last_status_event.time_valid != current->time_valid) {
        changed_mask |= APP_STATUS_CHANGED_TIME_VALID;
    }
    if (strcmp(last_status_event.time_warning, current->time_warning) != 0) {
        changed_mask |= APP_STATUS_CHANGED_TIME_WARNING;
    }
    if (last_status_event.mqtt_enabled != current->mqtt_enabled ||
        last_status_event.mqtt_connected != current->mqtt_connected) {
        changed_mask |= APP_STATUS_CHANGED_MQTT_SERVICE;
    }
    if (last_status_event.ntp_enabled != current->ntp_enabled ||
        last_status_event.ntp_sync != current->ntp_sync) {
        changed_mask |= APP_STATUS_CHANGED_NTP_SERVICE;
    }

    return changed_mask;
}

static void monitor_publish_changes(bool refresh_system_info)
{
    app_status_event_t current = {0};
    uint32_t changed_mask;

    if (refresh_system_info) {
        update_system_info();
    }

    monitor_capture_status_event(&current);
    changed_mask = monitor_detect_status_changes(&current);
    current.changed_mask = changed_mask;

    last_status_event = current;
    last_status_event_valid = true;

    if (changed_mask == 0) {
        return;
    }

    app_events_dispatch_system(STATUS_CHANGED, &current, sizeof(current));
}

system_status_t *get_system_status(void)
{
    return &system_status;
}

void monitor_increment_wifi_disconnects(void)
{
    system_status.wifi_disconnects += 1;
    monitor_publish_changes(false);
}

void monitor_refresh_and_publish(void)
{
    monitor_publish_changes(true);
}

static void vMonitorTimerCallback(TimerHandle_t xTimer)
{
    (void)xTimer;
    monitor_publish_changes(true);
}

int init_monitor(void)
{
    init_reboot_status();
    update_system_info();
    monitor_capture_status_event(&last_status_event);
    last_status_event_valid = true;

    xMonitorTimer = xTimerCreate("xRunTimer", 10 * 1000 / portTICK_PERIOD_MS, pdTRUE, NULL, vMonitorTimerCallback);
    CHECK_TIMER(xTimerStart(xMonitorTimer, 100 / portTICK_PERIOD_MS));

    return ESP_OK;
}
