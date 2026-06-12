#include <gtk/gtk.h>
#include <gio/gio.h>
#include "alarm_notification.h"

/* ── Sound playback ──────────────────────────────────────────────────────── */

static void play_alarm_once(void)
{
    /* Common freedesktop alarm sound locations */
    static const char *sound_files[] = {
        "/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga",
        "/usr/share/sounds/gnome/default/alerts/glass.ogg",
        "/usr/share/sounds/ubuntu/stereo/bell.ogg",
        "/usr/share/sounds/alsa/Front_Center.wav",
        NULL
    };

    for (int i = 0; sound_files[i]; i++) {
        if (g_file_test(sound_files[i], G_FILE_TEST_EXISTS)) {
            gchar *cmd = g_strdup_printf(
                "paplay '%s' 2>/dev/null || aplay '%s' 2>/dev/null &",
                sound_files[i], sound_files[i]);
            g_spawn_command_line_async(cmd, NULL);
            g_free(cmd);
            return;
        }
    }
    /* Last resort: terminal bell */
    g_spawn_command_line_async("sh -c 'echo -e \\\\a'", NULL);
}

static gboolean sound_repeat_cb(gpointer data)
{
    gboolean *active = (gboolean *)data;
    if (!*active) return G_SOURCE_REMOVE;
    play_alarm_once();
    return G_SOURCE_CONTINUE;   /* repeat every 4 seconds */
}

/* ── System notification ─────────────────────────────────────────────────── */

static void send_system_notification(const char *title, const char *body)
{
    gchar *safe_title = g_shell_quote(title ? title : "알람");
    gchar *safe_body  = g_shell_quote(body  ? body  : "");
    gchar *cmd = g_strdup_printf(
        "notify-send -u critical -i appointment-soon %s %s 2>/dev/null",
        safe_title, safe_body);
    g_spawn_command_line_async(cmd, NULL);
    g_free(cmd);
    g_free(safe_title);
    g_free(safe_body);
}

/* ── Dismiss callback ────────────────────────────────────────────────────── */

typedef struct {
    GtkWidget *win;
    gboolean  *sound_active;
} DismissData;

static void on_dismiss(GtkButton *btn, gpointer data)
{
    (void)btn;
    DismissData *dd = (DismissData *)data;
    *dd->sound_active = FALSE;
    gtk_window_destroy(GTK_WINDOW(dd->win));
}

static void on_win_destroy(GtkWidget *win, gpointer data)
{
    (void)win;
    gboolean *active = (gboolean *)data;
    *active = FALSE;
}

/* ── Public API ──────────────────────────────────────────────────────────── */

void alarm_notification_show(GtkWindow *parent,
                             const char *time_str,
                             const char *label,
                             const char *header_str)
{
    /* System notification immediately */
    gchar *notif_body = g_strdup_printf("%s  %s", time_str ? time_str : "", label ? label : "");
    send_system_notification(header_str ? header_str : "알람", notif_body);
    g_free(notif_body);

    /* Start sound */
    play_alarm_once();

    /* Heap-allocated flag shared between the timer and the dismiss button */
    gboolean *sound_active = g_new(gboolean, 1);
    *sound_active = TRUE;

    /* Repeat sound every 4 seconds until dismissed */
    g_timeout_add_seconds(4, sound_repeat_cb, sound_active);

    /* Notification window */
    GtkWidget *win = gtk_window_new();
    gtk_window_set_title(GTK_WINDOW(win), header_str ? header_str : "알람");
    gtk_window_set_modal(GTK_WINDOW(win), FALSE);
    if (parent) gtk_window_set_transient_for(GTK_WINDOW(win), parent);
    gtk_window_set_default_size(GTK_WINDOW(win), 300, -1);
    gtk_window_set_resizable(GTK_WINDOW(win), FALSE);
    /* Note: gtk_window_set_keep_above was removed in GTK4 */

    /* Stop sound when window is destroyed (e.g. WM close button) */
    g_signal_connect(win, "destroy", G_CALLBACK(on_win_destroy), sound_active);

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
    DismissData *dd = g_new(DismissData, 1);
    dd->win          = win;
    dd->sound_active = sound_active;
    /* Free dd when the window is destroyed */
    g_object_set_data_full(G_OBJECT(win), "dismiss-data", dd, g_free);

    GtkWidget *dismiss = gtk_button_new_with_label("알람 끄기");
    gtk_widget_add_css_class(dismiss, "suggested-action");
    gtk_widget_set_halign(dismiss, GTK_ALIGN_CENTER);
    g_signal_connect(dismiss, "clicked", G_CALLBACK(on_dismiss), dd);
    gtk_box_append(GTK_BOX(box), dismiss);

    gtk_window_present(GTK_WINDOW(win));
}
