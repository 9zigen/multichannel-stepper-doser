set(SOURCES "app_time.c")

idf_component_register(
    SRCS ${SOURCES}
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "../../main/include"
    REQUIRES esp_timer esp_netif app_settings
)
