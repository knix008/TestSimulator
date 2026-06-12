#pragma once
#include <gtk/gtk.h>
#include "../app_state.h"

/* Run add/edit dialog.
 * For new events: pass event with default date pre-filled (year/month/day set).
 * For edits:      pass existing event; dialog pre-populates all fields.
 * Returns TRUE if the user accepted, with event updated.
 * Returns FALSE if cancelled.
 * If delete_requested is non-NULL and the user pressed Delete, sets *delete_requested = TRUE.
 */
gboolean calendar_event_dialog_run(GtkWindow    *parent,
                                   CalendarEvent *event,
                                   gboolean      *delete_requested);
