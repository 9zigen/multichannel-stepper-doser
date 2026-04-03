/* LVGL Example project
 *
 * Basic project to test LVGL on ESP32 based projects.
 *
 * This example code is in the Public Domain (or CC0 licensed, at your option.)
 *
 * Unless required by applicable law or agreed to in writing, this
 * software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
 * CONDITIONS OF ANY KIND, either express or implied.
 */
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"

#include <esp_wifi.h>
#include <esp_event.h>
#include <esp_log.h>
#include <esp_system.h>
#include <nvs_flash.h>
#include <driver/gpio.h>

/* Hardware */
#include "board.h"
#include "main.h"
#include "adc.h"
#include "mcp7940.h"
#include "led.h"
#include "ota.h"
#include "rtc.h"
#include "auth.h"
#include "pumps.h"
#include "buttons.h"
#include "app_settings.h"
#include "pwm_driver.h"
#include "connect.h"
#include "web_server.h"
#include "mqtt.h"
#include "eeprom.h"
#include "monitor.h"
#include "i2c_driver.h"
#include "stepper_task.h"
#include "driver/rmt.h"
#include "tmc2209.h"

/*********************
 *      DEFINES
 *********************/
#define TAG "MAIN"
static uint8_t ota_requested = 0;

TaskHandle_t pvTask1 = NULL;
TaskHandle_t pvTask2 = NULL;

/**********************
 *   APPLICATION MAIN
 **********************/
void app_main() {
    /* NVM settings */
    init_settings();

    /* Stepper */
    xTaskCreatePinnedToCore(&stepper_task,"Stepper Task",4096,NULL,5,NULL,1);

    /* PWM */
//  init_pwm_driver();

    /* WiFi + Web server */
    initialise_wifi(NULL);
//
//  /* Force Init OTA */
//  gpio_set_direction(GPIO_NUM_0, GPIO_MODE_INPUT);
//  gpio_set_pull_mode(GPIO_NUM_0, GPIO_PULLUP_ONLY);
//  if (!gpio_get_level(GPIO_NUM_0))
//  {
//    upgrade_firmware();
//    vTaskDelay(3 * 60 * 1000 / portTICK_PERIOD_MS);
//  }
//
//  /* Notification LED Task */
//  init_leds();
//  set_led_mode(LED_TWO_BLINK);
//
//  /* ADC2 */
//  init_adc2();
//
//  /* MCU Temp sensor */
//  init_temp_sensor();
//
//  /* Buttons */
//  init_buttons();
//
//  /* i2c */
//  init_i2c();
//
//  /* MCP7940 */
//  mcp7940_init();
//
//  /* FRAM TEST */
//  uint8_t write_byte = 58;
//  uint8_t read_byte = 0;
//  read_byte = eeprom_read_byte(0x50, 0x400);
//  eeprom_write_byte(0x50, 0x400, write_byte);
//  ESP_LOGI(TAG, "[APP] FRAM TEST read %d", read_byte);
//
//  /* RTC Setup */
//  init_clock();
//
//  /* Monitor Task */
//  init_monitor();
//
    /* Pumps */
//    init_pumps();

    /* web server */
    start_webserver();

    /* Wait WiFi */
    xEventGroupWaitBits(wifi_event_group, WIFI_CONNECTED_BIT, false, true, portMAX_DELAY);
//
//  /* MQTT Task */
//  xTaskCreate(&task_mqtt, "mqtt_task", 2048, NULL, 5, NULL);
//
//  /* ThingsBoard Task */
//  xTaskCreate(&task_thingsboard, "thingsboard_task", 2048, NULL, 5, NULL);
//
//  /* LVGL Task */
//  xTaskCreate(guiTask, "gui", 8096, NULL, 5, NULL);
//  init_lvgl_tick();
}



esp_err_t upgrade_firmware(void)
{
    /* disable wifi powersave */
//  disable_power_save();

    services_t * services = get_service_config();
    char * ota_url_ptr = NULL;
    if (strlen(services->ota_url) > 16)
    {
        ota_url_ptr = services->ota_url;
        ESP_LOGI(TAG, "update firmware from %s", ota_url_ptr);
    }

    /* Set OTA flag to prevent starting web server in event loop */
    ota_requested = 1;

    /* start ota task */
    if (xTaskCreate(&ota_task, "ota_task", 8192, ota_url_ptr, 5, NULL) != pdPASS)
    {
        set_led_mode(LED_INDICATE_OK, LED_SLOW_BLINK, 255);
        return ESP_OK;
    } else {
        set_led_mode(LED_INDICATE_ERROR, LED_THREE_BLINK, 30);
        return ESP_ERR_NO_MEM;
    }
}