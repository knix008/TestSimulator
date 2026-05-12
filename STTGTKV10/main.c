#include <gtk/gtk.h>
#include <gst/gst.h>
#include "app_ui.h"

int main(int argc, char *argv[]) {
    gst_init(&argc, &argv);
    gtk_init(&argc, &argv);

    AppWindow *win = app_window_new();
    gtk_widget_show_all(app_window_widget(win));

    gtk_main();
    app_window_free(win);
    return 0;
}
