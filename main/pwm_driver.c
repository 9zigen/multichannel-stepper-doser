/***
** Created by Aleksey Volkov on 04.08.2020.
***/

#include <stdlib.h>
#include <math.h>
#include <time.h>

#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <esp_log.h>
#include <esp_err.h>
#include <driver/ledc.h>

#include "pwm_driver.h"

/* 0 - 3 Pumps, 4 - display blk */
#define LEDC_LS_TIMER          LEDC_TIMER_0
#define LEDC_LS_MODE           LEDC_LOW_SPEED_MODE
#define LEDC_CH0_GPIO       (14)
#define LEDC_CH0_CHANNEL    LEDC_CHANNEL_0
#define LEDC_CH1_GPIO       (15)
#define LEDC_CH1_CHANNEL    LEDC_CHANNEL_1
#define LEDC_CH2_GPIO       (16)
#define LEDC_CH2_CHANNEL    LEDC_CHANNEL_2
#define LEDC_CH3_GPIO       (17)
#define LEDC_CH3_CHANNEL    LEDC_CHANNEL_3
#define LEDC_CH4_GPIO       (19)
#define LEDC_CH4_CHANNEL    LEDC_CHANNEL_4
#define LEDC_CH5_GPIO       (20)
#define LEDC_CH5_CHANNEL    LEDC_CHANNEL_5
#define LEDC_CH6_GPIO       (21)
#define LEDC_CH6_CHANNEL    LEDC_CHANNEL_6
#define LEDC_CH7_GPIO       (33)
#define LEDC_CH7_CHANNEL    LEDC_CHANNEL_7

#define LEDC_CH_NUM            (8)
#define LEDC_FADE_TIME         (500)

static const char *TAG = "PWM DRIVER";

ledc_channel_config_t ledc_channel[LEDC_CH_NUM] = {
    {
        .channel    = LEDC_CH0_CHANNEL,
        .duty       = 0,
        .gpio_num   = LEDC_CH0_GPIO,
        .speed_mode = LEDC_LS_MODE,
        .hpoint     = 0,
        .timer_sel  = LEDC_LS_TIMER
    },
    {
        .channel    = LEDC_CH1_CHANNEL,
        .duty       = 0,
        .gpio_num   = LEDC_CH1_GPIO,
        .speed_mode = LEDC_LS_MODE,
        .hpoint     = 0,
        .timer_sel  = LEDC_LS_TIMER
    },
    {
        .channel    = LEDC_CH2_CHANNEL,
        .duty       = 0,
        .gpio_num   = LEDC_CH2_GPIO,
        .speed_mode = LEDC_LS_MODE,
        .hpoint     = 0,
        .timer_sel  = LEDC_LS_TIMER
    },
    {
        .channel    = LEDC_CH3_CHANNEL,
        .duty       = 0,
        .gpio_num   = LEDC_CH3_GPIO,
        .speed_mode = LEDC_LS_MODE,
        .hpoint     = 0,
        .timer_sel  = LEDC_LS_TIMER
    },
    {
        .channel    = LEDC_CH4_CHANNEL,
        .duty       = 0,
        .gpio_num   = LEDC_CH4_GPIO,
        .speed_mode = LEDC_LS_MODE,
        .hpoint     = 0,
        .timer_sel  = LEDC_LS_TIMER
    },
    {
        .channel    = LEDC_CH5_CHANNEL,
        .duty       = 0,
        .gpio_num   = LEDC_CH5_GPIO,
        .speed_mode = LEDC_LS_MODE,
        .hpoint     = 0,
        .timer_sel  = LEDC_LS_TIMER
    },
    {
        .channel    = LEDC_CH6_CHANNEL,
        .duty       = 0,
        .gpio_num   = LEDC_CH6_GPIO,
        .speed_mode = LEDC_LS_MODE,
        .hpoint     = 0,
        .timer_sel  = LEDC_LS_TIMER
    },
    {
        .channel    = LEDC_CH7_CHANNEL,
        .duty       = 0,
        .gpio_num   = LEDC_CH7_GPIO,
        .speed_mode = LEDC_LS_MODE,
        .hpoint     = 0,
        .timer_sel  = LEDC_LS_TIMER
    }
};


static void init_ledc(void)
{
  uint8_t ch;

  /*
     * Prepare and set configuration of timers
     * that will be used by LED Controller
     */
  ledc_timer_config_t ledc_timer = {
      .duty_resolution = LEDC_TIMER_12_BIT, // resolution of PWM duty
      .freq_hz = 5000,                     // frequency of PWM signal
      .speed_mode = LEDC_LS_MODE,           // timer mode
      .timer_num = LEDC_LS_TIMER,           // timer index
      .clk_cfg = LEDC_AUTO_CLK,             // Auto select the source clock
  };

  // Set configuration of timer0 for high speed channels
  ledc_timer_config(&ledc_timer);

  // Set LED Controller with previously prepared configuration
  for (ch = 0; ch < LEDC_CH_NUM; ch++) {
    ledc_channel_config(&ledc_channel[ch]);
  }

  // Initialize fade service.
  ledc_fade_func_install(0);
}

void init_pwm_driver(void)
{
  init_ledc();
}

void fade_channel(uint8_t channel, uint16_t fade_time, uint32_t duty)
{
  ledc_set_fade_with_time(ledc_channel[channel].speed_mode,
                          ledc_channel[channel].channel, duty, fade_time);
  ledc_fade_start(ledc_channel[channel].speed_mode,
                  ledc_channel[channel].channel, LEDC_FADE_NO_WAIT);
}

/* fade channel to percent 0 - 100, step 1% */
void fade_channel_percent(uint8_t channel, uint16_t fade_time, uint8_t percent)
{
  uint32_t duty = percent * 4095 / 100;
  fade_channel(channel, fade_time, duty);
}