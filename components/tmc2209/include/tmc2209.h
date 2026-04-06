#pragma once

/**
 * @file AS5600.c
 * @author JanG175
 * @brief ESP IDF component for the TMC2209
 *
 * @copyright Apache 2.0
 */

#include <stdio.h>
#include "driver/gptimer.h"
#include "driver/gpio.h"
#include "driver/uart.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "tmc2209_reg.h"

#define RMT_LEGACY 1
#if defined(RMT_LEGACY) && RMT_LEGACY
#include <driver/rmt.h>
#else
#include <driver/rmt_tx.h>
#endif

#define GCONF        0x00    // R/W    Global configuration flags
#define GSTAT        0x01    // R/W    (W clears) Global status flags
#define IFCNT        0x02    // R      Counter for write access
#define NODECONF    0x03    // W      Delay for read access
#define OTP_PROG     0x04    // W      Write access programs OTP memory
#define OTP_READ     0x05    // R      Access to OTP memory
#define IOIN         0x06    // R      Reads the state of all input pins
#define FACTORY_CONF 0x07    // R/W    FCLKTRIM and OTTRIM defaults
#define IHOLD_IRUN   0x10    // W      Driver current control
#define TPOWERDOWN   0x11    // W      Delay time to motor current power down
#define TSTEP        0x12    // R      Actual measured time between two microsteps
#define TPWMTHRS     0x13    // W      Upper velocity for StealthChop voltage mode
#define VACTUAL      0x22    // W      Moving the motor by UART control.
#define MSCNT        0x6A    // R      Microstep counter
#define MSCURACT     0x6B    // R      Actual microstep current
#define CHOPCONF     0x6C    // R/W    Chopper and driver configuration
#define DRV_STATUS   0x6F    // R      Driver status flags and current level read
#define PWMCONF	     0x70    // R/W    StealthChop PWM chopper configuration
#define PWM_SCALE    0x71    // R      Results of StealthChop amplitude regulator
#define PWM_AUTO     0x72    // R      Generated values for PWM_GRAD/PWM_OFS

#define SYNC         0x05   // reversed: sync [1010] + reserved [0000]

#define TIMER_GROUP TIMER_GROUP_0
#define TIMER_ID TIMER_0

#define UART_TIMEOUT_MS (1000 / portTICK_PERIOD_MS)

#define CW_DIR 0
#define CCW_DIR 1

#define FULL_ROT 200

#define TMC2209_R_SENSE   220.0 // mOhm

#define TMC2209_REG_REQ_LEN 4
#define TMC2209_REG_DATA_LEN 8
#define TMC2209_DATAGRAM_LEN 8

typedef struct callback_arg_t
{
    gpio_num_t step_pin;
    uint32_t motor_num;
} callback_arg_t;

typedef enum {
    MICROSTEPS_1    = 8,
    MICROSTEPS_2    = 7,
    MICROSTEPS_4    = 6,
    MICROSTEPS_8    = 5,
    MICROSTEPS_16   = 4,
    MICROSTEPS_32   = 3,
    MICROSTEPS_64   = 2,
    MICROSTEPS_128  = 1,
    MICROSTEPS_256  = 0
} tmc2209_microsteps_t;


typedef enum {
    FREQ_2_1024 =  0,
    FREQ_2_683   = 1,
    FREQ_2_512   = 2,
    FREQ_2_410   = 3
} tmc2209_pwm_freq_t;

typedef struct
{
    uart_port_t uart;
    int32_t baud_rate;
    gpio_num_t tx_pin;
    gpio_num_t rx_pin;
    gpio_num_t* step_pin;
    gpio_num_t* dir_pin;
    gpio_num_t* en_pin;
    tmc2209_microsteps_t* micro_steps;
    uint8_t motors_num;
#if defined(RMT_LEGACY) && RMT_LEGACY
    /* Legacy RMT backend: preallocated channel ids managed outside the driver. */
    rmt_channel_t *rmt_channel;
#else
    /* New RMT backend: channel handles allocated during init. */
    rmt_channel_handle_t *rmt_channel;
#endif
} tms2209_t;

void tmc2209_init(tms2209_t *cfg);

void TMC2209_deinit(tms2209_t *cfg);

void TMC2209_enable(tms2209_t *cfg, uint32_t motor_num, uint32_t enable);

void TMC2209_set_dir(tms2209_t *cfg, uint32_t motor_num, uint32_t dir);

void TMC2209_set_period(uint32_t motor_num, uint32_t period_us);

void TMC2209_start(tms2209_t *cfg, uint32_t motor_num, uint32_t start);

void TMC2209_set_steps(tms2209_t *cfg, uint32_t motor_num, uint32_t steps);

void TMC2209_step_move(tms2209_t *cfg, int64_t* steps, uint32_t* period_us);

/**
 * Pulse contract for both legacy and new RMT backends:
 * - `steps` is the number of full STEP pulses to emit.
 * - one requested step must produce one rising edge on STEP.
 * - the signal is a 50/50 square wave where the high and low phases both use
 *   `signal_duration_us`.
 * - effective step period is `2 * signal_duration_us`.
 * - `async = 0` blocks until the full burst is transmitted.
 * - `async = 1` returns after queueing the burst.
 *
 * Any new backend must preserve these semantics exactly before replacing the
 * legacy backend.
 */
#if defined(RMT_LEGACY) && RMT_LEGACY
esp_err_t TMC2209_steps(tms2209_t *cfg, uint8_t motor_num, uint32_t steps, uint32_t signal_duration, uint8_t async);
#else
esp_err_t TMC2209_steps(tms2209_t *cfg, uint8_t motor_num, int steps, uint32_t steps_second);
#endif

void TMC2209_uart_move(tms2209_t *cfg, uint8_t address, int32_t speed);

int32_t TMC2209_uart_get_position(tms2209_t *cfg, uint8_t address);

void TMC2209_uart_conf(tms2209_t *cfg, uint8_t address);

void tmc2209_uart_write_datagram(tms2209_t *cfg, uint8_t address, uint8_t reg, uint32_t data);

uint32_t read_datagram(tms2209_t *cfg, uint8_t address, uint8_t reg);

esp_err_t tmc2209_set_current(tms2209_t *cfg, uint8_t motor_num, uint16_t milliampere_run, uint8_t percent_hold);

esp_err_t tmc2209_set_microsteps_per_step(tms2209_t *cfg, uint8_t motor_num, tmc2209_microsteps_t microsteps);

tmc2209_gconf_reg_t tmc2209_get_gconf(tms2209_t *cfg, uint8_t motor_num);

void tmc2209_set_gconf(tms2209_t *cfg, uint8_t motor_num, tmc2209_gconf_reg_t *reg);

tmc2209_gstat_reg_t tmc2209_get_gstat(tms2209_t *cfg, uint8_t motor_num);

void tmc2209_set_gstat(tms2209_t *cfg, uint8_t motor_num, tmc2209_gstat_reg_t *reg);

tmc2209_ifcnt_reg_t tmc2209_get_ifcnt(tms2209_t *cfg, uint8_t motor_num);

void tmc2209_set_nodeconf(tms2209_t *cfg, uint8_t motor_num, tmc2209_nodeconf_reg_t *reg);

void tmc2209_set_otp(tms2209_t cfg, uint8_t motor_num, tmc2209_otp_prog_reg_t *reg);

tmc2209_otp_read_reg_t tmc2209_get_otp(tms2209_t cfg, uint8_t motor_num);

tmc2209_ioin_reg_t tmc2209_get_ioin(tms2209_t cfg, uint8_t motor_num);

tmc2209_chopconf_reg_t tmc2209_get_chopconf(tms2209_t *cfg, uint8_t motor_num);
