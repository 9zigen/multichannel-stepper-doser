#include <stdio.h>
#include <string.h>
#include <time.h>
#include <math.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "esp_attr.h"
#include "esp_log.h"

#include "tmc2209.h"
#include "stepper_task.h"

static const char* TAG = "stepper_task";
static QueueHandle_t control_queue;

typedef struct {
    uint8_t id;
    uint32_t rpm;
    uint32_t direction;
    uint32_t loops;
} motor_control_t;


esp_err_t stepper_task_control(uint8_t id, uint32_t rpm, uint32_t direction, uint32_t loops)
{
    motor_control_t message;
    message.id = id;
    message.rpm = rpm;
    message.direction = direction;
    message.loops = loops;

    return xQueueSend(control_queue, &message, pdMS_TO_TICKS(1000));
}

float calc_speed(float angle_step, uint32_t freq_hz) {
    return angle_step / 360 * (float)freq_hz * 60;
}

/**
 * Calculate motor steps by running time in milliseconds
 * @param working_ms
 * @param micro_steps
 * @param rpm
 * @return
 */
uint32_t calc_steps(uint32_t working_ms, uint32_t micro_steps, float rpm)
{
    float full_rotation_steps = 200 * (float)micro_steps;
    float required_rotations = (float) working_ms / 1000 / 60 * rpm;
    return (uint32_t) (full_rotation_steps * required_rotations + 0.5);
}

/**
 * Calculate stepper motor control signal frequency
 * @param micro_steps
 * @param rpm
 * @return
 */
uint32_t calc_frequency(uint32_t micro_steps, float rpm) {
    return (uint32_t)(rpm / 60 * 200 * (float)micro_steps + 0.5f);
}

/**
 * Configure stepper drivers and Start motor
 * @param cfg
 * @param motor_num
 * @param rpm  - rotation per minute
 * @param dir  - motor direction 0 - CW
 * @param time - motor running time in mS
 */
void program_stepper(tms2209_t *cfg, uint8_t motor_num, float rpm, uint8_t dir, uint32_t time)
{
    if (motor_num > cfg->motors_num - 1) {
        return;
    }

    uint32_t micro_steps = 1;
    switch (cfg->micro_steps[motor_num]) {
        case MICROSTEPS_256:
            micro_steps = 256;
            break;
        case MICROSTEPS_128:
            micro_steps = 128;
            break;
        case MICROSTEPS_64:
            micro_steps = 64;
            break;
        case MICROSTEPS_32:
            micro_steps = 32;
            break;
        case MICROSTEPS_16:
            micro_steps = 16;
            break;
        case MICROSTEPS_8:
            micro_steps = 6;
            break;
        case MICROSTEPS_4:
            micro_steps = 4;
            break;
        case MICROSTEPS_2:
            micro_steps = 2;
            break;
        default:
            micro_steps = 1;
            break;
    }
    ESP_LOGI(TAG, "Microsteps: %lu", micro_steps);

    /* 200 steps per resolution 1.8˚ */
    uint32_t freq = calc_frequency(micro_steps, rpm);
    ESP_LOGI(TAG, "Freq: %lu Hz", freq);

    uint32_t timer_period_us = 1000000 / freq;
    ESP_LOGI(TAG, "Timer: %lu us", timer_period_us);

    /* Calc steps from running time */
    uint32_t steps = calc_steps(time, micro_steps, rpm);
    ESP_LOGI(TAG, "Steps: %lu", steps);

    TMC2209_set_dir(cfg, motor_num, dir);
    TMC2209_set_steps(cfg, motor_num, steps);
    TMC2209_set_period(motor_num,  timer_period_us);
    TMC2209_start(cfg, motor_num, 1);
}

void stepper_task(void *pvParameter)
{

    /* Motor order 0:Z, 1:X, 2:E, 3:Y by UART address */
    gpio_num_t dir_pins[]               = {GPIO_NUM_12, GPIO_NUM_26, GPIO_NUM_17, GPIO_NUM_32};
    gpio_num_t en_pins[]                = {GPIO_NUM_25, GPIO_NUM_25, GPIO_NUM_25, GPIO_NUM_25};
    gpio_num_t step_pins[]              = {GPIO_NUM_14, GPIO_NUM_27, GPIO_NUM_16, GPIO_NUM_33};
    tmc2209_microsteps_t micro_steps[]  = {MICROSTEPS_256, MICROSTEPS_256, MICROSTEPS_256, MICROSTEPS_256};

#if defined(RMT_LEGACY)
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
        .rmt_channel = rmt_channels
    };
    tmc2209_init(&cfg);

    for (int i = 0; i < 1; ++i)
    {
        tmc2209_gconf_reg_t reg = tmc2209_get_gconf(&cfg, i);
        ESP_LOGI(TAG, "Motor %d GCONF: 0x%lx\n"
                      "I_scale_analog: %u \n"
                      "internal_Rsense: %u \n"
                      "en_spreadcycle: %u \n"
                      "pdn_disable: %u \n"
                      "mstep_reg_select: %u",
                 i,
                 (reg.value & 0x1FF),
                 reg.I_scale_analog,
                 reg.internal_Rsense,
                 reg.en_spreadcycle,
                 reg.pdn_disable,
                 reg.mstep_reg_select);
    }

    vTaskDelay(pdMS_TO_TICKS(1000));

    TMC2209_uart_move(&cfg, 0, 0);
    TMC2209_uart_move(&cfg, 1, 0);
    TMC2209_uart_move(&cfg, 2, 0);
    TMC2209_uart_move(&cfg, 3, 0);

    /* Control queue */
    control_queue = xQueueCreate(10, sizeof (motor_control_t));;
    motor_control_t control_packet;

    program_stepper(&cfg, 0, 1, 0, 60 * 1000);

    while(1)
    {
        if (xQueueReceive(control_queue, &control_packet, portMAX_DELAY))
        {
            ESP_LOGI(TAG, "Received control packet: %d %lu %lu", control_packet.id, control_packet.rpm, control_packet.direction);

            // TMC2209_set_dir(&cfg, control_packet.id, control_packet.direction);
            // TMC2209_set_steps(&cfg, control_packet.id, control_packet.loops);
            // TMC2209_set_period(control_packet.id, 1000000 / 256 * (control_packet.loops / 60));
            // TMC2209_start(&cfg, control_packet.id, 1);
        }
    }
}
