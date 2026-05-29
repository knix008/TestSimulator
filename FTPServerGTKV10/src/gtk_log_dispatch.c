#include "gtk_log_dispatch.h"
#include "log_manager.h"
#include <glib.h>
#include <stdlib.h>
#include <string.h>

static LogCallback s_cb;
static void       *s_ud;

static gboolean idle_fire(gpointer data) {
    char *msg = data;
    if (s_cb) s_cb(msg, s_ud);
    free(data);
    return G_SOURCE_REMOVE;
}

/* Called from any thread; schedules cb on the GTK main thread. */
static void bridge_callback(const char *msg, void *ud) {
    (void)ud;
    size_t len = strlen(msg) + 1;
    char *copy = malloc(len);
    if (!copy) return;
    memcpy(copy, msg, len);
    g_idle_add(idle_fire, copy);
}

void gtk_log_install(LogCallback cb, void *user_data) {
    s_cb = cb;
    s_ud = user_data;
    log_manager_set_callback(bridge_callback, NULL);
}

void gtk_log_uninstall(void) {
    log_manager_set_callback(NULL, NULL);
    s_cb = NULL;
    s_ud = NULL;
}
