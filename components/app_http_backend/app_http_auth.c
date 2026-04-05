//
// Created by Aleksey Volkov on 25.11.2020.
//

#include <stdio.h>
#include <string.h>

#include <esp_random.h>

#include <mbedtls/md.h>

#include "auth.h"

void generateToken(char *token_str)
{
    const char *key = "mySecretKey!";
    char payload[32];
    snprintf(payload, sizeof(payload), "LED_%lu", (unsigned long)esp_random());

    uint8_t hmac[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_type_t md_type = MBEDTLS_MD_SHA256;

    const size_t payload_length = strlen(payload);
    const size_t key_length = strlen(key);

    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(md_type), 1);
    mbedtls_md_hmac_starts(&ctx, (const unsigned char *)key, key_length);
    mbedtls_md_hmac_update(&ctx, (const unsigned char *)payload, payload_length);
    mbedtls_md_hmac_finish(&ctx, hmac);
    mbedtls_md_free(&ctx);

    for (int i = 0; i < (int)sizeof(hmac); i++) {
        snprintf(&token_str[2 * i], 3, "%02x", (int)hmac[i]);
    }
}
