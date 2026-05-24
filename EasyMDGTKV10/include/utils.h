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

/* Bundled heading icons live as resources/h1.svg .. resources/h6.svg. */
void        utils_set_resources_dir(const char *dir);
const char *utils_heading_icon_basename(int level);
gchar      *utils_heading_icon_path(int level);

#endif /* EASYMD_UTILS_H */
