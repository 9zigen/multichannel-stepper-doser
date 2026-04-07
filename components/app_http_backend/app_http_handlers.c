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
#include "esp_wifi.h"
#include "esp_http_server.h"

#include "app_settings.h"
#include "auth.h"
#include "connect.h"
#include "web_server.h"
#include "app_settings_storage.h"
#include "mcp7940.h"
#include "mqtt.h"
#include "pumps.h"
#include "rtc.h"

#include "app_http_backend_priv.h"

static const char *TAG = "WEBSERVER";

esp_err_t upgrade_firmware(void);

static uint32_t calibration_to_100ml_units(const pump_t *pump)
{
    if (pump->calibration_count == 0 || pump->calibration[0].flow <= 0.0f) {
        return 0;
    }

    return (uint32_t)((100.0f / pump->calibration[0].flow) * 60.0f);
}

static esp_err_t websocket_send_json(httpd_req_t *req, const char *payload)
{
    return app_http_ws_send_json_to_client(req->handle, httpd_req_to_sockfd(req), payload);
}

esp_err_t websocket_pre_handshake_cb(httpd_req_t *req)
{
    if (app_http_validate_ws_request(req) == ESP_OK) {
        return ESP_OK;
    }

    app_http_set_cors_headers(req);
    httpd_resp_set_status(req, "401 Unauthorized");
    httpd_resp_send(req, NULL, 0);
    return ESP_FAIL;
}

static void send_unauthorized(httpd_req_t *req)
{
    app_http_set_cors_headers(req);
    httpd_resp_set_status(req, "401 Unauthorized");
    httpd_resp_send(req, NULL, 0);
}

static esp_err_t send_success_and_restart(httpd_req_t *req, bool erase_before_restart)
{
    if (app_http_validate_request(req) != ESP_OK) {
        send_unauthorized(req);
        return ESP_OK;
    }

    app_http_set_cors_headers(req);
    char *response = app_http_success_response_json(true);
    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, response, (ssize_t)strlen(response));
    free(response);

    if (erase_before_restart) {
        erase_settings();
    }

    esp_restart();
    return ESP_OK;
}

esp_err_t device_restart_post_handler(httpd_req_t *req)
{
    return send_success_and_restart(req, false);
}

esp_err_t device_factory_reset_post_handler(httpd_req_t *req)
{
    return send_success_and_restart(req, true);
}

esp_err_t ota_get_handler(httpd_req_t *req)
{
    if (app_http_validate_request(req) != ESP_OK) {
        send_unauthorized(req);
        return ESP_OK;
    }

    app_http_set_cors_headers(req);
    char *response = app_http_success_response_json(true);
    httpd_resp_send(req, response, (ssize_t)strlen(response));
    free(response);
    upgrade_firmware();
    return ESP_OK;
}

esp_err_t upload_post_handler(httpd_req_t *req)
{
    if (app_http_validate_request(req) != ESP_OK) {
        send_unauthorized(req);
        return ESP_OK;
    }

    app_http_set_cors_headers(req);
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
    app_http_set_cors_headers(req);

    char *response = get_status_json();
    httpd_resp_send(req, response, (ssize_t)strlen(response));
    free(response);
    return ESP_OK;
}

esp_err_t pumps_runtime_get_handler(httpd_req_t *req)
{
    if (app_http_validate_request(req) != ESP_OK) {
        send_unauthorized(req);
        return ESP_OK;
    }

    app_http_set_cors_headers(req);
    char *response = get_pumps_runtime_json();
    httpd_resp_send(req, response, (ssize_t)strlen(response));
    free(response);
    return ESP_OK;
}

esp_err_t websocket_handler(httpd_req_t *req)
{
    if (req->method == HTTP_GET) {
        int sockfd = httpd_req_to_sockfd(req);
        app_http_ws_register_client(sockfd);
        ESP_LOGI(TAG, "websocket connected fd=%d", sockfd);
        return ESP_OK;
    }

    httpd_ws_frame_t frame = {
        .type = HTTPD_WS_TYPE_TEXT,
    };

    esp_err_t err = httpd_ws_recv_frame(req, &frame, 0);
    if (err != ESP_OK) {
        return err;
    }

    uint8_t *buffer = NULL;
    if (frame.len > 0) {
        buffer = calloc(1, frame.len + 1);
        if (buffer == NULL) {
            return ESP_ERR_NO_MEM;
        }

        frame.payload = buffer;
        err = httpd_ws_recv_frame(req, &frame, frame.len);
        if (err != ESP_OK) {
            free(buffer);
            return err;
        }
    }

    if (frame.type == HTTPD_WS_TYPE_CLOSE) {
        app_http_ws_unregister_client(httpd_req_to_sockfd(req));
        free(buffer);
        return ESP_OK;
    }

    if (frame.type == HTTPD_WS_TYPE_TEXT && buffer != NULL) {
        int sockfd = httpd_req_to_sockfd(req);
        app_http_ws_touch_client(sockfd);
        cJSON *root = cJSON_Parse((const char *)buffer);
        const cJSON *type = root != NULL ? cJSON_GetObjectItem(root, "type") : NULL;

        if (cJSON_IsString(type) && strcmp(type->valuestring, "ping") == 0) {
            cJSON *response = cJSON_CreateObject();
            cJSON_AddStringToObject(response, "type", "pong");
            cJSON_AddNumberToObject(response, "ts", (double)(esp_log_timestamp()));
            cJSON_AddNumberToObject(response, "client_fd", sockfd);
            char *payload = cJSON_PrintUnformatted(response);
            if (payload != NULL) {
                err = websocket_send_json(req, payload);
                free(payload);
            }
            cJSON_Delete(response);
        } else if (cJSON_IsString(type) && strcmp(type->valuestring, "hello") == 0) {
            cJSON *response = cJSON_CreateObject();
            cJSON_AddStringToObject(response, "type", "welcome");
            cJSON_AddNumberToObject(response, "client_fd", sockfd);
            char *payload = cJSON_PrintUnformatted(response);
            if (payload != NULL) {
                err = websocket_send_json(req, payload);
                free(payload);
            }
            cJSON_Delete(response);
        } else if (cJSON_IsString(type) && strcmp(type->valuestring, "broadcast:test") == 0) {
            cJSON *response = cJSON_CreateObject();
            cJSON_AddStringToObject(response, "type", "broadcast");
            cJSON_AddStringToObject(response, "event", "test");
            cJSON_AddNumberToObject(response, "source_fd", sockfd);
            char *payload = cJSON_PrintUnformatted(response);
            if (payload != NULL) {
                err = app_http_ws_broadcast_json(payload);
                free(payload);
            }
            cJSON_Delete(response);
        }

        cJSON_Delete(root);
    }

    free(buffer);
    return err;
}

esp_err_t wifi_scan_get_handler(httpd_req_t *req)
{
    if (app_http_validate_request(req) != ESP_OK) {
        send_unauthorized(req);
        return ESP_OK;
    }

    app_http_set_cors_headers(req);
    wifi_scan_config_t scan_config = {
        .show_hidden = false,
        .scan_type = WIFI_SCAN_TYPE_ACTIVE,
    };
    uint16_t ap_count = 0;
    wifi_ap_record_t records[16];
    memset(records, 0, sizeof(records));

    esp_err_t err = esp_wifi_scan_start(&scan_config, true);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Wi-Fi scan start failed");
        return ESP_OK;
    }

    err = esp_wifi_scan_get_ap_num(&ap_count);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Wi-Fi scan count failed");
        return ESP_OK;
    }

    if (ap_count > 16) {
        ap_count = 16;
    }

    err = esp_wifi_scan_get_ap_records(&ap_count, records);
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Wi-Fi scan read failed");
        return ESP_OK;
    }

    cJSON *root = cJSON_CreateObject();
    cJSON *networks = cJSON_CreateArray();

    for (uint16_t i = 0; i < ap_count; ++i) {
        cJSON *item = cJSON_CreateObject();
        cJSON_AddItemToObject(item, "ssid", cJSON_CreateString((const char *)records[i].ssid));
        cJSON_AddItemToObject(item, "rssi", cJSON_CreateNumber(records[i].rssi));
        cJSON_AddItemToObject(item, "secure", cJSON_CreateBool(records[i].authmode != WIFI_AUTH_OPEN));
        cJSON_AddItemToObject(item, "channel", cJSON_CreateNumber(records[i].primary));
        cJSON_AddItemToArray(networks, item);
    }

    cJSON_AddItemToObject(root, "networks", networks);
    char *response = cJSON_Print(root);
    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, response, response != NULL ? (ssize_t)strlen(response) : 0);

    free(response);
    cJSON_Delete(root);
    return ESP_OK;
}

esp_err_t schedule_get_handler(httpd_req_t *req)
{
    if (app_http_validate_request(req) != ESP_OK) {
        send_unauthorized(req);
        return ESP_OK;
    }

    app_http_set_cors_headers(req);
    char *response = get_schedule_json();
    httpd_resp_send(req, response, (ssize_t)strlen(response));
    free(response);
    return ESP_OK;
}

esp_err_t settings_get_handler(httpd_req_t *req)
{
    if (app_http_validate_request(req) != ESP_OK) {
        send_unauthorized(req);
        return ESP_OK;
    }

    app_http_set_cors_headers(req);
    char *response = get_settings_json();
    httpd_resp_send(req, response, (ssize_t)strlen(response));
    free(response);
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
        free(buf);
        return ESP_OK;
    } else {
        app_http_set_cors_headers(req);
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
        cJSON *id = cJSON_GetObjectItem(root, "id");
        cJSON *speed = cJSON_GetObjectItem(root, "speed");
        cJSON *direction = cJSON_GetObjectItem(root, "direction");
        cJSON *time = cJSON_GetObjectItem(root, "time");

        uint8_t pump_id = cJSON_IsNumber(id) ? id->valueint : 0;
        float rpm = cJSON_IsNumber(speed) ? speed->valuedouble : 0.0f;
        bool dir = cJSON_IsTrue(direction);
        int32_t time_minutes = cJSON_IsNumber(time) ? time->valueint : 0;

        ESP_LOGI(TAG, "run_post_handler id=%u speed=%.2f dir=%u time=%ld",
                 pump_id, rpm, dir, (long)time_minutes);

        if (time_minutes < 0) {
            run_pump_calibration(pump_id, true, rpm, dir);
        } else if (run_pump_manual(pump_id, rpm, dir, time_minutes) != ESP_OK) {
            cJSON_Delete(root);
            free(buf);
            httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid pump run request");
            return ESP_FAIL;
        }

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
        free(buf);
        return ESP_OK;
    } else {
        app_http_set_cors_headers(req);
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
        cJSON *direction = cJSON_GetObjectItem(root, "direction");

        if (cJSON_IsNumber(speed) && cJSON_IsBool(action) && cJSON_IsNumber(channel)) {
            uint8_t channel_id = channel->valueint;
            bool act = action->valueint;
            float spd = speed->valuedouble;
            bool dir = cJSON_IsTrue(direction);

            ESP_LOGI(TAG, "calibrate_post_handler\n"
                          "channel: %u\n"
                          "speed  : %.2f\n"
                          "is %s",
                     channel_id, spd, act ? "start" : "stop");

            run_pump_calibration(channel_id, act, spd, dir);
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
        free(buf);
        return ESP_OK;
    } else {
        app_http_set_cors_headers(req);
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
            memset(schedule_config, 0, sizeof(*schedule_config));
            schedule_config->pump_id = i;
            schedule_config->mode = SCHEDULE_MODE_OFF;
        }

        uint8_t id = 0;
        cJSON *schedule_item;
        cJSON *schedule = cJSON_GetObjectItem(root, "schedule");
        cJSON_ArrayForEach(schedule_item, schedule) {
            schedule_t *schedule_config = get_schedule_config(id);

            cJSON *pump_id = cJSON_GetObjectItem(schedule_item, "pump_id");
            cJSON *mode = cJSON_GetObjectItem(schedule_item, "mode");
            cJSON *work_hours = cJSON_GetObjectItem(schedule_item, "work_hours");
            cJSON *weekdays = cJSON_GetObjectItem(schedule_item, "weekdays");
            cJSON *speed = cJSON_GetObjectItem(schedule_item, "speed");
            cJSON *run_time = cJSON_GetObjectItem(schedule_item, "time");
            cJSON *volume = cJSON_GetObjectItem(schedule_item, "volume");

            schedule_config->pump_id = pump_id->valueint;
            schedule_config->mode = mode != NULL ? mode->valueint : SCHEDULE_MODE_OFF;

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
            schedule_config->time = run_time != NULL ? run_time->valueint : 0;
            schedule_config->day_volume = volume != NULL ? volume->valueint : 0;
            schedule_config->active = schedule_config->mode != SCHEDULE_MODE_OFF;

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
        free(buf);
        return ESP_OK;
    } else {
        app_http_set_cors_headers(req);
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
                cJSON *enabled = cJSON_GetObjectItem(pump_item, "state");
                cJSON *name = cJSON_GetObjectItem(pump_item, "name");
                cJSON *direction = cJSON_GetObjectItem(pump_item, "direction");
                cJSON *running_hours = cJSON_GetObjectItem(pump_item, "running_hours");
                cJSON *tank_full_volume = cJSON_GetObjectItem(pump_item, "tank_full_vol");
                cJSON *tank_concentration_total = cJSON_GetObjectItem(pump_item, "tank_concentration_total");
                cJSON *tank_concentration_active = cJSON_GetObjectItem(pump_item, "tank_concentration_active");
                cJSON *tank_current_volume = cJSON_GetObjectItem(pump_item, "tank_current_vol");
                cJSON *calibration = cJSON_GetObjectItem(pump_item, "calibration");
                cJSON *schedule = cJSON_GetObjectItem(pump_item, "schedule");

                pump_t *pump_config = get_pump_config(id->valueint);
                schedule_t *schedule_config = get_schedule_config(id->valueint);

                if (cJSON_IsString(name) && (name->valuestring != NULL)) {
                    strlcpy(pump_config->name, name->valuestring, 32);
                }

                pump_config->direction = cJSON_IsTrue(direction);
                pump_config->running_hours = cJSON_IsNumber(running_hours) ? running_hours->valuedouble : 0;
                pump_config->tank_full_vol = tank_full_volume->valueint;
                pump_config->tank_concentration_total = tank_concentration_total->valueint;
                pump_config->tank_concentration_active = tank_concentration_active->valueint;
                pump_config->tank_current_vol = tank_current_volume->valuedouble;
                pump_config->state = cJSON_IsTrue(enabled);

                pump_config->calibration_count = 0;
                if (cJSON_IsArray(calibration)) {
                    cJSON *point;
                    cJSON_ArrayForEach(point, calibration) {
                        if (pump_config->calibration_count >= MAX_PUMP_CALIBRATION_POINTS) {
                            break;
                        }

                        cJSON *speed = cJSON_GetObjectItem(point, "speed");
                        cJSON *flow = cJSON_GetObjectItem(point, "flow");
                        if (cJSON_IsNumber(speed) && cJSON_IsNumber(flow)) {
                            uint8_t point_id = pump_config->calibration_count++;
                            pump_config->calibration[point_id].speed = speed->valuedouble;
                            pump_config->calibration[point_id].flow = flow->valuedouble;
                        }
                    }
                }
                pump_config->calibration_100ml_units = calibration_to_100ml_units(pump_config);

                if (cJSON_IsObject(schedule)) {
                    cJSON *mode = cJSON_GetObjectItem(schedule, "mode");
                    cJSON *work_hours = cJSON_GetObjectItem(schedule, "work_hours");
                    cJSON *weekdays = cJSON_GetObjectItem(schedule, "weekdays");
                    cJSON *speed = cJSON_GetObjectItem(schedule, "speed");
                    cJSON *time = cJSON_GetObjectItem(schedule, "time");
                    cJSON *volume = cJSON_GetObjectItem(schedule, "volume");

                    schedule_config->pump_id = pump_config->id;
                    schedule_config->mode = cJSON_IsNumber(mode) ? mode->valueint : SCHEDULE_MODE_OFF;
                    schedule_config->work_hours = 0;
                    schedule_config->week_days = 0;

                    if (cJSON_IsArray(work_hours)) {
                        cJSON *hour_item;
                        cJSON_ArrayForEach(hour_item, work_hours) {
                            schedule_config->work_hours |= 1 << (uint8_t)hour_item->valueint;
                        }
                    }

                    if (cJSON_IsArray(weekdays)) {
                        cJSON *weekday_item;
                        cJSON_ArrayForEach(weekday_item, weekdays) {
                            schedule_config->week_days |= 1 << (uint8_t)weekday_item->valueint;
                        }
                    }

                    schedule_config->speed = cJSON_IsNumber(speed) ? speed->valuedouble : 0;
                    schedule_config->time = cJSON_IsNumber(time) ? time->valueint : 0;
                    schedule_config->day_volume = cJSON_IsNumber(volume) ? volume->valueint : 0;
                    schedule_config->active = schedule_config->mode != SCHEDULE_MODE_OFF;
                }
            }

            save_pump();
            save_pump_aging_state(get_pump_aging_day_stamp());
            save_schedule();
            backup_eeprom_tank_status();
        }

        cJSON *networks = cJSON_GetObjectItem(root, "networks");
        if (cJSON_IsArray(networks)) {
            for (uint8_t i = 0; i < MAX_NETWORKS; i++) {
                network_t *network_config = get_networks_config(i);
                memset(network_config, 0, sizeof(*network_config));
                network_config->id = i;
                network_config->type = i;
                network_config->keep_ap_active = (i == NETWORK_TYPE_WIFI);
                network_config->dhcp = true;
                network_config->channel = 13;
                network_config->force_dataset = true;
            }

            cJSON *network_item;
            uint8_t network_id = 0;
            cJSON_ArrayForEach(network_item, networks) {
                if (network_id >= MAX_NETWORKS) {
                    break;
                }

                network_t *network_config = get_networks_config(network_id);
                cJSON *type = cJSON_GetObjectItem(network_item, "type");
                cJSON *is_dirty = cJSON_GetObjectItem(network_item, "is_dirty");
                cJSON *id = cJSON_GetObjectItem(network_item, "id");

                network_config->id = cJSON_IsNumber(id) ? id->valueint : network_id;
                network_config->type = cJSON_IsNumber(type) ? type->valueint : NETWORK_TYPE_WIFI;
                network_config->is_dirty = cJSON_IsTrue(is_dirty);

                cJSON *ssid = cJSON_GetObjectItem(network_item, "ssid");
                if (cJSON_IsString(ssid) && (ssid->valuestring != NULL)) {
                    strlcpy(network_config->ssid, ssid->valuestring, sizeof(network_config->ssid));
                }

                cJSON *password = cJSON_GetObjectItem(network_item, "password");
                if (cJSON_IsString(password) && (password->valuestring != NULL)) {
                    strlcpy(network_config->password, password->valuestring, sizeof(network_config->password));
                }

                cJSON *keep_ap_active = cJSON_GetObjectItem(network_item, "keep_ap_active");
                network_config->keep_ap_active = cJSON_IsTrue(keep_ap_active);

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

                cJSON *channel = cJSON_GetObjectItem(network_item, "channel");
                if (cJSON_IsNumber(channel)) {
                    network_config->channel = channel->valueint;
                }

                cJSON *network_name = cJSON_GetObjectItem(network_item, "network_name");
                if (cJSON_IsString(network_name) && (network_name->valuestring != NULL)) {
                    strlcpy(network_config->network_name, network_name->valuestring, sizeof(network_config->network_name));
                }

                cJSON *network_key = cJSON_GetObjectItem(network_item, "network_key");
                if (cJSON_IsString(network_key) && (network_key->valuestring != NULL)) {
                    strlcpy(network_config->network_key, network_key->valuestring, sizeof(network_config->network_key));
                }

                cJSON *pan_id = cJSON_GetObjectItem(network_item, "pan_id");
                if (cJSON_IsString(pan_id) && (pan_id->valuestring != NULL)) {
                    strlcpy(network_config->pan_id, pan_id->valuestring, sizeof(network_config->pan_id));
                }

                cJSON *ext_pan_id = cJSON_GetObjectItem(network_item, "ext_pan_id");
                if (cJSON_IsString(ext_pan_id) && (ext_pan_id->valuestring != NULL)) {
                    strlcpy(network_config->ext_pan_id, ext_pan_id->valuestring, sizeof(network_config->ext_pan_id));
                }

                cJSON *pskc = cJSON_GetObjectItem(network_item, "pskc");
                if (cJSON_IsString(pskc) && (pskc->valuestring != NULL)) {
                    strlcpy(network_config->pskc, pskc->valuestring, sizeof(network_config->pskc));
                }

                cJSON *mesh_local_prefix = cJSON_GetObjectItem(network_item, "mesh_local_prefix");
                if (cJSON_IsString(mesh_local_prefix) && (mesh_local_prefix->valuestring != NULL)) {
                    strlcpy(network_config->mesh_local_prefix, mesh_local_prefix->valuestring,
                            sizeof(network_config->mesh_local_prefix));
                }

                cJSON *force_dataset = cJSON_GetObjectItem(network_item, "force_dataset");
                network_config->force_dataset = cJSON_IsTrue(force_dataset);
                network_config->active = true;
                network_id++;
            }

            save_network();
            connect_on_network_settings_updated();
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
                strlcpy(service_config->ota_url, ota_url->valuestring, sizeof(service_config->ota_url));
            }

            cJSON *ntp_server = cJSON_GetObjectItem(services, "ntp_server");
            if (cJSON_IsString(ntp_server) && (ntp_server->valuestring != NULL)) {
                strlcpy(service_config->ntp_server, ntp_server->valuestring, sizeof(service_config->ntp_server));
            }

            cJSON *time_zone = cJSON_GetObjectItem(services, "time_zone");
            if (cJSON_IsString(time_zone) && (time_zone->valuestring != NULL)) {
                strlcpy(service_config->time_zone, time_zone->valuestring, sizeof(service_config->time_zone));
            } else {
                /* Backward compatibility for older clients still posting a plain UTC offset. */
                cJSON *utc_offset = cJSON_GetObjectItem(services, "utc_offset");
                if (cJSON_IsNumber(utc_offset)) {
                    int offset = utc_offset->valueint;
                    snprintf(service_config->time_zone, sizeof(service_config->time_zone), "Etc/GMT%+d", -offset);
                }
            }

            cJSON *mqtt_ip_address = cJSON_GetObjectItem(services, "mqtt_ip_address");
            if (cJSON_IsString(mqtt_ip_address) && (mqtt_ip_address->valuestring != NULL)) {
                string_to_ip(mqtt_ip_address->valuestring, service_config->mqtt_ip_address);
            }

            cJSON *mqtt_port = cJSON_GetObjectItem(services, "mqtt_port");
            if (cJSON_IsNumber(mqtt_port)) {
                service_config->mqtt_port = mqtt_port->valueint;
            } else if (cJSON_IsString(mqtt_port) && mqtt_port->valuestring != NULL) {
                service_config->mqtt_port = (uint16_t)atoi(mqtt_port->valuestring);
            }

            cJSON *mqtt_user = cJSON_GetObjectItem(services, "mqtt_user");
            if (cJSON_IsString(mqtt_user) && (mqtt_user->valuestring != NULL)) {
                strlcpy(service_config->mqtt_user, mqtt_user->valuestring, sizeof(service_config->mqtt_user));
            }

            cJSON *mqtt_password = cJSON_GetObjectItem(services, "mqtt_password");
            if (cJSON_IsString(mqtt_password) && (mqtt_password->valuestring != NULL)) {
                strlcpy(service_config->mqtt_password, mqtt_password->valuestring, sizeof(service_config->mqtt_password));
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
            datetime_t datetime = {0};
            cJSON *date = cJSON_GetObjectItem(time, "date");
            cJSON *clock = cJSON_GetObjectItem(time, "time");
            cJSON *time_zone = cJSON_GetObjectItem(time, "time_zone");

            if (cJSON_IsString(date) && date->valuestring != NULL) {
                int year = 2000;
                int month = 1;
                int day = 1;
                if (sscanf(date->valuestring, "%d-%d-%d", &year, &month, &day) == 3) {
                    datetime.year = (uint8_t)(year - 2000);
                    datetime.month = (uint8_t)month;
                    datetime.day = (uint8_t)day;
                }
            }
            if (cJSON_IsString(clock) && clock->valuestring != NULL) {
                int hour = 0;
                int minute = 0;
                int second = 0;
                if (sscanf(clock->valuestring, "%d:%d:%d", &hour, &minute, &second) == 3) {
                    datetime.hour = (uint8_t)hour;
                    datetime.min = (uint8_t)minute;
                    datetime.sec = (uint8_t)second;
                }
            }
            if (cJSON_IsString(time_zone) && time_zone->valuestring != NULL) {
                strlcpy(get_service_config()->time_zone, time_zone->valuestring,
                        sizeof(get_service_config()->time_zone));
                save_service();
            }

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
    app_http_set_cors_headers(req);

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
