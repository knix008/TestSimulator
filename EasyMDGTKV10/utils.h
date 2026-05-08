/**
 * EasyMD GTK
 * utils.h - Shared logging helpers and small utilities.
 */
#ifndef EASYMD_UTILS_H
#define EASYMD_UTILS_H

#include <glib.h>

void utils_log_info(const char *fmt, ...) G_GNUC_PRINTF(1, 2);
void utils_log_warn(const char *fmt, ...) G_GNUC_PRINTF(1, 2);
void utils_log_error(const char *fmt, ...) G_GNUC_PRINTF(1, 2);

const char *utils_get_extension(const char *path);
gboolean    utils_str_has_suffix_ci(const char *s, const char *suffix);

#endif /* EASYMD_UTILS_H */
