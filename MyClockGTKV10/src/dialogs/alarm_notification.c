#include <gtk/gtk.h>
#include "alarm_notification.h"

static void on_dismiss(GtkButton *btn, gpointer data)
{
    (void)btn;
    gtk_window_destroy(GTK_WINDOW(data));
}

/* Auto-dismiss after 60 seconds */
static gboolean auto_dismiss(gpointer data)
{
    GtkWidget *win = (GtkWidget *)data;
    if (GTK_IS_WINDOW(win)) gtk_window_destroy(GTK_WINDOW(win));
    return G_SOURCE_REMOVE;
}

void alarm_notification_show(GtkWindow *parent,
                             const char *time_str,
                             const char *label,
                             const char *header_str)
{
    GtkWidget *win = gtk_window_new();
    gtk_window_set_title(GTK_WINDOW(win),
                         header_str ? header_str : "알람");
    gtk_window_set_modal(GTK_WINDOW(win), FALSE);
    if (parent) gtk_window_set_transient_for(GTK_WINDOW(win), parent);
    gtk_window_set_default_size(GTK_WINDOW(win), 280, -1);
    gtk_window_set_resizable(GTK_WINDOW(win), FALSE);
    gtk_window_set_keep_above(GTK_WINDOW(win), TRUE);

    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 16);
    gtk_widget_set_margin_start(box, 24);
    gtk_widget_set_margin_end(box, 24);
    gtk_widget_set_margin_top(box, 20);
    gtk_widget_set_margin_bottom(box, 16);
    gtk_window_set_child(GTK_WINDOW(win), box);

    /* Bell icon */
    GtkWidget *icon = gtk_image_new_from_icon_name("alarm-symbolic");
    gtk_image_set_pixel_size(GTK_IMAGE(icon), 48);
    gtk_widget_set_halign(icon, GTK_ALIGN_CENTER);
    gtk_box_append(GTK_BOX(box), icon);

    /* Header */
    if (header_str && header_str[0]) {
        GtkWidget *hdr = gtk_label_new(header_str);
        gtk_widget_add_css_class(hdr, "title-2");
        gtk_widget_set_halign(hdr, GTK_ALIGN_CENTER);
        gtk_box_append(GTK_BOX(box), hdr);
    }

    /* Time */
    if (time_str && time_str[0]) {
        GtkWidget *tlbl = gtk_label_new(time_str);
        gtk_widget_add_css_class(tlbl, "title-1");
        gtk_widget_set_halign(tlbl, GTK_ALIGN_CENTER);
        gtk_box_append(GTK_BOX(box), tlbl);
    }

    /* User label */
    if (label && label[0]) {
        GtkWidget *llbl = gtk_label_new(label);
        gtk_widget_set_halign(llbl, GTK_ALIGN_CENTER);
        gtk_box_append(GTK_BOX(box), llbl);
    }

    /* Dismiss button */
    GtkWidget *dismiss = gtk_button_new_with_label("확인");
    gtk_widget_add_css_class(dismiss, "suggested-action");
    gtk_widget_set_halign(dismiss, GTK_ALIGN_CENTER);
    g_signal_connect(dismiss, "clicked", G_CALLBACK(on_dismiss), win);
    gtk_box_append(GTK_BOX(box), dismiss);

    /* Auto-dismiss after 60 s */
    g_timeout_add_seconds(60, auto_dismiss, win);

    gtk_window_present(GTK_WINDOW(win));
}
