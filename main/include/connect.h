/***
** Created by Aleksey Volkov on 16.07.2020.
***/

#ifndef TFT_DOSER_CONNECT_H
#define TFT_DOSER_CONNECT_H

#include "freertos/event_groups.h"

#define WIFI_CONNECTED_BIT    BIT0
#define WIFI_FAIL_BIT         BIT1

extern EventGroupHandle_t wifi_event_group;

void initialise_wifi(void *arg);
void disable_power_save(void);
const char *connect_get_station_ssid(void);
bool connect_station_is_connected(void);
uint8_t connect_get_ap_client_count(void);
bool connect_ap_fallback_is_active(void);

#endif //TFT_DOSER_CONNECT_H
