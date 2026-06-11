#include "ui_menu.h"

GtkWidget *ui_menu_load_icon(const char *icon_name, const char *fallback) {
    GtkIconTheme *theme = gtk_icon_theme_get_default();
    GtkWidget *image = gtk_image_new();
    GdkPixbuf *pixbuf = gtk_icon_theme_load_icon(
        theme, icon_name, GTK_ICON_SIZE_MENU,
        GTK_ICON_LOOKUP_USE_BUILTIN, NULL);
    if (!pixbuf && fallback)
        pixbuf = gtk_icon_theme_load_icon(
            theme, fallback, GTK_ICON_SIZE_MENU,
            GTK_ICON_LOOKUP_USE_BUILTIN, NULL);
    if (pixbuf) {
        gtk_image_set_from_pixbuf(GTK_IMAGE(image), pixbuf);
        g_object_unref(pixbuf);
    }
    return image;
}

static GtkWidget *menu_item_with_icon_box(GtkWidget *item,
                                          GtkWidget *label,
                                          const char *icon_name,
                                          const char *fallback) {
    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    GtkWidget *icon = ui_menu_load_icon(icon_name, fallback);
    gtk_label_set_xalign(GTK_LABEL(label), 0.0);
    gtk_box_pack_start(GTK_BOX(box), icon, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(box), label, FALSE, FALSE, 0);
    gtk_container_add(GTK_CONTAINER(item), box);
    gtk_widget_show_all(box);
    return item;
}

void ui_menu_item_set_icon(GtkMenuItem *item,
                           const char *icon_name, const char *fallback) {
    GtkWidget *child = gtk_bin_get_child(GTK_BIN(item));
    if (child && GTK_IS_BOX(child)) {
        GtkWidget *icon = ui_menu_load_icon(icon_name, fallback);
        gtk_box_pack_start(GTK_BOX(child), icon, FALSE, FALSE, 0);
        gtk_box_reorder_child(GTK_BOX(child), icon, 0);
        gtk_widget_show(icon);
    }
}

GtkWidget *ui_menu_item_new(const char *label,
                            const char *icon_name, const char *fallback) {
    GtkWidget *item = gtk_menu_item_new();
    GtkWidget *lbl = gtk_label_new(label);
    return menu_item_with_icon_box(item, lbl, icon_name, fallback);
}

GtkWidget *ui_menu_item_new_mnemonic(const char *label,
                                     const char *icon_name, const char *fallback) {
    GtkWidget *item = gtk_menu_item_new();
    GtkWidget *lbl = gtk_label_new_with_mnemonic(label);
    return menu_item_with_icon_box(item, lbl, icon_name, fallback);
}

GtkWidget *ui_check_menu_item_new(const char *label,
                                  const char *icon_name, const char *fallback) {
    GtkWidget *item = gtk_check_menu_item_new();
    GtkWidget *lbl = gtk_label_new(label);
    return menu_item_with_icon_box(item, lbl, icon_name, fallback);
}
