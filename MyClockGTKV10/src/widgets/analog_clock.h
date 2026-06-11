#pragma once
#include <gtk/gtk.h>
#include "app_state.h"

/* ClockColors – filled from CSS/theme for the Cairo draw functions */
typedef struct {
    double face_r,   face_g,   face_b;
    double border_r, border_g, border_b;
    double tick_min_r, tick_min_g, tick_min_b;
    double tick_hr_r,  tick_hr_g,  tick_hr_b;
    double num_r,    num_g,    num_b;
    double hr_hand_r,  hr_hand_g,  hr_hand_b;
    double min_hand_r, min_hand_g, min_hand_b;
    double sec_hand_r, sec_hand_g, sec_hand_b;
    double center_r,   center_g,   center_b;
} ClockColors;

void clock_colors_from_state(const AppState *state, ClockColors *out);

/* Main draw entry – call from draw_func callback */
void analog_clock_draw(cairo_t *cr, double width, double height,
                       GDateTime *now, AnalogStyle style,
                       const ClockColors *colors);
