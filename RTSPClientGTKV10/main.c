#include <gtk/gtk.h>
#include <gst/gst.h>

#include "app_ui.h"
#include "media_core.h"

int main(int argc, char **argv) {
    gst_init(&argc, &argv);
    gtk_init(&argc, &argv);

    MediaCore media;
    gchar *err = NULL;
    if (!media_core_init(&media, NULL, NULL, &err)) {
        g_printerr("%s\n", err ? err : "media core init failed");
        g_free(err);
        return 1;
    }

    GstBus *bus = gst_element_get_bus(media.playbin);
    gst_bus_add_watch(bus, media_core_bus_watch, &media);
    gst_object_unref(bus);

    AppUi *ui = app_ui_create(&media);
    app_ui_run(ui);
    app_ui_destroy(ui);

    media_core_cleanup(&media);
    return 0;
}
