#include "main_window.h"

#include <gtk/gtk.h>

static void on_activate(GtkApplication *app, gpointer user_data) {
    (void)user_data;
    GtkWidget *window = main_window_new(app);
    gtk_widget_show_all(window);
}

int main(int argc, char **argv) {
    GtkApplication *app = gtk_application_new("com.testsimulator.imagemaker", 0);
    g_signal_connect(app, "activate", G_CALLBACK(on_activate), NULL);

    int status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
