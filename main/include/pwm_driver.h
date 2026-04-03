/***
** Created by Aleksey Volkov on 04.08.2020.
***/

#ifndef TFT_DOSER_PWM_DRIVER_H
#define TFT_DOSER_PWM_DRIVER_H

void init_pwm_driver(void);
void fade_channel(uint8_t channel, uint16_t fade_time, uint32_t duty);
void fade_channel_percent(uint8_t channel, uint16_t fade_time, uint8_t percent);

#endif //TFT_DOSER_PWM_DRIVER_H
