#include <gtk/gtk.h>
#ifdef GDK_WINDOWING_X11
#  include <gdk/x11/gdkx.h>
#  include <X11/Xlib.h>
#endif
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

#define EDGE_ZONE 8  /* pixels from edge to trigger resize */

/* ── Theme CSS file paths ────────────────────────────────────────────────── */

static const char *THEME_CSS_NAMES[THEME_COUNT] = {
    "themes/dark.css",
    "themes/light.css",
    "themes/midnight.css",
    "themes/ocean.css",
    "themes/ruby.css",
    "themes/emerald.css",
    "themes/purple.css",
    "themes/amber.css",
    "themes/rose.css",
    "themes/mono.css",
    "themes/sunset.css",
    "themes/mint.css",
};

/* Search for a data file in CWD/data, installed DATADIR, or next to binary */
static gchar *find_data_file(const char *rel)
{
    gchar *p;

    p = g_build_filename(g_get_current_dir(), "data", rel, NULL);
    if (g_file_test(p, G_FILE_TEST_EXISTS)) return p;
    g_free(p);

#ifdef MYCLOCK_PKGDATADIR
    p = g_build_filename(MYCLOCK_PKGDATADIR, rel, NULL);
    if (g_file_test(p, G_FILE_TEST_EXISTS)) return p;
    g_free(p);
#endif

    /* Try next to the executable */
    const char *prog = g_get_prgname();
    if (prog && g_path_is_absolute(prog)) {
        gchar *dir = g_path_get_dirname(prog);
        p = g_build_filename(dir, "data", rel, NULL);
        g_free(dir);
        if (g_file_test(p, G_FILE_TEST_EXISTS)) return p;
        g_free(p);
    }

    return NULL;
}

/* ── Forward declarations ───────────────────────────────────────────────── */

static gboolean tick_cb(gpointer data);
static void     update_digital(AppState *state, GDateTime *now);
static void     update_analog(AppState *state, GDateTime *now);
static void     check_alarms(AppState *state, GDateTime *now);
static void     show_alarm_notification(AppState *state,
                                        const char *time_str,
                                        const char *label,
                                        const char *header);
static void     save_current_geometry(AppState *state);

#ifdef GDK_WINDOWING_X11
typedef struct { GtkWidget *window; int tx, ty, tw, th; } RestoreGeom;
static gboolean deferred_restore(gpointer data)
{
    RestoreGeom *rg = data;
    GdkDisplay *display = gdk_display_get_default();
    GdkSurface *surface = gtk_native_get_surface(GTK_NATIVE(rg->window));
    if (GDK_IS_X11_DISPLAY(display) && surface) {
        Display *xdpy = gdk_x11_display_get_xdisplay(display);
        Window xwin = gdk_x11_surface_get_xid(surface);
        XMoveResizeWindow(xdpy, xwin, rg->tx, rg->ty, rg->tw, rg->th);
        XFlush(xdpy);
    }
    g_free(rg);
    return G_SOURCE_REMOVE;
}
#endif

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

    gchar *path = find_data_file(THEME_CSS_NAMES[state->settings.theme]);
    if (path) {
        gtk_css_provider_load_from_path(state->theme_provider, path);
        g_free(path);
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
    /* Widget opacity covers text-based digital styles */
    if (state->clock_stack) {
        GtkWidget *digital_page =
            gtk_stack_get_child_by_name(GTK_STACK(state->clock_stack), "digital");
        if (digital_page)
            gtk_widget_set_opacity(digital_page, state->settings.brightness);
    }
    /* Canvas-based styles multiply brightness into segment colors at draw time */
    if (state->seven_seg_area)
        gtk_widget_queue_draw(state->seven_seg_area);
    if (state->dot_matrix_area)
        gtk_widget_queue_draw(state->dot_matrix_area);
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
    if (state->text_time_label)
        gtk_widget_set_visible(state->text_time_label,
                               !uses_canvas_display(s));
    /* ampm_label_seg is always visible; content controlled by set_ampm_text */

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
            if (!state->font_provider) {
                state->font_provider = gtk_css_provider_new();
                gtk_style_context_add_provider_for_display(
                    gdk_display_get_default(),
                    GTK_STYLE_PROVIDER(state->font_provider),
                    GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
            }
            gtk_css_provider_load_from_string(state->font_provider, font_css);
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
    /* Save current window geometry for the mode we are leaving */
    save_current_geometry(state);

    state->settings.is_digital = !state->settings.is_digital;

    if (state->clock_stack) {
        gtk_stack_set_visible_child_name(
            GTK_STACK(state->clock_stack),
            state->settings.is_digital ? "digital" : "analog");
    }

    /* Restore saved size for the mode we are entering */
    int nw = (int)(state->settings.is_digital
                   ? state->settings.digital_w : state->settings.analog_w);
    int nh = (int)(state->settings.is_digital
                   ? state->settings.digital_h : state->settings.analog_h);
    if (state->settings.is_digital) {
        if (nw < 140) nw = 300;
        if (nh < 60)  nh = 90;
    } else {
        if (nw < 140) nw = 300;
        if (nh < 140) nh = 160;
    }

#ifdef GDK_WINDOWING_X11
    {
        GdkDisplay *display = gdk_display_get_default();
        GdkSurface *surface = gtk_native_get_surface(GTK_NATIVE(state->main_window));
        if (GDK_IS_X11_DISPLAY(display) && surface) {
            Display *xdpy = gdk_x11_display_get_xdisplay(display);
            Window   xwin  = gdk_x11_surface_get_xid(surface);
            gboolean pos_saved = state->settings.is_digital
                                 ? state->settings.digital_pos_saved
                                 : state->settings.analog_pos_saved;
            int tx = (int)(state->settings.is_digital
                           ? state->settings.digital_x : state->settings.analog_x);
            int ty = (int)(state->settings.is_digital
                           ? state->settings.digital_y : state->settings.analog_y);
            if (pos_saved)
                XMoveResizeWindow(xdpy, xwin, tx, ty, nw, nh);
            else
                XResizeWindow(xdpy, xwin, nw, nh);
        }
    }
#endif
    gtk_window_set_default_size(GTK_WINDOW(state->main_window), nw, nh);

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
        char buf[64];

        if (style == DIGITAL_STYLE_KOREAN) {
            /* Korean time text already includes AM/PM; clear the separate label */
            set_ampm_text(state, "");
            format_korean_time(buf, sizeof(buf), hour, min, sec, show_sec);
        } else {
            set_ampm_text(state, ampm);
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
    (void)now;
    if (state->analog_area)
        gtk_widget_queue_draw(state->analog_area);

    if (state->status_label)
        gtk_label_set_text(GTK_LABEL(state->status_label), "");
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

    /* Update date labels (always-visible per-page labels at top) */
    {
        GDateTime *dt = g_date_time_new_now_local();
        gchar *formatted = g_date_time_format(dt, "%Y년 %m월 %d일  %a");
        if (state->date_label_digital)
            gtk_label_set_text(GTK_LABEL(state->date_label_digital), formatted);
        if (state->date_label_analog)
            gtk_label_set_text(GTK_LABEL(state->date_label_analog), formatted);
        g_free(formatted);
        g_date_time_unref(dt);
    }

    g_date_time_unref(now);
}

/* ── Alarm check ────────────────────────────────────────────────────────── */

static void check_alarms(AppState *state, GDateTime *now)
{
    int cur_y = g_date_time_get_year(now);
    int cur_mo = g_date_time_get_month(now);
    int cur_d  = g_date_time_get_day_of_month(now);
    int cur_h  = g_date_time_get_hour(now);
    int cur_m  = g_date_time_get_minute(now);
    int cur_s  = g_date_time_get_second(now);

    for (int i = 0; i < state->settings.alarm_count; i++) {
        AlarmItem *alarm = &state->settings.alarms[i];
        if (!alarm->is_enabled) continue;

        if (alarm->hour != cur_h || alarm->minute != cur_m) {
            g_hash_table_remove(state->fired_alarms, alarm->id);
            continue;
        }
        if (cur_s != 0) continue;

        gboolean should_fire = FALSE;

        if (alarm->year > 0) {
            /* Calendar alarm: fire once on specific date */
            should_fire = (alarm->year  == cur_y &&
                           alarm->month == cur_mo &&
                           alarm->day   == cur_d);
        } else if (!alarm->is_repeat) {
            should_fire = TRUE;
        } else {
            int dow = g_date_time_get_day_of_week(now) % 7; /* 0=Sun..6=Sat */
            should_fire = (alarm->repeat_days & (1 << dow)) != 0;
        }

        if (should_fire && !g_hash_table_contains(state->fired_alarms, alarm->id)) {
            g_hash_table_insert(state->fired_alarms,
                                g_strdup(alarm->id),
                                GINT_TO_POINTER(1));
            char time_str[32];
            if (alarm->year > 0)
                snprintf(time_str, sizeof(time_str), "%04d-%02d-%02d  %02d:%02d",
                         alarm->year, alarm->month, alarm->day,
                         alarm->hour, alarm->minute);
            else
                snprintf(time_str, sizeof(time_str), "%02d:%02d",
                         alarm->hour, alarm->minute);
            show_alarm_notification(state, time_str,
                                    alarm->label[0] ? alarm->label : time_str,
                                    "알람");
            /* Disable one-shot alarms after firing */
            if (!alarm->is_repeat)
                alarm->is_enabled = FALSE;
            settings_save(&state->settings);
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

/* ── Resize silhouette overlay draw callback ────────────────────────────── */

static void resize_overlay_draw_func(GtkDrawingArea *area, cairo_t *cr,
                                     int width, int height, gpointer data)
{
    (void)area; (void)cr; (void)width; (void)height; (void)data;
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

    const char *ampm = "";
    if (!state->settings.use24h) {
        int h = g_date_time_get_hour(now);
        ampm = h < 12 ? "오전" : "오후";
    }

    analog_clock_draw(cr, width, height, now, state->settings.analog_style,
                      &colors, TRUE, ampm);
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

/* ── Resize / hit-test helpers ──────────────────────────────────────────── */

/* Returns GdkSurfaceEdge (cast to int) for the resize zone, or -1 if none. */
static int hit_edge(AppState *state, double x, double y)
{
    int w = gtk_widget_get_width(state->main_window);
    int h = gtk_widget_get_height(state->main_window);
    gboolean lft = (x <= EDGE_ZONE);
    gboolean rgt = (x >= w - EDGE_ZONE);
    gboolean top = (y <= EDGE_ZONE);
    gboolean bot = (y >= h - EDGE_ZONE);
    if (top && lft) return GDK_SURFACE_EDGE_NORTH_WEST;
    if (top && rgt) return GDK_SURFACE_EDGE_NORTH_EAST;
    if (bot && lft) return GDK_SURFACE_EDGE_SOUTH_WEST;
    if (bot && rgt) return GDK_SURFACE_EDGE_SOUTH_EAST;
    if (top)        return GDK_SURFACE_EDGE_NORTH;
    if (bot)        return GDK_SURFACE_EDGE_SOUTH;
    if (lft)        return GDK_SURFACE_EDGE_WEST;
    if (rgt)        return GDK_SURFACE_EDGE_EAST;
    return -1;
}

/* Returns TRUE if (x,y) is in the clock's interactive zone.
   Analog: circular clock face.  Digital: inner rect (not edge margins). */
static gboolean in_hit_zone(AppState *state, double x, double y)
{
    int w = gtk_widget_get_width(state->main_window);
    int h = gtk_widget_get_height(state->main_window);
    if (state->settings.is_digital) {
        double m = EDGE_ZONE * 2.0;
        return x > m && x < w - m && y > m && y < h - m;
    } else {
        double cx = w * 0.5, cy = h * 0.5;
        double r  = fmin(w, h) * 0.5 - EDGE_ZONE;
        double dx = x - cx, dy = y - cy;
        return (dx * dx + dy * dy) <= (r * r);
    }
}

/* ── Hover transparency ──────────────────────────────────────────────────── */

static void on_hover_enter(GtkEventControllerMotion *ctrl,
                           double x, double y, gpointer data)
{
    (void)ctrl; (void)x; (void)y;
    AppState *state = (AppState *)data;
    state->is_hovered = TRUE;
    /* Clear lingering Wayland resize state; on X11 on_left_release handles this */
#ifdef GDK_WINDOWING_X11
    if (!GDK_IS_X11_DISPLAY(gdk_display_get_default()))
        state->manual_resizing = FALSE;
#else
    state->manual_resizing = FALSE;
#endif
    gtk_widget_set_opacity(state->main_window, 1.0);
    if (state->chrome_box)
        gtk_widget_set_visible(state->chrome_box, TRUE);
    if (state->analog_area)
        gtk_widget_queue_draw(state->analog_area);
}

static void on_hover_leave(GtkEventControllerMotion *ctrl, gpointer data)
{
    (void)ctrl;
    AppState *state = (AppState *)data;
    if (state->manual_resizing) return;
    state->is_hovered = FALSE;
    gtk_widget_set_opacity(state->main_window, 0.0);
    if (state->chrome_box)
        gtk_widget_set_visible(state->chrome_box, FALSE);
    if (state->analog_area)
        gtk_widget_queue_draw(state->analog_area);
}

static void on_motion(GtkEventControllerMotion *ctrl,
                      double x, double y, gpointer data)
{
    (void)ctrl;
    AppState *state = (AppState *)data;

#ifdef GDK_WINDOWING_X11
    /* Handle ongoing custom resize - move/resize window directly via X11 */
    if (state->manual_resizing) {
        GdkDisplay *display = gdk_display_get_default();
        GdkSurface *surf = gtk_native_get_surface(GTK_NATIVE(state->main_window));
        if (GDK_IS_X11_DISPLAY(display) && surf) {
            Display *xdpy = gdk_x11_display_get_xdisplay(display);
            Window   xwin = gdk_x11_surface_get_xid(surf);

            Window root_r, child_r;
            int abs_x, abs_y, rel_x, rel_y;
            unsigned int mask_r;
            XQueryPointer(xdpy, DefaultRootWindow(xdpy),
                          &root_r, &child_r, &abs_x, &abs_y, &rel_x, &rel_y, &mask_r);

            int dx = abs_x - state->resize_start_abs_x;
            int dy = abs_y - state->resize_start_abs_y;

            int nx = state->resize_start_win_x;
            int ny = state->resize_start_win_y;
            int nw = state->resize_start_win_w;
            int nh = state->resize_start_win_h;

            switch ((GdkSurfaceEdge)state->resize_edge_type) {
            case GDK_SURFACE_EDGE_EAST:       nw += dx;                          break;
            case GDK_SURFACE_EDGE_WEST:       nx += dx; nw -= dx;                break;
            case GDK_SURFACE_EDGE_SOUTH:                           nh += dy;     break;
            case GDK_SURFACE_EDGE_NORTH:      ny += dy; nh -= dy;                break;
            case GDK_SURFACE_EDGE_SOUTH_EAST: nw += dx;            nh += dy;     break;
            case GDK_SURFACE_EDGE_SOUTH_WEST: nx += dx; nw -= dx;  nh += dy;     break;
            case GDK_SURFACE_EDGE_NORTH_EAST: nw += dx; ny += dy;  nh -= dy;     break;
            case GDK_SURFACE_EDGE_NORTH_WEST: nx += dx; nw -= dx; ny += dy; nh -= dy; break;
            default: break;
            }

            const int MIN_W = 140, MIN_H = 116;
            if (nw < MIN_W) {
                if (state->resize_edge_type == GDK_SURFACE_EDGE_WEST ||
                    state->resize_edge_type == GDK_SURFACE_EDGE_NORTH_WEST ||
                    state->resize_edge_type == GDK_SURFACE_EDGE_SOUTH_WEST)
                    nx = state->resize_start_win_x + state->resize_start_win_w - MIN_W;
                nw = MIN_W;
            }
            if (nh < MIN_H) {
                if (state->resize_edge_type == GDK_SURFACE_EDGE_NORTH ||
                    state->resize_edge_type == GDK_SURFACE_EDGE_NORTH_WEST ||
                    state->resize_edge_type == GDK_SURFACE_EDGE_NORTH_EAST)
                    ny = state->resize_start_win_y + state->resize_start_win_h - MIN_H;
                nh = MIN_H;
            }

            XMoveResizeWindow(xdpy, xwin, nx, ny, nw, nh);
            XFlush(xdpy);

            /* Force GTK to process the resulting ConfigureNotify and redraw */
            static gboolean in_resize_iter = FALSE;
            if (!in_resize_iter) {
                in_resize_iter = TRUE;
                g_main_context_iteration(NULL, FALSE);
                in_resize_iter = FALSE;
            }
            if (!state->settings.is_digital) {
                if (state->analog_area)
                    gtk_widget_queue_draw(state->analog_area);
            } else {
                if (state->seven_seg_area)
                    gtk_widget_queue_draw(state->seven_seg_area);
                if (state->dot_matrix_area)
                    gtk_widget_queue_draw(state->dot_matrix_area);
            }
        }
        return; /* skip cursor update during resize */
    }
#endif

    int edge = hit_edge(state, x, y);
    const char *cname = "default";
    gboolean on_edge = (edge >= 0);
    if (on_edge) {
        switch ((GdkSurfaceEdge)edge) {
        case GDK_SURFACE_EDGE_NORTH_WEST: cname = "nw-resize"; break;
        case GDK_SURFACE_EDGE_NORTH:      cname = "n-resize";  break;
        case GDK_SURFACE_EDGE_NORTH_EAST: cname = "ne-resize"; break;
        case GDK_SURFACE_EDGE_WEST:       cname = "w-resize";  break;
        case GDK_SURFACE_EDGE_EAST:       cname = "e-resize";  break;
        case GDK_SURFACE_EDGE_SOUTH_WEST: cname = "sw-resize"; break;
        case GDK_SURFACE_EDGE_SOUTH:      cname = "s-resize";  break;
        case GDK_SURFACE_EDGE_SOUTH_EAST: cname = "se-resize"; break;
        default: break;
        }
    } else if (in_hit_zone(state, x, y)) {
        cname = "grab";
    }
    gtk_widget_set_cursor_from_name(state->main_window, cname);
}

/* ── Geometry save helper ───────────────────────────────────────────────── */

/* Snapshot current window size + X11 position into the appropriate mode slot. */
static void save_current_geometry(AppState *state)
{
#ifdef GDK_WINDOWING_X11
    {
        GdkDisplay *display = gdk_display_get_default();
        GdkSurface *surface = gtk_native_get_surface(GTK_NATIVE(state->main_window));
        if (GDK_IS_X11_DISPLAY(display) && surface) {
            Display *xdpy = gdk_x11_display_get_xdisplay(display);
            Window   xwin  = gdk_x11_surface_get_xid(surface);

            /* Use XGetGeometry for the accurate server-side size.
               gtk_widget_get_width lags behind until ConfigureNotify is
               processed; XGetGeometry is a synchronous round-trip that
               reads the X server's current state directly. */
            Window root_g;
            int gx, gy;
            unsigned gw, gh, gborder, gdepth;
            if (XGetGeometry(xdpy, xwin, &root_g,
                             &gx, &gy, &gw, &gh, &gborder, &gdepth)) {
                int cw = (int)gw, ch = (int)gh;
                if (cw >= 60 && ch >= 40) {
                    if (state->settings.is_digital) {
                        state->settings.digital_w = cw;
                        state->settings.digital_h = ch;
                    } else {
                        state->settings.analog_w = cw;
                        state->settings.analog_h = ch;
                    }
                }
            }

            Window child;
            int px = 0, py = 0;
            XTranslateCoordinates(xdpy, xwin, DefaultRootWindow(xdpy),
                                  0, 0, &px, &py, &child);
            if (state->settings.is_digital) {
                state->settings.digital_x = px;
                state->settings.digital_y = py;
                state->settings.digital_pos_saved = TRUE;
            } else {
                state->settings.analog_x = px;
                state->settings.analog_y = py;
                state->settings.analog_pos_saved = TRUE;
            }
            return;
        }
    }
#endif
    /* Non-X11 fallback */
    int cw = gtk_widget_get_width(state->main_window);
    int ch = gtk_widget_get_height(state->main_window);
    if (cw >= 60 && ch >= 40) {
        if (state->settings.is_digital) {
            state->settings.digital_w = cw;
            state->settings.digital_h = ch;
        } else {
            state->settings.analog_w = cw;
            state->settings.analog_h = ch;
        }
    }
}

/* ── Window size save on close ──────────────────────────────────────────── */

static gboolean on_close_request(GtkWindow *win, gpointer data)
{
    (void)win;
    AppState *state = (AppState *)data;
    save_current_geometry(state);
    settings_save(&state->settings);
    return FALSE;
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

static void on_ctx_quit(GSimpleAction *a, GVariant *p, gpointer data)
{
    (void)a; (void)p;
    AppState *state = (AppState *)data;
    save_current_geometry(state);
    settings_save(&state->settings);
    g_application_quit(G_APPLICATION(state->app));
}

/* ── Window position restore after map ──────────────────────────────────── */

static void on_window_map(GtkWidget *widget, gpointer data)
{
    AppState *state = (AppState *)data;

    gboolean pos_saved = state->settings.is_digital
                         ? state->settings.digital_pos_saved
                         : state->settings.analog_pos_saved;

    int tw = (int)(state->settings.is_digital
                   ? state->settings.digital_w : state->settings.analog_w);
    int th = (int)(state->settings.is_digital
                   ? state->settings.digital_h : state->settings.analog_h);
    int tx = (int)(state->settings.is_digital
                   ? state->settings.digital_x : state->settings.analog_x);
    int ty = (int)(state->settings.is_digital
                   ? state->settings.digital_y : state->settings.analog_y);

    /* Clamp to minimum dimensions */
    if (state->settings.is_digital) {
        if (tw < 140) tw = 300;
        if (th < 60)  th = 90;
    } else {
        if (tw < 140) tw = 300;
        if (th < 140) th = 160;
    }

    GdkSurface *surface = gtk_native_get_surface(GTK_NATIVE(widget));
    if (!surface) return;

#ifdef GDK_WINDOWING_X11
    GdkDisplay *display = gdk_display_get_default();
    if (GDK_IS_X11_DISPLAY(display)) {
        Display *xdpy = gdk_x11_display_get_xdisplay(display);
        Window xwin = gdk_x11_surface_get_xid(surface);
        /* Apply size immediately */
        XResizeWindow(xdpy, xwin, tw, th);
        XFlush(xdpy);
        if (pos_saved) {
            /* Defer position: WM does initial placement asynchronously after
               map; we must wait for it to finish before overriding. */
            RestoreGeom *rg = g_new(RestoreGeom, 1);
            rg->window = state->main_window;
            rg->tx = tx; rg->ty = ty; rg->tw = tw; rg->th = th;
            g_timeout_add(150, deferred_restore, rg);
        }
    }
#else
    (void)tw; (void)th; (void)tx; (void)ty; (void)pos_saved;
#endif
}

/* ── Right-click context menu ───────────────────────────────────────────── */

static void on_right_click(GtkGestureClick *gesture, int n_press,
                           double x, double y, gpointer data)
{
    (void)n_press;
    AppState *state = (AppState *)data;

    /* Only respond within clock hit zone or at window edges */
    if (hit_edge(state, x, y) < 0 && !in_hit_zone(state, x, y))
        return;

    GMenu *menu = g_menu_new();

    gboolean panel_open = state->side_open;
    g_menu_append(menu,
                  panel_open ? "설정 닫기" : "설정...",
                  "win.settings");

    g_menu_append(menu,
                  state->settings.is_digital ? "아날로그 전환" : "디지털 전환",
                  "win.toggle_mode");

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

/* ── Left-click drag for window move / resize ─────────────────────────────── */

static void on_left_release(GtkGestureClick *gesture, int n_press,
                             double x, double y, gpointer data)
{
    (void)gesture; (void)n_press;
    AppState *state = (AppState *)data;
    gboolean was_resizing = state->manual_resizing;
    state->manual_resizing = FALSE;

    if (was_resizing) {
        save_current_geometry(state);
        settings_save(&state->settings);
    }

    /* After a resize, on_hover_leave was frozen by manual_resizing.
       Use X11 XQueryPointer for the accurate post-resize cursor position —
       gtk_widget_get_width lags behind the new window dimensions. */
    gboolean outside = FALSE;

#ifdef GDK_WINDOWING_X11
    if (was_resizing) {
        GdkDisplay *display = gdk_display_get_default();
        GdkSurface *surf = gtk_native_get_surface(GTK_NATIVE(state->main_window));
        if (GDK_IS_X11_DISPLAY(display) && surf) {
            Display *xdpy = gdk_x11_display_get_xdisplay(display);
            Window   xwin = gdk_x11_surface_get_xid(surf);
            Window d1, d2;
            int wx, wy, rx, ry;
            unsigned int mask;
            if (XQueryPointer(xdpy, xwin, &d1, &d2, &rx, &ry, &wx, &wy, &mask)) {
                Window rg; int gx, gy; unsigned gw, gh, gb, gd;
                if (XGetGeometry(xdpy, xwin, &rg, &gx, &gy, &gw, &gh, &gb, &gd))
                    outside = (wx < 0 || wy < 0 || wx >= (int)gw || wy >= (int)gh);
                else
                    outside = TRUE;
            }
        }
    }
#endif

    if (!outside) {
        int ww = gtk_widget_get_width(state->main_window);
        int wh = gtk_widget_get_height(state->main_window);
        outside = (x < 0 || y < 0 || (int)x >= ww || (int)y >= wh);
    }

    if (outside) {
        state->is_hovered = FALSE;
        gtk_widget_set_opacity(state->main_window, 0.0);
        if (state->chrome_box)
            gtk_widget_set_visible(state->chrome_box, FALSE);
        if (state->analog_area)
            gtk_widget_queue_draw(state->analog_area);
    }
}

static void on_left_press(GtkGestureClick *gesture, int n_press,
                          double x, double y, gpointer data)
{
    (void)n_press;
    AppState *state = (AppState *)data;

    GdkEvent *event = gtk_gesture_get_last_event(GTK_GESTURE(gesture), NULL);
    guint32 timestamp = event ? gdk_event_get_time(event) : GDK_CURRENT_TIME;
    GdkDevice *device = gtk_gesture_get_device(GTK_GESTURE(gesture));
    GdkSurface *surface = gtk_native_get_surface(GTK_NATIVE(state->main_window));
    if (!surface || !GDK_IS_TOPLEVEL(surface) || !device) return;

    /* Edge zone → custom X11 resize for real-time feedback */
    int edge = hit_edge(state, x, y);
    if (edge >= 0) {
        /* Keep clock visible during resize; on_hover_leave checks this flag */
        state->manual_resizing = TRUE;
#ifdef GDK_WINDOWING_X11
        GdkDisplay *display = gdk_display_get_default();
        if (GDK_IS_X11_DISPLAY(display)) {
            Display *xdpy = gdk_x11_display_get_xdisplay(display);
            Window   xwin = gdk_x11_surface_get_xid(surface);

            Window root_r, child_r;
            int abs_x, abs_y, rel_x, rel_y;
            unsigned int mask_r;
            XQueryPointer(xdpy, DefaultRootWindow(xdpy),
                          &root_r, &child_r, &abs_x, &abs_y, &rel_x, &rel_y, &mask_r);

            Window child;
            int win_x, win_y;
            XTranslateCoordinates(xdpy, xwin, DefaultRootWindow(xdpy),
                                  0, 0, &win_x, &win_y, &child);

            state->resize_edge_type   = edge;
            state->resize_start_abs_x = abs_x;
            state->resize_start_abs_y = abs_y;
            state->resize_start_win_x = win_x;
            state->resize_start_win_y = win_y;
            state->resize_start_win_w = gtk_widget_get_width(state->main_window);
            state->resize_start_win_h = gtk_widget_get_height(state->main_window);

            gtk_gesture_set_state(GTK_GESTURE(gesture), GTK_EVENT_SEQUENCE_CLAIMED);
            return;
        }
#endif
        /* Fallback for non-X11 (Wayland) */
        gdk_toplevel_begin_resize(GDK_TOPLEVEL(surface),
                                  (GdkSurfaceEdge)edge,
                                  device, GDK_BUTTON_PRIMARY,
                                  x, y, timestamp);
        gtk_gesture_set_state(GTK_GESTURE(gesture), GTK_EVENT_SEQUENCE_CLAIMED);
        return;
    }

    /* Clock hit zone → move */
    if (in_hit_zone(state, x, y)) {
        gdk_toplevel_begin_move(GDK_TOPLEVEL(surface), device,
                                GDK_BUTTON_PRIMARY, x, y, timestamp);
        gtk_gesture_set_state(GTK_GESTURE(gesture), GTK_EVENT_SEQUENCE_CLAIMED);
    }
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
    gtk_widget_add_css_class(win, "myclock-main");

    /* Window size */
    double w = state->settings.is_digital
               ? state->settings.digital_w
               : state->settings.analog_w;
    double h = state->settings.is_digital
               ? state->settings.digital_h
               : state->settings.analog_h;
    if (w < 140) w = 300;
    if (state->settings.is_digital) {
        if (h < 60) h = 90;
    } else {
        if (h < 140) h = 160;
    }
    gtk_window_set_default_size(GTK_WINDOW(win), (int)w, (int)h);

    /* GActions for context menu */
    GSimpleAction *act_settings = g_simple_action_new("settings", NULL);
    g_signal_connect(act_settings, "activate", G_CALLBACK(on_ctx_settings), state);
    g_action_map_add_action(G_ACTION_MAP(win), G_ACTION(act_settings));

    GSimpleAction *act_toggle = g_simple_action_new("toggle_mode", NULL);
    g_signal_connect(act_toggle, "activate", G_CALLBACK(on_ctx_toggle_mode), state);
    g_action_map_add_action(G_ACTION_MAP(win), G_ACTION(act_toggle));

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

    /* Date label at top — zero margins so window can shrink further */
    GtkWidget *date_dig = gtk_label_new("");
    gtk_widget_add_css_class(date_dig, "header-date");
    gtk_widget_set_halign(date_dig, GTK_ALIGN_CENTER);
    gtk_widget_set_margin_top(date_dig, 1);
    gtk_widget_set_margin_bottom(date_dig, 0);
    state->date_label_digital = date_dig;
    gtk_box_append(GTK_BOX(digital_box), date_dig);

    /* Clock row: AM/PM inline (left) + clock display areas */
    GtkWidget *clock_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 2);
    gtk_widget_set_hexpand(clock_row, TRUE);
    gtk_widget_set_vexpand(clock_row, TRUE);
    gtk_box_append(GTK_BOX(digital_box), clock_row);

    /* Single AM/PM label — inline before the clock, shared by all digital modes */
    GtkWidget *ampm_seg = gtk_label_new("");
    gtk_widget_add_css_class(ampm_seg, "ampm-label");
    gtk_widget_set_halign(ampm_seg, GTK_ALIGN_START);
    gtk_widget_set_valign(ampm_seg, GTK_ALIGN_CENTER);
    gtk_widget_set_margin_start(ampm_seg, 6);
    gtk_widget_set_margin_end(ampm_seg, 2);
    state->ampm_label_seg  = ampm_seg;
    state->ampm_label_text = NULL;   /* single label handles all modes */
    gtk_box_append(GTK_BOX(clock_row), ampm_seg);

    /* Seven-segment area */
    GtkWidget *seg_area = gtk_drawing_area_new();
    gtk_widget_set_hexpand(seg_area, TRUE);
    gtk_widget_set_vexpand(seg_area, TRUE);
    gtk_widget_set_size_request(seg_area, -1, 36);
    gtk_drawing_area_set_draw_func(GTK_DRAWING_AREA(seg_area),
                                   seg_draw_func, state, NULL);
    g_object_set_data(G_OBJECT(seg_area), "text", g_strdup("00:00:00"));
    state->seven_seg_area = seg_area;
    gtk_box_append(GTK_BOX(clock_row), seg_area);

    /* Dot-matrix area */
    GtkWidget *dot_area = gtk_drawing_area_new();
    gtk_widget_set_hexpand(dot_area, TRUE);
    gtk_widget_set_vexpand(dot_area, TRUE);
    gtk_widget_set_size_request(dot_area, -1, 36);
    gtk_drawing_area_set_draw_func(GTK_DRAWING_AREA(dot_area),
                                   dot_draw_func, state, NULL);
    g_object_set_data(G_OBJECT(dot_area), "text", g_strdup("00:00:00"));
    state->dot_matrix_area = dot_area;
    gtk_box_append(GTK_BOX(clock_row), dot_area);

    /* Text time label (for non-canvas digital styles) */
    GtkWidget *text_label = gtk_label_new("00:00:00");
    gtk_widget_set_hexpand(text_label, TRUE);
    gtk_widget_set_vexpand(text_label, TRUE);
    gtk_widget_set_halign(text_label, GTK_ALIGN_CENTER);
    gtk_widget_set_valign(text_label, GTK_ALIGN_CENTER);
    gtk_widget_set_size_request(text_label, -1, 36);
    gtk_widget_add_css_class(text_label, "time-text");
    state->text_time_label = text_label;
    gtk_box_append(GTK_BOX(clock_row), text_label);

    gtk_stack_add_named(GTK_STACK(stack), digital_box, "digital");

    /* ── Analog page ── */
    GtkWidget *analog_container = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_widget_set_hexpand(analog_container, TRUE);
    gtk_widget_set_vexpand(analog_container, TRUE);

    /* AM/PM and date are now drawn inside the clock face; no external header */
    state->ampm_label_analog = NULL;
    state->date_label_analog = NULL;

    /* Analog clock drawing area — minimum 200×200 so complications stay legible */
    GtkWidget *analog_area = gtk_drawing_area_new();
    gtk_widget_set_hexpand(analog_area, TRUE);
    gtk_widget_set_vexpand(analog_area, TRUE);
    gtk_widget_set_size_request(analog_area, 200, 200);
    gtk_drawing_area_set_draw_func(GTK_DRAWING_AREA(analog_area),
                                   analog_draw_func, state, NULL);
    state->analog_area = analog_area;
    gtk_box_append(GTK_BOX(analog_container), analog_area);

    gtk_stack_add_named(GTK_STACK(stack), analog_container, "analog");

    /* ── Chrome overlay (hover UI) ── */
    GtkWidget *chrome = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_widget_set_halign(chrome, GTK_ALIGN_FILL);
    gtk_widget_set_valign(chrome, GTK_ALIGN_FILL);
    gtk_widget_add_css_class(chrome, "chrome-box");

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
    gtk_widget_set_visible(chrome, FALSE);   /* hidden until hover */
    state->chrome_box = chrome;

    /* ── Resize silhouette overlay ── */
    GtkWidget *resize_ov = gtk_drawing_area_new();
    gtk_widget_set_halign(resize_ov, GTK_ALIGN_FILL);
    gtk_widget_set_valign(resize_ov, GTK_ALIGN_FILL);
    gtk_widget_set_hexpand(resize_ov, TRUE);
    gtk_widget_set_vexpand(resize_ov, TRUE);
    gtk_drawing_area_set_draw_func(GTK_DRAWING_AREA(resize_ov),
                                   resize_overlay_draw_func, state, NULL);
    gtk_overlay_add_overlay(GTK_OVERLAY(overlay), resize_ov);
    gtk_widget_set_can_target(resize_ov, FALSE);
    state->resize_overlay = resize_ov;

    /* Gesture: left-click to move/resize window */
    GtkGestureClick *left_click = GTK_GESTURE_CLICK(gtk_gesture_click_new());
    gtk_gesture_single_set_button(GTK_GESTURE_SINGLE(left_click), GDK_BUTTON_PRIMARY);
    g_signal_connect(left_click, "pressed",  G_CALLBACK(on_left_press),   state);
    g_signal_connect(left_click, "released", G_CALLBACK(on_left_release), state);
    gtk_widget_add_controller(win, GTK_EVENT_CONTROLLER(left_click));

    /* Gesture: right-click for context menu */
    GtkGestureClick *right_click = GTK_GESTURE_CLICK(gtk_gesture_click_new());
    gtk_gesture_single_set_button(GTK_GESTURE_SINGLE(right_click), GDK_BUTTON_SECONDARY);
    g_signal_connect(right_click, "pressed", G_CALLBACK(on_right_click), state);
    gtk_widget_add_controller(win, GTK_EVENT_CONTROLLER(right_click));

    /* Motion controller: hover transparency and edge-resize cursor */
    GtkEventController *motion_ctrl = gtk_event_controller_motion_new();
    g_signal_connect(motion_ctrl, "enter",  G_CALLBACK(on_hover_enter), state);
    g_signal_connect(motion_ctrl, "leave",  G_CALLBACK(on_hover_leave), state);
    g_signal_connect(motion_ctrl, "motion", G_CALLBACK(on_motion),      state);
    gtk_widget_add_controller(win, motion_ctrl);

    /* Save window size/position on close */
    g_signal_connect(win, "close-request", G_CALLBACK(on_close_request), state);

    /* Restore saved position after window is mapped (X11 only) */
    g_signal_connect(win, "map", G_CALLBACK(on_window_map), state);

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
    gchar *base_path = find_data_file("myclock.css");
    if (base_path) {
        gtk_css_provider_load_from_path(base_css, base_path);
        g_free(base_path);
    }
    gtk_style_context_add_provider_for_display(
        gdk_display_get_default(),
        GTK_STYLE_PROVIDER(base_css),
        GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);

    /* Start tick timer (every second) */
    state->tick_source = g_timeout_add_seconds(1, tick_cb, state);

    /* Initial update */
    main_window_update_clock(state);

    return win;
}
