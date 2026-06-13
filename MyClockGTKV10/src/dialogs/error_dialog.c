#include <gtk/gtk.h>
#include <glib.h>
#ifdef __linux__
#  include <execinfo.h>
#endif
#include "error_dialog.h"

static const char *level_label(GLogLevelFlags level)
{
    switch (level & G_LOG_LEVEL_MASK) {
    case G_LOG_LEVEL_ERROR:    return "ERROR";
    case G_LOG_LEVEL_CRITICAL: return "CRITICAL";
    case G_LOG_LEVEL_WARNING:  return "WARNING";
    case G_LOG_LEVEL_MESSAGE:  return "MESSAGE";
    case G_LOG_LEVEL_INFO:     return "INFO";
    case G_LOG_LEVEL_DEBUG:    return "DEBUG";
    default:                   return "LOG";
    }
}

static const char *level_title(GLogLevelFlags level)
{
    switch (level & G_LOG_LEVEL_MASK) {
    case G_LOG_LEVEL_ERROR:    return "오류";
    case G_LOG_LEVEL_CRITICAL: return "심각한 오류";
    case G_LOG_LEVEL_WARNING:  return "경고";
    default:                   return "알림";
    }
}

#ifdef __linux__
static gchar *collect_backtrace(void)
{
    void *frames[48];
    int count = backtrace(frames, G_N_ELEMENTS(frames));
    if (count <= 0)
        return NULL;

    char **symbols = backtrace_symbols(frames, count);
    if (!symbols)
        return NULL;

    GString *trace = g_string_new("\n--- 호출 스택 ---\n");
    for (int i = 1; i < count; i++)
        g_string_append_printf(trace, "%2d: %s\n", i - 1, symbols[i]);

    free(symbols);
    return g_string_free(trace, FALSE);
}
#endif

static gchar *build_report(const char *domain,
                           GLogLevelFlags level,
                           const char *summary,
                           const char *details)
{
    GDateTime *now = g_date_time_new_now_local();
    gchar *timestamp = g_date_time_format(now, "%Y-%m-%d %H:%M:%S");

    GString *report = g_string_new(NULL);
    g_string_append_printf(report, "시각: %s\n", timestamp);
    if (level)
        g_string_append_printf(report, "수준: %s\n", level_label(level));
    if (domain && domain[0])
        g_string_append_printf(report, "도메인: %s\n", domain);
    g_string_append_printf(report, "애플리케이션: MyClock\n");
    g_string_append_printf(report, "GLib: %u.%u.%u\n",
                           glib_major_version,
                           glib_minor_version,
                           glib_micro_version);
    g_string_append_printf(report, "GTK: %u.%u.%u\n",
                           gtk_get_major_version(),
                           gtk_get_minor_version(),
                           gtk_get_micro_version());

    g_string_append(report, "\n--- 요약 ---\n");
    g_string_append(report, summary && summary[0] ? summary : "(메시지 없음)");

    if (details && details[0]) {
        g_string_append(report, "\n\n--- 상세 ---\n");
        g_string_append(report, details);
    }

#ifdef __linux__
    {
        gchar *trace = collect_backtrace();
        if (trace) {
            g_string_append(report, trace);
            g_free(trace);
        }
    }
#endif

    g_free(timestamp);
    g_date_time_unref(now);
    return g_string_free(report, FALSE);
}

static void on_copy_clicked(GtkButton *btn, gpointer data)
{
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

static void on_close_clicked(GtkButton *btn, gpointer data)
{
    (void)btn;
    gtk_window_destroy(GTK_WINDOW(data));
}

static void present_dialog(GtkWindow *parent,
                           const char *title,
                           const char *report)
{
    GtkWidget *win = gtk_window_new();
    gtk_window_set_title(GTK_WINDOW(win), title ? title : "오류");
    gtk_window_set_default_size(GTK_WINDOW(win), 560, 360);
    gtk_window_set_resizable(GTK_WINDOW(win), TRUE);
    if (parent)
        gtk_window_set_transient_for(GTK_WINDOW(win), parent);
    gtk_window_set_modal(GTK_WINDOW(win), parent != NULL);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_widget_set_margin_start(vbox, 16);
    gtk_widget_set_margin_end(vbox, 16);
    gtk_widget_set_margin_top(vbox, 12);
    gtk_widget_set_margin_bottom(vbox, 12);
    gtk_window_set_child(GTK_WINDOW(win), vbox);

    GtkWidget *hdr = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    GtkWidget *icon = gtk_image_new_from_icon_name("dialog-error-symbolic");
    gtk_image_set_pixel_size(GTK_IMAGE(icon), 32);
    gtk_box_append(GTK_BOX(hdr), icon);

    GtkWidget *title_lbl = gtk_label_new(title ? title : "오류");
    gtk_label_set_xalign(GTK_LABEL(title_lbl), 0.0f);
    gtk_widget_add_css_class(title_lbl, "title-4");
    gtk_widget_set_hexpand(title_lbl, TRUE);
    gtk_box_append(GTK_BOX(hdr), title_lbl);
    gtk_box_append(GTK_BOX(vbox), hdr);

    GtkWidget *hint = gtk_label_new(
        "아래 내용을 복사해 분석하거나 버그 리포트에 첨부할 수 있습니다.");
    gtk_label_set_xalign(GTK_LABEL(hint), 0.0f);
    gtk_widget_add_css_class(hint, "dim-label");
    gtk_box_append(GTK_BOX(vbox), hint);

    GtkWidget *scroll = gtk_scrolled_window_new();
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_AUTOMATIC,
                                   GTK_POLICY_AUTOMATIC);
    gtk_widget_set_vexpand(scroll, TRUE);

    GtkWidget *tv = gtk_text_view_new();
    gtk_text_view_set_editable(GTK_TEXT_VIEW(tv), FALSE);
    gtk_text_view_set_cursor_visible(GTK_TEXT_VIEW(tv), TRUE);
    gtk_text_view_set_monospace(GTK_TEXT_VIEW(tv), TRUE);
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(tv), GTK_WRAP_WORD_CHAR);
    gtk_widget_add_css_class(tv, "error-details");
    gtk_widget_set_margin_start(tv, 6);
    gtk_widget_set_margin_end(tv, 6);
    gtk_widget_set_margin_top(tv, 6);
    gtk_widget_set_margin_bottom(tv, 6);
    gtk_text_buffer_set_text(gtk_text_view_get_buffer(GTK_TEXT_VIEW(tv)),
                             report ? report : "", -1);
    gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(scroll), tv);
    gtk_box_append(GTK_BOX(vbox), scroll);

    GtkWidget *btn_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_halign(btn_row, GTK_ALIGN_END);

    GtkWidget *copy_btn = gtk_button_new_with_label("전체 복사");
    g_signal_connect(copy_btn, "clicked", G_CALLBACK(on_copy_clicked), tv);
    gtk_box_append(GTK_BOX(btn_row), copy_btn);

    GtkWidget *close_btn = gtk_button_new_with_label("닫기");
    gtk_widget_add_css_class(close_btn, "suggested-action");
    g_signal_connect(close_btn, "clicked", G_CALLBACK(on_close_clicked), win);
    gtk_box_append(GTK_BOX(btn_row), close_btn);
    gtk_box_append(GTK_BOX(vbox), btn_row);

    gtk_window_present(GTK_WINDOW(win));
}

void error_dialog_show(GtkWindow *parent,
                       const char *title,
                       const char *summary,
                       const char *details)
{
    gchar *report = build_report(NULL, 0, summary, details);
    present_dialog(parent, title, report);
    g_free(report);
}

void error_dialog_show_gerror(GtkWindow *parent,
                              const char *title,
                              const GError *err)
{
    if (!err) {
        error_dialog_show(parent, title, "알 수 없는 오류", NULL);
        return;
    }

    gchar *details = g_strdup_printf(
        "GError 도메인: %s\n"
        "GError 코드: %d\n"
        "GError 메시지: %s",
        g_quark_to_string(err->domain),
        err->code,
        err->message ? err->message : "(없음)");

    error_dialog_show(parent, title, err->message, details);
    g_free(details);
}

void error_dialog_show_log(GtkWindow *parent,
                           const char *domain,
                           GLogLevelFlags level,
                           const char *message)
{
    const char *title = level_title(level);
    gchar *report = build_report(domain, level, message, NULL);
    present_dialog(parent, title, report);
    g_free(report);
}
