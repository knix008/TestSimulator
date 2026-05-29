#pragma once

#include <stdbool.h>

/* Generate a self-signed PKCS#12 certificate and write it to path.
   cn      = Common Name (e.g. "myserver.local")
   years   = validity in years
   Returns true on success. */
bool cert_generate_self_signed(const char *path, const char *password,
                               const char *cn, int years);

/* Verify that a PKCS#12 file can be opened with the given password. */
bool cert_verify(const char *path, const char *password);
