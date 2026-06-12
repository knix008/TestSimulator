#include <math.h>
#include <string.h>
#include "world_time_panel.h"
#include "analog_clock.h"
#include "../models/settings.h"

/* Mini analog clock size */
#define MINI_SIZE 48

/* ── Drag-reorder state ──────────────────────────────────────────────────── */

static int s_drag_src_idx = -1;   /* index of the row currently being dragged */

/* ── Row data structure ──────────────────────────────────────────────────── */

typedef struct {
    GtkWidget  *row_box;
    GtkWidget  *mini_area;
    GtkWidget  *city_label;
    GtkWidget  *time_label;
    GtkWidget  *region_label;
    int         entry_idx;
    AppState   *state;
} WorldTimeRow;

/* ── Mini clock draw ─────────────────────────────────────────────────────── */

static void mini_clock_draw(GtkDrawingArea *area, cairo_t *cr,
                             int width, int height, gpointer data)
{
    (void)area;
    WorldTimeRow *row = (WorldTimeRow *)data;
    if (!row || row->entry_idx < 0 ||
        row->entry_idx >= row->state->settings.world_city_count)
        return;

    const WorldTimeCityDto *city =
        &row->state->settings.world_cities[row->entry_idx];

    GTimeZone *tz = g_time_zone_new_identifier(city->tz_id);
    GDateTime *utc  = g_date_time_new_now_utc();
    GDateTime *local = g_date_time_to_timezone(utc, tz);

    ClockColors colors;
    clock_colors_from_state(row->state, &colors);
    colors.face_r = 0.20; colors.face_g = 0.22; colors.face_b = 0.30;
    colors.border_r = 0.55; colors.border_g = 0.57; colors.border_b = 0.70;
    colors.tick_hr_r = 0.95; colors.tick_hr_g = 0.95; colors.tick_hr_b = 0.95;
    colors.hr_hand_r  = 0.95; colors.hr_hand_g  = 0.95; colors.hr_hand_b  = 0.95;
    colors.min_hand_r = 0.60; colors.min_hand_g = 0.78; colors.min_hand_b = 1.00;
    colors.sec_hand_r = 1.00; colors.sec_hand_g = 0.35; colors.sec_hand_b = 0.35;
    colors.center_r   = 1.00; colors.center_g   = 0.35; colors.center_b   = 0.35;
    analog_clock_draw(cr, width, height, local, ANALOG_STYLE_MINIMAL, &colors, TRUE, "");

    g_date_time_unref(local);
    g_date_time_unref(utc);
    g_time_zone_unref(tz);
}

/* ── Update a single row's time label ───────────────────────────────────── */

static void update_row_time(WorldTimeRow *row)
{
    if (!row || row->entry_idx < 0 ||
        row->entry_idx >= row->state->settings.world_city_count)
        return;

    WorldTimeCityDto *city =
        &row->state->settings.world_cities[row->entry_idx];

    GTimeZone *tz = g_time_zone_new_identifier(city->tz_id);
    GDateTime *utc   = g_date_time_new_now_utc();
    GDateTime *local = g_date_time_to_timezone(utc, tz);

    int h = g_date_time_get_hour(local);
    int m = g_date_time_get_minute(local);

    char buf[16];
    if (row->state->settings.world_use24h) {
        snprintf(buf, sizeof(buf), "%02d:%02d", h, m);
    } else {
        const char *ap = h < 12 ? "오전" : "오후";
        snprintf(buf, sizeof(buf), "%s %02d:%02d", ap, h % 12 ? h % 12 : 12, m);
    }
    gtk_label_set_text(GTK_LABEL(row->time_label), buf);
    snprintf(city->display_time, sizeof(city->display_time), "%02d:%02d", h, m);

    if (row->mini_area)
        gtk_widget_queue_draw(row->mini_area);

    g_date_time_unref(local);
    g_date_time_unref(utc);
    g_time_zone_unref(tz);
}

/* ── Delete button callback ──────────────────────────────────────────────── */

static void on_delete_city(GtkButton *btn, gpointer data)
{
    (void)btn;
    WorldTimeRow *row = (WorldTimeRow *)data;
    AppState *state = row->state;
    int idx = row->entry_idx;

    if (idx < 0 || idx >= state->settings.world_city_count) return;

    for (int i = idx; i < state->settings.world_city_count - 1; i++)
        state->settings.world_cities[i] = state->settings.world_cities[i + 1];
    state->settings.world_city_count--;
    settings_save(&state->settings);

    world_time_panel_reload(
        gtk_widget_get_ancestor(row->row_box, GTK_TYPE_SCROLLED_WINDOW),
        state);
}

/* ── Drag-and-drop callbacks ─────────────────────────────────────────────── */

static GdkContentProvider *on_drag_prepare(GtkDragSource *src,
                                            double x, double y,
                                            gpointer data)
{
    (void)src; (void)x; (void)y;
    WorldTimeRow *row = (WorldTimeRow *)data;
    s_drag_src_idx = row->entry_idx;

    GValue val = G_VALUE_INIT;
    g_value_init(&val, G_TYPE_INT);
    g_value_set_int(&val, row->entry_idx);
    GdkContentProvider *cp = gdk_content_provider_new_for_value(&val);
    g_value_unset(&val);
    return cp;
}

static void on_drag_begin(GtkDragSource *src, GdkDrag *drag, gpointer data)
{
    (void)drag;
    WorldTimeRow *row = (WorldTimeRow *)data;
    GdkPaintable *paintable = gtk_widget_paintable_new(row->row_box);
    gtk_drag_source_set_icon(src, paintable, 0, 0);
    g_object_unref(paintable);
}

static void on_drag_end(GtkDragSource *src, GdkDrag *drag,
                        gboolean delete_data, gpointer data)
{
    (void)src; (void)drag; (void)delete_data; (void)data;
    s_drag_src_idx = -1;
}

static GdkDragAction on_list_drag_motion(GtkDropTarget *target,
                                          double x, double y,
                                          gpointer data)
{
    (void)target; (void)x;
    AppState *state = (AppState *)data;
    if (s_drag_src_idx < 0) return GDK_ACTION_MOVE;

    GtkWidget *list = state->world_list;
    GtkListBoxRow *hover =
        gtk_list_box_get_row_at_y(GTK_LIST_BOX(list), (int)y);
    if (!hover) return GDK_ACTION_MOVE;

    int dst_idx = gtk_list_box_row_get_index(hover);
    if (dst_idx < 0 || dst_idx == s_drag_src_idx) return GDK_ACTION_MOVE;

    /* Shift city data one step at a time toward dst_idx */
    WorldTimeCityDto tmp = state->settings.world_cities[s_drag_src_idx];
    int step = (dst_idx > s_drag_src_idx) ? 1 : -1;
    for (int i = s_drag_src_idx; i != dst_idx; i += step)
        state->settings.world_cities[i] = state->settings.world_cities[i + step];
    state->settings.world_cities[dst_idx] = tmp;

    /* Move the source list row widget to dst position (no widget rebuild) */
    GtkListBoxRow *src_lbrow =
        gtk_list_box_get_row_at_index(GTK_LIST_BOX(list), s_drag_src_idx);
    if (src_lbrow) {
        g_object_ref(src_lbrow);
        gtk_list_box_remove(GTK_LIST_BOX(list), GTK_WIDGET(src_lbrow));
        gtk_list_box_insert(GTK_LIST_BOX(list), GTK_WIDGET(src_lbrow), dst_idx);
        g_object_unref(src_lbrow);
    }

    s_drag_src_idx = dst_idx;

    /* Update entry_idx and time labels for all rows to match new positions */
    int idx = 0;
    for (GtkWidget *lr = gtk_widget_get_first_child(list);
         lr != NULL;
         lr = gtk_widget_get_next_sibling(lr)) {
        GtkWidget *row_box = gtk_list_box_row_get_child(GTK_LIST_BOX_ROW(lr));
        WorldTimeRow *wtr =
            g_object_get_data(G_OBJECT(row_box), "world-time-row");
        if (wtr) {
            wtr->entry_idx = idx;
            update_row_time(wtr);
        }
        idx++;
    }

    return GDK_ACTION_MOVE;
}

static gboolean on_list_drop(GtkDropTarget *target, const GValue *value,
                              double x, double y, gpointer data)
{
    (void)target; (void)value; (void)x; (void)y;
    AppState *state = (AppState *)data;
    s_drag_src_idx = -1;
    settings_save(&state->settings);
    return TRUE;
}

/* ── Build one row ───────────────────────────────────────────────────────── */

static WorldTimeRow *make_row(AppState *state, int idx)
{
    WorldTimeRow *row = g_new0(WorldTimeRow, 1);
    row->state     = state;
    row->entry_idx = idx;

    const WorldTimeCityDto *city = &state->settings.world_cities[idx];

    row->row_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_add_css_class(row->row_box, "world-time-row");
    gtk_widget_set_margin_start(row->row_box, 4);
    gtk_widget_set_margin_end(row->row_box, 8);
    gtk_widget_set_margin_top(row->row_box, 4);
    gtk_widget_set_margin_bottom(row->row_box, 4);

    /* Store row pointer for update access */
    g_object_set_data_full(G_OBJECT(row->row_box), "world-time-row",
                           row, g_free);

    /* Drag handle */
    GtkWidget *grip = gtk_image_new_from_icon_name("list-drag-handle-symbolic");
    gtk_widget_set_opacity(grip, 0.4);
    gtk_widget_set_tooltip_text(grip, "드래그하여 순서 변경");
    gtk_box_append(GTK_BOX(row->row_box), grip);

    /* Drag source on the grip */
    GtkDragSource *drag_src = gtk_drag_source_new();
    gtk_drag_source_set_actions(drag_src, GDK_ACTION_MOVE);
    g_signal_connect(drag_src, "prepare", G_CALLBACK(on_drag_prepare), row);
    g_signal_connect(drag_src, "drag-begin", G_CALLBACK(on_drag_begin), row);
    g_signal_connect(drag_src, "drag-end", G_CALLBACK(on_drag_end), row);
    gtk_widget_add_controller(grip, GTK_EVENT_CONTROLLER(drag_src));

    /* Mini analog clock */
    GtkWidget *mini = gtk_drawing_area_new();
    gtk_widget_set_size_request(mini, MINI_SIZE, MINI_SIZE);
    gtk_drawing_area_set_draw_func(GTK_DRAWING_AREA(mini),
                                   mini_clock_draw, row, NULL);
    row->mini_area = mini;
    gtk_box_append(GTK_BOX(row->row_box), mini);

    /* City info box */
    GtkWidget *info = gtk_box_new(GTK_ORIENTATION_VERTICAL, 2);
    gtk_widget_set_hexpand(info, TRUE);

    row->city_label = gtk_label_new(city->city);
    gtk_widget_set_halign(row->city_label, GTK_ALIGN_START);
    gtk_widget_add_css_class(row->city_label, "world-city-name");
    gtk_box_append(GTK_BOX(info), row->city_label);

    row->region_label = gtk_label_new(city->region);
    gtk_widget_set_halign(row->region_label, GTK_ALIGN_START);
    gtk_widget_add_css_class(row->region_label, "world-city-region");
    gtk_box_append(GTK_BOX(info), row->region_label);

    gtk_box_append(GTK_BOX(row->row_box), info);

    /* Time label */
    row->time_label = gtk_label_new("--:--");
    gtk_widget_add_css_class(row->time_label, "world-city-time");
    gtk_box_append(GTK_BOX(row->row_box), row->time_label);

    /* Delete button */
    GtkWidget *del_btn = gtk_button_new_from_icon_name("list-remove-symbolic");
    gtk_widget_add_css_class(del_btn, "flat");
    gtk_widget_set_tooltip_text(del_btn, "삭제");
    g_signal_connect(del_btn, "clicked", G_CALLBACK(on_delete_city), row);
    gtk_box_append(GTK_BOX(row->row_box), del_btn);

    update_row_time(row);

    return row;
}

/* ── Panel widget ────────────────────────────────────────────────────────── */

GtkWidget *world_time_panel_new(AppState *state)
{
    GtkWidget *scroll = gtk_scrolled_window_new();
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_vexpand(scroll, TRUE);

    GtkWidget *list = gtk_list_box_new();
    gtk_list_box_set_selection_mode(GTK_LIST_BOX(list), GTK_SELECTION_NONE);
    gtk_widget_add_css_class(list, "world-time-list");
    gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(scroll), list);
    state->world_list = list;

    /* Drop target on the list for reorder */
    GtkDropTarget *drop_target =
        gtk_drop_target_new(G_TYPE_INT, GDK_ACTION_MOVE);
    g_signal_connect(drop_target, "motion",
                     G_CALLBACK(on_list_drag_motion), state);
    g_signal_connect(drop_target, "drop",
                     G_CALLBACK(on_list_drop), state);
    gtk_widget_add_controller(list, GTK_EVENT_CONTROLLER(drop_target));

    g_object_set_data(G_OBJECT(scroll), "state", state);

    world_time_panel_reload(scroll, state);
    return scroll;
}

void world_time_panel_reload(GtkWidget *panel, AppState *state)
{
    (void)panel;
    GtkWidget *list = state->world_list;
    if (!list) return;

    GtkWidget *child;
    while ((child = gtk_widget_get_first_child(list)) != NULL)
        gtk_list_box_remove(GTK_LIST_BOX(list), child);

    for (int i = 0; i < state->settings.world_city_count; i++) {
        WorldTimeRow *row = make_row(state, i);
        GtkWidget *list_row = gtk_list_box_row_new();
        gtk_list_box_row_set_child(GTK_LIST_BOX_ROW(list_row), row->row_box);
        gtk_list_box_row_set_selectable(GTK_LIST_BOX_ROW(list_row), FALSE);
        gtk_list_box_append(GTK_LIST_BOX(list), list_row);
    }
}

void world_time_panel_update(GtkWidget *panel, AppState *state)
{
    (void)panel;
    GtkWidget *list = state->world_list;
    if (!list) return;

    int idx = 0;
    for (GtkWidget *list_row = gtk_widget_get_first_child(list);
         list_row != NULL;
         list_row = gtk_widget_get_next_sibling(list_row)) {
        GtkWidget *row_box =
            gtk_list_box_row_get_child(GTK_LIST_BOX_ROW(list_row));
        WorldTimeRow *wtr =
            g_object_get_data(G_OBJECT(row_box), "world-time-row");
        if (wtr) {
            wtr->entry_idx = idx;
            update_row_time(wtr);
        }
        idx++;
    }
}
