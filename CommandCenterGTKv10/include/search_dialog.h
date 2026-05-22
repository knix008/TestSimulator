#ifndef SEARCH_DIALOG_H
#define SEARCH_DIALOG_H

#include <gtk/gtk.h>

typedef void (*SearchFileSelectedFn)(const char *path, gpointer user_data);

GtkWidget *search_dialog_new(GtkWindow *parent,
                               const char *search_root,
                               SearchFileSelectedFn callback,
                               gpointer user_data);

#endif
