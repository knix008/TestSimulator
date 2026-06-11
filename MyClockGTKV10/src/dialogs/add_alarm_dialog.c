#include <gtk/gtk.h>
#include <string.h>
#include "add_alarm_dialog.h"

/* ── Internal dialog state ─────────────────────────────────────────────── */

typedef struct {
    GtkWidget *dialog;
    /* Input widgets */
    GtkWidget *hour_spin;
    GtkWidget *minute_spin;
    GtkWidget *label_entry;
    GtkWidget *repeat_sw;
    GtkWidget *day_checks[7];
    GtkWidget *day_box;
    /* Result — written on OK, read after loop */
    AlarmItem  result;
    gboolean   confirmed;
} AlarmDialogData;

static void on_repeat_toggled(GtkSwitch *sw, GParamSpec *ps, gpointer data)
{
    (void)ps;
    AlarmDialogData *d = (AlarmDialogData *)data;
    gtk_widget_set_visible(d->day_box, gtk_switch_get_active(sw));
}

/* Read widget values and store in d->result before destroying the window */
static void on_ok_clicked(GtkButton *btn, gpointer data)
{
    (void)btn;
    AlarmDialogData *d = (AlarmDialogData *)data;

    d->result.hour   = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(d->hour_spin));
    d->result.minute = (int)gtk_spin_button_get_value(GTK_SPIN_BUTTON(d->minute_spin));

    const char *text = gtk_editable_get_text(GTK_EDITABLE(d->label_entry));
    g_strlcpy(d->result.label, text ? text : "", sizeof(d->result.label));

    d->result.is_repeat   = gtk_switch_get_active(GTK_SWITCH(d->repeat_sw));
    d->result.repeat_days = 0;
    if (d->result.is_repeat) {
        for (int i = 0; i < 7; i++) {
            if (gtk_check_button_get_active(GTK_CHECK_BUTTON(d->day_checks[i])))
                d->result.repeat_days |= (1 << i);
        }
    }
    d->confirmed = TRUE;
    gtk_window_destroy(GTK_WINDOW(d->dialog));
}

static void on_cancel_clicked(GtkButton *btn, gpointer data)
{
    (void)btn;
    AlarmDialogData *d = (AlarmDialogData *)data;
    d->confirmed = FALSE;
    gtk_window_destroy(GTK_WINDOW(d->dialog));
}

/* ── Public API ─────────────────────────────────────────────────────────── */

gboolean add_alarm_dialog_run(GtkWindow *parent, AlarmItem *out)
{
    GtkWidget *win = gtk_window_new();
    gtk_window_set_title(GTK_WINDOW(win), "알람 추가");
    gtk_window_set_modal(GTK_WINDOW(win), TRUE);
    gtk_window_set_transient_for(GTK_WINDOW(win), parent);
    gtk_window_set_default_size(GTK_WINDOW(win), 320, -1);
    gtk_window_set_resizable(GTK_WINDOW(win), FALSE);

    /* dd is heap-allocated and freed manually after the loop */
    AlarmDialogData *dd = g_new0(AlarmDialogData, 1);
    dd->dialog    = win;
    dd->result    = *out;   /* preserve pre-set fields (e.g. id) */
    dd->confirmed = FALSE;

    GtkWidget *main_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 12);
    gtk_widget_set_margin_start(main_box, 20);
    gtk_widget_set_margin_end(main_box, 20);
    gtk_widget_set_margin_top(main_box, 16);
    gtk_widget_set_margin_bottom(main_box, 12);
    gtk_window_set_child(GTK_WINDOW(win), main_box);

    /* Time row */
    GtkWidget *time_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_halign(time_row, GTK_ALIGN_CENTER);

    dd->hour_spin = gtk_spin_button_new_with_range(0, 23, 1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(dd->hour_spin), out->hour);
    gtk_widget_set_size_request(dd->hour_spin, 64, -1);
    gtk_box_append(GTK_BOX(time_row), dd->hour_spin);
    gtk_box_append(GTK_BOX(time_row), gtk_label_new(":"));

    dd->minute_spin = gtk_spin_button_new_with_range(0, 59, 1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(dd->minute_spin), out->minute);
    gtk_widget_set_size_request(dd->minute_spin, 64, -1);
    gtk_box_append(GTK_BOX(time_row), dd->minute_spin);
    gtk_box_append(GTK_BOX(main_box), time_row);

    /* Label entry */
    gtk_box_append(GTK_BOX(main_box), gtk_label_new("이름 (선택)"));
    dd->label_entry = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(dd->label_entry), "알람 이름");
    if (out->label[0])
        gtk_editable_set_text(GTK_EDITABLE(dd->label_entry), out->label);
    gtk_box_append(GTK_BOX(main_box), dd->label_entry);

    /* Repeat switch */
    GtkWidget *rep_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    GtkWidget *rep_lbl = gtk_label_new("반복");
    gtk_widget_set_hexpand(rep_lbl, TRUE);
    gtk_widget_set_halign(rep_lbl, GTK_ALIGN_START);
    gtk_box_append(GTK_BOX(rep_row), rep_lbl);
    dd->repeat_sw = gtk_switch_new();
    gtk_switch_set_active(GTK_SWITCH(dd->repeat_sw), out->is_repeat);
    g_signal_connect(dd->repeat_sw, "notify::active",
                     G_CALLBACK(on_repeat_toggled), dd);
    gtk_box_append(GTK_BOX(rep_row), dd->repeat_sw);
    gtk_box_append(GTK_BOX(main_box), rep_row);

    /* Day checkboxes */
    static const char *day_names[] = { "일","월","화","수","목","금","토" };
    dd->day_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_widget_set_halign(dd->day_box, GTK_ALIGN_CENTER);
    for (int i = 0; i < 7; i++) {
        dd->day_checks[i] = gtk_check_button_new_with_label(day_names[i]);
        gboolean checked = out->is_repeat && (out->repeat_days & (1 << i));
        gtk_check_button_set_active(GTK_CHECK_BUTTON(dd->day_checks[i]), checked);
        gtk_box_append(GTK_BOX(dd->day_box), dd->day_checks[i]);
    }
    gtk_widget_set_visible(dd->day_box, out->is_repeat);
    gtk_box_append(GTK_BOX(main_box), dd->day_box);

    /* Button row */
    GtkWidget *btn_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_halign(btn_row, GTK_ALIGN_END);
    gtk_widget_set_margin_top(btn_row, 8);

    GtkWidget *cancel_btn = gtk_button_new_with_label("취소");
    g_signal_connect(cancel_btn, "clicked", G_CALLBACK(on_cancel_clicked), dd);
    gtk_box_append(GTK_BOX(btn_row), cancel_btn);

    GtkWidget *ok_btn = gtk_button_new_with_label("확인");
    gtk_widget_add_css_class(ok_btn, "suggested-action");
    g_signal_connect(ok_btn, "clicked", G_CALLBACK(on_ok_clicked), dd);
    gtk_box_append(GTK_BOX(btn_row), ok_btn);

    gtk_box_append(GTK_BOX(main_box), btn_row);

    /* Run a nested main loop until the dialog is destroyed */
    GMainLoop *loop = g_main_loop_new(NULL, FALSE);
    g_signal_connect_swapped(win, "destroy",
                             G_CALLBACK(g_main_loop_quit), loop);
    gtk_window_present(GTK_WINDOW(win));
    g_main_loop_run(loop);
    g_main_loop_unref(loop);

    /* Window is now destroyed; dd->result and dd->confirmed are still valid */
    gboolean confirmed = dd->confirmed;
    if (confirmed) *out = dd->result;
    g_free(dd);
    return confirmed;
}

gboolean edit_alarm_dialog_run(GtkWindow *parent, AlarmItem *inout)
{
    return add_alarm_dialog_run(parent, inout);
}
