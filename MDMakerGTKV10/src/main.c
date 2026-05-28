#include <gtk/gtk.h>
#include "main_window.h"

static void on_activate(GtkApplication *app, gpointer user_data)
{
    (void)user_data;
    GtkWidget *win = main_window_new(app);
    gtk_window_present(GTK_WINDOW(win));
}

int main(int argc, char *argv[])
{
    GtkApplication *app = gtk_application_new(
        "com.github.mdmaker.gtk", G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(app, "activate", G_CALLBACK(on_activate), NULL);
    int status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
