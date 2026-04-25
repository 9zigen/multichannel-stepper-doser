set(SOURCES
    "app_pumps.c"
    "app_pumps_history.c"
    "app_pumps_storage.c"
)

idf_component_register(
    SRCS ${SOURCES}
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "../../main/include"
    REQUIRES app_settings app_events driver esp_timer app_time nvs_flash
)
