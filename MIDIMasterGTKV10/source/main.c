#include <gtk/gtk.h>
#include "gtk/main_window.h"

int main(int argc, char **argv)
{
    gtk_init(&argc, &argv);
    GtkWidget *win = main_window_create();
    gtk_widget_show_all(win);
    main_window_prepare_score_display();
    gtk_main();
    return 0;
}
