#ifndef FILE_PANEL_H
#define FILE_PANEL_H

#include <gtk/gtk.h>

typedef enum { FILE_PANEL_LEFT, FILE_PANEL_RIGHT } FilePanelSide;

typedef void (*FilePanelVoidFn)(GtkWidget *panel, gpointer user_data);
typedef void (*FilePanelPathFn)(GtkWidget *panel, const char *path, gpointer user_data);
typedef void (*FilePanelPathsFn)(GtkWidget *panel, GPtrArray *paths, gpointer user_data);

GtkWidget *file_panel_new(FilePanelSide side, gpointer main_window);
void file_panel_set_initial_path(GtkWidget *panel, const char *path);
void file_panel_load_contents(GtkWidget *panel);
const char *file_panel_get_current_path(GtkWidget *panel);
void file_panel_navigate(GtkWidget *panel, const char *path);
void file_panel_refresh(GtkWidget *panel);
GPtrArray *file_panel_get_selected_paths(GtkWidget *panel);
void file_panel_set_status(GtkWidget *panel, const char *message);

void file_panel_request_new_folder(GtkWidget *panel);
void file_panel_request_new_file(GtkWidget *panel);
void file_panel_request_delete(GtkWidget *panel);
void file_panel_begin_rename(GtkWidget *panel);
void file_panel_select_all(GtkWidget *panel);
void file_panel_clipboard_copy(GtkWidget *panel);
void file_panel_clipboard_paste(GtkWidget *panel);

void file_panel_connect_focus(GtkWidget *panel, FilePanelVoidFn cb, gpointer data);
void file_panel_connect_path_changed(GtkWidget *panel, FilePanelPathFn cb, gpointer data);
void file_panel_connect_selection_changed(GtkWidget *panel, FilePanelPathsFn cb, gpointer data);
void file_panel_connect_copy_to_other(GtkWidget *panel, FilePanelVoidFn cb, gpointer data);
void file_panel_connect_move_to_other(GtkWidget *panel, FilePanelVoidFn cb, gpointer data);

#endif
