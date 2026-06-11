#include <gtk/gtk.h>
#include <string.h>
#include <stdio.h>
#include "side_panel.h"
#include "main_window.h"
#include "models/settings.h"
#include "models/city_database.h"
#include "services/timer_service.h"
#include "services/stopwatch_service.h"
#include "widgets/world_time_panel.h"
#include "dialogs/add_alarm_dialog.h"
#include "dialogs/add_world_time_dialog.h"

/* ── Forward declarations ──────────────────────────────────────────────── */
static void rebuild_alarm_list(AppState *state);

/* ── Panel-lifetime widget references (cleared on panel destroy) ─────────
   Single side panel is open at most once; statics are safe here.       */
static GtkWidget *s_timer_h_spin;
static GtkWidget *s_timer_m_spin;
static GtkWidget *s_timer_s_spin;
static GtkWidget *s_timer_display;
static GtkWidget *s_sw_display;
static GtkWidget *s_sw_lap_list;
static GtkWidget *s_world_panel;

/* ──────────────────────────────────────────────────────────────────────── */
/*  Alarm tab                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

typedef struct {
    AlarmItem *alarm;
    AppState  *state;
} AlarmRowData;

static void on_alarm_enabled_toggled(GtkSwitch *sw, GParamSpec *ps, gpointer data)
{
    (void)ps;
    AlarmRowData *rd = (AlarmRowData *)data;
    rd->alarm->is_enabled = gtk_switch_get_active(sw);
    settings_save(&rd->state->settings);
}

static void on_alarm_delete(GtkButton *btn, gpointer data)
{
    (void)btn;
    AlarmRowData *rd    = (AlarmRowData *)data;
    AppState     *state = rd->state;
    AlarmItem    *alarm = rd->alarm;

    int idx = -1;
    for (int i = 0; i < state->settings.alarm_count; i++) {
        if (&state->settings.alarms[i] == alarm) { idx = i; break; }
    }
    if (idx < 0) return;

    for (int i = idx; i < state->settings.alarm_count - 1; i++)
        state->settings.alarms[i] = state->settings.alarms[i + 1];
    state->settings.alarm_count--;
    settings_save(&state->settings);
    rebuild_alarm_list(state);
}

static GtkWidget *make_alarm_row(AppState *state, AlarmItem *alarm)
{
    AlarmRowData *rd = g_new(AlarmRowData, 1);
    rd->alarm = alarm;
    rd->state = state;

    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_margin_start(box, 8);
    gtk_widget_set_margin_end(box, 8);
    gtk_widget_set_margin_top(box, 4);
    gtk_widget_set_margin_bottom(box, 4);
    /* rd lives as long as the row box */
    g_object_set_data_full(G_OBJECT(box), "row-data", rd, g_free);

    /* Time */
    char tbuf[16];
    snprintf(tbuf, sizeof(tbuf), "%02d:%02d", alarm->hour, alarm->minute);
    GtkWidget *time_lbl = gtk_label_new(tbuf);
    gtk_widget_add_css_class(time_lbl, "alarm-time");
    gtk_box_append(GTK_BOX(box), time_lbl);

    /* User label */
    GtkWidget *lbl = gtk_label_new(alarm->label[0] ? alarm->label : "알람");
    gtk_widget_set_hexpand(lbl, TRUE);
    gtk_widget_set_halign(lbl, GTK_ALIGN_START);
    gtk_box_append(GTK_BOX(box), lbl);

    /* Repeat summary */
    static const char *day_names[] = { "일","월","화","수","목","금","토" };
    char rep_buf[40] = "한번";
    if (alarm->is_repeat) {
        if (alarm->repeat_days == 0x7F) {
            g_strlcpy(rep_buf, "매일", sizeof(rep_buf));
        } else {
            rep_buf[0] = '\0';
            for (int d = 0; d < 7; d++) {
                if (alarm->repeat_days & (1 << d)) {
                    if (rep_buf[0]) g_strlcat(rep_buf, "·", sizeof(rep_buf));
                    g_strlcat(rep_buf, day_names[d], sizeof(rep_buf));
                }
            }
        }
    }
    GtkWidget *rep_lbl = gtk_label_new(rep_buf);
    gtk_widget_add_css_class(rep_lbl, "alarm-repeat");
    gtk_box_append(GTK_BOX(box), rep_lbl);

    /* Enable switch */
    GtkWidget *sw = gtk_switch_new();
    gtk_switch_set_active(GTK_SWITCH(sw), alarm->is_enabled);
    g_signal_connect(sw, "notify::active",
                     G_CALLBACK(on_alarm_enabled_toggled), rd);
    gtk_box_append(GTK_BOX(box), sw);

    /* Delete button */
    GtkWidget *del = gtk_button_new_from_icon_name("list-remove-symbolic");
    gtk_widget_add_css_class(del, "flat");
    g_signal_connect(del, "clicked", G_CALLBACK(on_alarm_delete), rd);
    gtk_box_append(GTK_BOX(box), del);

    return box;
}

static void rebuild_alarm_list(AppState *state)
{
    GtkWidget *list = state->alarm_list;
    if (!list) return;

    GtkWidget *child;
    while ((child = gtk_widget_get_first_child(list)))
        gtk_list_box_remove(GTK_LIST_BOX(list), child);

    for (int i = 0; i < state->settings.alarm_count; i++) {
        GtkWidget *row_box = make_alarm_row(state, &state->settings.alarms[i]);
        GtkWidget *row     = gtk_list_box_row_new();
        gtk_list_box_row_set_child(GTK_LIST_BOX_ROW(row), row_box);
        gtk_list_box_row_set_selectable(GTK_LIST_BOX_ROW(row), FALSE);
        gtk_list_box_append(GTK_LIST_BOX(list), row);
    }
}

static void on_add_alarm(GtkButton *btn, gpointer data)
{
    (void)btn;
    AppState *state = (AppState *)data;
    if (state->settings.alarm_count >= MAX_ALARMS) return;

    AlarmItem new_alarm;
    memset(&new_alarm, 0, sizeof(new_alarm));
    new_alarm.is_enabled  = TRUE;
    new_alarm.is_repeat   = TRUE;
    new_alarm.repeat_days = 0x7F;
    gchar *uuid = g_uuid_string_random();
    g_strlcpy(new_alarm.id, uuid, sizeof(new_alarm.id));
    g_free(uuid);

    if (add_alarm_dialog_run(GTK_WINDOW(state->side_panel), &new_alarm)) {
        state->settings.alarms[state->settings.alarm_count++] = new_alarm;
        settings_save(&state->settings);
        rebuild_alarm_list(state);
    }
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  World time tab                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

static void on_add_world_time(GtkButton *btn, gpointer data)
{
    (void)btn;
    AppState *state = (AppState *)data;
    if (state->settings.world_city_count >= MAX_WORLD_CITIES) return;

    WorldTimeCityDto city;
    memset(&city, 0, sizeof(city));
    if (add_world_time_dialog_run(GTK_WINDOW(state->side_panel), &city)) {
        state->settings.world_cities[state->settings.world_city_count++] = city;
        settings_save(&state->settings);
        if (s_world_panel)
            world_time_panel_reload(s_world_panel, state);
    }
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Timer tab                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

static void update_timer_display(AppState *state)
{
    if (!s_timer_display) return;
    int h, m, s;
    timer_service_get_remaining_hms(&state->timers[0], &h, &m, &s);
    char buf[32];
    snprintf(buf, sizeof(buf), "%02d:%02d:%02d", h, m, s);
    gtk_label_set_text(GTK_LABEL(s_timer_display), buf);
}

static void on_timer_start_pause(GtkButton *btn, gpointer data)
{
    (void)btn;
    AppState     *state = (AppState *)data;
    TimerService *svc   = &state->timers[0];

    if (svc->state == TIMER_STATE_RUNNING) {
        timer_service_pause(svc);
    } else if (svc->state == TIMER_STATE_PAUSED) {
        timer_service_start(svc);
    } else {
        int h   = s_timer_h_spin
                    ? (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(s_timer_h_spin)) : 0;
        int m   = s_timer_m_spin
                    ? (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(s_timer_m_spin)) : 5;
        int sec = s_timer_s_spin
                    ? (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(s_timer_s_spin)) : 0;
        timer_service_set(svc, h, m, sec, "");
        timer_service_start(svc);
    }
    update_timer_display(state);
}

static void on_timer_stop(GtkButton *btn, gpointer data)
{
    (void)btn;
    AppState *state = (AppState *)data;
    timer_service_stop(&state->timers[0]);
    update_timer_display(state);
}

static GtkWidget *build_timer_tab(AppState *state)
{
    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 12);
    gtk_widget_set_margin_start(box, 16);
    gtk_widget_set_margin_end(box, 16);
    gtk_widget_set_margin_top(box, 16);

    /* H : M : S spinners */
    GtkWidget *spin_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_widget_set_halign(spin_row, GTK_ALIGN_CENTER);

    s_timer_h_spin = gtk_spin_button_new_with_range(0, 99, 1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(s_timer_h_spin), 0);
    gtk_widget_set_size_request(s_timer_h_spin, 64, -1);
    gtk_box_append(GTK_BOX(spin_row), s_timer_h_spin);
    gtk_box_append(GTK_BOX(spin_row), gtk_label_new("h"));

    s_timer_m_spin = gtk_spin_button_new_with_range(0, 59, 1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(s_timer_m_spin), 5);
    gtk_widget_set_size_request(s_timer_m_spin, 64, -1);
    gtk_box_append(GTK_BOX(spin_row), s_timer_m_spin);
    gtk_box_append(GTK_BOX(spin_row), gtk_label_new("m"));

    s_timer_s_spin = gtk_spin_button_new_with_range(0, 59, 1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(s_timer_s_spin), 0);
    gtk_widget_set_size_request(s_timer_s_spin, 64, -1);
    gtk_box_append(GTK_BOX(spin_row), s_timer_s_spin);
    gtk_box_append(GTK_BOX(spin_row), gtk_label_new("s"));
    gtk_box_append(GTK_BOX(box), spin_row);

    /* Remaining time display */
    s_timer_display = gtk_label_new("00:05:00");
    gtk_widget_add_css_class(s_timer_display, "timer-display");
    gtk_box_append(GTK_BOX(box), s_timer_display);

    /* Control buttons */
    GtkWidget *btn_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_halign(btn_row, GTK_ALIGN_CENTER);

    GtkWidget *start_btn = gtk_button_new_with_label("시작/일시정지");
    g_signal_connect(start_btn, "clicked", G_CALLBACK(on_timer_start_pause), state);
    gtk_box_append(GTK_BOX(btn_row), start_btn);

    GtkWidget *stop_btn = gtk_button_new_with_label("정지");
    g_signal_connect(stop_btn, "clicked", G_CALLBACK(on_timer_stop), state);
    gtk_box_append(GTK_BOX(btn_row), stop_btn);

    gtk_box_append(GTK_BOX(box), btn_row);
    return box;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Stopwatch tab                                                           */
/* ──────────────────────────────────────────────────────────────────────── */

void side_panel_update_stopwatch_display(AppState *state)
{
    if (!s_sw_display) return;
    int h, m, s, ms;
    stopwatch_get_hms(&state->stopwatch, &h, &m, &s, &ms);
    char buf[32];
    snprintf(buf, sizeof(buf), "%02d:%02d:%02d.%03d", h, m, s, ms);
    gtk_label_set_text(GTK_LABEL(s_sw_display), buf);
}

/* 100 ms tick; stops itself when panel is closed (s_sw_display → NULL) */
static gboolean sw_tick_cb(gpointer data)
{
    if (!s_sw_display) return G_SOURCE_REMOVE;
    side_panel_update_stopwatch_display((AppState *)data);
    return G_SOURCE_CONTINUE;
}

static void on_sw_start_stop(GtkButton *btn, gpointer data)
{
    (void)btn;
    AppState *state = (AppState *)data;
    if (state->stopwatch.is_running) stopwatch_stop(&state->stopwatch);
    else                             stopwatch_start(&state->stopwatch);
}

static void on_sw_reset(GtkButton *btn, gpointer data)
{
    (void)btn;
    AppState *state = (AppState *)data;
    stopwatch_reset(&state->stopwatch);
    if (s_sw_lap_list) {
        GtkWidget *child;
        while ((child = gtk_widget_get_first_child(s_sw_lap_list)))
            gtk_list_box_remove(GTK_LIST_BOX(s_sw_lap_list), child);
    }
    side_panel_update_stopwatch_display(state);
}

static void on_sw_lap(GtkButton *btn, gpointer data)
{
    (void)btn;
    AppState *state = (AppState *)data;
    stopwatch_lap(&state->stopwatch);
    if (!s_sw_lap_list) return;

    int lap_idx = state->stopwatch.lap_count - 1;
    if (lap_idx < 0) return;

    gint64 us  = state->stopwatch.lap_times_us[lap_idx];
    int h      = (int)(us / 3600000000LL);
    int m      = (int)((us % 3600000000LL) / 60000000LL);
    int s      = (int)((us % 60000000LL)   / 1000000LL);
    int ms_val = (int)((us % 1000000LL)    / 1000LL);

    char buf[64];
    snprintf(buf, sizeof(buf), "랩 %d:  %02d:%02d:%02d.%03d",
             lap_idx + 1, h, m, s, ms_val);
    GtkWidget *lbl = gtk_label_new(buf);
    gtk_widget_set_halign(lbl, GTK_ALIGN_START);
    gtk_widget_set_margin_start(lbl, 8);

    GtkWidget *row = gtk_list_box_row_new();
    gtk_list_box_row_set_child(GTK_LIST_BOX_ROW(row), lbl);
    gtk_list_box_row_set_selectable(GTK_LIST_BOX_ROW(row), FALSE);
    gtk_list_box_prepend(GTK_LIST_BOX(s_sw_lap_list), row);
}

static GtkWidget *build_stopwatch_tab(AppState *state)
{
    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 12);
    gtk_widget_set_margin_start(box, 16);
    gtk_widget_set_margin_end(box, 16);
    gtk_widget_set_margin_top(box, 16);

    s_sw_display = gtk_label_new("00:00:00.000");
    gtk_widget_add_css_class(s_sw_display, "timer-display");
    gtk_box_append(GTK_BOX(box), s_sw_display);

    GtkWidget *btn_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_halign(btn_row, GTK_ALIGN_CENTER);

    GtkWidget *ss_btn = gtk_button_new_with_label("시작/정지");
    g_signal_connect(ss_btn, "clicked", G_CALLBACK(on_sw_start_stop), state);
    gtk_box_append(GTK_BOX(btn_row), ss_btn);

    GtkWidget *lap_btn = gtk_button_new_with_label("랩");
    g_signal_connect(lap_btn, "clicked", G_CALLBACK(on_sw_lap), state);
    gtk_box_append(GTK_BOX(btn_row), lap_btn);

    GtkWidget *rst_btn = gtk_button_new_with_label("초기화");
    g_signal_connect(rst_btn, "clicked", G_CALLBACK(on_sw_reset), state);
    gtk_box_append(GTK_BOX(btn_row), rst_btn);

    gtk_box_append(GTK_BOX(box), btn_row);

    GtkWidget *scroll = gtk_scrolled_window_new();
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_vexpand(scroll, TRUE);
    s_sw_lap_list = gtk_list_box_new();
    gtk_list_box_set_selection_mode(GTK_LIST_BOX(s_sw_lap_list), GTK_SELECTION_NONE);
    gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(scroll), s_sw_lap_list);
    gtk_box_append(GTK_BOX(box), scroll);

    /* 100 ms display update; self-terminates via sw_tick_cb returning REMOVE */
    g_timeout_add(100, sw_tick_cb, state);

    return box;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Settings tab                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

static void on_h24_toggled(GtkSwitch *sw, GParamSpec *ps, gpointer data)
{
    (void)ps;
    AppState *state = (AppState *)data;
    state->settings.use24h = gtk_switch_get_active(sw);
    main_window_update_clock(state);
    settings_save(&state->settings);
}

static void on_aot_toggled(GtkSwitch *sw, GParamSpec *ps, gpointer data)
{
    (void)ps;
    AppState *state = (AppState *)data;
    state->settings.always_on_top = gtk_switch_get_active(sw);
    gtk_window_set_keep_above(GTK_WINDOW(state->main_window),
                              state->settings.always_on_top);
    settings_save(&state->settings);
}

static void on_autostart_toggled(GtkSwitch *sw, GParamSpec *ps, gpointer data)
{
    (void)ps;
    (void)data;
    settings_autostart_set(gtk_switch_get_active(sw));
}

static void on_brightness_changed(GtkRange *range, gpointer data)
{
    AppState *state = (AppState *)data;
    state->settings.brightness = gtk_range_get_value(range);
    main_window_apply_brightness(state);
    settings_save(&state->settings);
}

static void on_theme_changed(GtkComboBox *combo, gpointer data)
{
    AppState *state = (AppState *)data;
    state->settings.theme = (ThemeId)gtk_combo_box_get_active(combo);
    main_window_apply_theme(state);
    settings_save(&state->settings);
}

static void on_digital_style_changed(GtkComboBox *combo, gpointer data)
{
    AppState *state = (AppState *)data;
    state->settings.digital_style = (DigitalStyle)gtk_combo_box_get_active(combo);
    main_window_apply_digital_style(state);
    settings_save(&state->settings);
}

static void on_analog_style_changed(GtkComboBox *combo, gpointer data)
{
    AppState *state = (AppState *)data;
    state->settings.analog_style = (AnalogStyle)gtk_combo_box_get_active(combo);
    main_window_apply_analog_style(state);
    settings_save(&state->settings);
}

static void on_digit_color_set(GtkColorButton *btn, gpointer data)
{
    AppState *state = (AppState *)data;
    GdkRGBA color;
    gtk_color_chooser_get_rgba(GTK_COLOR_CHOOSER(btn), &color);
    state->settings.digit_r = color.red;
    state->settings.digit_g = color.green;
    state->settings.digit_b = color.blue;
    main_window_apply_digit_color(state);
    settings_save(&state->settings);
}

/* Utility: horizontal row with label on left, control on right */
static GtkWidget *make_settings_row(const char *label_text, GtkWidget *control)
{
    GtkWidget *row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_margin_top(row, 2);
    GtkWidget *lbl = gtk_label_new(label_text);
    gtk_widget_set_hexpand(lbl, TRUE);
    gtk_widget_set_halign(lbl, GTK_ALIGN_START);
    gtk_box_append(GTK_BOX(row), lbl);
    gtk_box_append(GTK_BOX(row), control);
    return row;
}

static GtkWidget *build_settings_tab(AppState *state)
{
    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_widget_set_margin_start(box, 16);
    gtk_widget_set_margin_end(box, 16);
    gtk_widget_set_margin_top(box, 16);
    gtk_widget_set_margin_bottom(box, 16);

    /* 24h switch */
    GtkWidget *h24_sw = gtk_switch_new();
    gtk_switch_set_active(GTK_SWITCH(h24_sw), state->settings.use24h);
    g_signal_connect(h24_sw, "notify::active", G_CALLBACK(on_h24_toggled), state);
    gtk_box_append(GTK_BOX(box), make_settings_row("24시간 형식", h24_sw));

    /* Always on top */
    GtkWidget *aot_sw = gtk_switch_new();
    gtk_switch_set_active(GTK_SWITCH(aot_sw), state->settings.always_on_top);
    g_signal_connect(aot_sw, "notify::active", G_CALLBACK(on_aot_toggled), state);
    gtk_box_append(GTK_BOX(box), make_settings_row("항상 위", aot_sw));

    /* Autostart */
    GtkWidget *auto_sw = gtk_switch_new();
    gtk_switch_set_active(GTK_SWITCH(auto_sw), settings_autostart_get());
    g_signal_connect(auto_sw, "notify::active", G_CALLBACK(on_autostart_toggled), state);
    gtk_box_append(GTK_BOX(box), make_settings_row("자동 시작", auto_sw));

    gtk_box_append(GTK_BOX(box), gtk_separator_new(GTK_ORIENTATION_HORIZONTAL));

    /* Brightness */
    gtk_box_append(GTK_BOX(box), gtk_label_new("밝기"));
    GtkWidget *bright =
        gtk_scale_new_with_range(GTK_ORIENTATION_HORIZONTAL, 0.0, 1.0, 0.05);
    gtk_scale_set_draw_value(GTK_SCALE(bright), FALSE);
    gtk_range_set_value(GTK_RANGE(bright), state->settings.brightness);
    g_signal_connect(bright, "value-changed", G_CALLBACK(on_brightness_changed), state);
    gtk_box_append(GTK_BOX(box), bright);

    gtk_box_append(GTK_BOX(box), gtk_separator_new(GTK_ORIENTATION_HORIZONTAL));

    /* Theme */
    gtk_box_append(GTK_BOX(box), gtk_label_new("테마"));
    static const char *theme_labels[THEME_COUNT] = {
        "다크","라이트","미드나이트","오션",
        "루비","에메랄드","퍼플","앰버",
        "로즈","모노","선셋","민트"
    };
    GtkWidget *theme_combo = gtk_combo_box_text_new();
    for (int i = 0; i < THEME_COUNT; i++)
        gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(theme_combo), theme_labels[i]);
    gtk_combo_box_set_active(GTK_COMBO_BOX(theme_combo), (int)state->settings.theme);
    g_signal_connect(theme_combo, "changed", G_CALLBACK(on_theme_changed), state);
    gtk_box_append(GTK_BOX(box), theme_combo);

    /* Digital style */
    gtk_box_append(GTK_BOX(box), gtk_label_new("디지털 스타일"));
    static const char *dig_labels[DIGITAL_STYLE_COUNT] = {
        "7세그먼트","도트 매트릭스","미니멀","LCD 텍스트",
        "레트로","네온","한글","매트릭스","빈티지","씬"
    };
    GtkWidget *dig_combo = gtk_combo_box_text_new();
    for (int i = 0; i < DIGITAL_STYLE_COUNT; i++)
        gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(dig_combo), dig_labels[i]);
    gtk_combo_box_set_active(GTK_COMBO_BOX(dig_combo),
                             (int)state->settings.digital_style);
    g_signal_connect(dig_combo, "changed",
                     G_CALLBACK(on_digital_style_changed), state);
    gtk_box_append(GTK_BOX(box), dig_combo);

    /* Analog style */
    gtk_box_append(GTK_BOX(box), gtk_label_new("아날로그 스타일"));
    static const char *ana_labels[ANALOG_STYLE_COUNT] = {
        "클래식","미니멀","로마 숫자","인덱스","철도",
        "바우하우스","도트","항공","해양","모던","스팀펑크"
    };
    GtkWidget *ana_combo = gtk_combo_box_text_new();
    for (int i = 0; i < ANALOG_STYLE_COUNT; i++)
        gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(ana_combo), ana_labels[i]);
    gtk_combo_box_set_active(GTK_COMBO_BOX(ana_combo),
                             (int)state->settings.analog_style);
    g_signal_connect(ana_combo, "changed",
                     G_CALLBACK(on_analog_style_changed), state);
    gtk_box_append(GTK_BOX(box), ana_combo);

    gtk_box_append(GTK_BOX(box), gtk_separator_new(GTK_ORIENTATION_HORIZONTAL));

    /* Digit color */
    GdkRGBA digit_rgba = {
        state->settings.digit_r,
        state->settings.digit_g,
        state->settings.digit_b,
        1.0
    };
    GtkWidget *color_btn = gtk_color_button_new_with_rgba(&digit_rgba);
    gtk_color_button_set_title(GTK_COLOR_BUTTON(color_btn), "숫자 색상 선택");
    g_signal_connect(color_btn, "color-set", G_CALLBACK(on_digit_color_set), state);
    gtk_box_append(GTK_BOX(box), make_settings_row("숫자 색상", color_btn));

    return box;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Panel destroy cleanup                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

static void on_panel_destroy(GtkWidget *win, gpointer data)
{
    (void)win;
    AppState *state   = (AppState *)data;
    state->side_open  = FALSE;
    state->side_panel = NULL;
    state->alarm_list = NULL;
    state->world_list = NULL;
    /* Clear statics so pending timeouts self-terminate */
    s_timer_h_spin    = NULL;
    s_timer_m_spin    = NULL;
    s_timer_s_spin    = NULL;
    s_timer_display   = NULL;
    s_sw_display      = NULL;
    s_sw_lap_list     = NULL;
    s_world_panel     = NULL;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Public API                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

void side_panel_update_world_times(AppState *state)
{
    if (s_world_panel)
        world_time_panel_update(s_world_panel, state);
}

void side_panel_update_timer_display(AppState *state)
{
    update_timer_display(state);
}

void side_panel_apply_settings(AppState *state)
{
    (void)state;  /* placeholder for full settings widget sync if needed */
}

GtkWidget *side_panel_new(AppState *state)
{
    /* Reset statics before building new panel */
    s_timer_h_spin  = NULL;
    s_timer_m_spin  = NULL;
    s_timer_s_spin  = NULL;
    s_timer_display = NULL;
    s_sw_display    = NULL;
    s_sw_lap_list   = NULL;
    s_world_panel   = NULL;

    GtkWidget *win = gtk_window_new();
    state->side_panel = win;
    gtk_window_set_title(GTK_WINDOW(win), "MyClock");
    gtk_window_set_default_size(GTK_WINDOW(win), 360, 600);
    gtk_window_set_transient_for(GTK_WINDOW(win),
                                 GTK_WINDOW(state->main_window));
    gtk_window_set_destroy_with_parent(GTK_WINDOW(win), TRUE);
    g_signal_connect(win, "destroy", G_CALLBACK(on_panel_destroy), state);

    GtkWidget *nb = gtk_notebook_new();
    gtk_notebook_set_tab_pos(GTK_NOTEBOOK(nb), GTK_POS_TOP);
    gtk_window_set_child(GTK_WINDOW(win), nb);

    /* ── Tab 1: World Time ── */
    {
        GtkWidget *page = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);

        GtkWidget *add_btn =
            gtk_button_new_from_icon_name("list-add-symbolic");
        gtk_widget_set_tooltip_text(add_btn, "도시 추가");
        gtk_widget_set_halign(add_btn, GTK_ALIGN_END);
        gtk_widget_set_margin_end(add_btn, 8);
        gtk_widget_set_margin_top(add_btn, 6);
        gtk_widget_set_margin_bottom(add_btn, 2);
        g_signal_connect(add_btn, "clicked",
                         G_CALLBACK(on_add_world_time), state);
        gtk_box_append(GTK_BOX(page), add_btn);

        GtkWidget *panel = world_time_panel_new(state);
        s_world_panel = panel;
        gtk_widget_set_vexpand(panel, TRUE);
        gtk_box_append(GTK_BOX(page), panel);

        gtk_notebook_append_page(GTK_NOTEBOOK(nb), page,
                                 gtk_label_new("세계 시간"));
    }

    /* ── Tab 2: Alarms ── */
    {
        GtkWidget *page = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);

        GtkWidget *add_btn =
            gtk_button_new_from_icon_name("list-add-symbolic");
        gtk_widget_set_tooltip_text(add_btn, "알람 추가");
        gtk_widget_set_halign(add_btn, GTK_ALIGN_END);
        gtk_widget_set_margin_end(add_btn, 8);
        gtk_widget_set_margin_top(add_btn, 6);
        gtk_widget_set_margin_bottom(add_btn, 2);
        g_signal_connect(add_btn, "clicked", G_CALLBACK(on_add_alarm), state);
        gtk_box_append(GTK_BOX(page), add_btn);

        GtkWidget *scroll = gtk_scrolled_window_new();
        gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                       GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
        gtk_widget_set_vexpand(scroll, TRUE);

        GtkWidget *list = gtk_list_box_new();
        gtk_list_box_set_selection_mode(GTK_LIST_BOX(list), GTK_SELECTION_NONE);
        state->alarm_list = list;
        gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(scroll), list);
        gtk_box_append(GTK_BOX(page), scroll);
        rebuild_alarm_list(state);

        gtk_notebook_append_page(GTK_NOTEBOOK(nb), page,
                                 gtk_label_new("알람"));
    }

    /* ── Tab 3: Timer ── */
    {
        GtkWidget *page = build_timer_tab(state);
        gtk_notebook_append_page(GTK_NOTEBOOK(nb), page,
                                 gtk_label_new("타이머"));
    }

    /* ── Tab 4: Stopwatch ── */
    {
        GtkWidget *page = build_stopwatch_tab(state);
        gtk_notebook_append_page(GTK_NOTEBOOK(nb), page,
                                 gtk_label_new("스톱워치"));
    }

    /* ── Tab 5: Settings ── */
    {
        GtkWidget *scroll = gtk_scrolled_window_new();
        gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                       GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
        GtkWidget *page = build_settings_tab(state);
        gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(scroll), page);
        gtk_notebook_append_page(GTK_NOTEBOOK(nb), scroll,
                                 gtk_label_new("설정"));
    }

    return win;
}
