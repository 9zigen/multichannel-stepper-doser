#include <stdio.h>
#include <string.h>
#include <esp_log.h>
#include <esp_system.h>
#include "esp_timer.h"
#include "tmc2209.h"


#if defined(RMT_LEGACY)
#include <driver/rmt.h>
#else
#include <driver/rmt_tx.h>
#define STEP_MOTOR_RESOLUTION_HZ 1000000
#endif

static portMUX_TYPE spinlock = portMUX_INITIALIZER_UNLOCKED;

static SemaphoreHandle_t uart_tx_sem;
static SemaphoreHandle_t uart_rx_sem;

static SemaphoreHandle_t datagram_tx_sem;
static SemaphoreHandle_t datagram_rx_sem;

static gptimer_handle_t gptimer[] = {NULL, NULL, NULL, NULL};
static int64_t steps_left[] = {0, 0, 0, 0};

static const uint32_t timer_N = sizeof(gptimer) / sizeof(gptimer[0]); // number of timers

#if !defined(RMT_LEGACY)
/* RMT Uniform */
rmt_transmit_config_t tx_config = { .loop_count = 0 };
stepper_motor_uniform_encoder_config_t uniform_encoder_config = { .resolution = STEP_MOTOR_RESOLUTION_HZ };
rmt_encoder_handle_t uniform_motor_encoder = NULL;
#endif

static const char* TAG = "TMC2209";

static void print_bytes_in_lines(uint8_t *array, size_t size)
{
    for (size_t i = 0; i < size; i+=8) {
        printf("%02d-%02d: ", i, i + 8);
        for (size_t j = 0; j < 8 && i + j < size; j++) {
            printf("%02X ", array[i + j]);
        }
        printf("\n");
    }
}

/**
 * Calculate and write CRC byte
 * @param datagram
 * @param datagram_length
 */
static void calc_crc(uint8_t* datagram, uint8_t datagram_length)
{
    int i,j;
    uint8_t *crc = datagram + (datagram_length - 1); // CRC located in last byte of message
    uint8_t currentByte;
    *crc = 0;
    for (i = 0; i < (datagram_length - 1); i++) {    // Execute for all bytes of a message
        currentByte = datagram[i];                  // Retrieve a byte to be sent from Array
        for (j = 0; j < 8; j++) {
            if ((*crc >> 7) ^ (currentByte & 0x01)) // update CRC based result of XOR operation
                *crc = (*crc << 1) ^ 0x07;
            else
                *crc = (*crc << 1);
            currentByte = currentByte >> 1;
        } // for CRC bit
    } // for message byte
}


/**
 * Write datagram to register via UART
 * @param cfg
 * @param datagram
 * @param len
 */
static esp_err_t write_register(tms2209_t *cfg, uint8_t* datagram, uint8_t len)
{
    if (cfg == NULL)
    {
        ESP_LOGE(TAG, "uart_write_bytes: cfg is null");
        return ESP_ERR_INVALID_ARG;
    }

    esp_err_t ret = ESP_FAIL;
    if (pdTRUE == xSemaphoreTake(uart_tx_sem, 100 / portTICK_PERIOD_MS))
    {
        ret = uart_flush(cfg->uart);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "uart_flush: failed");
        }

        uart_write_bytes(cfg->uart, (const uint8_t *) datagram, len);
        ret = uart_wait_tx_done(cfg->uart, UART_TIMEOUT_MS);
        if (ret != ESP_OK)
        {
            ESP_LOGE(TAG, "uart_wait_tx_done: failed");
            xSemaphoreGive(uart_tx_sem);
            return ret;
        }
        xSemaphoreGive(uart_tx_sem);
        return ret;
    } else {
        ESP_LOGE(TAG, "uart_write_bytes: timeout");
    }
    return ESP_FAIL;
}


/**
 * Read datagram from register via UART
 * @param cfg
 * @param datagram
 */
static esp_err_t read_register(tms2209_t *cfg, uint8_t *datagram)
{
    uint8_t *data = malloc(TMC2209_REG_DATA_LEN + TMC2209_REG_REQ_LEN);
    if (data == NULL)
    {
        ESP_LOGE(TAG, "Memory allocation error for read_register: data");
        return ESP_ERR_NO_MEM;
    }
    int32_t received = uart_read_bytes(cfg->uart, data, TMC2209_REG_DATA_LEN + TMC2209_REG_REQ_LEN, UART_TIMEOUT_MS);
    uart_flush(cfg->uart);

    // if (received > 0) {
    //     ESP_LOG_BUFFER_HEX(TAG, data, received);
    // }

    if (received == TMC2209_REG_DATA_LEN + TMC2209_REG_REQ_LEN)
    {
        memcpy(datagram, data + TMC2209_REG_REQ_LEN, TMC2209_REG_DATA_LEN);
    }
    else
    {
        ESP_LOGE(TAG, "UART read error len: %ld", received);
        free(data);
        return ESP_FAIL;
    }
    free(data);
    return ESP_OK;
}


/**
 * Write datagram
 * @param cfg
 * @param address
 * @param reg
 * @param data
 */
esp_err_t write_datagram(tms2209_t *cfg, uint8_t address, uint8_t reg, uint32_t data)
{
    esp_err_t ret;
    uint8_t *datagram = malloc(TMC2209_DATAGRAM_LEN);
    if (datagram == NULL)
    {
        ESP_LOGE(TAG, "Memory allocation error for write_datagram: datagram");
        return ESP_ERR_NO_MEM;
    }

    datagram[0] = SYNC;                                   // sync + reserved
    datagram[1] = address;                                // 8 bit slave address (0-3)
    datagram[2] = reg | 0x80;                             // 7 bit register and write bit (1)
    datagram[3] = (uint8_t)((data >> 24) & 0xFF);         // data byte 3
    datagram[4] = (uint8_t)((data >> 16) & 0xFF);         // data byte 2
    datagram[5] = (uint8_t)((data >> 8) & 0xFF);          // data byte 1
    datagram[6] = (uint8_t)(data & 0xFF);                 // data byte 0
    calc_crc(datagram, TMC2209_DATAGRAM_LEN);   // CRC

    ret = write_register(cfg, datagram, TMC2209_DATAGRAM_LEN);

    ESP_LOGD(TAG, "write_datagram addr: %u reg: %u", address, reg);
    // ESP_LOG_BUFFER_HEX(TAG, datagram, TMC2209_DATAGRAM_LEN);

    free(datagram);
    return ret;
}


/**
 * Read datagram
 * @param cfg
 * @param address
 * @param reg
 * @return
 */
uint32_t read_datagram(tms2209_t *cfg, uint8_t address, uint8_t reg)
{
    esp_err_t ret;
    uint32_t data = 0;
    uint8_t *request_datagram = malloc(TMC2209_REG_REQ_LEN);
    uint8_t *response_datagram = malloc(TMC2209_REG_DATA_LEN);

    if (request_datagram == NULL || response_datagram == NULL) {
        ESP_LOGE(TAG, "Memory allocation error for read_datagram");
        free(request_datagram);
        free(response_datagram);
        return 0;
    }

    request_datagram[0] = SYNC;     // sync + reserved
    request_datagram[1] = address;  // 8 bit slave address (0-3)
    request_datagram[2] = reg;      // 7 bit register and read bit (0)
    calc_crc(request_datagram, TMC2209_REG_REQ_LEN);  // CRC

    ret = write_register(cfg, request_datagram, TMC2209_REG_REQ_LEN);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "write_register error %d", ret);
        free(request_datagram);
        free(response_datagram);
        return 0;
    }

    ret = read_register(cfg, response_datagram);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "read_register error %d", ret);
        free(request_datagram);
        free(response_datagram);
        return 0;
    }

    ESP_LOGD(TAG, "read_datagram addr: %u reg: %u", address, reg);
    // ESP_LOG_BUFFER_HEX(TAG, request_datagram, TMC2209_REG_REQ_LEN);
    // ESP_LOG_BUFFER_HEX(TAG, response_datagram, TMC2209_REG_REQ_LEN);

    uint8_t response_datagram_crc = response_datagram[7];
    calc_crc(response_datagram, 8);
    if (response_datagram[7] == response_datagram_crc)
    {
        data |= (uint32_t)response_datagram[3] << 24;
        data |= (uint32_t)response_datagram[4] << 16;
        data |= (uint32_t)response_datagram[5] << 8;
        data |= (uint32_t)response_datagram[6];
    } else {
        ESP_LOGE(TAG, "CRC incorrect %u %u", response_datagram[7], response_datagram_crc);
    }

    free(request_datagram);
    free(response_datagram);
    return data;
}

/**
 * @brief callback function for timers
 *
 * @param timer timer handle
 * @param edata event data
 * @param user_ctx user context
 * @return true - if high priority task was woken up; false - otherwise
 */
static bool clk_timer_callback(gptimer_handle_t timer, const gptimer_alarm_event_data_t* edata, void* user_ctx)
{
    BaseType_t high_task_awoken = pdFALSE;

    callback_arg_t cb_arg = *(callback_arg_t*)user_ctx;
    gpio_num_t step_pin = cb_arg.step_pin;
    uint32_t motor_num = cb_arg.motor_num;

    if (steps_left[motor_num] > 0)
    {
        if (gpio_get_level(step_pin) == 0)
            gpio_set_level(step_pin, 1);
        else
            gpio_set_level(step_pin, 0);

        portENTER_CRITICAL(&spinlock);
        steps_left[motor_num]--;
        portEXIT_CRITICAL(&spinlock);
    }
    else
        ESP_ERROR_CHECK(gptimer_stop(timer));

    return (high_task_awoken == pdTRUE);
}


/**
 * @brief initialize TMC2209 UART and timers
 *
 * @param cfg struct with TMC2209 connection parameters
 */
void tmc2209_init(tms2209_t *cfg)
{
    // configure UART
    uart_config_t uart_config = {
        .baud_rate = cfg->baud_rate,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_2,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .rx_flow_ctrl_thresh = 0,
        .source_clk = UART_SCLK_DEFAULT
    };

    ESP_ERROR_CHECK(uart_driver_install(cfg->uart, UART_HW_FIFO_LEN(cfg->uart) * 2, 0, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(cfg->uart, &uart_config));
    ESP_ERROR_CHECK(uart_set_pin(cfg->uart, cfg->tx_pin, cfg->rx_pin, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));

    uart_tx_sem = xSemaphoreCreateBinary();
    uart_rx_sem = xSemaphoreCreateBinary();
    datagram_tx_sem = xSemaphoreCreateBinary();
    datagram_rx_sem = xSemaphoreCreateBinary();

    xSemaphoreGive(uart_tx_sem);
    xSemaphoreGive(uart_rx_sem);
    xSemaphoreGive(datagram_tx_sem);
    xSemaphoreGive(datagram_rx_sem);

    /* allocate memory for callback arguments */
    callback_arg_t* cb_arg = malloc(sizeof(callback_arg_t) * timer_N);

    for (uint8_t i = 0; i < 4; i++)
    {
        // configure step and dir pins

        gpio_config_t io_conf;
        io_conf.intr_type = GPIO_INTR_DISABLE;
        io_conf.mode = GPIO_MODE_INPUT_OUTPUT;
        io_conf.pin_bit_mask = ((1ULL << cfg->step_pin[i]) | (1ULL << cfg->dir_pin[i]) | (1ULL << cfg->en_pin[i]));
        io_conf.pull_down_en = 0;
        io_conf.pull_up_en = 0;
        gpio_config(&io_conf);

        vTaskDelay(pdMS_TO_TICKS(100));

        /* GSTAT Clear errors */
        tmc2209_gstat_reg_t gstat = tmc2209_get_gstat(cfg, i);
        ESP_LOGI(TAG, "Motor %u get GSTAT: 0x%lx", i, gstat.value);

        tmc2209_set_gstat(cfg, i, &gstat);
        ESP_LOGI(TAG, "Motor %u set GSTAT: 0x%lx", i, gstat.value);

        /* IFCNT: 1 */
        tmc2209_ifcnt_reg_t ifcnt_reg = tmc2209_get_ifcnt(cfg, i);
        ESP_LOGI(TAG, "Motor %u get IFCNT: %d (1)", i, ifcnt_reg.count);

        /* GCONF */
        tmc2209_gconf_reg_t gconf = tmc2209_get_gconf(cfg, i);
        ESP_LOGI(TAG, "Motor %u get initial GCONF: 0x%lx", i, gconf.value);
        gconf.I_scale_analog = 0;
        gconf.internal_Rsense = 0;
        gconf.en_spreadcycle = 0;
        gconf.pdn_disable = 1;
        gconf.mstep_reg_select = 1;
        gconf.multistep_filt = 1;
        gconf.test_mode = 0;

        /* GCONF */
        tmc2209_set_gconf(cfg, i, &gconf);
        ESP_LOGI(TAG, "Motor %u set GCONF: 0x%lx", i, gconf.value);

        /* NODECONF */
        tmc2209_nodeconf_reg_t nodeconf = {0};
        nodeconf.conf = 4; /* 3*8 bit times */
        tmc2209_set_nodeconf(cfg, i, &nodeconf);
        ESP_LOGI(TAG, "Motor %u set NODECONF: 0x%lx", i, nodeconf.value);

        /* IFCNT: 2 */
        ifcnt_reg = tmc2209_get_ifcnt(cfg, i);
        ESP_LOGI(TAG, "Motor %u get IFCNT: %d (2)", i, ifcnt_reg.count);

        gconf = tmc2209_get_gconf(cfg, i);
        ESP_LOGI(TAG, "Motor %u check GCONF: 0x%lx", i, gconf.value);

        tmc2209_set_current(cfg, i, 400, 10);
        ESP_LOGI(TAG, "Motor %u set current: run: %u hold: %u", i, 400, 10);

        /* IFCNT: 3 */
        ifcnt_reg = tmc2209_get_ifcnt(cfg, i);
        ESP_LOGI(TAG, "Motor %u get IFCNT: %d (3)", i, ifcnt_reg.count);

        tmc2209_set_microsteps_per_step(cfg, i, cfg->micro_steps[i]);
        ESP_LOGI(TAG, "Motor %u set micro steps per step: %u", i, cfg->micro_steps[i]);

        /* IFCNT: 4 */
        ifcnt_reg = tmc2209_get_ifcnt(cfg, i);
        ESP_LOGI(TAG, "Motor %u get IFCNT: %d (4)", i, ifcnt_reg.count);

        /* IFCNT: 5 */
        ifcnt_reg = tmc2209_get_ifcnt(cfg, i);
        ESP_LOGI(TAG, "Motor %u get IFCNT: %d (5)", i, ifcnt_reg.count);

        TMC2209_enable(cfg, i, 1);
        TMC2209_set_dir(cfg, i, CW_DIR);

        /* Configure RMT */
#if !defined(RMT_LEGACY)
        rmt_tx_channel_config_t tx_chan_config = {
                .clk_src = RMT_CLK_SRC_DEFAULT,
                .gpio_num = cfg->step_pin[i],
                .mem_block_symbols = 64,
                .resolution_hz = 1000000,
                .trans_queue_depth = 1
        };
        ESP_ERROR_CHECK(rmt_new_tx_channel(&tx_chan_config, &cfg->rmt_channel[i]));
        ESP_ERROR_CHECK(rmt_new_stepper_motor_uniform_encoder(&uniform_encoder_config, &uniform_motor_encoder));
        ESP_ERROR_CHECK(rmt_enable(cfg->rmt_channel[i]));
#else
//        rmt_driver_install(cfg->rmt_channel[i], 0, 0);
//        rmt_config_t config = RMT_DEFAULT_CONFIG_TX(cfg->step_pin[i], cfg->rmt_channel[i]);
//        rmt_config(&config);
#endif

        // configure timers

        gptimer_config_t timer_config = {
            .clk_src = GPTIMER_CLK_SRC_DEFAULT,
            .direction = GPTIMER_COUNT_UP,
            .resolution_hz = 1000000 // 1 us
        };

        ESP_ERROR_CHECK(gptimer_new_timer(&timer_config, &gptimer[i]));

        gptimer_alarm_config_t alarm_config = {
            .alarm_count = 1000000, // 1 s
            .reload_count = 0,
            .flags.auto_reload_on_alarm = true
        };

        ESP_ERROR_CHECK(gptimer_set_alarm_action(gptimer[i], &alarm_config));

        gptimer_event_callbacks_t timer_cbs = {
            .on_alarm = clk_timer_callback
        };

        cb_arg[i].step_pin = cfg->step_pin[i];
        cb_arg[i].motor_num = i;

        ESP_ERROR_CHECK(gptimer_register_event_callbacks(gptimer[i], &timer_cbs, (void*)&cb_arg[i]));
        ESP_ERROR_CHECK(gptimer_enable(gptimer[i]));
        TMC2209_enable(cfg, i, 0); // disable motor
    }
}


// deinit TMC UART and timers
void TMC2209_deinit(tms2209_t *cfg)
{
    for (uint32_t i = 0; i < timer_N; i++)
    {
        ESP_ERROR_CHECK(gptimer_disable(gptimer[i]));
        ESP_ERROR_CHECK(gptimer_del_timer(gptimer[i]));
    }

    ESP_ERROR_CHECK(uart_driver_delete(cfg->uart));
}


/**
 * @brief set enable pin
 *
 * @param cfg struct with TMC2209 connection parameters
 * @param motor_num motor number
 * @param enable 0 - enable, 1 - disable
 */
void TMC2209_enable(tms2209_t *cfg, uint32_t motor_num, uint32_t enable)
{
    if (enable == 0)
        gpio_set_level(cfg->en_pin[motor_num], 0);
    else if (enable == 1)
        gpio_set_level(cfg->en_pin[motor_num], 1);
}


/**
 * @brief set direction pin
 *
 * @param cfg struct with TMC2209 connection parameters
 * @param motor_num motor number
 * @param dir direction (CW_DIR or CCW_DIR)
 */
void TMC2209_set_dir(tms2209_t *cfg, uint32_t motor_num, uint32_t dir)
{
    if (dir == CW_DIR)
        gpio_set_level(cfg->dir_pin[motor_num], 0);
    else if (dir == CCW_DIR)
        gpio_set_level(cfg->dir_pin[motor_num], 1);
}


/**
 * @brief set period for step signal
 *
 * @param motor_num motor number
 * @param period_us period in us
 */
void TMC2209_set_period(uint32_t motor_num, uint32_t period_us)
{
    if (period_us == 0) {
        ESP_LOGE(TAG, "period_us must be greater than zero");
        return;
    }

    if (period_us < 200) {
        ESP_LOGW(TAG, "period_us too small, motor might not work properly");
    }

    period_us = period_us / 2; // 1 period = 2 gpio switches

    gptimer_alarm_config_t alarm_config = {
        .alarm_count = period_us,
        .reload_count = 0,
        .flags.auto_reload_on_alarm = true
    };

    ESP_LOGI(TAG, "period_us = %lu", period_us);
    ESP_ERROR_CHECK(gptimer_set_alarm_action(gptimer[motor_num], &alarm_config));
}

/**
 * @brief start/stop step signal
 *
 * @param cfg struct with TMC2209 connection parameters
 * @param motor_num motor number
 * @param start 0 - stop, 1 - start
 */
void TMC2209_start(tms2209_t *cfg, uint32_t motor_num, uint32_t start)
{
    if (start == 0)
    {
        ESP_ERROR_CHECK(gptimer_stop(gptimer[motor_num]));
        gpio_set_level(cfg->step_pin[motor_num], 0);
    }
    else if (start == 1)
    {
        ESP_ERROR_CHECK(gptimer_start(gptimer[motor_num]));
    }
}

void TMC2209_set_steps(tms2209_t *cfg, uint32_t motor_num, uint32_t steps)
{
    if (motor_num >= timer_N) {
        return;
    }

    portENTER_CRITICAL(&spinlock);
    steps_left[motor_num] = 2 * steps;
    portEXIT_CRITICAL(&spinlock);
}

/**
 * @brief move all motors by desired number of steps with desired period and direction (sign in steps variable)
 *
 * @param cfg struct with TMC2209 connection parameters
 * @param steps array of steps for each motor
 * @param period_us array of periods for each motor
 */
void TMC2209_step_move(tms2209_t *cfg, int64_t* steps, uint32_t* period_us)
{
    for (uint32_t motor_num = 0; motor_num < timer_N; motor_num++)
    {
        TMC2209_start(cfg, motor_num, 0);

        // set direction
        if (steps[motor_num] < 0)
        {
            TMC2209_set_dir(cfg, motor_num, 0);
            steps[motor_num] = -steps[motor_num];
        }
        else
            TMC2209_set_dir(cfg, motor_num, 1);

        // set period
        TMC2209_set_period(motor_num, period_us[motor_num]);

        // set number of steps
        portENTER_CRITICAL(&spinlock);
        steps_left[motor_num] = 2 * steps[motor_num];
        portEXIT_CRITICAL(&spinlock);
    }

    // start all motors one by one
    for (uint32_t motor_num = 0; motor_num < timer_N; motor_num++) {
        TMC2209_start(cfg, motor_num, 1);
    }

    bool end_wait = false;

    // wait until all motors stop
    while (end_wait == false)
    {
        int64_t steps_left_status = 0;

        for (uint32_t motor_num = 0; motor_num < timer_N; motor_num++)
            steps_left_status = steps_left_status + steps_left[motor_num];

        if (steps_left_status <= 0)
            end_wait = true;

        vTaskDelay(1);
    }

    // for debug
    for (uint32_t motor_num = 0; motor_num < timer_N; motor_num++) {
        ESP_LOGI(TAG, "%lu: %lld", motor_num, steps_left[motor_num] / 2);
    }
}

#if defined(RMT_LEGACY)
esp_err_t TMC2209_steps(tms2209_t *cfg, uint8_t motor_num, uint32_t steps, uint32_t signal_duration, uint8_t async)
{
    esp_err_t ret = ESP_OK;

    // Allocate memory for the RMT items
    rmt_item32_t* items = (rmt_item32_t*) pvPortMalloc(sizeof(rmt_item32_t) * steps);
    if (items == NULL) {
        ESP_LOGE("RMT", "Failed to allocate memory for RMT items");
        return ESP_FAIL ;
    }

    if (signal_duration < 1000) {
        signal_duration = 1000;
    } else if (signal_duration > 10000) {
        signal_duration = 10000;
    }

    // Configure the RMT items
    for (int i = 0; i < steps; i++) {
        items[i].level0 = 1;
        items[i].duration0 = signal_duration;
        items[i].level1 = 0;
        items[i].duration1 = signal_duration;
    }

    ret = rmt_write_items(cfg->rmt_channel[motor_num], items, (int)steps, !async);

    // Free the memory for the RMT items
    vPortFree(items);

    return ret;
}
#else
esp_err_t TMC2209_steps(tms2209_t *cfg, uint8_t motor_num, int steps, uint32_t steps_second)
{
    esp_err_t ret = ESP_OK;

    tx_config.loop_count = steps;
    ret = rmt_transmit(cfg->rmt_channel[motor_num], uniform_motor_encoder, &steps_second, sizeof(steps_second), &tx_config);
    rmt_tx_wait_all_done(cfg->rmt_channel[motor_num], -1);
    return ret;
}
#endif


/**
 * @brief move continuously with desired speed
 *
 * @param cfg struct with TMC2209 connection parameters
 * @param address TMC2209 address
 * @param speed speed in % (from -100 to 100)
 */
void TMC2209_uart_move(tms2209_t *cfg, uint8_t address, int32_t speed)
{
    if (speed > 100) {
        speed = 100;
    } else if (speed < -100) {
        speed = -100;
    }

    float speed_percentage = (float)speed / 100.0f;
    speed_percentage = speed_percentage * 8388607.0f;
    speed = (int32_t)(((float)speed / 100.0f) * 8388607.0f); // 8388607 = 2^23 - 1 (max value for VACTUAL)
    ESP_LOGI(TAG, "Speed: %ld", speed);
    write_datagram(cfg, address, VACTUAL, speed);
}


/**
 * @brief get position (based on output voltage phase)
 *
 * @param cfg struct with TMC2209 connection parameters
 * @param address TMC2209 address
 * @return position
 */
int32_t TMC2209_uart_get_position(tms2209_t *cfg, uint8_t address)
{
    int32_t pos = read_datagram(cfg, address, MSCNT);

    return pos;
}





/**
 * @brief Set RMS current in mA
 * Equation from data sheet
 * I_rms = (CS+1)/32 * V_fs/(R_sense+30mOhm) * 1/sqrt(2)      --- or 20??
 * Solve for CS ->
 * CS = 32*sqrt(2)*I_rms*(R_sense+30mOhm)/V_fs - 1
 *
 * @param handle stepper_driver_t type object
 * @param milliampere_run Current in milliampere for IRUN
 * @param percent_hold Current for IHOLD in percentage of IRUN
 */
esp_err_t tmc2209_set_current(tms2209_t *cfg, uint8_t motor_num, uint16_t milliampere_run, uint8_t percent_hold)
{

    tmc2209_chopconf_reg_t chopconf_reg;
    chopconf_reg.value = read_datagram(cfg, motor_num, CHOPCONF);
    ESP_LOGI(TAG, "Old CHOPCONF 0x%lx", chopconf_reg.value);

    tmc2209_ihold_irun_reg_t ihold_irun_reg;
    ihold_irun_reg.value = 0;
    ihold_irun_reg.iholddelay = 2;
    ESP_LOGI(TAG, "Old IHOLD_IRUN 0x%lx", ihold_irun_reg.value);


    uint32_t cs_run = 32.0 * 1.41421f * ((float)milliampere_run / 1000.0) * ((TMC2209_R_SENSE + 30.0)  / 325.0) - 1;
    uint32_t cs_hold = (cs_run * percent_hold) / 100;
    ESP_LOGI(TAG, "Calculated values for %u mA: IRUN=%lu IHOLD=%lu", milliampere_run, cs_run, cs_hold);
    if (cs_run < 16) { //  High sensitivity, low sense resistor voltage
        chopconf_reg.vsense = 1;
        cs_run = 32.0f * 1.41421f * ((float)milliampere_run / 1000.0) * ((TMC2209_R_SENSE + 30.0)  / 180.0) - 1;
        cs_hold = (cs_run * percent_hold) / 100;
        ESP_LOGI(TAG, "Recalculated values for %u mA: IRUN=%lu IHOLD=%lu", milliampere_run, cs_run, cs_hold);
    }
    else {
        chopconf_reg.vsense = 0;
    }

    ESP_LOGI(TAG, "New CHOPCONF 0x%lx", chopconf_reg.value);
    write_datagram(cfg, motor_num, CHOPCONF, chopconf_reg.value);

    ihold_irun_reg.irun = cs_run;
    ihold_irun_reg.ihold = cs_hold;

    ESP_LOGI(TAG, "New IHOLD_IRUN 0x%lx", ihold_irun_reg.value);
    write_datagram(cfg, motor_num, IHOLD_IRUN, ihold_irun_reg.value);

    esp_err_t ret = ESP_OK;
    return ret;
}

esp_err_t tmc2209_set_microsteps_per_step(tms2209_t *cfg, uint8_t motor_num, tmc2209_microsteps_t microsteps)
{
    esp_err_t ret = ESP_OK;

    tmc2209_chopconf_reg_t reg = tmc2209_get_chopconf(cfg, motor_num);
    reg.mres = microsteps;
    write_datagram(cfg, motor_num, CHOPCONF, reg.value);

    return ret;
}

esp_err_t tmc2209_set_toff(tms2209_t *cfg, uint8_t motor_num, uint8_t toff)
{
    esp_err_t ret = ESP_OK;

    tmc2209_chopconf_reg_t reg = tmc2209_get_chopconf(cfg, motor_num);
    reg.toff = toff;
    write_datagram(cfg, motor_num, CHOPCONF, reg.value);

    return ret;
}

/**
 * Load GCONF register value
 * @param cfg
 * @param motor_num
 * @return
 */
tmc2209_gconf_reg_t tmc2209_get_gconf(tms2209_t *cfg, uint8_t motor_num)
{
    tmc2209_gconf_reg_t reg;
    reg.value = read_datagram(cfg, motor_num, GCONF);
    return reg;
}

/**
 * Set GCONF register value
 * @param cfg
 * @param motor_num
 * @return
 */
void tmc2209_set_gconf(tms2209_t *cfg, uint8_t motor_num, tmc2209_gconf_reg_t *reg)
{
    write_datagram(cfg, motor_num, GCONF, reg->value);
}

/**
 * Load GSTAT register value
 * @param cfg
 * @param motor_num
 * @return
 */
tmc2209_gstat_reg_t tmc2209_get_gstat(tms2209_t *cfg, uint8_t motor_num)
{
    tmc2209_gstat_reg_t reg;
    reg.value = read_datagram(cfg, motor_num, GSTAT);
    return reg;
}

/**
 * Set GSTAT register value
 * @param cfg
 * @param motor_num
 * @return
 */
void tmc2209_set_gstat(tms2209_t *cfg, uint8_t motor_num, tmc2209_gstat_reg_t *reg)
{
    write_datagram(cfg, motor_num, GSTAT, reg->value);
}

/**
 * Load IFCNT register value
 * @param cfg
 * @param motor_num
 * @return
 */
tmc2209_ifcnt_reg_t tmc2209_get_ifcnt(tms2209_t *cfg, uint8_t motor_num)
{
    tmc2209_ifcnt_reg_t reg;
    reg.value = read_datagram(cfg, motor_num, IFCNT);
    return reg;
}

/**
 * Set NODECONF register value
 * @param cfg
 * @param motor_num
 * @return
 */
void tmc2209_set_nodeconf(tms2209_t *cfg, uint8_t motor_num, tmc2209_nodeconf_reg_t *reg)
{
    write_datagram(cfg, motor_num, NODECONF, reg->value);
}

/**
 * Load CHOPCONF register value
 * @param cfg
 * @param motor_num
 * @return
 */
tmc2209_chopconf_reg_t tmc2209_get_chopconf(tms2209_t *cfg, uint8_t motor_num)
{
    tmc2209_chopconf_reg_t reg;
    reg.value = read_datagram(cfg, motor_num, CHOPCONF);
    return reg;
}

/**
 * Motor moves with the velocity given by VACTUAL. Step pulses can be monitored via INDEX output. The motor direction
 * is controlled by the sign of VACTUAL.
 * @param cfg
 * @param speed
 * @return
 */
esp_err_t tmc2208_set_vactual(tms2209_t *cfg, uint8_t motor_num, int32_t speed)
{
    esp_err_t ret = ESP_OK;
    tmc2209_vactual_reg_t reg;
    reg.actual = speed;
    write_datagram(cfg, motor_num, VACTUAL, reg.actual);
    return ret;
}
