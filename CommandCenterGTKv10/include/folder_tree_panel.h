#ifndef FOLDER_TREE_PANEL_H
#define FOLDER_TREE_PANEL_H

#include <gtk/gtk.h>

typedef void (*FolderTreeSelectFn)(const char *path, gpointer user_data);

GtkWidget *folder_tree_panel_new(FolderTreeSelectFn callback, gpointer user_data);
void folder_tree_panel_toggle(GtkWidget *panel, const char *current_path);
void folder_tree_panel_collapse(GtkWidget *panel);
gboolean folder_tree_panel_is_open(GtkWidget *panel);

#endif
