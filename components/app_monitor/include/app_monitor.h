#pragma once

#include <stdbool.h>
#include <stdint.h>

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
    char last_reboot_reason[32];
} system_status_t;

system_status_t *get_system_status(void);
void monitor_increment_wifi_disconnects(void);
int init_monitor(void);
