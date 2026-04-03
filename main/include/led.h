#pragma once

#include <driver/gpio.h>
#include <esp_system.h>

typedef enum {
    LED_OFF,
    LED_ON,
    LED_SLOW_BLINK,
    LED_FAST_BLINK,
    LED_TWO_BLINK,
    LED_THREE_BLINK,
    LED_FOUR_BLINK
} led_mode_t;

typedef enum {
    LED_INDICATE_OK,
    LED_INDICATE_ERROR
} led_indicate_color_t;

typedef struct {
    gpio_num_t gpio_num;
    uint8_t led_mode;
    uint8_t blinks_left;
    uint8_t is_active;
} led_drv_t;

void set_led_mode(led_indicate_color_t id, led_mode_t mode, uint8_t count);
void init_leds();