#include "folder_tree_panel.h"

#define PLACEHOLDER "..."

typedef struct {
    GtkWidget *container;
    GtkWidget *tree_view;
    GtkTreeStore *store;
    FolderTreeSelectFn callback;
    gpointer user_data;
    gboolean suppress_select;
} FolderTreeData;

static void load_children(GtkTreeStore *store, GtkTreeIter *parent, const char *path) {
    GError *err = NULL;
    GDir *dir = g_dir_open(path, 0, &err);
    if (!dir) return;

    const gchar *name;
    GPtrArray *names = g_ptr_array_new();
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (name[0] == '.') continue;
        char *full = g_build_filename(path, name, NULL);
        if (g_file_test(full, G_FILE_TEST_IS_DIR))
            g_ptr_array_add(names, g_strdup(name));
        g_free(full);
    }
    g_dir_close(dir);
    g_ptr_array_sort(names, (GCompareFunc)g_strcmp0);

    for (guint i = 0; i < names->len; i++) {
        const char *child_name = g_ptr_array_index(names, i);
        char *full = g_build_filename(path, child_name, NULL);
        GtkTreeIter child;
        gtk_tree_store_append(store, &child, parent);
        gtk_tree_store_set(store, &child,
                           0, child_name,
                           1, full,
                           2, TRUE,
                           -1);
        GtkTreeIter placeholder;
        gtk_tree_store_append(store, &placeholder, &child);
        gtk_tree_store_set(store, &placeholder, 0, PLACEHOLDER, 1, "", 2, FALSE, -1);
        g_free(full);
    }
    for (guint i = 0; i < names->len; i++)
        g_free(g_ptr_array_index(names, i));
    g_ptr_array_free(names, TRUE);
}

static void on_row_expanded(GtkTreeView *view, GtkTreeIter *iter, GtkTreePath *path, gpointer data) {
    (void)view;
    (void)path;
    FolderTreeData *ft = data;
    GtkTreeModel *model = GTK_TREE_MODEL(ft->store);

    if (!gtk_tree_model_iter_has_child(model, iter)) return;

    GtkTreeIter child;
    gtk_tree_model_iter_children(model, &child, iter);
    gchar *name = NULL;
    gtk_tree_model_get(model, &child, 0, &name, -1);
    if (!name || strcmp(name, PLACEHOLDER) != 0) {
        g_free(name);
        return;
    }
    g_free(name);
    gtk_tree_store_remove(ft->store, &child);

    gchar *dir_path = NULL;
    gtk_tree_model_get(model, iter, 1, &dir_path, -1);
    if (dir_path && *dir_path) load_children(ft->store, iter, dir_path);
    g_free(dir_path);
}

static void select_folder(FolderTreeData *ft, const char *path) {
    if (ft->callback) ft->callback(path, ft->user_data);
    folder_tree_panel_collapse(ft->container);
}

static void on_row_activated(GtkTreeView *view, GtkTreePath *path,
                             GtkTreeViewColumn *col, gpointer data) {
    (void)view;
    (void)col;
    FolderTreeData *ft = data;
    GtkTreeIter iter;
    if (!gtk_tree_model_get_iter(GTK_TREE_MODEL(ft->store), &iter, path)) return;
    gchar *dir_path = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(ft->store), &iter, 1, &dir_path, -1);
    if (dir_path && *dir_path && g_file_test(dir_path, G_FILE_TEST_IS_DIR))
        select_folder(ft, dir_path);
    g_free(dir_path);
}

static gboolean on_row_selected(GtkWidget *widget, GdkEvent *event, gpointer data) {
    (void)widget;
    (void)event;
    FolderTreeData *ft = data;
    if (ft->suppress_select) return FALSE;

    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(ft->tree_view));
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, NULL, &iter)) return FALSE;

    gchar *dir_path = NULL;
    gboolean is_dir = FALSE;
    gtk_tree_model_get(GTK_TREE_MODEL(ft->store), &iter, 1, &dir_path, 2, &is_dir, -1);
    if (is_dir && dir_path && *dir_path && g_file_test(dir_path, G_FILE_TEST_IS_DIR))
        select_folder(ft, dir_path);
    g_free(dir_path);
    return FALSE;
}

GtkWidget *folder_tree_panel_new(FolderTreeSelectFn callback, gpointer user_data) {
    FolderTreeData *ft = g_new0(FolderTreeData, 1);
    ft->callback = callback;
    ft->user_data = user_data;

    ft->container = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_widget_set_no_show_all(ft->container, TRUE);
    gtk_widget_hide(ft->container);

    ft->store = gtk_tree_store_new(3, G_TYPE_STRING, G_TYPE_STRING, G_TYPE_BOOLEAN);
    ft->tree_view = gtk_tree_view_new_with_model(GTK_TREE_MODEL(ft->store));
    gtk_tree_view_set_headers_visible(GTK_TREE_VIEW(ft->tree_view), FALSE);
    gtk_tree_view_set_show_expanders(GTK_TREE_VIEW(ft->tree_view), TRUE);

    GtkCellRenderer *renderer = gtk_cell_renderer_text_new();
    gtk_tree_view_insert_column_with_attributes(GTK_TREE_VIEW(ft->tree_view), -1,
                                                "이름", renderer, "text", 0, NULL);

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_size_request(scroll, -1, 240);
    gtk_container_add(GTK_CONTAINER(scroll), ft->tree_view);
    gtk_box_pack_start(GTK_BOX(ft->container), scroll, TRUE, TRUE, 0);

    g_signal_connect(ft->tree_view, "row-expanded", G_CALLBACK(on_row_expanded), ft);
    g_signal_connect(ft->tree_view, "row-activated", G_CALLBACK(on_row_activated), ft);
    g_signal_connect(ft->tree_view, "button-release-event", G_CALLBACK(on_row_selected), ft);

    g_object_set_data_full(G_OBJECT(ft->container), "folder-tree-data", ft, g_free);
    return ft->container;
}

static void load_root_drives(FolderTreeData *ft) {
    gtk_tree_store_clear(ft->store);
    const char *roots[] = { "/", g_get_home_dir(), "/tmp", NULL };
    for (int i = 0; roots[i]; i++) {
        if (!g_file_test(roots[i], G_FILE_TEST_IS_DIR)) continue;
        GtkTreeIter iter;
        gtk_tree_store_append(ft->store, &iter, NULL);
        const char *label = roots[i];
        if (strcmp(roots[i], g_get_home_dir()) == 0) label = "홈";
        gtk_tree_store_set(ft->store, &iter,
                           0, label,
                           1, roots[i],
                           2, TRUE,
                           -1);
        GtkTreeIter ph;
        gtk_tree_store_append(ft->store, &ph, &iter);
        gtk_tree_store_set(ft->store, &ph, 0, PLACEHOLDER, 1, "", 2, FALSE, -1);
    }

    GVolumeMonitor *mon = g_volume_monitor_get();
    GList *vols = g_volume_monitor_get_mounts(mon);
    for (GList *l = vols; l; l = l->next) {
        GMount *mount = G_MOUNT(l->data);
        GFile *root = g_mount_get_root(mount);
        if (!root) continue;
        char *path = g_file_get_path(root);
        if (!path || !g_file_test(path, G_FILE_TEST_IS_DIR)) {
            g_free(path);
            g_object_unref(root);
            continue;
        }
        char *name = g_file_get_parse_name(root);
        GtkTreeIter iter;
        gtk_tree_store_append(ft->store, &iter, NULL);
        gtk_tree_store_set(ft->store, &iter, 0, name ? name : path, 1, path, 2, TRUE, -1);
        GtkTreeIter ph;
        gtk_tree_store_append(ft->store, &ph, &iter);
        gtk_tree_store_set(ft->store, &ph, 0, PLACEHOLDER, 1, "", 2, FALSE, -1);
        g_free(path);
        g_free(name);
        g_object_unref(root);
    }
    g_list_free_full(vols, g_object_unref);
}

void folder_tree_panel_toggle(GtkWidget *panel, const char *current_path) {
    FolderTreeData *ft = g_object_get_data(G_OBJECT(panel), "folder-tree-data");
    if (!ft) return;

    if (folder_tree_panel_is_open(panel)) {
        folder_tree_panel_collapse(panel);
        return;
    }

    ft->suppress_select = TRUE;
    load_root_drives(ft);
    gtk_widget_show_all(ft->container);
    ft->suppress_select = FALSE;
    (void)current_path;
}

void folder_tree_panel_collapse(GtkWidget *panel) {
    FolderTreeData *ft = g_object_get_data(G_OBJECT(panel), "folder-tree-data");
    if (!ft) return;
    gtk_widget_hide(ft->container);
    gtk_tree_store_clear(ft->store);
}

gboolean folder_tree_panel_is_open(GtkWidget *panel) {
    return gtk_widget_get_visible(panel);
}
