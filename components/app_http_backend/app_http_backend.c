/***
** Created by Aleksey Volkov on 15.12.2019.
***/

#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_log.h"
#include "esp_timer.h"

#include "auth.h"
#include "app_events.h"
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

static int app_http_ws_find_client_slot(int sockfd)
{
    for (uint32_t i = 0; i < APP_HTTP_MAX_WS_CLIENTS; ++i) {
        if (ws_clients[i].sockfd == sockfd) {
            return (int)i;
        }
    }

    return -1;
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
    cJSON_AddItemToObject(root, "pump", pump);

    char *payload = cJSON_PrintUnformatted(root);
    if (payload != NULL) {
        app_http_ws_broadcast_json(payload);
        free(payload);
    }
    cJSON_Delete(root);
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
extern const uint8_t app_woff2_start[] asm("_binary_app_woff2_start");
extern const uint8_t app_woff2_end[] asm("_binary_app_woff2_end");
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

esp_err_t woff2_handler(httpd_req_t *req)
{
    const size_t size = (app_woff2_end - app_woff2_start);
    httpd_resp_set_type(req, "font/woff2");
    httpd_resp_send(req, (const char *)app_woff2_start, (ssize_t)size);
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
    config.max_uri_handlers = 32;
    config.lru_purge_enable = true;
    config.recv_wait_timeout = 30;
    config.send_wait_timeout = 60;

    ESP_LOGI(TAG, "Starting web server on port: '%d'", config.server_port);

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

        httpd_uri_t get_woff2 = {
            .uri = "/app.woff2",
            .method = HTTP_GET,
            .handler = woff2_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_settings_page = {
            .uri = "/settings/network",
            .method = HTTP_GET,
            .handler = index_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_login_page = {
            .uri = "/login",
            .method = HTTP_GET,
            .handler = index_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_schedule_page = {
            .uri = "/schedule",
            .method = HTTP_GET,
            .handler = index_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_wifi_page = {
            .uri = "/wifi",
            .method = HTTP_GET,
            .handler = index_get_handler,
            .user_ctx = NULL,
        };

        httpd_uri_t get_about_page = {
            .uri = "/about",
            .method = HTTP_GET,
            .handler = index_get_handler,
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

        httpd_uri_t websocket = {
            .uri = "/ws",
            .method = HTTP_GET,
            .handler = websocket_handler,
            .user_ctx = NULL,
            .is_websocket = true,
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

        httpd_register_uri_handler(server, &global_options);
        httpd_register_uri_handler(server, &get_home_page);
        httpd_register_uri_handler(server, &head_home_page);
        httpd_register_uri_handler(server, &get_settings_page);
        httpd_register_uri_handler(server, &get_login_page);
        httpd_register_uri_handler(server, &get_schedule_page);
        httpd_register_uri_handler(server, &get_wifi_page);
        httpd_register_uri_handler(server, &get_about_page);
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
        httpd_register_uri_handler(server, &get_woff2);
        httpd_register_uri_handler(server, &get_status);
        httpd_register_uri_handler(server, &get_pumps_runtime);
        httpd_register_uri_handler(server, &websocket);
        httpd_register_uri_handler(server, &get_wifi_scan);
        httpd_register_uri_handler(server, &post_run);
        httpd_register_uri_handler(server, &post_calibrate);
        httpd_register_uri_handler(server, &get_schedule);
        httpd_register_uri_handler(server, &post_schedule);
        httpd_register_uri_handler(server, &get_settings);
        httpd_register_uri_handler(server, &post_settings);
        httpd_register_uri_handler(server, &post_auth);
        httpd_register_uri_handler(server, &get_ota);
        httpd_register_uri_handler(server, &post_device_restart);
        httpd_register_uri_handler(server, &post_device_factory_reset);
        httpd_register_uri_handler(server, &update_post);

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
