#include <gtk/gtk.h>
#include <string.h>
#include "calendar_event_dialog.h"

/* ── Date-picker popover ──────────────────────────────────────────────────── */

typedef struct {
    GtkWidget   *button;     /* the button that opens the picker */
    GtkWidget   *year_spin;
    GtkWidget   *month_spin;
    GtkWidget   *day_spin;
    GtkWidget   *popover;    /* created once, reused */
    GtkWidget   *calendar;   /* inside popover */
} DatePicker;

static void on_calendar_day_selected(GtkCalendar *cal, gpointer data)
{
    DatePicker *dp = (DatePicker *)data;
    GDateTime *dt = gtk_calendar_get_date(cal);
    int y = g_date_time_get_year(dt);
    int m = g_date_time_get_month(dt);
    int d = g_date_time_get_day_of_month(dt);
    g_date_time_unref(dt);

    gtk_spin_button_set_value(GTK_SPIN_BUTTON(dp->year_spin),  (double)y);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(dp->month_spin), (double)m);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(dp->day_spin),   (double)d);

    char label[20];
    snprintf(label, sizeof(label), "%04d-%02d-%02d", y, m, d);
    gtk_button_set_label(GTK_BUTTON(dp->button), label);
}

static void on_date_button_clicked(GtkButton *btn, gpointer data)
{
    (void)btn;
    DatePicker *dp = (DatePicker *)data;

    /* Sync calendar to current spin values, then popup */
    int y  = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(dp->year_spin));
    int mo = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(dp->month_spin));
    int d  = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(dp->day_spin));
    GDateTime *dt = g_date_time_new_local(y, mo, d, 0, 0, 0);
    if (dt) {
        gtk_calendar_select_day(GTK_CALENDAR(dp->calendar), dt);
        g_date_time_unref(dt);
    }
    gtk_popover_popup(GTK_POPOVER(dp->popover));
}

/* Build a date row: label + [calendar button] + hidden year/month/day spins */
static GtkWidget *make_date_picker_row(const char *label_text,
                                       GtkWidget **out_y,
                                       GtkWidget **out_mo,
                                       GtkWidget **out_d,
                                       int year, int month, int day,
                                       DatePicker *dp)
{
    GtkWidget *hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);

    GtkWidget *lbl = gtk_label_new(label_text);
    gtk_widget_set_size_request(lbl, 72, -1);
    gtk_widget_set_halign(lbl, GTK_ALIGN_START);
    gtk_box_append(GTK_BOX(hbox), lbl);

    /* Hidden spin buttons for storing the value */
    *out_y  = gtk_spin_button_new_with_range(2020, 2099, 1);
    *out_mo = gtk_spin_button_new_with_range(1, 12, 1);
    *out_d  = gtk_spin_button_new_with_range(1, 31, 1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(*out_y),  year);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(*out_mo), month);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(*out_d),  day);
    gtk_widget_set_visible(*out_y,  FALSE);
    gtk_widget_set_visible(*out_mo, FALSE);
    gtk_widget_set_visible(*out_d,  FALSE);
    gtk_box_append(GTK_BOX(hbox), *out_y);
    gtk_box_append(GTK_BOX(hbox), *out_mo);
    gtk_box_append(GTK_BOX(hbox), *out_d);

    /* Calendar button */
    char btn_label[20];
    snprintf(btn_label, sizeof(btn_label), "%04d-%02d-%02d", year, month, day);
    GtkWidget *btn = gtk_button_new_with_label(btn_label);
    gtk_widget_set_hexpand(btn, TRUE);
    gtk_box_append(GTK_BOX(hbox), btn);

    dp->button     = btn;
    dp->year_spin  = *out_y;
    dp->month_spin = *out_mo;
    dp->day_spin   = *out_d;

    /* Create popover once; attach to the button as parent */
    GtkWidget *popover = gtk_popover_new();
    gtk_widget_set_parent(popover, btn);
    gtk_popover_set_has_arrow(GTK_POPOVER(popover), TRUE);

    GtkWidget *cal = gtk_calendar_new();
    GDateTime *dt = g_date_time_new_local(year, month, day, 0, 0, 0);
    if (dt) {
        gtk_calendar_select_day(GTK_CALENDAR(cal), dt);
        g_date_time_unref(dt);
    }
    gtk_popover_set_child(GTK_POPOVER(popover), cal);

    g_signal_connect(cal, "day-selected",
                     G_CALLBACK(on_calendar_day_selected), dp);
    g_signal_connect_swapped(cal, "day-selected",
                             G_CALLBACK(gtk_popover_popdown), popover);

    dp->popover  = popover;
    dp->calendar = cal;

    g_signal_connect(btn, "clicked", G_CALLBACK(on_date_button_clicked), dp);

    return hbox;
}

/* ── Spin helper (for time fields) ──────────────────────────────────────── */

static GtkWidget *make_spin(int min, int max, int val)
{
    GtkWidget *spin = gtk_spin_button_new_with_range(min, max, 1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(spin), val);
    gtk_spin_button_set_wrap(GTK_SPIN_BUTTON(spin), TRUE);
    gtk_widget_set_size_request(spin, 64, -1);
    return spin;
}

/* ── Dialog state ─────────────────────────────────────────────────────────── */

typedef struct {
    GtkWidget *dialog;
    GtkWidget *title_entry;
    GtkWidget *allday_check;
    GtkWidget *start_time_row;
    GtkWidget *start_year_spin;
    GtkWidget *start_month_spin;
    GtkWidget *start_day_spin;
    GtkWidget *start_hour_spin;
    GtkWidget *start_min_spin;
    GtkWidget *end_time_row;
    GtkWidget *end_year_spin;
    GtkWidget *end_month_spin;
    GtkWidget *end_day_spin;
    GtkWidget *end_hour_spin;
    GtkWidget *end_min_spin;
    GtkWidget *location_entry;
    GtkWidget *memo_view;
    GtkWidget *color_btn;
    GtkWidget *delete_btn;
    GMainLoop *loop;
    gboolean   accepted;
    gboolean   deleted;
    DatePicker dp_start;
    DatePicker dp_end;
} CalEventUI;

static void on_allday_toggled(GtkCheckButton *cb, gpointer data)
{
    CalEventUI *ui = (CalEventUI *)data;
    gboolean allday = gtk_check_button_get_active(cb);
    gtk_widget_set_visible(ui->start_time_row, !allday);
    gtk_widget_set_visible(ui->end_time_row,   !allday);
}

static void on_ok_clicked(GtkButton *btn, gpointer data)
{
    (void)btn;
    CalEventUI *ui = (CalEventUI *)data;
    ui->accepted = TRUE;
    g_main_loop_quit(ui->loop);
}

static void on_cancel_clicked(GtkButton *btn, gpointer data)
{
    (void)btn;
    CalEventUI *ui = (CalEventUI *)data;
    ui->accepted = FALSE;
    g_main_loop_quit(ui->loop);
}

static void on_delete_clicked(GtkButton *btn, gpointer data)
{
    (void)btn;
    CalEventUI *ui = (CalEventUI *)data;
    ui->deleted  = TRUE;
    ui->accepted = FALSE;
    g_main_loop_quit(ui->loop);
}

static gboolean on_close_request(GtkWindow *win, gpointer data)
{
    (void)win;
    CalEventUI *ui = (CalEventUI *)data;
    ui->accepted = FALSE;
    g_main_loop_quit(ui->loop);
    return TRUE;  /* prevent default destroy — we destroy explicitly below */
}

static GtkWidget *make_time_row(const char *label_text,
                                GtkWidget **h, GtkWidget **m,
                                int hour, int min)
{
    GtkWidget *hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    GtkWidget *lbl  = gtk_label_new(label_text);
    gtk_widget_set_size_request(lbl, 72, -1);
    gtk_widget_set_halign(lbl, GTK_ALIGN_START);
    gtk_box_append(GTK_BOX(hbox), lbl);
    *h = make_spin(0, 23, hour);
    *m = make_spin(0, 59, min);
    gtk_box_append(GTK_BOX(hbox), *h);
    gtk_box_append(GTK_BOX(hbox), gtk_label_new(":"));
    gtk_box_append(GTK_BOX(hbox), *m);
    return hbox;
}

/* ── Public entry point ──────────────────────────────────────────────────── */

gboolean calendar_event_dialog_run(GtkWindow    *parent,
                                   CalendarEvent *event,
                                   gboolean      *delete_requested)
{
    CalEventUI ui;
    memset(&ui, 0, sizeof(ui));

    if (delete_requested) *delete_requested = FALSE;

    GtkWidget *win = gtk_window_new();
    ui.dialog = win;
    gtk_window_set_title(GTK_WINDOW(win),
                         event->id[0] ? "일정 편집" : "새 일정");
    gtk_window_set_default_size(GTK_WINDOW(win), 380, -1);
    gtk_window_set_resizable(GTK_WINDOW(win), FALSE);
    if (parent)
        gtk_window_set_transient_for(GTK_WINDOW(win), parent);
    gtk_window_set_modal(GTK_WINDOW(win), TRUE);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 8);
    gtk_widget_set_margin_start(vbox, 16);
    gtk_widget_set_margin_end(vbox, 16);
    gtk_widget_set_margin_top(vbox, 12);
    gtk_widget_set_margin_bottom(vbox, 12);
    gtk_window_set_child(GTK_WINDOW(win), vbox);

    /* Default date values */
    int sy = event->start_year  ? event->start_year  : 2024;
    int sm = event->start_month ? event->start_month : 1;
    int sd = event->start_day   ? event->start_day   : 1;
    int ey = event->end_year    ? event->end_year    : sy;
    int em = event->end_month   ? event->end_month   : sm;
    int ed = event->end_day     ? event->end_day     : sd;

    /* Title */
    {
        GtkWidget *row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
        GtkWidget *lbl = gtk_label_new("제목:");
        gtk_widget_set_size_request(lbl, 72, -1);
        gtk_widget_set_halign(lbl, GTK_ALIGN_START);
        gtk_box_append(GTK_BOX(row), lbl);
        ui.title_entry = gtk_entry_new();
        gtk_widget_set_hexpand(ui.title_entry, TRUE);
        if (event->title[0])
            gtk_editable_set_text(GTK_EDITABLE(ui.title_entry), event->title);
        gtk_box_append(GTK_BOX(row), ui.title_entry);
        gtk_box_append(GTK_BOX(vbox), row);
    }

    /* Color picker */
    {
        GtkWidget *row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
        GtkWidget *lbl = gtk_label_new("색상:");
        gtk_widget_set_size_request(lbl, 72, -1);
        gtk_widget_set_halign(lbl, GTK_ALIGN_START);
        gtk_box_append(GTK_BOX(row), lbl);

        GdkRGBA rgba;
        const char *init_color = (event->color[0]) ? event->color : "#4285F4";
        if (!gdk_rgba_parse(&rgba, init_color))
            gdk_rgba_parse(&rgba, "#4285F4");

        G_GNUC_BEGIN_IGNORE_DEPRECATIONS
        ui.color_btn = gtk_color_button_new_with_rgba(&rgba);
        gtk_color_button_set_title(GTK_COLOR_BUTTON(ui.color_btn), "일정 색상 선택");
        gtk_color_chooser_set_use_alpha(GTK_COLOR_CHOOSER(ui.color_btn), FALSE);
        G_GNUC_END_IGNORE_DEPRECATIONS
        gtk_box_append(GTK_BOX(row), ui.color_btn);
        gtk_box_append(GTK_BOX(vbox), row);
    }

    /* All-day toggle */
    ui.allday_check = gtk_check_button_new_with_label("하루 종일");
    gtk_check_button_set_active(GTK_CHECK_BUTTON(ui.allday_check), event->is_all_day);
    g_signal_connect(ui.allday_check, "toggled",
                     G_CALLBACK(on_allday_toggled), &ui);
    gtk_box_append(GTK_BOX(vbox), ui.allday_check);

    /* Start date row */
    {
        GtkWidget *row = make_date_picker_row("시작 날짜:",
                                              &ui.start_year_spin,
                                              &ui.start_month_spin,
                                              &ui.start_day_spin,
                                              sy, sm, sd,
                                              &ui.dp_start);
        gtk_box_append(GTK_BOX(vbox), row);
    }

    /* Start time row */
    {
        GtkWidget *time_row = make_time_row("시작 시간:",
                                            &ui.start_hour_spin,
                                            &ui.start_min_spin,
                                            event->start_hour, event->start_minute);
        ui.start_time_row = time_row;
        gtk_box_append(GTK_BOX(vbox), time_row);
    }

    /* End date row */
    {
        GtkWidget *row = make_date_picker_row("종료 날짜:",
                                              &ui.end_year_spin,
                                              &ui.end_month_spin,
                                              &ui.end_day_spin,
                                              ey, em, ed,
                                              &ui.dp_end);
        gtk_box_append(GTK_BOX(vbox), row);
    }

    /* End time row */
    {
        GtkWidget *time_row = make_time_row("종료 시간:",
                                            &ui.end_hour_spin,
                                            &ui.end_min_spin,
                                            event->end_hour,
                                            event->end_minute);
        ui.end_time_row = time_row;
        gtk_box_append(GTK_BOX(vbox), time_row);
    }

    /* Location */
    {
        GtkWidget *row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
        GtkWidget *lbl = gtk_label_new("장소:");
        gtk_widget_set_size_request(lbl, 72, -1);
        gtk_widget_set_halign(lbl, GTK_ALIGN_START);
        gtk_box_append(GTK_BOX(row), lbl);
        ui.location_entry = gtk_entry_new();
        gtk_widget_set_hexpand(ui.location_entry, TRUE);
        if (event->location[0])
            gtk_editable_set_text(GTK_EDITABLE(ui.location_entry), event->location);
        gtk_box_append(GTK_BOX(row), ui.location_entry);
        gtk_box_append(GTK_BOX(vbox), row);
    }

    /* Memo */
    {
        GtkWidget *lbl = gtk_label_new("메모:");
        gtk_widget_set_halign(lbl, GTK_ALIGN_START);
        gtk_box_append(GTK_BOX(vbox), lbl);

        GtkWidget *scroll = gtk_scrolled_window_new();
        gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                       GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
        gtk_widget_set_size_request(scroll, -1, 80);
        ui.memo_view = gtk_text_view_new();
        gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(ui.memo_view), GTK_WRAP_WORD_CHAR);
        if (event->memo[0])
            gtk_text_buffer_set_text(
                gtk_text_view_get_buffer(GTK_TEXT_VIEW(ui.memo_view)),
                event->memo, -1);
        gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(scroll), ui.memo_view);
        gtk_box_append(GTK_BOX(vbox), scroll);
    }

    /* Button row */
    GtkWidget *btn_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_halign(btn_row, GTK_ALIGN_FILL);

    if (event->id[0]) {
        ui.delete_btn = gtk_button_new_with_label("삭제");
        gtk_widget_add_css_class(ui.delete_btn, "destructive-action");
        g_signal_connect(ui.delete_btn, "clicked", G_CALLBACK(on_delete_clicked), &ui);
        gtk_box_append(GTK_BOX(btn_row), ui.delete_btn);
    }

    GtkWidget *spacer = gtk_label_new("");
    gtk_widget_set_hexpand(spacer, TRUE);
    gtk_box_append(GTK_BOX(btn_row), spacer);

    GtkWidget *cancel_btn = gtk_button_new_with_label("취소");
    g_signal_connect(cancel_btn, "clicked", G_CALLBACK(on_cancel_clicked), &ui);
    gtk_box_append(GTK_BOX(btn_row), cancel_btn);

    GtkWidget *ok_btn = gtk_button_new_with_label("저장");
    gtk_widget_add_css_class(ok_btn, "suggested-action");
    g_signal_connect(ok_btn, "clicked", G_CALLBACK(on_ok_clicked), &ui);
    gtk_box_append(GTK_BOX(btn_row), ok_btn);

    gtk_box_append(GTK_BOX(vbox), btn_row);

    /* Apply initial all-day visibility */
    on_allday_toggled(GTK_CHECK_BUTTON(ui.allday_check), &ui);

    /* Run as modal */
    GMainLoop *loop = g_main_loop_new(NULL, FALSE);
    ui.loop = loop;
    g_signal_connect(win, "close-request", G_CALLBACK(on_close_request), &ui);
    gtk_window_present(GTK_WINDOW(win));
    g_main_loop_run(loop);
    g_main_loop_unref(loop);

    /* Collect values while widgets are still alive */
    if (ui.accepted) {
        const char *t = gtk_editable_get_text(GTK_EDITABLE(ui.title_entry));
        g_strlcpy(event->title, t && *t ? t : "제목 없음", sizeof(event->title));
        event->is_all_day    = gtk_check_button_get_active(GTK_CHECK_BUTTON(ui.allday_check));
        event->start_year    = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(ui.start_year_spin));
        event->start_month   = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(ui.start_month_spin));
        event->start_day     = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(ui.start_day_spin));
        event->start_hour    = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(ui.start_hour_spin));
        event->start_minute  = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(ui.start_min_spin));
        event->end_year      = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(ui.end_year_spin));
        event->end_month     = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(ui.end_month_spin));
        event->end_day       = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(ui.end_day_spin));
        event->end_hour      = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(ui.end_hour_spin));
        event->end_minute    = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(ui.end_min_spin));

        const char *loc = gtk_editable_get_text(GTK_EDITABLE(ui.location_entry));
        g_strlcpy(event->location, loc ? loc : "", sizeof(event->location));

        GtkTextBuffer *buf = gtk_text_view_get_buffer(GTK_TEXT_VIEW(ui.memo_view));
        GtkTextIter s, e;
        gtk_text_buffer_get_bounds(buf, &s, &e);
        char *memo = gtk_text_buffer_get_text(buf, &s, &e, FALSE);
        g_strlcpy(event->memo, memo ? memo : "", sizeof(event->memo));
        g_free(memo);

        /* Collect color from color button */
        GdkRGBA rgba = { 0.259, 0.522, 0.957, 1.0 };
        G_GNUC_BEGIN_IGNORE_DEPRECATIONS
        gtk_color_chooser_get_rgba(GTK_COLOR_CHOOSER(ui.color_btn), &rgba);
        G_GNUC_END_IGNORE_DEPRECATIONS
        snprintf(event->color, sizeof(event->color), "#%02x%02x%02x",
                 (int)(rgba.red   * 255.0 + 0.5),
                 (int)(rgba.green * 255.0 + 0.5),
                 (int)(rgba.blue  * 255.0 + 0.5));
    }

    /* Unparent date-picker popovers before window destruction.
       gtk_widget_set_parent attaches them as children of their button;
       GTK warns if a button is finalized while it still has children. */
    if (ui.dp_start.popover)
        gtk_widget_unparent(ui.dp_start.popover);
    if (ui.dp_end.popover)
        gtk_widget_unparent(ui.dp_end.popover);

    /* Now safe to destroy */
    gtk_window_destroy(GTK_WINDOW(win));

    if (delete_requested && ui.deleted) {
        *delete_requested = TRUE;
        return FALSE;
    }

    return ui.accepted;
}
