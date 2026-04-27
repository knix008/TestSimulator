#ifndef UTILS_H
#define UTILS_H

#include <stdbool.h>
#include <time.h>

/**
 * Utils Module - Platform-independent utility functions
 * 
 * Provides common functionality used across the application.
 */

// String utilities
char* utils_get_timestamp(void);
char* utils_generate_filename(const char *prefix, const char *extension);
bool utils_file_exists(const char *path);
char* utils_get_home_directory(void);

// Path utilities
char* utils_join_path(const char *dir, const char *filename);
bool utils_create_directory(const char *path);
const char* utils_get_extension(const char *filename);

// Time utilities
void utils_sleep_ms(int milliseconds);
time_t utils_get_current_time(void);

// Logging
void utils_log(const char *level, const char *format, ...);
void utils_log_error(const char *format, ...);
void utils_log_info(const char *format, ...);
void utils_log_debug(const char *format, ...);

// Memory utilities
void* utils_malloc(size_t size);
void* utils_realloc(void *ptr, size_t size);
void utils_free(void *ptr);

#endif // UTILS_H
