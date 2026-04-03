/***
** Created by Aleksey Volkov on 16.01.2020.
***/

#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <freertos/timers.h>

#include <esp_log.h>
#include <esp_system.h>
#include <driver/gpio.h>


#include "board.h"
#include "include/buttons.h"

static const char *TAG = "BUTTONS";
static QueueHandle_t xQueueButton = NULL;

/* Encoder state */
bool is_pressed = false;
int16_t steps = 0;         /* -127 ... 127 */

/* Hardware */
#define ENC_A    11
#define ENC_B    10
#define ENC_OK   9

typedef struct {
  uint8_t a;
  uint8_t b;
} encoder_event_t;

static void ok_gpio_isr_handler(void *arg)
{
  if (!gpio_get_level(ENC_OK)) {
    is_pressed = true;
  } else {
    is_pressed = false;
  }
}

static void ab_gpio_isr_handler(void *arg)
{
//  uint32_t gpio_num = (uint32_t) arg;
  encoder_event_t encoder_event = {
      .a = gpio_get_level(ENC_A),
      .b = gpio_get_level(ENC_A),
  };

  xQueueSendFromISR(xQueueButton, &encoder_event, NULL);
}

void vButtonsTimerHandler( TimerHandle_t pxTimer )
{
  encoder_event_t encoder_events[4];
  encoder_event_t encoder_event;
  uint8_t event_received = 0;

  if (uxQueueMessagesWaitingFromISR(xQueueButton) == 4)
  {
    for (uint8_t i = 0; i < 4; i++) {
      if (xQueueReceive(xQueueButton, &encoder_event, 10)) {
        event_received++;
        ESP_LOGW(TAG, "A:%d B:%d", encoder_event.a, encoder_event.b);

        /* CW
         * 0 - 0
         * 0 - 0
         * 1 - 1
         * 1 - 1 */
        /* CCW
         * 1 - 1
         * 0 - 0
         * 0 - 0
         * 1 - 1 */
        encoder_events[i].a = encoder_event.a;
        encoder_events[i].b = encoder_event.b;
      }
    }
    ESP_LOGW(TAG, "-----");

    if (event_received == 3) {
      event_received = 0;
      /* check steps */
      uint8_t cw_valid = 1;
      uint8_t ccw_valid = 1;

      uint8_t cw_table[4] = {0, 0, 1, 1};
      uint8_t ccw_table[4] = {1, 0, 0, 1};

      for (uint8_t i = 0; i < 4; i++) {
        if ((cw_table[i] != encoder_events[i].a) && (encoder_events[i].a == encoder_events[i].b)) {
          cw_valid = 0;
        }
        if ((ccw_table[i] != encoder_events[i].a) && (encoder_events[i].a == encoder_events[i].b)) {
          ccw_valid = 0;
        }
      }

      if (cw_valid) {
        steps++;
      }
      if (ccw_valid) {
        steps--;
      }
    }
  }

  if (!gpio_get_level(ENC_OK)) {
    is_pressed = true;
  } else {
    is_pressed = false;
  }
}

//void predict_direction()
//{
//
//}

void task_encoder(void *pvParameters)
{
  encoder_event_t encoder_event;
  encoder_event_t encoder_events[12];
  uint8_t event_received = 0;
  uint8_t garbage = 0;

  for (;;)
  {
    if (xQueueReceive(xQueueButton, &encoder_event, 10))
    {
      encoder_events[event_received].a = encoder_event.a;
      encoder_events[event_received].b = encoder_event.b;
      ESP_LOGD(TAG, "A:%d B:%d", encoder_event.a, encoder_event.b);
      event_received++;
    }

    if (event_received >= 4) {
      ESP_LOGW(TAG, "event_received:%d", event_received);

      /* check steps */
      uint8_t total = 0;
      for (uint8_t i = 0; i < event_received; i++) {
        total += (encoder_events[i].a * encoder_events[i].b) * (i + 1);
      }

      ESP_LOGW(TAG, "----- total: %d", total);

      if (total == 7 || total == 4) {
        steps++;
      } else if (total == 5 || total == 1) {
        steps--;
      }
      event_received = 0;
      xQueueReset(xQueueButton);

      /* check steps */
//      uint8_t cw_valid = 1;
//      uint8_t ccw_valid = 1;
//
//      uint8_t cw_table[4] = {0, 0, 1, 1};
//      uint8_t ccw_table[4] = {1, 0, 0, 1};
//
//      for (uint8_t i = 0; i < 4; i++) {
//        if ((cw_table[i] != encoder_events[i].a) && (encoder_events[i].a == encoder_events[i].b)) {
//          cw_valid = 0;
//        }
//        if ((ccw_table[i] != encoder_events[i].a) && (encoder_events[i].a == encoder_events[i].b)) {
//          ccw_valid = 0;
//        }
//      }

//      if (cw_valid) {
//        steps++;
//      }
//      if (ccw_valid) {
//        steps--;
//      }
    }

    if (!gpio_get_level(ENC_OK)) {
      is_pressed = true;
    } else {
      is_pressed = false;
    }

    vTaskDelay(2 / portTICK_PERIOD_MS);
  }
}

void init_buttons()
{
  gpio_set_direction(ENC_A, GPIO_MODE_INPUT);
  gpio_set_pull_mode(ENC_A, GPIO_PULLUP_ONLY);
  gpio_set_direction(ENC_B, GPIO_MODE_INPUT);
  gpio_set_pull_mode(ENC_B, GPIO_PULLUP_ONLY);
  gpio_set_direction(ENC_OK, GPIO_MODE_INPUT);
  gpio_set_pull_mode(ENC_OK, GPIO_PULLUP_ONLY);

  /* change gpio intrrupt type for one pin */
  gpio_set_intr_type(ENC_A, GPIO_INTR_ANYEDGE);
  gpio_set_intr_type(ENC_B, GPIO_INTR_ANYEDGE);
  gpio_set_intr_type(ENC_OK, GPIO_INTR_LOW_LEVEL);

  /* create a queue to handle gpio event from isr */
  xQueueButton = xQueueCreate(12, sizeof(encoder_event_t));

  /* start gpio task */
//  TimerHandle_t xButtonsTimer = xTimerCreate( "buttonTimer", ( 40 / portTICK_PERIOD_MS), pdTRUE, 0, vButtonsTimerHandler);
//  xTimerStart(xButtonsTimer, 100 / portTICK_PERIOD_MS);

  /* install gpio isr service */
  gpio_install_isr_service(0);

  /* hook isr handler for specific gpio pin */
  gpio_isr_handler_add(ENC_A, ab_gpio_isr_handler, (void *) ENC_A);
  gpio_isr_handler_add(ENC_B, ab_gpio_isr_handler, (void *) ENC_B);
//  gpio_isr_handler_add(ENC_OK, ok_gpio_isr_handler, (void *) ENC_OK);

  xTaskCreate(&task_encoder, "encoder_task", 2048, NULL, 5, NULL);
}

int16_t enc_get_new_moves()
{
  int16_t last_state = steps;
  steps = 0;
  return last_state;
}

bool enc_pressed()
{
  return is_pressed;
}