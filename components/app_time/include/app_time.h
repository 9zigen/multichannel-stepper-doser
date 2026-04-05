#pragma once

#include <stdbool.h>
#include <stdint.h>

void init_clock(void);
void print_time(void);
void get_time_string(char *time_string);
void det_time_string_since_boot(char *time_string);
uint8_t get_ntp_sync_status(void);
const char *get_rtc_backend_name(void);
bool rtc_using_fallback(void);
