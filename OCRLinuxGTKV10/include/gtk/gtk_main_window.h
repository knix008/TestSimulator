#ifndef GTK_MAIN_WINDOW_H
#define GTK_MAIN_WINDOW_H

#include <gtk/gtk.h>

typedef struct OcrApp OcrApp;

GtkWidget *gtk_main_window_create(OcrApp *app);

#endif
