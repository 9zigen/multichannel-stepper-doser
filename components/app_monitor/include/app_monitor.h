#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef enum {
    APP_STATUS_CHANGED_UP_TIME = 1UL << 0,
    APP_STATUS_CHANGED_LOCAL_TIME = 1UL << 1,
    APP_STATUS_CHANGED_LOCAL_DATE = 1UL << 2,
    APP_STATUS_CHANGED_FREE_HEAP = 1UL << 3,
    APP_STATUS_CHANGED_VCC = 1UL << 4,
    APP_STATUS_CHANGED_WIFI_MODE = 1UL << 5,
    APP_STATUS_CHANGED_IP_ADDRESS = 1UL << 6,
    APP_STATUS_CHANGED_STATION_CONNECTED = 1UL << 7,
    APP_STATUS_CHANGED_STATION_SSID = 1UL << 8,
    APP_STATUS_CHANGED_STATION_IP = 1UL << 9,
    APP_STATUS_CHANGED_AP_SSID = 1UL << 10,
    APP_STATUS_CHANGED_AP_IP = 1UL << 11,
    APP_STATUS_CHANGED_AP_CLIENTS = 1UL << 12,
    APP_STATUS_CHANGED_BOARD_TEMPERATURE = 1UL << 13,
    APP_STATUS_CHANGED_WIFI_DISCONNECTS = 1UL << 14,
    APP_STATUS_CHANGED_TIME_VALID = 1UL << 15,
    APP_STATUS_CHANGED_TIME_WARNING = 1UL << 16,
    APP_STATUS_CHANGED_MQTT_SERVICE = 1UL << 17,
    APP_STATUS_CHANGED_NTP_SERVICE = 1UL << 18,
} app_status_change_flag_t;

typedef struct {
    char wifi_mode[8];
    char net_address[16];
    char net_mask[16];
    char net_gateway[16];
    char mac[18];
    char ssid[33];
    bool station_connected;
    char station_ssid[33];
    char station_ip_address[16];
    char station_mac[18];
    char ap_ssid[33];
    char ap_ip_address[16];
    char ap_mac[18];
    uint8_t ap_clients;
    uint8_t rssi;
    uint32_t free_heap;
    uint32_t wifi_disconnects;
    uint32_t reboot_count;
    int16_t board_temperature;
    char last_reboot_reason[32];
} system_status_t;

typedef struct {
    uint32_t changed_mask;
    char up_time[32];
    char local_time[32];
    char local_date[16];
    uint32_t free_heap;
    int32_t vcc;
    char wifi_mode[8];
    char ip_address[16];
    bool station_connected;
    char station_ssid[33];
    char station_ip_address[16];
    char ap_ssid[33];
    char ap_ip_address[16];
    uint8_t ap_clients;
    int16_t board_temperature;
    uint32_t wifi_disconnects;
    bool time_valid;
    char time_warning[96];
    bool mqtt_enabled;
    bool mqtt_connected;
    char mqtt_last_error[96];
    bool ntp_enabled;
    bool ntp_sync;
} app_status_event_t;

system_status_t *get_system_status(void);
void monitor_increment_wifi_disconnects(void);
void monitor_refresh_and_publish(void);
int init_monitor(void);
