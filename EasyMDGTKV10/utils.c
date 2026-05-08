/**
 * EasyMD GTK
 * utils.c - Shared logging helpers and small utilities.
 *
 * Belongs to the GTK-free core layer; needs _POSIX_C_SOURCE for localtime_r
 * when built without GTK headers in the include path.
 */
#define _POSIX_C_SOURCE 200809L

#include "utils.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <strings.h>
#include <time.h>

static void log_with_tag(const char *tag, const char *fmt, va_list ap) {
    char    timebuf[32];
    time_t  now = time(NULL);
    struct tm tmv;
    localtime_r(&now, &tmv);
    strftime(timebuf, sizeof(timebuf), "%H:%M:%S", &tmv);
    fprintf(stderr, "[%s] %-5s ", timebuf, tag);
    vfprintf(stderr, fmt, ap);
    fputc('\n', stderr);
}

void utils_log_info(const char *fmt, ...) {
    va_list ap; va_start(ap, fmt);
    log_with_tag("INFO", fmt, ap);
    va_end(ap);
}

void utils_log_warn(const char *fmt, ...) {
    va_list ap; va_start(ap, fmt);
    log_with_tag("WARN", fmt, ap);
    va_end(ap);
}

void utils_log_error(const char *fmt, ...) {
    va_list ap; va_start(ap, fmt);
    log_with_tag("ERROR", fmt, ap);
    va_end(ap);
}

const char *utils_get_extension(const char *path) {
    if (!path) return NULL;
    const char *dot = strrchr(path, '.');
    const char *slash = strrchr(path, '/');
    if (!dot || (slash && dot < slash)) return NULL;
    return dot + 1;
}

gboolean utils_str_has_suffix_ci(const char *s, const char *suffix) {
    if (!s || !suffix) return FALSE;
    size_t ls = strlen(s);
    size_t lu = strlen(suffix);
    if (lu > ls) return FALSE;
    return strcasecmp(s + ls - lu, suffix) == 0;
}
