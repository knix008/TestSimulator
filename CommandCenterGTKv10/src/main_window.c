#include "main_window.h"

#define APP_DISPLAY_NAME "Command Center V1.0"

#include "about_dialog.h"
#include "app_icon.h"
#include "archive_ops.h"
#include "file_ops.h"
#include "file_ops_conflict.h"
#include "progress_dialog.h"
#include "ui_menu.h"
#include "file_panel.h"
#include "search_dialog.h"
#include "session_settings.h"

struct MainWindow {
    GtkWidget *window;
    GtkWidget *status_label;
    GtkWidget *left_panel;
    GtkWidget *right_panel;
    GtkWidget *lr_paned;
    GtkWidget *active_panel;
    int lr_paned_last_width;
    SessionSettings *session;
    GtkWidget *archive_compress_item;
    GtkWidget *archive_extract_item;
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

void main_window_suspend_panel_watches(MainWindow *win) {
    if (!win)
        return;
    file_panel_suspend_watch(win->left_panel);
    file_panel_suspend_watch(win->right_panel);
}

void main_window_resume_panel_watches(MainWindow *win) {
    if (!win)
        return;
    file_panel_resume_watch(win->left_panel);
    file_panel_resume_watch(win->right_panel);
}

typedef struct {
    MainWindow *win;
    GtkWidget *src;
    GtkWidget *dest;
    gboolean is_move;
    GPtrArray *paths;
    char *dest_path;
    guint64 item_total;
    ProgressDialog *prog;
    ProgressDialogOpsCtx pctx;
    FileOpsConflictState conflict;
    FileOpsTransferStats stats;
    gboolean success;
    GError *error;
    gchar *progress_detail;
    gboolean progress_idle_scheduled;
    GMutex progress_lock;
} PanelTransferJob;

static gboolean panel_transfer_set_total_idle(gpointer user_data) {
    PanelTransferJob *job = user_data;
    job->pctx.total = job->item_total;
    return G_SOURCE_REMOVE;
}

static gboolean panel_transfer_progress_idle(gpointer user_data) {
    PanelTransferJob *job = user_data;
    gchar *detail = NULL;

    g_mutex_lock(&job->progress_lock);
    job->progress_idle_scheduled = FALSE;
    detail = g_steal_pointer(&job->progress_detail);
    g_mutex_unlock(&job->progress_lock);

    if (detail) {
        progress_dialog_ops_report(&job->pctx, detail);
        g_free(detail);
    }
    return G_SOURCE_REMOVE;
}

static void panel_transfer_progress(const char *path, gpointer user_data) {
    PanelTransferJob *job = user_data;

    g_mutex_lock(&job->progress_lock);
    g_free(job->progress_detail);
    job->progress_detail = g_strdup(path);
    if (!job->progress_idle_scheduled) {
        job->progress_idle_scheduled = TRUE;
        g_idle_add(panel_transfer_progress_idle, job);
    }
    g_mutex_unlock(&job->progress_lock);
}

static gboolean panel_transfer_finish_idle(gpointer user_data) {
    PanelTransferJob *job = user_data;
    const char *verb = job->is_move ? "이동" : "복사";

    main_window_resume_panel_watches(job->win);

    if (job->success) {
        if (job->is_move)
            file_panel_refresh(job->src);
        file_panel_refresh(job->dest);
        if (job->stats.copied > 0 || job->stats.skipped > 0)
            show_transfer_status(job->win, verb, job->dest_path, &job->stats);
        else
            main_window_show_status(
                job->win,
                job->is_move ? "이동할 항목이 없습니다." : "복사할 항목이 없습니다.");
    } else if (job->error &&
               g_error_matches(job->error, G_IO_ERROR, G_IO_ERROR_CANCELLED)) {
        if (job->is_move)
            file_panel_refresh(job->src);
        file_panel_refresh(job->dest);
        main_window_show_status(
            job->win, job->is_move ? "이동이 취소되었습니다." : "복사가 취소되었습니다.");
    } else {
        const char *fallback = job->is_move ? "이동 실패" : "복사 실패";
        main_window_show_status(job->win,
                                job->error ? job->error->message : fallback);
        if (job->error)
            show_error(job->win, job->error->message);
    }

    progress_dialog_end(job->prog);
    g_mutex_clear(&job->progress_lock);
    g_free(job->progress_detail);
    g_clear_error(&job->error);
    g_ptr_array_free(job->paths, TRUE);
    g_free(job->dest_path);
    g_free(job);
    return G_SOURCE_REMOVE;
}

static gpointer panel_transfer_thread(gpointer user_data) {
    PanelTransferJob *job = user_data;
    GCancellable *cancel = progress_dialog_get_cancellable(job->prog);

    job->item_total = file_ops_count_items(job->paths, cancel);
    g_idle_add(panel_transfer_set_total_idle, job);

    if (g_cancellable_is_cancelled(cancel)) {
        job->success = FALSE;
        g_set_error(&job->error, G_IO_ERROR, G_IO_ERROR_CANCELLED,
                    "작업이 취소되었습니다.");
    } else if (job->is_move) {
        job->success = file_ops_move_files(
            job->paths, job->dest_path, GTK_WINDOW(job->win->window), &job->conflict,
            panel_transfer_progress, job, &job->stats, cancel, &job->error);
    } else {
        job->success = file_ops_copy_files(
            job->paths, job->dest_path, GTK_WINDOW(job->win->window), &job->conflict,
            panel_transfer_progress, job, &job->stats, cancel, &job->error);
    }

    g_idle_add(panel_transfer_finish_idle, job);
    return NULL;
}

static void start_panel_transfer(MainWindow *win, GtkWidget *src, GtkWidget *dest,
                                 gboolean is_move) {
    GPtrArray *paths = file_panel_get_selected_paths(src);
    if (paths->len == 0) {
        main_window_show_status(win, is_move ? "이동할 항목을 선택하세요."
                                             : "복사할 항목을 선택하세요.");
        g_ptr_array_free(paths, TRUE);
        return;
    }

    PanelTransferJob *job = g_new0(PanelTransferJob, 1);
    job->win = win;
    job->src = src;
    job->dest = dest;
    job->is_move = is_move;
    job->paths = paths;
    job->dest_path = g_strdup(file_panel_get_current_path(dest));
    file_ops_conflict_reset(&job->conflict);
    g_mutex_init(&job->progress_lock);

    job->prog = progress_dialog_begin(
        GTK_WINDOW(win->window), is_move ? "이동중" : "복사중");
    job->pctx.dlg = job->prog;
    job->pctx.current = 0;
    job->pctx.total = 0;

    main_window_suspend_panel_watches(win);
    g_thread_new("panel-transfer", panel_transfer_thread, job);
}

static void copy_between_panels(MainWindow *win, GtkWidget *src, GtkWidget *dest) {
    start_panel_transfer(win, src, dest, FALSE);
}

static void move_between_panels(MainWindow *win, GtkWidget *src, GtkWidget *dest) {
    start_panel_transfer(win, src, dest, TRUE);
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

static void update_archive_menu_state(MainWindow *win) {
    if (!win->archive_compress_item || !win->archive_extract_item || !win->active_panel)
        return;

    GPtrArray *paths = file_panel_get_selected_paths(win->active_panel);
    gboolean has_sel = paths->len > 0;
    gboolean can_extract = FALSE;
    if (paths->len == 1) {
        const char *p = g_ptr_array_index(paths, 0);
        can_extract = archive_is_archive(p) || archive_split_detect(p, NULL);
    }
    g_ptr_array_free(paths, TRUE);

    gtk_widget_set_sensitive(win->archive_compress_item, has_sel);
    gtk_widget_set_sensitive(win->archive_extract_item, can_extract);
}

static void update_active_panel(MainWindow *win, GtkWidget *panel) {
    win->active_panel = panel;
    file_panel_set_active(win->left_panel, panel == win->left_panel);
    file_panel_set_active(win->right_panel, panel == win->right_panel);
    update_archive_menu_state(win);
}

static void on_panel_selection_changed(GtkWidget *panel, GPtrArray *paths,
                                       gpointer data) {
    (void)panel;
    (void)paths;
    update_archive_menu_state(data);
}

static void on_left_focus(GtkWidget *panel, gpointer data) {
    (void)panel;
    MainWindow *win = data;
    update_active_panel(win, win->left_panel);
    char *msg = g_strdup_printf("왼쪽 패널 활성  |  %s",
                                file_panel_get_current_path(win->left_panel));
    main_window_show_status(win, msg);
    g_free(msg);
}

static void on_right_focus(GtkWidget *panel, gpointer data) {
    (void)panel;
    MainWindow *win = data;
    update_active_panel(win, win->right_panel);
    char *msg = g_strdup_printf("오른쪽 패널 활성  |  %s",
                                file_panel_get_current_path(win->right_panel));
    main_window_show_status(win, msg);
    g_free(msg);
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

static void on_refresh_all(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    file_panel_refresh(win->left_panel);
    file_panel_refresh(win->right_panel);
    main_window_show_status(win, "새로고침 완료");
}

static void on_show_about(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    about_dialog_show(GTK_WINDOW(win->window));
}

static gboolean on_info_menu_press(GtkWidget *widget, GdkEventButton *event,
                                   gpointer data) {
    if (event->type != GDK_BUTTON_PRESS || event->button != 1)
        return FALSE;
    on_show_about(GTK_MENU_ITEM(widget), data);
    return TRUE;
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

static void on_archive_compress(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    file_panel_request_compress(win->active_panel);
}

static void on_archive_extract(GtkMenuItem *item, gpointer data) {
    (void)item;
    MainWindow *win = data;
    GPtrArray *paths = file_panel_get_selected_paths(win->active_panel);
    if (paths->len == 1)
        file_panel_request_extract(win->active_panel, g_ptr_array_index(paths, 0));
    g_ptr_array_free(paths, TRUE);
}

static void on_archive_menu_show(GtkWidget *widget, gpointer data) {
    (void)widget;
    update_archive_menu_state(data);
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
    file_ops_conflict_bind_main_thread();

    MainWindow *win = g_new0(MainWindow, 1);
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
    GtkWidget *file_item = ui_menu_item_new_mnemonic("파일(_F)", "folder", "gtk-directory");
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(file_item), file_menu);
    GtkWidget *new_folder = ui_menu_item_new("새 폴더", "folder-new", "gtk-directory");
    GtkWidget *new_file = ui_menu_item_new("새 파일", "document-new", "gtk-new");
    GtkWidget *quit = ui_menu_item_new("종료", "application-exit", "gtk-quit");
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), new_folder);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), new_file);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), quit);

    GtkWidget *edit_menu = gtk_menu_new();
    GtkWidget *edit_item = ui_menu_item_new_mnemonic("편집(_E)", "gtk-edit", "gtk-edit");
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(edit_item), edit_menu);
    GtkWidget *copy_item = ui_menu_item_new("→ 복사 (F5)", "edit-copy", "gtk-copy");
    GtkWidget *move_item = ui_menu_item_new("→ 이동 (F6)", "go-next", "gtk-go-forward");
    GtkWidget *rename_item = ui_menu_item_new("이름 바꾸기 (F2)", "gtk-edit", "gtk-edit");
    GtkWidget *delete_item = ui_menu_item_new("삭제 (F8)", "edit-delete", "gtk-delete");
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu), copy_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu), move_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu), rename_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu), delete_item);

    GtkWidget *view_menu = gtk_menu_new();
    GtkWidget *view_item = ui_menu_item_new_mnemonic("보기(_V)", "view-grid", "gtk-select-all");
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(view_item), view_menu);
    GtkWidget *refresh_item = ui_menu_item_new("새로고침", "view-refresh", "gtk-refresh");
    GtkWidget *search_item = ui_menu_item_new("검색 (F9)", "system-search", "gtk-find");
    gtk_menu_shell_append(GTK_MENU_SHELL(view_menu), refresh_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(view_menu), search_item);

    GtkWidget *archive_menu = gtk_menu_new();
    GtkWidget *archive_item = ui_menu_item_new_mnemonic(
        "압축(_C)", "package-x-generic", "gtk-add");
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(archive_item), archive_menu);
    win->archive_compress_item = ui_menu_item_new(
        "압축", "package-x-generic", "gtk-add");
    win->archive_extract_item = ui_menu_item_new(
        "압축 해제", "folder-download", "gtk-open");
    gtk_menu_shell_append(GTK_MENU_SHELL(archive_menu), win->archive_compress_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(archive_menu), win->archive_extract_item);
    gtk_widget_set_sensitive(win->archive_compress_item, FALSE);
    gtk_widget_set_sensitive(win->archive_extract_item, FALSE);

    GtkWidget *info_item = ui_menu_item_new_mnemonic(
        "정보(_I)", "help-about", "gtk-about");
    gtk_menu_item_set_reserve_indicator(GTK_MENU_ITEM(info_item), FALSE);

    gtk_menu_shell_append(GTK_MENU_SHELL(menubar), file_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(menubar), edit_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(menubar), view_item);
    gtk_menu_shell_append(GTK_MENU_SHELL(menubar), archive_item);

    GtkWidget *menubar_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
    gtk_box_pack_start(GTK_BOX(menubar_box), menubar, TRUE, TRUE, 0);

    GtkWidget *menubar_right = gtk_menu_bar_new();
    gtk_menu_shell_append(GTK_MENU_SHELL(menubar_right), info_item);
    gtk_box_pack_end(GTK_BOX(menubar_box), menubar_right, FALSE, FALSE, 0);

    gtk_box_pack_start(GTK_BOX(vbox), menubar_box, FALSE, FALSE, 0);

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

    win->lr_paned = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
    win->lr_paned_last_width = -1;
    style_lr_paned(win->lr_paned);
    g_signal_connect(win->lr_paned, "size-allocate",
                     G_CALLBACK(on_lr_paned_size_allocate), win);

    win->left_panel = file_panel_new(FILE_PANEL_LEFT, win);
    win->right_panel = file_panel_new(FILE_PANEL_RIGHT, win);
    update_active_panel(win, win->left_panel);

    gtk_paned_add1(GTK_PANED(win->lr_paned), win->left_panel);
    gtk_paned_add2(GTK_PANED(win->lr_paned), win->right_panel);
    gtk_paned_set_position(GTK_PANED(win->lr_paned), 640);

    gtk_box_pack_start(GTK_BOX(vbox), win->lr_paned, TRUE, TRUE, 0);

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
    file_panel_connect_copy_to_other(win->left_panel, on_left_copy, win);
    file_panel_connect_move_to_other(win->left_panel, on_left_move, win);
    file_panel_connect_copy_to_other(win->right_panel, on_right_copy, win);
    file_panel_connect_move_to_other(win->right_panel, on_right_move, win);
    file_panel_connect_selection_changed(win->left_panel,
                                         on_panel_selection_changed, win);
    file_panel_connect_selection_changed(win->right_panel,
                                         on_panel_selection_changed, win);

    g_signal_connect(new_folder, "activate", G_CALLBACK(on_new_folder_menu), win);
    g_signal_connect(new_file, "activate", G_CALLBACK(on_new_file_menu), win);
    g_signal_connect(quit, "activate", G_CALLBACK(gtk_window_close), win->window);
    g_signal_connect(copy_item, "activate", G_CALLBACK(on_copy_active), win);
    g_signal_connect(move_item, "activate", G_CALLBACK(on_move_active), win);
    g_signal_connect(rename_item, "activate", G_CALLBACK(on_rename_menu), win);
    g_signal_connect(delete_item, "activate", G_CALLBACK(on_delete_menu), win);
    g_signal_connect(refresh_item, "activate", G_CALLBACK(on_refresh_all), win);
    g_signal_connect(search_item, "activate", G_CALLBACK(on_search_clicked), win);
    g_signal_connect(win->archive_compress_item, "activate",
                     G_CALLBACK(on_archive_compress), win);
    g_signal_connect(win->archive_extract_item, "activate",
                     G_CALLBACK(on_archive_extract), win);
    g_signal_connect(archive_menu, "show", G_CALLBACK(on_archive_menu_show), win);
    g_signal_connect(info_item, "activate", G_CALLBACK(on_show_about), win);
    g_signal_connect(info_item, "button-press-event",
                     G_CALLBACK(on_info_menu_press), win);

    g_signal_connect(win->window, "delete-event", G_CALLBACK(on_window_delete), win);
    g_signal_connect(win->window, "key-press-event", G_CALLBACK(on_key_press), win);

    gtk_widget_show_all(win->window);
    g_idle_add(startup_load_panels_idle, win);
    return win;
}
