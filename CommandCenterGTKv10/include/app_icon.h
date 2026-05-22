#ifndef APP_ICON_H
#define APP_ICON_H

#include <gtk/gtk.h>
#include <gdk-pixbuf/gdk-pixbuf.h>

void app_icon_apply(GtkWindow *window);
GdkPixbuf *app_icon_load_pixbuf(int max_size);

#endif
