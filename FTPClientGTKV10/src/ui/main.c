#include "main_window.h"

static void set_app_icons(void) {
    static const struct { const gchar *path; } icons[] = {
        { "/com/testsimulator/ftpclient/icon_16.png"  },
        { "/com/testsimulator/ftpclient/icon_32.png"  },
        { "/com/testsimulator/ftpclient/icon_48.png"  },
        { "/com/testsimulator/ftpclient/icon_256.png" },
    };

    GList *list = NULL;
    for (gsize i = 0; i < G_N_ELEMENTS(icons); i++) {
        GdkPixbuf *pb = gdk_pixbuf_new_from_resource(icons[i].path, NULL);
        if (pb) list = g_list_append(list, pb);
    }
    if (list) {
        gtk_window_set_default_icon_list(list);
        g_list_free_full(list, g_object_unref);
    }
}

static void activate(GtkApplication *app, gpointer user_data) {
    (void)user_data;
    FtpMainWindow *win = ftp_main_window_new(app);
    gtk_widget_show_all(GTK_WIDGET(win));
}

int main(int argc, char *argv[]) {
    GtkApplication *app = gtk_application_new(
        "com.testsimulator.ftpclient",
        G_APPLICATION_FLAGS_NONE);
    set_app_icons();
    g_signal_connect(app, "activate", G_CALLBACK(activate), NULL);
    int status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
