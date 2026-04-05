/***
** Created by Aleksey Volkov on 15.12.2019.
***/

#include <stdio.h>
#include <string.h>
#include <time.h>

#include "cJSON.h"

#include <esp_app_desc.h>
#include <esp_chip_info.h>

#include "app_settings.h"
#include "auth.h"
#include "app_settings_storage.h"
#include "mcp7940.h"
#include "monitor.h"
#include "mqtt.h"
#include "rtc.h"
#include "web_server.h"

static void format_iso_date(const datetime_t *datetime, char *buffer, size_t size)
{
    snprintf(buffer, size, "%04u-%02u-%02u", (unsigned)(datetime->year + 2000), datetime->month, datetime->day);
}

static void format_iso_time(const datetime_t *datetime, char *buffer, size_t size)
{
    snprintf(buffer, size, "%02u:%02u:%02u", datetime->hour, datetime->min, datetime->sec);
}

static void format_utc_offset(int offset, char *buffer, size_t size)
{
    snprintf(buffer, size, "UTC%+d", offset);
}

char *get_status_json(void)
{
    char *string = NULL;
    char time_string[32];
    const esp_app_desc_t *app_description = esp_app_get_description();
    esp_chip_info_t chip_info;
    esp_chip_info(&chip_info);
    system_status_t *system_status = get_system_status();
    services_t *services = get_service_config();

    cJSON *root = cJSON_CreateObject();
    cJSON *status = cJSON_CreateObject();

    det_time_string_since_boot((char *)&time_string);
    cJSON_AddItemToObject(status, "up_time", cJSON_CreateString(time_string));

    get_time_string((char *)&time_string);
    cJSON_AddItemToObject(status, "local_time", cJSON_CreateString(time_string));

    cJSON_AddItemToObject(status, "free_heap", cJSON_CreateNumber((double)system_status->free_heap));
    cJSON_AddItemToObject(status, "vcc", cJSON_CreateNumber(0));
    cJSON_AddItemToObject(status, "wifi_mode", cJSON_CreateString(system_status->wifi_mode));
    cJSON_AddItemToObject(status, "ip_address", cJSON_CreateString(system_status->net_address));
    cJSON_AddItemToObject(status, "mac_address", cJSON_CreateString(system_status->mac));
    cJSON_AddItemToObject(status, "hardware_version", cJSON_CreateString(HARDWARE_VERSION));
    cJSON_AddItemToObject(status, "firmware_version", cJSON_CreateString(app_description->version));
    cJSON_AddItemToObject(status, "firmware_date", cJSON_CreateString(app_description->date));
    cJSON_AddItemToObject(status, "board_temperature", cJSON_CreateNumber(25));
    cJSON_AddItemToObject(status, "wifi_disconnects", cJSON_CreateNumber(0));
    cJSON_AddItemToObject(status, "packets_dropped", cJSON_CreateNumber(0));
    cJSON_AddItemToObject(status, "tx_packets", cJSON_CreateNumber(0));
    cJSON_AddItemToObject(status, "rx_packets", cJSON_CreateNumber(0));
    cJSON_AddItemToObject(status, "reboot_count", cJSON_CreateNumber(0));
    cJSON_AddItemToObject(status, "last_reboot_reason", cJSON_CreateString("unknown"));
    cJSON_AddItemToObject(status, "storage_backend", cJSON_CreateString(eeprom_backend_name()));
    cJSON_AddItemToObject(status, "rtc_backend", cJSON_CreateString(get_rtc_backend_name()));

    cJSON *mqtt_status = cJSON_CreateObject();
    switch (get_mqtt_status()) {
        case MQTT_DISABLED:
            cJSON_AddFalseToObject(mqtt_status, "enabled");
            cJSON_AddFalseToObject(mqtt_status, "connected");
            break;
        case MQTT_ENABLED_NOT_CONNECTED:
            cJSON_AddTrueToObject(mqtt_status, "enabled");
            cJSON_AddFalseToObject(mqtt_status, "connected");
            break;
        case MQTT_ENABLED_CONNECTED:
            cJSON_AddTrueToObject(mqtt_status, "enabled");
            cJSON_AddTrueToObject(mqtt_status, "connected");
            break;
    }
    cJSON_AddItemToObject(status, "mqtt_service", mqtt_status);

    cJSON *ntp_status = cJSON_CreateObject();
    if (services->enable_ntp) {
        cJSON_AddTrueToObject(ntp_status, "enabled");
    } else {
        cJSON_AddFalseToObject(ntp_status, "enabled");
    }
    if (get_ntp_sync_status()) {
        cJSON_AddTrueToObject(ntp_status, "sync");
    } else {
        cJSON_AddFalseToObject(ntp_status, "sync");
    }
    cJSON_AddItemToObject(status, "ntp_service", ntp_status);

    (void)chip_info;

    cJSON_AddItemToObject(root, "status", status);

    string = cJSON_Print(root);
    if (string == NULL) {
        fprintf(stderr, "Failed to print status json.\n");
    }

    cJSON_Delete(root);
    return string;
}

char *get_schedule_json(void)
{
    char *string = NULL;
    cJSON *root = cJSON_CreateObject();

    cJSON *schedule = cJSON_CreateArray();
    for (int i = 0; i < MAX_SCHEDULE; ++i) {
        schedule_t *schedule_config = get_schedule_config(i);
        cJSON *schedule_item = cJSON_CreateObject();
        cJSON_AddItemToObject(schedule_item, "pump_id", cJSON_CreateNumber(schedule_config->pump_id));
        cJSON_AddItemToObject(schedule_item, "mode", cJSON_CreateNumber(schedule_config->mode));

        cJSON *schedule_work_hours = cJSON_CreateArray();
        for (int j = 0; j < 24; ++j) {
            if (schedule_config->work_hours & 1 << j) {
                cJSON_AddItemToArray(schedule_work_hours, cJSON_CreateNumber(j));
            }
        }
        cJSON_AddItemToObject(schedule_item, "work_hours", schedule_work_hours);

        cJSON *schedule_week_days = cJSON_CreateArray();
        for (int j = 0; j < 7; ++j) {
            if (schedule_config->week_days & 1 << j) {
                cJSON_AddItemToArray(schedule_week_days, cJSON_CreateNumber(j));
            }
        }
        cJSON_AddItemToObject(schedule_item, "weekdays", schedule_week_days);

        cJSON_AddItemToObject(schedule_item, "speed", cJSON_CreateNumber(schedule_config->speed));
        cJSON_AddItemToObject(schedule_item, "time", cJSON_CreateNumber((double)schedule_config->time));
        cJSON_AddItemToObject(schedule_item, "volume", cJSON_CreateNumber((double)schedule_config->day_volume));
        cJSON_AddItemToArray(schedule, schedule_item);
    }
    cJSON_AddItemToObject(root, "schedule", schedule);

    string = cJSON_Print(root);

    cJSON_Delete(root);
    return string;
}

char *get_settings_json(void)
{
    char *string = NULL;
    cJSON *root = cJSON_CreateObject();

    cJSON *pump_channels = cJSON_CreateArray();
    for (int i = 0; i < MAX_PUMP; ++i) {
        pump_t *pump_config = get_pump_config(i);
        schedule_t *schedule_config = get_schedule_config(i);

        cJSON *pump_item = cJSON_CreateObject();
        cJSON_AddItemToObject(pump_item, "id", cJSON_CreateNumber(pump_config->id));
        cJSON_AddItemToObject(pump_item, "state", cJSON_CreateBool(pump_config->state));
        cJSON_AddItemToObject(pump_item, "name", cJSON_CreateString(pump_config->name));
        cJSON_AddItemToObject(pump_item, "direction", cJSON_CreateBool(pump_config->direction));
        cJSON_AddItemToObject(pump_item, "running_hours", cJSON_CreateNumber(pump_config->running_hours));
        cJSON_AddItemToObject(pump_item, "tank_full_vol", cJSON_CreateNumber((double)pump_config->tank_full_vol));
        cJSON_AddItemToObject(pump_item, "tank_concentration_total", cJSON_CreateNumber((double)pump_config->tank_concentration_total));
        cJSON_AddItemToObject(pump_item, "tank_concentration_active", cJSON_CreateNumber((double)pump_config->tank_concentration_active));
        cJSON_AddItemToObject(pump_item, "tank_current_vol", cJSON_CreateNumber(pump_config->tank_current_vol));

        cJSON *schedule_item = cJSON_CreateObject();
        cJSON_AddItemToObject(schedule_item, "mode", cJSON_CreateNumber(schedule_config->mode));

        cJSON *schedule_work_hours = cJSON_CreateArray();
        for (int j = 0; j < 24; ++j) {
            if (schedule_config->work_hours & 1 << j) {
                cJSON_AddItemToArray(schedule_work_hours, cJSON_CreateNumber(j));
            }
        }
        cJSON_AddItemToObject(schedule_item, "work_hours", schedule_work_hours);

        cJSON *schedule_week_days = cJSON_CreateArray();
        for (int j = 0; j < 7; ++j) {
            if (schedule_config->week_days & 1 << j) {
                cJSON_AddItemToArray(schedule_week_days, cJSON_CreateNumber(j));
            }
        }
        cJSON_AddItemToObject(schedule_item, "weekdays", schedule_week_days);
        cJSON_AddItemToObject(schedule_item, "speed", cJSON_CreateNumber(schedule_config->speed));
        cJSON_AddItemToObject(schedule_item, "time", cJSON_CreateNumber((double)schedule_config->time));
        cJSON_AddItemToObject(schedule_item, "volume", cJSON_CreateNumber((double)schedule_config->day_volume));
        cJSON_AddItemToObject(pump_item, "schedule", schedule_item);

        cJSON *calibration = cJSON_CreateArray();
        for (int j = 0; j < pump_config->calibration_count && j < MAX_PUMP_CALIBRATION_POINTS; ++j) {
            cJSON *point = cJSON_CreateObject();
            cJSON_AddItemToObject(point, "speed", cJSON_CreateNumber(pump_config->calibration[j].speed));
            cJSON_AddItemToObject(point, "flow", cJSON_CreateNumber(pump_config->calibration[j].flow));
            cJSON_AddItemToArray(calibration, point);
        }
        cJSON_AddItemToObject(pump_item, "calibration", calibration);

        cJSON_AddItemToArray(pump_channels, pump_item);
    }
    cJSON_AddItemToObject(root, "pumps", pump_channels);

    cJSON *networks = cJSON_CreateArray();
    for (int j = 0; j < MAX_NETWORKS; ++j) {
        network_t *network_config = get_networks_config(j);
        if (!network_config->active) {
            continue;
        }

        cJSON *network_item = cJSON_CreateObject();
        cJSON_AddItemToObject(network_item, "id", cJSON_CreateNumber(network_config->id));
        cJSON_AddItemToObject(network_item, "type", cJSON_CreateNumber(network_config->type));
        cJSON_AddItemToObject(network_item, "is_dirty", cJSON_CreateBool(network_config->is_dirty));

        char net_buff[16];
        switch (network_config->type) {
            case NETWORK_TYPE_WIFI:
                cJSON_AddItemToObject(network_item, "ssid", cJSON_CreateString(network_config->ssid));
                cJSON_AddItemToObject(network_item, "password", cJSON_CreateString(network_config->password));
                ip_to_string(network_config->ip_address, net_buff);
                cJSON_AddItemToObject(network_item, "ip_address", cJSON_CreateString(net_buff));
                ip_to_string(network_config->mask, net_buff);
                cJSON_AddItemToObject(network_item, "mask", cJSON_CreateString(net_buff));
                ip_to_string(network_config->gateway, net_buff);
                cJSON_AddItemToObject(network_item, "gateway", cJSON_CreateString(net_buff));
                ip_to_string(network_config->dns, net_buff);
                cJSON_AddItemToObject(network_item, "dns", cJSON_CreateString(net_buff));
                cJSON_AddItemToObject(network_item, "dhcp", cJSON_CreateBool(network_config->dhcp));
                break;
            case NETWORK_TYPE_ETHERNET:
                ip_to_string(network_config->ip_address, net_buff);
                cJSON_AddItemToObject(network_item, "ip_address", cJSON_CreateString(net_buff));
                ip_to_string(network_config->mask, net_buff);
                cJSON_AddItemToObject(network_item, "mask", cJSON_CreateString(net_buff));
                ip_to_string(network_config->gateway, net_buff);
                cJSON_AddItemToObject(network_item, "gateway", cJSON_CreateString(net_buff));
                ip_to_string(network_config->dns, net_buff);
                cJSON_AddItemToObject(network_item, "dns", cJSON_CreateString(net_buff));
                cJSON_AddItemToObject(network_item, "dhcp", cJSON_CreateBool(network_config->dhcp));
                break;
            case NETWORK_TYPE_THREAD:
                cJSON_AddItemToObject(network_item, "channel", cJSON_CreateNumber(network_config->channel));
                cJSON_AddItemToObject(network_item, "network_name", cJSON_CreateString(network_config->network_name));
                cJSON_AddItemToObject(network_item, "network_key", cJSON_CreateString(network_config->network_key));
                cJSON_AddItemToObject(network_item, "pan_id", cJSON_CreateString(network_config->pan_id));
                cJSON_AddItemToObject(network_item, "ext_pan_id", cJSON_CreateString(network_config->ext_pan_id));
                cJSON_AddItemToObject(network_item, "pskc", cJSON_CreateString(network_config->pskc));
                cJSON_AddItemToObject(network_item, "mesh_local_prefix", cJSON_CreateString(network_config->mesh_local_prefix));
                cJSON_AddItemToObject(network_item, "force_dataset", cJSON_CreateBool(network_config->force_dataset));
                break;
            case NETWORK_TYPE_BLE:
            case NETWORK_TYPE_CAN:
            default:
                break;
        }

        cJSON_AddItemToArray(networks, network_item);
    }
    cJSON_AddItemToObject(root, "networks", networks);

    cJSON *services = cJSON_CreateObject();
    services_t *service_config = get_service_config();
    cJSON_AddItemToObject(services, "hostname", cJSON_CreateString(service_config->hostname));
    cJSON_AddItemToObject(services, "ota_url", cJSON_CreateString(service_config->ota_url));
    cJSON_AddItemToObject(services, "ntp_server", cJSON_CreateString(service_config->ntp_server));
    cJSON_AddItemToObject(services, "utc_offset", cJSON_CreateNumber(service_config->utc_offset));
    cJSON_AddItemToObject(services, "ntp_dst", cJSON_CreateBool(service_config->ntp_dst));

    char net_buff[16];
    ip_to_string(service_config->mqtt_ip_address, net_buff);
    cJSON_AddItemToObject(services, "mqtt_ip_address", cJSON_CreateString(net_buff));
    char mqtt_port[8];
    if (service_config->mqtt_port > 0) {
        snprintf(mqtt_port, sizeof(mqtt_port), "%u", service_config->mqtt_port);
    } else {
        strlcpy(mqtt_port, "", sizeof(mqtt_port));
    }
    cJSON_AddItemToObject(services, "mqtt_port", cJSON_CreateString(mqtt_port));
    cJSON_AddItemToObject(services, "mqtt_user", cJSON_CreateString(service_config->mqtt_user));
    cJSON_AddItemToObject(services, "mqtt_password", cJSON_CreateString(service_config->mqtt_password));
    cJSON_AddItemToObject(services, "mqtt_qos", cJSON_CreateNumber(service_config->mqtt_qos));
    cJSON_AddItemToObject(services, "enable_ntp", cJSON_CreateBool(service_config->enable_ntp));
    cJSON_AddItemToObject(services, "enable_mqtt", cJSON_CreateBool(service_config->enable_mqtt));

    cJSON_AddItemToObject(root, "services", services);

    datetime_t datetime;
#if defined(USE_MCP7940)
    mcp7940_get_datetime(&datetime);
#else
    time_t now;
    struct tm timeinfo;
    time(&now);
    localtime_r(&now, &timeinfo);
    datetime.year = (uint8_t)(timeinfo.tm_year + 1900 - 2000);
    datetime.month = timeinfo.tm_mon + 1;
    datetime.weekday = timeinfo.tm_wday;
    datetime.day = timeinfo.tm_mday;
    datetime.hour = timeinfo.tm_hour;
    datetime.min = timeinfo.tm_min;
    datetime.sec = timeinfo.tm_sec;
#endif

    char date_string[16];
    char time_string_iso[16];
    char time_zone[16];
    format_iso_date(&datetime, date_string, sizeof(date_string));
    format_iso_time(&datetime, time_string_iso, sizeof(time_string_iso));
    format_utc_offset(service_config->utc_offset, time_zone, sizeof(time_zone));

    cJSON *time_json = cJSON_CreateObject();
    cJSON_AddItemToObject(time_json, "time_zone", cJSON_CreateString(time_zone));
    cJSON_AddItemToObject(time_json, "date", cJSON_CreateString(date_string));
    cJSON_AddItemToObject(time_json, "time", cJSON_CreateString(time_string_iso));
    cJSON_AddItemToObject(root, "time", time_json);

    cJSON *user_json = cJSON_CreateObject();
    auth_t *auth = get_auth_config();
    cJSON_AddItemToObject(user_json, "username", cJSON_CreateString(auth->username));
    cJSON_AddItemToObject(user_json, "password", cJSON_CreateString(auth->password));
    cJSON_AddItemToObject(root, "auth", user_json);

    string = cJSON_Print(root);

    cJSON_Delete(root);
    return string;
}
