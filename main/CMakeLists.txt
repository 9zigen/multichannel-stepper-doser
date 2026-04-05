set(SOURCES
    main.c
    buttons.c
    mqtt.c
    monitor.c
    connect.c
    pump_backend_stepper.c
    rtc.c
    pwm_driver.c
    i2c_driver.c
    mcp7940.c
    adc.c
    led.c
    stepper_task.c)

idf_component_register(SRCS ${SOURCES}
        INCLUDE_DIRS . include
#        EMBED_TXTFILES ../certs/io_alab_cc.pem
        REQUIRES esp_netif esp_wifi nvs_flash esp_http_server ota captive mqtt json driver esp_timer tmc2209 esp_adc app_settings app_http_backend app_pumps)

target_compile_definitions(${COMPONENT_LIB} PUBLIC "-DLV_LVGL_H_INCLUDE_SIMPLE")
