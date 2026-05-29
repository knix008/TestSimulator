#include "log_manager.h"
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <stdarg.h>
#include <string.h>

static struct {
    FILE           *file;
    pthread_mutex_t mutex;
    LogCallback     cb;
    void           *cb_ud;
    bool            initialized;
} lm;

bool log_manager_init(const char *log_file_path) {
    if (lm.initialized) return true;
    pthread_mutex_init(&lm.mutex, NULL);
    if (log_file_path && *log_file_path)
        lm.file = fopen(log_file_path, "a");
    lm.initialized = true;
    return true;
}

void log_manager_shutdown(void) {
    if (!lm.initialized) return;
    pthread_mutex_lock(&lm.mutex);
    if (lm.file) { fclose(lm.file); lm.file = NULL; }
    lm.initialized = false;
    pthread_mutex_unlock(&lm.mutex);
    pthread_mutex_destroy(&lm.mutex);
}

void log_manager_set_callback(LogCallback cb, void *user_data) {
    pthread_mutex_lock(&lm.mutex);
    lm.cb    = cb;
    lm.cb_ud = user_data;
    pthread_mutex_unlock(&lm.mutex);
}

void log_manager_log(const char *format, ...) {
    char buf[2048];
    va_list ap;
    va_start(ap, format);
    vsnprintf(buf, sizeof(buf), format, ap);
    va_end(ap);

    time_t now = time(NULL);
    struct tm *tm_info = localtime(&now);
    char ts_short[16], ts_long[32];
    strftime(ts_short, sizeof(ts_short), "%H:%M:%S", tm_info);
    strftime(ts_long,  sizeof(ts_long),  "%Y-%m-%d %H:%M:%S", tm_info);

    /* Write to file and snapshot callback under mutex */
    pthread_mutex_lock(&lm.mutex);
    if (lm.file) {
        fprintf(lm.file, "[%s] %s\n", ts_long, buf);
        fflush(lm.file);
    }
    LogCallback cb = lm.cb;
    void       *ud = lm.cb_ud;
    pthread_mutex_unlock(&lm.mutex);

    /* Call callback without holding the mutex */
    if (cb) {
        char display[2200];
        snprintf(display, sizeof(display), "[%s] %s", ts_short, buf);
        cb(display, ud);
    }
}
