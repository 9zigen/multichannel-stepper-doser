#include "app_pumps.h"
#include "pump_backend_stepper.h"
#include "stepper_task.h"

static esp_err_t stepper_backend_start(uint8_t pump_id, float speed, bool direction, int32_t duration_ms)
{
    return stepper_task_control(pump_id, speed, direction, duration_ms);
}

static void stepper_backend_stop(uint8_t pump_id)
{
    (void)stepper_task_control(pump_id, 0.0f, false, 0);
}

static const app_pumps_backend_t stepper_backend = {
    .name = "stepper",
    .supports_direction = true,
    .supports_speed_control = true,
    .start = stepper_backend_start,
    .stop = stepper_backend_stop,
};

esp_err_t register_stepper_pump_backend(void)
{
    return app_pumps_register_backend(&stepper_backend);
}
