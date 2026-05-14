#include <gtk/gtk.h>
#include <gst/gst.h>

#include "app.h"
#include "ui.h"

int main(int argc, char **argv)
{
    gtk_init(&argc, &argv);
    gst_init(&argc, &argv);

    App       *app    = app_new();
    GtkWidget *window = ui_build(app);

    gtk_widget_show_all(window);
    gtk_main();

    app_free(app);
    return 0;
}
