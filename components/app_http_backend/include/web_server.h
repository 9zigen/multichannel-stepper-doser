/***
** Created by Aleksey Volkov on 15.12.2019.
***/

#ifndef TFT_DOSER_WEB_SERVER_H
#define TFT_DOSER_WEB_SERVER_H

#include "esp_http_server.h"

httpd_handle_t start_webserver(void);
void stop_webserver(void);

char *get_settings_json(void);
char *get_schedule_json(void);
char *get_status_json(void);
char *get_pumps_runtime_json(void);

#endif
