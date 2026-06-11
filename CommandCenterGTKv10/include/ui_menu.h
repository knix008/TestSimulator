#ifndef UI_MENU_H
#define UI_MENU_H

#include <gtk/gtk.h>

GtkWidget *ui_menu_load_icon(const char *icon_name, const char *fallback);
void       ui_menu_item_set_icon(GtkMenuItem *item,
                                 const char *icon_name, const char *fallback);
GtkWidget *ui_menu_item_new(const char *label,
                            const char *icon_name, const char *fallback);
GtkWidget *ui_menu_item_new_mnemonic(const char *label,
                                     const char *icon_name, const char *fallback);
GtkWidget *ui_check_menu_item_new(const char *label,
                                  const char *icon_name, const char *fallback);

#endif /* UI_MENU_H */
