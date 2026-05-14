#pragma once

/* GTK UI layer — all GTK widget creation and signal handling.
   Calls into the GTK-free App layer for business logic. */

#include <gtk/gtk.h>
#include "app.h"

/* Build and return the top-level GtkWindow.
   Wires up all signals and registers callbacks with `app`. */
GtkWidget *ui_build(App *app);
