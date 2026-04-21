/***
** Created by Aleksey Volkov on 16.07.2020.
***/
#include <ctype.h>
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
#include "app_events.h"
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
#include "app_provisioning.h"
#endif
#include "connect.h"
#include "app_settings.h"
#include "captive_dns.h"
#include "esp_mac.h"
#include "monitor.h"

#define AP_WIFI_SSID                   CONFIG_CONTROLLER_WIFI_SSID
#define AP_WIFI_PASSWORD               CONFIG_CONTROLLER_WIFI_PASS
#define AP_WIFI_CHANNEL                CONFIG_CONTROLLER_WIFI_CHANNEL
#define WIFI_STA_MAX_ATTEMPTS          3
#define WIFI_AP_FALLBACK_TIMEOUT_MS    (CONFIG_CONTROLLER_WIFI_AP_FALLBACK_TIMEOUT_SEC * 1000)
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
#define WIFI_AP_GRACE_TIMEOUT_MS       (CONFIG_CONTROLLER_WIFI_AP_GRACE_TIMEOUT_SEC * 1000)
#else
#define WIFI_AP_GRACE_TIMEOUT_MS       WIFI_AP_FALLBACK_TIMEOUT_MS
#endif
#define WIFI_SCAN_LIST_SIZE            16

static void initialise_mdns(void);
static void apply_runtime_hostname(void);
static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
static void connect_services_updated_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
static esp_err_t wifi_manager_init(void);
static esp_err_t wifi_start_current_mode(void);
static void wifi_collect_profiles(void);
static network_t *wifi_get_active_profile(void);
static bool wifi_should_keep_ap_enabled(void);
static void wifi_sync_onboarding_services(void);
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
static void wifi_enable_recovery_mode(void);
static void wifi_disable_recovery_mode(void);
static void wifi_begin_ap_grace_period(void);
static void wifi_end_ap_grace_period(void);
#endif
static void wifi_enable_ap_fallback(void);
static void wifi_disable_ap_fallback(void);
static void wifi_arm_ap_fallback_timeout_if_needed(void);
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
static void wifi_arm_ap_grace_timeout_if_needed(void);
#endif
static void wifi_refresh_ap_timers(void);
static void wifi_restart_cycle(void);
static void wifi_rotate_or_fallback(void);
static void wifi_try_next_station_profile(void);
static void wifi_configure_ap(wifi_config_t *wifi_config);
static void wifi_configure_sta(wifi_config_t *wifi_config, const network_t *config);
static void vApFallbackTimerCallback(TimerHandle_t pxTimer);
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
static void vApGraceTimerCallback(TimerHandle_t pxTimer);
#endif
static void build_mdns_hostname(const char *source, char *target, size_t target_size);

static const char *TAG = "CONNECT";
static esp_netif_t *wifi_sta_netif = NULL;
static esp_netif_t *wifi_ap_netif = NULL;
static esp_event_handler_instance_t instance_any_id;
static esp_event_handler_instance_t instance_got_ip;
static esp_event_handler_instance_t services_updated_event_ctx;
static bool wifi_manager_ready = false;
static bool station_connected = false;
static bool recovery_mode_active = false;
static bool ap_fallback_active = false;
static bool ap_grace_active = false;
static bool legacy_booted_without_networks = false;
static uint8_t ap_client_count = 0;
static uint8_t wifi_profile_ids[MAX_NETWORKS];
static uint8_t wifi_profile_count = 0;
static uint8_t active_profile_cursor = 0;
static uint8_t tested_profiles_in_cycle = 0;
static uint8_t current_profile_attempts = 0;

TimerHandle_t xApFallbackTimer = NULL;
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
static TimerHandle_t xApGraceTimer = NULL;
#endif
EventGroupHandle_t wifi_event_group;

static bool wifi_has_profiles(void);

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

bool connect_ap_recovery_is_active(void)
{
    return recovery_mode_active;
}

bool connect_ap_grace_is_active(void)
{
    return ap_grace_active;
}

void connect_on_network_settings_updated(void)
{
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
    bool had_profiles = wifi_has_profiles();
#endif

    wifi_collect_profiles();
    monitor_refresh_and_publish();

    if (!wifi_manager_ready) {
        return;
    }

#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
    if (!wifi_has_profiles()) {
        wifi_enable_recovery_mode();
        xEventGroupClearBits(wifi_event_group, WIFI_CONNECTED_BIT);
        wifi_start_current_mode();
        return;
    }

    if (!had_profiles) {
        wifi_enable_recovery_mode();
    }

    xEventGroupClearBits(wifi_event_group, WIFI_CONNECTED_BIT);
    wifi_restart_cycle();
#else
    if (!wifi_has_profiles()) {
        return;
    }

    network_t *profile = wifi_get_active_profile();
    if (!legacy_booted_without_networks &&
        station_connected &&
        !ap_fallback_active &&
        ap_client_count == 0 &&
        (profile == NULL || !profile->keep_ap_active)) {
        ESP_LOGI(TAG, "Network settings updated: disabling AP without reboot");
        wifi_start_current_mode();
    }
#endif
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

    app_events_register_handler(SERVICES_UPDATED,
                                NULL,
                                connect_services_updated_handler,
                                &services_updated_event_ctx);

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

#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
    if (recovery_mode_active) {
        return true;
    }

    if (ap_fallback_active || ap_grace_active || ap_client_count > 0) {
        return true;
    }
#else
    if (legacy_booted_without_networks) {
        return true;
    }

    if (ap_fallback_active || ap_client_count > 0) {
        return true;
    }
#endif

    return false;
}

static void wifi_sync_onboarding_services(void)
{
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
    bool should_enable_ble = recovery_mode_active || ap_fallback_active || ap_grace_active;

    if (should_enable_ble) {
        app_provisioning_start();
    } else {
        app_provisioning_stop();
    }
#endif
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
    wifi_refresh_ap_timers();
    wifi_sync_onboarding_services();

    return ESP_OK;
}

static void wifi_arm_ap_fallback_timeout_if_needed(void)
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

#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
static void wifi_arm_ap_grace_timeout_if_needed(void)
{
    if (xApGraceTimer == NULL) {
        return;
    }

    bool should_timeout = ap_grace_active && ap_client_count == 0;
    if (should_timeout) {
        xTimerStop(xApGraceTimer, 0);
        xTimerChangePeriod(xApGraceTimer, pdMS_TO_TICKS(WIFI_AP_GRACE_TIMEOUT_MS), 0);
        xTimerStart(xApGraceTimer, 0);
    } else {
        xTimerStop(xApGraceTimer, 0);
    }
}
#endif

static void wifi_refresh_ap_timers(void)
{
    wifi_arm_ap_fallback_timeout_if_needed();
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
    wifi_arm_ap_grace_timeout_if_needed();
#endif
}

#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
static void wifi_enable_recovery_mode(void)
{
    if (!recovery_mode_active) {
        ESP_LOGI(TAG, "Enabling recovery mode");
    }
    recovery_mode_active = true;
    ap_grace_active = false;
    wifi_refresh_ap_timers();
    wifi_sync_onboarding_services();
}

static void wifi_disable_recovery_mode(void)
{
    if (!recovery_mode_active) {
        return;
    }

    ESP_LOGI(TAG, "Disabling recovery mode");
    recovery_mode_active = false;
    wifi_refresh_ap_timers();
    wifi_sync_onboarding_services();
}

static void wifi_begin_ap_grace_period(void)
{
    network_t *profile = wifi_get_active_profile();

    if (!wifi_has_profiles() || (profile != NULL && profile->keep_ap_active)) {
        ap_grace_active = false;
        wifi_refresh_ap_timers();
        wifi_sync_onboarding_services();
        return;
    }

    if (!ap_grace_active) {
        ESP_LOGI(TAG, "Starting temporary AP grace period");
    }
    ap_grace_active = true;
    wifi_refresh_ap_timers();
    wifi_sync_onboarding_services();
}

static void wifi_end_ap_grace_period(void)
{
    if (!ap_grace_active) {
        return;
    }

    ESP_LOGI(TAG, "Ending AP grace period");
    ap_grace_active = false;
    wifi_refresh_ap_timers();
    wifi_sync_onboarding_services();
}
#endif

static void wifi_enable_ap_fallback(void)
{
    if (!ap_fallback_active) {
        ESP_LOGI(TAG, "Enabling fallback AP for onboarding/recovery");
    }
    ap_fallback_active = true;
    ap_grace_active = false;
    wifi_refresh_ap_timers();
    wifi_sync_onboarding_services();
}

static void wifi_disable_ap_fallback(void)
{
    if (!ap_fallback_active) {
        return;
    }

    ESP_LOGI(TAG, "Disabling fallback AP");
    ap_fallback_active = false;
    wifi_refresh_ap_timers();
    wifi_sync_onboarding_services();
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
        monitor_refresh_and_publish();
        if (wifi_has_profiles()) {
            esp_wifi_connect();
        }
        return;
    }

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        station_connected = false;
        monitor_increment_wifi_disconnects();
        monitor_refresh_and_publish();

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
        network_t *profile = wifi_get_active_profile();
        wifi_mode_t mode = WIFI_MODE_NULL;
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
        bool completed_provisioning_cycle = recovery_mode_active || ap_fallback_active;
#endif
        ESP_LOGI(TAG, "got station ip:" IPSTR, IP2STR(&event->ip_info.ip));
        station_connected = true;
        current_profile_attempts = 0;
        tested_profiles_in_cycle = 1;
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
        set_led_mode(LED_INDICATE_OK, LED_SLOW_BLINK, 255);
        monitor_refresh_and_publish();

        if (esp_wifi_get_mode(&mode) != ESP_OK) {
            mode = WIFI_MODE_NULL;
        }

#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
        if (completed_provisioning_cycle) {
            wifi_disable_ap_fallback();
            wifi_disable_recovery_mode();
            wifi_begin_ap_grace_period();
        }

        if (!recovery_mode_active &&
            !ap_fallback_active &&
            !ap_grace_active &&
            ap_client_count == 0 &&
            mode != WIFI_MODE_STA &&
            (profile == NULL || !profile->keep_ap_active)) {
            ESP_LOGI(TAG, "Station connected on a normal boot, disabling AP");
            wifi_start_current_mode();
        }
#else
        if (!legacy_booted_without_networks &&
            !ap_fallback_active &&
            ap_client_count == 0 &&
            mode != WIFI_MODE_STA &&
            (profile == NULL || !profile->keep_ap_active)) {
            ESP_LOGI(TAG, "Station connected on a normal boot, disabling AP");
            wifi_start_current_mode();
        }
#endif
        return;
    }

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_STACONNECTED) {
        wifi_event_ap_staconnected_t *event = (wifi_event_ap_staconnected_t *)event_data;
        ap_client_count++;
        ESP_LOGI(TAG, "AP client " MACSTR " joined, AID=%d, clients=%u",
                 MAC2STR(event->mac), event->aid, (unsigned)ap_client_count);
        wifi_refresh_ap_timers();
        monitor_refresh_and_publish();
        return;
    }

    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_STADISCONNECTED) {
        wifi_event_ap_stadisconnected_t *event = (wifi_event_ap_stadisconnected_t *)event_data;
        if (ap_client_count > 0) {
            ap_client_count--;
        }
        ESP_LOGI(TAG, "AP client " MACSTR " left, AID=%d, clients=%u",
                 MAC2STR(event->mac), event->aid, (unsigned)ap_client_count);
        wifi_refresh_ap_timers();
        monitor_refresh_and_publish();
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
        if (ap_client_count == 0 && !recovery_mode_active && !ap_fallback_active && !ap_grace_active) {
#else
        if (ap_client_count == 0 && !ap_fallback_active && !legacy_booted_without_networks) {
#endif
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

#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
static void vApGraceTimerCallback(TimerHandle_t pxTimer)
{
    (void)pxTimer;

    if (!ap_grace_active || ap_client_count > 0) {
        return;
    }

    ESP_LOGI(TAG, "AP grace period expired without clients, switching to STA-only");
    wifi_end_ap_grace_period();
    if (wifi_has_profiles()) {
        wifi_start_current_mode();
    }
}
#endif

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
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
    xApGraceTimer = xTimerCreate("WiFiApGraceTimer",
                                 pdMS_TO_TICKS(WIFI_AP_GRACE_TIMEOUT_MS),
                                 pdFALSE,
                                 NULL,
                                 vApGraceTimerCallback);
#endif

    initialise_mdns();
    wifi_collect_profiles();
    legacy_booted_without_networks = !wifi_has_profiles();
#if CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING
    if (wifi_has_profiles()) {
        active_profile_cursor = 0;
        tested_profiles_in_cycle = 1;
        current_profile_attempts = 0;
        recovery_mode_active = false;
        ap_fallback_active = false;
        ap_grace_active = false;
    } else {
        recovery_mode_active = true;
        ap_fallback_active = false;
        ap_grace_active = false;
    }
#else
    recovery_mode_active = false;
    ap_grace_active = false;
    if (wifi_has_profiles()) {
        active_profile_cursor = 0;
        tested_profiles_in_cycle = 1;
        current_profile_attempts = 0;
        ap_fallback_active = false;
    } else {
        ap_fallback_active = true;
    }
#endif

    ESP_ERROR_CHECK(wifi_start_current_mode());
}

void disable_power_save(void)
{
    // esp_wifi_set_ps(WIFI_PS_NONE);
}

static void build_mdns_hostname(const char *source, char *target, size_t target_size)
{
    size_t write_index = 0;
    bool last_was_dash = false;

    if (target == NULL || target_size == 0) {
        return;
    }

    memset(target, 0, target_size);

    for (size_t read_index = 0; source != NULL && source[read_index] != '\0' && write_index + 1 < target_size; ++read_index) {
        unsigned char ch = (unsigned char)source[read_index];

        if (isalnum(ch)) {
            target[write_index++] = (char)tolower(ch);
            last_was_dash = false;
            continue;
        }

        if ((ch == '-' || ch == '_' || ch == ' ') && write_index > 0 && !last_was_dash) {
            target[write_index++] = '-';
            last_was_dash = true;
        }
    }

    while (write_index > 0 && target[write_index - 1] == '-') {
        target[--write_index] = '\0';
    }

    if (write_index == 0) {
        strlcpy(target, "dosing", target_size);
    }
}

static void apply_runtime_hostname(void)
{
    services_t *services = get_service_config();
    char mdns_hostname[sizeof(services->hostname)];
    const char *instance_name = services->hostname;

    if (wifi_sta_netif != NULL) {
        esp_netif_set_hostname(wifi_sta_netif, services->hostname);
    }

    build_mdns_hostname(services->hostname, mdns_hostname, sizeof(mdns_hostname));
    if (instance_name == NULL || instance_name[0] == '\0') {
        instance_name = AP_WIFI_SSID;
    }

    mdns_hostname_set(mdns_hostname);
    mdns_instance_name_set(instance_name);
    ESP_LOGI(TAG, "Updated runtime hostname to [%s]", mdns_hostname);
}

static void connect_services_updated_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_base;

    if (event_id != SERVICES_UPDATED) {
        return;
    }

    apply_runtime_hostname();
    monitor_refresh_and_publish();
}

/* initialize mDNS */
static void initialise_mdns(void)
{
    ESP_ERROR_CHECK(mdns_init());
    mdns_service_add(NULL, "_http", "_tcp", 80, NULL, 0);
    apply_runtime_hostname();
}
