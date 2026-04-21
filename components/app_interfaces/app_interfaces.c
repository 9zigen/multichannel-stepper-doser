#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

#include "driver/twai.h"
#include "esp_log.h"
#include "esp_system.h"

#include "app_events.h"
#include "app_interfaces.h"
#include "app_pumps.h"
#include "app_settings.h"

#define APP_INTERFACES_CAN_COMMAND_ID_BASE 0x200U
#define APP_INTERFACES_CAN_RUNTIME_ID_BASE 0x280U
#define APP_INTERFACES_CAN_BITRATE_KBIT 250U
#define APP_INTERFACES_CAN_QUEUE_LEN 16U
#define APP_INTERFACES_CAN_TASK_STACK 4096U
#define APP_INTERFACES_CAN_TASK_PRIO 5U

typedef enum {
    APP_INTERFACES_CMD_RELOAD = 0,
    APP_INTERFACES_CMD_SHUTDOWN,
    APP_INTERFACES_CMD_TX_RUNTIME,
} app_interfaces_command_type_t;

typedef enum {
    APP_INTERFACES_CAN_OP_RUN_MANUAL = 1,
    APP_INTERFACES_CAN_OP_STOP = 2,
    APP_INTERFACES_CAN_OP_CALIBRATION_START = 3,
    APP_INTERFACES_CAN_OP_CALIBRATION_STOP = 4,
} app_interfaces_can_operation_t;

typedef struct {
    app_interfaces_command_type_t type;
    pump_runtime_event_t runtime;
    TaskHandle_t requester;
    esp_err_t *result_ptr;
} app_interfaces_command_t;

static const char *TAG = "APP_INTERFACES";
static QueueHandle_t s_command_queue = NULL;
static TaskHandle_t s_task_handle = NULL;
static esp_event_handler_instance_t s_pump_runtime_event_ctx;
static esp_event_handler_instance_t s_system_event_ctx;
static bool s_initialized = false;
static bool s_can_started = false;
static uint16_t s_can_node_id = 1;

static uint16_t load_u16_le(const uint8_t *data)
{
    return (uint16_t)data[0] | ((uint16_t)data[1] << 8);
}

static void store_u16_le(uint16_t value, uint8_t *data)
{
    data[0] = (uint8_t)(value & 0xFFU);
    data[1] = (uint8_t)((value >> 8) & 0xFFU);
}

static uint16_t app_interfaces_can_node_id(void)
{
    for (uint8_t i = 0; i < MAX_NETWORKS; ++i) {
        network_t *network = get_networks_config(i);
        if (network == NULL || network->type != NETWORK_TYPE_CAN || !network->active || network->can_node_id == 0) {
            continue;
        }

        return network->can_node_id;
    }

    return 1;
}

static esp_err_t app_interfaces_can_stop(void)
{
    if (!s_can_started) {
        return ESP_OK;
    }

    esp_err_t err = twai_stop();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "Failed to stop CAN driver: %s", esp_err_to_name(err));
    }

    err = twai_driver_uninstall();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "Failed to uninstall CAN driver: %s", esp_err_to_name(err));
        return err;
    }

    s_can_started = false;
    ESP_LOGI(TAG, "CAN interface stopped");
    return ESP_OK;
}

static esp_err_t app_interfaces_can_start(void)
{
    const int32_t can_tx_pin = get_can_tx_pin();
    const int32_t can_rx_pin = get_can_rx_pin();

    if (can_tx_pin < 0 || can_rx_pin < 0) {
        ESP_LOGI(TAG, "CAN interface disabled in board configuration");
        return ESP_OK;
    }

    twai_general_config_t general_config =
        TWAI_GENERAL_CONFIG_DEFAULT((gpio_num_t)can_tx_pin, (gpio_num_t)can_rx_pin, TWAI_MODE_NORMAL);
    twai_timing_config_t timing_config = TWAI_TIMING_CONFIG_250KBITS();
    twai_filter_config_t filter_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

    general_config.tx_queue_len = 8;
    general_config.rx_queue_len = 8;

    esp_err_t err = twai_driver_install(&general_config, &timing_config, &filter_config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to install CAN driver: %s", esp_err_to_name(err));
        return err;
    }

    err = twai_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start CAN driver: %s", esp_err_to_name(err));
        (void)twai_driver_uninstall();
        return err;
    }

    s_can_started = true;
    s_can_node_id = app_interfaces_can_node_id();
    ESP_LOGI(TAG,
             "CAN interface started: tx=%ld rx=%ld node=%u bitrate=%uk",
             (long)can_tx_pin,
             (long)can_rx_pin,
             (unsigned)s_can_node_id,
             (unsigned)APP_INTERFACES_CAN_BITRATE_KBIT);
    return ESP_OK;
}

static esp_err_t app_interfaces_can_reload_internal(void)
{
    esp_err_t stop_result = app_interfaces_can_stop();
    if (stop_result != ESP_OK) {
        return stop_result;
    }

    return app_interfaces_can_start();
}

static void app_interfaces_can_publish_runtime(const pump_runtime_event_t *runtime)
{
    if (!s_can_started || runtime == NULL) {
        return;
    }

    twai_message_t message = {
        .identifier = APP_INTERFACES_CAN_RUNTIME_ID_BASE + s_can_node_id,
        .data_length_code = 8,
        .extd = 0,
        .rtr = 0,
    };

    message.data[0] = runtime->pump_id;
    message.data[1] = (uint8_t)runtime->state;
    message.data[2] = runtime->direction ? 1U : 0U;
    message.data[3] = 0U;

    float rpm = runtime->rpm;
    if (rpm < 0.0f) {
        rpm = 0.0f;
    }
    const uint16_t rpm_x10 = rpm > 6553.5f ? UINT16_MAX : (uint16_t)(rpm * 10.0f + 0.5f);
    store_u16_le(rpm_x10, &message.data[4]);

    uint32_t remaining_seconds = runtime->time / PUMP_TIMER_UNIT_IN_SEC;
    if (remaining_seconds > UINT16_MAX) {
        remaining_seconds = UINT16_MAX;
    }
    store_u16_le((uint16_t)remaining_seconds, &message.data[6]);

    esp_err_t err = twai_transmit(&message, 0);
    if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
        ESP_LOGW(TAG, "Failed to publish CAN runtime frame: %s", esp_err_to_name(err));
    }
}

static void app_interfaces_can_handle_command(const twai_message_t *message)
{
    if (message == NULL || message->extd || message->rtr || message->data_length_code < 2) {
        return;
    }

    const uint32_t command_id = APP_INTERFACES_CAN_COMMAND_ID_BASE + s_can_node_id;
    if (message->identifier != APP_INTERFACES_CAN_COMMAND_ID_BASE && message->identifier != command_id) {
        return;
    }

    const app_interfaces_can_operation_t operation = (app_interfaces_can_operation_t)message->data[0];
    const uint8_t pump_id = message->data[1];
    const bool direction = message->data_length_code > 2 ? (message->data[2] != 0) : true;
    const float rpm =
        message->data_length_code >= 6 ? ((float)load_u16_le(&message->data[4]) / 10.0f) : 0.0f;
    const int32_t duration_minutes =
        message->data_length_code >= 8 ? (int32_t)load_u16_le(&message->data[6]) : 0;

    switch (operation) {
        case APP_INTERFACES_CAN_OP_RUN_MANUAL:
            (void)run_pump_manual(pump_id, rpm, direction, duration_minutes);
            break;
        case APP_INTERFACES_CAN_OP_STOP:
            (void)run_pump_manual(pump_id, 1.0f, direction, 0);
            break;
        case APP_INTERFACES_CAN_OP_CALIBRATION_START:
            run_pump_calibration(pump_id, true, rpm > 0.0f ? rpm : 1.0f, direction);
            break;
        case APP_INTERFACES_CAN_OP_CALIBRATION_STOP:
            run_pump_calibration(pump_id, false, rpm, direction);
            break;
        default:
            ESP_LOGW(TAG, "Ignoring unknown CAN operation %u", (unsigned)operation);
            break;
    }
}

static void app_interfaces_task(void *arg)
{
    (void)arg;

    for (;;) {
        app_interfaces_command_t command = {0};
        if (xQueueReceive(s_command_queue, &command, s_can_started ? 0 : portMAX_DELAY) == pdTRUE) {
            esp_err_t result = ESP_OK;

            switch (command.type) {
                case APP_INTERFACES_CMD_RELOAD:
                    result = app_interfaces_can_reload_internal();
                    break;
                case APP_INTERFACES_CMD_SHUTDOWN:
                    result = app_interfaces_can_stop();
                    break;
                case APP_INTERFACES_CMD_TX_RUNTIME:
                    app_interfaces_can_publish_runtime(&command.runtime);
                    break;
            }

            if (command.requester != NULL && command.result_ptr != NULL) {
                *command.result_ptr = result;
                xTaskNotifyGive(command.requester);
            }

            continue;
        }

        if (!s_can_started) {
            continue;
        }

        twai_message_t message = {0};
        esp_err_t err = twai_receive(&message, pdMS_TO_TICKS(100));
        if (err == ESP_OK) {
            app_interfaces_can_handle_command(&message);
        } else if (err != ESP_ERR_TIMEOUT) {
            ESP_LOGW(TAG, "CAN receive error: %s", esp_err_to_name(err));
        }
    }
}

static esp_err_t app_interfaces_send_command(app_interfaces_command_t *command, TickType_t timeout)
{
    if (command == NULL || s_command_queue == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    if (xQueueSend(s_command_queue, command, timeout) != pdTRUE) {
        return ESP_ERR_TIMEOUT;
    }

    return ESP_OK;
}

static void app_interfaces_on_pump_runtime_event(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_base;

    if (event_id != PUMP_RUNTIME_DATA || event_data == NULL || s_command_queue == NULL) {
        return;
    }

    app_interfaces_command_t command = {
        .type = APP_INTERFACES_CMD_TX_RUNTIME,
        .runtime = *(const pump_runtime_event_t *)event_data,
        .requester = NULL,
        .result_ptr = NULL,
    };

    if (xQueueSend(s_command_queue, &command, 0) != pdTRUE) {
        ESP_LOGW(TAG, "Dropping CAN runtime event because the queue is full");
    }
}

static void app_interfaces_on_system_event(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    (void)arg;
    (void)event_base;
    (void)event_data;

    if (event_id != SHUTTING_DOWN || s_command_queue == NULL) {
        return;
    }

    app_interfaces_command_t command = {
        .type = APP_INTERFACES_CMD_SHUTDOWN,
        .requester = NULL,
        .result_ptr = NULL,
    };

    (void)xQueueSend(s_command_queue, &command, 0);
}

esp_err_t app_interfaces_init(void)
{
    if (s_initialized) {
        return ESP_OK;
    }

    s_command_queue = xQueueCreate(APP_INTERFACES_CAN_QUEUE_LEN, sizeof(app_interfaces_command_t));
    if (s_command_queue == NULL) {
        return ESP_ERR_NO_MEM;
    }

    BaseType_t task_result =
        xTaskCreate(app_interfaces_task, "app_interfaces", APP_INTERFACES_CAN_TASK_STACK, NULL, APP_INTERFACES_CAN_TASK_PRIO, &s_task_handle);
    if (task_result != pdPASS) {
        vQueueDelete(s_command_queue);
        s_command_queue = NULL;
        return ESP_ERR_NO_MEM;
    }

    app_events_register_handler(PUMP_RUNTIME_DATA, NULL, app_interfaces_on_pump_runtime_event, &s_pump_runtime_event_ctx);
    app_events_register_handler(SHUTTING_DOWN, NULL, app_interfaces_on_system_event, &s_system_event_ctx);
    s_initialized = true;

    return app_interfaces_reload();
}

esp_err_t app_interfaces_reload(void)
{
    if (!s_initialized || s_task_handle == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    esp_err_t result = ESP_OK;
    app_interfaces_command_t command = {
        .type = APP_INTERFACES_CMD_RELOAD,
        .requester = xTaskGetCurrentTaskHandle(),
        .result_ptr = &result,
    };

    esp_err_t err = app_interfaces_send_command(&command, pdMS_TO_TICKS(250));
    if (err != ESP_OK) {
        return err;
    }

    if (ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(1000)) == 0) {
        return ESP_ERR_TIMEOUT;
    }

    return result;
}
