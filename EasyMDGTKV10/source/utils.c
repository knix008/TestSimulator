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

static gchar *utils_resources_dir = NULL;

void utils_set_resources_dir(const char *dir) {
    g_free(utils_resources_dir);
    utils_resources_dir = dir ? g_strdup(dir) : NULL;
}

const char *utils_heading_icon_basename(int level) {
    static const char *files[] = {
        NULL, "h1.svg", "h2.svg", "h3.svg", "h4.svg", "h5.svg", "h6.svg",
    };
    if (level < 1 || level > 6)
        return files[1];
    return files[level];
}

gchar *utils_heading_icon_path(int level) {
    const char *base = utils_heading_icon_basename(level);
    if (!base)
        return NULL;
    if (utils_resources_dir)
        return g_build_filename(utils_resources_dir, base, NULL);
    return g_build_filename("resources", base, NULL);
}
