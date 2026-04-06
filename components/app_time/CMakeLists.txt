set(SOURCES
    "app_time.c"
    "app_time_rtc_mcp7940.c")

idf_component_register(
    SRCS ${SOURCES}
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "../../main/include"
    REQUIRES esp_timer esp_netif app_settings driver app_events
)
