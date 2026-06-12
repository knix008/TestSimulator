#include <math.h>
#include <string.h>
#include <pango/pangocairo.h>
#include "analog_clock.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define DESIGN_SIZE 380.0

/* ── Color helpers ──────────────────────────────────────────────────────── */

void clock_colors_from_state(const AppState *state, ClockColors *out)
{
    /* Defaults that look OK on any theme */
    out->face_r = 0.09; out->face_g = 0.09; out->face_b = 0.15;
    out->border_r = 0.35; out->border_g = 0.36; out->border_b = 0.44;
    out->tick_min_r = 0.42; out->tick_min_g = 0.44; out->tick_min_b = 0.54;
    out->tick_hr_r = 1.0; out->tick_hr_g = 1.0; out->tick_hr_b = 1.0;
    out->num_r = 1.0; out->num_g = 1.0; out->num_b = 1.0;
    out->hr_hand_r  = 1.0; out->hr_hand_g  = 1.0; out->hr_hand_b  = 1.0;
    out->min_hand_r = 0.53; out->min_hand_g = 0.71; out->min_hand_b = 0.98;
    out->sec_hand_r = 1.0; out->sec_hand_g = 0.2; out->sec_hand_b = 0.2;
    out->center_r = 1.0; out->center_g = 0.2; out->center_b = 0.2;
    (void)state;
}

/* ── Scale helper ───────────────────────────────────────────────────────── */

static inline double sc(double design_units, double scale)
{
    return design_units * scale;
}

/* ── Hand drawing ───────────────────────────────────────────────────────── */

static void draw_hand(cairo_t *cr, double cx, double cy,
                      double angle, double len, double thick,
                      double r, double g, double b, double tail)
{
    cairo_save(cr);
    cairo_set_source_rgb(cr, r, g, b);
    cairo_set_line_width(cr, thick);
    cairo_set_line_cap(cr, CAIRO_LINE_CAP_ROUND);
    cairo_move_to(cr,
        cx - tail * sin(angle),
        cy + tail * cos(angle));
    cairo_line_to(cr,
        cx + len * sin(angle),
        cy - len * cos(angle));
    cairo_stroke(cr);
    cairo_restore(cr);
}

/* ── Tick marks ─────────────────────────────────────────────────────────── */

static void draw_all_ticks(cairo_t *cr, double cx, double cy, double r,
                           double scale, const ClockColors *c)
{
    for (int i = 0; i < 60; i++) {
        gboolean is_hour = (i % 5 == 0);
        double a = i * 6.0 * M_PI / 180.0;
        double outer_r = r - sc(4, scale);
        double inner_r = is_hour ? r - sc(24, scale) : r - sc(11, scale);
        double thick    = is_hour ? sc(3, scale) : sc(1, scale);
        cairo_set_source_rgb(cr,
            is_hour ? c->tick_hr_r  : c->tick_min_r,
            is_hour ? c->tick_hr_g  : c->tick_min_g,
            is_hour ? c->tick_hr_b  : c->tick_min_b);
        cairo_set_line_width(cr, thick);
        cairo_set_line_cap(cr, CAIRO_LINE_CAP_ROUND);
        cairo_move_to(cr, cx + outer_r * sin(a), cy - outer_r * cos(a));
        cairo_line_to(cr, cx + inner_r * sin(a), cy - inner_r * cos(a));
        cairo_stroke(cr);
    }
}

/* ── Number label ───────────────────────────────────────────────────────── */

static void place_label(cairo_t *cr, const char *text, double cx, double cy,
                        double angle, double radius, double font_size,
                        double r, double g, double b)
{
    PangoLayout *layout = pango_cairo_create_layout(cr);
    PangoFontDescription *desc = pango_font_description_new();
    pango_font_description_set_family(desc, "sans");
    pango_font_description_set_size(desc, (gint)(font_size * PANGO_SCALE));
    pango_font_description_set_weight(desc, PANGO_WEIGHT_BOLD);
    pango_layout_set_font_description(layout, desc);
    pango_layout_set_text(layout, text, -1);

    int tw, th;
    pango_layout_get_pixel_size(layout, &tw, &th);

    double x = cx + radius * sin(angle) - tw / 2.0;
    double y = cy - radius * cos(angle) - th / 2.0;

    cairo_save(cr);
    cairo_set_source_rgb(cr, r, g, b);
    cairo_move_to(cr, x, y);
    pango_cairo_show_layout(cr, layout);
    cairo_restore(cr);

    pango_font_description_free(desc);
    g_object_unref(layout);
}

/* ── Individual face styles ─────────────────────────────────────────────── */

static const char *roman_numerals[] = {
    "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"
};

static void draw_arabic_numbers(cairo_t *cr, double cx, double cy, double r,
                                double scale, const ClockColors *c)
{
    double font_size = fmax(10, r * 0.145);
    double label_r   = r * 0.72;
    for (int i = 1; i <= 12; i++) {
        double a = i * 30.0 * M_PI / 180.0;
        char buf[4];
        snprintf(buf, sizeof(buf), "%d", i);
        place_label(cr, buf, cx, cy, a, label_r, font_size,
                    c->num_r, c->num_g, c->num_b);
    }
    (void)scale;
}

static void draw_roman_numbers(cairo_t *cr, double cx, double cy, double r,
                               double scale, const ClockColors *c)
{
    double font_size = fmax(10, r * 0.115);
    double label_r   = r * 0.70;
    for (int i = 1; i <= 12; i++) {
        double a = i * 30.0 * M_PI / 180.0;
        place_label(cr, roman_numerals[i], cx, cy, a, label_r, font_size,
                    c->num_r, c->num_g, c->num_b);
    }
    (void)scale;
}

static void draw_cardinal_dots(cairo_t *cr, double cx, double cy, double r,
                               double scale, const ClockColors *c)
{
    for (int i = 0; i < 12; i++) {
        gboolean card = (i % 3 == 0);
        double a    = i * 30.0 * M_PI / 180.0;
        double dot_r = sc(card ? 6 : 3, scale);
        double pos   = r - sc(14, scale);
        double dx = cx + pos * sin(a);
        double dy = cy - pos * cos(a);
        cairo_set_source_rgba(cr,
            c->tick_hr_r, c->tick_hr_g, c->tick_hr_b,
            card ? 1.0 : 0.45);
        cairo_arc(cr, dx, dy, dot_r, 0, 2 * M_PI);
        cairo_fill(cr);
    }
}

static void draw_index_markers(cairo_t *cr, double cx, double cy, double r,
                               double scale, const ClockColors *c)
{
    for (int i = 0; i < 12; i++) {
        gboolean card = (i % 3 == 0);
        double a      = i * 30.0 * M_PI / 180.0;
        double outer_r = r - sc(4, scale);
        double inner_r = card ? r - sc(30, scale) : r - sc(18, scale);
        double thick   = card ? sc(7, scale) : sc(4, scale);
        cairo_set_source_rgb(cr, c->tick_hr_r, c->tick_hr_g, c->tick_hr_b);
        cairo_set_line_width(cr, thick);
        cairo_set_line_cap(cr, CAIRO_LINE_CAP_BUTT);
        cairo_move_to(cr, cx + outer_r * sin(a), cy - outer_r * cos(a));
        cairo_line_to(cr, cx + inner_r * sin(a), cy - inner_r * cos(a));
        cairo_stroke(cr);
    }
}

static void draw_railroad_markers(cairo_t *cr, double cx, double cy, double r,
                                  double scale, const ClockColors *c)
{
    for (int i = 0; i < 60; i++) {
        gboolean is_hour = (i % 5 == 0);
        double a = i * 6.0 * M_PI / 180.0;
        double outer_r = r - sc(4, scale);
        if (is_hour) {
            double inner_r = r - sc(28, scale);
            cairo_set_source_rgb(cr, c->tick_hr_r, c->tick_hr_g, c->tick_hr_b);
            cairo_set_line_width(cr, sc(5, scale));
            cairo_set_line_cap(cr, CAIRO_LINE_CAP_ROUND);
            cairo_move_to(cr, cx + outer_r * sin(a), cy - outer_r * cos(a));
            cairo_line_to(cr, cx + inner_r * sin(a), cy - inner_r * cos(a));
            cairo_stroke(cr);
        } else {
            double inner_r = r - sc(10, scale);
            cairo_set_source_rgb(cr, c->tick_min_r, c->tick_min_g, c->tick_min_b);
            cairo_set_line_width(cr, sc(1, scale));
            cairo_set_line_cap(cr, CAIRO_LINE_CAP_ROUND);
            cairo_move_to(cr, cx + outer_r * sin(a), cy - outer_r * cos(a));
            cairo_line_to(cr, cx + inner_r * sin(a), cy - inner_r * cos(a));
            cairo_stroke(cr);
        }
    }
}

static void draw_bauhaus_markers(cairo_t *cr, double cx, double cy, double r,
                                 double scale, const ClockColors *c)
{
    for (int i = 0; i < 60; i++) {
        if (i % 5 != 0) {
            double a = i * 6.0 * M_PI / 180.0;
            double outer_r = r - sc(4, scale), inner_r = r - sc(9, scale);
            cairo_set_source_rgba(cr, c->tick_min_r, c->tick_min_g, c->tick_min_b, 0.5);
            cairo_set_line_width(cr, sc(1, scale));
            cairo_move_to(cr, cx + outer_r * sin(a), cy - outer_r * cos(a));
            cairo_line_to(cr, cx + inner_r * sin(a), cy - inner_r * cos(a));
            cairo_stroke(cr);
        }
    }
    for (int h = 0; h < 12; h += 3) {
        double a = h * 30.0 * M_PI / 180.0;
        double outer_r = r - sc(6, scale), inner_r = outer_r - sc(22, scale);
        cairo_set_source_rgb(cr, c->tick_hr_r, c->tick_hr_g, c->tick_hr_b);
        cairo_set_line_width(cr, sc(4, scale));
        cairo_set_line_cap(cr, CAIRO_LINE_CAP_BUTT);
        cairo_move_to(cr, cx + outer_r * sin(a), cy - outer_r * cos(a));
        cairo_line_to(cr, cx + inner_r * sin(a), cy - inner_r * cos(a));
        cairo_stroke(cr);
    }
}

static void draw_dot_ring(cairo_t *cr, double cx, double cy, double r,
                          double scale, const ClockColors *c)
{
    for (int i = 0; i < 60; i++) {
        gboolean is_hour = (i % 5 == 0);
        double a   = i * 6.0 * M_PI / 180.0;
        double pos = r - sc(10, scale);
        double dx  = cx + pos * sin(a);
        double dy  = cy - pos * cos(a);

        if (i == 0) {
            double bw = sc(5, scale), bh = sc(20, scale);
            cairo_set_source_rgb(cr, c->tick_hr_r, c->tick_hr_g, c->tick_hr_b);
            cairo_rectangle(cr, dx - bw/2, dy - bh/2, bw, bh);
            cairo_fill(cr);
        } else {
            double dot_r = sc(is_hour ? 4.5 : 2.5, scale);
            cairo_set_source_rgba(cr,
                c->tick_hr_r, c->tick_hr_g, c->tick_hr_b,
                is_hour ? 1.0 : 0.65);
            cairo_arc(cr, dx, dy, dot_r, 0, 2 * M_PI);
            cairo_fill(cr);
        }
    }
}

static void draw_nautical_face(cairo_t *cr, double cx, double cy, double r,
                               double scale, const ClockColors *c)
{
    for (int i = 0; i < 60; i++) {
        gboolean is_hour = (i % 5 == 0);
        double a = i * 6.0 * M_PI / 180.0;
        double outer_r = r - sc(4, scale);
        double inner_r = is_hour ? r - sc(26, scale) : r - sc(9, scale);
        cairo_set_source_rgba(cr,
            is_hour ? c->tick_hr_r  : c->tick_min_r,
            is_hour ? c->tick_hr_g  : c->tick_min_g,
            is_hour ? c->tick_hr_b  : c->tick_min_b,
            is_hour ? 1.0 : 0.55);
        cairo_set_line_width(cr, is_hour ? sc(3.5, scale) : sc(1, scale));
        cairo_set_line_cap(cr, CAIRO_LINE_CAP_ROUND);
        cairo_move_to(cr, cx + outer_r * sin(a), cy - outer_r * cos(a));
        cairo_line_to(cr, cx + inner_r * sin(a), cy - inner_r * cos(a));
        cairo_stroke(cr);
    }
    /* Cardinal triangles at 3/6/9/12 */
    int cardinals[] = { 12, 3, 6, 9 };
    for (int k = 0; k < 4; k++) {
        int h = cardinals[k];
        double a = h * 30.0 * M_PI / 180.0;
        double tip_r  = r - sc(8, scale);
        double base_r = r - sc(28, scale);
        double half_w = sc(7, scale);
        double bx = cx + base_r * sin(a);
        double by = cy - base_r * cos(a);
        double tx = cx + tip_r  * sin(a);
        double ty = cy - tip_r  * cos(a);
        double px =  cos(a) * half_w;
        double py =  sin(a) * half_w;
        cairo_set_source_rgb(cr, c->tick_hr_r, c->tick_hr_g, c->tick_hr_b);
        cairo_move_to(cr, tx, ty);
        cairo_line_to(cr, bx - px, by - py);
        cairo_line_to(cr, bx + px, by + py);
        cairo_close_path(cr);
        cairo_fill(cr);
    }
    draw_arabic_numbers(cr, cx, cy, r, scale, c);
}

static void draw_modern_face(cairo_t *cr, double cx, double cy, double r,
                             double scale, const ClockColors *c)
{
    for (int i = 0; i < 12; i++) {
        gboolean card = (i % 3 == 0);
        double a = i * 30.0 * M_PI / 180.0;
        if (card) {
            double outer_r = r - sc(6, scale), inner_r = r - sc(34, scale);
            cairo_set_source_rgb(cr, c->tick_hr_r, c->tick_hr_g, c->tick_hr_b);
            cairo_set_line_width(cr, sc(3, scale));
            cairo_set_line_cap(cr, CAIRO_LINE_CAP_BUTT);
            cairo_move_to(cr, cx + outer_r * sin(a), cy - outer_r * cos(a));
            cairo_line_to(cr, cx + inner_r * sin(a), cy - inner_r * cos(a));
            cairo_stroke(cr);
        } else {
            double pos = r - sc(12, scale), dot_r = sc(2.5, scale);
            double dx = cx + pos * sin(a), dy = cy - pos * cos(a);
            cairo_set_source_rgba(cr, c->tick_min_r, c->tick_min_g, c->tick_min_b, 0.7);
            cairo_arc(cr, dx, dy, dot_r, 0, 2 * M_PI);
            cairo_fill(cr);
        }
    }
}

static void draw_steampunk_face(cairo_t *cr, double cx, double cy, double r,
                                double scale, const ClockColors *c)
{
    double inner_d = (r - sc(22, scale)) * 2;
    cairo_set_source_rgba(cr, c->border_r, c->border_g, c->border_b, 0.55);
    cairo_set_line_width(cr, sc(2, scale));
    cairo_arc(cr, cx, cy, inner_d/2, 0, 2 * M_PI);
    cairo_stroke(cr);

    for (int i = 0; i < 12; i++) {
        double a = i * 30.0 * M_PI / 180.0;
        double rivet_r = sc(3, scale), pos = r - sc(3, scale);
        double dx = cx + pos * sin(a), dy = cy - pos * cos(a);
        cairo_set_source_rgba(cr, c->tick_hr_r, c->tick_hr_g, c->tick_hr_b, 0.85);
        cairo_arc(cr, dx, dy, rivet_r, 0, 2 * M_PI);
        cairo_fill(cr);
    }
    draw_all_ticks(cr, cx, cy, r, scale, c);
    draw_roman_numbers(cr, cx, cy, r, scale, c);
}

static void draw_aviator_face(cairo_t *cr, double cx, double cy, double r,
                              double scale, const ClockColors *c)
{
    double font_size = fmax(10, r * 0.15);
    double label_r   = r * 0.71;
    for (int i = 0; i < 12; i++) {
        gboolean card = (i % 3 == 0);
        double a = i * 30.0 * M_PI / 180.0;
        double outer_r = r - sc(4, scale);
        double inner_r = card ? r - sc(26, scale) : r - sc(12, scale);
        cairo_set_source_rgb(cr,
            card ? c->tick_hr_r : c->tick_min_r,
            card ? c->tick_hr_g : c->tick_min_g,
            card ? c->tick_hr_b : c->tick_min_b);
        cairo_set_line_width(cr, card ? sc(4, scale) : sc(1, scale));
        cairo_set_line_cap(cr, CAIRO_LINE_CAP_ROUND);
        cairo_move_to(cr, cx + outer_r * sin(a), cy - outer_r * cos(a));
        cairo_line_to(cr, cx + inner_r * sin(a), cy - inner_r * cos(a));
        cairo_stroke(cr);
    }
    int aviat_hours[] = { 12, 3, 6, 9 };
    for (int k = 0; k < 4; k++) {
        int h = aviat_hours[k];
        double a = h * 30.0 * M_PI / 180.0;
        char buf[4]; snprintf(buf, sizeof(buf), "%d", h);
        place_label(cr, buf, cx, cy, a, label_r, font_size,
                    c->num_r, c->num_g, c->num_b);
    }
}

/* ── Date + AM/PM complication (upper area inside clock face) ───────────── */

static void draw_date_window(cairo_t *cr, double cx, double cy, double r,
                             double scale, GDateTime *now, const ClockColors *c,
                             const char *ampm_text)
{
    (void)c;
    int day = g_date_time_get_day_of_month(now);
    char buf[4];
    snprintf(buf, sizeof(buf), "%d", day);

    double box_w  = sc(38, scale);
    double box_h  = sc(24, scale);
    double corner = sc(3,  scale);
    double bx     = cx - box_w / 2.0;
    double by     = cy - r * 0.75 - box_h / 2.0;

    /* Draw AM/PM label above the date box (if provided) */
    if (ampm_text && ampm_text[0]) {
        PangoLayout *apl = pango_cairo_create_layout(cr);
        PangoFontDescription *apd = pango_font_description_new();
        pango_font_description_set_family(apd, "sans");
        double ap_size = fmax(7.0, sc(11, scale));
        pango_font_description_set_size(apd, (gint)(ap_size * PANGO_SCALE));
        pango_font_description_set_weight(apd, PANGO_WEIGHT_SEMIBOLD);
        pango_layout_set_font_description(apl, apd);
        pango_layout_set_text(apl, ampm_text, -1);
        int atw, ath;
        pango_layout_get_pixel_size(apl, &atw, &ath);
        cairo_save(cr);
        cairo_set_source_rgba(cr, 1.0, 1.0, 1.0, 0.9);
        cairo_move_to(cr, cx - atw / 2.0, by - ath - sc(3, scale));
        pango_cairo_show_layout(cr, apl);
        cairo_restore(cr);
        pango_font_description_free(apd);
        g_object_unref(apl);
    }

    /* Background: white */
    cairo_save(cr);
    cairo_set_source_rgb(cr, 1.0, 1.0, 1.0);
    cairo_arc(cr, bx + corner,         by + corner,         corner, M_PI,         3*M_PI/2);
    cairo_arc(cr, bx + box_w - corner, by + corner,         corner, 3*M_PI/2,     2*M_PI);
    cairo_arc(cr, bx + box_w - corner, by + box_h - corner, corner, 0,            M_PI/2);
    cairo_arc(cr, bx + corner,         by + box_h - corner, corner, M_PI/2,       M_PI);
    cairo_close_path(cr);
    cairo_fill(cr);

    /* Border */
    cairo_set_source_rgba(cr, 0.25, 0.25, 0.25, 0.85);
    cairo_set_line_width(cr, sc(1.2, scale));
    cairo_arc(cr, bx + corner,         by + corner,         corner, M_PI,         3*M_PI/2);
    cairo_arc(cr, bx + box_w - corner, by + corner,         corner, 3*M_PI/2,     2*M_PI);
    cairo_arc(cr, bx + box_w - corner, by + box_h - corner, corner, 0,            M_PI/2);
    cairo_arc(cr, bx + corner,         by + box_h - corner, corner, M_PI/2,       M_PI);
    cairo_close_path(cr);
    cairo_stroke(cr);

    /* Day number */
    PangoLayout *layout = pango_cairo_create_layout(cr);
    PangoFontDescription *desc = pango_font_description_new();
    pango_font_description_set_family(desc, "sans");
    double font_size = fmax(8.0, sc(13, scale));
    pango_font_description_set_size(desc, (gint)(font_size * PANGO_SCALE));
    pango_font_description_set_weight(desc, PANGO_WEIGHT_BOLD);
    pango_layout_set_font_description(layout, desc);
    pango_layout_set_text(layout, buf, -1);

    int tw, th;
    pango_layout_get_pixel_size(layout, &tw, &th);

    cairo_set_source_rgb(cr, 0.0, 0.0, 0.0);
    cairo_move_to(cr, cx - tw / 2.0, by + (box_h - th) / 2.0);
    pango_cairo_show_layout(cr, layout);

    pango_font_description_free(desc);
    g_object_unref(layout);
    cairo_restore(cr);
}

/* ── Main draw function ─────────────────────────────────────────────────── */

void analog_clock_draw(cairo_t *cr, double width, double height,
                       GDateTime *now, AnalogStyle style,
                       const ClockColors *c, gboolean show_border,
                       const char *ampm_text)
{
    double size  = fmin(width, height);
    double scale = size / DESIGN_SIZE;
    double cx    = width  / 2.0;
    double cy    = height / 2.0;
    double r     = size  / 2.0 - sc(12, scale);

    /* Face fill — clips the opaque circle; area outside is transparent */
    cairo_set_source_rgb(cr, c->face_r, c->face_g, c->face_b);
    cairo_arc(cr, cx, cy, r, 0, 2 * M_PI);
    cairo_fill(cr);

    if (show_border) {
        /* Outer glow */
        double glow_pad = sc(8, scale);
        cairo_set_source_rgba(cr, c->border_r, c->border_g, c->border_b, 0.3);
        cairo_set_line_width(cr, sc(1, scale));
        cairo_arc(cr, cx, cy, r + glow_pad, 0, 2 * M_PI);
        cairo_stroke(cr);

        /* Face border */
        cairo_set_source_rgb(cr, c->border_r, c->border_g, c->border_b);
        cairo_set_line_width(cr, sc(5, scale));
        cairo_arc(cr, cx, cy, r, 0, 2 * M_PI);
        cairo_stroke(cr);
    }

    /* Style-specific markers */
    switch (style) {
    case ANALOG_STYLE_CLASSIC:
        draw_all_ticks(cr, cx, cy, r, scale, c);
        draw_arabic_numbers(cr, cx, cy, r, scale, c);
        break;
    case ANALOG_STYLE_MINIMAL:
        draw_cardinal_dots(cr, cx, cy, r, scale, c);
        break;
    case ANALOG_STYLE_ROMAN:
        draw_all_ticks(cr, cx, cy, r, scale, c);
        draw_roman_numbers(cr, cx, cy, r, scale, c);
        break;
    case ANALOG_STYLE_INDICES:
        draw_index_markers(cr, cx, cy, r, scale, c);
        break;
    case ANALOG_STYLE_RAILROAD:
        draw_railroad_markers(cr, cx, cy, r, scale, c);
        break;
    case ANALOG_STYLE_BAUHAUS:
        draw_bauhaus_markers(cr, cx, cy, r, scale, c);
        break;
    case ANALOG_STYLE_DOTS:
        draw_dot_ring(cr, cx, cy, r, scale, c);
        break;
    case ANALOG_STYLE_AVIATOR:
        draw_aviator_face(cr, cx, cy, r, scale, c);
        break;
    case ANALOG_STYLE_NAUTICAL:
        draw_nautical_face(cr, cx, cy, r, scale, c);
        break;
    case ANALOG_STYLE_MODERN:
        draw_modern_face(cr, cx, cy, r, scale, c);
        break;
    case ANALOG_STYLE_STEAMPUNK:
        draw_steampunk_face(cr, cx, cy, r, scale, c);
        break;
    default:
        draw_all_ticks(cr, cx, cy, r, scale, c);
        draw_arabic_numbers(cr, cx, cy, r, scale, c);
        break;
    }

    /* Date window with AM/PM (drawn before hands) */
    draw_date_window(cr, cx, cy, r, scale, now, c, ampm_text);

    /* Calculate hand angles */
    int hour = g_date_time_get_hour(now)   % 12;
    int min  = g_date_time_get_minute(now);
    int sec  = g_date_time_get_second(now);

    double sec_a = sec               * 6.0  * M_PI / 180.0;
    double min_a = (min + sec/60.0)  * 6.0  * M_PI / 180.0;
    double hr_a  = (hour + min/60.0) * 30.0 * M_PI / 180.0;

    /* Hour hand */
    draw_hand(cr, cx, cy, hr_a, r * 0.50, sc(8, scale),
              c->hr_hand_r, c->hr_hand_g, c->hr_hand_b, 0);
    /* Minute hand */
    draw_hand(cr, cx, cy, min_a, r * 0.72, sc(5, scale),
              c->min_hand_r, c->min_hand_g, c->min_hand_b, 0);
    /* Second hand with tail */
    draw_hand(cr, cx, cy, sec_a, r * 0.85, sc(2, scale),
              c->sec_hand_r, c->sec_hand_g, c->sec_hand_b, r * 0.22);

    /* Center dot */
    double cap_size = sc(8, scale);
    cairo_set_source_rgb(cr, c->center_r, c->center_g, c->center_b);
    cairo_arc(cr, cx, cy, cap_size, 0, 2 * M_PI);
    cairo_fill(cr);
}
