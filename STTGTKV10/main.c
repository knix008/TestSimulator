#include <gtk/gtk.h>
#include "app_ui.h"

int main(int argc, char *argv[]) {
    gtk_init(&argc, &argv);

    AppWindow *win = app_window_new();
    gtk_widget_show_all(app_window_widget(win));

    gtk_main();
    return 0;
}
