#ifndef UTILS_H
#define UTILS_H

#include <gtk/gtk.h>

void show_error_dialog(GtkWindow *parent, const char *message);
void show_info_dialog(GtkWindow *parent, const char *message);

#endif /* UTILS_H */
