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
#include "pumps.h"
#include "app_time.h"
#include "web_server.h"
#include "adc.h"

static void format_iso_date(const datetime_t *datetime, char *buffer, size_t size)
{
    snprintf(buffer, size, "%04u-%02u-%02u", (unsigned)(datetime->year + 2000), datetime->month, datetime->day);
}

static void format_iso_time(const datetime_t *datetime, char *buffer, size_t size)
{
    snprintf(buffer, size, "%02u:%02u:%02u", datetime->hour, datetime->min, datetime->sec);
}

static void format_day_stamp(uint32_t day_stamp, char *buffer, size_t size)
{
    if (day_stamp == 0) {
        strlcpy(buffer, "", size);
        return;
    }

    struct tm timeinfo = {
        .tm_year = (int)(day_stamp / 1000U) - 1900,
        .tm_mon = 0,
        .tm_mday = 1,
    };
    time_t raw = mktime(&timeinfo);
    raw += (time_t)((day_stamp % 1000U) * 24U * 60U * 60U);
    localtime_r(&raw, &timeinfo);
    strftime(buffer, size, "%Y-%m-%d", &timeinfo);
}

char *get_status_json(void)
{
    char *string = NULL;
    char time_string[32];
    char date_string[32];
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

    time_t now = 0;
    struct tm timeinfo = {0};
    time(&now);
    localtime_r(&now, &timeinfo);
    strftime(date_string, sizeof(date_string), "%Y-%m-%d", &timeinfo);
    cJSON_AddItemToObject(status, "local_date", cJSON_CreateString(date_string));

    cJSON_AddItemToObject(status, "free_heap", cJSON_CreateNumber((double)system_status->free_heap));
    cJSON_AddItemToObject(status, "vcc", cJSON_CreateNumber(0));
    cJSON_AddItemToObject(status, "wifi_mode", cJSON_CreateString(system_status->wifi_mode));
    cJSON_AddItemToObject(status, "ip_address", cJSON_CreateString(system_status->net_address));
    cJSON_AddItemToObject(status, "mac_address", cJSON_CreateString(system_status->mac));
    cJSON_AddItemToObject(status, "station_connected", cJSON_CreateBool(system_status->station_connected));
    cJSON_AddItemToObject(status, "station_ssid", cJSON_CreateString(system_status->station_ssid));
    cJSON_AddItemToObject(status, "station_ip_address", cJSON_CreateString(system_status->station_ip_address));
    cJSON_AddItemToObject(status, "station_mac_address", cJSON_CreateString(system_status->station_mac));
    cJSON_AddItemToObject(status, "ap_ssid", cJSON_CreateString(system_status->ap_ssid));
    cJSON_AddItemToObject(status, "ap_ip_address", cJSON_CreateString(system_status->ap_ip_address));
    cJSON_AddItemToObject(status, "ap_mac_address", cJSON_CreateString(system_status->ap_mac));
    cJSON_AddItemToObject(status, "ap_clients", cJSON_CreateNumber(system_status->ap_clients));
    cJSON_AddItemToObject(status, "hardware_version", cJSON_CreateString(HARDWARE_VERSION));
    cJSON_AddItemToObject(status, "firmware_version", cJSON_CreateString(app_description->version));
    cJSON_AddItemToObject(status, "firmware_date", cJSON_CreateString(app_description->date));
    cJSON_AddItemToObject(status, "board_temperature", cJSON_CreateNumber(system_status->board_temperature));
    cJSON_AddItemToObject(status, "wifi_disconnects", cJSON_CreateNumber(system_status->wifi_disconnects));
    cJSON_AddItemToObject(status, "reboot_count", cJSON_CreateNumber(system_status->reboot_count));
    cJSON_AddItemToObject(status, "last_reboot_reason", cJSON_CreateString(system_status->last_reboot_reason));
    cJSON_AddItemToObject(status, "storage_backend", cJSON_CreateString(eeprom_backend_name()));
    cJSON_AddItemToObject(status, "rtc_backend", cJSON_CreateString(get_rtc_backend_name()));
    cJSON_AddItemToObject(status, "time_valid", cJSON_CreateBool(app_time_is_valid()));
    cJSON_AddItemToObject(status, "time_warning", cJSON_CreateString(app_time_warning_message()));

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
    cJSON_AddStringToObject(mqtt_status, "last_error", get_mqtt_last_error());
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
        cJSON_AddItemToObject(schedule_item, "volume",
                              cJSON_CreateNumber(schedule_volume_dml_to_ml(schedule_config->day_volume_dml)));
        cJSON_AddItemToArray(schedule, schedule_item);
    }
    cJSON_AddItemToObject(root, "schedule", schedule);

    string = cJSON_Print(root);

    cJSON_Delete(root);
    return string;
}

static const char *pump_state_to_string(pump_state_t state)
{
    switch (state) {
        case PUMP_ON:
            return "timed";
        case PUMP_CONTINUOUS:
            return "continuous";
        case PUMP_CAL:
            return "calibration";
        case PUMP_OFF:
        default:
            return "off";
    }
}

static cJSON *pump_driver_status_to_json(const pump_driver_status_t *driver_status)
{
    cJSON *driver = cJSON_CreateObject();
    cJSON_AddBoolToObject(driver, "uart_ready", driver_status->uart_ready);
    cJSON_AddBoolToObject(driver, "reset", driver_status->reset);
    cJSON_AddBoolToObject(driver, "driver_error", driver_status->driver_error);
    cJSON_AddBoolToObject(driver, "undervoltage", driver_status->undervoltage);
    cJSON_AddBoolToObject(driver, "otpw", driver_status->otpw);
    cJSON_AddBoolToObject(driver, "ot", driver_status->ot);
    cJSON_AddBoolToObject(driver, "s2ga", driver_status->s2ga);
    cJSON_AddBoolToObject(driver, "s2gb", driver_status->s2gb);
    cJSON_AddBoolToObject(driver, "s2vsa", driver_status->s2vsa);
    cJSON_AddBoolToObject(driver, "s2vsb", driver_status->s2vsb);
    cJSON_AddBoolToObject(driver, "ola", driver_status->ola);
    cJSON_AddBoolToObject(driver, "olb", driver_status->olb);
    cJSON_AddNumberToObject(driver, "thermal_level", driver_status->thermal_level);
    cJSON_AddNumberToObject(driver, "cs_actual", driver_status->cs_actual);
    cJSON_AddBoolToObject(driver, "stealth", driver_status->stealth);
    cJSON_AddBoolToObject(driver, "standstill", driver_status->standstill);
    cJSON_AddNumberToObject(driver, "version", driver_status->version);
    return driver;
}

char *get_pumps_runtime_json(void)
{
    char *string = NULL;
    cJSON *root = cJSON_CreateObject();
    cJSON *runtime = cJSON_CreateArray();
    const pumps_status_t *pump_runtime = get_pumps_runtime_status();

    for (uint8_t i = 0; i < MAX_PUMP; ++i) {
        const pumps_status_t *pump = &pump_runtime[i];
        cJSON *item = cJSON_CreateObject();
        cJSON_AddItemToObject(item, "id", cJSON_CreateNumber(i));
        cJSON_AddItemToObject(item, "active", cJSON_CreateBool(pump->state != PUMP_OFF));
        cJSON_AddItemToObject(item, "state", cJSON_CreateString(pump_state_to_string(pump->state)));
        cJSON_AddItemToObject(item, "speed", cJSON_CreateNumber(pump->rpm));
        cJSON_AddItemToObject(item, "direction", cJSON_CreateBool(pump->direction));
        cJSON_AddItemToObject(item, "remaining_ticks", cJSON_CreateNumber(pump->time));
        cJSON_AddItemToObject(item, "remaining_seconds",
                              cJSON_CreateNumber((double)pump->time / (double)PUMP_TIMER_UNIT_IN_SEC));
        cJSON_AddItemToObject(item, "volume_ml", cJSON_CreateNumber(pump->volume));
        cJSON_AddItemToObject(item, "alert_flags", cJSON_CreateNumber((double)pump->alert_flags));
        cJSON_AddItemToObject(item, "driver", pump_driver_status_to_json(&pump->driver_status));
        cJSON_AddItemToArray(runtime, item);
    }

    cJSON_AddItemToObject(root, "pumps", runtime);
    string = cJSON_Print(root);
    cJSON_Delete(root);
    return string;
}

char *get_pumps_history_json(void)
{
    char *string = NULL;
    cJSON *root = cJSON_CreateObject();
    cJSON *pumps_json = cJSON_CreateArray();
    const uint32_t current_day_stamp = app_pumps_history_get_current_day_stamp();

    cJSON_AddItemToObject(root, "retention_days", cJSON_CreateNumber(APP_PUMP_HISTORY_RETAINED_DAYS));
    cJSON_AddItemToObject(root, "current_day_stamp", cJSON_CreateNumber(current_day_stamp));

    for (uint8_t pump_id = 0; pump_id < MAX_PUMP; ++pump_id) {
        cJSON *pump_json = cJSON_CreateObject();
        cJSON *days_json = cJSON_CreateArray();
        pump_t *pump_config = get_pump_config(pump_id);

        cJSON_AddItemToObject(pump_json, "id", cJSON_CreateNumber(pump_id));
        cJSON_AddItemToObject(pump_json, "name", cJSON_CreateString(pump_config->name));

        for (int offset = APP_PUMP_HISTORY_RETAINED_DAYS - 1; offset >= 0; --offset) {
            if (current_day_stamp < (uint32_t)offset) {
                continue;
            }

            const uint32_t day_stamp = current_day_stamp - (uint32_t)offset;
            pump_history_day_t day = {0};
            if (!app_pumps_history_get_day(pump_id, day_stamp, &day)) {
                continue;
            }

            cJSON *day_json = cJSON_CreateObject();
            cJSON *hours_json = cJSON_CreateArray();
            char date_string[16];

            format_day_stamp(day.day_stamp, date_string, sizeof(date_string));
            cJSON_AddItemToObject(day_json, "day_stamp", cJSON_CreateNumber(day.day_stamp));
            cJSON_AddItemToObject(day_json, "date", cJSON_CreateString(date_string));

            for (uint8_t hour = 0; hour < APP_PUMP_HISTORY_HOURS; ++hour) {
                const pump_history_hour_t *slot = &day.hours[hour];
                cJSON *hour_json = cJSON_CreateObject();
                cJSON_AddItemToObject(hour_json, "hour", cJSON_CreateNumber(hour));
                cJSON_AddItemToObject(hour_json, "scheduled_volume_ml",
                                      cJSON_CreateNumber(app_pumps_history_volume_cml_to_ml(slot->scheduled_volume_cml)));
                cJSON_AddItemToObject(hour_json, "manual_volume_ml",
                                      cJSON_CreateNumber(app_pumps_history_volume_cml_to_ml(slot->manual_volume_cml)));
                cJSON_AddItemToObject(hour_json, "total_runtime_s", cJSON_CreateNumber(slot->total_runtime_s));
                cJSON_AddItemToObject(hour_json, "flags", cJSON_CreateNumber(slot->flags));
                cJSON_AddItemToArray(hours_json, hour_json);
            }

            cJSON_AddItemToObject(day_json, "hours", hours_json);
            cJSON_AddItemToArray(days_json, day_json);
        }

        cJSON_AddItemToObject(pump_json, "days", days_json);
        cJSON_AddItemToArray(pumps_json, pump_json);
    }

    cJSON_AddItemToObject(root, "pumps", pumps_json);
    string = cJSON_Print(root);
    cJSON_Delete(root);
    return string;
}

char *get_board_config_json(void)
{
    char *string = NULL;
    cJSON *root = cJSON_CreateObject();
    stepper_board_config_t *config = get_stepper_board_config();

    cJSON_AddNumberToObject(root, "uart", config->uart);
    cJSON_AddNumberToObject(root, "tx_pin", config->tx_pin);
    cJSON_AddNumberToObject(root, "rx_pin", config->rx_pin);
    cJSON_AddNumberToObject(root, "motors_num", config->motors_num);
    cJSON_AddNumberToObject(root, "rtc_i2c_addr", config->rtc_i2c_addr);
    cJSON_AddNumberToObject(root, "eeprom_i2c_addr", config->eeprom_i2c_addr);
    cJSON_AddNumberToObject(root, "i2c_sda_pin", config->i2c_sda_pin);
    cJSON_AddNumberToObject(root, "i2c_scl_pin", config->i2c_scl_pin);
    cJSON_AddNumberToObject(root, "can_tx_pin", config->can_tx_pin);
    cJSON_AddNumberToObject(root, "can_rx_pin", config->can_rx_pin);

    cJSON *channels = cJSON_CreateArray();
    for (uint8_t i = 0; i < MAX_PUMP; ++i) {
        cJSON *item = cJSON_CreateObject();
        cJSON_AddNumberToObject(item, "id", i);
        cJSON_AddNumberToObject(item, "dir_pin", config->channels[i].dir_pin);
        cJSON_AddNumberToObject(item, "en_pin", config->channels[i].en_pin);
        cJSON_AddNumberToObject(item, "step_pin", config->channels[i].step_pin);
        cJSON_AddNumberToObject(item, "micro_steps", config->channels[i].micro_steps);
        cJSON_AddItemToArray(channels, item);
    }

    cJSON_AddItemToObject(root, "channels", channels);

    cJSON *adc_channels = cJSON_CreateArray();
    for (uint8_t i = 0; i < MAX_BOARD_ADC_CHANNELS; ++i) {
        cJSON *item = cJSON_CreateObject();
        cJSON_AddNumberToObject(item, "id", config->adc_channels[i].id);
        cJSON_AddNumberToObject(item, "pin", config->adc_channels[i].pin);
        cJSON_AddBoolToObject(item, "enabled", config->adc_channels[i].enabled);
        cJSON_AddItemToArray(adc_channels, item);
    }
    cJSON_AddItemToObject(root, "adc_channels", adc_channels);

    cJSON *gpio_inputs = cJSON_CreateArray();
    for (uint8_t i = 0; i < MAX_BOARD_GPIO_INPUTS; ++i) {
        cJSON *item = cJSON_CreateObject();
        cJSON_AddNumberToObject(item, "id", config->gpio_inputs[i].id);
        cJSON_AddNumberToObject(item, "pin", config->gpio_inputs[i].pin);
        cJSON_AddBoolToObject(item, "enabled", config->gpio_inputs[i].enabled);
        cJSON_AddNumberToObject(item, "pull", config->gpio_inputs[i].pull);
        cJSON_AddNumberToObject(item, "active_level", config->gpio_inputs[i].active_level);
        cJSON_AddItemToArray(gpio_inputs, item);
    }
    cJSON_AddItemToObject(root, "gpio_inputs", gpio_inputs);

    cJSON *gpio_outputs = cJSON_CreateArray();
    for (uint8_t i = 0; i < MAX_BOARD_GPIO_OUTPUTS; ++i) {
        cJSON *item = cJSON_CreateObject();
        cJSON_AddNumberToObject(item, "id", config->gpio_outputs[i].id);
        cJSON_AddNumberToObject(item, "pin", config->gpio_outputs[i].pin);
        cJSON_AddBoolToObject(item, "enabled", config->gpio_outputs[i].enabled);
        cJSON_AddNumberToObject(item, "active_level", config->gpio_outputs[i].active_level);
        cJSON_AddItemToArray(gpio_outputs, item);
    }
    cJSON_AddItemToObject(root, "gpio_outputs", gpio_outputs);

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
        cJSON_AddItemToObject(pump_item, "max_single_run_ml", cJSON_CreateNumber((double)pump_config->safety.max_single_run_ml));
        cJSON_AddItemToObject(pump_item, "max_single_run_seconds", cJSON_CreateNumber((double)pump_config->safety.max_single_run_seconds));
        cJSON_AddItemToObject(pump_item, "max_hourly_ml", cJSON_CreateNumber((double)pump_config->safety.max_hourly_ml));
        cJSON_AddItemToObject(pump_item, "max_daily_ml", cJSON_CreateNumber((double)pump_config->safety.max_daily_ml));

        cJSON *aging_item = cJSON_CreateObject();
        cJSON_AddItemToObject(aging_item, "warning_hours", cJSON_CreateNumber(pump_config->aging.warning_hours));
        cJSON_AddItemToObject(aging_item, "replace_hours", cJSON_CreateNumber(pump_config->aging.replace_hours));
        cJSON_AddItemToObject(pump_item, "aging", aging_item);

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
        cJSON_AddItemToObject(schedule_item, "volume",
                              cJSON_CreateNumber(schedule_volume_dml_to_ml(schedule_config->day_volume_dml)));
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
                cJSON_AddItemToObject(network_item, "keep_ap_active", cJSON_CreateBool(network_config->keep_ap_active));
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
                cJSON_AddItemToObject(network_item, "vlan_tag", cJSON_CreateNumber(network_config->vlan_tag));
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
    cJSON_AddItemToObject(services, "time_zone", cJSON_CreateString(service_config->time_zone));

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
    cJSON_AddItemToObject(services, "mqtt_retain", cJSON_CreateBool(service_config->mqtt_retain != 0));
    cJSON_AddItemToObject(services, "mqtt_discovery_topic",
                          cJSON_CreateString(service_config->mqtt_discovery_topic));
    cJSON_AddItemToObject(services, "mqtt_discovery_status_topic",
                          cJSON_CreateString(service_config->mqtt_discovery_status_topic));
    cJSON_AddItemToObject(services, "max_total_daily_ml",
                          cJSON_CreateNumber((double)service_config->max_total_daily_ml));
    cJSON_AddItemToObject(services, "enable_ntp", cJSON_CreateBool(service_config->enable_ntp));
    cJSON_AddItemToObject(services, "enable_mqtt", cJSON_CreateBool(service_config->enable_mqtt));
    cJSON_AddItemToObject(services, "enable_mqtt_discovery",
                          cJSON_CreateBool(service_config->enable_mqtt_discovery));

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
    char time_zone[64];
    format_iso_date(&datetime, date_string, sizeof(date_string));
    format_iso_time(&datetime, time_string_iso, sizeof(time_string_iso));
    strlcpy(time_zone, service_config->time_zone, sizeof(time_zone));

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

    cJSON *app_json = cJSON_CreateObject();
    app_state_t *app_state = get_app_state_config();
    cJSON_AddItemToObject(app_json, "onboarding_completed", cJSON_CreateBool(app_state->onboarding_completed));
    cJSON_AddItemToObject(root, "app", app_json);

    string = cJSON_Print(root);

    cJSON_Delete(root);
    return string;
}
