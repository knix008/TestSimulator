#include <gtk/gtk.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include "app_state.h"
#include "main_window.h"
#include "side_panel.h"
#include "models/settings.h"
#include "services/timer_service.h"
#include "services/stopwatch_service.h"
#include "widgets/analog_clock.h"
#include "widgets/seven_segment.h"
#include "widgets/dot_matrix.h"
#include "dialogs/alarm_notification.h"

/* ── Theme CSS file paths ────────────────────────────────────────────────── */

static const char *THEME_CSS_PATHS[THEME_COUNT] = {
    "data/themes/dark.css",
    "data/themes/light.css",
    "data/themes/midnight.css",
    "data/themes/ocean.css",
    "data/themes/ruby.css",
    "data/themes/emerald.css",
    "data/themes/purple.css",
    "data/themes/amber.css",
    "data/themes/rose.css",
    "data/themes/mono.css",
    "data/themes/sunset.css",
    "data/themes/mint.css",
};

/* ── Forward declarations ───────────────────────────────────────────────── */

static gboolean tick_cb(gpointer data);
static void     update_digital(AppState *state, GDateTime *now);
static void     update_analog(AppState *state, GDateTime *now);
static void     check_alarms(AppState *state, GDateTime *now);
static void     show_alarm_notification(AppState *state,
                                        const char *time_str,
                                        const char *label,
                                        const char *header);

/* ── Theme / color helpers ──────────────────────────────────────────────── */

void main_window_apply_theme(AppState *state)
{
    if (!state->theme_provider) {
        state->theme_provider = gtk_css_provider_new();
        gtk_style_context_add_provider_for_display(
            gdk_display_get_default(),
            GTK_STYLE_PROVIDER(state->theme_provider),
            GTK_STYLE_PROVIDER_PRIORITY_USER);
    }

    /* Try loading from executable-relative path first, then absolute */
    const char *rel = THEME_CSS_PATHS[state->settings.theme];
    gchar *path = g_build_filename(g_get_current_dir(), rel, NULL);

    if (!g_file_test(path, G_FILE_TEST_EXISTS)) {
        g_free(path);
        /* Try next to executable */
        path = g_build_filename(
            g_path_get_dirname(g_get_prgname()), rel, NULL);
    }

    if (g_file_test(path, G_FILE_TEST_EXISTS)) {
        gtk_css_provider_load_from_path(state->theme_provider, path);
    } else {
        /* Fallback: inline dark theme */
        gtk_css_provider_load_from_string(state->theme_provider,
            "@define-color clock_face #181825;"
            "@define-color clock_border #585b70;"
            "@define-color clock_text #cdd6f4;"
            "@define-color bg_color #1e1e2e;"
            "@define-color fg_color #cdd6f4;"
            "@define-color accent_color #89b4fa;"
            "@define-color panel_bg #181825;"
            "@define-color panel_border #313244;");
    }
    g_free(path);

    /* Apply digit color via separate dynamic CSS */
    main_window_apply_digit_color(state);
}

void main_window_apply_digit_color(AppState *state)
{
    if (!state->color_provider) {
        state->color_provider = gtk_css_provider_new();
        gtk_style_context_add_provider_for_display(
            gdk_display_get_default(),
            GTK_STYLE_PROVIDER(state->color_provider),
            GTK_STYLE_PROVIDER_PRIORITY_USER + 1);
    }

    char css[256];
    snprintf(css, sizeof(css),
        "@define-color digit_color rgb(%d,%d,%d);"
        "@define-color ampm_color  rgb(%d,%d,%d);",
        (int)(state->settings.digit_r * 255),
        (int)(state->settings.digit_g * 255),
        (int)(state->settings.digit_b * 255),
        (int)(state->settings.ampm_r * 255),
        (int)(state->settings.ampm_g * 255),
        (int)(state->settings.ampm_b * 255));

    gtk_css_provider_load_from_string(state->color_provider, css);

    /* Queue redraws for canvas-based displays */
    if (state->seven_seg_area)
        gtk_widget_queue_draw(state->seven_seg_area);
    if (state->dot_matrix_area)
        gtk_widget_queue_draw(state->dot_matrix_area);
}

void main_window_apply_brightness(AppState *state)
{
    /* GtkStack page for digital uses opacity */
    if (state->clock_stack) {
        GtkWidget *digital_page =
            gtk_stack_get_child_by_name(GTK_STACK(state->clock_stack), "digital");
        if (digital_page)
            gtk_widget_set_opacity(digital_page, state->settings.brightness);
    }
}

/* ── Digital style ──────────────────────────────────────────────────────── */

static gboolean uses_canvas_display(DigitalStyle style)
{
    return style == DIGITAL_STYLE_SEVEN_SEGMENT ||
           style == DIGITAL_STYLE_DOT_MATRIX;
}

void main_window_apply_digital_style(AppState *state)
{
    DigitalStyle s = state->settings.digital_style;

    if (state->seven_seg_area)
        gtk_widget_set_visible(state->seven_seg_area,
                               s == DIGITAL_STYLE_SEVEN_SEGMENT);
    if (state->dot_matrix_area)
        gtk_widget_set_visible(state->dot_matrix_area,
                               s == DIGITAL_STYLE_DOT_MATRIX);
    if (state->ampm_label_seg)
        gtk_widget_set_visible(state->ampm_label_seg,
                               uses_canvas_display(s));

    GtkWidget *text_box = NULL;
    if (state->clock_stack) {
        GtkWidget *dp =
            gtk_stack_get_child_by_name(GTK_STACK(state->clock_stack), "digital");
        /* The text_time_label is inside the digital page */
        (void)dp;
    }

    if (state->text_time_label)
        gtk_widget_set_visible(state->text_time_label,
                               !uses_canvas_display(s));
    if (state->ampm_label_text)
        gtk_widget_set_visible(state->ampm_label_text,
                               !uses_canvas_display(s));

    /* Apply font to text label */
    if (state->text_time_label && !uses_canvas_display(s)) {
        const char *font_css = NULL;
        switch (s) {
        case DIGITAL_STYLE_MINIMAL:
            font_css = "label.time-text { font-family: 'Segoe UI', 'Ubuntu', sans-serif;"
                       " font-weight: 200; font-size: 72px; }";
            break;
        case DIGITAL_STYLE_RETRO:
            font_css = "label.time-text { font-family: 'Courier New', monospace;"
                       " font-weight: 400; font-size: 56px; }";
            break;
        case DIGITAL_STYLE_NEON:
            font_css = "label.time-text { font-family: 'Consolas', 'DejaVu Sans Mono', monospace;"
                       " font-weight: 700; font-size: 64px; }";
            break;
        case DIGITAL_STYLE_KOREAN:
            font_css = "label.time-text { font-family: 'Noto Sans CJK KR', 'Malgun Gothic', sans-serif;"
                       " font-weight: 600; font-size: 36px; }";
            break;
        case DIGITAL_STYLE_MATRIX:
            font_css = "label.time-text { font-family: 'Consolas', 'DejaVu Sans Mono', monospace;"
                       " font-weight: 700; font-size: 58px; }";
            break;
        case DIGITAL_STYLE_VINTAGE:
            font_css = "label.time-text { font-family: 'Georgia', serif;"
                       " font-weight: 400; font-size: 54px; }";
            break;
        case DIGITAL_STYLE_THIN:
            font_css = "label.time-text { font-family: 'Segoe UI', 'Ubuntu', sans-serif;"
                       " font-weight: 100; font-size: 76px; }";
            break;
        default: /* LCD */
            font_css = "label.time-text { font-family: 'Consolas', 'DejaVu Sans Mono', monospace;"
                       " font-weight: 700; font-size: 60px; }";
            break;
        }
        if (font_css) {
            GtkCssProvider *p = gtk_css_provider_new();
            gtk_css_provider_load_from_string(p, font_css);
            gtk_style_context_add_provider(
                gtk_widget_get_style_context(state->text_time_label),
                GTK_STYLE_PROVIDER(p),
                GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
            g_object_unref(p);
        }
    }

    main_window_update_clock(state);
}

void main_window_apply_analog_style(AppState *state)
{
    if (state->analog_area)
        gtk_widget_queue_draw(state->analog_area);
}

/* ── Clock mode toggle ──────────────────────────────────────────────────── */

void main_window_toggle_clock_mode(AppState *state)
{
    state->settings.is_digital = !state->settings.is_digital;

    if (state->clock_stack) {
        gtk_stack_set_visible_child_name(
            GTK_STACK(state->clock_stack),
            state->settings.is_digital ? "digital" : "analog");
    }

    main_window_update_clock(state);
    settings_save(&state->settings);
}

/* ── Korean time text ───────────────────────────────────────────────────── */

static const char *KOREAN_HOURS[] = {
    "열두", "한", "두", "세", "네", "다섯",
    "여섯", "일곱", "여덟", "아홉", "열", "열한", "열두"
};

static void format_korean_time(char *buf, size_t n,
                               int hour, int min, int sec, gboolean show_sec)
{
    int h12 = hour % 12;
    const char *ampm = (hour < 12) ? "오전 " : "오후 ";
    if (min == 0 && (!show_sec || sec == 0)) {
        snprintf(buf, n, "%s%s시", ampm, KOREAN_HOURS[h12]);
    } else if (!show_sec || sec == 0) {
        snprintf(buf, n, "%s%s시 %d분", ampm, KOREAN_HOURS[h12], min);
    } else {
        snprintf(buf, n, "%s%s시 %d분 %d초", ampm, KOREAN_HOURS[h12], min, sec);
    }
}

/* ── Clock update ───────────────────────────────────────────────────────── */

static void set_ampm_text(AppState *state, const char *ampm)
{
    if (state->ampm_label_seg)
        gtk_label_set_text(GTK_LABEL(state->ampm_label_seg), ampm ? ampm : "");
    if (state->ampm_label_text)
        gtk_label_set_text(GTK_LABEL(state->ampm_label_text), ampm ? ampm : "");
}

static void update_digital(AppState *state, GDateTime *now)
{
    int hour = g_date_time_get_hour(now);
    int min  = g_date_time_get_minute(now);
    int sec  = g_date_time_get_second(now);

    const char *ampm = state->settings.use24h ? "" :
                       (hour < 12 ? "오전" : "오후");

    DigitalStyle style = state->settings.digital_style;
    gboolean show_sec  = (style != DIGITAL_STYLE_MINIMAL);

    if (uses_canvas_display(style)) {
        set_ampm_text(state, ampm);
        char buf[32];
        if (state->settings.use24h)
            snprintf(buf, sizeof(buf), "%02d:%02d:%02d", hour, min, sec);
        else
            snprintf(buf, sizeof(buf), "%02d:%02d:%02d", hour % 12 ? hour % 12 : 12, min, sec);

        if (style == DIGITAL_STYLE_SEVEN_SEGMENT && state->seven_seg_area)
            g_object_set_data_full(G_OBJECT(state->seven_seg_area),
                                   "text", g_strdup(buf), g_free);
        else if (style == DIGITAL_STYLE_DOT_MATRIX && state->dot_matrix_area)
            g_object_set_data_full(G_OBJECT(state->dot_matrix_area),
                                   "text", g_strdup(buf), g_free);

        if (state->seven_seg_area) gtk_widget_queue_draw(state->seven_seg_area);
        if (state->dot_matrix_area) gtk_widget_queue_draw(state->dot_matrix_area);
    } else {
        set_ampm_text(state, ampm);
        char buf[64];

        if (style == DIGITAL_STYLE_KOREAN) {
            format_korean_time(buf, sizeof(buf), hour, min, sec, show_sec);
        } else {
            if (state->settings.use24h) {
                if (show_sec)
                    snprintf(buf, sizeof(buf), "%02d:%02d:%02d", hour, min, sec);
                else
                    snprintf(buf, sizeof(buf), "%02d:%02d", hour, min);
            } else {
                int h12 = hour % 12 ? hour % 12 : 12;
                if (show_sec)
                    snprintf(buf, sizeof(buf), "%02d:%02d:%02d", h12, min, sec);
                else
                    snprintf(buf, sizeof(buf), "%02d:%02d", h12, min);
            }
        }

        if (state->text_time_label)
            gtk_label_set_text(GTK_LABEL(state->text_time_label), buf);
    }

    if (state->status_label)
        gtk_label_set_text(GTK_LABEL(state->status_label), "");
}

static void update_analog(AppState *state, GDateTime *now)
{
    if (state->analog_area)
        gtk_widget_queue_draw(state->analog_area);

    if (state->status_label) {
        char buf[32];
        if (state->settings.use24h) {
            int h = g_date_time_get_hour(now);
            int m = g_date_time_get_minute(now);
            int s = g_date_time_get_second(now);
            snprintf(buf, sizeof(buf), "%02d:%02d:%02d", h, m, s);
        } else {
            int h = g_date_time_get_hour(now);
            int m = g_date_time_get_minute(now);
            int s = g_date_time_get_second(now);
            const char *ap = h < 12 ? "오전" : "오후";
            snprintf(buf, sizeof(buf), "%s %02d:%02d:%02d",
                     ap, h % 12 ? h % 12 : 12, m, s);
        }
        gtk_label_set_text(GTK_LABEL(state->status_label), buf);
    }
}

void main_window_update_clock(AppState *state)
{
    GDateTime *now = g_date_time_new_now_local();

    /* Check if any timer is active */
    TimerService *active = NULL;
    for (int i = 0; i < MAX_TIMERS; i++) {
        if (state->timers[i].state == TIMER_STATE_RUNNING ||
            state->timers[i].state == TIMER_STATE_PAUSED) {
            active = &state->timers[i];
            break;
        }
    }

    if (active) {
        int h, m, s;
        timer_service_get_remaining_hms(active, &h, &m, &s);
        char buf[32];
        snprintf(buf, sizeof(buf), "%02d:%02d:%02d", h, m, s);
        const char *ap = active->state == TIMER_STATE_PAUSED ? "일시정지" : "타이머";
        if (uses_canvas_display(state->settings.digital_style)) {
            set_ampm_text(state, ap);
            if (state->seven_seg_area)
                g_object_set_data_full(G_OBJECT(state->seven_seg_area),
                                       "text", g_strdup(buf), g_free);
            if (state->dot_matrix_area)
                g_object_set_data_full(G_OBJECT(state->dot_matrix_area),
                                       "text", g_strdup(buf), g_free);
        } else {
            set_ampm_text(state, ap);
            if (state->text_time_label)
                gtk_label_set_text(GTK_LABEL(state->text_time_label), buf);
        }
        if (state->seven_seg_area)  gtk_widget_queue_draw(state->seven_seg_area);
        if (state->dot_matrix_area) gtk_widget_queue_draw(state->dot_matrix_area);
        if (state->status_label)
            gtk_label_set_text(GTK_LABEL(state->status_label), "타이머");
    } else if (state->settings.is_digital) {
        update_digital(state, now);
    } else {
        update_analog(state, now);
    }

    /* Update header date */
    if (state->header_label) {
        char date_buf[64];
        GDateTime *dt = g_date_time_new_now_local();
        /* Format: "2025년 06월 10일  화" */
        gchar *formatted = g_date_time_format(dt, "%Y년 %m월 %d일  %a");
        gtk_label_set_text(GTK_LABEL(state->header_label), formatted);
        g_free(formatted);
        g_date_time_unref(dt);
    }

    g_date_time_unref(now);
}

/* ── Alarm check ────────────────────────────────────────────────────────── */

static void check_alarms(AppState *state, GDateTime *now)
{
    int cur_h = g_date_time_get_hour(now);
    int cur_m = g_date_time_get_minute(now);
    int cur_s = g_date_time_get_second(now);

    for (int i = 0; i < state->settings.alarm_count; i++) {
        AlarmItem *alarm = &state->settings.alarms[i];
        if (!alarm->is_enabled) continue;

        if (alarm->hour == cur_h && alarm->minute == cur_m && cur_s == 0) {
            gboolean should_fire;
            if (!alarm->is_repeat) {
                should_fire = TRUE;
            } else {
                int dow = g_date_time_get_day_of_week(now) % 7; /* 0=Sun..6=Sat */
                should_fire = (alarm->repeat_days & (1 << dow)) != 0;
            }

            if (should_fire) {
                if (!g_hash_table_contains(state->fired_alarms, alarm->id)) {
                    g_hash_table_insert(state->fired_alarms,
                                        g_strdup(alarm->id),
                                        GINT_TO_POINTER(1));
                    char time_str[16];
                    snprintf(time_str, sizeof(time_str), "%02d:%02d",
                             alarm->hour, alarm->minute);
                    show_alarm_notification(state, time_str,
                                            alarm->label[0] ? alarm->label : time_str,
                                            "알람");
                    if (!alarm->is_repeat)
                        alarm->is_enabled = FALSE;
                }
            }
        } else if (alarm->hour != cur_h || alarm->minute != cur_m) {
            g_hash_table_remove(state->fired_alarms, alarm->id);
        }
    }
}

static void show_alarm_notification(AppState *state,
                                    const char *time_str,
                                    const char *label,
                                    const char *header)
{
    alarm_notification_show(GTK_WINDOW(state->main_window),
                            time_str, label, header);
}

/* ── Tick callback ──────────────────────────────────────────────────────── */

static gboolean tick_cb(gpointer data)
{
    AppState *state = (AppState *)data;
    GDateTime *now = g_date_time_new_now_local();

    /* Check timer completions */
    for (int i = 0; i < MAX_TIMERS; i++) {
        TimerService *svc = &state->timers[i];
        if (svc->state == TIMER_STATE_RUNNING) {
            gint64 remain = timer_service_remaining_us(svc);
            if (remain <= 0) {
                svc->state = TIMER_STATE_IDLE;
                gint64 total = (gint64)svc->set_hours   * 3600000000LL
                             + (gint64)svc->set_minutes * 60000000LL
                             + (gint64)svc->set_seconds * 1000000LL;
                int th = (int)(total / 3600000000LL);
                int tm = (int)((total % 3600000000LL) / 60000000LL);
                int ts = (int)((total % 60000000LL)   / 1000000LL);
                char time_str[32];
                snprintf(time_str, sizeof(time_str), "%02d:%02d:%02d", th, tm, ts);
                const char *lbl = svc->label[0] ? svc->label : time_str;
                show_alarm_notification(state, time_str, lbl, "타이머 완료");
            }
        }
    }

    main_window_update_clock(state);
    check_alarms(state, now);

    /* Update world times in side panel */
    if (state->side_open && state->side_panel)
        side_panel_update_world_times(state);

    g_date_time_unref(now);
    return G_SOURCE_CONTINUE;
}

/* ── Seven-segment draw callback ─────────────────────────────────────────── */

static void seg_draw_func(GtkDrawingArea *area, cairo_t *cr,
                          int width, int height, gpointer data)
{
    AppState *state = (AppState *)data;
    const char *text = g_object_get_data(G_OBJECT(area), "text");
    if (!text || !text[0]) return;

    double r = state->settings.digit_r;
    double g = state->settings.digit_g;
    double b = state->settings.digit_b;
    double bright = state->settings.brightness;

    /* Fit scale to available space */
    int char_count = 0;
    for (const char *p = text; *p; p++) char_count++;

    /* Design: DW=52, CG=12, CW=24 → estimate total design width */
    double design_w = 0;
    for (const char *p = text; *p; p++) {
        if (*p == ':') design_w += 24;
        else           design_w += 52 + 12;
    }
    if (design_w > 12) design_w -= 12;
    double design_h = 96.0;

    double scale_x = width  / design_w;
    double scale_y = height / design_h;
    double scale   = fmin(scale_x, scale_y) * 0.9;

    double total_w = design_w * scale;
    double total_h = design_h * scale;
    double ox = (width  - total_w) / 2.0;
    double oy = (height - total_h) / 2.0;

    cairo_set_operator(cr, CAIRO_OPERATOR_OVER);
    seven_segment_draw(cr, text, ox, oy, scale,
                       r * bright, g * bright, b * bright, 0.08);
}

/* ── Dot-matrix draw callback ─────────────────────────────────────────────── */

static void dot_draw_func(GtkDrawingArea *area, cairo_t *cr,
                          int width, int height, gpointer data)
{
    AppState *state = (AppState *)data;
    const char *text = g_object_get_data(G_OBJECT(area), "text");
    if (!text || !text[0]) return;

    /* 5 cols × 7 rows per char, 1 gap col between chars */
    int chars = 0;
    int colons = 0;
    for (const char *p = text; *p; p++) {
        if (*p == ':') colons++;
        else chars++;
    }
    int total_cols = chars * 6 + colons * 3 + (chars + colons - 1);
    if (total_cols <= 0) total_cols = 1;

    double dot = fmin((double)width / (total_cols * 1.5 + 1),
                      (double)height / 9.0);
    double gap = dot * 0.4;

    double r = state->settings.digit_r * state->settings.brightness;
    double g = state->settings.digit_g * state->settings.brightness;
    double b = state->settings.digit_b * state->settings.brightness;

    double total_w = dot_matrix_draw(cr, text, 0, 0, dot, gap, 0, 0, 0, 0);
    double oy = (height - (dot * 7 + gap * 6)) / 2.0;
    double ox = (width  - total_w) / 2.0;

    dot_matrix_draw(cr, text, ox, oy, dot, gap, r, g, b, 0.06);
}

/* ── Analog clock draw callback ─────────────────────────────────────────── */

static void analog_draw_func(GtkDrawingArea *area, cairo_t *cr,
                             int width, int height, gpointer data)
{
    AppState *state = (AppState *)data;
    (void)area;

    GDateTime *now = g_date_time_new_now_local();
    ClockColors colors;
    clock_colors_from_state(state, &colors);
    analog_clock_draw(cr, width, height, now, state->settings.analog_style, &colors);
    g_date_time_unref(now);
}

/* ── Side panel toggle ──────────────────────────────────────────────────── */

void main_window_toggle_side_panel(AppState *state)
{
    if (state->side_open) {
        if (state->side_panel) {
            gtk_widget_set_visible(state->side_panel, FALSE);
        }
        state->side_open = FALSE;
    } else {
        if (!state->side_panel) {
            state->side_panel = side_panel_new(state);
        }
        gtk_widget_set_visible(state->side_panel, TRUE);
        gtk_window_present(GTK_WINDOW(state->side_panel));
        state->side_open = TRUE;
    }
}

/* ── Context menu ───────────────────────────────────────────────────────── */

static void on_ctx_settings(GSimpleAction *a, GVariant *p, gpointer data)
{
    (void)a; (void)p;
    main_window_toggle_side_panel((AppState *)data);
}

static void on_ctx_toggle_mode(GSimpleAction *a, GVariant *p, gpointer data)
{
    (void)a; (void)p;
    main_window_toggle_clock_mode((AppState *)data);
}

static void on_ctx_always_on_top(GSimpleAction *a, GVariant *p, gpointer data)
{
    (void)a; (void)p;
    AppState *state = (AppState *)data;
    state->settings.always_on_top = !state->settings.always_on_top;
    gtk_window_set_keep_above(GTK_WINDOW(state->main_window),
                              state->settings.always_on_top);
    settings_save(&state->settings);
}

static void on_ctx_quit(GSimpleAction *a, GVariant *p, gpointer data)
{
    (void)a; (void)p;
    AppState *state = (AppState *)data;
    settings_save(&state->settings);
    g_application_quit(G_APPLICATION(state->app));
}

/* ── Drag-to-move ───────────────────────────────────────────────────────── */

static void on_drag_begin(GtkGestureDrag *gesture, double x, double y, gpointer data)
{
    (void)gesture;
    AppState *state = (AppState *)data;
    state->dragging = TRUE;
    state->drag_start_x = x;
    state->drag_start_y = y;

    double wx, wy;
    gtk_window_get_position(GTK_WINDOW(state->main_window), NULL, NULL);
    /* GTK4: no direct get_position, use surface geometry */
    state->win_start_x = 0;
    state->win_start_y = 0;
}

static void on_drag_update(GtkGestureDrag *gesture, double dx, double dy, gpointer data)
{
    (void)gesture;
    AppState *state = (AppState *)data;
    if (!state->dragging) return;

    /* On X11, move the window; on Wayland use begin_move_drag */
}

static void on_drag_end(GtkGestureDrag *gesture, double dx, double dy, gpointer data)
{
    (void)gesture; (void)dx; (void)dy;
    AppState *state = (AppState *)data;
    state->dragging = FALSE;
}

/* ── Right-click context menu ───────────────────────────────────────────── */

static void on_right_click(GtkGestureClick *gesture, int n_press,
                           double x, double y, gpointer data)
{
    (void)n_press;
    AppState *state = (AppState *)data;

    GMenu *menu = g_menu_new();

    gboolean panel_open = state->side_open;
    g_menu_append(menu,
                  panel_open ? "설정 닫기" : "설정...",
                  "win.settings");

    g_menu_append(menu,
                  state->settings.is_digital ? "아날로그 전환" : "디지털 전환",
                  "win.toggle_mode");

    g_menu_append(menu,
                  state->settings.always_on_top ? "항상 위 해제" : "항상 위",
                  "win.always_on_top");

    g_menu_append(menu, "종료", "win.quit");

    GtkWidget *popover = gtk_popover_menu_new_from_model(G_MENU_MODEL(menu));
    gtk_widget_set_parent(popover, state->main_window);
    gtk_popover_set_has_arrow(GTK_POPOVER(popover), FALSE);

    GdkRectangle rect = { (int)x, (int)y, 1, 1 };
    gtk_popover_set_pointing_to(GTK_POPOVER(popover), &rect);
    gtk_popover_popup(GTK_POPOVER(popover));

    g_object_unref(menu);

    /* Dismiss gesture */
    gtk_gesture_set_state(GTK_GESTURE(gesture), GTK_EVENT_SEQUENCE_CLAIMED);
}

/* ── Left-click drag for window move ──────────────────────────────────────── */

static void on_left_press(GtkGestureClick *gesture, int n_press,
                          double x, double y, gpointer data)
{
    (void)n_press; (void)x; (void)y;
    AppState *state = (AppState *)data;

    GdkEvent *event = gtk_gesture_get_last_event(GTK_GESTURE(gesture), NULL);
    guint32 timestamp = event ? gdk_event_get_time(event) : GDK_CURRENT_TIME;

    gtk_window_begin_move_drag(GTK_WINDOW(state->main_window),
                               GDK_BUTTON_PRIMARY,
                               (int)x, (int)y, timestamp);

    gtk_gesture_set_state(GTK_GESTURE(gesture), GTK_EVENT_SEQUENCE_CLAIMED);
}

/* ── Window construction ────────────────────────────────────────────────── */

GtkWidget *main_window_new(AppState *state)
{
    /* Create application window */
    GtkWidget *win = gtk_application_window_new(state->app);
    state->main_window = win;
    gtk_window_set_title(GTK_WINDOW(win), "MyClock");
    gtk_window_set_decorated(GTK_WINDOW(win), FALSE);
    gtk_window_set_resizable(GTK_WINDOW(win), TRUE);

    /* Window size */
    double w = state->settings.is_digital
               ? state->settings.digital_w
               : state->settings.analog_w;
    double h = state->settings.is_digital
               ? state->settings.digital_h
               : state->settings.analog_h;
    if (w < 140) w = 300;
    if (h < 50)  h = 120;
    gtk_window_set_default_size(GTK_WINDOW(win), (int)w, (int)h);

    if (state->settings.always_on_top)
        gtk_window_set_keep_above(GTK_WINDOW(win), TRUE);

    /* GActions for context menu */
    GSimpleAction *act_settings = g_simple_action_new("settings", NULL);
    g_signal_connect(act_settings, "activate", G_CALLBACK(on_ctx_settings), state);
    g_action_map_add_action(G_ACTION_MAP(win), G_ACTION(act_settings));

    GSimpleAction *act_toggle = g_simple_action_new("toggle_mode", NULL);
    g_signal_connect(act_toggle, "activate", G_CALLBACK(on_ctx_toggle_mode), state);
    g_action_map_add_action(G_ACTION_MAP(win), G_ACTION(act_toggle));

    GSimpleAction *act_aot = g_simple_action_new("always_on_top", NULL);
    g_signal_connect(act_aot, "activate", G_CALLBACK(on_ctx_always_on_top), state);
    g_action_map_add_action(G_ACTION_MAP(win), G_ACTION(act_aot));

    GSimpleAction *act_quit = g_simple_action_new("quit", NULL);
    g_signal_connect(act_quit, "activate", G_CALLBACK(on_ctx_quit), state);
    g_action_map_add_action(G_ACTION_MAP(win), G_ACTION(act_quit));

    /* Main overlay for layering */
    GtkWidget *overlay = gtk_overlay_new();
    gtk_window_set_child(GTK_WINDOW(win), overlay);

    /* ── Clock stack ── */
    GtkWidget *stack = gtk_stack_new();
    gtk_stack_set_transition_type(GTK_STACK(stack), GTK_STACK_TRANSITION_TYPE_CROSSFADE);
    gtk_stack_set_transition_duration(GTK_STACK(stack), 150);
    gtk_widget_set_hexpand(stack, TRUE);
    gtk_widget_set_vexpand(stack, TRUE);
    gtk_overlay_set_child(GTK_OVERLAY(overlay), stack);
    state->clock_stack = stack;

    /* ── Digital page ── */
    GtkWidget *digital_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_widget_set_halign(digital_box, GTK_ALIGN_FILL);
    gtk_widget_set_valign(digital_box, GTK_ALIGN_FILL);
    gtk_widget_add_css_class(digital_box, "digital-page");

    /* Seven-segment area */
    GtkWidget *seg_area = gtk_drawing_area_new();
    gtk_widget_set_hexpand(seg_area, TRUE);
    gtk_widget_set_vexpand(seg_area, TRUE);
    gtk_drawing_area_set_draw_func(GTK_DRAWING_AREA(seg_area),
                                   seg_draw_func, state, NULL);
    g_object_set_data(G_OBJECT(seg_area), "text", g_strdup("00:00:00"));
    state->seven_seg_area = seg_area;
    gtk_box_append(GTK_BOX(digital_box), seg_area);

    /* Dot-matrix area */
    GtkWidget *dot_area = gtk_drawing_area_new();
    gtk_widget_set_hexpand(dot_area, TRUE);
    gtk_widget_set_vexpand(dot_area, TRUE);
    gtk_drawing_area_set_draw_func(GTK_DRAWING_AREA(dot_area),
                                   dot_draw_func, state, NULL);
    g_object_set_data(G_OBJECT(dot_area), "text", g_strdup("00:00:00"));
    state->dot_matrix_area = dot_area;
    gtk_box_append(GTK_BOX(digital_box), dot_area);

    /* Text time label (for non-canvas digital styles) */
    GtkWidget *text_label = gtk_label_new("00:00:00");
    gtk_widget_set_hexpand(text_label, TRUE);
    gtk_widget_set_vexpand(text_label, TRUE);
    gtk_widget_set_halign(text_label, GTK_ALIGN_CENTER);
    gtk_widget_set_valign(text_label, GTK_ALIGN_CENTER);
    gtk_widget_add_css_class(text_label, "time-text");
    state->text_time_label = text_label;
    gtk_box_append(GTK_BOX(digital_box), text_label);

    /* AM/PM label for segment/dot modes */
    GtkWidget *ampm_seg = gtk_label_new("");
    gtk_widget_add_css_class(ampm_seg, "ampm-label");
    state->ampm_label_seg = ampm_seg;
    gtk_box_append(GTK_BOX(digital_box), ampm_seg);

    /* AM/PM label for text modes */
    GtkWidget *ampm_text = gtk_label_new("");
    gtk_widget_add_css_class(ampm_text, "ampm-label");
    state->ampm_label_text = ampm_text;
    gtk_box_append(GTK_BOX(digital_box), ampm_text);

    gtk_stack_add_named(GTK_STACK(stack), digital_box, "digital");

    /* ── Analog page ── */
    GtkWidget *analog_area = gtk_drawing_area_new();
    gtk_widget_set_hexpand(analog_area, TRUE);
    gtk_widget_set_vexpand(analog_area, TRUE);
    gtk_drawing_area_set_draw_func(GTK_DRAWING_AREA(analog_area),
                                   analog_draw_func, state, NULL);
    state->analog_area = analog_area;
    gtk_stack_add_named(GTK_STACK(stack), analog_area, "analog");

    /* ── Chrome overlay (hover UI) ── */
    GtkWidget *chrome = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_widget_set_halign(chrome, GTK_ALIGN_FILL);
    gtk_widget_set_valign(chrome, GTK_ALIGN_FILL);
    gtk_widget_add_css_class(chrome, "chrome-overlay");

    GtkWidget *header_lbl = gtk_label_new("");
    gtk_widget_add_css_class(header_lbl, "header-date");
    gtk_widget_set_halign(header_lbl, GTK_ALIGN_CENTER);
    gtk_box_append(GTK_BOX(chrome), header_lbl);
    state->header_label = header_lbl;

    GtkWidget *spacer = gtk_label_new("");
    gtk_widget_set_vexpand(spacer, TRUE);
    gtk_box_append(GTK_BOX(chrome), spacer);

    GtkWidget *status_lbl = gtk_label_new("");
    gtk_widget_add_css_class(status_lbl, "status-label");
    gtk_widget_set_halign(status_lbl, GTK_ALIGN_CENTER);
    gtk_box_append(GTK_BOX(chrome), status_lbl);
    state->status_label = status_lbl;

    gtk_overlay_add_overlay(GTK_OVERLAY(overlay), chrome);
    gtk_widget_set_can_target(chrome, FALSE);
    state->chrome_box = chrome;

    /* Gesture: left-click to move window */
    GtkGestureClick *left_click = GTK_GESTURE_CLICK(gtk_gesture_click_new());
    gtk_gesture_single_set_button(GTK_GESTURE_SINGLE(left_click), GDK_BUTTON_PRIMARY);
    g_signal_connect(left_click, "pressed", G_CALLBACK(on_left_press), state);
    gtk_widget_add_controller(win, GTK_EVENT_CONTROLLER(left_click));

    /* Gesture: right-click for context menu */
    GtkGestureClick *right_click = GTK_GESTURE_CLICK(gtk_gesture_click_new());
    gtk_gesture_single_set_button(GTK_GESTURE_SINGLE(right_click), GDK_BUTTON_SECONDARY);
    g_signal_connect(right_click, "pressed", G_CALLBACK(on_right_click), state);
    gtk_widget_add_controller(win, GTK_EVENT_CONTROLLER(right_click));

    /* Apply initial mode */
    gtk_stack_set_visible_child_name(GTK_STACK(stack),
        state->settings.is_digital ? "digital" : "analog");

    /* Apply theme and styles */
    main_window_apply_theme(state);
    main_window_apply_digital_style(state);
    main_window_apply_analog_style(state);
    main_window_apply_brightness(state);

    /* Load base CSS */
    GtkCssProvider *base_css = gtk_css_provider_new();
    gchar *base_path = g_build_filename(g_get_current_dir(), "data/myclock.css", NULL);
    if (g_file_test(base_path, G_FILE_TEST_EXISTS))
        gtk_css_provider_load_from_path(base_css, base_path);
    gtk_style_context_add_provider_for_display(
        gdk_display_get_default(),
        GTK_STYLE_PROVIDER(base_css),
        GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    g_free(base_path);

    /* Start tick timer (every second) */
    state->tick_source = g_timeout_add_seconds(1, tick_cb, state);

    /* Initial update */
    main_window_update_clock(state);

    return win;
}
