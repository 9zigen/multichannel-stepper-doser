#pragma once

#define FYSETC_E4_V1_0

#if defined(FYSETC_E4_V1_0)

#define MAX_PUMP                4
#define MAX_SCHEDULE            MAX_PUMP
#define HARDWARE_MODEL          "FYSETC_E4"
#define HARDWARE_MANUFACTURER   "FYSETC"
#define HARDWARE_VERSION        "1.0"
#define LEDS                    {}
#define LED_COUNT               0
#define LED_ACTIVE_LEVEL        1

#else

#define MAX_PUMP             0
#define MAX_SCHEDULE         0

#endif