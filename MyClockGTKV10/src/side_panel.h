#pragma once
#include <gtk/gtk.h>
#include "app_state.h"

GtkWidget *side_panel_new(AppState *state);
void       side_panel_update_world_times(AppState *state);
void       side_panel_update_stopwatch_display(AppState *state);
void       side_panel_update_timer_display(AppState *state);
void       side_panel_apply_settings(AppState *state);
