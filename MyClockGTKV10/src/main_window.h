#pragma once
#include <gtk/gtk.h>
#include "app_state.h"

GtkWidget *main_window_new(AppState *state);
void       main_window_apply_theme(AppState *state);
void       main_window_apply_digit_color(AppState *state);
void       main_window_apply_brightness(AppState *state);
void       main_window_apply_digital_style(AppState *state);
void       main_window_apply_analog_style(AppState *state);
void       main_window_toggle_clock_mode(AppState *state);
void       main_window_update_clock(AppState *state);
void       main_window_toggle_side_panel(AppState *state);
void       window_set_keep_above(GtkWindow *win, gboolean keep);
