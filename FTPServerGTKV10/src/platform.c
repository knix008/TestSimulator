#include "platform.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <errno.h>
#include <openssl/bio.h>
#include <openssl/evp.h>

size_t str_copy(char *dst, const char *src, size_t n) {
    if (!dst || n == 0) return src ? strlen(src) : 0;
    size_t i = 0;
    if (src) {
        for (; i < n - 1 && src[i]; i++)
            dst[i] = src[i];
    }
    dst[i] = '\0';
    return i + (src ? strlen(src + i) : 0);
}

char *path_join(const char *a, const char *b) {
    if (!a || !*a) return b ? strdup(b) : strdup("");
    if (!b || !*b) return strdup(a);
    size_t alen = strlen(a), blen = strlen(b);
    /* Avoid double slash if a ends with '/' */
    if (a[alen - 1] == '/') alen--;
    char *result = malloc(alen + blen + 2);
    if (!result) return NULL;
    memcpy(result, a, alen);
    result[alen] = '/';
    memcpy(result + alen + 1, b, blen + 1);
    return result;
}

int make_dirs(const char *path, int mode) {
    char tmp[4096];
    if (!path || !*path) return -1;
    snprintf(tmp, sizeof(tmp), "%s", path);
    size_t len = strlen(tmp);
    if (len > 0 && tmp[len - 1] == '/') tmp[--len] = '\0';
    for (size_t i = 1; i <= len; i++) {
        if (tmp[i] == '/' || tmp[i] == '\0') {
            char c = tmp[i];
            tmp[i] = '\0';
            if (mkdir(tmp, (mode_t)mode) != 0 && errno != EEXIST)
                return -1;
            tmp[i] = c;
        }
    }
    return 0;
}

char *get_config_dir(void) {
    const char *xdg = getenv("XDG_CONFIG_HOME");
    if (xdg && *xdg) return strdup(xdg);
    const char *home = getenv("HOME");
    if (!home || !*home) return strdup("/tmp");
    char *result = malloc(strlen(home) + 9);  /* "/.config\0" */
    sprintf(result, "%s/.config", home);
    return result;
}

char *path_dirname_str(const char *path) {
    if (!path) return strdup(".");
    const char *slash = strrchr(path, '/');
    if (!slash) return strdup(".");
    if (slash == path) return strdup("/");
    size_t len = (size_t)(slash - path);
    char *result = malloc(len + 1);
    if (!result) return strdup(".");
    memcpy(result, path, len);
    result[len] = '\0';
    return result;
}

char *base64_encode(const unsigned char *data, size_t len) {
    BIO *b64 = BIO_new(BIO_f_base64());
    BIO *mem = BIO_new(BIO_s_mem());
    if (!b64 || !mem) { BIO_free_all(b64); BIO_free(mem); return NULL; }
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    BIO_push(b64, mem);
    BIO_write(b64, data, (int)len);
    BIO_flush(b64);
    char *ptr = NULL;
    long sz = BIO_get_mem_data(mem, &ptr);
    char *result = malloc((size_t)sz + 1);
    if (result && ptr) {
        memcpy(result, ptr, (size_t)sz);
        result[sz] = '\0';
    }
    BIO_free_all(b64);
    return result;
}
