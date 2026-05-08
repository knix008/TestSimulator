/*
 * screenshot-area-selection.h - based on GNOME Screenshot source
 * Original: src/screenshot-area-selection.h
 */

#ifndef SCREENSHOT_AREA_SELECTION_H
#define SCREENSHOT_AREA_SELECTION_H

#include <gtk/gtk.h>

/* Callback invoked when the user finishes the rubber-band selection.
 * rect is NULL if the selection was cancelled (Escape key). */
typedef void (*AreaSelectionCallback) (GdkRectangle *rect, gpointer user_data);

/* Shows a full-screen transparent overlay and lets the user drag a
 * rubber-band rectangle.  When done the callback is invoked and the
 * overlay is destroyed.  Mirrors gnome-screenshot's
 * screenshot_select_area_async(). */
void screenshot_select_area_async (AreaSelectionCallback callback,
                                   gpointer              user_data);

#endif /* SCREENSHOT_AREA_SELECTION_H */
