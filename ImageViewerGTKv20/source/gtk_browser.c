#include "gtk_browser.h"
#include "assets.h"
#include "image_io.h"
#include "gtk_preview.h"
#include "state.h"
#include "utils.h"

#include <errno.h>
#include <gdk/gdkkeysyms.h>
#include <gio/gio.h>
#include <glib.h>
#include <glib/gstdio.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

static int cmp_str(const void *a, const void *b) {
    return g_ascii_strcasecmp(*(const char *const *)a, *(const char *const *)b);
}

static void on_file_selection_changed(GtkTreeSelection *sel, gpointer data);
static void browser_refresh_folder_tree_node(App *app, const char *folder);
static void browser_select_file_by_path(App *app, const char *path);

#define LIST_ICON_SIZE 16

typedef enum {
    BROWSER_ICON_FOLDER = 0,
    BROWSER_ICON_IMAGE,
    BROWSER_ICON_VIDEO,
    BROWSER_ICON_HIF,
    BROWSER_ICON_COUNT
} BrowserIconKind;

static GdkPixbuf *browser_icons[BROWSER_ICON_COUNT];

static GdkPixbuf *browser_load_theme_icon(const char *name) {
    GtkIconTheme *theme = gtk_icon_theme_get_default();
    GError *err = NULL;
    GdkPixbuf *pb = gtk_icon_theme_load_icon(theme, name, LIST_ICON_SIZE,
                                             GTK_ICON_LOOKUP_USE_BUILTIN, &err);
    if (!pb) {
        g_clear_error(&err);
        pb = gtk_icon_theme_load_icon(theme, name, LIST_ICON_SIZE,
                                      GTK_ICON_LOOKUP_GENERIC_FALLBACK, &err);
    }
    g_clear_error(&err);
    return pb;
}

static GdkPixbuf *browser_load_theme_icon_fallback(const char *const *names) {
    for (int i = 0; names[i]; i++) {
        GdkPixbuf *pb = browser_load_theme_icon(names[i]);
        if (pb) {
            return pb;
        }
    }
    return NULL;
}

static void browser_init_icons(void) {
    static const char *const folder_names[] = {"folder", "inode-directory", NULL};
    static const char *const image_names[] = {"image-x-generic", "image", NULL};
    static const char *const video_names[] = {"video-x-generic", "video", NULL};
    static const char *const hif_names[] = {"text-x-generic", "image-x-generic", NULL};

    if (browser_icons[BROWSER_ICON_FOLDER]) {
        return;
    }
    browser_icons[BROWSER_ICON_FOLDER] = browser_load_theme_icon_fallback(folder_names);
    browser_icons[BROWSER_ICON_IMAGE] = browser_load_theme_icon_fallback(image_names);
    browser_icons[BROWSER_ICON_VIDEO] = browser_load_theme_icon_fallback(video_names);
    browser_icons[BROWSER_ICON_HIF] = browser_load_theme_icon_fallback(hif_names);
    if (!browser_icons[BROWSER_ICON_HIF]) {
        browser_icons[BROWSER_ICON_HIF] =
            browser_icons[BROWSER_ICON_IMAGE]
                ? g_object_ref(browser_icons[BROWSER_ICON_IMAGE])
                : NULL;
    }
}

static GdkPixbuf *browser_fallback_icon(void) {
    static GdkPixbuf *fallback;
    if (!fallback) {
        fallback = gdk_pixbuf_new(GDK_COLORSPACE_RGB, TRUE, 8, LIST_ICON_SIZE, LIST_ICON_SIZE);
        if (fallback) {
            gdk_pixbuf_fill(fallback, 0x808080ff);
        }
    }
    return fallback;
}

static const char *path_ext(const char *path) {
    const char *dot = strrchr(path, '.');
    return dot ? dot : "";
}

static BrowserIconKind browser_file_icon_kind(const char *path) {
    if (utils_is_hif_path(path)) {
        return BROWSER_ICON_HIF;
    }
    const char *ext = path_ext(path);
    if (utils_is_video_ext(ext)) {
        return BROWSER_ICON_VIDEO;
    }
    return BROWSER_ICON_IMAGE;
}

static GdkPixbuf *browser_get_icon(BrowserIconKind kind) {
    browser_init_icons();
    GdkPixbuf *icon = browser_icons[kind];
    if (!icon) {
        icon = browser_icons[BROWSER_ICON_IMAGE];
    }
    if (!icon) {
        icon = browser_fallback_icon();
    }
    return icon;
}

static GdkPixbuf *browser_get_folder_list_icon(gboolean open) {
    GdkPixbuf *pb = assets_load_folder_icon(open, LIST_ICON_SIZE);
    if (pb) {
        return pb;
    }
    return browser_get_icon(BROWSER_ICON_FOLDER);
}

static GdkPixbuf *browser_get_file_list_icon(const char *path) {
    GdkPixbuf *pb = assets_load_icon_for_path(path, LIST_ICON_SIZE);
    if (pb) {
        return pb;
    }
    return browser_get_icon(browser_file_icon_kind(path));
}

static void browser_add_icon_name_column(GtkTreeView *view,
                                         const char *title,
                                         int icon_col,
                                         int text_col) {
    GtkTreeViewColumn *col = gtk_tree_view_column_new();
    gtk_tree_view_column_set_title(col, title);
    gtk_tree_view_column_set_expand(col, TRUE);
    gtk_tree_view_column_set_spacing(col, 4);

    GtkCellRenderer *pix = gtk_cell_renderer_pixbuf_new();
    gtk_tree_view_column_pack_start(col, pix, FALSE);
    gtk_tree_view_column_add_attribute(col, pix, "pixbuf", icon_col);

    GtkCellRenderer *text = gtk_cell_renderer_text_new();
    g_object_set(text, "xalign", 0.0, "ellipsize", PANGO_ELLIPSIZE_END, NULL);
    gtk_tree_view_column_pack_start(col, text, TRUE);
    gtk_tree_view_column_add_attribute(col, text, "text", text_col);

    gtk_tree_view_append_column(view, col);
}

static void browser_tree_scroll_to_row(GtkTreeView *view, GtkTreePath *path) {
    /* 가로 스크롤 없이 행만 보이게 (긴 파일명 클릭 시 목록이 옆으로 밀리지 않음) */
    gtk_tree_view_scroll_to_cell(view, path, NULL, FALSE, 0.0, 0.0);
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
                           TREE_COL_ICON, browser_get_folder_list_icon(FALSE),
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
    gchar *name = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->tree_store), iter, TREE_COL_NAME, &name, -1);
    if (name && g_strcmp0(name, BROWSER_DUMMY) != 0) {
        gtk_tree_store_set(app->tree_store, iter,
                           TREE_COL_ICON, browser_get_folder_list_icon(TRUE),
                           -1);
    }
    g_free(name);
    tree_populate_children(app, iter);
}

static void on_tree_row_collapsed(GtkTreeView *view, GtkTreeIter *iter, GtkTreePath *path, gpointer data) {
    (void)view;
    (void)path;
    App *app = data;
    gchar *name = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->tree_store), iter, TREE_COL_NAME, &name, -1);
    if (name && g_strcmp0(name, BROWSER_DUMMY) != 0) {
        gtk_tree_store_set(app->tree_store, iter,
                           TREE_COL_ICON, browser_get_folder_list_icon(FALSE),
                           -1);
    }
    g_free(name);
}

static gboolean tree_iter_folder_path(App *app, GtkTreeIter *iter, char **folder_out) {
    gchar *name = NULL;
    gchar *path = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->tree_store), iter,
                       TREE_COL_NAME, &name,
                       TREE_COL_PATH, &path, -1);
    gboolean ok = name && strcmp(name, BROWSER_DUMMY) != 0 &&
                  path && *path && g_file_test(path, G_FILE_TEST_IS_DIR);
    g_free(name);
    if (!ok) {
        g_free(path);
        return FALSE;
    }
    *folder_out = path;
    return TRUE;
}

gboolean browser_is_context_menu_event(App *app) {
    if (app && app->context_menu_in_progress) {
        return TRUE;
    }
    GdkEvent *ev = gtk_get_current_event();
    if (!ev) {
        return FALSE;
    }
    gboolean ctx = gdk_event_triggers_context_menu(ev);
    gdk_event_free(ev);
    return ctx;
}

typedef struct {
    App *app;
    char *path;
    gboolean is_dir;
    gboolean restrict_root_ops;
    GdkEvent *event;
} ContextMenuRequest;

static void show_file_context_menu(App *app,
                                   GdkEvent *event,
                                   const char *path,
                                   gboolean is_dir,
                                   gboolean restrict_root_ops);

static void context_menu_request_free(ContextMenuRequest *req) {
    if (!req) {
        return;
    }
    gdk_event_free(req->event);
    g_free(req->path);
    g_free(req);
}

static gboolean context_menu_idle_show(gpointer user_data) {
    ContextMenuRequest *req = user_data;
    if (req->app) {
        req->app->context_menu_in_progress = FALSE;
        req->app->file_selection_skip_preview = FALSE;
        req->app->tree_selection_skip_navigate = FALSE;
    }
    show_file_context_menu(req->app, req->event, req->path, req->is_dir, req->restrict_root_ops);
    context_menu_request_free(req);
    return G_SOURCE_REMOVE;
}

static void browser_queue_context_menu(App *app,
                                       const char *path,
                                       gboolean is_dir,
                                       gboolean restrict_root_ops,
                                       GdkEvent *event) {
    if (!app || !path) {
        return;
    }
    ContextMenuRequest *req = g_new0(ContextMenuRequest, 1);
    req->app = app;
    req->path = g_strdup(path);
    req->is_dir = is_dir;
    req->restrict_root_ops = restrict_root_ops;
    req->event = event ? gdk_event_copy(event) : NULL;
    app->context_menu_in_progress = TRUE;
    g_idle_add(context_menu_idle_show, req);
}

static gboolean tree_view_path_at_button(GtkTreeView *view,
                                         GdkEventButton *event,
                                         GtkTreePath **path_out,
                                         GtkTreeViewColumn **col_out) {
    gint tx = 0;
    gint ty = 0;
    GdkWindow *bin = gtk_tree_view_get_bin_window(view);

    /* GtkTreeView 행 클릭 이벤트는 bin_window 기준 좌표로 올 수 있음 */
    if (bin && event->window == bin) {
        tx = (gint)event->x;
        ty = (gint)event->y;
    } else {
        gtk_tree_view_convert_widget_to_tree_coords(view, (gint)event->x, (gint)event->y,
                                                    &tx, &ty);
    }
    return gtk_tree_view_get_path_at_pos(view, tx, ty, path_out, col_out, NULL, NULL);
}

static gboolean tree_view_select_at_button(GtkTreeView *view,
                                           GdkEventButton *event,
                                           GtkTreeModel *model,
                                           GtkTreeIter *iter_out) {
    GtkTreePath *path = NULL;
    GtkTreeViewColumn *col = NULL;
    if (!tree_view_path_at_button(view, event, &path, &col)) {
        return FALSE;
    }
    if (!gtk_tree_model_get_iter(model, iter_out, path)) {
        gtk_tree_path_free(path);
        return FALSE;
    }
    if (!col) {
        col = gtk_tree_view_get_column(view, 0);
    }
    GtkTreeSelection *sel = gtk_tree_view_get_selection(view);
    gtk_tree_selection_unselect_all(sel);
    gtk_tree_selection_select_path(sel, path);
    gtk_tree_view_set_cursor(view, path, col, FALSE);
    browser_tree_scroll_to_row(view, path);
    gtk_widget_grab_focus(GTK_WIDGET(view));
    gtk_tree_path_free(path);
    return TRUE;
}

static void on_tree_row_activated(GtkTreeView *view, GtkTreePath *path,
                                  GtkTreeViewColumn *col, gpointer data) {
    (void)view;
    (void)col;
    App *app = data;
    if (app->tree_selection_skip_navigate || browser_is_context_menu_event(app)) {
        return;
    }
    GtkTreeIter iter;
    if (!gtk_tree_model_get_iter(GTK_TREE_MODEL(app->tree_store), &iter, path)) {
        return;
    }
    char *folder = NULL;
    if (tree_iter_folder_path(app, &iter, &folder)) {
        browser_show_folder_contents(app, folder, TRUE);
    }
    g_free(folder);
}

static void on_tree_cursor_changed(GtkTreeView *view, gpointer data) {
    App *app = data;
    if (app->tree_selection_skip_navigate || browser_is_context_menu_event(app)) {
        app->tree_selection_skip_navigate = FALSE;
        return;
    }
    GtkTreeSelection *sel = gtk_tree_view_get_selection(view);
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, NULL, &iter)) {
        return;
    }
    char *folder = NULL;
    if (tree_iter_folder_path(app, &iter, &folder)) {
        browser_show_folder_contents(app, folder, TRUE);
    }
    g_free(folder);
}

static void browser_update_file_status_for_path(App *app, const char *path) {
    if (!path) {
        return;
    }
    struct stat st;
    if (g_stat(path, &st) == 0) {
        char *sz = utils_format_file_size((int64_t)st.st_size);
        char *mt = utils_format_mtime(st.st_mtime);
        char *msg = g_strdup_printf("파일: %s | 크기: %s | 수정: %s | 형식: %s",
                                    g_path_get_basename(path), sz, mt,
                                    path_ext(path));
        gtk_app_update_status_file(app, msg);
        g_free(msg);
        g_free(sz);
        g_free(mt);
    } else {
        gtk_app_update_status_file(app, g_path_get_basename(path));
    }
}

static void browser_track_selected_file_path(App *app, const char *path) {
    g_free(app->selected_file);
    app->selected_file = path ? g_strdup(path) : NULL;
}

void browser_select_file_context_only(App *app, const char *path) {
    if (!app || !path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        return;
    }
    browser_track_selected_file_path(app, path);
    browser_update_file_status_for_path(app, path);
}

void browser_show_file_for_path(App *app, const char *path, gboolean via_mouse) {
    (void)via_mouse;
    if (!path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        return;
    }

    browser_track_selected_file_path(app, path);
    browser_update_file_status_for_path(app, path);

    const char *ext = path_ext(path);
    if (utils_is_image_ext(ext) || utils_is_heif_path(path)) {
        preview_show_image(app, path);
    } else if (utils_is_video_ext(ext)) {
        preview_show_video(app, path);
    } else {
        preview_show_placeholder(app, "이 형식은 미리보기를 지원하지 않습니다.");
    }
}

void browser_sync_file_list_to_path(App *app, const char *path) {
    if (!app || !path) {
        return;
    }
    GtkTreeIter iter;
    gboolean valid = gtk_tree_model_get_iter_first(GTK_TREE_MODEL(app->file_store), &iter);
    GtkTreeSelection *fsel = gtk_tree_view_get_selection(GTK_TREE_VIEW(app->file_view));
    GtkTreeViewColumn *col = gtk_tree_view_get_column(GTK_TREE_VIEW(app->file_view), 0);

    while (valid) {
        gchar *fp = NULL;
        gtk_tree_model_get(GTK_TREE_MODEL(app->file_store), &iter, FILE_COL_PATH, &fp, -1);
        if (fp && g_ascii_strcasecmp(fp, path) == 0) {
            GtkTreePath *tp = gtk_tree_model_get_path(GTK_TREE_MODEL(app->file_store), &iter);
            g_signal_handlers_block_by_func(fsel, on_file_selection_changed, app);
            gtk_tree_selection_select_iter(fsel, &iter);
            gtk_tree_view_set_cursor(GTK_TREE_VIEW(app->file_view), tp, col, FALSE);
            browser_tree_scroll_to_row(GTK_TREE_VIEW(app->file_view), tp);
            g_signal_handlers_unblock_by_func(fsel, on_file_selection_changed, app);
            gtk_tree_path_free(tp);
            g_free(fp);
            return;
        }
        g_free(fp);
        valid = gtk_tree_model_iter_next(GTK_TREE_MODEL(app->file_store), &iter);
    }
}

void browser_show_file_actions_menu(App *app, const char *path, GdkEvent *event) {
    if (!app || !path) {
        return;
    }
    browser_select_file_context_only(app, path);
    browser_sync_file_list_to_path(app, path);
    app->context_menu_in_progress = TRUE;
    show_file_context_menu(app, event, path, FALSE, FALSE);
    app->context_menu_in_progress = FALSE;
}

static void on_file_selection_changed(GtkTreeSelection *sel, gpointer data) {
    App *app = data;
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, NULL, &iter)) {
        const char *page =
            gtk_stack_get_visible_child_name(GTK_STACK(app->preview_stack));
        if (page && g_strcmp0(page, "gallery") == 0) {
            return;
        }
        gtk_app_update_status_file(app, "파일을 선택하세요.");
        return;
    }

    gchar *path = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->file_store), &iter, FILE_COL_PATH, &path, -1);
    if (!path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        g_free(path);
        return;
    }

    browser_select_file_context_only(app, path);
    g_free(path);
}

static void browser_clear_file_selection(App *app) {
    GtkTreeSelection *fsel = gtk_tree_view_get_selection(GTK_TREE_VIEW(app->file_view));
    g_signal_handlers_block_by_func(fsel, on_file_selection_changed, app);
    gtk_tree_selection_unselect_all(fsel);
    g_signal_handlers_unblock_by_func(fsel, on_file_selection_changed, app);
    g_free(app->selected_file);
    app->selected_file = NULL;
}

void browser_show_folder_contents(App *app, const char *folder, gboolean show_gallery) {
    if (!folder || !*folder || !g_file_test(folder, G_FILE_TEST_IS_DIR)) {
        return;
    }

    gboolean changed = !app->current_folder || g_strcmp0(app->current_folder, folder) != 0;
    if (changed) {
        g_free(app->current_folder);
        app->current_folder = g_strdup(folder);
        gtk_entry_set_text(GTK_ENTRY(app->folder_entry), folder);
        state_save_last_folder(folder);
        browser_start_folder_watch(app);
    }

    browser_refresh_folder_tree_node(app, folder);

    /* 디렉토리 선택 → 즉시 썸네일 갤러리 (목록은 백그라운드 갱신) */
    if (show_gallery) {
        browser_clear_file_selection(app);
        preview_show_gallery(app, folder);
    }

    app_refresh_file_list(app, folder, FALSE, NULL);
}

static gboolean path_is_equal_or_child(const char *dir, const char *path) {
    if (!dir || !path) {
        return FALSE;
    }
    size_t len = strlen(dir);
    if (g_strcmp0(dir, path) == 0) {
        return TRUE;
    }
    if (strncmp(path, dir, len) != 0) {
        return FALSE;
    }
    return path[len] == G_DIR_SEPARATOR;
}

static gboolean path_remove_recursive(const char *path, GError **err) {
    if (!g_file_test(path, G_FILE_TEST_EXISTS)) {
        return TRUE;
    }
    if (g_file_test(path, G_FILE_TEST_IS_DIR)) {
        GDir *dir = g_dir_open(path, 0, err);
        if (!dir) {
            return FALSE;
        }
        const gchar *name;
        while ((name = g_dir_read_name(dir)) != NULL) {
            if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0) {
                continue;
            }
            char *child = g_build_filename(path, name, NULL);
            if (!path_remove_recursive(child, err)) {
                g_free(child);
                g_dir_close(dir);
                return FALSE;
            }
            g_free(child);
        }
        g_dir_close(dir);
        if (g_rmdir(path) != 0) {
            if (err) {
                *err = g_error_new(G_FILE_ERROR, g_file_error_from_errno(errno),
                                   "폴더를 삭제할 수 없습니다: %s", path);
            }
            return FALSE;
        }
        return TRUE;
    }
    if (g_unlink(path) != 0) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, g_file_error_from_errno(errno),
                               "파일을 삭제할 수 없습니다: %s", path);
        }
        return FALSE;
    }
    return TRUE;
}

static gboolean browser_delete_path(const char *path, GError **err) {
    GFile *gf = g_file_new_for_path(path);
    if (g_file_trash(gf, NULL, err)) {
        g_object_unref(gf);
        return TRUE;
    }
    g_clear_error(err);
    g_object_unref(gf);
    return path_remove_recursive(path, err);
}

static gboolean browser_confirm_delete(GtkWindow *parent, const char *name, gboolean is_dir) {
    GtkWidget *dlg = gtk_message_dialog_new(
        parent,
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        GTK_MESSAGE_WARNING,
        GTK_BUTTONS_NONE,
        "%s",
        is_dir ? "이 폴더를 삭제하시겠습니까?" : "이 파일을 삭제하시겠습니까?");
    gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg),
                                             "%s\n\n휴지통으로 이동하거나 영구 삭제됩니다.",
                                             name);
    gtk_dialog_add_buttons(GTK_DIALOG(dlg), "_취소", GTK_RESPONSE_CANCEL,
                           "_삭제", GTK_RESPONSE_OK, NULL);
    int resp = gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
    return resp == GTK_RESPONSE_OK;
}

static gboolean preview_uses_path(App *app, const char *path) {
    if (!path) {
        return FALSE;
    }
    if (app->selected_file && g_strcmp0(app->selected_file, path) == 0) {
        return TRUE;
    }
    if (app->image_edit_path && g_strcmp0(app->image_edit_path, path) == 0) {
        return TRUE;
    }
    if (app->image_path && g_strcmp0(app->image_path, path) == 0) {
        return TRUE;
    }
    return FALSE;
}

static void browser_after_delete(App *app, const char *path, gboolean is_dir) {
    if (is_dir && app->current_folder &&
        path_is_equal_or_child(path, app->current_folder)) {
        char *parent = g_path_get_dirname(path);
        if (parent && g_file_test(parent, G_FILE_TEST_IS_DIR)) {
            gtk_app_set_folder(app, parent);
        } else {
            preview_clear(app);
            g_free(app->selected_file);
            app->selected_file = NULL;
            preview_show_placeholder(app, "폴더가 삭제되었습니다.");
            gtk_app_update_status_file(app, "폴더가 삭제되었습니다.");
        }
        g_free(parent);
        return;
    }

    if (preview_uses_path(app, path)) {
        preview_clear(app);
        g_free(app->selected_file);
        app->selected_file = NULL;
    }

    if (app->current_folder && g_file_test(app->current_folder, G_FILE_TEST_IS_DIR)) {
        browser_show_folder_contents(app, app->current_folder, TRUE);
    } else {
        browser_refresh_views(app);
    }
}

typedef struct {
    char *path;
    gboolean is_dir;
    gboolean ok;
    GError *error;
} DeleteWorkResult;

static void delete_work_result_free(DeleteWorkResult *r) {
    if (!r) {
        return;
    }
    g_free(r->path);
    g_clear_error(&r->error);
    g_free(r);
}

static void delete_worker(GTask *task, gpointer source, gpointer data, GCancellable *cancel) {
    (void)source;
    (void)cancel;
    DeleteWorkResult *req = data;
    DeleteWorkResult *out = g_new0(DeleteWorkResult, 1);
    out->path = g_strdup(req->path);
    out->is_dir = req->is_dir;
    out->ok = browser_delete_path(req->path, &out->error);
    g_task_return_pointer(task, out, (GDestroyNotify)delete_work_result_free);
}

static void delete_done_cb(GObject *source, GAsyncResult *result, gpointer user_data) {
    (void)source;
    App *app = user_data;
    GError *task_err = NULL;
    DeleteWorkResult *out = g_task_propagate_pointer(G_TASK(result), &task_err);
    if (!out) {
        g_clear_error(&task_err);
        return;
    }

    if (!out->ok) {
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window),
            GTK_DIALOG_MODAL,
            GTK_MESSAGE_ERROR,
            GTK_BUTTONS_OK,
            "삭제할 수 없습니다.");
        if (out->error && out->error->message) {
            gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg),
                                                       "%s", out->error->message);
        }
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
        delete_work_result_free(out);
        return;
    }

    browser_after_delete(app, out->path, out->is_dir);
    delete_work_result_free(out);
}

static void browser_request_delete(App *app, const char *path, gboolean is_dir);

static char *unique_copy_basename(const char *dir, const char *src_path) {
    const char *base = g_path_get_basename(src_path);
    char *dest = g_build_filename(dir, base, NULL);
    if (!g_file_test(dest, G_FILE_TEST_EXISTS)) {
        return dest;
    }
    g_free(dest);

    char *stem = g_strdup(base);
    const char *ext = "";
    char *dot = strrchr(stem, '.');
    if (dot && dot != stem) {
        ext = dot;
        *dot = '\0';
    }

    for (int n = 1; n < 10000; n++) {
        char *name = NULL;
        if (n == 1) {
            name = g_strdup_printf("%s copy%s", stem, ext);
        } else {
            name = g_strdup_printf("%s copy %d%s", stem, n, ext);
        }
        dest = g_build_filename(dir, name, NULL);
        g_free(name);
        if (!g_file_test(dest, G_FILE_TEST_EXISTS)) {
            g_free(stem);
            return dest;
        }
        g_free(dest);
    }
    g_free(stem);
    return NULL;
}

static gboolean browser_copy_recursive(const char *src, const char *dest, GError **err) {
    if (g_file_test(src, G_FILE_TEST_IS_REGULAR)) {
        GFile *sf = g_file_new_for_path(src);
        GFile *df = g_file_new_for_path(dest);
        gboolean ok = g_file_copy(sf, df, G_FILE_COPY_NONE, NULL, NULL, NULL, err);
        g_object_unref(sf);
        g_object_unref(df);
        return ok;
    }
    if (!g_file_test(src, G_FILE_TEST_IS_DIR)) {
        if (err) {
            *err = g_error_new(G_IO_ERROR, G_IO_ERROR_NOT_FOUND,
                               "복사할 항목을 찾을 수 없습니다.");
        }
        return FALSE;
    }
    if (g_mkdir_with_parents(dest, 0755) != 0) {
        if (err) {
            *err = g_error_new(G_FILE_ERROR, g_file_error_from_errno(errno),
                               "대상 폴더를 만들 수 없습니다.");
        }
        return FALSE;
    }

    GDir *dir = g_dir_open(src, 0, err);
    if (!dir) {
        return FALSE;
    }
    const gchar *name;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (name[0] == '.') {
            continue;
        }
        char *child_src = g_build_filename(src, name, NULL);
        char *child_dest = g_build_filename(dest, name, NULL);
        gboolean ok = browser_copy_recursive(child_src, child_dest, err);
        g_free(child_src);
        g_free(child_dest);
        if (!ok) {
            g_dir_close(dir);
            return FALSE;
        }
    }
    g_dir_close(dir);
    return TRUE;
}

typedef struct {
    char *src;
    char *dest;
    gboolean dest_is_dir;
    gboolean ok;
    GError *error;
} CopyWorkResult;

static void copy_work_result_free(CopyWorkResult *r) {
    if (!r) {
        return;
    }
    g_free(r->src);
    g_free(r->dest);
    g_clear_error(&r->error);
    g_free(r);
}

static void browser_after_copy(App *app, const char *dest, gboolean dest_is_dir) {
    if (!app->current_folder || !dest) {
        return;
    }
    if (dest_is_dir) {
        browser_refresh_views(app);
        gtk_app_update_status_file(app, "폴더를 복사했습니다.");
        return;
    }
    app_refresh_file_list(app, app->current_folder, FALSE, dest);
    browser_select_file_by_path(app, dest);
    app->file_select_via_mouse = FALSE;
    browser_show_file_for_path(app, dest, FALSE);
    gtk_app_update_status_file(app, "파일을 복사했습니다.");
}

static void copy_done_cb(GObject *source, GAsyncResult *result, gpointer user_data) {
    (void)source;
    App *app = user_data;
    GError *task_err = NULL;
    CopyWorkResult *out = g_task_propagate_pointer(G_TASK(result), &task_err);
    if (!out) {
        g_clear_error(&task_err);
        return;
    }

    if (!out->ok) {
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window),
            GTK_DIALOG_MODAL,
            GTK_MESSAGE_ERROR,
            GTK_BUTTONS_OK,
            "복사할 수 없습니다.");
        if (out->error && out->error->message) {
            gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg),
                                                       "%s", out->error->message);
        }
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
        copy_work_result_free(out);
        return;
    }

    browser_after_copy(app, out->dest, out->dest_is_dir);
    copy_work_result_free(out);
}

static void copy_worker(GTask *task, gpointer source, gpointer data, GCancellable *cancel) {
    (void)source;
    (void)cancel;
    CopyWorkResult *req = data;
    CopyWorkResult *out = g_new0(CopyWorkResult, 1);
    out->src = g_strdup(req->src);
    out->dest = g_strdup(req->dest);
    out->dest_is_dir = req->dest_is_dir;
    out->ok = browser_copy_recursive(req->src, req->dest, &out->error);
    g_task_return_pointer(task, out, (GDestroyNotify)copy_work_result_free);
}

static void browser_request_copy_to(App *app, const char *src, gboolean src_is_dir,
                                    const char *dest_dir) {
    if (!src || !dest_dir || !g_file_test(src, G_FILE_TEST_EXISTS)) {
        return;
    }
    if (path_is_equal_or_child(src, dest_dir)) {
        gtk_app_show_warning(app, "폴더를 자기 자신 안으로 복사할 수 없습니다.");
        return;
    }

    char *dest = unique_copy_basename(dest_dir, src);
    if (!dest) {
        gtk_app_show_warning(app, "사용 가능한 복사본 이름을 만들 수 없습니다.");
        return;
    }

    gtk_app_update_status_file(app, "복사하는 중…");

    CopyWorkResult *req = g_new0(CopyWorkResult, 1);
    req->src = g_strdup(src);
    req->dest = dest;
    req->dest_is_dir = src_is_dir;

    GTask *task = g_task_new(NULL, NULL, copy_done_cb, app);
    g_task_set_task_data(task, req, (GDestroyNotify)copy_work_result_free);
    g_task_run_in_thread(task, copy_worker);
    g_object_unref(task);
}

static gboolean browser_move_item(const char *src, const char *dest, GError **err) {
    GFile *sf = g_file_new_for_path(src);
    GFile *df = g_file_new_for_path(dest);
    gboolean ok = g_file_move(sf, df, G_FILE_COPY_NONE, NULL, NULL, NULL, err);
    if (!ok && err && *err && (*err)->code == G_IO_ERROR_NOT_SUPPORTED) {
        g_clear_error(err);
        ok = browser_copy_recursive(src, dest, err);
        if (ok) {
            ok = path_remove_recursive(src, err);
        }
    }
    g_object_unref(sf);
    g_object_unref(df);
    return ok;
}

static void browser_after_move(App *app, const char *src, const char *dest, gboolean dest_is_dir) {
    if (preview_uses_path(app, src)) {
        preview_clear(app);
        g_free(app->selected_file);
        app->selected_file = NULL;
    }

    char *src_parent = g_path_get_dirname(src);
    char *dest_parent = dest ? g_path_get_dirname(dest) : NULL;
    gboolean src_in_current = app->current_folder && src_parent &&
                              g_strcmp0(src_parent, app->current_folder) == 0;
    gboolean dest_in_current = app->current_folder && dest_parent &&
                               g_strcmp0(dest_parent, app->current_folder) == 0;
    g_free(src_parent);
    g_free(dest_parent);

    if (dest_is_dir) {
        browser_refresh_views(app);
        gtk_app_update_status_file(app, "폴더를 이동했습니다.");
        return;
    }

    if (dest_in_current && app->current_folder) {
        app_refresh_file_list(app, app->current_folder, FALSE, dest);
        browser_select_file_by_path(app, dest);
        app->file_select_via_mouse = FALSE;
        browser_show_file_for_path(app, dest, FALSE);
    } else if (src_in_current && app->current_folder) {
        app_refresh_file_list(app, app->current_folder, FALSE, NULL);
    } else {
        browser_refresh_views(app);
    }
    gtk_app_update_status_file(app, "이동했습니다.");
}

static void move_done_cb(GObject *source, GAsyncResult *result, gpointer user_data) {
    (void)source;
    App *app = user_data;
    GError *task_err = NULL;
    CopyWorkResult *out = g_task_propagate_pointer(G_TASK(result), &task_err);
    if (!out) {
        g_clear_error(&task_err);
        return;
    }

    if (!out->ok) {
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window),
            GTK_DIALOG_MODAL,
            GTK_MESSAGE_ERROR,
            GTK_BUTTONS_OK,
            "이동할 수 없습니다.");
        if (out->error && out->error->message) {
            gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg),
                                                       "%s", out->error->message);
        }
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
        copy_work_result_free(out);
        return;
    }

    browser_after_move(app, out->src, out->dest, out->dest_is_dir);
    g_free(app->fs_clipboard_path);
    app->fs_clipboard_path = NULL;
    app->fs_clipboard_is_dir = FALSE;
    app->fs_clipboard_cut = FALSE;
    copy_work_result_free(out);
}

static void move_worker(GTask *task, gpointer source, gpointer data, GCancellable *cancel) {
    (void)source;
    (void)cancel;
    CopyWorkResult *req = data;
    CopyWorkResult *out = g_new0(CopyWorkResult, 1);
    out->src = g_strdup(req->src);
    out->dest = g_strdup(req->dest);
    out->dest_is_dir = req->dest_is_dir;
    out->ok = browser_move_item(req->src, req->dest, &out->error);
    g_task_return_pointer(task, out, (GDestroyNotify)copy_work_result_free);
}

static void browser_request_move_to(App *app, const char *src, gboolean src_is_dir,
                                    const char *dest_dir) {
    if (!src || !dest_dir || !g_file_test(src, G_FILE_TEST_EXISTS)) {
        return;
    }
    if (path_is_equal_or_child(src, dest_dir)) {
        gtk_app_show_warning(app, "폴더를 자기 자신 안으로 이동할 수 없습니다.");
        return;
    }

    char *dest = g_build_filename(dest_dir, g_path_get_basename(src), NULL);
    if (g_strcmp0(src, dest) == 0) {
        g_free(dest);
        gtk_app_update_status_file(app, "같은 위치입니다.");
        return;
    }
    if (g_file_test(dest, G_FILE_TEST_EXISTS)) {
        g_free(dest);
        gtk_app_show_warning(app, "같은 이름의 항목이 이미 있습니다.");
        return;
    }

    gtk_app_update_status_file(app, "이동하는 중…");

    CopyWorkResult *req = g_new0(CopyWorkResult, 1);
    req->src = g_strdup(src);
    req->dest = dest;
    req->dest_is_dir = src_is_dir;

    GTask *task = g_task_new(NULL, NULL, move_done_cb, app);
    g_task_set_task_data(task, req, (GDestroyNotify)copy_work_result_free);
    g_task_run_in_thread(task, move_worker);
    g_object_unref(task);
}

static gboolean browser_get_tree_selection(App *app, char **path_out, gboolean *is_dir_out,
                                           gboolean *is_root_out) {
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(app->tree_view));
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, NULL, &iter)) {
        return FALSE;
    }

    GtkTreeModel *model = GTK_TREE_MODEL(app->tree_store);
    GtkTreeIter parent;
    gboolean is_root = !gtk_tree_model_iter_parent(model, &parent, &iter);
    if (is_root_out) {
        *is_root_out = is_root;
    }
    if (is_root) {
        return FALSE;
    }
    if (!tree_iter_folder_path(app, &iter, path_out)) {
        return FALSE;
    }
    if (is_dir_out) {
        *is_dir_out = TRUE;
    }
    return TRUE;
}

static gboolean browser_get_file_selection(App *app, char **path_out) {
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(app->file_view));
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, NULL, &iter)) {
        return FALSE;
    }
    gchar *path = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->file_store), &iter, FILE_COL_PATH, &path, -1);
    if (!path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        g_free(path);
        return FALSE;
    }
    *path_out = path;
    return TRUE;
}

static gboolean browser_get_focused_selection(App *app, char **path_out, gboolean *is_dir_out,
                                              gboolean *from_tree_out) {
    GtkWidget *focus = gtk_window_get_focus(GTK_WINDOW(app->window));
    gboolean from_tree = FALSE;

    if (focus && (focus == app->tree_view ||
                  gtk_widget_is_ancestor(focus, app->tree_view))) {
        from_tree = TRUE;
    } else if (focus && (focus == app->file_view ||
                          gtk_widget_is_ancestor(focus, app->file_view))) {
        from_tree = FALSE;
    } else if (gtk_widget_is_focus(app->file_view)) {
        from_tree = FALSE;
    } else if (gtk_widget_is_focus(app->tree_view)) {
        from_tree = TRUE;
    } else {
        const char *page =
            gtk_stack_get_visible_child_name(GTK_STACK(app->preview_stack));
        if (page && g_strcmp0(page, "gallery") == 0) {
            from_tree = FALSE;
        } else if (app->selected_file && g_file_test(app->selected_file, G_FILE_TEST_EXISTS)) {
            *path_out = g_strdup(app->selected_file);
            if (is_dir_out) {
                *is_dir_out = FALSE;
            }
            if (from_tree_out) {
                *from_tree_out = FALSE;
            }
            return TRUE;
        } else {
            from_tree = TRUE;
        }
    }

    if (!from_tree && app->selected_file && g_file_test(app->selected_file, G_FILE_TEST_EXISTS)) {
        const char *page =
            gtk_stack_get_visible_child_name(GTK_STACK(app->preview_stack));
        if (page && g_strcmp0(page, "gallery") == 0) {
            *path_out = g_strdup(app->selected_file);
            if (is_dir_out) {
                *is_dir_out = FALSE;
            }
            if (from_tree_out) {
                *from_tree_out = FALSE;
            }
            return TRUE;
        }
    }

    if (from_tree) {
        gboolean is_dir = TRUE;
        if (!browser_get_tree_selection(app, path_out, &is_dir, NULL)) {
            return FALSE;
        }
        if (is_dir_out) {
            *is_dir_out = is_dir;
        }
    } else {
        if (!browser_get_file_selection(app, path_out)) {
            return FALSE;
        }
        if (is_dir_out) {
            *is_dir_out = FALSE;
        }
    }
    if (from_tree_out) {
        *from_tree_out = from_tree;
    }
    return TRUE;
}

static void browser_clipboard_set(App *app, const char *path, gboolean is_dir, gboolean cut) {
    g_free(app->fs_clipboard_path);
    app->fs_clipboard_path = g_strdup(path);
    app->fs_clipboard_is_dir = is_dir;
    app->fs_clipboard_cut = cut;
}

static void browser_action_copy(App *app) {
    char *path = NULL;
    gboolean is_dir = FALSE;
    if (!browser_get_focused_selection(app, &path, &is_dir, NULL)) {
        gtk_app_update_status_file(app, "복사할 항목을 선택하세요.");
        return;
    }
    browser_clipboard_set(app, path, is_dir, FALSE);
    const char *name = g_path_get_basename(path);
    char *msg = g_strdup_printf("복사됨: %s (Ctrl+V로 붙여넣기)", name);
    gtk_app_update_status_file(app, msg);
    g_free(msg);
    g_free(path);
}

static void browser_action_cut(App *app) {
    char *path = NULL;
    gboolean is_dir = FALSE;
    gboolean from_tree = FALSE;
    if (!browser_get_focused_selection(app, &path, &is_dir, &from_tree)) {
        gtk_app_update_status_file(app, "잘라낼 항목을 선택하세요.");
        return;
    }
    if (from_tree && is_dir) {
        GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(app->tree_view));
        GtkTreeIter iter;
        GtkTreeModel *model = GTK_TREE_MODEL(app->tree_store);
        if (gtk_tree_selection_get_selected(sel, NULL, &iter)) {
            GtkTreeIter parent;
            if (!gtk_tree_model_iter_parent(model, &parent, &iter)) {
                gtk_app_show_warning(app,
                                     "현재 열린 루트 폴더는 잘라낼 수 없습니다.");
                g_free(path);
                return;
            }
        }
    }
    browser_clipboard_set(app, path, is_dir, TRUE);
    const char *name = g_path_get_basename(path);
    char *msg = g_strdup_printf("잘라냄: %s (Ctrl+V로 붙여넣기)", name);
    gtk_app_update_status_file(app, msg);
    g_free(msg);
    g_free(path);
}

static void browser_action_paste(App *app) {
    if (!app->fs_clipboard_path || !g_file_test(app->fs_clipboard_path, G_FILE_TEST_EXISTS)) {
        gtk_app_update_status_file(app,
                                   "붙여넣을 항목이 없습니다. 먼저 복사하거나 잘라내세요.");
        return;
    }
    if (!app->current_folder || !g_file_test(app->current_folder, G_FILE_TEST_IS_DIR)) {
        gtk_app_show_warning(app, "붙여넣을 폴더가 열려 있지 않습니다.");
        return;
    }
    if (app->fs_clipboard_cut) {
        browser_request_move_to(app, app->fs_clipboard_path, app->fs_clipboard_is_dir,
                                app->current_folder);
    } else {
        browser_request_copy_to(app, app->fs_clipboard_path, app->fs_clipboard_is_dir,
                                app->current_folder);
    }
}

static void browser_action_duplicate(App *app) {
    char *path = NULL;
    gboolean is_dir = FALSE;
    if (!browser_get_focused_selection(app, &path, &is_dir, NULL)) {
        gtk_app_update_status_file(app, "복제할 항목을 선택하세요.");
        return;
    }
    char *parent = g_path_get_dirname(path);
    browser_request_copy_to(app, path, is_dir, parent);
    g_free(parent);
    g_free(path);
}

static void browser_request_delete(App *app, const char *path, gboolean is_dir) {
    if (!path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        return;
    }

    const char *name = strrchr(path, G_DIR_SEPARATOR);
    name = name ? name + 1 : path;
    if (!browser_confirm_delete(GTK_WINDOW(app->window), name, is_dir)) {
        return;
    }

    gtk_app_update_status_file(app, "삭제하는 중…");

    DeleteWorkResult *req = g_new0(DeleteWorkResult, 1);
    req->path = g_strdup(path);
    req->is_dir = is_dir;

    GTask *task = g_task_new(NULL, NULL, delete_done_cb, app);
    g_task_set_task_data(task, req, (GDestroyNotify)delete_work_result_free);
    g_task_run_in_thread(task, delete_worker);
    g_object_unref(task);
}

static void browser_action_delete(App *app) {
    char *path = NULL;
    gboolean is_dir = FALSE;
    gboolean from_tree = FALSE;
    if (!browser_get_focused_selection(app, &path, &is_dir, &from_tree)) {
        gtk_app_update_status_file(app, "삭제할 항목을 선택하세요.");
        return;
    }
    if (from_tree && is_dir) {
        GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(app->tree_view));
        GtkTreeIter iter;
        GtkTreeModel *model = GTK_TREE_MODEL(app->tree_store);
        if (gtk_tree_selection_get_selected(sel, NULL, &iter)) {
            GtkTreeIter parent;
            if (!gtk_tree_model_iter_parent(model, &parent, &iter)) {
                gtk_app_show_warning(app,
                                     "현재 열린 루트 폴더는 여기서 삭제할 수 없습니다.");
                g_free(path);
                return;
            }
        }
    }
    browser_request_delete(app, path, is_dir);
    g_free(path);
}

static void on_paste_menu_activate(GtkMenuItem *item, gpointer data);

static void on_delete_menu_activate(GtkMenuItem *item, gpointer data) {
    App *app = data;
    const char *path = g_object_get_data(G_OBJECT(item), "fs-path");
    gboolean is_dir = GPOINTER_TO_INT(g_object_get_data(G_OBJECT(item), "fs-is-dir"));
    browser_request_delete(app, path, is_dir);
}

static void on_copy_menu_activate(GtkMenuItem *item, gpointer data) {
    App *app = data;
    const char *path = g_object_get_data(G_OBJECT(item), "fs-path");
    gboolean is_dir = GPOINTER_TO_INT(g_object_get_data(G_OBJECT(item), "fs-is-dir"));
    if (path && g_file_test(path, G_FILE_TEST_EXISTS)) {
        browser_clipboard_set(app, path, is_dir, FALSE);
        const char *name = g_path_get_basename(path);
        char *msg = g_strdup_printf("복사됨: %s", name);
        gtk_app_update_status_file(app, msg);
        g_free(msg);
    }
}

static void on_cut_menu_activate(GtkMenuItem *item, gpointer data) {
    App *app = data;
    const char *path = g_object_get_data(G_OBJECT(item), "fs-path");
    gboolean is_dir = GPOINTER_TO_INT(g_object_get_data(G_OBJECT(item), "fs-is-dir"));
    if (path && g_file_test(path, G_FILE_TEST_EXISTS)) {
        browser_clipboard_set(app, path, is_dir, TRUE);
        const char *name = g_path_get_basename(path);
        char *msg = g_strdup_printf("잘라냄: %s", name);
        gtk_app_update_status_file(app, msg);
        g_free(msg);
    }
}

static void on_duplicate_menu_activate(GtkMenuItem *item, gpointer data) {
    App *app = data;
    const char *path = g_object_get_data(G_OBJECT(item), "fs-path");
    gboolean is_dir = GPOINTER_TO_INT(g_object_get_data(G_OBJECT(item), "fs-is-dir"));
    if (!path) {
        return;
    }
    char *parent = g_path_get_dirname(path);
    browser_request_copy_to(app, path, is_dir, parent);
    g_free(parent);
}

/* ── 범용 이미지 변환 다이얼로그 ────────────────────────────────── */

typedef struct {
    App        *app;
    char       *src_path;
    char       *dest_path;   /* worker 가 채움 */
    ImageFormat format;
    int         quality;
    gboolean    ok;
    GError     *error;
} ConvertWorkCtx;

static void convert_work_ctx_free(ConvertWorkCtx *ctx) {
    if (!ctx) return;
    g_free(ctx->src_path);
    g_free(ctx->dest_path);
    g_clear_error(&ctx->error);
    g_free(ctx);
}

static void convert_bg_worker(GTask *task, gpointer source,
                               gpointer data, GCancellable *cancel) {
    (void)source; (void)cancel;
    ConvertWorkCtx *ctx = data;
    ImageConvertParams p = {
        .src_path  = ctx->src_path,
        .dest_path = ctx->dest_path,
        .format    = ctx->format,
        .quality   = ctx->quality,
    };
    ctx->ok = image_io_convert_file(&p, &ctx->error);
    g_task_return_pointer(task, ctx, (GDestroyNotify)convert_work_ctx_free);
    /* task가 ctx 소유권을 가져감 → data 포인터 무효화 */
}

static void convert_bg_done(GObject *source, GAsyncResult *result,
                             gpointer user_data) {
    (void)source;
    App *app = user_data;
    GError *task_err = NULL;
    ConvertWorkCtx *ctx = g_task_propagate_pointer(G_TASK(result), &task_err);
    if (!ctx) { g_clear_error(&task_err); return; }

    if (!ctx->ok) {
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window), GTK_DIALOG_MODAL,
            GTK_MESSAGE_ERROR, GTK_BUTTONS_OK, "변환에 실패했습니다.");
        if (ctx->error)
            gtk_message_dialog_format_secondary_text(
                GTK_MESSAGE_DIALOG(dlg), "%s", ctx->error->message);
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
        convert_work_ctx_free(ctx);
        return;
    }

    struct stat st;
    char *src_base  = g_path_get_basename(ctx->src_path);
    char *dest_base = g_path_get_basename(ctx->dest_path);
    if (g_stat(ctx->dest_path, &st) == 0) {
        char *sz  = utils_format_file_size((int64_t)st.st_size);
        char *mt  = utils_format_mtime(st.st_mtime);
        char *msg = g_strdup_printf("변환 완료: %s → %s | 크기: %s | 수정: %s",
                                    src_base, dest_base, sz, mt);
        gtk_app_update_status_file(app, msg);
        g_free(msg); g_free(sz); g_free(mt);
    } else {
        char *msg = g_strdup_printf("변환 완료: %s → %s", src_base, dest_base);
        gtk_app_update_status_file(app, msg);
        g_free(msg);
    }
    g_free(src_base);
    g_free(dest_base);

    if (app->current_folder)
        app_refresh_file_list(app, app->current_folder, FALSE, ctx->dest_path);
    browser_select_file_by_path(app, ctx->dest_path);

    convert_work_ctx_free(ctx);
}

/* 다이얼로그 내부 상태 */
typedef struct {
    GtkWidget  *quality_row;   /* 품질 행 (표시/숨김 토글) */
    GtkWidget  *quality_scale;
    GtkWidget  *quality_label;
    GtkWidget  *dest_entry;
    GtkWidget  *accept_btn;
    const char *src_path;
} ConvDlgData;

static void update_dest_path(ConvDlgData *d, ImageFormat fmt) {
    const ImageFormatInfo *fmts = image_io_format_info_all();
    char *new_path = image_io_path_with_ext(d->src_path, fmts[fmt].ext);
    gtk_entry_set_text(GTK_ENTRY(d->dest_entry), new_path);
    g_free(new_path);
}

static void on_fmt_combo_changed(GtkComboBox *combo, gpointer user_data) {
    ConvDlgData *d = user_data;
    int idx = gtk_combo_box_get_active(combo);
    if (idx < 0 || idx >= IMAGE_FORMAT_COUNT) return;

    const ImageFormatInfo *fmts = image_io_format_info_all();
    gboolean has_q = fmts[idx].has_quality;
    if (has_q)
        gtk_widget_show(d->quality_row);
    else
        gtk_widget_hide(d->quality_row);

    update_dest_path(d, (ImageFormat)idx);

    gboolean writable = image_io_format_is_writable((ImageFormat)idx);
    gtk_widget_set_sensitive(d->accept_btn, writable);
    if (!writable)
        gtk_widget_set_tooltip_text(d->accept_btn,
                                    "이 시스템에서 해당 포맷 쓰기를 지원하지 않습니다.");
    else
        gtk_widget_set_tooltip_text(d->accept_btn, NULL);
}

static void on_quality_changed(GtkRange *range, gpointer user_data) {
    GtkWidget *lbl = user_data;
    char buf[8];
    g_snprintf(buf, sizeof(buf), "%d", (int)gtk_range_get_value(range));
    gtk_label_set_text(GTK_LABEL(lbl), buf);
}

static void on_browse_dest(GtkButton *btn, gpointer user_data) {
    (void)btn;
    ConvDlgData *d = user_data;
    const char *cur = gtk_entry_get_text(GTK_ENTRY(d->dest_entry));

    GtkWidget *chooser = gtk_file_chooser_dialog_new(
        "출력 경로 선택", NULL,
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "취소", GTK_RESPONSE_CANCEL,
        "선택", GTK_RESPONSE_ACCEPT,
        NULL);
    gtk_file_chooser_set_do_overwrite_confirmation(
        GTK_FILE_CHOOSER(chooser), TRUE);

    if (cur && *cur) {
        gtk_file_chooser_set_filename(GTK_FILE_CHOOSER(chooser), cur);
    }
    if (gtk_dialog_run(GTK_DIALOG(chooser)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(chooser));
        gtk_entry_set_text(GTK_ENTRY(d->dest_entry), path);
        g_free(path);
    }
    gtk_widget_destroy(chooser);
}

static void show_convert_dialog(App *app, const char *src_path) {
    const ImageFormatInfo *fmts = image_io_format_info_all();

    GtkWidget *dlg = gtk_dialog_new_with_buttons(
        "이미지 변환",
        GTK_WINDOW(app->window),
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        "취소", GTK_RESPONSE_CANCEL,
        NULL);
    GtkWidget *accept_btn = gtk_dialog_add_button(
        GTK_DIALOG(dlg), "변환", GTK_RESPONSE_ACCEPT);
    gtk_widget_set_can_default(accept_btn, TRUE);
    gtk_dialog_set_default_response(GTK_DIALOG(dlg), GTK_RESPONSE_ACCEPT);
    gtk_window_set_resizable(GTK_WINDOW(dlg), FALSE);

    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(dlg));
    GtkWidget *grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 10);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 10);
    gtk_widget_set_margin_start(grid, 16);
    gtk_widget_set_margin_end(grid, 16);
    gtk_widget_set_margin_top(grid, 12);
    gtk_widget_set_margin_bottom(grid, 12);
    gtk_box_pack_start(GTK_BOX(content), grid, TRUE, TRUE, 0);

    int row = 0;

    /* 원본 파일 */
    GtkWidget *lbl_src_h = gtk_label_new("원본:");
    gtk_widget_set_halign(lbl_src_h, GTK_ALIGN_END);
    char *src_base = g_path_get_basename(src_path);
    GtkWidget *lbl_src = gtk_label_new(src_base);
    g_free(src_base);
    gtk_widget_set_halign(lbl_src, GTK_ALIGN_START);
    gtk_label_set_selectable(GTK_LABEL(lbl_src), TRUE);
    gtk_label_set_ellipsize(GTK_LABEL(lbl_src), PANGO_ELLIPSIZE_MIDDLE);
    gtk_widget_set_hexpand(lbl_src, TRUE);
    gtk_grid_attach(GTK_GRID(grid), lbl_src_h, 0, row, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), lbl_src,   1, row, 3, 1);
    row++;

    GtkWidget *sep1 = gtk_separator_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_grid_attach(GTK_GRID(grid), sep1, 0, row, 4, 1);
    row++;

    /* 포맷 선택 */
    GtkWidget *lbl_fmt = gtk_label_new("출력 형식:");
    gtk_widget_set_halign(lbl_fmt, GTK_ALIGN_END);
    gtk_grid_attach(GTK_GRID(grid), lbl_fmt, 0, row, 1, 1);

    /* GtkListStore 기반 ComboBox (비활성 항목 표시 가능) */
    GtkListStore *fmt_store = gtk_list_store_new(3,
        G_TYPE_STRING,   /* 표시 이름 */
        G_TYPE_BOOLEAN,  /* 활성 여부 */
        G_TYPE_INT);     /* ImageFormat 인덱스 */
    int default_fmt = IMAGE_FORMAT_JPEG;
    for (int i = 0; i < IMAGE_FORMAT_COUNT; i++) {
        gboolean w = image_io_format_is_writable((ImageFormat)i);
        GtkTreeIter it;
        gtk_list_store_append(fmt_store, &it);
        gtk_list_store_set(fmt_store, &it,
                           0, fmts[i].label,
                           1, w,
                           2, i, -1);
        if (!w && i == default_fmt) default_fmt = -1;
    }
    if (default_fmt < 0) default_fmt = IMAGE_FORMAT_PNG; /* fallback */

    GtkWidget *fmt_combo = gtk_combo_box_new_with_model(GTK_TREE_MODEL(fmt_store));
    g_object_unref(fmt_store);
    GtkCellRenderer *cr = gtk_cell_renderer_text_new();
    gtk_cell_layout_pack_start(GTK_CELL_LAYOUT(fmt_combo), cr, TRUE);
    gtk_cell_layout_set_attributes(GTK_CELL_LAYOUT(fmt_combo), cr,
                                   "text",      0,
                                   "sensitive", 1, NULL);
    gtk_combo_box_set_active(GTK_COMBO_BOX(fmt_combo), default_fmt);
    gtk_grid_attach(GTK_GRID(grid), fmt_combo, 1, row, 3, 1);
    row++;

    /* 품질 슬라이더 */
    GtkWidget *quality_row_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    GtkWidget *quality_scale = gtk_scale_new_with_range(
        GTK_ORIENTATION_HORIZONTAL, 1.0, 100.0, 1.0);
    gtk_range_set_value(GTK_RANGE(quality_scale), 85.0);
    gtk_scale_set_draw_value(GTK_SCALE(quality_scale), FALSE);
    gtk_widget_set_hexpand(quality_scale, TRUE);
    GtkWidget *quality_val_lbl = gtk_label_new("85");
    gtk_widget_set_size_request(quality_val_lbl, 32, -1);
    gtk_box_pack_start(GTK_BOX(quality_row_box), quality_scale,     TRUE,  TRUE,  0);
    gtk_box_pack_start(GTK_BOX(quality_row_box), quality_val_lbl,   FALSE, FALSE, 0);

    GtkWidget *lbl_q = gtk_label_new("품질 (1–100):");
    gtk_widget_set_halign(lbl_q, GTK_ALIGN_END);
    gtk_grid_attach(GTK_GRID(grid), lbl_q,           0, row, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), quality_row_box, 1, row, 3, 1);
    /* 품질 행 = lbl_q + quality_row_box 를 함께 표시/숨김하는 container */
    row++;

    GtkWidget *sep2 = gtk_separator_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_grid_attach(GTK_GRID(grid), sep2, 0, row, 4, 1);
    row++;

    /* 출력 경로 */
    GtkWidget *lbl_dest = gtk_label_new("저장 경로:");
    gtk_widget_set_halign(lbl_dest, GTK_ALIGN_END);
    gtk_grid_attach(GTK_GRID(grid), lbl_dest, 0, row, 1, 1);

    GtkWidget *dest_entry = gtk_entry_new();
    gtk_widget_set_hexpand(dest_entry, TRUE);
    char *init_dest = image_io_path_with_ext(src_path, fmts[default_fmt].ext);
    gtk_entry_set_text(GTK_ENTRY(dest_entry), init_dest);
    g_free(init_dest);

    GtkWidget *browse_btn = gtk_button_new_with_label("…");
    gtk_widget_set_tooltip_text(browse_btn, "저장 경로 선택");
    gtk_grid_attach(GTK_GRID(grid), dest_entry, 1, row, 2, 1);
    gtk_grid_attach(GTK_GRID(grid), browse_btn, 3, row, 1, 1);
    row++;

    /* 내부 상태 구조체 */
    ConvDlgData dlg_data = {
        .quality_row   = quality_row_box,
        .quality_scale = quality_scale,
        .quality_label = quality_val_lbl,
        .dest_entry    = dest_entry,
        .accept_btn    = accept_btn,
        .src_path      = src_path,
    };
    /* 품질 행(lbl_q + quality_row_box)을 함께 숨기기 위해 lbl_q도 저장 */
    g_object_set_data(G_OBJECT(dlg), "quality-label-h", lbl_q);

    /* 시그널 연결 */
    g_signal_connect(fmt_combo,     "changed",       G_CALLBACK(on_fmt_combo_changed), &dlg_data);
    g_signal_connect(quality_scale, "value-changed", G_CALLBACK(on_quality_changed),   quality_val_lbl);
    g_signal_connect(browse_btn,    "clicked",       G_CALLBACK(on_browse_dest),        &dlg_data);

    /* 초기 품질 행 표시 여부 */
    if (!fmts[default_fmt].has_quality) {
        gtk_widget_hide(lbl_q);
        gtk_widget_hide(quality_row_box);
    }

    gtk_widget_show_all(content);
    /* 다시 hide (show_all 이 숨겨둔 것을 되살리므로) */
    if (!fmts[default_fmt].has_quality) {
        gtk_widget_hide(lbl_q);
        gtk_widget_hide(quality_row_box);
    }

    gint response = gtk_dialog_run(GTK_DIALOG(dlg));
    if (response != GTK_RESPONSE_ACCEPT) {
        gtk_widget_destroy(dlg);
        return;
    }

    int active = gtk_combo_box_get_active(GTK_COMBO_BOX(fmt_combo));
    if (active < 0 || active >= IMAGE_FORMAT_COUNT) {
        gtk_widget_destroy(dlg);
        return;
    }
    ImageFormat chosen_fmt = (ImageFormat)active;
    int chosen_quality = (int)gtk_range_get_value(GTK_RANGE(quality_scale));
    const char *dest_path_raw = gtk_entry_get_text(GTK_ENTRY(dest_entry));
    char *dest_path = g_strdup(dest_path_raw);
    gtk_widget_destroy(dlg);

    if (!dest_path || !*dest_path) { g_free(dest_path); return; }

    /* 원본과 같은 경로로 덮어쓰기 방지 */
    if (g_strcmp0(src_path, dest_path) == 0) {
        GtkWidget *w = gtk_message_dialog_new(
            GTK_WINDOW(app->window), GTK_DIALOG_MODAL,
            GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
            "원본 파일을 덮어쓸 수 없습니다.\n다른 저장 경로를 지정해 주세요.");
        gtk_dialog_run(GTK_DIALOG(w));
        gtk_widget_destroy(w);
        g_free(dest_path);
        return;
    }

    /* 기존 파일 덮어쓰기 확인 */
    if (g_file_test(dest_path, G_FILE_TEST_EXISTS)) {
        char *base = g_path_get_basename(dest_path);
        char *msg  = g_strdup_printf("\"%s\" 파일이 이미 존재합니다. 덮어쓰시겠습니까?", base);
        g_free(base);
        GtkWidget *confirm = gtk_message_dialog_new(
            GTK_WINDOW(app->window), GTK_DIALOG_MODAL,
            GTK_MESSAGE_QUESTION, GTK_BUTTONS_YES_NO, "%s", msg);
        g_free(msg);
        gint r = gtk_dialog_run(GTK_DIALOG(confirm));
        gtk_widget_destroy(confirm);
        if (r != GTK_RESPONSE_YES) { g_free(dest_path); return; }
    }

    /* 백그라운드 변환 시작 */
    ConvertWorkCtx *ctx = g_new0(ConvertWorkCtx, 1);
    ctx->app        = app;
    ctx->src_path   = g_strdup(src_path);
    ctx->dest_path  = dest_path;
    ctx->format     = chosen_fmt;
    ctx->quality    = chosen_quality;

    gtk_app_update_status_file(app, "변환 중…");

    GTask *task = g_task_new(NULL, NULL, convert_bg_done, app);
    g_task_set_task_data(task, ctx, NULL); /* ctx 해제는 convert_bg_done 에서 */
    g_task_run_in_thread(task, convert_bg_worker);
    g_object_unref(task);
}

static void on_convert_menu_activate(GtkMenuItem *item, gpointer data) {
    App *app = data;
    const char *path = g_object_get_data(G_OBJECT(item), "fs-path");
    if (!path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        return;
    }
    show_convert_dialog(app, path);
}

static void on_preview_menu_activate(GtkMenuItem *item, gpointer data) {
    App *app = data;
    const char *path = g_object_get_data(G_OBJECT(item), "fs-path");
    if (!path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        return;
    }
    browser_show_file_for_path(app, path, FALSE);
}

static gboolean path_can_delete(const char *path) {
    char *parent = g_path_get_dirname(path);
    gboolean ok = g_access(parent, W_OK) == 0;
    g_free(parent);
    return ok;
}

static GtkWidget *menu_item_with_path(GtkWidget *menu, const char *label, const char *path,
                                      gboolean is_dir, GCallback activate_cb, App *app) {
    GtkWidget *item = gtk_menu_item_new_with_label(label);
    g_object_set_data_full(G_OBJECT(item), "fs-path", g_strdup(path), g_free);
    g_object_set_data(G_OBJECT(item), "fs-is-dir", GINT_TO_POINTER(is_dir));
    g_signal_connect(item, "activate", activate_cb, app);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), item);
    return item;
}

static void show_file_context_menu(App *app,
                                   GdkEvent *event,
                                   const char *path,
                                   gboolean is_dir,
                                   gboolean restrict_root_ops) {
    GtkWidget *menu = gtk_menu_new();

    if (!is_dir) {
        const char *dot = strrchr(path, '.');
        gboolean is_image = dot && utils_is_image_ext(dot);
        GtkWidget *convert = menu_item_with_path(menu, "변환…", path, FALSE,
                                                 G_CALLBACK(on_convert_menu_activate), app);
        if (!is_image) {
            gtk_widget_set_sensitive(convert, FALSE);
            gtk_widget_set_tooltip_text(convert, "이미지 파일만 변환할 수 있습니다.");
        }

        menu_item_with_path(menu, "미리보기(_P)", path, FALSE,
                            G_CALLBACK(on_preview_menu_activate), app);

        GtkWidget *sep0 = gtk_separator_menu_item_new();
        gtk_menu_shell_append(GTK_MENU_SHELL(menu), sep0);
    }

    GtkWidget *cut = menu_item_with_path(menu, "잘라내기(_X)", path, is_dir,
                                         G_CALLBACK(on_cut_menu_activate), app);
    GtkWidget *copy = menu_item_with_path(menu, "복사(_C)", path, is_dir,
                                          G_CALLBACK(on_copy_menu_activate), app);

    GtkWidget *paste = gtk_menu_item_new_with_label("붙여넣기(_V)");
    if (app->fs_clipboard_path &&
        g_file_test(app->fs_clipboard_path, G_FILE_TEST_EXISTS) &&
        app->current_folder) {
        g_signal_connect(paste, "activate", G_CALLBACK(on_paste_menu_activate), app);
    } else {
        gtk_widget_set_sensitive(paste, FALSE);
    }
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), paste);

    GtkWidget *dup = menu_item_with_path(menu, "복제(_D)", path, is_dir,
                                         G_CALLBACK(on_duplicate_menu_activate), app);

    GtkWidget *sep = gtk_separator_menu_item_new();
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), sep);

    GtkWidget *del = menu_item_with_path(menu, "삭제", path, is_dir,
                                         G_CALLBACK(on_delete_menu_activate), app);
    if (restrict_root_ops) {
        gtk_widget_set_sensitive(cut, FALSE);
        gtk_widget_set_sensitive(copy, FALSE);
        gtk_widget_set_sensitive(dup, FALSE);
        gtk_widget_set_sensitive(del, FALSE);
    } else if (!path_can_delete(path)) {
        gtk_widget_set_sensitive(del, FALSE);
        gtk_widget_set_tooltip_text(del, "쓰기 권한이 없어 삭제할 수 없습니다.");
    }

    gtk_widget_show_all(menu);
    gtk_menu_attach_to_widget(GTK_MENU(menu), app->window, NULL);
    if (event) {
        gtk_menu_popup_at_pointer(GTK_MENU(menu), event);
    } else {
        gtk_menu_popup_at_pointer(GTK_MENU(menu), NULL);
    }
}

void browser_popup_context_menu(App *app, const char *path, gboolean is_dir, GdkEvent *event) {
    if (!app || !path) {
        return;
    }
    if (event &&
        (event->type == GDK_BUTTON_PRESS || event->type == GDK_BUTTON_RELEASE)) {
        app->context_menu_in_progress = TRUE;
        show_file_context_menu(app, event, path, is_dir, FALSE);
        app->context_menu_in_progress = FALSE;
        app->file_selection_skip_preview = FALSE;
        app->tree_selection_skip_navigate = FALSE;
        return;
    }
    browser_queue_context_menu(app, path, is_dir, FALSE, event);
}

void browser_set_gallery_thumb_highlight(App *app, GtkWidget *thumb_btn) {
    if (!app) {
        return;
    }
    if (app->gallery_selected_btn && app->gallery_selected_btn != thumb_btn &&
        gtk_widget_get_parent(app->gallery_selected_btn)) {
        gtk_button_set_relief(GTK_BUTTON(app->gallery_selected_btn), GTK_RELIEF_NONE);
    }
    app->gallery_selected_btn = thumb_btn;
    if (thumb_btn) {
        gtk_button_set_relief(GTK_BUTTON(thumb_btn), GTK_RELIEF_NORMAL);
    }
}

void browser_select_file_for_ui(App *app, const char *path, gboolean via_mouse,
                                gboolean show_preview) {
    (void)via_mouse;
    (void)show_preview;
    if (!app || !path) {
        return;
    }
    browser_select_file_context_only(app, path);
    browser_sync_file_list_to_path(app, path);
}

static void on_paste_menu_activate(GtkMenuItem *item, gpointer data) {
    (void)item;
    browser_action_paste(data);
}

static gboolean on_browser_key_press(GtkWidget *widget, GdkEventKey *event, gpointer data) {
    App *app = data;

    if (event->type != GDK_KEY_PRESS) {
        return FALSE;
    }

    if (widget == GTK_WIDGET(app->folder_entry) ||
        gtk_widget_is_ancestor(GTK_WIDGET(widget), app->folder_entry)) {
        return FALSE;
    }

    GdkModifierType state = event->state & gtk_accelerator_get_default_mod_mask();

    if (state == GDK_CONTROL_MASK && (event->keyval == GDK_KEY_x || event->keyval == GDK_KEY_X)) {
        browser_action_cut(app);
        return TRUE;
    }
    if (state == GDK_CONTROL_MASK && (event->keyval == GDK_KEY_c || event->keyval == GDK_KEY_C)) {
        browser_action_copy(app);
        return TRUE;
    }
    if (state == GDK_CONTROL_MASK && (event->keyval == GDK_KEY_v || event->keyval == GDK_KEY_V)) {
        browser_action_paste(app);
        return TRUE;
    }
    if (state == GDK_CONTROL_MASK && (event->keyval == GDK_KEY_d || event->keyval == GDK_KEY_D)) {
        browser_action_duplicate(app);
        return TRUE;
    }
    if (event->keyval == GDK_KEY_Delete || event->keyval == GDK_KEY_KP_Delete) {
        browser_action_delete(app);
        return TRUE;
    }
    return FALSE;
}

static char *file_path_at_tree_event(App *app, GtkTreeView *view, GdkEvent *event) {
    if (event && (event->type == GDK_BUTTON_PRESS || event->type == GDK_BUTTON_RELEASE)) {
        GtkTreePath *tp = NULL;
        if (tree_view_path_at_button(view, (GdkEventButton *)event, &tp, NULL)) {
            GtkTreeIter iter;
            if (gtk_tree_model_get_iter(GTK_TREE_MODEL(app->file_store), &iter, tp)) {
                gchar *path = NULL;
                gtk_tree_model_get(GTK_TREE_MODEL(app->file_store), &iter,
                                   FILE_COL_PATH, &path, -1);
                gtk_tree_path_free(tp);
                if (path && g_file_test(path, G_FILE_TEST_EXISTS)) {
                    return path;
                }
                g_free(path);
            } else {
                gtk_tree_path_free(tp);
            }
        }
    }

    GtkTreeSelection *sel = gtk_tree_view_get_selection(view);
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, NULL, &iter)) {
        return NULL;
    }
    gchar *path = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->file_store), &iter, FILE_COL_PATH, &path, -1);
    if (path && g_file_test(path, G_FILE_TEST_EXISTS)) {
        return path;
    }
    g_free(path);
    return NULL;
}

static gboolean tree_folder_at_tree_event(App *app,
                                          GtkTreeView *view,
                                          GdkEvent *event,
                                          char **folder_out,
                                          gboolean *is_root_out) {
    GtkTreeIter iter;
    gboolean have_iter = FALSE;

    if (event && (event->type == GDK_BUTTON_PRESS || event->type == GDK_BUTTON_RELEASE)) {
        GtkTreePath *tp = NULL;
        if (tree_view_path_at_button(view, (GdkEventButton *)event, &tp, NULL)) {
            have_iter = gtk_tree_model_get_iter(GTK_TREE_MODEL(app->tree_store), &iter, tp);
            gtk_tree_path_free(tp);
        }
    }

    if (!have_iter) {
        GtkTreeSelection *sel = gtk_tree_view_get_selection(view);
        if (!gtk_tree_selection_get_selected(sel, NULL, &iter)) {
            return FALSE;
        }
    }

    GtkTreeModel *model = GTK_TREE_MODEL(app->tree_store);
    GtkTreeIter parent;
    if (is_root_out) {
        *is_root_out = !gtk_tree_model_iter_parent(model, &parent, &iter);
    }
    return tree_iter_folder_path(app, &iter, folder_out);
}

static gboolean on_tree_popup_menu(GtkWidget *widget, gpointer data) {
    GdkEvent *event = gtk_get_current_event();
    if (event && (event->type == GDK_BUTTON_PRESS || event->type == GDK_BUTTON_RELEASE)) {
        gdk_event_free(event);
        return TRUE;
    }
    gdk_event_free(event);

    App *app = data;
    GtkTreeView *view = GTK_TREE_VIEW(widget);
    char *folder = NULL;
    gboolean is_root = FALSE;
    if (!tree_folder_at_tree_event(app, view, NULL, &folder, &is_root)) {
        return FALSE;
    }
    browser_queue_context_menu(app, folder, TRUE, is_root, NULL);
    g_free(folder);
    return TRUE;
}

static gboolean on_file_popup_menu(GtkWidget *widget, gpointer data) {
    GdkEvent *event = gtk_get_current_event();
    if (event && (event->type == GDK_BUTTON_PRESS || event->type == GDK_BUTTON_RELEASE)) {
        gdk_event_free(event);
        return TRUE;
    }
    gdk_event_free(event);

    App *app = data;
    GtkTreeView *view = GTK_TREE_VIEW(widget);
    char *path = file_path_at_tree_event(app, view, NULL);
    if (!path) {
        return FALSE;
    }
    browser_select_file_context_only(app, path);
    browser_queue_context_menu(app, path, FALSE, FALSE, NULL);
    g_free(path);
    return TRUE;
}

static gboolean on_tree_button_press(GtkWidget *widget, GdkEventButton *event, gpointer data) {
    (void)widget;
    App *app = data;
    if (event->type == GDK_BUTTON_PRESS && event->button == 3) {
        app->tree_selection_skip_navigate = TRUE;
        app->context_menu_in_progress = TRUE;
    }
    return FALSE;
}

static gboolean on_tree_button_release(GtkWidget *widget, GdkEventButton *event, gpointer data) {
    if (event->type != GDK_BUTTON_RELEASE || event->button != 3) {
        return FALSE;
    }

    App *app = data;
    GtkTreeView *view = GTK_TREE_VIEW(widget);

    g_signal_handlers_block_by_func(view, on_tree_cursor_changed, app);
    GtkTreeIter iter;
    gboolean ok = tree_view_select_at_button(view, event, GTK_TREE_MODEL(app->tree_store), &iter);
    g_signal_handlers_unblock_by_func(view, on_tree_cursor_changed, app);
    app->tree_selection_skip_navigate = FALSE;

    if (!ok) {
        app->context_menu_in_progress = FALSE;
        return FALSE;
    }

    GtkTreeModel *model = GTK_TREE_MODEL(app->tree_store);
    GtkTreeIter parent;
    gboolean is_root = !gtk_tree_model_iter_parent(model, &parent, &iter);

    char *folder = NULL;
    if (!tree_iter_folder_path(app, &iter, &folder)) {
        app->context_menu_in_progress = FALSE;
        return TRUE;
    }

    app->context_menu_in_progress = TRUE;
    show_file_context_menu(app, (GdkEvent *)event, folder, TRUE, is_root);
    app->context_menu_in_progress = FALSE;
    app->tree_selection_skip_navigate = FALSE;
    g_free(folder);
    return TRUE;
}

static gboolean on_file_button_press(GtkWidget *widget, GdkEventButton *event, gpointer data) {
    if (event->type != GDK_BUTTON_PRESS) {
        return FALSE;
    }
    if (event->button == 3) {
        App *app = data;
        app->file_selection_skip_preview = TRUE;
        app->context_menu_in_progress = TRUE;
        return FALSE;
    }
    if (event->button != 1) {
        return FALSE;
    }

    App *app = data;
    GtkTreeView *view = GTK_TREE_VIEW(widget);
    GtkTreeSelection *fsel = gtk_tree_view_get_selection(view);

    g_signal_handlers_block_by_func(fsel, on_file_selection_changed, app);
    GtkTreeIter iter;
    gboolean ok = tree_view_select_at_button(view, event, GTK_TREE_MODEL(app->file_store), &iter);
    g_signal_handlers_unblock_by_func(fsel, on_file_selection_changed, app);

    if (!ok) {
        return FALSE;
    }

    gchar *path = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->file_store), &iter, FILE_COL_PATH, &path, -1);
    if (!path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        g_free(path);
        return TRUE;
    }

    browser_show_file_for_path(app, path, TRUE);
    g_free(path);
    return TRUE;
}

static gboolean on_file_button_release(GtkWidget *widget, GdkEventButton *event, gpointer data) {
    if (event->type != GDK_BUTTON_RELEASE || event->button != 3) {
        return FALSE;
    }

    App *app = data;
    GtkTreeView *view = GTK_TREE_VIEW(widget);
    GtkTreeSelection *fsel = gtk_tree_view_get_selection(view);

    g_signal_handlers_block_by_func(fsel, on_file_selection_changed, app);
    GtkTreeIter iter;
    gboolean ok = tree_view_select_at_button(view, event, GTK_TREE_MODEL(app->file_store), &iter);
    g_signal_handlers_unblock_by_func(fsel, on_file_selection_changed, app);

    app->file_selection_skip_preview = FALSE;

    if (!ok) {
        app->context_menu_in_progress = FALSE;
        return FALSE;
    }

    gchar *path = NULL;
    gtk_tree_model_get(GTK_TREE_MODEL(app->file_store), &iter, FILE_COL_PATH, &path, -1);
    if (!path || !g_file_test(path, G_FILE_TEST_EXISTS)) {
        g_free(path);
        app->context_menu_in_progress = FALSE;
        return TRUE;
    }

    browser_show_file_actions_menu(app, path, (GdkEvent *)event);
    g_free(path);
    return TRUE;
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
            gtk_app_set_folder(app, folder);
            g_free(folder);
        }
    }
    gtk_widget_destroy(dlg);
}

void browser_init(App *app) {
    browser_init_icons();

    browser_add_icon_name_column(GTK_TREE_VIEW(app->tree_view), "폴더",
                                 TREE_COL_ICON, TREE_COL_NAME);

    gtk_tree_view_set_activate_on_single_click(GTK_TREE_VIEW(app->tree_view), TRUE);
    g_signal_connect(app->tree_view, "row-expanded", G_CALLBACK(on_tree_row_expanded), app);
    g_signal_connect(app->tree_view, "row-collapsed", G_CALLBACK(on_tree_row_collapsed), app);
    g_signal_connect(app->tree_view, "row-activated", G_CALLBACK(on_tree_row_activated), app);
    g_signal_connect(G_OBJECT(app->tree_view), "cursor-changed", G_CALLBACK(on_tree_cursor_changed), app);

    browser_add_icon_name_column(GTK_TREE_VIEW(app->file_view), "이름",
                                 FILE_COL_ICON, FILE_COL_NAME);

    GtkCellRenderer *r_size = gtk_cell_renderer_text_new();
    GtkCellRenderer *r_mod = gtk_cell_renderer_text_new();
    gtk_tree_view_insert_column_with_attributes(GTK_TREE_VIEW(app->file_view), -1,
                                                "크기", r_size, "text", FILE_COL_SIZE, NULL);
    gtk_tree_view_insert_column_with_attributes(GTK_TREE_VIEW(app->file_view), -1,
                                                "수정", r_mod, "text", FILE_COL_MODIFIED, NULL);

    GtkTreeSelection *fsel = gtk_tree_view_get_selection(GTK_TREE_VIEW(app->file_view));
    gtk_tree_selection_set_mode(fsel, GTK_SELECTION_SINGLE);
    g_signal_connect(fsel, "changed", G_CALLBACK(on_file_selection_changed), app);

    gtk_widget_add_events(app->tree_view,
                          GDK_BUTTON_PRESS_MASK | GDK_BUTTON_RELEASE_MASK | GDK_KEY_PRESS_MASK);
    gtk_widget_add_events(app->file_view,
                          GDK_BUTTON_PRESS_MASK | GDK_BUTTON_RELEASE_MASK | GDK_KEY_PRESS_MASK);
    gtk_widget_set_can_focus(app->tree_view, TRUE);
    gtk_widget_set_can_focus(app->file_view, TRUE);
    g_signal_connect(app->tree_view, "popup-menu", G_CALLBACK(on_tree_popup_menu), app);
    g_signal_connect(app->tree_view, "button-press-event",
                     G_CALLBACK(on_tree_button_press), app);
    g_signal_connect(app->tree_view, "button-release-event",
                     G_CALLBACK(on_tree_button_release), app);
    g_signal_connect(app->file_view, "popup-menu", G_CALLBACK(on_file_popup_menu), app);
    g_signal_connect(app->file_view, "button-press-event",
                     G_CALLBACK(on_file_button_press), app);
    g_signal_connect(app->file_view, "button-release-event",
                     G_CALLBACK(on_file_button_release), app);
    g_signal_connect(app->tree_view, "key-press-event", G_CALLBACK(on_browser_key_press), app);
    g_signal_connect(app->file_view, "key-press-event", G_CALLBACK(on_browser_key_press), app);
}

void browser_connect_shortcuts(App *app) {
    gtk_widget_add_events(app->window, GDK_KEY_PRESS_MASK);
    g_signal_connect(app->window, "key-press-event", G_CALLBACK(on_browser_key_press), app);

    if (app->gallery_scrolled) {
        gtk_widget_add_events(app->gallery_scrolled, GDK_KEY_PRESS_MASK);
        gtk_widget_set_can_focus(app->gallery_scrolled, TRUE);
        g_signal_connect(app->gallery_scrolled, "key-press-event",
                         G_CALLBACK(on_browser_key_press), app);
    }
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
                       TREE_COL_ICON, browser_get_folder_list_icon(FALSE),
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

typedef struct {
    BrowserIconKind icon_kind;
    char *name;
    char *size;
    char *modified;
    char *path;
} FileRowData;

typedef struct {
    guint generation;
    char *folder;
    char *select_after;
    gboolean show_gallery;
    GPtrArray *rows;
    int subdirs;
    int previewable;
} FolderScanResult;

static void file_row_free(gpointer p) {
    FileRowData *row = p;
    g_free(row->name);
    g_free(row->size);
    g_free(row->modified);
    g_free(row->path);
    g_free(row);
}

static void folder_scan_result_free(FolderScanResult *res) {
    if (!res) {
        return;
    }
    if (res->rows) {
        g_ptr_array_free(res->rows, TRUE);
    }
    g_free(res->folder);
    g_free(res->select_after);
    g_free(res);
}

static FolderScanResult *scan_folder_background(const char *folder) {
    FolderScanResult *res = g_new0(FolderScanResult, 1);
    res->folder = g_strdup(folder);
    res->rows = g_ptr_array_new_with_free_func(file_row_free);

    GDir *dir = g_dir_open(folder, 0, NULL);
    if (!dir) {
        return res;
    }

    GPtrArray *files = g_ptr_array_new();
    const gchar *name;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (name[0] == '.') {
            continue;
        }
        char *path = g_build_filename(folder, name, NULL);
        if (g_file_test(path, G_FILE_TEST_IS_DIR)) {
            res->subdirs++;
        } else if (g_file_test(path, G_FILE_TEST_IS_REGULAR)) {
            const char *ext = path_ext(path);
            if (utils_is_previewable_ext(ext)) {
                res->previewable++;
                g_ptr_array_add(files, path);
            } else {
                g_free(path);
            }
        } else {
            g_free(path);
        }
    }
    g_dir_close(dir);
    g_ptr_array_sort(files, cmp_str);

    for (guint i = 0; i < files->len; i++) {
        const char *path = g_ptr_array_index(files, i);
        struct stat st;
        if (g_stat(path, &st) != 0) {
            continue;
        }
        FileRowData *row = g_new0(FileRowData, 1);
        row->icon_kind = browser_file_icon_kind(path);
        row->name = g_strdup(g_path_get_basename(path));
        row->size = utils_format_file_size((int64_t)st.st_size);
        row->modified = utils_format_mtime(st.st_mtime);
        row->path = g_strdup(path);
        g_ptr_array_add(res->rows, row);
    }

    for (guint i = 0; i < files->len; i++) {
        g_free(g_ptr_array_index(files, i));
    }
    g_ptr_array_free(files, TRUE);
    return res;
}

typedef struct {
    guint generation;
    char *folder;
    char *select_after;
    gboolean show_gallery;
} FolderScanRequest;

static void folder_scan_request_free(FolderScanRequest *req) {
    if (!req) {
        return;
    }
    g_free(req->folder);
    g_free(req->select_after);
    g_free(req);
}

static void folder_scan_worker(GTask *task, gpointer source, gpointer data, GCancellable *cancel) {
    (void)source;
    (void)cancel;
    FolderScanRequest *req = data;
    FolderScanResult *res = scan_folder_background(req->folder);
    res->generation = req->generation;
    res->show_gallery = req->show_gallery;
    res->select_after = g_strdup(req->select_after);
    g_task_return_pointer(task, res, (GDestroyNotify)folder_scan_result_free);
}

static void apply_folder_scan(App *app, FolderScanResult *res) {
    GtkTreeSelection *fsel =
        gtk_tree_view_get_selection(GTK_TREE_VIEW(app->file_view));
    g_signal_handlers_block_by_func(fsel, on_file_selection_changed, app);
    gtk_list_store_clear(app->file_store);

    for (guint i = 0; i < res->rows->len; i++) {
        FileRowData *row = g_ptr_array_index(res->rows, i);
        GtkTreeIter iter;
        gtk_list_store_append(app->file_store, &iter);
        gtk_list_store_set(app->file_store, &iter,
                           FILE_COL_ICON, browser_get_file_list_icon(row->path),
                           FILE_COL_NAME, row->name,
                           FILE_COL_SIZE, row->size,
                           FILE_COL_MODIFIED, row->modified,
                           FILE_COL_PATH, row->path,
                           -1);
    }

    char *msg = g_strdup_printf(
        "디렉토리: %s | 하위 폴더: %d개 | 미리보기 파일: %d개",
        res->folder, res->subdirs, res->previewable);
    gtk_label_set_text(GTK_LABEL(app->status_dir), msg);
    g_free(msg);

    browser_refresh_folder_tree_node(app, res->folder);

    /* 갤러리는 browser_show_folder_contents 에서 즉시 표시; 스캔 완료 시 파일만 선택된 경우 덮어쓰지 않음 */
    if (res->show_gallery) {
        GtkTreeSelection *fsel =
            gtk_tree_view_get_selection(GTK_TREE_VIEW(app->file_view));
        if (!gtk_tree_selection_get_selected(fsel, NULL, NULL)) {
            preview_show_gallery(app, res->folder);
        }
    }

    if (res->select_after && g_file_test(res->select_after, G_FILE_TEST_EXISTS)) {
        browser_select_file_by_path(app, res->select_after);
        g_free(app->selected_file);
        app->selected_file = g_strdup(res->select_after);

        struct stat st;
        if (g_stat(res->select_after, &st) == 0) {
            char *sz = utils_format_file_size((int64_t)st.st_size);
            char *mt = utils_format_mtime(st.st_mtime);
            char *status = g_strdup_printf(
                "파일: %s | 크기: %s | 수정: %s | 형식: %s",
                g_path_get_basename(res->select_after), sz, mt,
                path_ext(res->select_after));
            gtk_app_update_status_file(app, status);
            g_free(status);
            g_free(sz);
            g_free(mt);
        }
    }

    g_signal_handlers_unblock_by_func(fsel, on_file_selection_changed, app);
}

static void folder_scan_done_cb(GObject *source, GAsyncResult *result, gpointer user_data) {
    (void)source;
    App *app = user_data;
    GError *task_err = NULL;
    FolderScanResult *res = g_task_propagate_pointer(G_TASK(result), &task_err);
    if (!res) {
        g_clear_error(&task_err);
        return;
    }

    if (res->generation != app->folder_scan_gen) {
        folder_scan_result_free(res);
        return;
    }

    apply_folder_scan(app, res);
    folder_scan_result_free(res);
}

void app_refresh_file_list(App *app, const char *folder, gboolean show_gallery_after,
                           const char *select_path_after) {
    if (!folder || !*folder) {
        return;
    }

    app->folder_scan_gen++;
    guint gen = app->folder_scan_gen;

    FolderScanRequest *req = g_new0(FolderScanRequest, 1);
    req->generation = gen;
    req->folder = g_strdup(folder);
    req->show_gallery = show_gallery_after;
    if (select_path_after) {
        req->select_after = g_strdup(select_path_after);
    }

    gtk_app_update_status_file(app, "파일 목록을 불러오는 중…");

    GTask *task = g_task_new(NULL, NULL, folder_scan_done_cb, app);
    g_task_set_task_data(task, req, (GDestroyNotify)folder_scan_request_free);
    g_task_run_in_thread(task, folder_scan_worker);
    g_object_unref(task);
}

/* pick-folder button callback */
void browser_connect_pick_button(App *app, GtkWidget *btn) {
    g_signal_connect(btn, "clicked", G_CALLBACK(on_pick_folder), app);
}

static void tree_clear_children(GtkTreeStore *store, GtkTreeIter *parent) {
    GtkTreeIter child;
    while (gtk_tree_model_iter_children(GTK_TREE_MODEL(store), &child, parent)) {
        gtk_tree_store_remove(store, &child);
    }
}

static void tree_force_refresh_children(App *app, GtkTreeIter *parent);

static gboolean tree_find_iter_by_path(GtkTreeModel *model,
                                        GtkTreeIter *parent,
                                        const char *path,
                                        GtkTreeIter *out) {
    GtkTreeIter child;
    if (!gtk_tree_model_iter_children(model, &child, parent)) {
        return FALSE;
    }
    do {
        gchar *node_path = NULL;
        gtk_tree_model_get(model, &child, TREE_COL_PATH, &node_path, -1);
        if (node_path && g_strcmp0(node_path, path) == 0) {
            *out = child;
            g_free(node_path);
            return TRUE;
        }
        if (tree_find_iter_by_path(model, &child, path, out)) {
            g_free(node_path);
            return TRUE;
        }
        g_free(node_path);
    } while (gtk_tree_model_iter_next(model, &child));
    return FALSE;
}

static void browser_refresh_folder_tree_node(App *app, const char *folder) {
    if (!folder || !*folder) {
        return;
    }

    GtkTreeModel *model = GTK_TREE_MODEL(app->tree_store);
    GtkTreeIter root;
    if (!gtk_tree_model_get_iter_first(model, &root)) {
        return;
    }

    gchar *root_path = NULL;
    gtk_tree_model_get(model, &root, TREE_COL_PATH, &root_path, -1);
    GtkTreeIter *target = NULL;
    GtkTreeIter found;

    if (root_path && g_strcmp0(root_path, folder) == 0) {
        target = &root;
    } else if (tree_find_iter_by_path(model, &root, folder, &found)) {
        target = &found;
    }

    if (target) {
        tree_force_refresh_children(app, target);
        GtkTreePath *tp = gtk_tree_model_get_path(model, target);
        gtk_tree_view_expand_row(GTK_TREE_VIEW(app->tree_view), tp, FALSE);
        gtk_tree_path_free(tp);
    }
    g_free(root_path);
}

static void browser_select_file_by_path(App *app, const char *path) {
    if (!path) {
        return;
    }

    GtkTreeIter iter;
    gboolean valid =
        gtk_tree_model_get_iter_first(GTK_TREE_MODEL(app->file_store), &iter);
    GtkTreeSelection *fsel =
        gtk_tree_view_get_selection(GTK_TREE_VIEW(app->file_view));

    while (valid) {
        gchar *fp = NULL;
        gtk_tree_model_get(GTK_TREE_MODEL(app->file_store), &iter,
                           FILE_COL_PATH, &fp, -1);
        if (fp && g_ascii_strcasecmp(fp, path) == 0) {
            GtkTreePath *tp =
                gtk_tree_model_get_path(GTK_TREE_MODEL(app->file_store), &iter);
            g_signal_handlers_block_by_func(fsel, on_file_selection_changed, app);
            gtk_tree_selection_select_iter(fsel, &iter);
            browser_tree_scroll_to_row(GTK_TREE_VIEW(app->file_view), tp);
            gtk_tree_path_free(tp);
            g_signal_handlers_unblock_by_func(fsel, on_file_selection_changed, app);
            g_free(fp);
            return;
        }
        g_free(fp);
        valid = gtk_tree_model_iter_next(GTK_TREE_MODEL(app->file_store), &iter);
    }
}

void browser_refresh_after_heif_commit(App *app, const char *jpg_path,
                                       const char *heif_source_path) {
    if (!app->current_folder || !jpg_path) {
        return;
    }

    browser_refresh_folder_tree_node(app, app->current_folder);

    /* 변환 직후 목록을 즉시 갱신 (비동기 스캔 경쟁으로 목록이 어긋나는 것 방지) */
    FolderScanResult *res = scan_folder_background(app->current_folder);
    if (!res) {
        return;
    }
    res->select_after = g_strdup(jpg_path);
    res->show_gallery = FALSE;
    apply_folder_scan(app, res);
    folder_scan_result_free(res);

    /* .hif 이동이 유발할 폴더 감시 이벤트를 1회 억제 — 동기 스캔으로 이미 반영됨 */
    app->heif_commit_refresh_pending = TRUE;
    if (app->folder_refresh_pending) {
        g_source_remove(app->folder_refresh_pending);
        app->folder_refresh_pending = 0;
    }

    const char *jpg_base = g_path_get_basename(jpg_path);
    const char *src_base =
        (heif_source_path && *heif_source_path) ? g_path_get_basename(heif_source_path)
                                                : NULL;
    struct stat st;
    if (g_stat(jpg_path, &st) == 0) {
        char *sz = utils_format_file_size((int64_t)st.st_size);
        char *mt = utils_format_mtime(st.st_mtime);
        char *msg = src_base
                        ? g_strdup_printf(
                              "HIF/HEIF 변환 완료: %s → %s | 크기: %s | 수정: %s",
                              src_base, jpg_base, sz, mt)
                        : g_strdup_printf(
                              "HIF/HEIF 변환 완료 · %s | 크기: %s | 수정: %s",
                              jpg_base, sz, mt);
        gtk_app_update_status_file(app, msg);
        g_free(msg);
        g_free(sz);
        g_free(mt);
    } else {
        char *msg = src_base
                        ? g_strdup_printf("HIF/HEIF 변환 완료: %s → %s", src_base,
                                          jpg_base)
                        : g_strdup_printf("HIF/HEIF 변환 완료 · %s", jpg_base);
        gtk_app_update_status_file(app, msg);
        g_free(msg);
    }

    /* 변환 후 갤러리 재구성 — preview_op_gen 을 올리지 않아 완료 상태가 유지됨 */
    if (app->current_folder && g_file_test(app->current_folder, G_FILE_TEST_IS_DIR)) {
        preview_refresh_gallery(app, app->current_folder);
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

void browser_revalidate_file_selection(App *app) {
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
        const char *page =
            gtk_stack_get_visible_child_name(GTK_STACK(app->preview_stack));
        if (!page || g_strcmp0(page, "gallery") != 0) {
            preview_show_placeholder(app, "파일을 선택하면 정보가 표시됩니다.");
            gtk_app_update_status_file(app, "파일을 선택하면 정보가 표시됩니다.");
        }
    }
    g_free(path);
}

void browser_refresh_folder_view(App *app) {
    if (!app->current_folder) {
        return;
    }

    app_refresh_file_list(app, app->current_folder, FALSE, NULL);
    browser_refresh_folder_tree_node(app, app->current_folder);
}

void browser_refresh_views(App *app) {
    if (!app->current_folder) {
        return;
    }

    const char *page =
        gtk_stack_get_visible_child_name(GTK_STACK(app->preview_stack));
    if (page && (g_strcmp0(page, "image") == 0 || g_strcmp0(page, "video") == 0)) {
        browser_refresh_folder_view(app);
        browser_revalidate_file_selection(app);
        return;
    }

    /* 갤러리 표시 중에는 목록만 갱신 — 썸네일 로딩을 반복 초기화하지 않음 */
    if (page && g_strcmp0(page, "gallery") == 0) {
        browser_refresh_folder_view(app);
        return;
    }

    browser_show_folder_contents(app, app->current_folder, TRUE);
    browser_revalidate_file_selection(app);
}

static gboolean folder_refresh_debounce(gpointer data) {
    App *app = data;
    app->folder_refresh_pending = 0;
    browser_refresh_views(app);
    return G_SOURCE_REMOVE;
}

static void schedule_folder_refresh(App *app) {
    if (app->heif_commit_refresh_pending) {
        app->heif_commit_refresh_pending = FALSE;
        if (app->folder_refresh_pending) {
            g_source_remove(app->folder_refresh_pending);
            app->folder_refresh_pending = 0;
        }
        return;
    }
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
