#pragma once

#include "stdbool.h"
#include <stdint.h>
#include <driver/gpio.h>
#include "board.h"

#define MAX_NETWORKS                    5
#define MAX_PUMP_CALIBRATION_POINTS     8
#define MAX_NETWORK_STR_LEN             64
#define MAX_SERVICE_URL_LEN             256

#define HOUR_0              1 << 0
#define HOUR_1              1 << 1
#define HOUR_2              1 << 2
#define HOUR_3              1 << 3
#define HOUR_4              1 << 4
#define HOUR_5              1 << 5
#define HOUR_6              1 << 6
#define HOUR_7              1 << 7
#define HOUR_8              1 << 8
#define HOUR_9              1 << 9
#define HOUR_10             1 << 10
#define HOUR_11             1 << 11
#define HOUR_12             1 << 12
#define HOUR_13             1 << 13
#define HOUR_14             1 << 14
#define HOUR_15             1 << 15
#define HOUR_16             1 << 16
#define HOUR_17             1 << 17
#define HOUR_18             1 << 18
#define HOUR_19             1 << 19
#define HOUR_20             1 << 20
#define HOUR_21             1 << 21
#define HOUR_22             1 << 22
#define HOUR_23             1 << 23

typedef enum {
    NETWORK_TYPE_WIFI = 0,
    NETWORK_TYPE_ETHERNET = 1,
    NETWORK_TYPE_BLE = 2,
    NETWORK_TYPE_THREAD = 3,
    NETWORK_TYPE_CAN = 4,
} network_type_t;

typedef enum {
    SCHEDULE_MODE_OFF = 0,
    SCHEDULE_MODE_PERIODIC = 1,
    SCHEDULE_MODE_CONTINUOUS = 2,
} schedule_mode_t;

typedef struct {
    float speed;
    float flow;
} pump_calibration_t;

typedef struct {
    uint8_t id;                           // Network ID for UI
    uint8_t type;                         // network_type_t
    bool is_dirty;                        // UI-only dirty marker
    char ssid[32];                        // Wifi SSID Name
    char password[64];                    // Wifi Password
    bool keep_ap_active;                  // Keep AP available while STA is configured
    uint8_t ip_address[4];                // IP Address
    uint8_t mask[4];                      // Mask
    uint8_t gateway[4];                   // Gateway
    uint8_t dns[4];                       // DNS
    bool dhcp;                            // Enable DHCP Client
    uint16_t channel;                     // Thread channel
    char network_name[MAX_NETWORK_STR_LEN];
    char network_key[MAX_NETWORK_STR_LEN];
    char pan_id[16];
    char ext_pan_id[32];
    char pskc[MAX_NETWORK_STR_LEN];
    char mesh_local_prefix[MAX_NETWORK_STR_LEN];
    bool force_dataset;
    uint16_t can_node_id;
    bool active;                          // Stored network profile is in use
} network_t;

typedef struct {
    char hostname[20];                    // Device Name
    char ota_url[MAX_SERVICE_URL_LEN];    // OTA Server URL (full web path to firmware)
    char ntp_server[MAX_NETWORK_STR_LEN]; // NTP server / host
    int utc_offset;                       // UTC offset in minutes
    bool ntp_dst;                         // Daylight save
    uint8_t mqtt_ip_address[4];           // IP v4 Address Array
    uint16_t mqtt_port;                   // MQTT Server port 1883 default
    char mqtt_user[MAX_NETWORK_STR_LEN];
    char mqtt_password[MAX_NETWORK_STR_LEN];
    uint8_t mqtt_qos;                     // MQTT QoS
    uint8_t mqtt_retain;                  // MQTT Retain
    bool enable_ntp;                      // Enable NTP Service
    bool enable_mqtt;                     // Enable MQTT Service
} services_t;

typedef struct {
    uint8_t id;                           // channel ID
    char name[32];                        // String 32 letters max
    uint32_t calibration_100ml_units;     // Pump Work time in units to transfer 100ml of fluid
    pump_calibration_t calibration[MAX_PUMP_CALIBRATION_POINTS];
    uint8_t calibration_count;
    bool direction;                       // CW / CCW
    float running_hours;                  // Runtime counter
    uint32_t tank_full_vol;               // Tank Ful Volume in ml
    uint32_t tank_concentration_total;    // Tank Solution Concentration in mg/l
    uint32_t tank_concentration_active;   // Tank Active Component Concentration in mg/l
    double tank_current_vol;              // Tank Current Volume in ml
    bool state;                           // Enable/Disable pump
} pump_t;

typedef struct {
    uint8_t  pump_id;                     // ID dosing pump
    uint8_t  mode;                        // schedule_mode_t
    uint32_t work_hours;                  // Doses every hour in day bitmask 0 - 23 bit
    uint8_t  week_days;                   // Doses every weekday bitmask 0 - 7 bit
    float    speed;                       // Motor speed int RPM
    uint32_t time;                        // Continuous or manual runtime
    uint32_t day_volume;                  // dose volume in mL (1/1000 l)
    bool     active;                      // Need send by WS to GUI
} schedule_t;

typedef struct {
    char username[32];
    char password[32];
    char token[65];
} auth_t;

typedef struct {
    uint32_t day_stamp;
    float running_hours[MAX_PUMP];
} pump_aging_state_t;

void init_settings(void);
void set_default_network(void);
void set_default_service(void);
void set_default_pump(void);
void set_default_schedule(void);
void set_default_auth(void);

void save_network(void);
void save_service(void);
void save_pump(void);
void save_schedule(void);
void save_auth(void);
void load_pump_aging_state(void);
void save_pump_aging_state(uint32_t day_stamp);
uint32_t get_pump_aging_day_stamp(void);

void erase_settings(void);

network_t *get_networks_config(uint8_t network_id);
services_t *get_service_config(void);
pump_t *get_pump_config(uint8_t pump_id);
schedule_t *get_schedule_config(uint8_t schedule_id);
auth_t *get_auth_config(void);

void ip_to_string(uint8_t ip[4], char* string);
void string_to_ip(const char *ip_string, uint8_t *octets);
