#pragma once
#include <gtk/gtk.h>
#include "app_state.h"

/* Shows modal dialog; fills *out on OK. Returns TRUE on OK, FALSE on cancel. */
gboolean add_alarm_dialog_run(GtkWindow *parent, AlarmItem *out);
gboolean edit_alarm_dialog_run(GtkWindow *parent, AlarmItem *inout);
