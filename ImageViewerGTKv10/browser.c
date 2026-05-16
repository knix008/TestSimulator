#include "browser.h"
#include "preview.h"
#include "state.h"
#include "utils.h"

#include <gio/gio.h>
#include <glib.h>
#include <glib/gstdio.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

static int cmp_str(const void *a, const void *b) {
    return g_ascii_strcasecmp(*(const char *const *)a, *(const char *const *)b);
}

static const char *path_ext(const char *path) {
    const char *dot = strrchr(path, '.');
    return dot ? dot : "";
}

static void tree_add_dummy(GtkTreeIter *parent, GtkTreeStore *store) {
    GtkTreeIter dummy;
    gtk_tree_store_append(store, &dummy, parent);
    gtk_tree_store_set(store, &dummy,
                       TREE_COL_NAME, BROWSER_DUMMY,
                       TREE_COL_PATH, "",
                       -1);
}

static void tree_populate_children(App *app, GtkTreeIter *parent) {
    GtkTreeModel *model = GTK_TREE_MODEL(app->tree_store);
    GtkTreeIter child;
    if (!gtk_tree_model_iter_children(model, &child, parent)) {
        return;
    }
    gchar *name = NULL;
    gtk_tree_model_get(model, &child, TREE_COL_NAME, &name, -1);
    gboolean is_dummy = name && strcmp(name, BROWSER_DUMMY) == 0;
    g_free(name);
    if (!is_dummy) {
        return;
    }

    gchar *folder = NULL;
    gtk_tree_model_get(model, parent, TREE_COL_PATH, &folder, -1);
    if (!folder || !*folder) {
        g_free(folder);
        return;
    }

    gtk_tree_store_remove(app->tree_store, &child);

    GDir *dir = g_dir_open(folder, 0, NULL);
    if (!dir) {
        g_free(folder);
        return;
    }

    GPtrArray *dirs = g_ptr_array_new();
    const gchar *entry;
    while ((entry = g_dir_read_name(dir)) != NULL) {
        if (entry[0] == '.') {
            continue;
        }
        char *path = g_build_filename(folder, entry, NULL);
        if (g_file_test(path, G_FILE_TEST_IS_DIR)) {
            g_ptr_array_add(dirs, path);
        } else {
            g_free(path);
        }
    }
    g_dir_close(dir);
    g_ptr_array_sort(dirs, cmp_str);

    for (guint i = 0; i < dirs->len; i++) {
        const char *path = g_ptr_array_index(dirs, i);
        GtkTreeIter iter;
        const char *base = strrchr(path, G_DIR_SEPARATOR);
        base = base ? base + 1 : path;
        gtk_tree_store_append(app->tree_store, &iter, parent);
        gtk_tree_store_set(app->tree_store, &iter,
                           TREE_COL_NAME, base,
                           TREE_COL_PATH, path,
                           -1);
        if (utils_dir_has_subdirs(path)) {
            tree_add_dummy(&iter, app->tree_store);
        }
    }

    for (guint i = 0; i < dirs->len; i++) {
        g_free(g_ptr_array_index(dirs, i));
    }
    g_ptr_array_free(dirs, TRUE);
    g_free(folder);
}

static void on_tree_row_expanded(GtkTreeView *view, GtkTreeIter *iter, GtkTreePath *path, gpointer data) {
    (void)view;
    (void)path;
    App *app = data;
    tree_populate_children(app, iter);
}

static void on_tree_row_activated(GtkTreeView *view, GtkTreePath *path, GtkTreeViewColumn *col, gpointer data) {
    (void)view;
    (void)col;
    App *app = data;
    GtkTreeIter iter;
    if (!gtk_tree_model_get_iter(GTK_TREE_MODEL(app->tree_store), &iter, path)) {
        return;
    }
    gchar *folder = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->tree_store), &iter, TREE_COL_PATH, &folder, -1);
    if (folder && *folder) {
        app_set_folder(app, folder);
    }
    g_free(folder);
}

static void on_tree_cursor_changed(GtkTreeView *view, gpointer data) {
    App *app = data;
    GtkTreeSelection *sel = gtk_tree_view_get_selection(view);
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, NULL, &iter)) {
        return;
    }
    gchar *folder = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->tree_store), &iter, TREE_COL_PATH, &folder, -1);
    if (folder && *folder) {
        g_free(app->current_folder);
        app->current_folder = folder;
        gtk_entry_set_text(GTK_ENTRY(app->folder_entry), folder);
        state_save_last_folder(folder);
        browser_start_folder_watch(app);
        app_refresh_file_list(app, folder);
        preview_show_gallery(app, folder);
        app_update_status_dir(app, folder);
    } else {
        g_free(folder);
    }
}

static void on_file_selection_changed(GtkTreeSelection *sel, gpointer data) {
    App *app = data;
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, NULL, &iter)) {
        app_update_status_file(app, "파일을 선택하면 정보가 표시됩니다.");
        preview_show_placeholder(app, "폴더와 파일을 선택하면 여기에 표시됩니다.");
        return;
    }

    gchar *path = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->file_store), &iter, FILE_COL_PATH, &path, -1);
    if (!path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        g_free(path);
        return;
    }

    g_free(app->selected_file);
    app->selected_file = path;

    struct stat st;
    if (g_stat(path, &st) == 0) {
        char *sz = utils_format_file_size((int64_t)st.st_size);
        char *mt = utils_format_mtime(st.st_mtime);
        char *msg = g_strdup_printf("파일: %s | 크기: %s | 수정: %s | 형식: %s",
                                    g_path_get_basename(path), sz, mt,
                                    path_ext(path));
        app_update_status_file(app, msg);
        g_free(msg);
        g_free(sz);
        g_free(mt);
    }

    const char *ext = path_ext(path);
    if (utils_is_image_ext(ext)) {
        preview_show_image(app, path);
    } else if (utils_is_video_ext(ext)) {
        preview_show_video(app, path);
    } else {
        preview_show_placeholder(app, "이 형식은 미리보기를 지원하지 않습니다.");
    }
}

static void on_pick_folder(GtkButton *btn, gpointer data) {
    (void)btn;
    App *app = data;
    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "미리보기할 폴더를 선택하세요",
        GTK_WINDOW(app->window),
        GTK_FILE_CHOOSER_ACTION_SELECT_FOLDER,
        "_취소", GTK_RESPONSE_CANCEL,
        "_선택", GTK_RESPONSE_ACCEPT,
        NULL);
    gtk_file_chooser_set_local_only(GTK_FILE_CHOOSER(dlg), TRUE);
    if (app->current_folder) {
        gtk_file_chooser_set_filename(GTK_FILE_CHOOSER(dlg), app->current_folder);
    }
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char *folder = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        if (folder) {
            app_set_folder(app, folder);
            g_free(folder);
        }
    }
    gtk_widget_destroy(dlg);
}

void browser_init(App *app) {
    GtkCellRenderer *rend = gtk_cell_renderer_text_new();
    GtkTreeViewColumn *col = gtk_tree_view_column_new_with_attributes(
        "폴더", rend, "text", TREE_COL_NAME, NULL);
    gtk_tree_view_append_column(GTK_TREE_VIEW(app->tree_view), col);

    g_signal_connect(app->tree_view, "row-expanded", G_CALLBACK(on_tree_row_expanded), app);
    g_signal_connect(app->tree_view, "row-activated", G_CALLBACK(on_tree_row_activated), app);
    g_signal_connect(G_OBJECT(app->tree_view), "cursor-changed", G_CALLBACK(on_tree_cursor_changed), app);

    GtkCellRenderer *r_name = gtk_cell_renderer_text_new();
    GtkCellRenderer *r_size = gtk_cell_renderer_text_new();
    GtkCellRenderer *r_mod = gtk_cell_renderer_text_new();
    gtk_tree_view_insert_column_with_attributes(GTK_TREE_VIEW(app->file_view), -1,
                                                "이름", r_name, "text", FILE_COL_NAME, NULL);
    gtk_tree_view_insert_column_with_attributes(GTK_TREE_VIEW(app->file_view), -1,
                                                "크기", r_size, "text", FILE_COL_SIZE, NULL);
    gtk_tree_view_insert_column_with_attributes(GTK_TREE_VIEW(app->file_view), -1,
                                                "수정", r_mod, "text", FILE_COL_MODIFIED, NULL);

    GtkTreeSelection *fsel = gtk_tree_view_get_selection(GTK_TREE_VIEW(app->file_view));
    gtk_tree_selection_set_mode(fsel, GTK_SELECTION_SINGLE);
    g_signal_connect(fsel, "changed", G_CALLBACK(on_file_selection_changed), app);
}

void browser_load_root(App *app, const char *folder) {
    if (!folder || !g_file_test(folder, G_FILE_TEST_IS_DIR)) {
        return;
    }

    gtk_tree_store_clear(app->tree_store);
    GtkTreeIter root;
    const char *base = strrchr(folder, G_DIR_SEPARATOR);
    base = base ? base + 1 : folder;
    if (!*base) {
        base = folder;
    }
    gtk_tree_store_append(app->tree_store, &root, NULL);
    gtk_tree_store_set(app->tree_store, &root,
                       TREE_COL_NAME, base,
                       TREE_COL_PATH, folder,
                       -1);
    if (utils_dir_has_subdirs(folder)) {
        tree_add_dummy(&root, app->tree_store);
    }

    GtkTreePath *path = gtk_tree_model_get_path(GTK_TREE_MODEL(app->tree_store), &root);
    gtk_tree_view_expand_row(GTK_TREE_VIEW(app->tree_view), path, FALSE);
    tree_populate_children(app, &root);
    gtk_tree_selection_select_iter(
        gtk_tree_view_get_selection(GTK_TREE_VIEW(app->tree_view)), &root);
    gtk_tree_path_free(path);
}

void browser_select_folder_in_tree(App *app, const char *folder) {
    (void)app;
    (void)folder;
    /* Tree selection is set on load_root; deep search omitted for v1 */
}

void app_refresh_file_list(App *app, const char *folder) {
    gtk_list_store_clear(app->file_store);

    GDir *dir = g_dir_open(folder, 0, NULL);
    if (!dir) {
        return;
    }

    GPtrArray *files = g_ptr_array_new();
    const gchar *name;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (name[0] == '.') {
            continue;
        }
        char *path = g_build_filename(folder, name, NULL);
        if (!g_file_test(path, G_FILE_TEST_IS_REGULAR)) {
            g_free(path);
            continue;
        }
        const char *ext = path_ext(path);
        if (!utils_is_previewable_ext(ext)) {
            g_free(path);
            continue;
        }
        g_ptr_array_add(files, path);
    }
    g_dir_close(dir);
    g_ptr_array_sort(files, cmp_str);

    for (guint i = 0; i < files->len; i++) {
        const char *path = g_ptr_array_index(files, i);
        struct stat st;
        if (g_stat(path, &st) != 0) {
            continue;
        }
        char *sz = utils_format_file_size((int64_t)st.st_size);
        char *mt = utils_format_mtime(st.st_mtime);
        GtkTreeIter iter;
        gtk_list_store_append(app->file_store, &iter);
        gtk_list_store_set(app->file_store, &iter,
                           FILE_COL_NAME, g_path_get_basename(path),
                           FILE_COL_SIZE, sz,
                           FILE_COL_MODIFIED, mt,
                           FILE_COL_PATH, path,
                           -1);
        g_free(sz);
        g_free(mt);
    }

    for (guint i = 0; i < files->len; i++) {
        g_free(g_ptr_array_index(files, i));
    }
    g_ptr_array_free(files, TRUE);
}

void app_update_status_dir(App *app, const char *folder) {
    int subdirs = 0;
    int previewable = 0;
    GDir *dir = g_dir_open(folder, 0, NULL);
    if (dir) {
        const gchar *name;
        while ((name = g_dir_read_name(dir)) != NULL) {
            if (name[0] == '.') {
                continue;
            }
            char *path = g_build_filename(folder, name, NULL);
            if (g_file_test(path, G_FILE_TEST_IS_DIR)) {
                subdirs++;
            } else if (g_file_test(path, G_FILE_TEST_IS_REGULAR)) {
                const char *ext = path_ext(path);
                if (utils_is_previewable_ext(ext)) {
                    previewable++;
                }
            }
            g_free(path);
        }
        g_dir_close(dir);
    }
    char *msg = g_strdup_printf(
        "디렉토리: %s | 하위 폴더: %d개 | 미리보기 파일: %d개",
        folder, subdirs, previewable);
    gtk_label_set_text(GTK_LABEL(app->status_dir), msg);
    g_free(msg);
}

void app_update_status_file(App *app, const char *message) {
    gtk_label_set_text(GTK_LABEL(app->status_file), message);
}

/* pick-folder button callback exported via app.c wiring */
void browser_connect_pick_button(App *app, GtkWidget *btn) {
    g_signal_connect(btn, "clicked", G_CALLBACK(on_pick_folder), app);
}

static void tree_clear_children(GtkTreeStore *store, GtkTreeIter *parent) {
    GtkTreeIter child;
    while (gtk_tree_model_iter_children(GTK_TREE_MODEL(store), &child, parent)) {
        gtk_tree_store_remove(store, &child);
    }
}

static void tree_force_refresh_children(App *app, GtkTreeIter *parent) {
    gchar *folder = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->tree_store), parent,
                       TREE_COL_PATH, &folder, -1);
    if (!folder || !*folder) {
        g_free(folder);
        return;
    }

    gboolean was_expanded = gtk_tree_view_row_expanded(
        GTK_TREE_VIEW(app->tree_view),
        gtk_tree_model_get_path(GTK_TREE_MODEL(app->tree_store), parent));

    tree_clear_children(app->tree_store, parent);
    if (utils_dir_has_subdirs(folder)) {
        tree_add_dummy(parent, app->tree_store);
        tree_populate_children(app, parent);
        if (was_expanded) {
            GtkTreePath *tp = gtk_tree_model_get_path(
                GTK_TREE_MODEL(app->tree_store), parent);
            gtk_tree_view_expand_row(GTK_TREE_VIEW(app->tree_view), tp, FALSE);
            gtk_tree_path_free(tp);
        }
    }
    g_free(folder);
}

static void browser_revalidate_file_selection(App *app) {
    GtkTreeSelection *fsel = gtk_tree_view_get_selection(
        GTK_TREE_VIEW(app->file_view));
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(fsel, NULL, &iter)) {
        return;
    }

    gchar *path = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->file_store), &iter,
                       FILE_COL_PATH, &path, -1);
    if (!path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        gtk_tree_selection_unselect_all(fsel);
        g_free(app->selected_file);
        app->selected_file = NULL;
        preview_show_placeholder(app, "파일을 선택하면 정보가 표시됩니다.");
        app_update_status_file(app, "파일을 선택하면 정보가 표시됩니다.");
    }
    g_free(path);
}

void browser_refresh_folder_view(App *app) {
    if (!app->current_folder) {
        return;
    }

    app_refresh_file_list(app, app->current_folder);
    app_update_status_dir(app, app->current_folder);

    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(app->tree_view));
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, NULL, &iter)) {
        return;
    }

    gchar *folder = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->tree_store), &iter,
                       TREE_COL_PATH, &folder, -1);
    if (!folder || g_ascii_strcasecmp(folder, app->current_folder) != 0) {
        g_free(folder);
        return;
    }
    g_free(folder);

    tree_force_refresh_children(app, &iter);
}

void browser_refresh_views(App *app) {
    if (!app->current_folder) {
        return;
    }
    browser_refresh_folder_view(app);
    preview_show_gallery(app, app->current_folder);
    browser_revalidate_file_selection(app);
}

static gboolean folder_refresh_debounce(gpointer data) {
    App *app = data;
    app->folder_refresh_pending = 0;
    browser_refresh_views(app);
    return G_SOURCE_REMOVE;
}

static void schedule_folder_refresh(App *app) {
    if (app->folder_refresh_pending) {
        g_source_remove(app->folder_refresh_pending);
    }
    app->folder_refresh_pending = g_timeout_add(300, folder_refresh_debounce, app);
}

static void on_folder_changed(GFileMonitor *monitor,
                              GFile *file,
                              GFile *other_file,
                              GFileMonitorEvent event_type,
                              gpointer data) {
    (void)monitor;
    (void)file;
    (void)other_file;
    App *app = data;

    switch (event_type) {
    case G_FILE_MONITOR_EVENT_CREATED:
    case G_FILE_MONITOR_EVENT_DELETED:
    case G_FILE_MONITOR_EVENT_MOVED_IN:
    case G_FILE_MONITOR_EVENT_MOVED_OUT:
    case G_FILE_MONITOR_EVENT_RENAMED:
    case G_FILE_MONITOR_EVENT_CHANGES_DONE_HINT:
        schedule_folder_refresh(app);
        break;
    default:
        break;
    }
}

void browser_stop_folder_watch(App *app) {
    if (app->folder_refresh_pending) {
        g_source_remove(app->folder_refresh_pending);
        app->folder_refresh_pending = 0;
    }
    if (app->folder_monitor) {
        g_object_unref(app->folder_monitor);
        app->folder_monitor = NULL;
    }
}

void browser_start_folder_watch(App *app) {
    browser_stop_folder_watch(app);
    if (!app->current_folder || !g_file_test(app->current_folder, G_FILE_TEST_IS_DIR)) {
        return;
    }

    GError *err = NULL;
    GFile *gf = g_file_new_for_path(app->current_folder);
    app->folder_monitor = g_file_monitor_directory(
        gf, G_FILE_MONITOR_WATCH_MOVES, NULL, &err);
    g_object_unref(gf);

    if (app->folder_monitor) {
        g_signal_connect(app->folder_monitor, "changed",
                         G_CALLBACK(on_folder_changed), app);
    } else if (err) {
        g_warning("폴더 감시를 시작할 수 없습니다: %s", err->message);
        g_clear_error(&err);
    }
}
