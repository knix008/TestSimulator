#include "main_window.h"

#include <gtk/gtk.h>

static void on_activate(GtkApplication *app, gpointer user_data) {
    (void)user_data;
    MainWindow *win = main_window_new(app);
    (void)win;
}

int main(int argc, char *argv[]) {
    g_set_prgname("commandcenter");
    gdk_set_program_class("commandcenter");

    GtkApplication *app = gtk_application_new(
        "com.testsimulator.CommandCenterGTKv10",
        G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(app, "activate", G_CALLBACK(on_activate), NULL);
    int status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
