#pragma once
#include <gtk/gtk.h>
#include "app_state.h"

GtkWidget *world_time_panel_new(AppState *state);
void       world_time_panel_update(GtkWidget *panel, AppState *state);
void       world_time_panel_reload(GtkWidget *panel, AppState *state);
