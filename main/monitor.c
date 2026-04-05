/***
** Created by Aleksey Volkov on 16.12.2019.
***/

#include <esp_mac.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "freertos/xtensa_rtos.h"

#include "string.h"
#include "esp_wifi.h"
#include "esp_log.h"
#include "esp_err.h"
#include "esp_system.h"

#include "adc.h"
#include "rtc.h"
#include "monitor.h"
#include "tools.h"
#include "connect.h"

TimerHandle_t xMonitorTimer;
static const char *TAG="MONITOR";
system_status_t system_status = {0};

static void update_system_info()
{
  /* WiFi info */
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
  system_status.station_connected = connect_station_is_connected();
  system_status.ap_clients = connect_get_ap_client_count();
  system_status.rssi = 0;

  if (mode == WIFI_MODE_STA)
    snprintf(system_status.wifi_mode, sizeof(system_status.wifi_mode), "STA");
  else if (mode == WIFI_MODE_AP)
    snprintf(system_status.wifi_mode, sizeof(system_status.wifi_mode), "AP");
  else if (mode == WIFI_MODE_APSTA)
    snprintf(system_status.wifi_mode, sizeof(system_status.wifi_mode), "AP+STA");

  /* MAC */
  uint8_t mac[6];

  /* IP info */
  esp_netif_ip_info_t ip;
  esp_netif_dns_info_t dns;
  memset(&ip, 0, sizeof(esp_netif_ip_info_t));
  memset(&dns, 0, sizeof(esp_netif_dns_info_t));

  esp_netif_t *sta_netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
  if (sta_netif != NULL && esp_netif_get_ip_info(sta_netif, &ip) == ESP_OK)
  {
    snprintf(system_status.station_ip_address, sizeof(system_status.station_ip_address), IPSTR, IP2STR(&ip.ip));
    snprintf(system_status.net_address, sizeof(system_status.net_address), IPSTR, IP2STR(&ip.ip));
    snprintf(system_status.net_mask, sizeof(system_status.net_mask), IPSTR, IP2STR(&ip.netmask));
    snprintf(system_status.net_gateway, sizeof(system_status.net_gateway), IPSTR, IP2STR(&ip.gw));
    esp_wifi_get_mac(WIFI_IF_STA, (uint8_t*)&mac);
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
  if (ap_netif != NULL && esp_netif_get_ip_info(ap_netif, &ip) == ESP_OK)
  {
    snprintf(system_status.ap_ip_address, sizeof(system_status.ap_ip_address), IPSTR, IP2STR(&ip.ip));
    if (strlen(system_status.net_address) == 0) {
      snprintf(system_status.net_address, sizeof(system_status.net_address), IPSTR, IP2STR(&ip.ip));
      snprintf(system_status.net_mask, sizeof(system_status.net_mask), IPSTR, IP2STR(&ip.netmask));
      snprintf(system_status.net_gateway, sizeof(system_status.net_gateway), IPSTR, IP2STR(&ip.gw));
    }
    esp_wifi_get_mac(WIFI_IF_AP, (uint8_t*)&mac);
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

  /* Update time from RTC */
//  set_time_from_stm();

  /* Local time */
//  print_time();

  /* Free heap */
  system_status.free_heap = heap_caps_get_free_size(MALLOC_CAP_8BIT);

  /* ADC: NTC + VCC */
//  ESP_LOGD(TAG, "current mA : %lu", read_current_milliamperes());
//  ESP_LOGD(TAG, "mcu temp C : %f", (double) read_mcu_temperature() / 100.0);
//  ESP_LOGD(TAG, "power in V : %lu", read_vcc_voltage());
  ESP_LOGD(TAG, "MainTask   : %d", uxTaskGetStackHighWaterMark(NULL));
  ESP_LOGD(TAG, "free_heap  : %lu", system_status.free_heap);
}

system_status_t* get_system_status(void)
{
  return &system_status;
}

static void vMonitorTimerCallback(TimerHandle_t xTimer )
{
  update_system_info();
}

int init_monitor()
{
  /* Create pump auto stop timer with 100ms. period */
  xMonitorTimer = xTimerCreate("xRunTimer", 10 * 1000 / portTICK_PERIOD_MS, pdTRUE, NULL, vMonitorTimerCallback);
  CHECK_TIMER(xTimerStart(xMonitorTimer, 100 / portTICK_PERIOD_MS));

  return ESP_OK;
}
