idf_component_register(
    SRCS "../../main/adc.c"
    INCLUDE_DIRS "../../main/include"
    REQUIRES esp_adc driver app_settings
)
