#ifndef PREVIEW_PANEL_H
#define PREVIEW_PANEL_H

#include <gtk/gtk.h>

GtkWidget *preview_panel_new(void);
void preview_panel_show_file(GtkWidget *panel, const char *path);
void preview_panel_clear(GtkWidget *panel);

#endif
