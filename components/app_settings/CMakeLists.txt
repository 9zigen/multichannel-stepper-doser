set(SOURCES
    "app_settings.c"
    "app_settings_storage.c")
idf_component_register(SRCS ${SOURCES}
        INCLUDE_DIRS . include
        PRIV_INCLUDE_DIRS "../../main/include"
        REQUIRES nvs_flash driver app_events)
