#pragma once

#include <gtk/gtk.h>

typedef struct AppWindow AppWindow;

AppWindow *app_window_new(void);
void       app_window_free(AppWindow *win);

/* Returns the underlying GtkWidget* so main() can call gtk_widget_show_all(). */
GtkWidget *app_window_widget(AppWindow *win);
