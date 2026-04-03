/***
** Created by Aleksey Volkov on 15.12.2019.
***/

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "esp_log.h"
#include "esp_ota_ops.h"
#include "esp_system.h"

#include "app_settings.h"
#include "auth.h"
#include "eeprom.h"
#include "mcp7940.h"
#include "mqtt.h"
#include "pumps.h"
#include "rtc.h"

#include "app_http_backend_priv.h"

static const char *TAG = "WEBSERVER";

esp_err_t upgrade_firmware(void);

static void send_unauthorized(httpd_req_t *req)
{
    httpd_resp_set_status(req, "401 Unauthorized!");
    httpd_resp_send(req, NULL, 0);
}

esp_err_t reboot_get_handler(httpd_req_t *req)
{
    if (app_http_validate_request(req) == ESP_OK) {
        char *response = app_http_success_response_json(true);
        httpd_resp_send(req, response, (ssize_t)strlen(response));
        free(response);
        esp_restart();
    } else {
        send_unauthorized(req);
    }

    return ESP_OK;
}

esp_err_t factory_get_handler(httpd_req_t *req)
{
    if (app_http_validate_request(req) == ESP_OK) {
        char *response = app_http_success_response_json(true);
        httpd_resp_send(req, response, (ssize_t)strlen(response));
        free(response);
        erase_settings();
        esp_restart();
    } else {
        send_unauthorized(req);
    }

    return ESP_OK;
}

esp_err_t ota_get_handler(httpd_req_t *req)
{
    if (app_http_validate_request(req) == ESP_OK) {
        char *response = app_http_success_response_json(true);
        httpd_resp_send(req, response, (ssize_t)strlen(response));
        free(response);
        upgrade_firmware();
    } else {
        send_unauthorized(req);
    }

    return ESP_OK;
}

esp_err_t upload_post_handler(httpd_req_t *req)
{
    char buf[1024];
    esp_ota_handle_t ota_handle;
    int remaining = (int)req->content_len;
    bool header_skipped = false;

    const esp_partition_t *ota_partition = esp_ota_get_next_update_partition(NULL);
    ESP_ERROR_CHECK(esp_ota_begin(ota_partition, OTA_SIZE_UNKNOWN, &ota_handle));

    while (remaining > 0) {
        int recv_len = httpd_req_recv(req, buf, MIN(remaining, sizeof(buf)));

        ESP_LOGD(TAG, "recv_len %d", recv_len);

        if (recv_len == HTTPD_SOCK_ERR_TIMEOUT) {
            continue;
        } else if (recv_len <= 0) {
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Protocol Error");
            return ESP_FAIL;
        }

        if (!header_skipped) {
            header_skipped = true;

            char *files_start_p = strstr(buf, "\r\n\r\n") + 4;
            long files_part_len = recv_len - (files_start_p - buf);

            ESP_LOGI(TAG, "OTA File Size: %d : Start Location:%d - End Location:%ld\r\n",
                     remaining, *files_start_p, files_part_len);

            if (esp_ota_write(ota_handle, (const void *)files_start_p, files_part_len) != ESP_OK) {
                httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Flash Error");
                return ESP_FAIL;
            }
        } else if (esp_ota_write(ota_handle, (const void *)buf, recv_len) != ESP_OK) {
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Flash Error");
            return ESP_FAIL;
        }

        remaining -= recv_len;
    }

    if (esp_ota_end(ota_handle) != ESP_OK || esp_ota_set_boot_partition(ota_partition) != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Validation / Activation Error");
        return ESP_FAIL;
    }

    char *response = app_http_success_response_json(true);
    httpd_resp_send(req, response, (ssize_t)strlen(response));
    free(response);

    vTaskDelay(500 / portTICK_PERIOD_MS);
    esp_restart();
    return ESP_OK;
}

esp_err_t status_get_handler(httpd_req_t *req)
{
    char *response = get_status_json();
    httpd_resp_send(req, response, (ssize_t)strlen(response));
    free(response);
    return ESP_OK;
}

esp_err_t schedule_get_handler(httpd_req_t *req)
{
    if (app_http_validate_request(req) == ESP_OK) {
        char *response = get_schedule_json();
        httpd_resp_send(req, response, (ssize_t)strlen(response));
        free(response);
    } else {
        send_unauthorized(req);
    }

    return ESP_OK;
}

esp_err_t settings_get_handler(httpd_req_t *req)
{
    if (app_http_validate_request(req) == ESP_OK) {
        char *response = get_settings_json();
        httpd_resp_send(req, response, (ssize_t)strlen(response));
        free(response);
    } else {
        send_unauthorized(req);
    }

    return ESP_OK;
}

esp_err_t run_post_handler(httpd_req_t *req)
{
    int total_len = (int)req->content_len;
    int cur_len = 0;
    char *buf = malloc(req->content_len + 1);
    int received = 0;

    if (total_len >= SCRATCH_BUFSIZE) {
        free(buf);
        return ESP_FAIL;
    }

    if (app_http_validate_request(req) != ESP_OK) {
        send_unauthorized(req);
    } else {
        while (cur_len < total_len) {
            received = httpd_req_recv(req, buf + cur_len, total_len);
            if (received <= 0) {
                free(buf);
                return ESP_FAIL;
            }
            cur_len += received;
        }
        buf[total_len] = '\0';

        cJSON *root = cJSON_Parse(buf);
        cJSON *channel = cJSON_GetObjectItem(root, "channel");
        cJSON *timeout = cJSON_GetObjectItem(root, "volume");
        cJSON *action = cJSON_GetObjectItem(root, "action");

        uint8_t channel_id = channel->valueint;
        uint16_t run_volume = timeout->valueint;
        uint16_t run_action = action->valueint;
        ESP_LOGI(TAG, "run_post_handler channel %d timeout %d action %d",
                 channel_id, run_volume, run_action);

        run_pump_on_volume(channel_id, run_volume, 100);

        cJSON_Delete(root);

        char *response = app_http_success_response_json(true);
        httpd_resp_send(req, response, (ssize_t)strlen(response));
        free(response);
    }

    free(buf);
    return ESP_OK;
}

esp_err_t calibrate_post_handler(httpd_req_t *req)
{
    int total_len = (int)req->content_len;
    int cur_len = 0;
    char *buf = malloc(req->content_len + 1);
    int received = 0;

    if (total_len >= SCRATCH_BUFSIZE) {
        free(buf);
        return ESP_FAIL;
    }

    if (app_http_validate_request(req) != ESP_OK) {
        send_unauthorized(req);
    } else {
        while (cur_len < total_len) {
            received = httpd_req_recv(req, buf + cur_len, total_len);
            if (received <= 0) {
                free(buf);
                return ESP_FAIL;
            }
            cur_len += received;
        }
        buf[total_len] = '\0';

        char *response = NULL;
        cJSON *root = cJSON_Parse(buf);

        cJSON *channel = cJSON_GetObjectItem(root, "channel");
        cJSON *action = cJSON_GetObjectItem(root, "action");
        cJSON *speed = cJSON_GetObjectItem(root, "speed");
        cJSON *volume = cJSON_GetObjectItem(root, "volume");

        if (cJSON_IsNumber(speed) && cJSON_IsNumber(volume) &&
            cJSON_IsBool(action) && cJSON_IsNumber(channel)) {
            uint8_t channel_id = channel->valueint;
            bool act = action->valueint;
            uint16_t spd = speed->valueint;
            uint16_t vol = volume->valueint;

            ESP_LOGI(TAG, "calibrate_post_handler\n"
                          "channel: %u\n"
                          "volume : %u\n"
                          "speed  : %u\n"
                          "is %s",
                     channel_id, vol, spd, act ? "start" : "stop");

            run_pump_calibration(channel_id, act);
            response = app_http_success_response_json(true);
        } else {
            response = app_http_success_response_json(false);
        }

        cJSON_Delete(root);
        httpd_resp_send(req, response, (ssize_t)strlen(response));
        free(response);
    }

    free(buf);
    return ESP_OK;
}

esp_err_t schedule_post_handler(httpd_req_t *req)
{
    int total_len = (int)req->content_len;
    char *buf = malloc(req->content_len + 1);

    if (total_len >= SCRATCH_BUFSIZE) {
        free(buf);
        return ESP_FAIL;
    }

    if (app_http_validate_request(req) != ESP_OK) {
        send_unauthorized(req);
    } else {
        int cur_len = 0;
        while (cur_len < total_len) {
            int received = httpd_req_recv(req, buf + cur_len, total_len);
            if (received <= 0) {
                free(buf);
                return ESP_FAIL;
            }
            cur_len += received;
        }
        buf[total_len] = '\0';

        cJSON *root = cJSON_Parse(buf);

        for (uint8_t i = 0; i < MAX_SCHEDULE; i++) {
            schedule_t *schedule_config = get_schedule_config(i);
            schedule_config->active = false;
        }

        uint8_t id = 0;
        cJSON *schedule_item;
        cJSON *schedule = cJSON_GetObjectItem(root, "schedule");
        cJSON_ArrayForEach(schedule_item, schedule) {
            schedule_t *schedule_config = get_schedule_config(id);

            cJSON *pump_id = cJSON_GetObjectItem(schedule_item, "pump_id");
            cJSON *work_hours = cJSON_GetObjectItem(schedule_item, "work_hours");
            cJSON *weekdays = cJSON_GetObjectItem(schedule_item, "weekdays");
            cJSON *speed = cJSON_GetObjectItem(schedule_item, "speed");
            cJSON *day_volume = cJSON_GetObjectItem(schedule_item, "day_volume");
            cJSON *active = cJSON_GetObjectItem(schedule_item, "active");

            schedule_config->pump_id = pump_id->valueint;

            if (cJSON_IsArray(work_hours)) {
                schedule_config->work_hours = 0;
                cJSON *hour_item;
                cJSON_ArrayForEach(hour_item, work_hours) {
                    schedule_config->work_hours |= 1 << (uint8_t)hour_item->valueint;
                }
            }

            if (cJSON_IsArray(weekdays)) {
                schedule_config->week_days = 0;
                cJSON *weekday_item;
                cJSON_ArrayForEach(weekday_item, weekdays) {
                    schedule_config->week_days |= 1 << (uint8_t)weekday_item->valueint;
                }
            }

            schedule_config->speed = speed->valueint;
            schedule_config->day_volume = day_volume->valueint;
            schedule_config->active = active->valueint;

            id++;
        }

        cJSON_Delete(root);
        save_schedule();

        char *response = app_http_success_response_json(true);
        httpd_resp_send(req, response, (ssize_t)strlen(response));
        free(response);
    }

    free(buf);
    return ESP_OK;
}

esp_err_t settings_post_handler(httpd_req_t *req)
{
    int total_len = (int)req->content_len;
    char *buf = malloc(req->content_len + 1);

    if (total_len >= SCRATCH_BUFSIZE) {
        free(buf);
        return ESP_FAIL;
    }

    if (app_http_validate_request(req) != ESP_OK) {
        send_unauthorized(req);
    } else {
        int cur_len = 0;
        while (cur_len < total_len) {
            int received = httpd_req_recv(req, buf + cur_len, total_len);
            if (received <= 0) {
                free(buf);
                return ESP_FAIL;
            }
            cur_len += received;
        }
        buf[total_len] = '\0';

        cJSON *root = cJSON_Parse(buf);

        cJSON *pump_channels = cJSON_GetObjectItem(root, "pumps");
        if (cJSON_IsArray(pump_channels)) {
            cJSON *pump_item;
            cJSON_ArrayForEach(pump_item, pump_channels) {
                cJSON *id = cJSON_GetObjectItem(pump_item, "id");
                cJSON *name = cJSON_GetObjectItem(pump_item, "name");
                cJSON *calibration = cJSON_GetObjectItem(pump_item, "calibration");
                cJSON *tank_full_volume = cJSON_GetObjectItem(pump_item, "tank_full_vol");
                cJSON *tank_concentration_total = cJSON_GetObjectItem(pump_item, "tank_concentration_total");
                cJSON *tank_concentration_active = cJSON_GetObjectItem(pump_item, "tank_concentration_active");
                cJSON *tank_current_volume = cJSON_GetObjectItem(pump_item, "tank_current_vol");
                cJSON *state = cJSON_GetObjectItem(pump_item, "state");

                pump_t *pump_config = get_pump_config(id->valueint);

                if (cJSON_IsString(name) && (name->valuestring != NULL)) {
                    strlcpy(pump_config->name, name->valuestring, 32);
                }

                pump_config->calibration_100ml_units = calibration->valueint;
                pump_config->tank_full_vol = tank_full_volume->valueint;
                pump_config->tank_concentration_total = tank_concentration_total->valueint;
                pump_config->tank_concentration_active = tank_concentration_active->valueint;
                pump_config->tank_current_vol = tank_current_volume->valuedouble;
                pump_config->state = state->valueint;
            }

            save_pump();
            backup_eeprom_tank_status();
        }

        cJSON *networks = cJSON_GetObjectItem(root, "networks");
        if (cJSON_IsArray(networks)) {
            if (cJSON_GetArraySize(networks) > 0) {
                for (uint8_t i = 0; i < MAX_NETWORKS; i++) {
                    network_t *network_config = get_networks_config(i);
                    network_config->active = false;
                }

                cJSON *network_item;
                uint8_t network_id = 0;
                cJSON_ArrayForEach(network_item, networks) {
                    network_t *network_config = get_networks_config(network_id);

                    cJSON *ssid = cJSON_GetObjectItem(network_item, "ssid");
                    if (cJSON_IsString(ssid) && (ssid->valuestring != NULL)) {
                        strlcpy(network_config->ssid, ssid->valuestring, 32);
                    }

                    cJSON *password = cJSON_GetObjectItem(network_item, "password");
                    if (cJSON_IsString(password) && (password->valuestring != NULL)) {
                        strlcpy(network_config->password, password->valuestring, 64);
                    }

                    cJSON *ip_address = cJSON_GetObjectItem(network_item, "ip_address");
                    if (cJSON_IsString(ip_address) && (ip_address->valuestring != NULL)) {
                        string_to_ip(ip_address->valuestring, network_config->ip_address);
                    }

                    cJSON *mask = cJSON_GetObjectItem(network_item, "mask");
                    if (cJSON_IsString(mask) && (mask->valuestring != NULL)) {
                        string_to_ip(mask->valuestring, network_config->mask);
                    }

                    cJSON *gateway = cJSON_GetObjectItem(network_item, "gateway");
                    if (cJSON_IsString(gateway) && (gateway->valuestring != NULL)) {
                        string_to_ip(gateway->valuestring, network_config->gateway);
                    }

                    cJSON *dns = cJSON_GetObjectItem(network_item, "dns");
                    if (cJSON_IsString(dns) && (dns->valuestring != NULL)) {
                        string_to_ip(dns->valuestring, network_config->dns);
                    }

                    cJSON *dhcp = cJSON_GetObjectItem(network_item, "dhcp");
                    network_config->dhcp = cJSON_IsTrue(dhcp);
                    network_config->active = true;
                    network_id++;
                }
            } else {
                for (uint8_t i = 0; i < MAX_NETWORKS; i++) {
                    network_t *network_config = get_networks_config(i);
                    network_config->active = false;
                }
            }

            save_network();
        }

        cJSON *services = cJSON_GetObjectItem(root, "services");
        if (cJSON_IsObject(services)) {
            services_t *service_config = get_service_config();

            cJSON *hostname = cJSON_GetObjectItem(services, "hostname");
            if (cJSON_IsString(hostname) && (hostname->valuestring != NULL)) {
                strlcpy(service_config->hostname, hostname->valuestring, 20);
            }

            cJSON *ota_url = cJSON_GetObjectItem(services, "ota_url");
            if (cJSON_IsString(ota_url) && (ota_url->valuestring != NULL)) {
                strlcpy(service_config->ota_url, ota_url->valuestring, 64);
            }

            cJSON *ntp_server = cJSON_GetObjectItem(services, "ntp_server");
            if (cJSON_IsString(ntp_server) && (hostname->valuestring != NULL)) {
                strlcpy(service_config->ntp_server, ntp_server->valuestring, 20);
            }

            cJSON *utc_offset = cJSON_GetObjectItem(services, "utc_offset");
            service_config->utc_offset = utc_offset->valueint;

            cJSON *ntp_dst = cJSON_GetObjectItem(services, "ntp_dst");
            service_config->ntp_dst = cJSON_IsTrue(ntp_dst);

            cJSON *mqtt_ip_address = cJSON_GetObjectItem(services, "mqtt_ip_address");
            if (cJSON_IsString(mqtt_ip_address) && (mqtt_ip_address->valuestring != NULL)) {
                string_to_ip(mqtt_ip_address->valuestring, service_config->mqtt_ip_address);
            }

            cJSON *mqtt_port = cJSON_GetObjectItem(services, "mqtt_port");
            if (cJSON_IsNumber(mqtt_port)) {
                service_config->mqtt_port = mqtt_port->valueint;
            }

            cJSON *mqtt_user = cJSON_GetObjectItem(services, "mqtt_user");
            if (cJSON_IsString(mqtt_user) && (mqtt_user->valuestring != NULL)) {
                strlcpy(service_config->mqtt_user, mqtt_user->valuestring, 16);
            }

            cJSON *mqtt_password = cJSON_GetObjectItem(services, "mqtt_password");
            if (cJSON_IsString(mqtt_password) && (mqtt_password->valuestring != NULL)) {
                strlcpy(service_config->mqtt_password, mqtt_password->valuestring, 16);
            }

            cJSON *mqtt_qos = cJSON_GetObjectItem(services, "mqtt_qos");
            service_config->mqtt_qos = mqtt_qos->valueint;

            cJSON *enable_ntp = cJSON_GetObjectItem(services, "enable_ntp");
            service_config->enable_ntp = cJSON_IsTrue(enable_ntp);

            cJSON *enable_mqtt = cJSON_GetObjectItem(services, "enable_mqtt");
            service_config->enable_mqtt = cJSON_IsTrue(enable_mqtt);

            save_service();
        }

        cJSON *time = cJSON_GetObjectItem(root, "time");
        if (cJSON_IsObject(time)) {
            cJSON *year = cJSON_GetObjectItem(time, "year");
            cJSON *month = cJSON_GetObjectItem(time, "month");
            cJSON *day = cJSON_GetObjectItem(time, "day");
            cJSON *weekday = cJSON_GetObjectItem(time, "weekday");
            cJSON *hour = cJSON_GetObjectItem(time, "hour");
            cJSON *minute = cJSON_GetObjectItem(time, "minute");
            cJSON *second = cJSON_GetObjectItem(time, "second");

            datetime_t datetime;
            datetime.year = year->valueint;
            datetime.month = month->valueint;
            datetime.day = day->valueint;
            datetime.weekday = weekday->valueint;
            datetime.hour = hour->valueint;
            datetime.min = minute->valueint;
            datetime.sec = second->valueint;

#if defined(USE_MCP7940)
            mcp7940_set_datetime(&datetime);
#endif
            char *debug_string = cJSON_Print(time);
            if (debug_string == NULL) {
                fprintf(stderr, "Failed to print time.\n");
            } else {
                ESP_LOGI(TAG, "JSON parse time: %s", debug_string);
            }
            free(debug_string);
        }

        cJSON *user_json = cJSON_GetObjectItem(root, "auth");
        if (cJSON_IsObject(user_json)) {
            auth_t *auth = get_auth_config();

            cJSON *user = cJSON_GetObjectItem(user_json, "username");
            if (cJSON_IsString(user) && (user->valuestring != NULL)) {
                strlcpy(auth->username, user->valuestring, 32);
            }

            cJSON *password = cJSON_GetObjectItem(user_json, "password");
            if (cJSON_IsString(password) && (password->valuestring != NULL)) {
                strlcpy(auth->password, password->valuestring, 32);
            }

            save_auth();
        }

        cJSON_Delete(root);

        char *response = app_http_success_response_json(true);
        httpd_resp_send(req, response, (ssize_t)strlen(response));
        free(response);
    }

    free(buf);
    return ESP_OK;
}

esp_err_t auth_post_handler(httpd_req_t *req)
{
    bool user_valid = false;
    int total_len = (int)req->content_len;
    char *buf = malloc(req->content_len + 1);

    if (total_len >= SCRATCH_BUFSIZE) {
        free(buf);
        return ESP_FAIL;
    }

    int cur_len = 0;
    while (cur_len < total_len) {
        int received = httpd_req_recv(req, buf + cur_len, total_len);
        if (received <= 0) {
            free(buf);
            return ESP_FAIL;
        }
        cur_len += received;
    }
    buf[total_len] = '\0';

    cJSON *root = cJSON_Parse(buf);
    cJSON *user = cJSON_GetObjectItem(root, "username");
    cJSON *password = cJSON_GetObjectItem(root, "password");

    auth_t *auth = get_auth_config();

    if (cJSON_IsString(user) && (user->valuestring != NULL)) {
        if (strncmp(user->valuestring, auth->username, strlen(auth->username)) == 0) {
            user_valid = true;
        }
    }

    if (cJSON_IsString(password) && (password->valuestring != NULL)) {
        if (strncmp(password->valuestring, auth->password, strlen(auth->password)) != 0 || !user_valid) {
            user_valid = false;
        }
    } else {
        user_valid = false;
    }

    cJSON_Delete(root);

    if (user_valid) {
        generateToken(app_http_auth_token);
        strncpy(auth->token, app_http_auth_token, sizeof(auth->token));
        save_auth();

        cJSON *json = cJSON_CreateObject();
        cJSON_AddTrueToObject(json, "success");
        cJSON_AddItemToObject(json, "token", cJSON_CreateString(app_http_auth_token));

        char *response = cJSON_Print(json);
        cJSON_Delete(json);

        httpd_resp_send(req, response, (ssize_t)strlen(response));
        free(response);
    } else {
        send_unauthorized(req);
    }

    free(buf);
    return ESP_OK;
}
