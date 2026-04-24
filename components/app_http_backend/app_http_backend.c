/***
** Created by Aleksey Volkov on 15.12.2019.
***/

#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_app_desc.h"
#include "esp_log.h"
#include "esp_timer.h"

#include "auth.h"
#include "app_events.h"
#include "app_monitor.h"
#include "app_settings.h"
#include "web_server.h"
#include "app_pumps.h"
#include "app_http_backend_priv.h"

static const char *TAG = "WEBSERVER";
static httpd_handle_t server = NULL;

char app_http_auth_token[65];

typedef struct {
    int sockfd;
    int64_t last_seen_ms;
} app_http_ws_client_t;

static app_http_ws_client_t ws_clients[APP_HTTP_MAX_WS_CLIENTS];
static esp_event_handler_instance_t ws_pump_runtime_event_ctx;
static esp_event_handler_instance_t ws_system_ready_event_ctx;
static esp_event_handler_instance_t ws_shutting_down_event_ctx;
static esp_event_handler_instance_t ws_status_changed_event_ctx;

static int app_http_ws_find_client_slot(int sockfd)
{
    for (uint32_t i = 0; i < APP_HTTP_MAX_WS_CLIENTS; ++i) {
        if (ws_clients[i].sockfd == sockfd) {
            return (int)i;
        }
    }

    return -1;
}

bool app_http_ws_has_capacity(void)
{
    for (uint32_t i = 0; i < APP_HTTP_MAX_WS_CLIENTS; ++i) {
        if (ws_clients[i].sockfd <= 0) {
            return true;
        }
    }

    return false;
}

static const char *app_http_ws_pump_state_to_string(pump_state_t state)
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

static cJSON *app_http_ws_driver_status_json(const pump_driver_status_t *driver_status)
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

static bool app_http_is_spa_route(const char *uri)
{
    if (uri == NULL || uri[0] != '/') {
        return false;
    }

    if (strncmp(uri, "/api/", 5) == 0 ||
        strcmp(uri, "/api") == 0 ||
        strncmp(uri, "/ws", 3) == 0 ||
        strncmp(uri, "/upload", 7) == 0) {
        return false;
    }

    return strchr(uri + 1, '.') == NULL;
}

static void app_http_ws_pump_runtime_event_handler(void* arg, esp_event_base_t event_base,
                                                   int32_t event_id, void* event_data)
{
    (void)arg;
    (void)event_base;

    if (event_id != PUMP_RUNTIME_DATA || event_data == NULL) {
        return;
    }

    const pump_runtime_event_t *pump_event = (const pump_runtime_event_t *)event_data;
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "pump_runtime");
    cJSON *pump = cJSON_CreateObject();
    cJSON_AddItemToObject(pump, "id", cJSON_CreateNumber(pump_event->pump_id));
    cJSON_AddItemToObject(pump, "active", cJSON_CreateBool(pump_event->state != PUMP_OFF));
    cJSON_AddItemToObject(pump, "state", cJSON_CreateString(app_http_ws_pump_state_to_string(pump_event->state)));
    cJSON_AddItemToObject(pump, "speed", cJSON_CreateNumber(pump_event->rpm));
    cJSON_AddItemToObject(pump, "direction", cJSON_CreateBool(pump_event->direction));
    cJSON_AddItemToObject(pump, "remaining_ticks", cJSON_CreateNumber(pump_event->time));
    cJSON_AddItemToObject(pump, "remaining_seconds",
                          cJSON_CreateNumber((double)pump_event->time / (double)PUMP_TIMER_UNIT_IN_SEC));
    cJSON_AddItemToObject(pump, "volume_ml", cJSON_CreateNumber(pump_event->volume));
    cJSON_AddItemToObject(pump, "alert_flags", cJSON_CreateNumber((double)pump_event->alert_flags));
    cJSON_AddItemToObject(pump, "driver", app_http_ws_driver_status_json(&pump_event->driver_status));
    cJSON_AddItemToObject(root, "pump", pump);

    char *payload = cJSON_PrintUnformatted(root);
    if (payload != NULL) {
        app_http_ws_broadcast_json(payload);
        free(payload);
    }
    cJSON_Delete(root);
}

static void app_http_ws_broadcast_lifecycle_event(const char *type)
{
    const esp_app_desc_t *app_description = esp_app_get_description();
    services_t *services = get_service_config();
    cJSON *root = cJSON_CreateObject();
    char *payload = NULL;

    cJSON_AddStringToObject(root, "type", type);
    cJSON_AddStringToObject(root, "firmware_version", app_description->version);
    cJSON_AddStringToObject(root, "firmware_date", app_description->date);
    cJSON_AddStringToObject(root, "hostname", services->hostname);
    payload = cJSON_PrintUnformatted(root);
    if (payload != NULL) {
        app_http_ws_broadcast_json(payload);
        free(payload);
    }
    cJSON_Delete(root);
}

static void app_http_ws_status_changed_event_handler(void *arg, esp_event_base_t event_base,
                                                     int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_base;

    if (event_id != STATUS_CHANGED || event_data == NULL) {
        return;
    }

    const app_status_event_t *status_event = (const app_status_event_t *)event_data;
    cJSON *root = cJSON_CreateObject();
    cJSON *status = cJSON_CreateObject();
    char *payload = NULL;

    cJSON_AddStringToObject(root, "type", "status_patch");

    if (status_event->changed_mask & APP_STATUS_CHANGED_UP_TIME) {
        cJSON_AddStringToObject(status, "up_time", status_event->up_time);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_LOCAL_TIME) {
        cJSON_AddStringToObject(status, "local_time", status_event->local_time);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_LOCAL_DATE) {
        cJSON_AddStringToObject(status, "local_date", status_event->local_date);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_FREE_HEAP) {
        cJSON_AddNumberToObject(status, "free_heap", (double)status_event->free_heap);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_VCC) {
        cJSON_AddNumberToObject(status, "vcc", (double)status_event->vcc);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_WIFI_MODE) {
        cJSON_AddStringToObject(status, "wifi_mode", status_event->wifi_mode);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_IP_ADDRESS) {
        cJSON_AddStringToObject(status, "ip_address", status_event->ip_address);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_STATION_CONNECTED) {
        cJSON_AddBoolToObject(status, "station_connected", status_event->station_connected);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_STATION_SSID) {
        cJSON_AddStringToObject(status, "station_ssid", status_event->station_ssid);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_STATION_IP) {
        cJSON_AddStringToObject(status, "station_ip_address", status_event->station_ip_address);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_AP_SSID) {
        cJSON_AddStringToObject(status, "ap_ssid", status_event->ap_ssid);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_AP_IP) {
        cJSON_AddStringToObject(status, "ap_ip_address", status_event->ap_ip_address);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_AP_CLIENTS) {
        cJSON_AddNumberToObject(status, "ap_clients", status_event->ap_clients);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_BOARD_TEMPERATURE) {
        cJSON_AddNumberToObject(status, "board_temperature", status_event->board_temperature);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_WIFI_DISCONNECTS) {
        cJSON_AddNumberToObject(status, "wifi_disconnects", (double)status_event->wifi_disconnects);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_TIME_VALID) {
        cJSON_AddBoolToObject(status, "time_valid", status_event->time_valid);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_TIME_WARNING) {
        cJSON_AddStringToObject(status, "time_warning", status_event->time_warning);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_MQTT_SERVICE) {
        cJSON *mqtt_status = cJSON_CreateObject();
        cJSON_AddBoolToObject(mqtt_status, "enabled", status_event->mqtt_enabled);
        cJSON_AddBoolToObject(mqtt_status, "connected", status_event->mqtt_connected);
        cJSON_AddItemToObject(status, "mqtt_service", mqtt_status);
    }
    if (status_event->changed_mask & APP_STATUS_CHANGED_NTP_SERVICE) {
        cJSON *ntp_status = cJSON_CreateObject();
        cJSON_AddBoolToObject(ntp_status, "enabled", status_event->ntp_enabled);
        cJSON_AddBoolToObject(ntp_status, "sync", status_event->ntp_sync);
        cJSON_AddItemToObject(status, "ntp_service", ntp_status);
    }

    cJSON_AddItemToObject(root, "status", status);
    payload = cJSON_PrintUnformatted(root);
    if (payload != NULL) {
        app_http_ws_broadcast_json(payload);
        free(payload);
    }
    cJSON_Delete(root);
}

static void app_http_ws_system_event_handler(void *arg, esp_event_base_t event_base,
                                             int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_base;
    (void)event_data;

    if (event_id == SYSTEM_READY) {
        app_http_ws_broadcast_lifecycle_event("system_ready");
    } else if (event_id == SHUTTING_DOWN) {
        app_http_ws_broadcast_lifecycle_event("shutting_down");
    }
}

extern const uint8_t favicon_ico_start[] asm("_binary_favicon_ico_start");
extern const uint8_t favicon_ico_end[] asm("_binary_favicon_ico_end");
extern const uint8_t icon_svg_start[] asm("_binary_icon_svg_gz_start");
extern const uint8_t icon_svg_end[] asm("_binary_icon_svg_gz_end");
extern const uint8_t apple_touch_icon_png_start[] asm("_binary_apple_touch_icon_png_start");
extern const uint8_t apple_touch_icon_png_end[] asm("_binary_apple_touch_icon_png_end");
extern const uint8_t app_css_start[] asm("_binary_app_css_gz_start");
extern const uint8_t app_css_end[] asm("_binary_app_css_gz_end");
extern const uint8_t app_js_start[] asm("_binary_app_js_gz_start");
extern const uint8_t app_js_end[] asm("_binary_app_js_gz_end");
extern const uint8_t index_html_start[] asm("_binary_index_html_gz_start");
extern const uint8_t index_html_end[] asm("_binary_index_html_gz_end");

char *app_http_success_response_json(bool success)
{
    char *string = NULL;
    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "success", success);
    string = cJSON_Print(response);
    cJSON_Delete(response);
    return string;
}

esp_err_t app_http_validate_request(httpd_req_t *req)
{
    size_t buf_len = httpd_req_get_hdr_value_len(req, "Authorization") + 1;
    if (buf_len > 1) {
        char *buf = malloc(buf_len);
        if (httpd_req_get_hdr_value_str(req, "Authorization", buf, buf_len) == ESP_OK) {
            ESP_LOGD(TAG, "Found header => Authorization: %s", buf);
            if (strncmp(app_http_auth_token, buf, strlen(app_http_auth_token)) == 0) {
                ESP_LOGD(TAG, "Authorization: success");
                free(buf);
                return ESP_OK;
            }
        }
        free(buf);
    }

    return ESP_ERR_HTTPD_INVALID_REQ;
}

esp_err_t app_http_validate_ws_request(httpd_req_t *req)
{
    size_t query_len = httpd_req_get_url_query_len(req) + 1;
    if (query_len <= 1) {
        return ESP_ERR_HTTPD_INVALID_REQ;
    }

    char *query = malloc(query_len);
    if (query == NULL) {
        return ESP_ERR_NO_MEM;
    }

    esp_err_t result = ESP_ERR_HTTPD_INVALID_REQ;
    if (httpd_req_get_url_query_str(req, query, query_len) == ESP_OK) {
        char token[65] = {0};
        if (httpd_query_key_value(query, "token", token, sizeof(token)) == ESP_OK) {
            if (strncmp(app_http_auth_token, token, strlen(app_http_auth_token)) == 0) {
                result = ESP_OK;
            }
        }
    }

    free(query);
    return result;
}

void app_http_set_cors_headers(httpd_req_t *req)
{
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "Authorization, Content-Type");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

void app_http_ws_register_client(int sockfd)
{
    int slot = app_http_ws_find_client_slot(sockfd);
    if (slot >= 0) {
        ws_clients[slot].last_seen_ms = esp_timer_get_time() / 1000;
        return;
    }

    for (uint32_t i = 0; i < APP_HTTP_MAX_WS_CLIENTS; ++i) {
        if (ws_clients[i].sockfd <= 0) {
            ws_clients[i].sockfd = sockfd;
            ws_clients[i].last_seen_ms = esp_timer_get_time() / 1000;
            ESP_LOGI(TAG, "registered websocket client fd=%d", sockfd);
            return;
        }
    }

    ESP_LOGW(TAG, "websocket client registry full, fd=%d not registered", sockfd);
}

void app_http_ws_unregister_client(int sockfd)
{
    int slot = app_http_ws_find_client_slot(sockfd);
    if (slot < 0) {
        return;
    }

    ws_clients[slot].sockfd = -1;
    ws_clients[slot].last_seen_ms = 0;
    ESP_LOGI(TAG, "unregistered websocket client fd=%d", sockfd);
}

void app_http_ws_touch_client(int sockfd)
{
    int slot = app_http_ws_find_client_slot(sockfd);
    if (slot >= 0) {
        ws_clients[slot].last_seen_ms = esp_timer_get_time() / 1000;
    }
}

esp_err_t app_http_ws_send_json_to_client(httpd_handle_t handle, int sockfd, const char *payload)
{
    if (handle == NULL || sockfd < 0 || payload == NULL) {
        return ESP_ERR_INVALID_ARG;
    }

    if (httpd_ws_get_fd_info(handle, sockfd) != HTTPD_WS_CLIENT_WEBSOCKET) {
        app_http_ws_unregister_client(sockfd);
        return ESP_ERR_INVALID_STATE;
    }

    httpd_ws_frame_t frame = {
        .final = true,
        .fragmented = false,
        .type = HTTPD_WS_TYPE_TEXT,
        .payload = (uint8_t *)payload,
        .len = strlen(payload),
    };

    esp_err_t err = httpd_ws_send_frame_async(handle, sockfd, &frame);
    if (err == ESP_OK) {
        app_http_ws_touch_client(sockfd);
    } else {
        ESP_LOGW(TAG, "failed websocket send fd=%d err=%s", sockfd, esp_err_to_name(err));
        app_http_ws_unregister_client(sockfd);
    }

    return err;
}

esp_err_t app_http_ws_broadcast_json(const char *payload)
{
    if (server == NULL || payload == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    esp_err_t last_error = ESP_OK;
    for (uint32_t i = 0; i < APP_HTTP_MAX_WS_CLIENTS; ++i) {
        if (ws_clients[i].sockfd < 0) {
            continue;
        }

        esp_err_t err = app_http_ws_send_json_to_client(server, ws_clients[i].sockfd, payload);
        if (err != ESP_OK) {
            last_error = err;
        }
    }

    return last_error;
}

void app_http_ws_init_event_bridge(void)
{
    static bool initialized = false;
    if (initialized) {
        return;
    }

    app_events_register_handler(PUMP_RUNTIME_DATA, NULL, app_http_ws_pump_runtime_event_handler, &ws_pump_runtime_event_ctx);
    app_events_register_handler(SYSTEM_READY, NULL, app_http_ws_system_event_handler, &ws_system_ready_event_ctx);
    app_events_register_handler(SHUTTING_DOWN, NULL, app_http_ws_system_event_handler, &ws_shutting_down_event_ctx);
    app_events_register_handler(STATUS_CHANGED, NULL, app_http_ws_status_changed_event_handler, &ws_status_changed_event_ctx);
    initialized = true;
}

esp_err_t favicon_get_handler(httpd_req_t *req)
{
    const size_t size = (favicon_ico_end - favicon_ico_start);
    httpd_resp_set_type(req, "image/x-icon");
    httpd_resp_send(req, (const char *)favicon_ico_start, (ssize_t)size);
    return ESP_OK;
}

esp_err_t icon_svg_get_handler(httpd_req_t *req)
{
    const size_t size = (icon_svg_end - icon_svg_start);
    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");
    httpd_resp_set_type(req, "image/svg+xml");
    httpd_resp_send(req, (const char *)icon_svg_start, (ssize_t)size);
    return ESP_OK;
}

esp_err_t apple_touch_icon_get_handler(httpd_req_t *req)
{
    const size_t size = (apple_touch_icon_png_end - apple_touch_icon_png_start);
    httpd_resp_set_type(req, "image/png");
    httpd_resp_send(req, (const char *)apple_touch_icon_png_start, (ssize_t)size);
    return ESP_OK;
}

esp_err_t index_get_handler(httpd_req_t *req)
{
    const size_t size = (index_html_end - index_html_start);
    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, (const char *)index_html_start, (ssize_t)size);
    return ESP_OK;
}

static esp_err_t index_head_handler(httpd_req_t *req)
{
    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}

static esp_err_t spa_fallback_get_handler(httpd_req_t *req)
{
    if (!app_http_is_spa_route(req->uri)) {
        httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "Resource not found");
        return ESP_OK;
    }

    return index_get_handler(req);
}

static esp_err_t spa_fallback_head_handler(httpd_req_t *req)
{
    if (!app_http_is_spa_route(req->uri)) {
        httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "Resource not found");
        return ESP_OK;
    }

    return index_head_handler(req);
}

static esp_err_t captive_probe_handler(httpd_req_t *req)
{
    httpd_resp_set_status(req, "302 Found");
    httpd_resp_set_hdr(req, "Location", "/");
    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}

esp_err_t js_handler(httpd_req_t *req)
{
    const size_t size = (app_js_end - app_js_start);
    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");
    httpd_resp_set_type(req, "text/javascript");
    httpd_resp_send(req, (const char *)app_js_start, (ssize_t)size);
    return ESP_OK;
}

esp_err_t css_handler(httpd_req_t *req)
{
    const size_t size = (app_css_end - app_css_start);
    httpd_resp_set_hdr(req, "Content-Encoding", "gzip");
    httpd_resp_set_type(req, "text/css");
    httpd_resp_send(req, (const char *)app_css_start, (ssize_t)size);
    return ESP_OK;
}

esp_err_t options_handler(httpd_req_t *req)
{
    app_http_set_cors_headers(req);
    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}

httpd_handle_t start_webserver(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.max_uri_handlers = 36;
    config.max_open_sockets = APP_HTTP_MAX_OPEN_SOCKETS;
    config.lru_purge_enable = true;
    config.backlog_conn = APP_HTTP_MAX_OPEN_SOCKETS;
    config.recv_wait_timeout = 30;
    config.send_wait_timeout = 60;
    config.keep_alive_enable = true;
    config.keep_alive_idle = 30;
    config.keep_alive_interval = 5;
    config.keep_alive_count = 3;
    config.uri_match_fn = httpd_uri_match_wildcard;

    ESP_LOGI(TAG, "Starting web server on port: '%d' (max_open_sockets=%u, max_ws_clients=%u)",
             config.server_port, (unsigned)config.max_open_sockets, (unsigned)APP_HTTP_MAX_WS_CLIENTS);

    if (server != NULL) {
        stop_webserver();
    }

    for (uint32_t i = 0; i < APP_HTTP_MAX_WS_CLIENTS; ++i) {
        ws_clients[i].sockfd = -1;
        ws_clients[i].last_seen_ms = 0;
    }

    auth_t *auth = get_auth_config();
    if (!strlen(auth->token)) {
        generateToken(app_http_auth_token);
    } else {
        strncpy(app_http_auth_token, auth->token, sizeof(app_http_auth_token));
    }

    if (httpd_start(&server, &config) == ESP_OK) {
        app_http_ws_init_event_bridge();
        httpd_uri_t global_options = {
            .uri = "/*",
            .method = HTTP_OPTIONS,
            .handler = options_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_home_page = {
            .uri = "/",
            .method = HTTP_GET,
            .handler = index_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t head_home_page = {
            .uri = "/",
            .method = HTTP_HEAD,
            .handler = index_head_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_js = {
            .uri = "/app.js",
            .method = HTTP_GET,
            .handler = js_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_css = {
            .uri = "/app.css",
            .method = HTTP_GET,
            .handler = css_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_favicon = {
            .uri = "/favicon.ico",
            .method = HTTP_GET,
            .handler = favicon_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_icon_svg = {
            .uri = "/icon.svg",
            .method = HTTP_GET,
            .handler = icon_svg_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_apple_touch_icon = {
            .uri = "/apple-touch-icon.png",
            .method = HTTP_GET,
            .handler = apple_touch_icon_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t captive_hotspot_detect = {
            .uri = "/hotspot-detect.html",
            .method = HTTP_GET,
            .handler = captive_probe_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t captive_generate_204 = {
            .uri = "/generate_204",
            .method = HTTP_GET,
            .handler = captive_probe_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t captive_gen_204 = {
            .uri = "/gen_204",
            .method = HTTP_GET,
            .handler = captive_probe_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t captive_ncsi = {
            .uri = "/ncsi.txt",
            .method = HTTP_GET,
            .handler = captive_probe_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t captive_connecttest = {
            .uri = "/connecttest.txt",
            .method = HTTP_GET,
            .handler = captive_probe_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_ota = {
            .uri = "/update",
            .method = HTTP_GET,
            .handler = ota_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t post_device_restart = {
            .uri = "/api/device/restart",
            .method = HTTP_POST,
            .handler = device_restart_post_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t post_device_factory_reset = {
            .uri = "/api/device/factory-reset",
            .method = HTTP_POST,
            .handler = device_factory_reset_post_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t update_post = {
            .uri = "/upload",
            .method = HTTP_POST,
            .handler = upload_post_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_status = {
            .uri = "/api/status",
            .method = HTTP_GET,
            .handler = status_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_pumps_runtime = {
            .uri = "/api/pumps/runtime",
            .method = HTTP_GET,
            .handler = pumps_runtime_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_pumps_history = {
            .uri = "/api/pumps/history",
            .method = HTTP_GET,
            .handler = pumps_history_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t post_pumps_history_backup = {
            .uri = "/api/pumps/history/backup",
            .method = HTTP_POST,
            .handler = pumps_history_backup_post_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_board_config = {
            .uri = "/api/board-config",
            .method = HTTP_GET,
            .handler = board_config_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t post_board_config = {
            .uri = "/api/board-config",
            .method = HTTP_POST,
            .handler = board_config_post_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t websocket = {
            .uri = "/ws",
            .method = HTTP_GET,
            .handler = websocket_handler,
            .user_ctx = NULL,
            .is_websocket = true,
            .ws_pre_handshake_cb = websocket_pre_handshake_cb,
        };

        httpd_uri_t get_wifi_scan = {
            .uri = "/api/network/wifi/scan",
            .method = HTTP_GET,
            .handler = wifi_scan_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t post_run = {
            .uri = "/api/run",
            .method = HTTP_POST,
            .handler = run_post_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t post_calibrate = {
            .uri = "/api/calibrate",
            .method = HTTP_POST,
            .handler = calibrate_post_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_schedule = {
            .uri = "/api/schedule",
            .method = HTTP_GET,
            .handler = schedule_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t post_schedule = {
            .uri = "/api/schedule",
            .method = HTTP_POST,
            .handler = schedule_post_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_settings = {
            .uri = "/api/settings",
            .method = HTTP_GET,
            .handler = settings_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t post_settings = {
            .uri = "/api/settings",
            .method = HTTP_POST,
            .handler = settings_post_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t post_auth = {
            .uri = "/api/auth",
            .method = HTTP_POST,
            .handler = auth_post_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_spa_fallback = {
            .uri = "/*",
            .method = HTTP_GET,
            .handler = spa_fallback_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t head_spa_fallback = {
            .uri = "/*",
            .method = HTTP_HEAD,
            .handler = spa_fallback_head_handler,
            .user_ctx = NULL,
        };

        httpd_register_uri_handler(server, &global_options);
        httpd_register_uri_handler(server, &get_home_page);
        httpd_register_uri_handler(server, &head_home_page);
        httpd_register_uri_handler(server, &get_favicon);
        httpd_register_uri_handler(server, &get_icon_svg);
        httpd_register_uri_handler(server, &get_apple_touch_icon);
        httpd_register_uri_handler(server, &captive_hotspot_detect);
        httpd_register_uri_handler(server, &captive_generate_204);
        httpd_register_uri_handler(server, &captive_gen_204);
        httpd_register_uri_handler(server, &captive_ncsi);
        httpd_register_uri_handler(server, &captive_connecttest);
        httpd_register_uri_handler(server, &get_js);
        httpd_register_uri_handler(server, &get_css);
        httpd_register_uri_handler(server, &get_status);
        httpd_register_uri_handler(server, &get_pumps_runtime);
        httpd_register_uri_handler(server, &get_pumps_history);
        httpd_register_uri_handler(server, &get_board_config);
        httpd_register_uri_handler(server, &post_board_config);
        httpd_register_uri_handler(server, &websocket);
        httpd_register_uri_handler(server, &get_wifi_scan);
        httpd_register_uri_handler(server, &post_run);
        httpd_register_uri_handler(server, &post_calibrate);
        httpd_register_uri_handler(server, &post_pumps_history_backup);
        httpd_register_uri_handler(server, &get_schedule);
        httpd_register_uri_handler(server, &post_schedule);
        httpd_register_uri_handler(server, &get_settings);
        httpd_register_uri_handler(server, &post_settings);
        httpd_register_uri_handler(server, &post_auth);
        httpd_register_uri_handler(server, &get_ota);
        httpd_register_uri_handler(server, &post_device_restart);
        httpd_register_uri_handler(server, &post_device_factory_reset);
        httpd_register_uri_handler(server, &update_post);
        httpd_register_uri_handler(server, &get_spa_fallback);
        httpd_register_uri_handler(server, &head_spa_fallback);

        return server;
    }

    ESP_LOGI(TAG, "Error starting server!");
    return NULL;
}

void stop_webserver(void)
{
    for (uint32_t i = 0; i < APP_HTTP_MAX_WS_CLIENTS; ++i) {
        ws_clients[i].sockfd = -1;
        ws_clients[i].last_seen_ms = 0;
    }
    httpd_stop(server);
    server = NULL;
}
