#include <gtk/gtk.h>
#include <gcrypt.h>
#include "main_window.h"

static void on_activate(GApplication *app, gpointer ud) {
    (void)ud;
    GtkWidget *win = vnc_main_window_new(GTK_APPLICATION(app));
    gtk_widget_show_all(win);
}

int main(int argc, char *argv[]) {
    /* Initialise libgcrypt before any threads are created */
    if (!gcry_check_version(GCRYPT_VERSION)) {
        g_error("libgcrypt version mismatch");
        return 1;
    }
    gcry_control(GCRYCTL_DISABLE_SECMEM, 0);
    gcry_control(GCRYCTL_INITIALIZATION_FINISHED, 0);

    GtkApplication *app = gtk_application_new(
        "com.example.vnc-gtk-client",
        G_APPLICATION_DEFAULT_FLAGS);

    g_signal_connect(app, "activate", G_CALLBACK(on_activate), NULL);
    int status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
