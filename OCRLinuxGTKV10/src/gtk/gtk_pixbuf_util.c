#include "gtk/gtk_pixbuf_util.h"

GdkPixbuf *gtk_pixbuf_from_pix(PIX *pix) {
    if (!pix) return NULL;

    l_uint8 *data = NULL;
    size_t size = 0;
    if (pixWriteMemPng(&data, &size, pix, 0.0f) != 0 || !data)
        return NULL;

    GBytes *bytes = g_bytes_new_take(data, size);
    GdkPixbufLoader *loader = gdk_pixbuf_loader_new();
    if (!gdk_pixbuf_loader_write_bytes(loader, bytes, NULL)) {
        g_bytes_unref(bytes);
        g_object_unref(loader);
        return NULL;
    }
    gdk_pixbuf_loader_close(loader, NULL);
    GdkPixbuf *pb = gdk_pixbuf_loader_get_pixbuf(loader);
    if (pb) g_object_ref(pb);
    g_object_unref(loader);
    g_bytes_unref(bytes);
    return pb;
}
