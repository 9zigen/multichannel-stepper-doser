set(SOURCES "app_interfaces.c")

idf_component_register(
    SRCS ${SOURCES}
    INCLUDE_DIRS "include"
    REQUIRES app_settings app_events app_pumps driver
)
