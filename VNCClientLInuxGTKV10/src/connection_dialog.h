#pragma once

#include <gtk/gtk.h>
#include "profile.h"

G_BEGIN_DECLS

#define VNC_TYPE_CONNECTION_DIALOG (vnc_connection_dialog_get_type())
G_DECLARE_FINAL_TYPE(VncConnectionDialog, vnc_connection_dialog, VNC, CONNECTION_DIALOG, GtkDialog)

GtkWidget  *vnc_connection_dialog_new(GtkWindow *parent);

/* Returns a newly allocated profile (caller frees) or NULL if cancelled. */
VncProfile *vnc_connection_dialog_run(VncConnectionDialog *dialog);

G_END_DECLS
