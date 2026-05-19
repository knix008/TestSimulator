#pragma once

#include <gtk/gtk.h>
#include "vnc_client.h"
#include "vnc_types.h"

G_BEGIN_DECLS

#define VNC_TYPE_DISPLAY (vnc_display_get_type())
G_DECLARE_FINAL_TYPE(VncDisplay, vnc_display, VNC, DISPLAY, GtkDrawingArea)

GtkWidget  *vnc_display_new(void);

void        vnc_display_set_client(VncDisplay *display, VncClient *client);
VncClient  *vnc_display_get_client(VncDisplay *display);

void        vnc_display_set_scale_mode(VncDisplay *display, VncScaleMode mode);
VncScaleMode vnc_display_get_scale_mode(VncDisplay *display);

/* Call when a region has been updated by the client */
void        vnc_display_refresh(VncDisplay *display, gint x, gint y, gint w, gint h);

/* Call on desktop resize */
void        vnc_display_on_resize(VncDisplay *display, gint width, gint height);

G_END_DECLS
