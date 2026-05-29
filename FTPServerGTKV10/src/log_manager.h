#pragma once

#include <stdbool.h>

/* Callback fired on the GLib main thread for each log line. */
typedef void (*LogCallback)(const char *message, void *user_data);

bool log_manager_init(const char *log_file_path);
void log_manager_shutdown(void);
void log_manager_log(const char *format, ...) __attribute__((format(printf, 1, 2)));
void log_manager_set_callback(LogCallback cb, void *user_data);
