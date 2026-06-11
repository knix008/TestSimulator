#include <gtk/gtk.h>
#include <string.h>
#include "add_world_time_dialog.h"
#include "../models/city_database.h"

/* ── Internal state ────────────────────────────────────────────────────── */

typedef struct {
    GtkWidget       *dialog;
    GtkWidget       *search_entry;
    GtkWidget       *result_list;
    WorldTimeCityDto selected;    /* set on row selection, read after loop */
    gboolean         has_selection;
    gboolean         confirmed;
} WorldTimeDialogData;

static void on_wt_ok_clicked(GtkButton *btn, gpointer data)
{
    (void)btn;
    WorldTimeDialogData *d = (WorldTimeDialogData *)data;
    if (!d->has_selection) return;
    d->confirmed = TRUE;
    gtk_window_destroy(GTK_WINDOW(d->dialog));
}

static void on_wt_cancel_clicked(GtkButton *btn, gpointer data)
{
    (void)btn;
    WorldTimeDialogData *d = (WorldTimeDialogData *)data;
    d->confirmed = FALSE;
    gtk_window_destroy(GTK_WINDOW(d->dialog));
}

static void populate_results(WorldTimeDialogData *d, const char *query)
{
    GtkWidget *child;
    while ((child = gtk_widget_get_first_child(d->result_list)))
        gtk_list_box_remove(GTK_LIST_BOX(d->result_list), child);

    if (!query || query[0] == '\0') return;

    GPtrArray *results = city_search(query, 20);
    if (!results) return;

    for (guint i = 0; i < results->len; i++) {
        const CityInfo *info = (const CityInfo *)results->pdata[i];

        char disp[160];
        const char *cn = (info->city_en && info->city_en[0])
                         ? info->city_en : info->city;
        snprintf(disp, sizeof(disp), "%s, %s", cn, info->country);

        GtkWidget *lbl = gtk_label_new(disp);
        gtk_widget_set_halign(lbl, GTK_ALIGN_START);
        gtk_widget_set_margin_start(lbl, 8);
        gtk_widget_set_margin_top(lbl, 4);
        gtk_widget_set_margin_bottom(lbl, 4);

        GtkWidget *row = gtk_list_box_row_new();
        gtk_list_box_row_set_child(GTK_LIST_BOX_ROW(row), lbl);
        /* CityInfo pointers are stable (static const array in city_database.c) */
        g_object_set_data(G_OBJECT(row), "city-info", (gpointer)info);
        gtk_list_box_append(GTK_LIST_BOX(d->result_list), row);
    }

    g_ptr_array_unref(results);
}

static void copy_city_to_selected(WorldTimeDialogData *d, const CityInfo *info)
{
    const char *city_name = (info->city_en && info->city_en[0])
                            ? info->city_en : info->city;
    g_strlcpy(d->selected.city,   city_name,    sizeof(d->selected.city));
    g_strlcpy(d->selected.region, info->country, sizeof(d->selected.region));
    g_strlcpy(d->selected.tz_id,  info->tz_id,   sizeof(d->selected.tz_id));
    d->selected.display_time[0] = '\0';
    d->has_selection = TRUE;
}

static void on_search_changed(GtkEditable *editable, gpointer data)
{
    WorldTimeDialogData *d = (WorldTimeDialogData *)data;
    populate_results(d, gtk_editable_get_text(editable));
    d->has_selection = FALSE;
}

static void on_row_selected(GtkListBox *lb, GtkListBoxRow *row, gpointer data)
{
    (void)lb;
    WorldTimeDialogData *d = (WorldTimeDialogData *)data;
    if (!row) { d->has_selection = FALSE; return; }
    const CityInfo *info =
        (const CityInfo *)g_object_get_data(G_OBJECT(row), "city-info");
    if (info) copy_city_to_selected(d, info);
}

static void on_row_activated(GtkListBox *lb, GtkListBoxRow *row, gpointer data)
{
    on_row_selected(lb, row, data);
    WorldTimeDialogData *d = (WorldTimeDialogData *)data;
    if (d->has_selection) {
        d->confirmed = TRUE;
        gtk_window_destroy(GTK_WINDOW(d->dialog));
    }
}

/* ── Public API ─────────────────────────────────────────────────────────── */

gboolean add_world_time_dialog_run(GtkWindow *parent, WorldTimeCityDto *out)
{
    GtkWidget *win = gtk_window_new();
    gtk_window_set_title(GTK_WINDOW(win), "도시 추가");
    gtk_window_set_modal(GTK_WINDOW(win), TRUE);
    gtk_window_set_transient_for(GTK_WINDOW(win), parent);
    gtk_window_set_default_size(GTK_WINDOW(win), 340, 420);

    /* dd is heap-allocated and freed manually after the loop */
    WorldTimeDialogData *d = g_new0(WorldTimeDialogData, 1);
    d->dialog        = win;
    d->has_selection = FALSE;
    d->confirmed     = FALSE;

    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 8);
    gtk_widget_set_margin_start(box, 16);
    gtk_widget_set_margin_end(box, 16);
    gtk_widget_set_margin_top(box, 12);
    gtk_widget_set_margin_bottom(box, 12);
    gtk_window_set_child(GTK_WINDOW(win), box);

    /* Search entry */
    d->search_entry = gtk_search_entry_new();
    gtk_search_entry_set_placeholder_text(GTK_SEARCH_ENTRY(d->search_entry),
                                          "도시 또는 국가 검색…");
    g_signal_connect(d->search_entry, "changed",
                     G_CALLBACK(on_search_changed), d);
    gtk_box_append(GTK_BOX(box), d->search_entry);

    /* Result list in scrolled window */
    GtkWidget *scroll = gtk_scrolled_window_new();
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_vexpand(scroll, TRUE);

    d->result_list = gtk_list_box_new();
    gtk_list_box_set_selection_mode(GTK_LIST_BOX(d->result_list),
                                    GTK_SELECTION_SINGLE);
    g_signal_connect(d->result_list, "row-selected",
                     G_CALLBACK(on_row_selected),  d);
    g_signal_connect(d->result_list, "row-activated",
                     G_CALLBACK(on_row_activated), d);
    gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(scroll), d->result_list);
    gtk_box_append(GTK_BOX(box), scroll);

    /* Buttons */
    GtkWidget *btn_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_halign(btn_row, GTK_ALIGN_END);

    GtkWidget *cancel_btn = gtk_button_new_with_label("취소");
    g_signal_connect(cancel_btn, "clicked", G_CALLBACK(on_wt_cancel_clicked), d);
    gtk_box_append(GTK_BOX(btn_row), cancel_btn);

    GtkWidget *ok_btn = gtk_button_new_with_label("추가");
    gtk_widget_add_css_class(ok_btn, "suggested-action");
    g_signal_connect(ok_btn, "clicked", G_CALLBACK(on_wt_ok_clicked), d);
    gtk_box_append(GTK_BOX(btn_row), ok_btn);

    gtk_box_append(GTK_BOX(box), btn_row);

    GMainLoop *loop = g_main_loop_new(NULL, FALSE);
    g_signal_connect_swapped(win, "destroy",
                             G_CALLBACK(g_main_loop_quit), loop);
    gtk_window_present(GTK_WINDOW(win));
    g_main_loop_run(loop);
    g_main_loop_unref(loop);

    /* Window is destroyed; d->selected and d->confirmed are still valid */
    gboolean confirmed = d->confirmed;
    if (confirmed) *out = d->selected;
    g_free(d);
    return confirmed;
}
