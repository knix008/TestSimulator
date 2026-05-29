#pragma once
#include "log_manager.h"

/* Install a GTK-thread-safe log callback.
   cb is invoked on the GTK main thread via g_idle_add for each log message.
   Call gtk_log_uninstall() before shutdown. */
void gtk_log_install(LogCallback cb, void *user_data);
void gtk_log_uninstall(void);
