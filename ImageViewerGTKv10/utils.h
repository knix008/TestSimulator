#ifndef UTILS_H
#define UTILS_H

#include <stdbool.h>
#include <stdint.h>
#include <time.h>

bool utils_is_image_ext(const char *ext);
bool utils_is_video_ext(const char *ext);
bool utils_is_previewable_ext(const char *ext);

char *utils_format_file_size(int64_t bytes);
char *utils_format_mtime(time_t t);
int utils_gcd(int a, int b);

char *utils_get_default_pictures_dir(void);
char *utils_path_join(const char *a, const char *b);
char *utils_dup(const char *s);
void utils_free(void *p);

bool utils_dir_has_subdirs(const char *path);
char *utils_basename_dup(const char *path);

#endif
