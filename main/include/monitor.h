/***
** Created by Aleksey Volkov on 16.12.2019.
***/

#ifndef HV_CC_LED_DRIVER_RTOS_MONITOR_H
#define HV_CC_LED_DRIVER_RTOS_MONITOR_H

#include <stdbool.h>

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

} system_status_t;

system_status_t* get_system_status(void);
int init_monitor();

#endif //HV_CC_LED_DRIVER_RTOS_MONITOR_H
