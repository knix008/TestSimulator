#include "main_window.h"

#define APP_DISPLAY_NAME "Command Center V1.0"

#include "app_icon.h"
#include "bookmark_manager.h"
#include "file_ops.h"
#include "file_ops_conflict.h"
#include "file_panel.h"
#include "preview_panel.h"
#include "search_dialog.h"
#include "session_settings.h"

struct MainWindow {
    GtkWidget *window;
    GtkWidget *status_label;
    GtkWidget *left_panel;
    GtkWidget *right_panel;
    GtkWidget *preview_panel;
    GtkWidget *lr_paned;
    GtkWidget *main_paned;
    GtkWidget *active_panel;
    int lr_paned_last_width;
    BookmarkManager *bookmarks;
    SessionSettings *session;
};

static void show_error(MainWindow *win, const char *msg) {
    GtkWidget *dlg = gtk_message_dialog_new(GTK_WINDOW(win->window), GTK_DIALOG_MODAL,
        GTK_MESSAGE_ERROR, GTK_BUTTONS_OK, "%s", msg);
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

void main_window_show_status(MainWindow *win, const char *message) {
    gtk_label_set_text(GTK_LABEL(win->status_label), message);
}

static GtkWidget *toolbar_icon(const char *icon_name, const char *fallback) {
    GtkIconTheme *theme = gtk_icon_theme_get_default();
    GtkWidget *image = gtk_image_new();
    GdkPixbuf *pixbuf = gtk_icon_theme_load_icon(
        theme, icon_name, GTK_ICON_SIZE_MENU, GTK_ICON_LOOKUP_USE_BUILTIN, NULL);
    if (!pixbuf && fallback)
        pixbuf = gtk_icon_theme_load_icon(
            theme, fallback, GTK_ICON_SIZE_MENU, GTK_ICON_LOOKUP_USE_BUILTIN, NULL);
    if (pixbuf) {
        gtk_image_set_from_pixbuf(GTK_IMAGE(image), pixbuf);
        g_object_unref(pixbuf);
    }
    return image;
}

static GtkToolItem *toolbar_add_button(GtkToolbar *toolbar, const char *icon_name,
                                       const char *fallback, const char *label,
                                       const char *tooltip, GCallback callback,
                                       gpointer data) {
    GtkWidget *btn = gtk_button_new();
    gtk_button_set_relief(GTK_BUTTON(btn), GTK_RELIEF_NONE);
    gtk_widget_set_tooltip_text(btn, tooltip ? tooltip : label);

    GtkWidget *hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    GtkWidget *icon = toolbar_icon(icon_name, fallback);
    GtkWidget *lbl = gtk_label_new(label);
    gtk_box_pack_start(GTK_BOX(hbox), icon, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(hbox), lbl, FALSE, FALSE, 0);
    gtk_container_add(GTK_CONTAINER(btn), hbox);

    GtkToolItem *item = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(item), btn);
    gtk_tool_item_set_is_important(GTK_TOOL_ITEM(item), TRUE);
    g_signal_connect(btn, "clicked", callback, data);
    gtk_toolbar_insert(toolbar, item, -1);
    return item;
}

GtkWidget *main_window_get_widget(MainWindow *win) {
    return win->window;
}

static GtkWidget *other_panel(MainWindow *win, GtkWidget *panel) {
    return panel == win->left_panel ? win->right_panel : win->left_panel;
}

static void show_transfer_status(MainWindow *win, const char *verb,
                                 const char *dest_path, FileOpsTransferStats *st) {
    char *msg = NULL;
    if (st->skipped > 0)
        msg = g_strdup_printf("%u개 %s, %u개 건너뜀 — '%s'",
                              st->copied, verb, st->skipped, dest_path);
    else
        msg = g_strdup_printf("%u개 항목을 '%s'에 %s했습니다.",
                              st->copied, dest_path, verb);
    main_window_show_status(win, msg);
    g_free(msg);
}

static void copy_between_panels(MainWindow *win, GtkWidget *src, GtkWidget *dest) {
    GPtrArray *paths = file_panel_get_selected_paths(src);
    if (paths->len == 0) {
        main_window_show_status(win, "복사할 항목을 선택하세요.");
        g_ptr_array_free(paths, TRUE);
        return;
    }
    const char *dest_path = file_panel_get_current_path(dest);
    FileOpsConflictState conflict;
    FileOpsTransferStats stats;
    file_ops_conflict_reset(&conflict);
    GError *err = NULL;
    if (file_ops_copy_files(paths, dest_path, GTK_WINDOW(win->window), &conflict,
                            NULL, NULL, &stats, &err)) {
        file_panel_refresh(dest);
        if (stats.copied > 0 || stats.skipped > 0)
            show_transfer_status(win, "복사", dest_path, &stats);
        else
            main_window_show_status(win, "복사할 항목이 없습니다.");
    } else {
        main_window_show_status(win, err ? err->message : "복사 실패");
        if (err && !g_error_matches(err, G_IO_ERROR, G_IO_ERROR_CANCELLED))
            show_error(win, err->message);
        g_clear_error(&err);
    }
    g_ptr_array_free(paths, TRUE);
}

static void move_between_panels(MainWindow *win, GtkWidget *src, GtkWidget *dest) {
    GPtrArray *paths = file_panel_get_selected_paths(src);
    if (paths->len == 0) {
        main_window_show_status(win, "이동할 항목을 선택하세요.");
        g_ptr_array_free(paths, TRUE);
        return;
    }
    const char *dest_path = file_panel_get_current_path(dest);
    FileOpsConflictState conflict;
    FileOpsTransferStats stats;
    file_ops_conflict_reset(&conflict);
    GError *err = NULL;
    if (file_ops_move_files(paths, dest_path, GTK_WINDOW(win->window), &conflict,
                            NULL, NULL, &stats, &err)) {
        file_panel_refresh(src);
        file_panel_refresh(dest);
        if (stats.copied > 0 || stats.skipped > 0)
            show_transfer_status(win, "이동", dest_path, &stats);
        else
            main_window_show_status(win, "이동할 항목이 없습니다.");
    } else {
        main_window_show_status(win, err ? err->message : "이동 실패");
        if (err && !g_error_matches(err, G_IO_ERROR, G_IO_ERROR_CANCELLED))
            show_error(win, err->message);
        g_clear_error(&err);
    }
    g_ptr_array_free(paths, TRUE);
}

static void on_copy_active(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    copy_between_panels(win, win->active_panel, other_panel(win, win->active_panel));
}

static void on_move_active(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    move_between_panels(win, win->active_panel, other_panel(win, win->active_panel));
}

static void on_left_copy(GtkWidget *panel, gpointer data) {
    (void)panel;
    MainWindow *win = data;
    copy_between_panels(win, win->left_panel, win->right_panel);
}

static void on_left_move(GtkWidget *panel, gpointer data) {
    (void)panel;
    MainWindow *win = data;
    move_between_panels(win, win->left_panel, win->right_panel);
}

static void on_right_copy(GtkWidget *panel, gpointer data) {
    (void)panel;
    MainWindow *win = data;
    copy_between_panels(win, win->right_panel, win->left_panel);
}

static void on_right_move(GtkWidget *panel, gpointer data) {
    (void)panel;
    MainWindow *win = data;
    move_between_panels(win, win->right_panel, win->left_panel);
}

static void on_left_focus(GtkWidget *panel, gpointer data) {
    (void)panel;
    MainWindow *win = data;
    win->active_panel = win->left_panel;
    char *msg = g_strdup_printf("왼쪽 패널 활성  |  %s",
                                file_panel_get_current_path(win->left_panel));
    main_window_show_status(win, msg);
    g_free(msg);
}

static void on_right_focus(GtkWidget *panel, gpointer data) {
    (void)panel;
    MainWindow *win = data;
    win->active_panel = win->right_panel;
    char *msg = g_strdup_printf("오른쪽 패널 활성  |  %s",
                                file_panel_get_current_path(win->right_panel));
    main_window_show_status(win, msg);
    g_free(msg);
}

static void on_selection_changed(GtkWidget *panel, GPtrArray *paths, gpointer data) {
    (void)panel;
    MainWindow *win = data;
    if (paths->len == 1) {
        const char *path = g_ptr_array_index(paths, 0);
        if (g_file_test(path, G_FILE_TEST_IS_REGULAR))
            preview_panel_show_file(win->preview_panel, path);
    } else if (paths->len == 0) {
        preview_panel_clear(win->preview_panel);
    }
}

static void on_search_file_selected(const char *path, gpointer data) {
    MainWindow *win = data;
    char *dir = g_path_get_dirname(path);
    file_panel_navigate(win->active_panel, dir);
    char *msg = g_strdup_printf("검색 결과: %s", path);
    main_window_show_status(win, msg);
    g_free(msg);
    g_free(dir);
}

static void on_search_clicked(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    const char *root = file_panel_get_current_path(win->active_panel);
    search_dialog_new(GTK_WINDOW(win->window), root,
                      on_search_file_selected, win);
}

static void on_toggle_preview(GtkCheckMenuItem *item, gpointer data) {
    MainWindow *win = data;
    if (gtk_check_menu_item_get_active(item)) {
        gtk_widget_show(win->preview_panel);
        gtk_paned_set_position(GTK_PANED(win->main_paned), 500);
    } else {
        gtk_widget_hide(win->preview_panel);
    }
    main_window_show_status(win,
        gtk_check_menu_item_get_active(item)
            ? "미리보기 패널 표시됨" : "미리보기 패널 숨김");
}

static void on_refresh_all(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    file_panel_refresh(win->left_panel);
    file_panel_refresh(win->right_panel);
    main_window_show_status(win, "새로고침 완료");
}

static void on_bookmark_add(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    gboolean left = GPOINTER_TO_INT(g_object_get_data(G_OBJECT(item), "side")) == 0;
    GtkWidget *panel = left ? win->left_panel : win->right_panel;
    const char *path = file_panel_get_current_path(panel);
    const char *name = g_path_get_basename(path);
    if (!name || !*name) name = path;
    if (bookmark_manager_add(win->bookmarks, path, name)) {
        char *msg = g_strdup_printf("'%s' 즐겨찾기에 추가됨", name);
        main_window_show_status(win, msg);
        g_free(msg);
    } else {
        main_window_show_status(win, "이미 즐겨찾기에 있습니다.");
    }
}

static void on_bookmark_navigate(GtkMenuItem *item, gpointer data) {
    MainWindow *win = data;
    const char *path = g_object_get_data(G_OBJECT(item), "bm-path");
    if (path && g_file_test(path, G_FILE_TEST_IS_DIR))
        file_panel_navigate(win->active_panel, path);
    else {
        char *msg = g_strdup_printf("경로를 찾을 수 없습니다: %s", path ? path : "");
        main_window_show_status(win, msg);
        g_free(msg);
    }
}

static void on_bookmark_menu_show(GtkWidget *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    GtkWidget *menu = g_object_get_data(G_OBJECT(item), "bookmark-submenu");
    if (!menu) return;

    GList *children = gtk_container_get_children(GTK_CONTAINER(menu));
    for (GList *l = children; l; l = l->next) gtk_widget_destroy(GTK_WIDGET(l->data));
    g_list_free(children);

    GPtrArray *bms = bookmark_manager_get_all(win->bookmarks);
    for (guint i = 0; i < bms->len; i++) {
        BookmarkEntry *bm = g_ptr_array_index(bms, i);
        GtkWidget *mi = gtk_menu_item_new_with_label(bm->name);
        g_object_set_data(G_OBJECT(mi), "bm-path", (gpointer)bm->path);
        g_signal_connect(mi, "activate", G_CALLBACK(on_bookmark_navigate), win);
        gtk_menu_shell_append(GTK_MENU_SHELL(menu), mi);
    }
}

static gboolean center_lr_paned_idle(gpointer data) {
    MainWindow *win = data;
    GtkAllocation alloc;
    gtk_widget_get_allocation(win->lr_paned, &alloc);
    if (alloc.width > 0) {
        gtk_paned_set_position(GTK_PANED(win->lr_paned), alloc.width / 2);
        win->lr_paned_last_width = alloc.width;
    }
    return G_SOURCE_REMOVE;
}

static void on_lr_paned_size_allocate(GtkWidget *widget, GdkRectangle *allocation,
                                      gpointer data) {
    MainWindow *win = data;
    if (allocation->width <= 0)
        return;
    if (win->lr_paned_last_width < 0) {
        g_idle_add(center_lr_paned_idle, win);
        return;
    }
    if (win->lr_paned_last_width == allocation->width)
        return;
    win->lr_paned_last_width = allocation->width;
    gtk_paned_set_position(GTK_PANED(widget), allocation->width / 2);
}

static gboolean startup_load_panels_idle(gpointer data) {
    MainWindow *win = data;
    file_panel_load_contents(win->left_panel);
    file_panel_load_contents(win->right_panel);
    return G_SOURCE_REMOVE;
}

static void style_lr_paned(GtkWidget *paned) {
    gtk_widget_set_name(paned, "lr-paned");
    gtk_paned_set_wide_handle(GTK_PANED(paned), TRUE);
    GtkCssProvider *css = gtk_css_provider_new();
    gtk_css_provider_load_from_data(css,
        "#lr-paned.horizontal > separator {"
        "  min-width: 14px;"
        "}",
        -1, NULL);
    gtk_style_context_add_provider(
        gtk_widget_get_style_context(paned),
        GTK_STYLE_PROVIDER(css),
        GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
}

static void on_window_delete(GtkWidget *w, GdkEvent *e, gpointer data) {
    (void)e;
    MainWindow *win = data;
    int pos = gtk_paned_get_position(GTK_PANED(win->lr_paned));
    session_settings_save(win->session,
                          file_panel_get_current_path(win->left_panel),
                          file_panel_get_current_path(win->right_panel),
                          pos);
    gtk_widget_destroy(w);
}

static void on_new_folder_menu(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    file_panel_request_new_folder(win->active_panel);
}

static void on_new_file_menu(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    file_panel_request_new_file(win->active_panel);
}

static void on_rename_menu(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    file_panel_begin_rename(win->active_panel);
}

static void on_delete_menu(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    file_panel_request_delete(win->active_panel);
}

static gboolean on_key_press(GtkWidget *w, GdkEventKey *event, gpointer data) {
    (void)w;
    MainWindow *win = data;
    switch (event->keyval) {
    case GDK_KEY_F2:
        file_panel_begin_rename(win->active_panel);
        return TRUE;
    case GDK_KEY_F5:
        on_copy_active(NULL, win);
        return TRUE;
    case GDK_KEY_F6:
        on_move_active(NULL, win);
        return TRUE;
    case GDK_KEY_F7:
        file_panel_request_new_folder(win->active_panel);
        return TRUE;
    case GDK_KEY_F8:
        file_panel_request_delete(win->active_panel);
        return TRUE;
    case GDK_KEY_F9:
        on_search_clicked(NULL, win);
        return TRUE;
    default:
        break;
    }
    return FALSE;
}

MainWindow *main_window_new(GtkApplication *app) {
    MainWindow *win = g_new0(MainWindow, 1);
    win->bookmarks = bookmark_manager_new();
    win->session = session_settings_new();
    session_settings_load(win->session);

    win->window = gtk_application_window_new(app);
    app_icon_apply(GTK_WINDOW(win->window));
    gtk_window_set_title(GTK_WINDOW(win->window), APP_DISPLAY_NAME);
    gtk_window_set_default_size(GTK_WINDOW(win->window), 1280, 780);
    gtk_window_set_position(GTK_WINDOW(win->window), GTK_WIN_POS_CENTER);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(win->window), vbox);

    GtkWidget *menubar = gtk_menu_bar_new();

    GtkWidget *file_menu = gtk_menu_new();
    GtkWidget *file_item = gtk_menu_item_new_with_mnemonic("파일(_F)");
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(file_item), file_menu);
    GtkWidget *new_folder = gtk_menu_item_new_with_label("새 폴더");
    GtkWidget *new_file = gtk_menu_item_new_with_label("새 파일");
    GtkWidget *quit = gtk_menu_item_new_with_label("종료");
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), new_folder);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), new_file);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), quit);

    GtkWidget *edit_menu = gtk_menu_new();
    GtkWidget *edit_item = gtk_menu_item_new_with_mnemonic("편집(_E)");
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(edit_item), edit_menu);
    GtkWidget *copy_item = gtk_menu_item_new_with_label("→ 복사 (F5)");
    GtkWidget *move_item = gtk_menu_item_new_with_label("→ 이동 (F6)");
    GtkWidget *rename_item = gtk_menu_item_new_with_label("이름 바꾸기 (F2)");
    GtkWidget *delete_item = gtk_menu_item_new_with_label("삭제 (F8)");
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu), copy_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu), move_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu), rename_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu), delete_item);

    GtkWidget *view_menu = gtk_menu_new();
    GtkWidget *view_item = gtk_menu_item_new_with_mnemonic("보기(_V)");
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(view_item), view_menu);
    GtkWidget *preview_check = gtk_check_menu_item_new_with_label("미리보기 패널 표시");
    GtkWidget *refresh_item = gtk_menu_item_new_with_label("새로고침");
    GtkWidget *search_item = gtk_menu_item_new_with_label("검색 (F9)");
    gtk_menu_shell_append(GTK_MENU_SHELL(view_menu), preview_check);
    gtk_menu_shell_append(GTK_MENU_SHELL(view_menu), refresh_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(view_menu), search_item);

    GtkWidget *bm_menu = gtk_menu_new();
    GtkWidget *bm_item = gtk_menu_item_new_with_mnemonic("즐겨찾기(_B)");
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(bm_item), bm_menu);
    GtkWidget *bm_add_left = gtk_menu_item_new_with_label("현재 폴더 추가 (왼쪽)");
    GtkWidget *bm_add_right = gtk_menu_item_new_with_label("현재 폴더 추가 (오른쪽)");
    GtkWidget *bm_list_menu = gtk_menu_new();
    GtkWidget *bm_list_item = gtk_menu_item_new_with_label("즐겨찾기 목록");
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(bm_list_item), bm_list_menu);
    gtk_menu_shell_append(GTK_MENU_SHELL(bm_menu), bm_add_left);
    gtk_menu_shell_append(GTK_MENU_SHELL(bm_menu), bm_add_right);
    gtk_menu_shell_append(GTK_MENU_SHELL(bm_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(bm_menu), bm_list_item);

    gtk_menu_shell_append(GTK_MENU_SHELL(menubar), file_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(menubar), edit_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(menubar), view_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(menubar), bm_item);
    gtk_box_pack_start(GTK_BOX(vbox), menubar, FALSE, FALSE, 0);

    GtkWidget *toolbar = gtk_toolbar_new();
    GtkToolbar *tb = GTK_TOOLBAR(toolbar);
    gtk_toolbar_set_icon_size(tb, GTK_ICON_SIZE_LARGE_TOOLBAR);
    toolbar_add_button(tb, "folder-new", "gtk-directory", "새 폴더", "새 폴더 (F7)",
                       G_CALLBACK(on_new_folder_menu), win);
    toolbar_add_button(tb, "document-new", "gtk-new", "새 파일", "새 파일",
                       G_CALLBACK(on_new_file_menu), win);
    gtk_toolbar_insert(tb, gtk_separator_tool_item_new(), -1);
    toolbar_add_button(tb, "edit-copy", "gtk-copy", "복사", "복사 (F5)",
                       G_CALLBACK(on_copy_active), win);
    toolbar_add_button(tb, "go-next", "gtk-go-forward", "이동", "이동 (F6)",
                       G_CALLBACK(on_move_active), win);
    toolbar_add_button(tb, "edit-delete", "gtk-delete", "삭제", "삭제 (F8)",
                       G_CALLBACK(on_delete_menu), win);
    gtk_toolbar_insert(tb, gtk_separator_tool_item_new(), -1);
    toolbar_add_button(tb, "system-search", "gtk-find", "검색", "검색 (F9)",
                       G_CALLBACK(on_search_clicked), win);
    gtk_box_pack_start(GTK_BOX(vbox), toolbar, FALSE, FALSE, 0);

    win->main_paned = gtk_paned_new(GTK_ORIENTATION_VERTICAL);
    win->lr_paned = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
    win->lr_paned_last_width = -1;
    style_lr_paned(win->lr_paned);
    g_signal_connect(win->lr_paned, "size-allocate",
                     G_CALLBACK(on_lr_paned_size_allocate), win);

    win->left_panel = file_panel_new(FILE_PANEL_LEFT, win);
    win->right_panel = file_panel_new(FILE_PANEL_RIGHT, win);
    win->active_panel = win->left_panel;

    gtk_paned_add1(GTK_PANED(win->lr_paned), win->left_panel);
    gtk_paned_add2(GTK_PANED(win->lr_paned), win->right_panel);
    gtk_paned_set_position(GTK_PANED(win->lr_paned), 640);

    win->preview_panel = preview_panel_new();
    gtk_widget_hide(win->preview_panel);

    gtk_paned_add1(GTK_PANED(win->main_paned), win->lr_paned);
    gtk_paned_add2(GTK_PANED(win->main_paned), win->preview_panel);
    gtk_box_pack_start(GTK_BOX(vbox), win->main_paned, TRUE, TRUE, 0);

    GtkWidget *status_bar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
    win->status_label = gtk_label_new(APP_DISPLAY_NAME " 준비 완료");
    gtk_label_set_xalign(GTK_LABEL(win->status_label), 0.0);
    gtk_widget_set_margin_start(win->status_label, 8);
    gtk_box_pack_start(GTK_BOX(status_bar), win->status_label, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), status_bar, FALSE, FALSE, 0);

    const char *left_init = session_settings_get_left_path(win->session);
    const char *right_init = session_settings_get_right_path(win->session);
    file_panel_set_initial_path(win->left_panel, left_init);
    file_panel_set_initial_path(win->right_panel, right_init);

    file_panel_connect_focus(win->left_panel, on_left_focus, win);
    file_panel_connect_focus(win->right_panel, on_right_focus, win);
    file_panel_connect_selection_changed(win->left_panel, on_selection_changed, win);
    file_panel_connect_selection_changed(win->right_panel, on_selection_changed, win);
    file_panel_connect_copy_to_other(win->left_panel, on_left_copy, win);
    file_panel_connect_move_to_other(win->left_panel, on_left_move, win);
    file_panel_connect_copy_to_other(win->right_panel, on_right_copy, win);
    file_panel_connect_move_to_other(win->right_panel, on_right_move, win);

    g_signal_connect(new_folder, "activate", G_CALLBACK(on_new_folder_menu), win);
    g_signal_connect(new_file, "activate", G_CALLBACK(on_new_file_menu), win);
    g_signal_connect(quit, "activate", G_CALLBACK(gtk_window_close), win->window);
    g_signal_connect(copy_item, "activate", G_CALLBACK(on_copy_active), win);
    g_signal_connect(move_item, "activate", G_CALLBACK(on_move_active), win);
    g_signal_connect(rename_item, "activate", G_CALLBACK(on_rename_menu), win);
    g_signal_connect(delete_item, "activate", G_CALLBACK(on_delete_menu), win);
    g_signal_connect(GTK_CHECK_MENU_ITEM(preview_check), "activate",
                     G_CALLBACK(on_toggle_preview), win);
    g_signal_connect(refresh_item, "activate", G_CALLBACK(on_refresh_all), win);
    g_signal_connect(search_item, "activate", G_CALLBACK(on_search_clicked), win);

    g_object_set_data(G_OBJECT(bm_add_left), "side", GINT_TO_POINTER(0));
    g_object_set_data(G_OBJECT(bm_add_right), "side", GINT_TO_POINTER(1));
    g_signal_connect(bm_add_left, "activate", G_CALLBACK(on_bookmark_add), win);
    g_signal_connect(bm_add_right, "activate", G_CALLBACK(on_bookmark_add), win);
    g_object_set_data(G_OBJECT(bm_list_item), "bookmark-submenu", bm_list_menu);
    g_signal_connect(bm_item, "select", G_CALLBACK(on_bookmark_menu_show), win);

    g_signal_connect(win->window, "delete-event", G_CALLBACK(on_window_delete), win);
    g_signal_connect(win->window, "key-press-event", G_CALLBACK(on_key_press), win);

    gtk_widget_show_all(win->window);
    gtk_widget_hide(win->preview_panel);
    g_idle_add(startup_load_panels_idle, win);
    return win;
}
