#pragma once
#include <stddef.h>
#include <stdbool.h>

/* Safe string copy (like g_strlcpy). Returns strlen(src). */
size_t str_copy(char *dst, const char *src, size_t n);

/* Join two path components with '/'. Caller must free(). */
char *path_join(const char *a, const char *b);

/* Recursive mkdir (like g_mkdir_with_parents). Returns 0 on success. */
int make_dirs(const char *path, int mode);

/* Returns XDG_CONFIG_HOME or ~/.config. Caller must free(). */
char *get_config_dir(void);

/* Returns directory portion of path. Caller must free(). */
char *path_dirname_str(const char *path);

/* Base64-encode data (no line breaks). Caller must free(). */
char *base64_encode(const unsigned char *data, size_t len);
