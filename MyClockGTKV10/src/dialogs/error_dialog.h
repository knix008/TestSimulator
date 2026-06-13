#pragma once
#include <gtk/gtk.h>
#include <glib.h>

/* Show a detailed, copy-friendly error popup. parent may be NULL. */
void error_dialog_show(GtkWindow *parent,
                       const char *title,
                       const char *summary,
                       const char *details);

void error_dialog_show_gerror(GtkWindow *parent,
                              const char *title,
                              const GError *err);

/* Used by the global g_log handler. */
void error_dialog_show_log(GtkWindow *parent,
                           const char *domain,
                           GLogLevelFlags level,
                           const char *message);
