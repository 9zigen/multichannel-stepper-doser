/***
** Created by Aleksey Volkov on 16.07.2020.
***/
#include "string.h"
#include "sdkconfig.h"
#include "esp_event.h"
#include "esp_wifi.h"
#include "esp_wifi_default.h"

#include "esp_log.h"
#include "esp_netif.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "lwip/err.h"
#include "lwip/sys.h"
#include "mdns.h"

#include "led.h"
#include "connect.h"
#include "app_settings.h"
#include "captive_dns.h"
#include "esp_mac.h"

#define AP_WIFI_SSID                   CONFIG_CONTROLLER_WIFI_SSID
#define AP_WIFI_PASSWORD               CONFIG_CONTROLLER_WIFI_PASS
#define AP_WIFI_CHANNEL                CONFIG_CONTROLLER_WIFI_CHANNEL
#define WIFI_STA_MAX_ATTEMPTS          3
#define WIFI_AP_FALLBACK_TIMEOUT_MS    (5 * 60 * 1000)
#define WIFI_SCAN_LIST_SIZE            16

static void initialise_mdns(void);
static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
static esp_err_t wifi_manager_init(void);
static esp_err_t wifi_start_current_mode(void);
static void wifi_collect_profiles(void);
static network_t *wifi_get_active_profile(void);
static bool wifi_should_keep_ap_enabled(void);
static void wifi_enable_ap_fallback(void);
static void wifi_disable_ap_fallback(void);
static void wifi_arm_ap_timeout_if_needed(void);
static void wifi_restart_cycle(void);
static void wifi_rotate_or_fallback(void);
static void wifi_try_next_station_profile(void);
static void wifi_configure_ap(wifi_config_t *wifi_config);
static void wifi_configure_sta(wifi_config_t *wifi_config, const network_t *config);
static void vApFallbackTimerCallback(TimerHandle_t pxTimer);

static const char *TAG = "CONNECT";
static esp_netif_t *wifi_sta_netif = NULL;
static esp_netif_t *wifi_ap_netif = NULL;
static esp_event_handler_instance_t instance_any_id;
static esp_event_handler_instance_t instance_got_ip;
static bool wifi_manager_ready = false;
static bool station_connected = false;
static bool ap_fallback_active = false;
static uint8_t ap_client_count = 0;
static uint8_t wifi_profile_ids[MAX_NETWORKS];
static uint8_t wifi_profile_count = 0;
static uint8_t active_profile_cursor = 0;
static uint8_t tested_profiles_in_cycle = 0;
static uint8_t current_profile_attempts = 0;

TimerHandle_t xApFallbackTimer = NULL;
EventGroupHandle_t wifi_event_group;

const char *connect_get_station_ssid(void)
{
    network_t *config = wifi_get_active_profile();
    return config != NULL ? config->ssid : "";
}

bool connect_station_is_connected(void)
{
    return station_connected;
}

uint8_t connect_get_ap_client_count(void)
{
    return ap_client_count;
}

bool connect_ap_fallback_is_active(void)
{
    return ap_fallback_active;
}

static bool wifi_has_profiles(void)
{
    return wifi_profile_count > 0;
}

static network_t *wifi_get_profile_by_cursor(uint8_t cursor)
{
    if (cursor >= wifi_profile_count) {
        return NULL;
    }

    return get_networks_config(wifi_profile_ids[cursor]);
}

static network_t *wifi_get_active_profile(void)
{
    return wifi_get_profile_by_cursor(active_profile_cursor);
}

static void wifi_collect_profiles(void)
{
    wifi_profile_count = 0;

    for (uint8_t i = 0; i < MAX_NETWORKS; ++i) {
        network_t *network_config = get_networks_config(i);

        if (network_config == NULL) {
            continue;
        }

        if (!network_config->active || network_config->type != NETWORK_TYPE_WIFI || strlen(network_config->ssid) < 2) {
            continue;
        }

        wifi_profile_ids[wifi_profile_count++] = i;
    }

    if (wifi_profile_count == 0) {
        active_profile_cursor = 0;
        tested_profiles_in_cycle = 0;
        current_profile_attempts = 0;
    } else if (active_profile_cursor >= wifi_profile_count) {
        active_profile_cursor = 0;
        tested_profiles_in_cycle = 1;
        current_profile_attempts = 0;
    }

    ESP_LOGI(TAG, "Configured Wi-Fi station profiles: %u", (unsigned)wifi_profile_count);
}

static esp_err_t wifi_manager_init(void)
{
    if (wifi_manager_ready) {
        return ESP_OK;
    }

    ESP_ERROR_CHECK(esp_netif_init());
    wifi_sta_netif = esp_netif_create_default_wifi_sta();
    wifi_ap_netif = esp_netif_create_default_wifi_ap();

    services_t *services = get_service_config();
    if (wifi_sta_netif != NULL) {
        esp_netif_set_hostname(wifi_sta_netif, services->hostname);
    }

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_wifi_set_storage(WIFI_STORAGE_RAM));
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_any_id));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT,
                                                        IP_EVENT_STA_GOT_IP,
                                                        &wifi_event_handler,
                                                        NULL,
                                                        &instance_got_ip));

    wifi_manager_ready = true;
    return ESP_OK;
}

static void wifi_configure_ap(wifi_config_t *wifi_config)
{
    memset(wifi_config, 0, sizeof(*wifi_config));
    memcpy(wifi_config->ap.ssid, AP_WIFI_SSID, strlen(AP_WIFI_SSID));
    wifi_config->ap.ssid_len = strlen(AP_WIFI_SSID);
    wifi_config->ap.channel = AP_WIFI_CHANNEL;
    memcpy(wifi_config->ap.password, AP_WIFI_PASSWORD, strlen(AP_WIFI_PASSWORD));
    wifi_config->ap.max_connection = 2;
    wifi_config->ap.authmode = strlen(AP_WIFI_PASSWORD) == 0 ? WIFI_AUTH_OPEN : WIFI_AUTH_WPA2_PSK;

    services_t *services = get_service_config();
    size_t ssid_len = strlen(services->hostname);
    if (ssid_len > 0 && ssid_len < sizeof(wifi_config->ap.ssid)) {
        memset(wifi_config->ap.ssid, 0, sizeof(wifi_config->ap.ssid));
        memcpy(wifi_config->ap.ssid, services->hostname, ssid_len);
        wifi_config->ap.ssid_len = ssid_len;
    }
}

static void wifi_configure_sta(wifi_config_t *wifi_config, const network_t *config)
{
    memset(wifi_config, 0, sizeof(*wifi_config));
    wifi_config->sta.pmf_cfg.capable = true;
    wifi_config->sta.pmf_cfg.required = false;
    strlcpy((char *)&wifi_config->sta.ssid, config->ssid, sizeof(wifi_config->sta.ssid));
    strlcpy((char *)&wifi_config->sta.password, config->password, sizeof(wifi_config->sta.password));
    wifi_config->sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
}

static bool wifi_should_keep_ap_enabled(void)
{
    if (!wifi_has_profiles()) {
        return true;
    }

    network_t *config = wifi_get_active_profile();
    if (config != NULL && config->keep_ap_active) {
        return true;
    }

    if (ap_fallback_active || ap_client_count > 0) {
        return true;
    }

    return false;
}

static void wifi_stop_dns_if_running(void)
{
    captive_dns_stop();
}

static void wifi_start_dns_if_needed(bool ap_enabled)
{
    if (ap_enabled) {
        ESP_ERROR_CHECK(captive_dns_start());
    } else {
        wifi_stop_dns_if_running();
    }
}

static esp_err_t wifi_start_current_mode(void)
{
    ESP_ERROR_CHECK(wifi_manager_init());

    bool sta_enabled = wifi_has_profiles();
    bool ap_enabled = wifi_should_keep_ap_enabled();
    wifi_mode_t mode = WIFI_MODE_NULL;
    wifi_config_t ap_config;
    wifi_config_t sta_config;
    network_t *profile = wifi_get_active_profile();

    if (ap_enabled && sta_enabled) {
        mode = WIFI_MODE_APSTA;
    } else if (ap_enabled) {
        mode = WIFI_MODE_APSTA;
        sta_enabled = false;
    } else if (sta_enabled) {
        mode = WIFI_MODE_STA;
    } else {
        mode = WIFI_MODE_APSTA;
    }

    esp_err_t err = esp_wifi_stop();
    if (err != ESP_OK && err != ESP_ERR_WIFI_NOT_INIT && err != ESP_ERR_WIFI_NOT_STARTED) {
        ESP_ERROR_CHECK(err);
    }

    ESP_ERROR_CHECK(esp_wifi_set_mode(mode));

    if (ap_enabled || mode == WIFI_MODE_APSTA) {
        wifi_configure_ap(&ap_config);
        ESP_ERROR_CHECK(esp_wifi_set_config(ESP_IF_WIFI_AP, &ap_config));
    }

    if (sta_enabled && profile != NULL) {
        wifi_configure_sta(&sta_config, profile);
        ESP_LOGI(TAG, "Connecting to station profile %u SSID:%s", (unsigned)profile->id, profile->ssid);
        ESP_ERROR_CHECK(esp_wifi_set_config(ESP_IF_WIFI_STA, &sta_config));
    }

    ESP_ERROR_CHECK(esp_wifi_start());
    wifi_start_dns_if_needed(ap_enabled || mode == WIFI_MODE_APSTA);

    if (sta_enabled && profile != NULL) {
        esp_wifi_connect();
    }

    set_led_mode(ap_enabled ? LED_INDICATE_OK : LED_INDICATE_ERROR, ap_enabled ? LED_SLOW_BLINK : LED_THREE_BLINK, 255);
    wifi_arm_ap_timeout_if_needed();

    return ESP_OK;
}

static void wifi_arm_ap_timeout_if_needed(void)
{
    if (xApFallbackTimer == NULL) {
        return;
    }

    bool should_timeout = ap_fallback_active && ap_client_count == 0;
    if (should_timeout) {
        xTimerStop(xApFallbackTimer, 0);
        xTimerChangePeriod(xApFallbackTimer, pdMS_TO_TICKS(WIFI_AP_FALLBACK_TIMEOUT_MS), 0);
        xTimerStart(xApFallbackTimer, 0);
    } else {
        xTimerStop(xApFallbackTimer, 0);
    }
}

static void wifi_enable_ap_fallback(void)
{
    if (!ap_fallback_active) {
        ESP_LOGI(TAG, "Enabling fallback AP for onboarding/recovery");
    }
    ap_fallback_active = true;
    wifi_arm_ap_timeout_if_needed();
}

static void wifi_disable_ap_fallback(void)
{
    if (!ap_fallback_active) {
        return;
    }

    ESP_LOGI(TAG, "Disabling fallback AP");
    ap_fallback_active = false;
    wifi_arm_ap_timeout_if_needed();
}

static void wifi_restart_cycle(void)
{
    if (!wifi_has_profiles()) {
        current_profile_attempts = 0;
        tested_profiles_in_cycle = 0;
        wifi_start_current_mode();
        return;
    }

    active_profile_cursor = 0;
    tested_profiles_in_cycle = 1;
    current_profile_attempts = 0;
    wifi_start_current_mode();
}

static void wifi_try_next_station_profile(void)
{
    if (!wifi_has_profiles()) {
        wifi_start_current_mode();
        return;
    }

    active_profile_cursor = (active_profile_cursor + 1) % wifi_profile_count;
    tested_profiles_in_cycle++;
    current_profile_attempts = 0;
    wifi_start_current_mode();
}

static void wifi_rotate_or_fallback(void)
{
    if (!wifi_has_profiles()) {
        wifi_start_current_mode();
        return;
    }

    if (tested_profiles_in_cycle < wifi_profile_count) {
        wifi_try_next_station_profile();
        return;
    }

    wifi_enable_ap_fallback();
    wifi_restart_cycle();
}

static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        station_connected = false;
        if (wifi_has_profiles()) {
            esp_wifi_connect();
        }
        return;
    }

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        station_connected = false;

        if (!wifi_has_profiles()) {
            ESP_LOGI(TAG, "Station disconnected but no station profile is configured");
            wifi_start_current_mode();
            return;
        }

        current_profile_attempts++;
        ESP_LOGI(TAG, "Station profile %u disconnected, attempt %u/%u",
                 (unsigned)wifi_profile_ids[active_profile_cursor],
                 (unsigned)current_profile_attempts,
                 (unsigned)WIFI_STA_MAX_ATTEMPTS);

        if (current_profile_attempts < WIFI_STA_MAX_ATTEMPTS) {
            esp_wifi_connect();
            set_led_mode(LED_INDICATE_ERROR, LED_THREE_BLINK, 30);
            return;
        }

        wifi_rotate_or_fallback();
        return;
    }

    if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "got station ip:" IPSTR, IP2STR(&event->ip_info.ip));
        station_connected = true;
        current_profile_attempts = 0;
        tested_profiles_in_cycle = 1;
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
        set_led_mode(LED_INDICATE_OK, LED_SLOW_BLINK, 255);
        return;
    }

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_STACONNECTED) {
        wifi_event_ap_staconnected_t *event = (wifi_event_ap_staconnected_t *)event_data;
        ap_client_count++;
        ESP_LOGI(TAG, "AP client " MACSTR " joined, AID=%d, clients=%u",
                 MAC2STR(event->mac), event->aid, (unsigned)ap_client_count);
        wifi_arm_ap_timeout_if_needed();
        return;
    }

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_STADISCONNECTED) {
        wifi_event_ap_stadisconnected_t *event = (wifi_event_ap_stadisconnected_t *)event_data;
        if (ap_client_count > 0) {
            ap_client_count--;
        }
        ESP_LOGI(TAG, "AP client " MACSTR " left, AID=%d, clients=%u",
                 MAC2STR(event->mac), event->aid, (unsigned)ap_client_count);
        wifi_arm_ap_timeout_if_needed();
        if (ap_client_count == 0 && !ap_fallback_active) {
            network_t *profile = wifi_get_active_profile();
            if (wifi_has_profiles() && (profile == NULL || !profile->keep_ap_active)) {
                wifi_start_current_mode();
            }
        }
        return;
    }
}

static void vApFallbackTimerCallback(TimerHandle_t pxTimer)
{
    (void)pxTimer;

    if (!ap_fallback_active || ap_client_count > 0) {
        return;
    }

    ESP_LOGI(TAG, "Fallback AP timeout expired without clients, retrying station sequence");
    wifi_disable_ap_fallback();
    wifi_restart_cycle();
}

void initialise_wifi(void *arg)
{
    (void)arg;

    wifi_event_group = xEventGroupCreate();
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    xApFallbackTimer = xTimerCreate("WiFiApFallbackTimer",
                                    pdMS_TO_TICKS(WIFI_AP_FALLBACK_TIMEOUT_MS),
                                    pdFALSE,
                                    NULL,
                                    vApFallbackTimerCallback);

    initialise_mdns();
    wifi_collect_profiles();

    if (wifi_has_profiles()) {
        active_profile_cursor = 0;
        tested_profiles_in_cycle = 1;
        current_profile_attempts = 0;
        ap_fallback_active = false;
    } else {
        ap_fallback_active = true;
    }

    ESP_ERROR_CHECK(wifi_start_current_mode());
}

void disable_power_save(void)
{
    // esp_wifi_set_ps(WIFI_PS_NONE);
}

/* initialize mDNS */
static void initialise_mdns(void)
{
    services_t *services = get_service_config();

    ESP_ERROR_CHECK(mdns_init());
    ESP_ERROR_CHECK(mdns_hostname_set(services->hostname));
    ESP_LOGI(TAG, "mdns hostname set to: [%s]", services->hostname);

    ESP_ERROR_CHECK(mdns_instance_name_set("ESP32 Dosing Pump"));
    mdns_service_add(NULL, "_http", "_tcp", 80, NULL, 0);
}
