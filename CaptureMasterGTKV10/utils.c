/**
 * CaptureMaster - Utils Module
 * Platform-independent utility functions
 */

#define _DEFAULT_SOURCE
#define _POSIX_C_SOURCE 200809L

#include "utils.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <unistd.h>
#include <pwd.h>

// Get current timestamp as string
char* utils_get_timestamp(void) {
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    
    char *timestamp = (char*)malloc(64);
    if (timestamp) {
        strftime(timestamp, 64, "%Y%m%d_%H%M%S", t);
    }
    
    return timestamp;
}

// Generate a filename with timestamp
char* utils_generate_filename(const char *prefix, const char *extension) {
    char *timestamp = utils_get_timestamp();
    if (!timestamp) {
        return NULL;
    }
    
    size_t len = strlen(prefix) + strlen(timestamp) + strlen(extension) + 3;
    char *filename = (char*)malloc(len);
    
    if (filename) {
        snprintf(filename, len, "%s_%s.%s", prefix, timestamp, extension);
    }
    
    free(timestamp);
    return filename;
}

// Check if file exists
bool utils_file_exists(const char *path) {
    return access(path, F_OK) == 0;
}

// Get user's home directory
char* utils_get_home_directory(void) {
    const char *home = getenv("HOME");
    if (home) {
        return strdup(home);
    }
    
    // Fallback to passwd entry
    struct passwd *pw = getpwuid(getuid());
    if (pw && pw->pw_dir) {
        return strdup(pw->pw_dir);
    }
    
    return NULL;
}

// Join path components
char* utils_join_path(const char *dir, const char *filename) {
    if (!dir || !filename) {
        return NULL;
    }
    
    size_t dir_len = strlen(dir);
    size_t filename_len = strlen(filename);
    
    // Check if dir already ends with /
    bool needs_slash = (dir_len > 0 && dir[dir_len - 1] != '/');
    
    size_t total_len = dir_len + filename_len + (needs_slash ? 2 : 1);
    char *path = (char*)malloc(total_len);
    
    if (path) {
        if (needs_slash) {
            snprintf(path, total_len, "%s/%s", dir, filename);
        } else {
            snprintf(path, total_len, "%s%s", dir, filename);
        }
    }
    
    return path;
}

// Create directory if it doesn't exist
bool utils_create_directory(const char *path) {
    struct stat st = {0};
    
    if (stat(path, &st) == -1) {
        return mkdir(path, 0755) == 0;
    }
    
    return S_ISDIR(st.st_mode);
}

// Get file extension
const char* utils_get_extension(const char *filename) {
    if (!filename) {
        return NULL;
    }
    
    const char *dot = strrchr(filename, '.');
    if (!dot || dot == filename) {
        return NULL;
    }
    
    return dot + 1;
}

// Sleep for milliseconds
void utils_sleep_ms(int milliseconds) {
    usleep(milliseconds * 1000);
}

// Get current time
time_t utils_get_current_time(void) {
    return time(NULL);
}

// Logging functions
void utils_log(const char *level, const char *format, ...) {
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", t);
    
    fprintf(stderr, "[%s] [%s] ", timestamp, level);
    
    va_list args;
    va_start(args, format);
    vfprintf(stderr, format, args);
    va_end(args);
    
    fprintf(stderr, "\n");
}

void utils_log_error(const char *format, ...) {
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", t);
    
    fprintf(stderr, "[%s] [ERROR] ", timestamp);
    
    va_list args;
    va_start(args, format);
    vfprintf(stderr, format, args);
    va_end(args);
    
    fprintf(stderr, "\n");
}

void utils_log_info(const char *format, ...) {
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", t);
    
    fprintf(stderr, "[%s] [INFO] ", timestamp);
    
    va_list args;
    va_start(args, format);
    vfprintf(stderr, format, args);
    va_end(args);
    
    fprintf(stderr, "\n");
}

void utils_log_debug(const char *format, ...) {
#ifdef DEBUG
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S", t);
    
    fprintf(stderr, "[%s] [DEBUG] ", timestamp);
    
    va_list args;
    va_start(args, format);
    vfprintf(stderr, format, args);
    va_end(args);
    
    fprintf(stderr, "\n");
#else
    (void)format;  // Suppress unused parameter warning
#endif
}

// Memory utilities
void* utils_malloc(size_t size) {
    void *ptr = malloc(size);
    if (!ptr && size > 0) {
        utils_log_error("Memory allocation failed: %zu bytes", size);
    }
    return ptr;
}

void* utils_realloc(void *ptr, size_t size) {
    void *new_ptr = realloc(ptr, size);
    if (!new_ptr && size > 0) {
        utils_log_error("Memory reallocation failed: %zu bytes", size);
    }
    return new_ptr;
}

void utils_free(void *ptr) {
    if (ptr) {
        free(ptr);
    }
}
