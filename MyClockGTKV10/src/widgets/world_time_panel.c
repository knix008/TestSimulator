#include <math.h>
#include <string.h>
#include "world_time_panel.h"
#include "analog_clock.h"

/* Mini analog clock size */
#define MINI_SIZE 48

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
    analog_clock_draw(cr, width, height, local, ANALOG_STYLE_MINIMAL, &colors);

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

    /* Remove from array */
    for (int i = idx; i < state->settings.world_city_count - 1; i++)
        state->settings.world_cities[i] = state->settings.world_cities[i + 1];
    state->settings.world_city_count--;

    /* Rebuild panel */
    world_time_panel_reload(
        gtk_widget_get_parent(gtk_widget_get_parent(row->row_box)),
        state);
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
    gtk_widget_set_margin_start(row->row_box, 8);
    gtk_widget_set_margin_end(row->row_box, 8);
    gtk_widget_set_margin_top(row->row_box, 4);
    gtk_widget_set_margin_bottom(row->row_box, 4);

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

    g_object_set_data(G_OBJECT(scroll), "state", state);

    world_time_panel_reload(scroll, state);
    return scroll;
}

void world_time_panel_reload(GtkWidget *panel, AppState *state)
{
    GtkWidget *list = state->world_list;
    if (!list) return;

    /* Clear existing rows */
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
    GtkWidget *list = state->world_list;
    if (!list) return;

    int idx = 0;
    for (GtkWidget *row = gtk_widget_get_first_child(list);
         row != NULL;
         row = gtk_widget_get_next_sibling(row)) {
        /* Each row is a GtkListBoxRow wrapping a row_box.
           We stored WorldTimeRow in the row_box's data. */
        GtkWidget *row_child = gtk_list_box_row_get_child(GTK_LIST_BOX_ROW(row));
        WorldTimeRow *wtr = g_object_get_data(G_OBJECT(row_child), "world-time-row");
        if (wtr) {
            wtr->entry_idx = idx;
            update_row_time(wtr);
        }
        idx++;
    }
}
