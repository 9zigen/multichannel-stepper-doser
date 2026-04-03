//
// Created by Aleksey Volkov on 17.11.2020.
//

#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_log.h"

#include "board.h"
#include "adc.h"

#define ADC_SENSORS_NUM 3
#define CUR_ADC ADC_CHANNEL_1  /* GPIO1 */
#define NTC_ADC ADC_CHANNEL_2  /* GPIO2 */
#define VCC_ADC ADC_CHANNEL_4  /* GPIO4 */
#define ADC_SENSORS { CUR_ADC, NTC_ADC, VCC_ADC }

/* Voltage Divider Calculation
 * Vs = 50v
 * Vo = 3.3v (for max utilize adc)
 * Vo = Vs * R2 / (R1 + R2)
 * Vs = Vo * (R1 + R2) / R2
 * Ratio = (Vs * R2 / (R1 + R2)) * 100 / Vo * (R1 + R2) / R2
 * Ratio = 2.71 * 100 / 18.517 = 14.635
 * */

/* VCC Divider ratio 267K/10K */
#define VCC_DEVIDER_RATIO                27.6f /* 26.68 calibrated value if 49v_in 1.77v_adc*/

/* NTC Temperature calculation */
#define BALANCE_RESISTOR      10000
#define BETA                  3950
#define ROOM_TEMP             298.15      /* room temperature in Kelvin 273.15 + 25 */
#define NTC_25T_RESISTANCE    10000       /* NTC resistance when temperature is 25 Celsius */
#define NTC_REF_MV            3300

#define DEFAULT_VREF    1100        //Use adc2_vref_to_gpio() to obtain a better estimate
#define NO_OF_SAMPLES   64          //Multisampling

typedef enum {
    ADC_CH_CURRENT = 0,
    ADC_CH_NTC,
    ADC_CH_VCC
} adc_sensor_channel_t;

static const char *TAG = "ADC_TEMP";
adc_oneshot_unit_handle_t adc1_handle;
static adc_channel_t adc_sensors[ADC_SENSORS_NUM] = ADC_SENSORS;
static adc_cali_handle_t adc_cali_handle[ADC_SENSORS_NUM] = { NULL };
static bool do_calibration[ADC_SENSORS_NUM] = { false };
static uint16_t adc_current_zero_point = 330;

static bool adc_calibration_init(adc_unit_t unit, adc_channel_t channel, adc_atten_t atten, adc_cali_handle_t *out_handle)
{
    adc_cali_handle_t handle = NULL;
    esp_err_t ret = ESP_FAIL;
    bool calibrated = false;

#if ADC_CALI_SCHEME_CURVE_FITTING_SUPPORTED
    if (!calibrated) {
        ESP_LOGI(TAG, "calibration scheme version is %s", "Curve Fitting");
        adc_cali_curve_fitting_config_t cali_config = {
                .unit_id = unit,
                .chan = channel,
                .atten = atten,
                .bitwidth = ADC_BITWIDTH_DEFAULT,
        };
        ret = adc_cali_create_scheme_curve_fitting(&cali_config, &handle);
        if (ret == ESP_OK) {
            calibrated = true;
        }
    }
#endif

#if ADC_CALI_SCHEME_LINE_FITTING_SUPPORTED
    if (!calibrated) {
        ESP_LOGI(TAG, "calibration scheme version is %s", "Line Fitting");
        adc_cali_line_fitting_config_t cali_config = {
            .unit_id = unit,
            .atten = atten,
            .bitwidth = ADC_BITWIDTH_DEFAULT,
        };
        ret = adc_cali_create_scheme_line_fitting(&cali_config, &handle);
        if (ret == ESP_OK) {
            calibrated = true;
        }
    }
#endif

    *out_handle = handle;
    if (ret == ESP_OK) {
        ESP_LOGI(TAG, "Calibration Success");
    } else if (ret == ESP_ERR_NOT_SUPPORTED || !calibrated) {
        ESP_LOGW(TAG, "eFuse not burnt, skip software calibration");
    } else {
        ESP_LOGE(TAG, "Invalid arg or no memory");
    }

    return calibrated;
}

static void adc_calibration_deinit(adc_cali_handle_t handle)
{
#if ADC_CALI_SCHEME_CURVE_FITTING_SUPPORTED
    ESP_LOGI(TAG, "deregister %s calibration scheme", "Curve Fitting");
    ESP_ERROR_CHECK(adc_cali_delete_scheme_curve_fitting(handle));

#elif ADC_CALI_SCHEME_LINE_FITTING_SUPPORTED
    ESP_LOGI(TAG, "deregister %s calibration scheme", "Line Fitting");
    ESP_ERROR_CHECK(adc_cali_delete_scheme_line_fitting(handle));
#endif
}


void init_adc()
{
    /* ADC1 Init */
    adc_oneshot_unit_init_cfg_t init_config1 = {
        .unit_id = ADC_UNIT_1,
    };
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&init_config1, &adc1_handle));

    /* ADC1 Config */
    adc_oneshot_chan_cfg_t config = {
        .bitwidth = ADC_BITWIDTH_12,
        .atten = ADC_ATTEN_DB_11,
    };

    for (int i = 0; i < ADC_SENSORS_NUM; ++i) {
        ESP_ERROR_CHECK(adc_oneshot_config_channel(adc1_handle, adc_sensors[i], &config));
    }
    /* ADC1 Calibration Init */
    for (int i = 0; i < ADC_SENSORS_NUM; ++i) {
        do_calibration[i] = adc_calibration_init(ADC_UNIT_1, adc_sensors[i], ADC_ATTEN_DB_11, &adc_cali_handle[i]);
    }
}

void uninit_adc()
{
    ESP_ERROR_CHECK(adc_oneshot_del_unit(adc1_handle));
    for (int i = 0; i < ADC_SENSORS_NUM; ++i) {
        if (do_calibration[i]) {
            adc_calibration_deinit(adc_cali_handle[i]);
        }
    }
}

int adc_get_channel_voltage(adc_sensor_channel_t channel, bool multisamle)
{
    int adc_reading = 0;
    int voltage = 0;
    uint8_t success_samples = 0;

    if (multisamle)
    {
        for (int i = 0; i < NO_OF_SAMPLES; i++)
        {
            int adc_raw = 0;
            if (adc_oneshot_read(adc1_handle, adc_sensors[channel], &adc_raw) == ESP_OK)
            {
                adc_reading += adc_raw;
                success_samples++;
            }
        }

        if (success_samples)
        {
            adc_reading /= success_samples;
            adc_cali_raw_to_voltage(adc_cali_handle[channel], adc_reading, &voltage);
        }

        return voltage;
    }
    else
    {
        int adc_raw = 0;
        adc_oneshot_read(adc1_handle, adc_sensors[channel], &adc_raw);
        adc_cali_raw_to_voltage(adc_cali_handle[channel], adc_reading, &voltage);
        return voltage;
    }
}

void adc_calibrate_load_current()
{
    adc_current_zero_point = adc_get_channel_voltage(ADC_CH_CURRENT, true);
}

/* TMCS1108A2UQDR - current sensor
 * 100 mV/A
 * ZERO CURRENT OUTPUT VOLTAGE is 0.1 x Vs = 0.33v
 * */
float read_load_current()
{
    float voltage = (float)adc_get_channel_voltage(ADC_CH_CURRENT, true);
    return (voltage - (float)adc_current_zero_point) / 100;
}

float read_vcc_voltage()
{
    float voltage = (float) adc_get_channel_voltage(ADC_CH_VCC, true);
    return voltage * VCC_DEVIDER_RATIO;
}

int16_t read_ntc_temperature()
{
    int voltage = adc_get_channel_voltage(ADC_CH_NTC, true);
    double r_thermistor = BALANCE_RESISTOR / (((double)(NTC_REF_MV) / voltage) - 1);
    double temperature_kelvin = (BETA * ROOM_TEMP) / (BETA + ROOM_TEMP * log(r_thermistor / NTC_25T_RESISTANCE));
    double temperature_celsius = temperature_kelvin - 273.15;  // convert kelvin to celsius

    ESP_LOGD(TAG, "NTC mv: %u R: %f", voltage, r_thermistor);
    /* round */
    return (int16_t)(temperature_celsius + 0.5);
}