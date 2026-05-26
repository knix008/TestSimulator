#include <gtk/gtk.h>
#include "main_window.h"
#include "score_verovio.h"

int main(int argc, char **argv)
{
    gtk_init(&argc, &argv);
    score_verovio_warmup_display();
    GtkWidget *win = main_window_create();
    gtk_widget_show_all(win);
    main_window_prepare_score_display();
    gtk_main();
    return 0;
}
