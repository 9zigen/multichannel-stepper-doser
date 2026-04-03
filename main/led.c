/***
** Created by Aleksey Volkov on 07.01.2020.
***/
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"

#include <esp_system.h>
#include <driver/gpio.h>

#include "board.h"
#include "led.h"

const gpio_num_t device_led_gpio[] =  LEDS;
static led_drv_t leds[LED_COUNT];

/* LED Notification */
uint8_t led_mode_map[] = {
    0B00000000, /* Off */
    0B11111111, /* On */
    0B00001111, /* Half second blinking */
    0B00000001, /* Short flash once per second */
    0B00000101, /* Two short flashes once a second */
    0B00010101, /* Three short flashes once a second */
    0B01010101  /* Frequent short flashes (4 times per second) */
};

void set_led_mode(led_indicate_color_t id, led_mode_t mode, uint8_t count)
{
    if (id < LED_COUNT) {
        leds[id].is_active = 1;
        leds[id].led_mode = led_mode_map[mode];
        leds[id].blinks_left = count;
    }
}

void vLedsTimerHandler( TimerHandle_t pxTimer )
{
    for (int i = 0; i < LED_COUNT; ++i)
    {
        uint8_t blink_loop = 0;

        if (leds[i].blinks_left > 0 && leds[i].is_active)
        {
            for (int j = 0; j < 7; ++j)
            {
                if( leds[i].led_mode & 1<<(blink_loop & 0x07) )
                {
                    gpio_set_level(leds[i].gpio_num, LED_ACTIVE_LEVEL);
                } else {
                    gpio_set_level(leds[i].gpio_num, !LED_ACTIVE_LEVEL);
                }

                blink_loop++;
                vTaskDelay(200 / portTICK_PERIOD_MS);
            }
            if (leds[i].blinks_left != 255)
                leds[i].blinks_left--;
        }

        if (leds[i].blinks_left == 0) {
            leds[i].is_active = 0;
            gpio_set_level(leds[i].gpio_num, !LED_ACTIVE_LEVEL);
        }
    }
}

void init_leds() {
    /* Setup LED gpio */
    for (int i = 0; i < LED_COUNT; ++i) {
        gpio_reset_pin(device_led_gpio[i]);
        esp_rom_gpio_pad_select_gpio(device_led_gpio[i]);
        gpio_set_direction(device_led_gpio[i], GPIO_MODE_OUTPUT);

        leds[i].gpio_num = device_led_gpio[i];
        leds[i].blinks_left = 0;
        leds[i].is_active = 0;
        leds[i].led_mode = led_mode_map[LED_OFF];
    }

    /* 2000ms timer */
    TimerHandle_t xLedTimer = xTimerCreate( "ledTimer", ( 2000 / portTICK_PERIOD_MS), pdTRUE, 0, vLedsTimerHandler);
    xTimerStart(xLedTimer, 100 / portTICK_PERIOD_MS);
}