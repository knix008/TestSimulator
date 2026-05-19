#pragma once

#include <gtk/gtk.h>

G_BEGIN_DECLS

#define VNC_TYPE_MAIN_WINDOW (vnc_main_window_get_type())
G_DECLARE_FINAL_TYPE(VncMainWindow, vnc_main_window, VNC, MAIN_WINDOW, GtkApplicationWindow)

GtkWidget *vnc_main_window_new(GtkApplication *app);

G_END_DECLS
