#ifndef MAIN_WINDOW_H
#define MAIN_WINDOW_H

#include <gtk/gtk.h>

typedef struct MainWindow MainWindow;

MainWindow *main_window_new(GtkApplication *app);
GtkWidget *main_window_get_widget(MainWindow *win);
void main_window_show_status(MainWindow *win, const char *message);

#endif
