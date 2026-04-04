set(component_srcs
        "tmc2209.c"
)

idf_component_register(
        SRCS
        "${component_srcs}"
        INCLUDE_DIRS "include"
        REQUIRES "driver esp_timer"
)
