if(CONFIG_CONTROLLER_ENABLE_BLE_PROVISIONING)
    idf_component_register(
        SRCS "app_provisioning.c"
        INCLUDE_DIRS "include"
        PRIV_INCLUDE_DIRS "../../main/include"
        REQUIRES esp_wifi
    )

    idf_component_get_property(app_monitor_includes app_monitor INCLUDE_DIRS)
    idf_component_get_property(app_settings_includes app_settings INCLUDE_DIRS)
    idf_component_get_property(bt_includes bt INCLUDE_DIRS)
    idf_component_get_property(json_includes json INCLUDE_DIRS)
    idf_component_get_property(protocomm_includes protocomm INCLUDE_DIRS)
    idf_component_get_property(app_monitor_lib app_monitor COMPONENT_LIB)
    idf_component_get_property(app_settings_lib app_settings COMPONENT_LIB)
    idf_component_get_property(bt_lib bt COMPONENT_LIB)
    idf_component_get_property(json_lib json COMPONENT_LIB)
    idf_component_get_property(protocomm_lib protocomm COMPONENT_LIB)

    target_include_directories(${COMPONENT_LIB} PRIVATE
        ${app_monitor_includes}
        ${app_settings_includes}
        ${bt_includes}
        ${json_includes}
        ${protocomm_includes}
    )
    target_link_libraries(${COMPONENT_LIB} PRIVATE
        ${app_monitor_lib}
        ${app_settings_lib}
        ${bt_lib}
        ${json_lib}
        ${protocomm_lib}
    )
else()
    idf_component_register(
        SRCS "app_provisioning_stub.c"
        INCLUDE_DIRS "include"
        REQUIRES esp_wifi
    )
endif()
