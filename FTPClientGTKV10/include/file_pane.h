#ifndef FILE_PANE_H
#define FILE_PANE_H

#include "ftp_types.h"
#include <gtk/gtk.h>

typedef enum {
    FILE_PANE_LOCAL,
    FILE_PANE_SERVER
} FilePaneKind;

typedef struct _FilePane FilePane;

#define FILE_PANE_TYPE (file_pane_get_type())
G_DECLARE_FINAL_TYPE(FilePane, file_pane, FILE, PANE, GtkBox)

FilePane *file_pane_new_local(void);
FilePane *file_pane_new_server(void);

GtkWidget *file_pane_get_widget(FilePane *pane);
GtkWidget *file_pane_get_tree_view(FilePane *pane);
GtkWidget *file_pane_get_label(FilePane *pane);
GtkWidget *file_pane_get_refresh_button(FilePane *pane);

void file_pane_set_icons(FilePane *pane,
                         GdkPixbuf *folder,
                         GdkPixbuf *file_icon,
                         GdkPixbuf *parent_icon);

void file_pane_set_path_label(FilePane *pane, const gchar *path_text);
void file_pane_clear(FilePane *pane);
void file_pane_populate_listing(FilePane *pane,
                                GPtrArray *entries,
                                const gchar *cwd,
                                const gchar *parent_path);
void file_pane_populate_flat(FilePane *pane, GPtrArray *entries, const gchar *parent_path);

void file_pane_init_local_home(FilePane *pane, const gchar *home_dir);
void file_pane_show_local_directory(FilePane *pane, const gchar *dir_path);
const gchar *file_pane_get_local_home(FilePane *pane);
const gchar *file_pane_get_local_directory(FilePane *pane);
const gchar *file_pane_get_current_path(FilePane *pane);

/* Single-selection helper (returns first selected item) */
gboolean file_pane_get_selected(FilePane *pane,
                                gchar *path_out,
                                gsize path_size,
                                gboolean *is_dir_out,
                                gboolean *is_parent_out);

/* Multi-selection: returns a GPtrArray of heap-allocated FtpDirEntry copies
   (never NULL; may be empty). Caller must g_ptr_array_unref() the result. */
GPtrArray *file_pane_get_selected_entries(FilePane *pane);

/* Lookup row data for row-activated (path is the GtkTreePath from the signal). */
gboolean file_pane_entry_at_path(FilePane *pane,
                                 GtkTreePath *tree_path,
                                 gchar *path_out,
                                 gsize path_size,
                                 gboolean *is_dir_out,
                                 gboolean *is_parent_out);

void file_pane_refresh_local_directory(FilePane *pane);
gboolean file_pane_is_local_loading(FilePane *pane);

#endif /* FILE_PANE_H */
