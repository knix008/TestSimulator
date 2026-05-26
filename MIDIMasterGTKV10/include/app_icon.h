#ifndef APP_ICON_H
#define APP_ICON_H

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <gtk/gtk.h>

GdkPixbuf *app_icon_load_pixbuf(int max_size);
void       app_icon_apply(GtkWindow *window);

#endif
