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
#include "app_settings_storage.h"

TimerHandle_t xMonitorTimer;
static const char *TAG="MONITOR";
system_status_t system_status = {0};

typedef struct {
  uint8_t magic;
  uint32_t reboot_count;
} reboot_status_t;

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
  eeprom_read(0x50, EEPROM_REBOOT_STATUS_ADDR, (uint8_t *)&reboot_status, sizeof(reboot_status));

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

  eeprom_write(0x50, EEPROM_REBOOT_STATUS_ADDR, (uint8_t *)&reboot_status, sizeof(reboot_status));
}

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
  if (strlen(system_status.last_reboot_reason) == 0) {
    snprintf(system_status.last_reboot_reason,
             sizeof(system_status.last_reboot_reason),
             "%s",
             reset_reason_to_string(esp_reset_reason()));
  }
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

void monitor_increment_wifi_disconnects(void)
{
  system_status.wifi_disconnects += 1;
}

static void vMonitorTimerCallback(TimerHandle_t xTimer )
{
  update_system_info();
}

int init_monitor()
{
  init_reboot_status();

  /* Create pump auto stop timer with 100ms. period */
  xMonitorTimer = xTimerCreate("xRunTimer", 10 * 1000 / portTICK_PERIOD_MS, pdTRUE, NULL, vMonitorTimerCallback);
  CHECK_TIMER(xTimerStart(xMonitorTimer, 100 / portTICK_PERIOD_MS));

  return ESP_OK;
}
