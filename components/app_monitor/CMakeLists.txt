set(SOURCES "app_monitor.c")

idf_component_register(
    SRCS ${SOURCES}
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "../../main/include"
    REQUIRES esp_netif esp_wifi app_settings
)
