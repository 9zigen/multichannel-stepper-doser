set(SOURCES
    "app_http_auth.c"
    "app_http_backend.c"
    "app_http_handlers.c"
    "app_http_json.c")

set(WEB_FILES
        "../../frontend/dist/favicon.ico"
        "../../frontend/dist/app.css.gz"
        "../../frontend/dist/app.js.gz"
        "../../frontend/dist/app.woff2"
        "../../frontend/dist/icon.svg.gz"
        "../../frontend/dist/apple-touch-icon.png"
        "../../frontend/dist/index.html.gz")

idf_component_register(
    SRCS ${SOURCES}
    INCLUDE_DIRS "include"
    PRIV_INCLUDE_DIRS "../../main/include"
    EMBED_FILES ${WEB_FILES}
    REQUIRES esp_http_server app_settings app_events app_pumps json ota mqtt esp_timer esp_wifi esp_system esp_app_format esp_hw_support mbedtls
)
