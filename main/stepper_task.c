#include <limits.h>
#include <math.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

#include "esp_log.h"

#include "app_settings.h"
#include "stepper_task.h"
#include "tmc2209.h"

static const char *TAG = "stepper_task";
static QueueHandle_t control_queue;
static tms2209_t stepper_cfg;
static bool stepper_cfg_ready = false;
static pump_driver_status_t driver_status_cache[MAX_PUMP];

typedef enum {
    STEPPER_COMMAND_CONTROL = 0,
    STEPPER_COMMAND_RELOAD_CONFIG,
} stepper_command_type_t;

typedef struct {
    uint8_t id;
    float rpm;
    bool direction;
    int32_t duration_ms;
} motor_control_t;

typedef struct {
    stepper_command_type_t type;
    motor_control_t control;
} stepper_command_t;

static gpio_num_t dir_pin_config[MAX_PUMP];
static gpio_num_t en_pin_config[MAX_PUMP];
static gpio_num_t step_pin_config[MAX_PUMP];
static tmc2209_microsteps_t microstep_config[MAX_PUMP];

#if defined(USE_RMT) && USE_RMT
#if defined(RMT_LEGACY) && RMT_LEGACY
static rmt_channel_t rmt_channels[MAX_PUMP] = {RMT_CHANNEL_0, RMT_CHANNEL_1, RMT_CHANNEL_2, RMT_CHANNEL_3};
#else
static rmt_channel_handle_t rmt_channels[MAX_PUMP] = {NULL, NULL, NULL, NULL};
#endif
#endif

static uint32_t microsteps_to_uint(tmc2209_microsteps_t micro_steps)
{
    switch (micro_steps) {
        case MICROSTEPS_256: return 256;
        case MICROSTEPS_128: return 128;
        case MICROSTEPS_64: return 64;
        case MICROSTEPS_32: return 32;
        case MICROSTEPS_16: return 16;
        case MICROSTEPS_8: return 8;
        case MICROSTEPS_4: return 4;
        case MICROSTEPS_2: return 2;
        case MICROSTEPS_1:
        default:
            return 1;
    }
}

static uint32_t calc_steps(uint32_t working_ms, uint32_t micro_steps, float rpm)
{
    float full_rotation_steps = 200.0f * (float)micro_steps;
    float required_rotations = (float)working_ms / 1000.0f / 60.0f * rpm;
    return (uint32_t)(full_rotation_steps * required_rotations + 0.5f);
}

static uint32_t calc_frequency(uint32_t micro_steps, float rpm)
{
    return (uint32_t)((rpm / 60.0f) * 200.0f * (float)micro_steps + 0.5f);
}

static tmc2209_microsteps_t microsteps_from_uint(uint16_t micro_steps)
{
    switch (micro_steps) {
        case 1: return MICROSTEPS_1;
        case 2: return MICROSTEPS_2;
        case 4: return MICROSTEPS_4;
        case 8: return MICROSTEPS_8;
        case 16: return MICROSTEPS_16;
        case 32: return MICROSTEPS_32;
        case 64: return MICROSTEPS_64;
        case 128: return MICROSTEPS_128;
        case 256:
        default:
            return MICROSTEPS_256;
    }
}

static float clamp_rpm_for_microsteps(float rpm, uint32_t micro_steps)
{
    if (micro_steps == 256 && rpm > 30.0f) {
        ESP_LOGW(TAG, "Clamping RPM %.2f to 30.00 for 256 microsteps", (double)rpm);
        return 30.0f;
    }

    return rpm;
}

static uint8_t thermal_level_from_drv_status(const tmc2209_drv_status_reg_t *drv_status)
{
    if (drv_status == NULL) {
        return 0;
    }

    if (drv_status->t157) return 4;
    if (drv_status->t150) return 3;
    if (drv_status->t143) return 2;
    if (drv_status->t120) return 1;
    return 0;
}

static void clear_driver_status_cache(void)
{
    memset(driver_status_cache, 0, sizeof(driver_status_cache));
    for (uint8_t i = 0; i < MAX_PUMP; ++i) {
        app_pumps_set_driver_status(i, &driver_status_cache[i]);
    }
}

static void poll_driver_health(void)
{
    if (!stepper_cfg_ready) {
        return;
    }

    for (uint8_t i = 0; i < stepper_cfg.motors_num; ++i) {
        pump_driver_status_t status = {0};
        tmc2209_ioin_reg_t ioin = tmc2209_get_ioin(stepper_cfg, i);
        tmc2209_gstat_reg_t gstat = tmc2209_get_gstat(&stepper_cfg, i);
        tmc2209_drv_status_reg_t drv_status = tmc2209_get_drv_status(&stepper_cfg, i);

        status.version = ioin.version;
        status.uart_ready = ioin.version != 0;
        status.reset = gstat.reset;
        status.driver_error = gstat.drv_err;
        status.undervoltage = gstat.uv_cp;
        status.otpw = drv_status.otpw;
        status.ot = drv_status.ot;
        status.s2ga = drv_status.s2ga;
        status.s2gb = drv_status.s2gb;
        status.s2vsa = drv_status.s2vsa;
        status.s2vsb = drv_status.s2vsb;
        status.ola = drv_status.ola;
        status.olb = drv_status.olb;
        status.thermal_level = thermal_level_from_drv_status(&drv_status);
        status.cs_actual = drv_status.cs_actual;
        status.stealth = drv_status.stealth;
        status.standstill = drv_status.stst;

        if (memcmp(&driver_status_cache[i], &status, sizeof(status)) != 0) {
            driver_status_cache[i] = status;
            app_pumps_set_driver_status(i, &status);
        }
    }
}

static void stepper_deinit_current_config(void)
{
    if (!stepper_cfg_ready) {
        return;
    }

    for (uint8_t i = 0; i < stepper_cfg.motors_num; ++i) {
        TMC2209_start(&stepper_cfg, i, 0);
        TMC2209_enable(&stepper_cfg, i, 1);
    }

    TMC2209_deinit(&stepper_cfg);
    memset(&stepper_cfg, 0, sizeof(stepper_cfg));
    stepper_cfg_ready = false;
    clear_driver_status_cache();
}

static esp_err_t stepper_apply_board_config(void)
{
    stepper_board_config_t *board_config = get_stepper_board_config();
    uint8_t motors_num = board_config->motors_num;
    if (motors_num > MAX_PUMP) {
        motors_num = MAX_PUMP;
    }

    stepper_deinit_current_config();

    if (motors_num == 0) {
        ESP_LOGW(TAG, "No active stepper channels configured");
        return ESP_OK;
    }

    for (uint8_t i = 0; i < MAX_PUMP; ++i) {
        dir_pin_config[i] = (gpio_num_t)board_config->channels[i].dir_pin;
        en_pin_config[i] = (gpio_num_t)board_config->channels[i].en_pin;
        step_pin_config[i] = (gpio_num_t)board_config->channels[i].step_pin;
        microstep_config[i] = microsteps_from_uint(board_config->channels[i].micro_steps);
    }

    memset(&stepper_cfg, 0, sizeof(stepper_cfg));
    stepper_cfg.baud_rate = 115200;
    stepper_cfg.dir_pin = dir_pin_config;
    stepper_cfg.en_pin = en_pin_config;
    stepper_cfg.step_pin = step_pin_config;
    stepper_cfg.micro_steps = microstep_config;
    stepper_cfg.uart = (uart_port_t)board_config->uart;
    stepper_cfg.tx_pin = (gpio_num_t)board_config->tx_pin;
    stepper_cfg.rx_pin = (gpio_num_t)board_config->rx_pin;
    stepper_cfg.motors_num = motors_num;
#if defined(USE_RMT) && USE_RMT
    stepper_cfg.rmt_channel = rmt_channels;
#endif

    tmc2209_init(&stepper_cfg);
    stepper_cfg_ready = true;

    for (uint8_t i = 0; i < stepper_cfg.motors_num; ++i) {
        tmc2209_gconf_reg_t reg = tmc2209_get_gconf(&stepper_cfg, i);
        ESP_LOGI(TAG, "Motor %u GCONF: 0x%lx", (unsigned)i, (reg.value & 0x1FF));
        TMC2209_uart_move(&stepper_cfg, i, 0);
    }

    ESP_LOGI(TAG, "Applied stepper board config: uart=%u tx=%ld rx=%ld motors=%u",
             (unsigned)board_config->uart,
             (long)board_config->tx_pin,
             (long)board_config->rx_pin,
             (unsigned)stepper_cfg.motors_num);
    poll_driver_health();
    return ESP_OK;
}

static void stepper_stop(uint8_t motor_num)
{
    if (!stepper_cfg_ready || motor_num >= stepper_cfg.motors_num) {
        return;
    }

    TMC2209_start(&stepper_cfg, motor_num, 0);
    TMC2209_enable(&stepper_cfg, motor_num, 1);
}

static void stepper_start(uint8_t motor_num, float rpm, bool direction, int32_t duration_ms)
{
    if (!stepper_cfg_ready || motor_num >= stepper_cfg.motors_num || rpm <= 0.0f) {
        return;
    }

    uint32_t microstep_value = microsteps_to_uint(stepper_cfg.micro_steps[motor_num]);
    rpm = clamp_rpm_for_microsteps(rpm, microstep_value);
    uint32_t freq = calc_frequency(microstep_value, rpm);
    if (freq == 0) {
        ESP_LOGW(TAG, "Ignoring zero-frequency command for motor %u", (unsigned)motor_num);
        return;
    }

    uint32_t period_us = 1000000UL / freq;
    uint32_t steps = UINT_MAX / 4U;
    if (duration_ms > 0) {
        steps = calc_steps((uint32_t)duration_ms, microstep_value, rpm);
        if (steps == 0) {
            steps = 1;
        }
    }

    TMC2209_start(&stepper_cfg, motor_num, 0);
    TMC2209_enable(&stepper_cfg, motor_num, 0);
    TMC2209_set_dir(&stepper_cfg, motor_num, direction ? CW_DIR : CCW_DIR);
    TMC2209_set_steps(&stepper_cfg, motor_num, steps);
    TMC2209_set_period(motor_num, period_us);
    TMC2209_start(&stepper_cfg, motor_num, 1);
}

esp_err_t stepper_task_control(uint8_t id, float rpm, bool direction, int32_t duration_ms)
{
    if (control_queue == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    stepper_command_t message = {
        .type = STEPPER_COMMAND_CONTROL,
        .control = {
            .id = id,
            .rpm = rpm,
            .direction = direction,
            .duration_ms = duration_ms,
        },
    };

    return xQueueSend(control_queue, &message, pdMS_TO_TICKS(1000)) == pdTRUE ? ESP_OK : ESP_FAIL;
}

esp_err_t stepper_task_reload_config(void)
{
    if (control_queue == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    stepper_command_t message = {
        .type = STEPPER_COMMAND_RELOAD_CONFIG,
    };

    return xQueueSend(control_queue, &message, pdMS_TO_TICKS(1000)) == pdTRUE ? ESP_OK : ESP_FAIL;
}

bool stepper_task_get_driver_status(uint8_t id, pump_driver_status_t *out_status)
{
    if (id >= MAX_PUMP || out_status == NULL) {
        return false;
    }

    *out_status = driver_status_cache[id];
    return stepper_cfg_ready && id < stepper_cfg.motors_num;
}

void stepper_task(void *pvParameter)
{
    (void)pvParameter;

    control_queue = xQueueCreate(10, sizeof(stepper_command_t));
    if (control_queue == NULL) {
        ESP_LOGE(TAG, "Failed to create stepper control queue");
        vTaskDelete(NULL);
        return;
    }

    ESP_ERROR_CHECK(stepper_apply_board_config());
    stepper_command_t command;

    while (1) {
        if (xQueueReceive(control_queue, &command, pdMS_TO_TICKS(1000)) == pdTRUE) {
            if (command.type == STEPPER_COMMAND_RELOAD_CONFIG) {
                ESP_LOGI(TAG, "Reloading stepper board config");
                ESP_ERROR_CHECK(stepper_apply_board_config());
                continue;
            }

            motor_control_t control_packet = command.control;
            ESP_LOGI(TAG, "Control packet: id=%u rpm=%.2f dir=%u duration_ms=%ld",
                     control_packet.id,
                     control_packet.rpm,
                     control_packet.direction,
                     (long)control_packet.duration_ms);

            if (control_packet.duration_ms == 0 || control_packet.rpm <= 0.0f) {
                stepper_stop(control_packet.id);
            } else {
                stepper_start(control_packet.id,
                              fabsf(control_packet.rpm),
                              control_packet.direction,
                              control_packet.duration_ms);
            }
        } else {
            poll_driver_health();
        }
    }
}
