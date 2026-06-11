#include "file_panel.h"

#include "main_window.h"
#include "file_entry.h"
#include "file_ops.h"
#include "file_ops_conflict.h"
#include "progress_dialog.h"
#include "folder_tree_panel.h"
#include "input_dialog.h"
#include "archive_ops.h"
#include "compress_dialog.h"
#include "ui_menu.h"

#include <dirent.h>
#include <errno.h>
#include <gio/gio.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

#define DIR_REFRESH_DEBOUNCE_MS 250

#define COL_NAME 0
#define COL_PERM 1
#define COL_DATE 2
#define COL_TYPE 3
#define COL_SIZE 4
#define COL_ENTRY 5
#define N_COLS 5

typedef struct {
    FilePanelSide side;
    gpointer main_window;
    char *current_path;
    char *side_title;

    GtkWidget *container;
    GtkWidget *path_bar;
    GtkWidget *side_label;
    GtkWidget *breadcrumb_scroll;
    GtkWidget *breadcrumb_box;
    GtkWidget *folder_tree;
    GtkWidget *tree_view;
    GtkListStore *store;
    GtkWidget *status_label;
    GtkWidget *context_menu;
    GtkWidget *ctx_open;
    GtkWidget *ctx_copy_other;
    GtkWidget *ctx_move_other;
    GtkWidget *ctx_clip_copy;
    GtkWidget *ctx_rename;
    GtkWidget *ctx_trash;
    GtkWidget *ctx_delete;
    GtkWidget *ctx_compress;
    GtkWidget *ctx_extract;
    GtkWidget *ctx_properties;

    FilePanelVoidFn on_focus;
    FilePanelPathFn on_path_changed;
    FilePanelPathsFn on_selection_changed;
    FilePanelVoidFn on_copy_to_other;
    FilePanelVoidFn on_move_to_other;
    gpointer callback_data;

    int sort_column;
    GtkSortType sort_order;
    int last_fit_width;
    gboolean fitting_columns;

    GFileMonitor *dir_monitor;
    guint refresh_timeout_id;
    gboolean watch_suspended;
} FilePanelData;

static FilePanelData *panel_data(GtkWidget *panel);
static GPtrArray *get_selected_paths(FilePanelData *pd);
static void show_error(GtkWidget *panel, const char *msg);
static void open_file(GtkWidget *panel, const char *path);
static void load_directory(FilePanelData *pd);
static void notify_selection(FilePanelData *pd);
static void file_panel_ensure_border_style(void);

static FilePanelData *panel_data(GtkWidget *panel) {
    return g_object_get_data(G_OBJECT(panel), "file-panel-data");
}

static void suspend_all_watches(FilePanelData *pd) {
    if (pd && pd->main_window)
        main_window_suspend_panel_watches(pd->main_window);
}

static void resume_all_watches(FilePanelData *pd) {
    if (pd && pd->main_window)
        main_window_resume_panel_watches(pd->main_window);
}

static GtkWindow *panel_window(GtkWidget *panel) {
    GtkWidget *top = gtk_widget_get_toplevel(panel);
    return GTK_IS_WINDOW(top) ? GTK_WINDOW(top) : NULL;
}

static void store_set_entry(GtkListStore *store, GtkTreeIter *iter, FileEntry *entry) {
    gtk_list_store_set(store, iter, COL_ENTRY, entry, -1);
}

static gboolean selection_get_first_iter(GtkTreeSelection *sel, GtkTreeModel **model,
                                         GtkTreeIter *iter) {
    GtkTreeModel *m = NULL;
    GList *rows = gtk_tree_selection_get_selected_rows(sel, &m);
    if (!rows)
        return FALSE;
    gboolean ok = gtk_tree_model_get_iter(m, iter, (GtkTreePath *)rows->data);
    if (model)
        *model = m;
    g_list_free_full(rows, (GDestroyNotify)gtk_tree_path_free);
    return ok;
}

static FileEntry *store_get_entry(GtkTreeModel *model, GtkTreeIter *iter) {
    gpointer entry = NULL;
    gtk_tree_model_get(model, iter, COL_ENTRY, &entry, -1);
    return (FileEntry *)entry;
}

static void activate_entry_at_iter(GtkWidget *panel, FilePanelData *pd,
                                   GtkTreeModel *model, GtkTreeIter *iter) {
    FileEntry *entry = store_get_entry(model, iter);
    if (entry) {
        if (entry->is_directory)
            file_panel_navigate(panel, entry->full_path);
        else
            open_file(panel, entry->full_path);
        return;
    }

    gchar *name = NULL;
    gtk_tree_model_get(model, iter, COL_NAME, &name, -1);
    if (!name) return;
    if (strcmp(name, "..") == 0) {
        char *parent = g_path_get_dirname(pd->current_path);
        if (strcmp(parent, pd->current_path) != 0)
            file_panel_navigate(panel, parent);
        g_free(parent);
    } else {
        char *full = g_build_filename(pd->current_path, name, NULL);
        if (g_file_test(full, G_FILE_TEST_IS_DIR))
            file_panel_navigate(panel, full);
        else
            open_file(panel, full);
        g_free(full);
    }
    g_free(name);
}

static void activate_entry(GtkWidget *panel, FileEntry *entry) {
    if (!entry) return;
    if (entry->is_directory)
        file_panel_navigate(panel, entry->full_path);
    else
        open_file(panel, entry->full_path);
}

static void update_context_menu(FilePanelData *pd) {
    GPtrArray *paths = get_selected_paths(pd);
    gboolean has_sel = paths->len > 0;
    gboolean single  = paths->len == 1;

    /* "압축 해제": single selection that is an archive or split part */
    gboolean can_extract = FALSE;
    if (single) {
        const char *p = g_ptr_array_index(paths, 0);
        can_extract = archive_is_archive(p) || archive_split_detect(p, NULL);
    }

    gtk_widget_set_sensitive(pd->ctx_open, has_sel);
    gtk_widget_set_sensitive(pd->ctx_copy_other, has_sel);
    gtk_widget_set_sensitive(pd->ctx_move_other, has_sel);
    gtk_widget_set_sensitive(pd->ctx_clip_copy, has_sel);
    gtk_widget_set_sensitive(pd->ctx_rename, single);
    gtk_widget_set_sensitive(pd->ctx_trash, has_sel);
    gtk_widget_set_sensitive(pd->ctx_delete, has_sel);
    gtk_widget_set_sensitive(pd->ctx_compress, has_sel);
    gtk_widget_set_sensitive(pd->ctx_extract, can_extract);
    gtk_widget_set_sensitive(pd->ctx_properties, single);
    g_ptr_array_free(paths, TRUE);
}

static char *format_permissions(mode_t mode) {
    char *perm = g_malloc(10);
    perm[0] = (mode & S_IRUSR) ? 'r' : '-';
    perm[1] = (mode & S_IWUSR) ? 'w' : '-';
    perm[2] = (mode & S_IXUSR) ? 'x' : '-';
    perm[3] = (mode & S_IRGRP) ? 'r' : '-';
    perm[4] = (mode & S_IWGRP) ? 'w' : '-';
    perm[5] = (mode & S_IXGRP) ? 'x' : '-';
    perm[6] = (mode & S_IROTH) ? 'r' : '-';
    perm[7] = (mode & S_IWOTH) ? 'w' : '-';
    perm[8] = (mode & S_IXOTH) ? 'x' : '-';
    perm[9] = '\0';
    return perm;
}

static void set_status(FilePanelData *pd, const char *msg) {
    gtk_label_set_text(GTK_LABEL(pd->status_label), msg);
}

static int sort_compare(GtkTreeModel *model, GtkTreeIter *a, GtkTreeIter *b, gpointer data) {
    FilePanelData *pd = data;
    gchar *na = NULL, *nb = NULL;
    gtk_tree_model_get(model, a, COL_NAME, &na, -1);
    gtk_tree_model_get(model, b, COL_NAME, &nb, -1);

    /* ".." is always first; invert for GTK_SORT_DESCENDING (GtkListStore negates). */
    if (na && strcmp(na, "..") == 0) {
        g_free(na); g_free(nb);
        return pd->sort_order == GTK_SORT_ASCENDING ? -1 : 1;
    }
    if (nb && strcmp(nb, "..") == 0) {
        g_free(na); g_free(nb);
        return pd->sort_order == GTK_SORT_ASCENDING ? 1 : -1;
    }

    FileEntry *ea = store_get_entry(model, a);
    FileEntry *eb = store_get_entry(model, b);
    if (ea && ea->is_directory && eb && !eb->is_directory) { g_free(na); g_free(nb); return -1; }
    if (ea && !ea->is_directory && eb && eb->is_directory) { g_free(na); g_free(nb); return 1; }

    int cmp = 0;
    if (pd->sort_column == COL_SIZE) {
        int64_t sa = (ea && !ea->is_directory) ? ea->size : -1;
        int64_t sb = (eb && !eb->is_directory) ? eb->size : -1;
        if (sa < sb) cmp = -1;
        else if (sa > sb) cmp = 1;
    } else if (pd->sort_column == COL_DATE) {
        time_t ta = ea ? ea->last_modified : 0;
        time_t tb = eb ? eb->last_modified : 0;
        if (ta < tb) cmp = -1;
        else if (ta > tb) cmp = 1;
    } else {
        gchar *va = NULL, *vb = NULL;
        gtk_tree_model_get(model, a, pd->sort_column, &va, -1);
        gtk_tree_model_get(model, b, pd->sort_column, &vb, -1);
        cmp = g_ascii_strcasecmp(va ? va : "", vb ? vb : "");
        g_free(va);
        g_free(vb);
    }

    if (cmp == 0)
        cmp = g_ascii_strcasecmp(na ? na : "", nb ? nb : "");
    g_free(na);
    g_free(nb);
    return cmp;
}

static void update_sort_indicators(FilePanelData *pd) {
    GList *cols = gtk_tree_view_get_columns(GTK_TREE_VIEW(pd->tree_view));
    int index = 0;
    for (GList *l = cols; l; l = l->next, index++) {
        GtkTreeViewColumn *col = GTK_TREE_VIEW_COLUMN(l->data);
        if (index == pd->sort_column) {
            gtk_tree_view_column_set_sort_indicator(col, TRUE);
            gtk_tree_view_column_set_sort_order(col, pd->sort_order);
        } else {
            gtk_tree_view_column_set_sort_indicator(col, FALSE);
        }
    }
    g_list_free(cols);
}

static void apply_current_sort(FilePanelData *pd) {
    gtk_tree_sortable_set_sort_func(GTK_TREE_SORTABLE(pd->store),
                                    pd->sort_column, sort_compare, pd, NULL);
    gtk_tree_sortable_set_sort_column_id(GTK_TREE_SORTABLE(pd->store),
                                         pd->sort_column, pd->sort_order);
    update_sort_indicators(pd);
}

static void stop_directory_monitor(FilePanelData *pd) {
    if (!pd)
        return;
    if (pd->refresh_timeout_id) {
        g_source_remove(pd->refresh_timeout_id);
        pd->refresh_timeout_id = 0;
    }
    if (pd->dir_monitor) {
        g_file_monitor_cancel(pd->dir_monitor);
        g_object_unref(pd->dir_monitor);
        pd->dir_monitor = NULL;
    }
}

static gboolean debounced_directory_refresh(gpointer data) {
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    if (!pd)
        return G_SOURCE_REMOVE;
    pd->refresh_timeout_id = 0;
    load_directory(pd);
    return G_SOURCE_REMOVE;
}

static void schedule_directory_refresh(FilePanelData *pd) {
    if (!pd || !pd->container || pd->watch_suspended)
        return;
    if (pd->refresh_timeout_id)
        g_source_remove(pd->refresh_timeout_id);
    pd->refresh_timeout_id =
        g_timeout_add(DIR_REFRESH_DEBOUNCE_MS, debounced_directory_refresh,
                      pd->container);
}

static void on_dir_monitor_event(GFileMonitor *monitor, GFile *file, GFile *other_file,
                                 GFileMonitorEvent event_type, gpointer user_data) {
    (void)monitor;
    (void)file;
    (void)other_file;
    FilePanelData *pd = user_data;

    switch (event_type) {
    case G_FILE_MONITOR_EVENT_CREATED:
    case G_FILE_MONITOR_EVENT_DELETED:
    case G_FILE_MONITOR_EVENT_CHANGED:
    case G_FILE_MONITOR_EVENT_CHANGES_DONE_HINT:
    case G_FILE_MONITOR_EVENT_MOVED_IN:
    case G_FILE_MONITOR_EVENT_MOVED_OUT:
    case G_FILE_MONITOR_EVENT_RENAMED:
        schedule_directory_refresh(pd);
        break;
    default:
        break;
    }
}

static void start_directory_monitor(FilePanelData *pd) {
    if (!pd || !pd->current_path)
        return;

    stop_directory_monitor(pd);

    GFile *dir = g_file_new_for_path(pd->current_path);
    GError *err = NULL;
    pd->dir_monitor = g_file_monitor_directory(
        dir, G_FILE_MONITOR_WATCH_MOVES, NULL, &err);
    g_object_unref(dir);

    if (!pd->dir_monitor) {
        g_clear_error(&err);
        return;
    }

    g_signal_connect(pd->dir_monitor, "changed",
                     G_CALLBACK(on_dir_monitor_event), pd);
}

static void restore_selection_paths(FilePanelData *pd, GPtrArray *paths) {
    if (!paths || paths->len == 0)
        return;

    GtkTreeSelection *sel =
        gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view));
    GtkTreeIter iter;
    gboolean valid =
        gtk_tree_model_get_iter_first(GTK_TREE_MODEL(pd->store), &iter);

    while (valid) {
        FileEntry *entry = store_get_entry(GTK_TREE_MODEL(pd->store), &iter);
        if (entry && strcmp(entry->name, "..") != 0) {
            for (guint i = 0; i < paths->len; i++) {
                if (strcmp(entry->full_path, g_ptr_array_index(paths, i)) == 0) {
                    GtkTreePath *path =
                        gtk_tree_model_get_path(GTK_TREE_MODEL(pd->store), &iter);
                    gtk_tree_selection_select_path(sel, path);
                    gtk_tree_path_free(path);
                    break;
                }
            }
        }
        valid = gtk_tree_model_iter_next(GTK_TREE_MODEL(pd->store), &iter);
    }
    notify_selection(pd);
}

static void update_status_counts(FilePanelData *pd) {
    int dir_count = 0, file_count = 0;
    int64_t total = 0;
    GtkTreeIter iter;
    gboolean valid = gtk_tree_model_get_iter_first(GTK_TREE_MODEL(pd->store), &iter);
    while (valid) {
        FileEntry *entry = NULL;
        entry = store_get_entry(GTK_TREE_MODEL(pd->store), &iter);
        if (entry && strcmp(entry->name, "..") != 0) {
            if (entry->is_directory) dir_count++;
            else { file_count++; total += entry->size; }
        }
        valid = gtk_tree_model_iter_next(GTK_TREE_MODEL(pd->store), &iter);
    }
    char *size_str = file_entry_format_size(total);
    char *msg = g_strdup_printf("폴더 %d개, 파일 %d개  |  합계 %s",
                                dir_count, file_count, size_str);
    set_status(pd, msg);
    g_free(size_str);
    g_free(msg);
}

static void load_directory(FilePanelData *pd) {
    GPtrArray *saved_selection = get_selected_paths(pd);

    gtk_list_store_clear(pd->store);

    char *parent = g_path_get_dirname(pd->current_path);
    if (strcmp(parent, pd->current_path) != 0) {
        FileEntry *up = g_new0(FileEntry, 1);
        up->name = g_strdup("..");
        up->full_path = g_strdup(parent);
        up->is_directory = TRUE;
        GtkTreeIter iter;
        gtk_list_store_append(pd->store, &iter);
        gtk_list_store_set(pd->store, &iter,
                           COL_NAME, "..", COL_PERM, "", COL_DATE, "",
                           COL_TYPE, "폴더", COL_SIZE, "", -1);
        store_set_entry(pd->store, &iter, up);
    }
    g_free(parent);

    GError *err = NULL;
    GDir *dir = g_dir_open(pd->current_path, 0, &err);
    if (!dir) {
        char *msg = g_strdup_printf("오류: %s", err ? err->message : "접근 불가");
        set_status(pd, msg);
        g_free(msg);
        g_clear_error(&err);
        return;
    }

    GPtrArray *dirs = g_ptr_array_new_with_free_func(g_free);
    GPtrArray *files = g_ptr_array_new_with_free_func(g_free);
    const gchar *name;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (name[0] == '.') continue;
        char *full = g_build_filename(pd->current_path, name, NULL);
        if (g_file_test(full, G_FILE_TEST_IS_DIR))
            g_ptr_array_add(dirs, full);
        else
            g_ptr_array_add(files, full);
    }
    g_dir_close(dir);
    g_ptr_array_sort(dirs, (GCompareFunc)g_strcmp0);
    g_ptr_array_sort(files, (GCompareFunc)g_strcmp0);

    for (guint i = 0; i < dirs->len; i++) {
        const char *full = g_ptr_array_index(dirs, i);
        const char *bname = g_path_get_basename(full);
        struct stat st;
        stat(full, &st);
        FileEntry *entry = g_new0(FileEntry, 1);
        entry->name = g_strdup(bname);
        entry->full_path = g_strdup(full);
        entry->is_directory = TRUE;
        entry->last_modified = st.st_mtime;
        struct tm *tm_info = localtime(&entry->last_modified);
        char date[32];
        strftime(date, sizeof(date), "%Y-%m-%d %H:%M", tm_info);
        char *perm = format_permissions(st.st_mode);
        GtkTreeIter iter;
        gtk_list_store_append(pd->store, &iter);
        gtk_list_store_set(pd->store, &iter,
                           COL_NAME, entry->name, COL_PERM, perm,
                           COL_DATE, date, COL_TYPE, "폴더", COL_SIZE, "<DIR>",
                           -1);
        store_set_entry(pd->store, &iter, entry);
        g_free(perm);
    }

    for (guint i = 0; i < files->len; i++) {
        const char *full = g_ptr_array_index(files, i);
        const char *bname = g_path_get_basename(full);
        struct stat st;
        stat(full, &st);
        FileEntry *entry = g_new0(FileEntry, 1);
        entry->name = g_strdup(bname);
        entry->full_path = g_strdup(full);
        entry->is_directory = FALSE;
        entry->size = st.st_size;
        entry->last_modified = st.st_mtime;
        const char *dot = strrchr(bname, '.');
        if (dot) entry->extension = g_strdup(dot);
        char *size_d = file_entry_size_display(entry);
        char *type_d = file_entry_type_display(entry);
        struct tm *tm_info = localtime(&entry->last_modified);
        char date[32];
        strftime(date, sizeof(date), "%Y-%m-%d %H:%M", tm_info);
        char *perm = format_permissions(st.st_mode);
        GtkTreeIter iter;
        gtk_list_store_append(pd->store, &iter);
        gtk_list_store_set(pd->store, &iter,
                           COL_NAME, entry->name, COL_PERM, perm,
                           COL_DATE, date, COL_TYPE, type_d, COL_SIZE, size_d,
                           -1);
        store_set_entry(pd->store, &iter, entry);
        g_free(size_d);
        g_free(type_d);
        g_free(perm);
    }

    g_ptr_array_free(dirs, TRUE);
    g_ptr_array_free(files, TRUE);
    apply_current_sort(pd);
    restore_selection_paths(pd, saved_selection);
    g_ptr_array_free(saved_selection, TRUE);
    update_status_counts(pd);
    pd->last_fit_width = -1;
}

static void file_panel_data_free(gpointer data) {
    FilePanelData *pd = data;
    stop_directory_monitor(pd);
    g_free(pd->current_path);
    g_free(pd->side_title);
    g_free(pd);
}

static void on_breadcrumb_clicked(GtkButton *btn, gpointer data) {
    const char *path = g_object_get_data(G_OBJECT(btn), "breadcrumb-path");
    GtkWidget *panel = GTK_WIDGET(data);
    FilePanelData *pd = panel_data(panel);
    if (!path || !pd)
        return;
    if (pd->on_focus)
        pd->on_focus(panel, pd->callback_data);
    file_panel_navigate(panel, path);
}

static void breadcrumb_clear(FilePanelData *pd) {
    GList *children = gtk_container_get_children(GTK_CONTAINER(pd->breadcrumb_box));
    for (GList *l = children; l; l = l->next)
        gtk_widget_destroy(GTK_WIDGET(l->data));
    g_list_free(children);
}

static void breadcrumb_add_sep(FilePanelData *pd) {
    GtkWidget *sep = gtk_label_new(G_DIR_SEPARATOR_S);
    gtk_widget_set_margin_start(sep, 1);
    gtk_widget_set_margin_end(sep, 1);
    gtk_box_pack_start(GTK_BOX(pd->breadcrumb_box), sep, FALSE, FALSE, 0);
}

static void breadcrumb_add(FilePanelData *pd, const char *label, const char *path) {
    GtkWidget *btn = gtk_button_new_with_label(label);
    gtk_button_set_relief(GTK_BUTTON(btn), GTK_RELIEF_NONE);
    gtk_style_context_add_class(gtk_widget_get_style_context(btn), "breadcrumb-btn");
    gtk_widget_set_focus_on_click(btn, FALSE);
    g_object_set_data_full(G_OBJECT(btn), "breadcrumb-path",
                           g_strdup(path), (GDestroyNotify)g_free);
    g_signal_connect(btn, "clicked", G_CALLBACK(on_breadcrumb_clicked), pd->container);
    gtk_box_pack_start(GTK_BOX(pd->breadcrumb_box), btn, FALSE, FALSE, 0);
}

static void breadcrumb_build(FilePanelData *pd) {
    const char *path = pd->current_path;
    if (!path || !*path)
        return;

    if (strcmp(path, G_DIR_SEPARATOR_S) == 0) {
        breadcrumb_add(pd, G_DIR_SEPARATOR_S, G_DIR_SEPARATOR_S);
        return;
    }

    const char *rest = path;
    char *prefix = NULL;
    gboolean first = TRUE;

    if (g_path_is_absolute(path)) {
        rest = path + 1;
        prefix = g_strdup(G_DIR_SEPARATOR_S);
    } else {
        prefix = g_strdup("");
    }

    while (rest && *rest) {
        const char *slash = strchr(rest, G_DIR_SEPARATOR);
        size_t len = slash ? (size_t)(slash - rest) : strlen(rest);
        if (len == 0) {
            rest = slash ? slash + 1 : rest + 1;
            continue;
        }

        char *comp = g_strndup(rest, len);
        char *full;
        if (prefix[0] == '\0')
            full = g_strdup(comp);
        else if (strcmp(prefix, G_DIR_SEPARATOR_S) == 0)
            full = g_strdup_printf("/%s", comp);
        else
            full = g_build_filename(prefix, comp, NULL);

        if (!first)
            breadcrumb_add_sep(pd);
        breadcrumb_add(pd, comp, full);
        first = FALSE;

        g_free(comp);
        g_free(prefix);
        prefix = full;
        rest = slash ? slash + 1 : rest + len;
    }
    g_free(prefix);
}

static void update_path_display(FilePanelData *pd) {
    gtk_label_set_text(GTK_LABEL(pd->side_label), pd->side_title);
    breadcrumb_clear(pd);
    breadcrumb_build(pd);
    gtk_widget_show_all(pd->breadcrumb_box);
}

static void on_folder_selected(const char *path, gpointer user_data) {
    GtkWidget *panel = GTK_WIDGET(user_data);
    FilePanelData *pd = panel_data(panel);
    if (pd && pd->on_focus)
        pd->on_focus(panel, pd->callback_data);
    file_panel_navigate(panel, path);
}

static void on_home_clicked(GtkButton *btn, gpointer data) {
    (void)btn;
    GtkWidget *panel = GTK_WIDGET(data);
    FilePanelData *pd = panel_data(panel);
    if (!pd)
        return;
    if (pd->on_focus)
        pd->on_focus(panel, pd->callback_data);
    file_panel_navigate(panel, g_get_home_dir());
}

static gboolean on_path_bar_clicked(GtkWidget *w, GdkEvent *event, gpointer data) {
    (void)w;
    (void)event;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    if (!pd) return FALSE;
    if (pd->on_focus)
        pd->on_focus(GTK_WIDGET(data), pd->callback_data);
    if (folder_tree_panel_is_open(pd->folder_tree))
        folder_tree_panel_collapse(pd->folder_tree);
    else
        folder_tree_panel_toggle(pd->folder_tree, pd->current_path);
    return FALSE;
}

static GPtrArray *get_selected_paths(FilePanelData *pd) {
    GPtrArray *paths = g_ptr_array_new_with_free_func(g_free);
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view));
    GtkTreeModel *model = GTK_TREE_MODEL(pd->store);
    GList *rows = gtk_tree_selection_get_selected_rows(sel, &model);
    for (GList *l = rows; l; l = l->next) {
        GtkTreeIter it;
        gtk_tree_model_get_iter(model, &it, (GtkTreePath *)l->data);
        FileEntry *entry = NULL;
        entry = store_get_entry(model, &it);
        if (entry && strcmp(entry->name, "..") != 0)
            g_ptr_array_add(paths, g_strdup(entry->full_path));
    }
    g_list_free_full(rows, (GDestroyNotify)gtk_tree_path_free);
    return paths;
}

static void notify_selection(FilePanelData *pd) {
    if (!pd->on_selection_changed) return;
    GPtrArray *paths = get_selected_paths(pd);
    pd->on_selection_changed(pd->container, paths, pd->callback_data);
    g_ptr_array_free(paths, TRUE);
}

static void on_selection_changed(GtkTreeSelection *sel, gpointer data) {
    (void)sel;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    if (!pd) return;

    GtkTreeSelection *selection = gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view));
    GtkTreeModel *model = GTK_TREE_MODEL(pd->store);
    int sel_dirs = 0, sel_files = 0;
    int64_t sel_size = 0;

    GList *rows = gtk_tree_selection_get_selected_rows(selection, &model);
    if (rows) {
        for (GList *l = rows; l; l = l->next) {
            GtkTreeIter it;
            gtk_tree_model_get_iter(model, &it, (GtkTreePath *)l->data);
            FileEntry *entry = NULL;
            entry = store_get_entry(model, &it);
            if (!entry || strcmp(entry->name, "..") == 0) continue;
            if (entry->is_directory) sel_dirs++;
            else { sel_files++; sel_size += entry->size; }
        }
        g_list_free_full(rows, (GDestroyNotify)gtk_tree_path_free);

        if (sel_dirs + sel_files > 0) {
            char *size_str = file_entry_format_size(sel_size);
            char *msg = g_strdup_printf("폴더 %d개, 파일 %d개 선택됨  |  %s",
                                        sel_dirs, sel_files, size_str);
            set_status(pd, msg);
            g_free(size_str);
            g_free(msg);
        }
    } else {
        update_status_counts(pd);
    }
    notify_selection(pd);
}

static void open_file(GtkWidget *panel, const char *path) {
    if (!path || !*path)
        return;

    if (g_file_test(path, G_FILE_TEST_IS_DIR)) {
        file_panel_navigate(panel, path);
        return;
    }

    if (archive_split_detect(path, NULL)) {
        file_panel_request_extract(panel, path);
        return;
    }

    GError *err = NULL;
    GFile *file = g_file_new_for_path(path);
    GAppInfo *app = g_file_query_default_handler(file, NULL, &err);
    gboolean launched = FALSE;

    if (app) {
        GdkDisplay *display = gtk_widget_get_display(panel);
        GdkAppLaunchContext *ctx = gdk_display_get_app_launch_context(display);
        GList *files = g_list_append(NULL, file);
        launched = g_app_info_launch(app, files, G_APP_LAUNCH_CONTEXT(ctx), &err);
        g_list_free(files);
        g_object_unref(ctx);
        g_object_unref(app);
    }

    if (!launched) {
        g_clear_error(&err);
        gchar *uri = g_file_get_uri(file);
        if (uri) {
            GtkWindow *win = panel_window(panel);
            launched = gtk_show_uri_on_window(win, uri, GDK_CURRENT_TIME, &err);
            if (!launched) {
                g_clear_error(&err);
                GdkDisplay *display = gtk_widget_get_display(panel);
                GdkAppLaunchContext *ctx =
                    gdk_display_get_app_launch_context(display);
                launched = g_app_info_launch_default_for_uri(
                    uri, G_APP_LAUNCH_CONTEXT(ctx), &err);
                g_object_unref(ctx);
            }
            g_free(uri);
        }
    }

    if (!launched)
        show_error(panel, err ? err->message : "파일을 열 수 없습니다.");

    g_object_unref(file);
    g_clear_error(&err);
}

static void on_row_activated(GtkTreeView *view, GtkTreePath *path,
                             GtkTreeViewColumn *col, gpointer data) {
    (void)col;
    GtkWidget *panel = GTK_WIDGET(data);
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;

    GtkTreeSelection *sel = gtk_tree_view_get_selection(view);
    gtk_tree_selection_unselect_all(sel);
    gtk_tree_selection_select_path(sel, path);

    if (pd->on_focus)
        pd->on_focus(panel, pd->callback_data);

    GtkTreeModel *model = gtk_tree_view_get_model(view);
    GtkTreeIter iter;
    if (!gtk_tree_model_get_iter(model, &iter, path))
        return;
    activate_entry_at_iter(panel, pd, model, &iter);
}

static void fit_columns_to_view(FilePanelData *pd) {
    if (pd->fitting_columns)
        return;

    GtkWidget *scroll = gtk_widget_get_parent(pd->tree_view);
    GtkAllocation alloc;
    if (GTK_IS_SCROLLED_WINDOW(scroll))
        gtk_widget_get_allocation(scroll, &alloc);
    else
        gtk_widget_get_allocation(pd->tree_view, &alloc);

    if (alloc.width <= 0)
        return;
    if (pd->last_fit_width == alloc.width)
        return;

    /* 세로 스크롤바·컬럼 구분선·여백 */
    const int col_spacing = 10;
    int avail = alloc.width - 24;
    if (avail < 320)
        return;

    GtkTreeView *view = GTK_TREE_VIEW(pd->tree_view);
    GList *cols = gtk_tree_view_get_columns(view);
    if (g_list_length(cols) != (guint)N_COLS) {
        g_list_free(cols);
        return;
    }

    int other_w[] = { 66, 96, 70, 64 };
    const int other_min[] = { 56, 78, 56, 60 };
    const int name_min = 64;

    int other_sum = other_w[0] + other_w[1] + other_w[2] + other_w[3];
    int name_w = avail - other_sum - col_spacing;

    if (name_w < name_min) {
        int deficit = name_min - name_w;
        for (int i = 0; i < 4 && deficit > 0; i++) {
            int reducible = other_w[i] - other_min[i];
            int cut = deficit < reducible ? deficit : reducible;
            other_w[i] -= cut;
            deficit -= cut;
        }
        other_sum = other_w[0] + other_w[1] + other_w[2] + other_w[3];
        name_w = avail - other_sum - col_spacing;
        if (name_w < name_min)
            name_w = name_min;
    }

    int total = name_w + other_sum + col_spacing;
    if (total > avail) {
        int overflow = total - avail;
        int name_cut = overflow;
        if (name_cut > name_w - name_min)
            name_cut = name_w - name_min;
        name_w -= name_cut;
        overflow -= name_cut;
        if (overflow > 0)
            other_w[3] = MAX(other_min[3], other_w[3] - overflow);
    }

    pd->fitting_columns = TRUE;
    gtk_tree_view_column_set_fixed_width(
        GTK_TREE_VIEW_COLUMN(g_list_nth_data(cols, COL_NAME)), name_w);
    for (int i = 0; i < 4; i++) {
        gtk_tree_view_column_set_fixed_width(
            GTK_TREE_VIEW_COLUMN(g_list_nth_data(cols, COL_PERM + i)), other_w[i]);
    }
    pd->fitting_columns = FALSE;
    pd->last_fit_width = alloc.width;

    g_list_free(cols);
}

static gboolean on_tree_view_size_allocate(GtkWidget *widget, GdkRectangle *allocation,
                                           gpointer data) {
    (void)widget;
    if (allocation->width > 0)
        fit_columns_to_view((FilePanelData *)data);
    return FALSE;
}

static void on_column_clicked(GtkTreeViewColumn *column, gpointer data) {
    FilePanelData *pd = data;
    GList *cols = gtk_tree_view_get_columns(GTK_TREE_VIEW(pd->tree_view));
    int index = 0;
    for (GList *l = cols; l; l = l->next, index++) {
        if (l->data == column)
            break;
    }
    g_list_free(cols);
    if (index >= N_COLS)
        return;

    if (pd->sort_column == index)
        pd->sort_order = pd->sort_order == GTK_SORT_ASCENDING
                             ? GTK_SORT_DESCENDING
                             : GTK_SORT_ASCENDING;
    else {
        pd->sort_column = index;
        pd->sort_order = GTK_SORT_ASCENDING;
    }
    apply_current_sort(pd);
}

static gboolean on_button_press(GtkWidget *w, GdkEventButton *e, gpointer data) {
    GtkWidget *panel = GTK_WIDGET(data);
    FilePanelData *pd = panel_data(panel);
    if (!pd || !pd->context_menu) return FALSE;

    if (e->type == GDK_BUTTON_PRESS && e->button == 1 && pd->on_focus)
        pd->on_focus(pd->container, pd->callback_data);

    GtkTreeView *view = GTK_TREE_VIEW(w);
    GtkTreePath *path = NULL;
    GtkTreeViewColumn *col = NULL;
    int cell_x, cell_y;

    if (e->type == GDK_BUTTON_PRESS && e->button == 3) {
        GtkTreeSelection *sel = gtk_tree_view_get_selection(view);
        if (gtk_tree_view_get_path_at_pos(view, e->x, e->y, &path, &col,
                                          &cell_x, &cell_y)) {
            if (!gtk_tree_selection_path_is_selected(sel, path)) {
                gtk_tree_selection_unselect_all(sel);
                gtk_tree_selection_select_path(sel, path);
            }
            gtk_tree_path_free(path);
            path = NULL;
        }
        update_context_menu(pd);
        gtk_widget_show_all(pd->context_menu);
        gtk_menu_popup_at_pointer(GTK_MENU(pd->context_menu), (GdkEvent *)e);
        return TRUE;
    }

    return FALSE;
}

static gboolean on_key_press(GtkWidget *widget, GdkEventKey *event, gpointer data) {
    (void)widget;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    guint key = event->keyval;
    GdkModifierType state = event->state & (GDK_SHIFT_MASK | GDK_CONTROL_MASK | GDK_MOD1_MASK);

    if (key == GDK_KEY_Return || key == GDK_KEY_KP_Enter) {
        GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view));
        GtkTreeModel *model;
        GtkTreeIter iter;
        if (selection_get_first_iter(sel, &model, &iter))
            activate_entry(GTK_WIDGET(data), store_get_entry(model, &iter));
        return TRUE;
    }
    if (key == GDK_KEY_BackSpace) {
        char *parent = g_path_get_dirname(pd->current_path);
        if (strcmp(parent, pd->current_path) != 0)
            file_panel_navigate(GTK_WIDGET(data), parent);
        g_free(parent);
        return TRUE;
    }
    if (key == GDK_KEY_F2) { file_panel_begin_rename(GTK_WIDGET(data)); return TRUE; }
    if (key == GDK_KEY_Delete) { file_panel_request_delete(GTK_WIDGET(data)); return TRUE; }
    if (key == GDK_KEY_a && state == GDK_CONTROL_MASK) {
        file_panel_select_all(GTK_WIDGET(data));
        return TRUE;
    }
    if (key == GDK_KEY_c && state == GDK_CONTROL_MASK) {
        file_panel_clipboard_copy(GTK_WIDGET(data));
        return TRUE;
    }
    if (key == GDK_KEY_v && state == GDK_CONTROL_MASK) {
        file_panel_clipboard_paste(GTK_WIDGET(data));
        return TRUE;
    }
    return FALSE;
}

static gboolean on_focus_in(GtkWidget *w, GdkEvent *event, gpointer data) {
    (void)w;
    (void)event;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    if (pd && pd->on_focus)
        pd->on_focus(pd->container, pd->callback_data);
    return FALSE;
}

/* Context menu callbacks */
static void ctx_open(GtkMenuItem *item, gpointer data) {
    (void)item;
    GtkWidget *panel = GTK_WIDGET(data);
    FilePanelData *pd = panel_data(panel);
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view));
    GtkTreeModel *model = GTK_TREE_MODEL(pd->store);
    GList *rows = gtk_tree_selection_get_selected_rows(sel, &model);

    GPtrArray *file_paths = g_ptr_array_new_with_free_func(g_free);
    char *nav_path = NULL;

    for (GList *l = rows; l; l = l->next) {
        GtkTreeIter iter;
        if (!gtk_tree_model_get_iter(model, &iter, (GtkTreePath *)l->data))
            continue;
        FileEntry *entry = store_get_entry(model, &iter);
        if (!entry || strcmp(entry->name, "..") == 0)
            continue;
        if (entry->is_directory) {
            if (!nav_path)
                nav_path = g_strdup(entry->full_path);
        } else {
            g_ptr_array_add(file_paths, g_strdup(entry->full_path));
        }
    }
    g_list_free_full(rows, (GDestroyNotify)gtk_tree_path_free);

    for (guint i = 0; i < file_paths->len; i++)
        open_file(panel, g_ptr_array_index(file_paths, i));
    g_ptr_array_free(file_paths, TRUE);

    if (nav_path) {
        file_panel_navigate(panel, nav_path);
        g_free(nav_path);
    }
}

static void ctx_copy_other(GtkMenuItem *item, gpointer data) {
    (void)item;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    if (pd && pd->on_copy_to_other) pd->on_copy_to_other(pd->container, pd->callback_data);
}

static void ctx_move_other(GtkMenuItem *item, gpointer data) {
    (void)item;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    if (pd && pd->on_move_to_other) pd->on_move_to_other(pd->container, pd->callback_data);
}

static void ctx_rename(GtkMenuItem *item, gpointer data) {
    (void)item;
    file_panel_begin_rename(GTK_WIDGET(data));
}

static void ctx_trash(GtkMenuItem *item, gpointer data) {
    (void)item;
    file_panel_request_trash(GTK_WIDGET(data));
}

static void ctx_delete(GtkMenuItem *item, gpointer data) {
    (void)item;
    file_panel_request_delete(GTK_WIDGET(data));
}

static void ctx_new_folder(GtkMenuItem *item, gpointer data) {
    (void)item;
    file_panel_request_new_folder(GTK_WIDGET(data));
}

static void ctx_new_file(GtkMenuItem *item, gpointer data) {
    (void)item;
    file_panel_request_new_file(GTK_WIDGET(data));
}

static void ctx_clip_copy(GtkMenuItem *item, gpointer data) {
    (void)item;
    file_panel_clipboard_copy(GTK_WIDGET(data));
}

static void ctx_clip_paste(GtkMenuItem *item, gpointer data) {
    (void)item;
    file_panel_clipboard_paste(GTK_WIDGET(data));
}

static void ctx_compress_cb(GtkMenuItem *item, gpointer data) {
    (void)item;
    file_panel_request_compress(GTK_WIDGET(data));
}

static void ctx_extract_cb(GtkMenuItem *item, gpointer data) {
    (void)item;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    if (!pd) return;
    GPtrArray *paths = get_selected_paths(pd);
    if (paths->len == 1)
        file_panel_request_extract(GTK_WIDGET(data), g_ptr_array_index(paths, 0));
    g_ptr_array_free(paths, TRUE);
}

static void ctx_properties(GtkMenuItem *item, gpointer data) {
    (void)item;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view));
    GtkTreeModel *model;
    GtkTreeIter iter;
    if (!selection_get_first_iter(sel, &model, &iter)) return;
    FileEntry *entry = store_get_entry(model, &iter);
    if (!entry || strcmp(entry->name, "..") == 0) return;

    GFileInfo *info = g_file_query_info(
        g_file_new_for_path(entry->full_path),
        G_FILE_ATTRIBUTE_STANDARD_SIZE ","
        G_FILE_ATTRIBUTE_TIME_MODIFIED,
        G_FILE_QUERY_INFO_NONE, NULL, NULL);
    char *size_str = file_entry_size_display(entry);
    char *msg = g_strdup_printf(
        "이름: %s\n경로: %s\n크기: %s\n",
        entry->name, entry->full_path, size_str);
    g_free(size_str);
    GtkWidget *dlg = gtk_message_dialog_new(panel_window(GTK_WIDGET(data)),
        GTK_DIALOG_MODAL, GTK_MESSAGE_INFO, GTK_BUTTONS_OK, "%s", msg);
    gtk_window_set_title(GTK_WINDOW(dlg), "속성");
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
    g_free(msg);
    (void)info;
}

static void build_context_menu(FilePanelData *pd) {
    GtkWidget *menu = gtk_menu_new();
    struct {
        const char *label;
        const char *icon;
        const char *fallback;
        GCallback cb;
        GtkWidget **slot;
    } items[] = {
        { "열기", "document-open", "gtk-open",
          G_CALLBACK(ctx_open), &pd->ctx_open },
        { "→ 다른 패널로 복사", "edit-copy", "gtk-copy",
          G_CALLBACK(ctx_copy_other), &pd->ctx_copy_other },
        { "→ 다른 패널로 이동", "go-next", "gtk-go-forward",
          G_CALLBACK(ctx_move_other), &pd->ctx_move_other },
        { NULL, NULL, NULL, NULL, NULL },
        { "복사", "edit-copy", "gtk-copy",
          G_CALLBACK(ctx_clip_copy), &pd->ctx_clip_copy },
        { "붙여넣기", "edit-paste", "gtk-paste",
          G_CALLBACK(ctx_clip_paste), NULL },
        { NULL, NULL, NULL, NULL, NULL },
        { "이름 바꾸기", "gtk-edit", "gtk-edit",
          G_CALLBACK(ctx_rename), &pd->ctx_rename },
        { "휴지통으로 이동", "user-trash", "gtk-delete",
          G_CALLBACK(ctx_trash), &pd->ctx_trash },
        { "삭제", "edit-delete", "gtk-delete",
          G_CALLBACK(ctx_delete), &pd->ctx_delete },
        { NULL, NULL, NULL, NULL, NULL },
        { "압축", "package-x-generic", "gtk-add",
          G_CALLBACK(ctx_compress_cb), &pd->ctx_compress },
        { "압축 해제", "folder-download", "gtk-open",
          G_CALLBACK(ctx_extract_cb), &pd->ctx_extract },
        { NULL, NULL, NULL, NULL, NULL },
        { "새 폴더 만들기", "folder-new", "gtk-directory",
          G_CALLBACK(ctx_new_folder), NULL },
        { "새 파일 만들기", "document-new", "gtk-new",
          G_CALLBACK(ctx_new_file), NULL },
        { NULL, NULL, NULL, NULL, NULL },
        { "속성", "document-properties", "gtk-properties",
          G_CALLBACK(ctx_properties), &pd->ctx_properties },
    };
    for (guint i = 0; i < G_N_ELEMENTS(items); i++) {
        GtkWidget *item;
        if (!items[i].label)
            item = gtk_separator_menu_item_new();
        else
            item = ui_menu_item_new(items[i].label, items[i].icon, items[i].fallback);
        gtk_menu_shell_append(GTK_MENU_SHELL(menu), item);
        if (items[i].slot)
            *items[i].slot = item;
        if (items[i].cb)
            g_signal_connect(item, "activate", items[i].cb, pd->container);
    }
    pd->context_menu = menu;
}

static void file_panel_ensure_border_style(void) {
    static gboolean installed = FALSE;
    if (installed)
        return;
    installed = TRUE;

    GtkCssProvider *css = gtk_css_provider_new();
    gtk_css_provider_load_from_data(css,
        ".file-panel {\n"
        "  border: 2px solid rgba(160, 160, 160, 0.25);\n"
        "  border-radius: 6px;\n"
        "  padding: 2px;\n"
        "}\n"
        ".file-panel-active {\n"
        "  border-color: rgba(53, 132, 228, 0.45);\n"
        "}\n"
        ".breadcrumb-btn {\n"
        "  padding: 0 4px;\n"
        "  min-height: 0;\n"
        "}\n"
        ".breadcrumb-btn:hover {\n"
        "  background-color: rgba(53, 132, 228, 0.15);\n"
        "}\n",
        -1, NULL);
    gtk_style_context_add_provider_for_screen(
        gdk_screen_get_default(),
        GTK_STYLE_PROVIDER(css),
        GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    g_object_unref(css);
}

void file_panel_set_active(GtkWidget *panel, gboolean active) {
    FilePanelData *pd = panel_data(panel);
    if (!pd)
        return;

    GtkStyleContext *ctx = gtk_widget_get_style_context(pd->container);
    if (active)
        gtk_style_context_add_class(ctx, "file-panel-active");
    else
        gtk_style_context_remove_class(ctx, "file-panel-active");
}

GtkWidget *file_panel_new(FilePanelSide side, gpointer main_window) {
    file_panel_ensure_border_style();

    FilePanelData *pd = g_new0(FilePanelData, 1);
    pd->side = side;
    pd->main_window = main_window;
    pd->side_title = g_strdup(side == FILE_PANEL_LEFT ? "왼쪽" : "오른쪽");
    pd->current_path = g_strdup(g_get_home_dir());
    pd->sort_column = COL_NAME;
    pd->sort_order = GTK_SORT_ASCENDING;
    pd->last_fit_width = -1;
    pd->fitting_columns = FALSE;

    pd->container = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_widget_set_margin_start(pd->container, 8);
    gtk_widget_set_margin_end(pd->container, 8);
    gtk_widget_set_margin_top(pd->container, 8);

    pd->path_bar = gtk_event_box_new();
    gtk_widget_set_margin_start(pd->path_bar, 4);
    gtk_widget_set_margin_end(pd->path_bar, 4);
    gtk_widget_set_margin_bottom(pd->path_bar, 4);
    GtkWidget *path_inner = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_container_add(GTK_CONTAINER(pd->path_bar), path_inner);
    gtk_widget_set_margin_start(path_inner, 12);
    gtk_widget_set_margin_end(path_inner, 12);
    gtk_widget_set_margin_top(path_inner, 10);
    gtk_widget_set_margin_bottom(path_inner, 10);

    GtkWidget *home_btn = gtk_button_new();
    gtk_button_set_relief(GTK_BUTTON(home_btn), GTK_RELIEF_NONE);
    gtk_button_set_image(GTK_BUTTON(home_btn),
                         ui_menu_load_icon("go-home", "gtk-home"));
    gtk_widget_set_tooltip_text(home_btn, "홈");
    gtk_widget_set_focus_on_click(home_btn, FALSE);
    gtk_box_pack_start(GTK_BOX(path_inner), home_btn, FALSE, FALSE, 0);
    g_signal_connect(home_btn, "clicked", G_CALLBACK(on_home_clicked), pd->container);

    pd->side_label = gtk_label_new(pd->side_title);
    gtk_label_set_xalign(GTK_LABEL(pd->side_label), 0.0);
    gtk_widget_set_margin_end(pd->side_label, 4);
    gtk_widget_add_events(pd->side_label, GDK_BUTTON_PRESS_MASK);
    gtk_box_pack_start(GTK_BOX(path_inner), pd->side_label, FALSE, FALSE, 0);
    g_signal_connect(pd->side_label, "button-press-event",
                     G_CALLBACK(on_path_bar_clicked), pd->container);

    pd->breadcrumb_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(pd->breadcrumb_scroll),
                                 GTK_POLICY_AUTOMATIC, GTK_POLICY_NEVER);
    gtk_scrolled_window_set_shadow_type(GTK_SCROLLED_WINDOW(pd->breadcrumb_scroll),
                                      GTK_SHADOW_NONE);
    pd->breadcrumb_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
    gtk_container_add(GTK_CONTAINER(pd->breadcrumb_scroll), pd->breadcrumb_box);
    gtk_box_pack_start(GTK_BOX(path_inner), pd->breadcrumb_scroll, TRUE, TRUE, 0);

    pd->folder_tree = folder_tree_panel_new(on_folder_selected, pd->container);

    pd->store = gtk_list_store_new(6, G_TYPE_STRING, G_TYPE_STRING, G_TYPE_STRING,
                                   G_TYPE_STRING, G_TYPE_STRING, G_TYPE_POINTER);
    pd->tree_view = gtk_tree_view_new_with_model(GTK_TREE_MODEL(pd->store));
    gtk_tree_view_set_headers_visible(GTK_TREE_VIEW(pd->tree_view), TRUE);
    gtk_tree_view_set_activate_on_single_click(GTK_TREE_VIEW(pd->tree_view), FALSE);
    gtk_tree_selection_set_mode(gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view)),
                                GTK_SELECTION_MULTIPLE);

    const char *titles[] = { "이름", "권한", "수정일", "종류", "크기" };
    const int default_widths[] = { 110, 66, 96, 70, 64 };
    const int min_widths[] = { 64, 56, 78, 56, 60 };
    for (int i = 0; i < N_COLS; i++) {
        GtkCellRenderer *renderer = gtk_cell_renderer_text_new();
        gdouble cell_xalign = 0.5;
        if (i == COL_NAME)
            cell_xalign = 0.0;
        else if (i == COL_SIZE)
            cell_xalign = 1.0;
        g_object_set(renderer, "xalign", cell_xalign, NULL);

        GtkTreeViewColumn *col = gtk_tree_view_column_new_with_attributes(
            titles[i], renderer, "text", i, NULL);
        gtk_tree_view_column_set_alignment(col, i == COL_SIZE ? 1.0 : 0.5);
        gtk_tree_view_column_set_resizable(col, TRUE);
        gtk_tree_view_column_set_min_width(col, min_widths[i]);
        gtk_tree_view_column_set_fixed_width(col, default_widths[i]);
        gtk_tree_view_column_set_sizing(col, GTK_TREE_VIEW_COLUMN_FIXED);
        gtk_tree_view_column_set_clickable(col, TRUE);
        gtk_tree_view_column_set_sort_indicator(col, i == pd->sort_column);
        if (i == pd->sort_column)
            gtk_tree_view_column_set_sort_order(col, pd->sort_order);
        gtk_tree_view_append_column(GTK_TREE_VIEW(pd->tree_view), col);
        g_signal_connect(col, "clicked", G_CALLBACK(on_column_clicked), pd);
    }

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(scroll), pd->tree_view);

    g_signal_connect(scroll, "size-allocate",
                     G_CALLBACK(on_tree_view_size_allocate), pd);

    pd->status_label = gtk_label_new("준비");
    gtk_label_set_xalign(GTK_LABEL(pd->status_label), 0.0);
    gtk_widget_set_margin_start(pd->status_label, 8);

    build_context_menu(pd);
    update_context_menu(pd);
    gtk_widget_add_events(pd->tree_view, GDK_BUTTON_PRESS_MASK);
    g_signal_connect(pd->tree_view, "button-press-event",
                     G_CALLBACK(on_button_press), pd->container);

    gtk_widget_set_margin_start(pd->folder_tree, 4);
    gtk_widget_set_margin_end(pd->folder_tree, 4);
    gtk_widget_set_margin_bottom(pd->folder_tree, 4);

    gtk_box_pack_start(GTK_BOX(pd->container), pd->path_bar, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(pd->container), pd->folder_tree, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(pd->container), scroll, TRUE, TRUE, 4);
    gtk_box_pack_start(GTK_BOX(pd->container), pd->status_label, FALSE, FALSE, 4);

    g_signal_connect(pd->tree_view, "row-activated", G_CALLBACK(on_row_activated), pd->container);
    g_signal_connect(gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view)),
                     "changed", G_CALLBACK(on_selection_changed), pd->container);
    g_signal_connect(pd->tree_view, "key-press-event", G_CALLBACK(on_key_press), pd->container);
    g_signal_connect(pd->tree_view, "focus-in-event", G_CALLBACK(on_focus_in), pd->container);

    gtk_tree_sortable_set_default_sort_func(GTK_TREE_SORTABLE(pd->store),
                                            sort_compare, pd, NULL);

    g_object_set_data_full(G_OBJECT(pd->container), "file-panel-data", pd,
                           file_panel_data_free);
    update_path_display(pd);
    gtk_style_context_add_class(
        gtk_widget_get_style_context(pd->container), "file-panel");
    return pd->container;
}

void file_panel_set_initial_path(GtkWidget *panel, const char *path) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;
    const char *target = (path && *path && g_file_test(path, G_FILE_TEST_IS_DIR))
                             ? path
                             : g_get_home_dir();
    g_free(pd->current_path);
    pd->current_path = g_strdup(target);
    update_path_display(pd);
}

void file_panel_load_contents(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd)
        return;
    load_directory(pd);
    start_directory_monitor(pd);
}

const char *file_panel_get_current_path(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    return pd ? pd->current_path : NULL;
}

void file_panel_navigate(GtkWidget *panel, const char *path) {
    FilePanelData *pd = panel_data(panel);
    if (!pd || !path || !g_file_test(path, G_FILE_TEST_IS_DIR)) return;
    folder_tree_panel_collapse(pd->folder_tree);
    g_free(pd->current_path);
    pd->current_path = g_strdup(path);
    update_path_display(pd);
    load_directory(pd);
    start_directory_monitor(pd);
    if (pd->on_path_changed)
        pd->on_path_changed(panel, path, pd->callback_data);
}

void file_panel_refresh(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (pd) load_directory(pd);
}

void file_panel_suspend_watch(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd)
        return;
    pd->watch_suspended = TRUE;
    stop_directory_monitor(pd);
}

void file_panel_resume_watch(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd)
        return;
    pd->watch_suspended = FALSE;
    start_directory_monitor(pd);
}

GPtrArray *file_panel_get_selected_paths(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return g_ptr_array_new_with_free_func(g_free);
    return get_selected_paths(pd);
}

void file_panel_set_status(GtkWidget *panel, const char *message) {
    FilePanelData *pd = panel_data(panel);
    if (pd) set_status(pd, message);
}

void file_panel_request_new_folder(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;
    char *text = NULL;
    if (!input_dialog_run(panel_window(panel), "새 폴더 만들기", "폴더 이름:", "새 폴더", &text))
        return;
    char *path = g_build_filename(pd->current_path, text, NULL);
    if (g_mkdir_with_parents(path, 0755) == 0) {
        file_panel_refresh(panel);
        char *msg = g_strdup_printf("폴더 '%s'를 만들었습니다.", text);
        set_status(pd, msg);
        g_free(msg);
    }
    g_free(path);
    g_free(text);
}

void file_panel_request_new_file(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;
    char *text = NULL;
    if (!input_dialog_run(panel_window(panel), "새 파일 만들기", "파일 이름:", "새 파일.txt", &text))
        return;
    char *path = g_build_filename(pd->current_path, text, NULL);
    if (g_file_set_contents(path, "", 0, NULL)) {
        file_panel_refresh(panel);
        char *msg = g_strdup_printf("파일 '%s'를 만들었습니다.", text);
        set_status(pd, msg);
        g_free(msg);
    }
    g_free(path);
    g_free(text);
}

static void show_error(GtkWidget *panel, const char *msg) {
    GtkWidget *dlg = gtk_message_dialog_new(panel_window(panel), GTK_DIALOG_MODAL,
        GTK_MESSAGE_ERROR, GTK_BUTTONS_OK, "%s", msg);
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

void file_panel_request_trash(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;
    GPtrArray *paths = get_selected_paths(pd);
    if (paths->len == 0) {
        set_status(pd, "휴지통으로 보낼 항목이 선택되지 않았습니다.");
        g_ptr_array_free(paths, TRUE);
        return;
    }

    GtkWindow *win = panel_window(panel);
    suspend_all_watches(pd);
    ProgressDialog *prog = progress_dialog_begin(win, "휴지통으로 이동");
    GCancellable *cancel = progress_dialog_get_cancellable(prog);
    ProgressDialogOpsCtx pctx = { prog, 0, (guint64)paths->len };
    GError *err = NULL;
    if (file_ops_trash_files(paths, progress_dialog_ops_callback, &pctx,
                             cancel, &err)) {
        file_panel_refresh(panel);
        char *s = g_strdup_printf("%u개 항목을 휴지통으로 이동했습니다.", paths->len);
        set_status(pd, s);
        g_free(s);
    } else if (err && g_error_matches(err, G_IO_ERROR, G_IO_ERROR_CANCELLED)) {
        file_panel_refresh(panel);
        set_status(pd, "휴지통 이동이 취소되었습니다.");
        g_clear_error(&err);
    } else {
        show_error(panel, err ? err->message : "휴지통 이동 실패");
        g_clear_error(&err);
    }
    progress_dialog_end(prog);
    resume_all_watches(pd);
    g_ptr_array_free(paths, TRUE);
}

void file_panel_request_delete(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;
    GPtrArray *paths = get_selected_paths(pd);
    if (paths->len == 0) {
        set_status(pd, "삭제할 항목이 선택되지 않았습니다.");
        g_ptr_array_free(paths, TRUE);
        return;
    }
    char *msg = paths->len == 1
        ? g_strdup_printf("'%s'을(를) 영구 삭제하시겠습니까?\n(휴지통으로 복구할 수 없습니다.)",
                          g_path_get_basename(g_ptr_array_index(paths, 0)))
        : g_strdup_printf("선택한 %u개 항목을 영구 삭제하시겠습니까?\n(휴지통으로 복구할 수 없습니다.)",
                          paths->len);
    GtkWidget *dlg = gtk_message_dialog_new(panel_window(panel), GTK_DIALOG_MODAL,
        GTK_MESSAGE_WARNING, GTK_BUTTONS_YES_NO, "%s", msg);
    g_free(msg);
    int resp = gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
    if (resp == GTK_RESPONSE_YES) {
        GtkWindow *win = panel_window(panel);
        suspend_all_watches(pd);
        ProgressDialog *prog = progress_dialog_begin(win, "삭제중");
        GCancellable *cancel = progress_dialog_get_cancellable(prog);
        ProgressDialogOpsCtx pctx = { prog, 0, file_ops_count_items(paths, cancel) };
        GError *err = NULL;
        if (file_ops_delete_files(paths, progress_dialog_ops_callback, &pctx,
                                  cancel, &err)) {
            file_panel_refresh(panel);
            char *s = g_strdup_printf("%u개 항목을 삭제했습니다.", paths->len);
            set_status(pd, s);
            g_free(s);
        } else if (err && g_error_matches(err, G_IO_ERROR, G_IO_ERROR_CANCELLED)) {
            file_panel_refresh(panel);
            set_status(pd, "삭제가 취소되었습니다.");
            g_clear_error(&err);
        } else {
            show_error(panel, err ? err->message : "삭제 실패");
            g_clear_error(&err);
        }
        progress_dialog_end(prog);
        resume_all_watches(pd);
    }
    g_ptr_array_free(paths, TRUE);
}

void file_panel_begin_rename(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view));
    GtkTreeModel *model;
    GtkTreeIter iter;
    if (!selection_get_first_iter(sel, &model, &iter)) return;
    FileEntry *entry = store_get_entry(model, &iter);
    if (!entry || strcmp(entry->name, "..") == 0) return;

    char *text = NULL;
    if (!input_dialog_run(panel_window(panel), "이름 바꾸기", "새 이름:", entry->name, &text))
        return;
    char *new_path = g_build_filename(pd->current_path, text, NULL);
    if (rename(entry->full_path, new_path) == 0) {
        file_panel_refresh(panel);
        char *msg = g_strdup_printf("이름을 '%s'로 변경했습니다.", text);
        set_status(pd, msg);
        g_free(msg);
    } else {
        show_error(panel, "이름 바꾸기 실패");
    }
    g_free(new_path);
    g_free(text);
}

void file_panel_select_all(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view));
    GtkTreeIter iter;
    gboolean valid = gtk_tree_model_get_iter_first(GTK_TREE_MODEL(pd->store), &iter);
    while (valid) {
        GtkTreePath *path = gtk_tree_model_get_path(GTK_TREE_MODEL(pd->store), &iter);
        gtk_tree_selection_select_path(sel, path);
        gtk_tree_path_free(path);
        valid = gtk_tree_model_iter_next(GTK_TREE_MODEL(pd->store), &iter);
    }
}

static void set_uri_clipboard(GPtrArray *paths) {
    GString *uris = g_string_new(NULL);
    for (guint i = 0; i < paths->len; i++) {
        char *uri = g_filename_to_uri(g_ptr_array_index(paths, i), NULL, NULL);
        if (uri) {
            g_string_append(uris, uri);
            g_string_append_c(uris, '\n');
            g_free(uri);
        }
    }
    GtkClipboard *cb = gtk_clipboard_get(GDK_SELECTION_CLIPBOARD);
    gtk_clipboard_set_text(cb, uris->str, -1);
    g_string_free(uris, TRUE);
}

void file_panel_clipboard_copy(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;
    GPtrArray *paths = get_selected_paths(pd);
    if (paths->len == 0) { g_ptr_array_free(paths, TRUE); return; }
    set_uri_clipboard(paths);
    char *msg = g_strdup_printf("%u개 항목을 클립보드에 복사했습니다.", paths->len);
    set_status(pd, msg);
    g_free(msg);
    g_ptr_array_free(paths, TRUE);
}

void file_panel_clipboard_paste(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;
    GtkClipboard *cb = gtk_clipboard_get(GDK_SELECTION_CLIPBOARD);
    gchar *text = gtk_clipboard_wait_for_text(cb);
    if (!text) {
        set_status(pd, "클립보드에 붙여넣을 파일이 없습니다.");
        return;
    }
    GPtrArray *paths = g_ptr_array_new_with_free_func(g_free);
    gchar **lines = g_strsplit(text, "\n", -1);
    for (int i = 0; lines[i]; i++) {
        if (!*lines[i]) continue;
        char *path = g_filename_from_uri(lines[i], NULL, NULL);
        if (!path) path = g_strdup(lines[i]);
        if (g_file_test(path, G_FILE_TEST_EXISTS))
            g_ptr_array_add(paths, path);
        else
            g_free(path);
    }
    g_strfreev(lines);
    g_free(text);
    if (paths->len == 0) {
        g_ptr_array_free(paths, TRUE);
        set_status(pd, "클립보드에 붙여넣을 파일이 없습니다.");
        return;
    }
    FileOpsConflictState conflict;
    FileOpsTransferStats stats;
    file_ops_conflict_reset(&conflict);
    GtkWindow *win = panel_window(panel);
    suspend_all_watches(pd);
    ProgressDialog *prog = progress_dialog_begin(win, "붙여넣는 중");
    GCancellable *cancel = progress_dialog_get_cancellable(prog);
    ProgressDialogOpsCtx pctx = { prog, 0, file_ops_count_items(paths, cancel) };
    GError *err = NULL;
    if (file_ops_copy_files(paths, pd->current_path, win, &conflict,
                            progress_dialog_ops_callback, &pctx, &stats, cancel,
                            &err)) {
        file_panel_refresh(panel);
        char *msg = NULL;
        if (stats.skipped > 0)
            msg = g_strdup_printf("%u개 붙여넣기, %u개 건너뜀", stats.copied, stats.skipped);
        else
            msg = g_strdup_printf("%u개 항목을 붙여넣었습니다.", stats.copied);
        set_status(pd, msg);
        g_free(msg);
    } else if (err && g_error_matches(err, G_IO_ERROR, G_IO_ERROR_CANCELLED)) {
        file_panel_refresh(panel);
        set_status(pd, "붙여넣기가 취소되었습니다.");
        g_clear_error(&err);
    } else {
        show_error(panel, err ? err->message : "붙여넣기 실패");
        g_clear_error(&err);
    }
    progress_dialog_end(prog);
    resume_all_watches(pd);
    g_ptr_array_free(paths, TRUE);
}

void file_panel_connect_focus(GtkWidget *panel, FilePanelVoidFn cb, gpointer data) {
    FilePanelData *pd = panel_data(panel);
    if (pd) { pd->on_focus = cb; pd->callback_data = data; }
}

void file_panel_connect_path_changed(GtkWidget *panel, FilePanelPathFn cb, gpointer data) {
    FilePanelData *pd = panel_data(panel);
    if (pd) { pd->on_path_changed = cb; pd->callback_data = data; }
}

void file_panel_connect_selection_changed(GtkWidget *panel, FilePanelPathsFn cb, gpointer data) {
    FilePanelData *pd = panel_data(panel);
    if (pd) { pd->on_selection_changed = cb; pd->callback_data = data; }
}

void file_panel_connect_copy_to_other(GtkWidget *panel, FilePanelVoidFn cb, gpointer data) {
    FilePanelData *pd = panel_data(panel);
    if (pd) { pd->on_copy_to_other = cb; pd->callback_data = data; }
}

void file_panel_connect_move_to_other(GtkWidget *panel, FilePanelVoidFn cb, gpointer data) {
    FilePanelData *pd = panel_data(panel);
    if (pd) { pd->on_move_to_other = cb; pd->callback_data = data; }
}

typedef struct {
    GtkWidget *panel;
    GPtrArray *paths;
    char *dest_base;
    ArchiveCreateOpts opts;
    guint item_count;
    gboolean split;

    char *archive_path;
    char *dest_dir;
    char *dest_label;

    ProgressDialog *prog;
    ProgressDialogThreadCtx pctx;
    gboolean success;
    GError *error;
} ArchiveJob;

static gboolean archive_job_finish_idle(gpointer user_data) {
    ArchiveJob *job = user_data;
    FilePanelData *pd = panel_data(job->panel);

    if (pd)
        resume_all_watches(pd);

    if (job->paths) {
        if (job->success) {
            file_panel_refresh(job->panel);
            char *msg = job->split
                ? g_strdup_printf("%u개 항목을 분할 압축했습니다.", job->item_count)
                : g_strdup_printf("%u개 항목을 압축했습니다.", job->item_count);
            set_status(pd, msg);
            g_free(msg);
        } else if (job->error &&
                   g_error_matches(job->error, G_IO_ERROR, G_IO_ERROR_CANCELLED)) {
            set_status(pd, "압축이 취소되었습니다.");
        } else {
            show_error(job->panel, job->error ? job->error->message : "압축 실패");
        }
    } else {
        if (job->success) {
            file_panel_refresh(job->panel);
            char *msg = g_strdup_printf("'%s'에 압축을 해제했습니다.", job->dest_label);
            set_status(pd, msg);
            g_free(msg);
        } else if (job->error &&
                   g_error_matches(job->error, G_IO_ERROR, G_IO_ERROR_CANCELLED)) {
            set_status(pd, "압축 해제가 취소되었습니다.");
        } else {
            show_error(job->panel,
                       job->error ? job->error->message : "압축 해제 실패");
        }
    }

    progress_dialog_thread_ctx_flush(&job->pctx);
    progress_dialog_end(job->prog);
    progress_dialog_thread_ctx_fini(&job->pctx);
    g_clear_error(&job->error);
    if (job->paths)
        g_ptr_array_free(job->paths, TRUE);
    g_free(job->dest_base);
    g_free(job->archive_path);
    g_free(job->dest_dir);
    g_free(job->dest_label);
    g_free(job);
    return G_SOURCE_REMOVE;
}

static gpointer archive_compress_thread(gpointer user_data) {
    ArchiveJob *job = user_data;
    GCancellable *cancel = progress_dialog_get_cancellable(job->prog);

    job->success = archive_create(
        job->paths, job->dest_base, &job->opts,
        progress_dialog_thread_callback, &job->pctx,
        cancel, &job->error);

    g_idle_add(archive_job_finish_idle, job);
    return NULL;
}

static gpointer archive_extract_thread(gpointer user_data) {
    ArchiveJob *job = user_data;
    GCancellable *cancel = progress_dialog_get_cancellable(job->prog);

    job->success = archive_extract(
        job->archive_path, job->dest_dir,
        progress_dialog_thread_callback, &job->pctx,
        cancel, &job->error);

    g_idle_add(archive_job_finish_idle, job);
    return NULL;
}

void file_panel_request_compress(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;
    GPtrArray *paths = get_selected_paths(pd);
    if (paths->len == 0) {
        set_status(pd, "압축할 항목이 선택되지 않았습니다.");
        g_ptr_array_free(paths, TRUE);
        return;
    }

    /* Suggest archive name from the first selected item */
    const char *first = g_ptr_array_index(paths, 0);
    char *suggested = g_path_get_basename(first);
    /* Strip any existing archive extension */
    for (const char * const *sfx = (const char * const []){
             ".tar.gz",".tgz",".tar.bz2",".tbz2",".tar.xz",".txz",
             ".tar",".zip", NULL }; *sfx; sfx++) {
        if (g_str_has_suffix(suggested, *sfx)) {
            suggested[strlen(suggested) - strlen(*sfx)] = '\0';
            break;
        }
    }

    CompressDialogResult result = { 0 };
    gboolean ok = compress_dialog_run(panel_window(panel),
                                      suggested, pd->current_path, &result);
    g_free(suggested);

    if (!ok) {
        g_ptr_array_free(paths, TRUE);
        return;
    }

    /* dest_path already contains the full path including extension */
    const char *dest_with_ext = result.dest_path;
    /* Strip extension to get base path for archive_create */
    const char *ext = archive_format_ext_for(&result.opts);
    char *dest_base = g_strdup(dest_with_ext);
    if (g_str_has_suffix(dest_base, ext))
        dest_base[strlen(dest_base) - strlen(ext)] = '\0';

    ArchiveJob *job = g_new0(ArchiveJob, 1);
    job->panel = panel;
    job->paths = paths;
    job->dest_base = dest_base;
    job->opts = result.opts;
    job->item_count = paths->len;
    job->split = result.opts.split;

    GtkWindow *win = panel_window(panel);
    job->prog = progress_dialog_begin(win, "압축 중");
    progress_dialog_thread_ctx_init(&job->pctx, job->prog, (guint64)paths->len);

    compress_dialog_result_free(&result);
    suspend_all_watches(pd);
    g_thread_new("archive-compress", archive_compress_thread, job);
}

void file_panel_request_extract(GtkWidget *panel, const char *archive_path) {
    FilePanelData *pd = panel_data(panel);
    if (!pd || !archive_path) return;

    /* Suggest destination folder name */
    char *bname = g_path_get_basename(archive_path);
    /* Strip numeric split suffix (.001 etc.) */
    char *base_for_name = NULL;
    if (archive_split_detect(archive_path, &base_for_name)) {
        g_free(bname);
        bname = g_path_get_basename(base_for_name);
        g_free(base_for_name);
    }
    /* Strip archive extension from suggestion */
    for (const char * const *sfx = (const char * const []){
             ".tar.gz",".tgz",".tar.bz2",".tbz2",".tar.xz",".txz",
             ".tar",".zip", NULL }; *sfx; sfx++) {
        if (g_str_has_suffix(bname, *sfx)) {
            bname[strlen(bname) - strlen(*sfx)] = '\0';
            break;
        }
    }

    char *dest_name = NULL;
    if (!input_dialog_run(panel_window(panel), "압축 해제",
                          "압축을 해제할 폴더 이름:", bname, &dest_name)) {
        g_free(bname);
        return;
    }
    g_free(bname);

    char *dest_dir = g_build_filename(pd->current_path, dest_name, NULL);

    ArchiveJob *job = g_new0(ArchiveJob, 1);
    job->panel = panel;
    job->archive_path = g_strdup(archive_path);
    job->dest_dir = dest_dir;
    job->dest_label = dest_name;

    GtkWindow *win = panel_window(panel);
    job->prog = progress_dialog_begin(win, "압축 해제 중");
    progress_dialog_thread_ctx_init(&job->pctx, job->prog, 0);

    suspend_all_watches(pd);
    g_thread_new("archive-extract", archive_extract_thread, job);
}
