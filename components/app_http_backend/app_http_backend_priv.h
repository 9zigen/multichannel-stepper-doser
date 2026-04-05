#ifndef APP_HTTP_BACKEND_PRIV_H
#define APP_HTTP_BACKEND_PRIV_H

#include <stdbool.h>

#include "esp_err.h"
#include "esp_http_server.h"

#define TOKEN_SIZE ((uint32_t)32)
#define SCRATCH_BUFSIZE ((uint32_t)2048)
#define APP_HTTP_MAX_WS_CLIENTS ((uint32_t)8)
#define MIN(X, Y) (((X) < (Y)) ? (X) : (Y))

extern char app_http_auth_token[65];

char *app_http_success_response_json(bool success);
esp_err_t app_http_validate_request(httpd_req_t *req);
esp_err_t app_http_validate_ws_request(httpd_req_t *req);
void app_http_set_cors_headers(httpd_req_t *req);
void app_http_ws_register_client(int sockfd);
void app_http_ws_unregister_client(int sockfd);
void app_http_ws_touch_client(int sockfd);
esp_err_t app_http_ws_send_json_to_client(httpd_handle_t handle, int sockfd, const char *payload);
esp_err_t app_http_ws_broadcast_json(const char *payload);
void app_http_ws_init_event_bridge(void);

esp_err_t index_get_handler(httpd_req_t *req);
esp_err_t favicon_get_handler(httpd_req_t *req);
esp_err_t js_handler(httpd_req_t *req);
esp_err_t css_handler(httpd_req_t *req);
esp_err_t options_handler(httpd_req_t *req);

esp_err_t device_restart_post_handler(httpd_req_t *req);
esp_err_t device_factory_reset_post_handler(httpd_req_t *req);
esp_err_t ota_get_handler(httpd_req_t *req);
esp_err_t upload_post_handler(httpd_req_t *req);
esp_err_t status_get_handler(httpd_req_t *req);
esp_err_t pumps_runtime_get_handler(httpd_req_t *req);
esp_err_t websocket_handler(httpd_req_t *req);
esp_err_t wifi_scan_get_handler(httpd_req_t *req);
esp_err_t schedule_get_handler(httpd_req_t *req);
esp_err_t settings_get_handler(httpd_req_t *req);
esp_err_t run_post_handler(httpd_req_t *req);
esp_err_t calibrate_post_handler(httpd_req_t *req);
esp_err_t schedule_post_handler(httpd_req_t *req);
esp_err_t settings_post_handler(httpd_req_t *req);
esp_err_t auth_post_handler(httpd_req_t *req);

#endif
