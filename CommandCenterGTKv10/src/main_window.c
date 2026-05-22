#include "main_window.h"

#include "bookmark_manager.h"
#include "file_ops.h"
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
    BookmarkManager *bookmarks;
    SessionSettings *session;
};

static void show_error(const char *msg) {
    GtkWidget *dlg = gtk_message_dialog_new(NULL, GTK_DIALOG_MODAL,
        GTK_MESSAGE_ERROR, GTK_BUTTONS_OK, "%s", msg);
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

void main_window_show_status(MainWindow *win, const char *message) {
    gtk_label_set_text(GTK_LABEL(win->status_label), message);
}

GtkWidget *main_window_get_widget(MainWindow *win) {
    return win->window;
}

static GtkWidget *other_panel(MainWindow *win, GtkWidget *panel) {
    return panel == win->left_panel ? win->right_panel : win->left_panel;
}

static void copy_between_panels(MainWindow *win, GtkWidget *src, GtkWidget *dest) {
    GPtrArray *paths = file_panel_get_selected_paths(src);
    if (paths->len == 0) {
        main_window_show_status(win, "복사할 항목을 선택하세요.");
        g_ptr_array_free(paths, TRUE);
        return;
    }
    const char *dest_path = file_panel_get_current_path(dest);
    GError *err = NULL;
    if (file_ops_copy_files(paths, dest_path, NULL, NULL, &err)) {
        file_panel_refresh(dest);
        char *msg = g_strdup_printf("%u개 항목을 '%s'에 복사했습니다.",
                                    paths->len, dest_path);
        main_window_show_status(win, msg);
        g_free(msg);
    } else {
        main_window_show_status(win, err ? err->message : "복사 실패");
        if (err) show_error(err->message);
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
    GError *err = NULL;
    if (file_ops_move_files(paths, dest_path, NULL, NULL, &err)) {
        file_panel_refresh(src);
        file_panel_refresh(dest);
        char *msg = g_strdup_printf("%u개 항목을 '%s'으로 이동했습니다.",
                                    paths->len, dest_path);
        main_window_show_status(win, msg);
        g_free(msg);
    } else {
        main_window_show_status(win, err ? err->message : "이동 실패");
        if (err) show_error(err->message);
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
    gtk_window_set_title(GTK_WINDOW(win->window), "FileMaster");
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
    GtkToolItem *tb;
    tb = gtk_tool_button_new(NULL, "새 폴더"); gtk_toolbar_insert(GTK_TOOLBAR(toolbar), tb, -1);
    tb = gtk_tool_button_new(NULL, "→ 복사"); gtk_toolbar_insert(GTK_TOOLBAR(toolbar), tb, -1);
    tb = gtk_tool_button_new(NULL, "→ 이동"); gtk_toolbar_insert(GTK_TOOLBAR(toolbar), tb, -1);
    tb = gtk_tool_button_new(NULL, "삭제"); gtk_toolbar_insert(GTK_TOOLBAR(toolbar), tb, -1);
    tb = gtk_tool_button_new(NULL, "검색"); gtk_toolbar_insert(GTK_TOOLBAR(toolbar), tb, -1);
    gtk_box_pack_start(GTK_BOX(vbox), toolbar, FALSE, FALSE, 0);

    win->main_paned = gtk_paned_new(GTK_ORIENTATION_VERTICAL);
    win->lr_paned = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);

    win->left_panel = file_panel_new(FILE_PANEL_LEFT, win);
    win->right_panel = file_panel_new(FILE_PANEL_RIGHT, win);
    win->active_panel = win->left_panel;

    gtk_paned_add1(GTK_PANED(win->lr_paned), win->left_panel);
    gtk_paned_add2(GTK_PANED(win->lr_paned), win->right_panel);

    win->preview_panel = preview_panel_new();
    gtk_widget_hide(win->preview_panel);

    gtk_paned_add1(GTK_PANED(win->main_paned), win->lr_paned);
    gtk_paned_add2(GTK_PANED(win->main_paned), win->preview_panel);
    gtk_box_pack_start(GTK_BOX(vbox), win->main_paned, TRUE, TRUE, 0);

    GtkWidget *status_bar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
    win->status_label = gtk_label_new("FileMaster 준비 완료");
    gtk_label_set_xalign(GTK_LABEL(win->status_label), 0.0);
    gtk_widget_set_margin_start(win->status_label, 8);
    gtk_box_pack_start(GTK_BOX(status_bar), win->status_label, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), status_bar, FALSE, FALSE, 0);

    const char *left_init = session_settings_get_left_path(win->session);
    const char *right_init = session_settings_get_right_path(win->session);
    file_panel_set_initial_path(win->left_panel, left_init);
    file_panel_set_initial_path(win->right_panel, right_init);

    int split = session_settings_get_splitter_distance(win->session);
    if (split < 220) split = 640;
    gtk_paned_set_position(GTK_PANED(win->lr_paned), split);

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
    return win;
}
