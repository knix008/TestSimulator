#include <gtk/gtk.h>
#include <glib.h>
#include <stdlib.h>
#include <string.h>
#include "app_state.h"
#include "main_window.h"
#include "models/settings.h"
#include "services/timer_service.h"
#include "services/stopwatch_service.h"

static AppState g_app;

/* ── Error popup ────────────────────────────────────────────────────────── */

typedef struct {
    GtkWidget *dialog;
    GtkWidget *text_view;
} ErrorPopup;

static void on_error_copy(GtkButton *btn, gpointer data)
{
    (void)btn;
    GtkTextView *tv = GTK_TEXT_VIEW(data);
    GtkTextBuffer *buf = gtk_text_view_get_buffer(tv);
    GtkTextIter start, end;
    gtk_text_buffer_get_bounds(buf, &start, &end);
    gchar *text = gtk_text_buffer_get_text(buf, &start, &end, FALSE);
    GdkClipboard *clipboard = gdk_display_get_clipboard(gdk_display_get_default());
    gdk_clipboard_set_text(clipboard, text);
    g_free(text);
    gtk_button_set_label(btn, "복사됨 ✓");
}

static void on_error_close(GtkButton *btn, gpointer data)
{
    (void)btn;
    gtk_window_destroy(GTK_WINDOW(data));
}

static void show_error_popup(const char *domain, GLogLevelFlags level,
                              const char *message)
{
    const char *level_str;
    switch (level & G_LOG_LEVEL_MASK) {
    case G_LOG_LEVEL_ERROR:    level_str = "오류";    break;
    case G_LOG_LEVEL_CRITICAL: level_str = "심각한 오류"; break;
    case G_LOG_LEVEL_WARNING:  level_str = "경고";    break;
    default:                   level_str = "알림";    break;
    }

    GtkWidget *win = gtk_window_new();
    gtk_window_set_title(GTK_WINDOW(win), level_str);
    gtk_window_set_default_size(GTK_WINDOW(win), 420, 240);
    gtk_window_set_resizable(GTK_WINDOW(win), TRUE);

    /* Transient for the main window if available */
    if (g_app.main_window && GTK_IS_WINDOW(g_app.main_window))
        gtk_window_set_transient_for(GTK_WINDOW(win),
                                     GTK_WINDOW(g_app.main_window));

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 8);
    gtk_widget_set_margin_start(vbox, 16);
    gtk_widget_set_margin_end(vbox, 16);
    gtk_widget_set_margin_top(vbox, 12);
    gtk_widget_set_margin_bottom(vbox, 12);
    gtk_window_set_child(GTK_WINDOW(win), vbox);

    /* Icon + title */
    GtkWidget *hdr = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    GtkWidget *icon = gtk_image_new_from_icon_name("dialog-error-symbolic");
    gtk_image_set_pixel_size(GTK_IMAGE(icon), 32);
    gtk_box_append(GTK_BOX(hdr), icon);
    gchar *title_text = g_strdup_printf("<b>%s</b>  <span size='small' fgcolor='#888'>%s</span>",
                                        level_str, domain ? domain : "");
    GtkWidget *title_lbl = gtk_label_new(NULL);
    gtk_label_set_markup(GTK_LABEL(title_lbl), title_text);
    g_free(title_text);
    gtk_widget_set_hexpand(title_lbl, TRUE);
    gtk_widget_set_halign(title_lbl, GTK_ALIGN_START);
    gtk_box_append(GTK_BOX(hdr), title_lbl);
    gtk_box_append(GTK_BOX(vbox), hdr);

    /* Scrolled text view for the message */
    GtkWidget *scroll = gtk_scrolled_window_new();
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_vexpand(scroll, TRUE);
    gtk_widget_set_size_request(scroll, -1, 100);

    GtkWidget *tv = gtk_text_view_new();
    gtk_text_view_set_editable(GTK_TEXT_VIEW(tv), FALSE);
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(tv), GTK_WRAP_WORD_CHAR);
    gtk_widget_set_margin_start(tv, 4);
    gtk_widget_set_margin_end(tv, 4);
    gtk_widget_set_margin_top(tv, 4);
    gtk_widget_set_margin_bottom(tv, 4);
    gtk_text_buffer_set_text(gtk_text_view_get_buffer(GTK_TEXT_VIEW(tv)),
                             message ? message : "", -1);
    gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(scroll), tv);
    gtk_box_append(GTK_BOX(vbox), scroll);

    /* Button row */
    GtkWidget *btn_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_halign(btn_row, GTK_ALIGN_END);

    GtkWidget *copy_btn = gtk_button_new_with_label("내용 복사");
    g_signal_connect(copy_btn, "clicked", G_CALLBACK(on_error_copy), tv);
    gtk_box_append(GTK_BOX(btn_row), copy_btn);

    GtkWidget *close_btn = gtk_button_new_with_label("닫기");
    gtk_widget_add_css_class(close_btn, "suggested-action");
    g_signal_connect(close_btn, "clicked", G_CALLBACK(on_error_close), win);
    gtk_box_append(GTK_BOX(btn_row), close_btn);

    gtk_box_append(GTK_BOX(vbox), btn_row);

    gtk_window_present(GTK_WINDOW(win));
}

static void error_log_handler(const gchar *domain, GLogLevelFlags level,
                               const gchar *message, gpointer user_data)
{
    (void)user_data;
    /* Always print to stderr */
    g_printerr("[%s] %s\n", domain ? domain : "?", message ? message : "");

    /* Show popup only for errors and criticals */
    if ((level & (G_LOG_LEVEL_ERROR | G_LOG_LEVEL_CRITICAL)) &&
        g_app.main_window != NULL) {
        show_error_popup(domain, level, message);
    }
}

/* ── App lifecycle ──────────────────────────────────────────────────────── */

static void on_activate(GtkApplication *app, gpointer user_data)
{
    AppState *state = (AppState *)user_data;
    state->app = app;

    /* Load persisted settings */
    settings_load(&state->settings);

    /* Initialise timer services */
    for (int i = 0; i < MAX_TIMERS; i++) {
        timer_service_init(&state->timers[i]);
        if (i < state->settings.timer_count) {
            const TimerDto *d = &state->settings.timers[i];
            timer_service_set(&state->timers[i],
                              d->hours, d->minutes, d->seconds, d->label);
        } else {
            timer_service_set(&state->timers[i], 0, 5, 0, "");
        }
    }

    /* Ensure at least one timer slot */
    if (state->settings.timer_count == 0) {
        state->settings.timer_count = 1;
        state->settings.timers[0].hours   = 0;
        state->settings.timers[0].minutes = 5;
        state->settings.timers[0].seconds = 0;
    }

    /* Alarm fire-tracking table */
    state->fired_alarms = g_hash_table_new_full(g_str_hash, g_str_equal,
                                                g_free, NULL);

    /* Build main window */
    GtkWidget *win = main_window_new(state);
    gtk_window_present(GTK_WINDOW(win));
}

int main(int argc, char **argv)
{
    /* Use Cairo renderer to avoid Mesa/EGL warnings on systems without GPU */
    if (!g_getenv("GSK_RENDERER"))
        g_setenv("GSK_RENDERER", "cairo", TRUE);

    memset(&g_app, 0, sizeof(g_app));

    /* Install error log handler (shows popup for critical/error messages) */
    g_log_set_handler(NULL,
                      G_LOG_LEVEL_ERROR | G_LOG_LEVEL_CRITICAL | G_LOG_LEVEL_WARNING,
                      error_log_handler, NULL);
    g_log_set_handler("Gtk",
                      G_LOG_LEVEL_CRITICAL | G_LOG_LEVEL_WARNING,
                      error_log_handler, NULL);

    GtkApplication *app = gtk_application_new("io.github.myclock",
                                              G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(app, "activate", G_CALLBACK(on_activate), &g_app);

    int status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
