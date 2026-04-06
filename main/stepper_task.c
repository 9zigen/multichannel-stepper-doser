#include <limits.h>
#include <math.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

#include "esp_log.h"

#include "stepper_task.h"

static const char *TAG = "stepper_task";
static QueueHandle_t control_queue;
static tms2209_t stepper_cfg;
static bool stepper_cfg_ready = false;

typedef struct {
    uint8_t id;
    float rpm;
    bool direction;
    int32_t duration_ms;
} motor_control_t;

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

    uint32_t micro_steps = microsteps_to_uint(stepper_cfg.micro_steps[motor_num]);
    uint32_t freq = calc_frequency(micro_steps, rpm);
    if (freq == 0) {
        ESP_LOGW(TAG, "Ignoring zero-frequency command for motor %u", (unsigned)motor_num);
        return;
    }

    uint32_t period_us = 1000000UL / freq;
    uint32_t steps = UINT_MAX / 4U;
    if (duration_ms > 0) {
        steps = calc_steps((uint32_t)duration_ms, micro_steps, rpm);
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

    motor_control_t message = {
        .id = id,
        .rpm = rpm,
        .direction = direction,
        .duration_ms = duration_ms,
    };

    return xQueueSend(control_queue, &message, pdMS_TO_TICKS(1000)) == pdTRUE ? ESP_OK : ESP_FAIL;
}

void stepper_task(void *pvParameter)
{
    gpio_num_t dir_pins[] = {GPIO_NUM_12, GPIO_NUM_26, GPIO_NUM_17, GPIO_NUM_32};
    gpio_num_t en_pins[] = {GPIO_NUM_25, GPIO_NUM_25, GPIO_NUM_25, GPIO_NUM_25};
    gpio_num_t step_pins[] = {GPIO_NUM_14, GPIO_NUM_27, GPIO_NUM_16, GPIO_NUM_33};
    tmc2209_microsteps_t micro_steps[] = {MICROSTEPS_256, MICROSTEPS_256, MICROSTEPS_256, MICROSTEPS_256};

#if defined(RMT_LEGACY) && RMT_LEGACY
    rmt_channel_t rmt_channels[] = {RMT_CHANNEL_0, RMT_CHANNEL_1, RMT_CHANNEL_2, RMT_CHANNEL_3};
#else
    rmt_channel_handle_t rmt_channels[] = {NULL, NULL, NULL, NULL};
#endif

    tms2209_t cfg = {
        .baud_rate = 115200,
        .dir_pin = dir_pins,
        .en_pin = en_pins,
        .step_pin = step_pins,
        .micro_steps = micro_steps,
        .uart = UART_NUM_2,
        .tx_pin = GPIO_NUM_22,
        .rx_pin = GPIO_NUM_21,
        .motors_num = 4,
        .rmt_channel = rmt_channels,
    };

    tmc2209_init(&cfg);
    memcpy(&stepper_cfg, &cfg, sizeof(stepper_cfg));
    stepper_cfg_ready = true;

    for (int i = 0; i < cfg.motors_num; ++i) {
        tmc2209_gconf_reg_t reg = tmc2209_get_gconf(&cfg, i);
        ESP_LOGI(TAG, "Motor %d GCONF: 0x%lx", i, (reg.value & 0x1FF));
        TMC2209_uart_move(&cfg, i, 0);
    }

    control_queue = xQueueCreate(10, sizeof(motor_control_t));
    motor_control_t control_packet;

    while (1) {
        if (xQueueReceive(control_queue, &control_packet, portMAX_DELAY) == pdTRUE) {
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
        }
    }
}
