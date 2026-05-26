#ifndef MAIN_WINDOW_H
#define MAIN_WINDOW_H

#include <gtk/gtk.h>

GtkWidget *main_window_create(void);

/* Call once after gtk_widget_show_all so the score panel can render SVG glyphs. */
void main_window_prepare_score_display(void);

#endif
