#include "file_panel.h"

#include "file_entry.h"
#include "file_ops.h"
#include "folder_tree_panel.h"
#include "input_dialog.h"

#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

#define COL_NAME 0
#define COL_SIZE 1
#define COL_TYPE 2
#define COL_DATE 3
#define N_COLS 4

typedef struct {
    FilePanelSide side;
    gpointer main_window;
    char *current_path;
    char *side_title;

    GtkWidget *container;
    GtkWidget *path_bar;
    GtkWidget *header_label;
    GtkWidget *chevron_label;
    GtkWidget *folder_tree;
    GtkWidget *drive_bar;
    GtkWidget *tree_view;
    GtkListStore *store;
    GtkWidget *status_label;

    FilePanelVoidFn on_focus;
    FilePanelPathFn on_path_changed;
    FilePanelPathsFn on_selection_changed;
    FilePanelVoidFn on_copy_to_other;
    FilePanelVoidFn on_move_to_other;
    gpointer callback_data;

    int sort_column;
    GtkSortType sort_order;
} FilePanelData;

static FilePanelData *panel_data(GtkWidget *panel) {
    return g_object_get_data(G_OBJECT(panel), "file-panel-data");
}

static void set_status(FilePanelData *pd, const char *msg) {
    gtk_label_set_text(GTK_LABEL(pd->status_label), msg);
}

static int sort_compare(GtkTreeModel *model, GtkTreeIter *a, GtkTreeIter *b, gpointer data) {
    FilePanelData *pd = data;
    gchar *na = NULL, *nb = NULL;
    gtk_tree_model_get(model, a, COL_NAME, &na, -1);
    gtk_tree_model_get(model, b, COL_NAME, &nb, -1);

    if (na && strcmp(na, "..") == 0) { g_free(na); g_free(nb); return -1; }
    if (nb && strcmp(nb, "..") == 0) { g_free(na); g_free(nb); return 1; }

    FileEntry *ea = NULL, *eb = NULL;
    gtk_tree_model_get(model, a, -1, &ea, -1);
    gtk_tree_model_get(model, b, -1, &eb, -1);
    if (ea && ea->is_directory && eb && !eb->is_directory) { g_free(na); g_free(nb); return -1; }
    if (ea && !ea->is_directory && eb && eb->is_directory) { g_free(na); g_free(nb); return 1; }

    gchar *va = NULL, *vb = NULL;
    gtk_tree_model_get(model, a, pd->sort_column, &va, -1);
    gtk_tree_model_get(model, b, pd->sort_column, &vb, -1);
    int cmp = g_ascii_strcasecmp(va ? va : "", vb ? vb : "");
    g_free(va);
    g_free(vb);
    g_free(na);
    g_free(nb);
    return pd->sort_order == GTK_SORT_ASCENDING ? cmp : -cmp;
}

static void update_status_counts(FilePanelData *pd) {
    int dir_count = 0, file_count = 0;
    int64_t total = 0;
    GtkTreeIter iter;
    gboolean valid = gtk_tree_model_get_iter_first(GTK_TREE_MODEL(pd->store), &iter);
    while (valid) {
        FileEntry *entry = NULL;
        gtk_tree_model_get(GTK_TREE_MODEL(pd->store), &iter, -1, &entry, -1);
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
                           COL_NAME, "..", COL_SIZE, "", COL_TYPE, "폴더",
                           COL_DATE, "", -1);
        gtk_list_store_set(pd->store, &iter, -1, up, -1);
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
        GtkTreeIter iter;
        gtk_list_store_append(pd->store, &iter);
        gtk_list_store_set(pd->store, &iter,
                           COL_NAME, entry->name, COL_SIZE, "<DIR>",
                           COL_TYPE, "폴더", COL_DATE, date, -1);
        gtk_list_store_set(pd->store, &iter, -1, entry, -1);
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
        GtkTreeIter iter;
        gtk_list_store_append(pd->store, &iter);
        gtk_list_store_set(pd->store, &iter,
                           COL_NAME, entry->name, COL_SIZE, size_d,
                           COL_TYPE, type_d, COL_DATE, date, -1);
        gtk_list_store_set(pd->store, &iter, -1, entry, -1);
        g_free(size_d);
        g_free(type_d);
    }

    g_ptr_array_free(dirs, TRUE);
    g_ptr_array_free(files, TRUE);
    update_status_counts(pd);
}

static void update_path_display(FilePanelData *pd) {
    char *text = g_strdup_printf("%s  ·  %s", pd->side_title, pd->current_path);
    gtk_label_set_text(GTK_LABEL(pd->header_label), text);
    g_free(text);
}

static void on_folder_selected(const char *path, gpointer user_data) {
    file_panel_navigate(GTK_WIDGET(user_data), path);
}

static void on_path_bar_clicked(GtkWidget *w, gpointer data) {
    (void)w;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    if (!pd) return;
    if (folder_tree_panel_is_open(pd->folder_tree)) {
        folder_tree_panel_collapse(pd->folder_tree);
        gtk_label_set_text(GTK_LABEL(pd->chevron_label), "▾");
    } else {
        folder_tree_panel_toggle(pd->folder_tree, pd->current_path);
        gtk_label_set_text(GTK_LABEL(pd->chevron_label), "▴");
    }
}

static void on_drive_clicked(GtkButton *btn, gpointer path) {
    GtkWidget *panel = GTK_WIDGET(g_object_get_data(G_OBJECT(btn), "panel"));
    file_panel_navigate(panel, (const char *)path);
}

static void populate_drive_bar(FilePanelData *pd) {
    GList *children = gtk_container_get_children(GTK_CONTAINER(pd->drive_bar));
    for (GList *l = children; l; l = l->next) gtk_widget_destroy(GTK_WIDGET(l->data));
    g_list_free(children);

    const char *quick[] = { "/", g_get_home_dir(), "/tmp", NULL };
    for (int i = 0; quick[i]; i++) {
        if (!g_file_test(quick[i], G_FILE_TEST_IS_DIR)) continue;
        const char *label = quick[i];
        if (g_strcmp0(quick[i], g_get_home_dir()) == 0) label = "홈";
        GtkWidget *btn = gtk_button_new_with_label(label);
        char *path = g_strdup(quick[i]);
        g_object_set_data_full(G_OBJECT(btn), "nav-path", path, g_free);
        g_object_set_data(G_OBJECT(btn), "panel", pd->container);
        g_signal_connect(btn, "clicked", G_CALLBACK(on_drive_clicked), path);
        gtk_box_pack_start(GTK_BOX(pd->drive_bar), btn, FALSE, FALSE, 4);
    }
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
        gtk_tree_model_get(model, &it, -1, &entry, -1);
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
    GtkTreeIter iter;
    int sel_dirs = 0, sel_files = 0;
    int64_t sel_size = 0;

    if (gtk_tree_selection_get_selected(selection, &model, &iter)) {
        GList *rows = gtk_tree_selection_get_selected_rows(selection, &model);
        for (GList *l = rows; l; l = l->next) {
            GtkTreeIter it;
            gtk_tree_model_get_iter(model, &it, (GtkTreePath *)l->data);
            FileEntry *entry = NULL;
            gtk_tree_model_get(model, &it, -1, &entry, -1);
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

static void open_file(const char *path) {
    char *uri = g_filename_to_uri(path, NULL, NULL);
    if (uri) {
        gtk_show_uri_on_window(NULL, uri, GDK_CURRENT_TIME, NULL);
        g_free(uri);
    }
}

static void on_row_activated(GtkTreeView *view, GtkTreePath *path,
                             GtkTreeViewColumn *col, gpointer data) {
    (void)view;
    (void)col;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    GtkTreeIter iter;
    if (!gtk_tree_model_get_iter(GTK_TREE_MODEL(pd->store), &iter, path)) return;
    FileEntry *entry = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(pd->store), &iter, -1, &entry, -1);
    if (!entry) return;
    if (entry->is_directory)
        file_panel_navigate(GTK_WIDGET(data), entry->full_path);
    else
        open_file(entry->full_path);
}

static void on_column_clicked(GtkTreeViewColumn *column, gpointer data) {
    FilePanelData *pd = data;
    GList *cols = gtk_tree_view_get_columns(GTK_TREE_VIEW(pd->tree_view));
    int index = 0;
    for (GList *l = cols; l; l = l->next, index++) {
        if (l->data == column) break;
    }
    g_list_free(cols);
    if (pd->sort_column == index)
        pd->sort_order = pd->sort_order == GTK_SORT_ASCENDING
                             ? GTK_SORT_DESCENDING
                             : GTK_SORT_ASCENDING;
    else {
        pd->sort_column = index;
        pd->sort_order = GTK_SORT_ASCENDING;
    }
    gtk_tree_sortable_set_sort_func(GTK_TREE_SORTABLE(pd->store),
                                    pd->sort_column, sort_compare, pd, NULL);
    gtk_tree_sortable_set_sort_column_id(GTK_TREE_SORTABLE(pd->store),
                                         pd->sort_column, pd->sort_order);
}

static gboolean on_button_press(GtkWidget *w, GdkEventButton *e, gpointer menu) {
    if (e->button == 3) {
        gtk_menu_popup_at_pointer(GTK_MENU(menu), (GdkEvent *)e);
        return TRUE;
    }
    (void)w;
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
        if (gtk_tree_selection_get_selected(sel, &model, &iter)) {
            FileEntry *entry = NULL;
            gtk_tree_model_get(model, &iter, -1, &entry, -1);
            if (entry) {
                if (entry->is_directory)
                    file_panel_navigate(GTK_WIDGET(data), entry->full_path);
                else
                    open_file(entry->full_path);
            }
        }
        return TRUE;
    }
    if (key == GDK_KEY_BackSpace) {
        char *parent = g_path_get_dirname(pd->current_path);
        if (strcmp(parent, pd->current_path) != 0)
            file_panel_navigate(GTK_WIDGET(data), parent);
        g_free(parent);
        return TRUE;
    }
    if (key == GDK_KEY_F5) { file_panel_refresh(GTK_WIDGET(data)); return TRUE; }
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

static void on_focus_in(GtkWidget *w, GdkEventFocus *e, gpointer data) {
    (void)w;
    (void)e;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    if (pd && pd->on_focus)
        pd->on_focus(pd->container, pd->callback_data);
}

/* Context menu callbacks */
static void ctx_open(GtkMenuItem *item, gpointer data) {
    (void)item;
    GtkTreeSelection *sel = gtk_tree_view_get_selection(
        GTK_TREE_VIEW(panel_data(GTK_WIDGET(data))->tree_view));
    GtkTreeModel *model;
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, &model, &iter)) return;
    FileEntry *entry = NULL;
    gtk_tree_model_get(model, &iter, -1, &entry, -1);
    if (!entry) return;
    if (entry->is_directory)
        file_panel_navigate(GTK_WIDGET(data), entry->full_path);
    else
        open_file(entry->full_path);
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

static void ctx_properties(GtkMenuItem *item, gpointer data) {
    (void)item;
    FilePanelData *pd = panel_data(GTK_WIDGET(data));
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view));
    GtkTreeModel *model;
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, &model, &iter)) return;
    FileEntry *entry = NULL;
    gtk_tree_model_get(model, &iter, -1, &entry, -1);
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
    GtkWidget *dlg = gtk_message_dialog_new(NULL, GTK_DIALOG_MODAL,
        GTK_MESSAGE_INFO, GTK_BUTTONS_OK, "%s", msg);
    gtk_window_set_title(GTK_WINDOW(dlg), "속성");
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
    g_free(msg);
    (void)info;
}

static GtkWidget *build_context_menu(GtkWidget *panel) {
    GtkWidget *menu = gtk_menu_new();
    struct { const char *label; GCallback cb; } items[] = {
        { "열기", G_CALLBACK(ctx_open) },
        { "→ 다른 패널로 복사", G_CALLBACK(ctx_copy_other) },
        { "→ 다른 패널로 이동", G_CALLBACK(ctx_move_other) },
        { NULL, NULL },
        { "복사", G_CALLBACK(ctx_clip_copy) },
        { "붙여넣기", G_CALLBACK(ctx_clip_paste) },
        { NULL, NULL },
        { "이름 바꾸기", G_CALLBACK(ctx_rename) },
        { "삭제", G_CALLBACK(ctx_delete) },
        { NULL, NULL },
        { "새 폴더 만들기", G_CALLBACK(ctx_new_folder) },
        { "새 파일 만들기", G_CALLBACK(ctx_new_file) },
        { NULL, NULL },
        { "속성", G_CALLBACK(ctx_properties) },
    };
    for (guint i = 0; i < G_N_ELEMENTS(items); i++) {
        GtkWidget *item;
        if (!items[i].label)
            item = gtk_separator_menu_item_new();
        else
            item = gtk_menu_item_new_with_label(items[i].label);
        gtk_menu_shell_append(GTK_MENU_SHELL(menu), item);
        if (items[i].cb)
            g_signal_connect(item, "activate", items[i].cb, panel);
    }
    return menu;
}

GtkWidget *file_panel_new(FilePanelSide side, gpointer main_window) {
    FilePanelData *pd = g_new0(FilePanelData, 1);
    pd->side = side;
    pd->main_window = main_window;
    pd->side_title = g_strdup(side == FILE_PANEL_LEFT ? "왼쪽" : "오른쪽");
    pd->current_path = g_strdup(g_get_home_dir());
    pd->sort_column = COL_NAME;
    pd->sort_order = GTK_SORT_ASCENDING;

    pd->container = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);

    pd->path_bar = gtk_event_box_new();
    GtkWidget *path_inner = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_container_add(GTK_CONTAINER(pd->path_bar), path_inner);
    gtk_widget_set_margin_start(path_inner, 8);
    gtk_widget_set_margin_end(path_inner, 8);

    pd->header_label = gtk_label_new(pd->side_title);
    gtk_label_set_xalign(GTK_LABEL(pd->header_label), 0.0);
    gtk_label_set_ellipsize(GTK_LABEL(pd->header_label), PANGO_ELLIPSIZE_MIDDLE);
    gtk_box_pack_start(GTK_BOX(path_inner), pd->header_label, TRUE, TRUE, 0);

    pd->chevron_label = gtk_label_new("▾");
    gtk_box_pack_end(GTK_BOX(path_inner), pd->chevron_label, FALSE, FALSE, 0);

    g_signal_connect(pd->path_bar, "button-press-event",
                     G_CALLBACK(on_path_bar_clicked), pd->container);

    pd->folder_tree = folder_tree_panel_new(on_folder_selected, pd->container);

    pd->drive_bar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_widget_set_margin_start(pd->drive_bar, 6);
    gtk_widget_set_margin_end(pd->drive_bar, 6);

    pd->store = gtk_list_store_new(5, G_TYPE_STRING, G_TYPE_STRING,
                                   G_TYPE_STRING, G_TYPE_STRING, G_TYPE_POINTER);
    pd->tree_view = gtk_tree_view_new_with_model(GTK_TREE_MODEL(pd->store));
    gtk_tree_view_set_headers_visible(GTK_TREE_VIEW(pd->tree_view), TRUE);
    gtk_tree_selection_set_mode(gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view)),
                                GTK_SELECTION_MULTIPLE);

    const char *titles[] = { "이름", "크기", "종류", "수정된 날짜" };
    for (int i = 0; i < N_COLS; i++) {
        GtkCellRenderer *renderer = gtk_cell_renderer_text_new();
        GtkTreeViewColumn *col = gtk_tree_view_column_new_with_attributes(
            titles[i], renderer, "text", i, NULL);
        if (i == COL_SIZE)
            gtk_tree_view_column_set_alignment(col, 1.0);
        gtk_tree_view_append_column(GTK_TREE_VIEW(pd->tree_view), col);
        g_signal_connect(col, "clicked", G_CALLBACK(on_column_clicked), pd);
    }

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(scroll), pd->tree_view);

    pd->status_label = gtk_label_new("준비");
    gtk_label_set_xalign(GTK_LABEL(pd->status_label), 0.0);
    gtk_widget_set_margin_start(pd->status_label, 8);

    GtkWidget *ctx = build_context_menu(pd->container);
    gtk_widget_add_events(pd->tree_view, GDK_BUTTON_PRESS_MASK);
    g_signal_connect(pd->tree_view, "button-press-event",
                     G_CALLBACK(on_button_press), ctx);

    gtk_box_pack_start(GTK_BOX(pd->container), pd->path_bar, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(pd->container), pd->folder_tree, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(pd->container), pd->drive_bar, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(pd->container), scroll, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(pd->container), pd->status_label, FALSE, FALSE, 4);

    g_signal_connect(pd->tree_view, "row-activated", G_CALLBACK(on_row_activated), pd->container);
    g_signal_connect(gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view)),
                     "changed", G_CALLBACK(on_selection_changed), pd->container);
    g_signal_connect(pd->tree_view, "key-press-event", G_CALLBACK(on_key_press), pd->container);
    g_signal_connect(pd->tree_view, "focus-in-event", G_CALLBACK(on_focus_in), pd->container);

    gtk_tree_sortable_set_default_sort_func(GTK_TREE_SORTABLE(pd->store),
                                            sort_compare, pd, NULL);
    gtk_tree_sortable_set_sort_column_id(GTK_TREE_SORTABLE(pd->store),
                                         COL_NAME, GTK_SORT_ASCENDING);

    g_object_set_data_full(G_OBJECT(pd->container), "file-panel-data", pd, g_free);
    populate_drive_bar(pd);
    update_path_display(pd);
    load_directory(pd);
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
    load_directory(pd);
}

const char *file_panel_get_current_path(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    return pd ? pd->current_path : NULL;
}

void file_panel_navigate(GtkWidget *panel, const char *path) {
    FilePanelData *pd = panel_data(panel);
    if (!pd || !path || !g_file_test(path, G_FILE_TEST_IS_DIR)) return;
    folder_tree_panel_collapse(pd->folder_tree);
    gtk_label_set_text(GTK_LABEL(pd->chevron_label), "▾");
    g_free(pd->current_path);
    pd->current_path = g_strdup(path);
    update_path_display(pd);
    load_directory(pd);
    if (pd->on_path_changed)
        pd->on_path_changed(panel, path, pd->callback_data);
}

void file_panel_refresh(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (pd) load_directory(pd);
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
    if (!input_dialog_run(NULL, "새 폴더 만들기", "폴더 이름:", "새 폴더", &text)) return;
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
    if (!input_dialog_run(NULL, "새 파일 만들기", "파일 이름:", "새 파일.txt", &text)) return;
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

static void show_error(const char *msg) {
    GtkWidget *dlg = gtk_message_dialog_new(NULL, GTK_DIALOG_MODAL,
        GTK_MESSAGE_ERROR, GTK_BUTTONS_OK, "%s", msg);
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
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
        ? g_strdup_printf("'%s'을(를) 삭제하시겠습니까?",
                          g_path_get_basename(g_ptr_array_index(paths, 0)))
        : g_strdup_printf("선택한 %u개 항목을 삭제하시겠습니까?", paths->len);
    GtkWidget *dlg = gtk_message_dialog_new(NULL, GTK_DIALOG_MODAL,
        GTK_MESSAGE_WARNING, GTK_BUTTONS_YES_NO, "%s", msg);
    g_free(msg);
    int resp = gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
    if (resp == GTK_RESPONSE_YES) {
        GError *err = NULL;
        if (file_ops_delete_files(paths, &err)) {
            file_panel_refresh(panel);
            char *s = g_strdup_printf("%u개 항목을 삭제했습니다.", paths->len);
            set_status(pd, s);
            g_free(s);
        } else {
            show_error(err ? err->message : "삭제 실패");
            g_clear_error(&err);
        }
    }
    g_ptr_array_free(paths, TRUE);
}

void file_panel_begin_rename(GtkWidget *panel) {
    FilePanelData *pd = panel_data(panel);
    if (!pd) return;
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(pd->tree_view));
    GtkTreeModel *model;
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, &model, &iter)) return;
    FileEntry *entry = NULL;
    gtk_tree_model_get(model, &iter, -1, &entry, -1);
    if (!entry || strcmp(entry->name, "..") == 0) return;

    char *text = NULL;
    if (!input_dialog_run(NULL, "이름 바꾸기", "새 이름:", entry->name, &text)) return;
    char *new_path = g_build_filename(pd->current_path, text, NULL);
    if (rename(entry->full_path, new_path) == 0) {
        file_panel_refresh(panel);
        char *msg = g_strdup_printf("이름을 '%s'로 변경했습니다.", text);
        set_status(pd, msg);
        g_free(msg);
    } else {
        show_error("이름 바꾸기 실패");
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
    GError *err = NULL;
    if (file_ops_copy_files(paths, pd->current_path, NULL, NULL, &err)) {
        file_panel_refresh(panel);
        char *msg = g_strdup_printf("%u개 항목을 붙여넣었습니다.", paths->len);
        set_status(pd, msg);
        g_free(msg);
    } else {
        show_error(err ? err->message : "붙여넣기 실패");
        g_clear_error(&err);
    }
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
