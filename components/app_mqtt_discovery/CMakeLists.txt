set(SOURCES
        "app_mqtt_discovery.c")

idf_component_register(SRCS ${SOURCES}
        INCLUDE_DIRS . include
        REQUIRES app_settings mqtt json)
