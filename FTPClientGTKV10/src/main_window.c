#include "main_window.h"
#include "file_pane.h"
#include "ftp_backend.h"
#include "profile.h"
#include "site_dialog.h"

#include <stdarg.h>
#include <string.h>

struct _FtpMainWindow {
    GtkApplicationWindow parent;

    FtpSession    *session;
    gboolean       connected;
    gchar         *server_path;
    gchar         *local_path;
    FtpAppSettings settings;
    GList         *profiles;

    FilePane      *server_pane;
    FilePane      *local_pane;

    GtkWidget     *combo_profiles;
    GtkWidget     *combo_protocol;
    GtkWidget     *entry_host;
    GtkWidget     *entry_port;
    GtkWidget     *entry_user;
    GtkWidget     *entry_password;
    GtkWidget     *btn_connect;
    GtkWidget     *btn_upload;
    GtkWidget     *btn_download;
    GtkWidget     *ctx_server;
    GtkWidget     *ctx_local;
    GtkWidget     *statusbar;
    GtkWidget     *progress;
    GtkWidget     *log_view;
    GtkTextBuffer *log_buf;
    guint          status_ctx;

    GFileMonitor  *local_monitor;
    guint          local_refresh_timeout;

    GdkPixbuf     *icon_folder;
    GdkPixbuf     *icon_file;
    GdkPixbuf     *icon_parent;

    gboolean       busy;
};

G_DEFINE_TYPE(FtpMainWindow, ftp_main_window, GTK_TYPE_APPLICATION_WINDOW)

typedef struct {
    FtpMainWindow *win;
    gchar         *message;
} StatusIdle;

typedef struct {
    FtpMainWindow *win;
    gchar         *path;
} PathTask;

typedef struct {
    FtpMainWindow *win;
    GPtrArray     *entries;
    gchar         *path;
    GError        *err;
} ListDone;

typedef struct {
    FtpMainWindow *win;
    gchar         *remote;
    gchar         *local;
    gboolean       is_dir;
    gboolean       upload;
    GError        *err;
} TransferDone;

/* ── UI helpers ──────────────────────────────────────────────────────── */

static void append_log(FtpMainWindow *self, const gchar *msg) {
    if (!self->log_buf || !msg) return;
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(self->log_buf, &end);
    gtk_text_buffer_insert(self->log_buf, &end, msg, -1);
    gtk_text_buffer_insert(self->log_buf, &end, "\n", 1);
    /* Auto-scroll to bottom */
    GtkTextMark *mark = gtk_text_buffer_get_mark(self->log_buf, "insert");
    gtk_text_view_scroll_mark_onscreen(GTK_TEXT_VIEW(self->log_view), mark);
}

typedef struct {
    FtpMainWindow *win;
    gchar         *message;
} LogIdle;

static gboolean idle_append_log(gpointer data) {
    LogIdle *l = data;
    append_log(l->win, l->message);
    g_free(l->message);
    g_free(l);
    return G_SOURCE_REMOVE;
}

static void queue_log(FtpMainWindow *self, const gchar *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    gchar *msg = g_strdup_vprintf(fmt, ap);
    va_end(ap);
    LogIdle *l = g_new(LogIdle, 1);
    l->win = self;
    l->message = msg;
    g_idle_add(idle_append_log, l);
}

static void set_status(FtpMainWindow *self, const gchar *text) {
    gtk_statusbar_pop(GTK_STATUSBAR(self->statusbar), self->status_ctx);
    gtk_statusbar_push(GTK_STATUSBAR(self->statusbar), self->status_ctx, text ? text : "");
}

static gboolean idle_set_status(gpointer data) {
    StatusIdle *s = data;
    set_status(s->win, s->message);
    g_free(s->message);
    g_free(s);
    return G_SOURCE_REMOVE;
}

static void queue_status(FtpMainWindow *self, const gchar *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    gchar *msg = g_strdup_vprintf(fmt, ap);
    va_end(ap);
    StatusIdle *s = g_new(StatusIdle, 1);
    s->win = self;
    s->message = msg;
    g_idle_add(idle_set_status, s);
}

static void show_error(FtpMainWindow *self, const gchar *title, const gchar *msg) {
    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(self), GTK_DIALOG_MODAL,
        GTK_MESSAGE_ERROR, GTK_BUTTONS_CLOSE, "%s", title);
    if (msg && msg[0])
        gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg), "%s", msg);
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

static FtpProtocol toolbar_protocol(FtpMainWindow *self) {
    return (FtpProtocol)gtk_combo_box_get_active(GTK_COMBO_BOX(self->combo_protocol));
}

static void update_connect_button(FtpMainWindow *self) {
    gtk_button_set_label(GTK_BUTTON(self->btn_connect),
                         self->connected ? "연결 해제" : "연결");
}

static GdkPixbuf *load_theme_icon(const gchar *name, gint size) {
    GtkIconTheme *theme = gtk_icon_theme_get_default();
    GtkIconInfo *info = gtk_icon_theme_lookup_icon(theme, name, size,
                                                   GTK_ICON_LOOKUP_USE_BUILTIN);
    if (!info) return NULL;
    GdkPixbuf *pb = gtk_icon_info_load_icon(info, NULL);
    g_object_unref(info);
    return pb;
}

static void load_icons(FtpMainWindow *self) {
    self->icon_folder = load_theme_icon("folder", 16);
    self->icon_file   = load_theme_icon("text-x-generic", 16);
    self->icon_parent = load_theme_icon("go-up", 16);
    if (!self->icon_file)
        self->icon_file = load_theme_icon("document-open", 16);
    file_pane_set_icons(self->server_pane, self->icon_folder, self->icon_file, self->icon_parent);
    file_pane_set_icons(self->local_pane, self->icon_folder, self->icon_file, self->icon_parent);
}

static void refresh_profile_combo(FtpMainWindow *self) {
    GtkComboBoxText *c = GTK_COMBO_BOX_TEXT(self->combo_profiles);
    gtk_combo_box_text_remove_all(c);
    gtk_combo_box_text_append_text(c, "-- 프로파일 선택 --");
    for (GList *l = self->profiles; l; l = l->next) {
        FtpProfile *p = l->data;
        gtk_combo_box_text_append_text(c, p->name);
    }
    /* Index 0 is the placeholder; on_profile_combo_changed ignores it. */
    gtk_combo_box_set_active(GTK_COMBO_BOX(c), 0);
}

static void apply_profile(FtpMainWindow *self, FtpProfile *p) {
    if (!p) return;
    gtk_combo_box_set_active(GTK_COMBO_BOX(self->combo_protocol), (gint)p->protocol);
    gtk_entry_set_text(GTK_ENTRY(self->entry_host), p->host);
    if (p->port > 0) {
        gchar buf[16];
        g_snprintf(buf, sizeof buf, "%d", p->port);
        gtk_entry_set_text(GTK_ENTRY(self->entry_port), buf);
    } else {
        gtk_entry_set_text(GTK_ENTRY(self->entry_port), "");
    }
    gtk_entry_set_text(GTK_ENTRY(self->entry_user), p->user);
    gtk_entry_set_text(GTK_ENTRY(self->entry_password), p->password);
}

static void on_profile_combo_changed(GtkComboBox *combo, FtpMainWindow *self) {
    gint idx = gtk_combo_box_get_active(combo) - 1;
    if (idx < 0) return;
    FtpProfile *p = g_list_nth_data(self->profiles, (guint)idx);
    if (p) apply_profile(self, p);
}

static gchar *remote_dest_path(FtpMainWindow *self, const gchar *name) {
    const gchar *base = self->server_path ? self->server_path : "/";
    if (g_strcmp0(base, "/") == 0)
        return g_strdup_printf("/%s", name);
    return g_strdup_printf("%s/%s", base, name);
}

/* ── server listing ──────────────────────────────────────────────────── */

static void server_load_done(FtpMainWindow *self, GPtrArray *entries,
                             const gchar *path, GError *err) {
    self->busy = FALSE;
    gtk_widget_hide(self->progress);

    if (err) {
        show_error(self, "디렉토리 조회 오류", err->message);
        set_status(self, "서버 목록 조회 실패");
        g_error_free(err);
        return;
    }

    g_free(self->server_path);
    self->server_path = g_strdup(path);
    g_strlcpy(self->settings.last_server_path, path, FTP_MAX_PATH);
    file_pane_populate_flat(self->server_pane, entries, self->server_path);
    g_ptr_array_unref(entries);
    queue_status(self, "서버: %s", self->server_path);
}

static gboolean idle_list_done(gpointer data) {
    ListDone *d = data;
    server_load_done(d->win, d->entries, d->path, d->err);
    g_free(d->path);
    g_free(d);
    return G_SOURCE_REMOVE;
}

static gpointer list_thread(gpointer data) {
    PathTask *t = data;
    GError *err = NULL;
    GPtrArray *arr = ftp_session_list_directory(t->win->session, t->path, &err);

    ListDone *done = g_new(ListDone, 1);
    done->win = t->win;
    done->entries = arr;
    done->path = t->path;
    done->err = err;
    g_free(t);
    g_idle_add(idle_list_done, done);
    return NULL;
}

static void load_server_directory(FtpMainWindow *self, const gchar *path) {
    if (!self->connected || self->busy) return;
    self->busy = TRUE;
    gtk_widget_show(self->progress);
    queue_status(self, "서버 로드 중: %s", path);

    PathTask *t = g_new(PathTask, 1);
    t->win  = self;
    t->path = g_strdup(path);
    g_thread_new("ftp-list", list_thread, t);
}

/* ── transfer ────────────────────────────────────────────────────────── */

typedef struct {
    FtpMainWindow *win;
    gint           percent;
    gchar         *detail;
} ProgressIdle;

static gboolean idle_update_progress(gpointer data) {
    ProgressIdle *p = data;
    gchar *pct = g_strdup_printf("%d%%", p->percent);
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(p->win->progress), p->percent / 100.0);
    gtk_progress_bar_set_text(GTK_PROGRESS_BAR(p->win->progress), pct);
    g_free(pct);
    g_free(p->detail);
    g_free(p);
    return G_SOURCE_REMOVE;
}

static void on_progress(gint percent, const gchar *detail, gpointer data) {
    FtpMainWindow *self = data;
    queue_status(self, "%s  %d%%", detail ? detail : "전송", percent);

    ProgressIdle *p = g_new(ProgressIdle, 1);
    p->win = self;
    p->percent = percent;
    p->detail = g_strdup(detail);
    g_idle_add(idle_update_progress, p);
}

static gboolean idle_transfer_done(gpointer data) {
    TransferDone *d = data;
    FtpMainWindow *self = d->win;

    self->busy = FALSE;
    gtk_widget_hide(self->progress);

    if (d->err) {
        show_error(self, d->upload ? "업로드 오류" : "다운로드 오류", d->err->message);
        queue_status(self, d->upload ? "업로드 실패" : "다운로드 실패");
        queue_log(self, "[오류] %s 실패: %s",
                  d->upload ? "업로드" : "다운로드", d->err->message);
        g_error_free(d->err);
    } else {
        queue_status(self, d->upload ? "업로드 완료" : "다운로드 완료");
        queue_log(self, "[%s] %s  →  %s",
                  d->upload ? "업로드" : "다운로드",
                  d->upload ? d->local : d->remote,
                  d->upload ? d->remote : d->local);
        if (d->upload)
            load_server_directory(self, self->server_path);
        else
            file_pane_refresh_local_directory(self->local_pane);
    }

    g_free(d->remote);
    g_free(d->local);
    g_free(d);
    return G_SOURCE_REMOVE;
}

typedef struct {
    FtpMainWindow *win;
    gchar         *remote;
    gchar         *local;
    gboolean       is_dir;
    gboolean       upload;
} TransferTask;

static gpointer transfer_thread(gpointer data) {
    TransferTask *t = data;
    GError *err = NULL;
    gboolean ok;

    if (t->upload) {
        ok = ftp_session_upload(t->win->session, t->local, t->remote, t->is_dir,
                                on_progress, t->win, &err);
    } else {
        ok = ftp_session_download(t->win->session, t->remote, t->local, t->is_dir,
                                  on_progress, t->win, &err);
    }
    if (!ok && !err)
        g_set_error(&err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Transfer failed");

    TransferDone *done = g_new(TransferDone, 1);
    done->win = t->win;
    done->remote = t->remote;
    done->local = t->local;
    done->is_dir = t->is_dir;
    done->upload = t->upload;
    done->err = err;
    t->remote = NULL;
    t->local = NULL;
    g_free(t);
    g_idle_add(idle_transfer_done, done);
    return NULL;
}

static void start_transfer(FtpMainWindow *self,
                           const gchar *remote,
                           const gchar *local,
                           gboolean is_dir,
                           gboolean upload) {
    if (!self->connected) {
        show_error(self, "오류", "서버에 연결되어 있지 않습니다.");
        return;
    }
    if (self->busy) return;

    self->busy = TRUE;
    gtk_widget_show(self->progress);
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(self->progress), 0.0);
    queue_status(self, upload ? "업로드 중..." : "다운로드 중...");

    TransferTask *t = g_new(TransferTask, 1);
    t->win = self;
    t->remote = g_strdup(remote);
    t->local = g_strdup(local);
    t->is_dir = is_dir;
    t->upload = upload;
    g_thread_new("ftp-xfer", transfer_thread, t);
}

static void do_upload_selected(FtpMainWindow *self) {
    gchar path[FTP_MAX_PATH];
    gboolean is_dir = FALSE, is_parent = FALSE;
    if (!file_pane_get_selected(self->local_pane, path, sizeof path, &is_dir, &is_parent))
        return;
    if (is_parent) return;

    gchar *name = g_path_get_basename(path);
    gchar *remote = remote_dest_path(self, name);
    start_transfer(self, remote, g_strdup(path), is_dir, TRUE);
    g_free(name);
    g_free(remote);
}

static void do_download_selected(FtpMainWindow *self) {
    gchar path[FTP_MAX_PATH];
    gboolean is_dir = FALSE, is_parent = FALSE;
    if (!file_pane_get_selected(self->server_pane, path, sizeof path, &is_dir, &is_parent))
        return;
    if (is_parent) return;

    gchar *name = g_path_get_basename(path);
    gchar *local = g_build_filename(self->local_path, name, NULL);
    start_transfer(self, g_strdup(path), local, is_dir, FALSE);
    g_free(name);
}

/* ── connect ───────────────────────────────────────────────────────────── */

typedef struct {
    FtpMainWindow *win;
    FtpProtocol    protocol;
    gchar         *host;
    gchar         *user;
    gchar         *password;
    gint           port;
} ConnectTask;

typedef struct {
    FtpMainWindow *win;
    gboolean       ok;
    GError        *err;
} ConnectDone;

static gboolean idle_connect_done(gpointer data) {
    ConnectDone *d = data;
    FtpMainWindow *self = d->win;

    self->busy = FALSE;
    gtk_widget_set_sensitive(self->btn_connect, TRUE);
    gtk_widget_hide(self->progress);

    if (d->ok) {
        self->connected = TRUE;
        update_connect_button(self);
        g_free(self->server_path);
        self->server_path = g_strdup(self->settings.last_server_path);
        load_server_directory(self, self->server_path);
        queue_status(self, "연결됨");
        queue_log(self, "[연결] 서버에 성공적으로 연결되었습니다.");
    } else {
        show_error(self, "연결 오류", d->err ? d->err->message : "Unknown error");
        queue_status(self, "연결 실패");
        queue_log(self, "[오류] 연결 실패: %s",
                  d->err ? d->err->message : "알 수 없는 오류");
        if (d->err) g_error_free(d->err);
    }
    g_free(d);
    return G_SOURCE_REMOVE;
}

static gpointer connect_thread(gpointer data) {
    ConnectTask *t = data;
    GError *err = NULL;
    gboolean ok = ftp_session_connect(t->win->session, t->protocol,
                                      t->host, t->port, t->user, t->password, &err);

    ConnectDone *done = g_new(ConnectDone, 1);
    done->win = t->win;
    done->ok = ok;
    done->err = err;

    g_free(t->host);
    g_free(t->user);
    g_free(t->password);
    g_free(t);
    g_idle_add(idle_connect_done, done);
    return NULL;
}

static void disconnect_session(FtpMainWindow *self) {
    gboolean was_connected = self->connected;
    ftp_session_disconnect(self->session);
    self->connected = FALSE;
    update_connect_button(self);
    file_pane_clear(self->server_pane);
    g_free(self->server_path);
    self->server_path = NULL;
    file_pane_set_path_label(self->server_pane, NULL);
    queue_status(self, "연결 해제됨");
    if (was_connected)
        queue_log(self, "[연결 해제] 서버 연결이 종료되었습니다.");
}

static void on_connect_clicked(GtkButton *btn, FtpMainWindow *self) {
    (void)btn;
    if (self->connected) {
        disconnect_session(self);
        return;
    }

    const gchar *host = gtk_entry_get_text(GTK_ENTRY(self->entry_host));
    if (!host || !host[0]) {
        show_error(self, "연결 오류", "호스트를 입력하세요.");
        return;
    }

    FtpProtocol proto = toolbar_protocol(self);
    const gchar *port_txt = gtk_entry_get_text(GTK_ENTRY(self->entry_port));
    gint port = port_txt && port_txt[0] ? atoi(port_txt) : ftp_default_port(proto);

    self->busy = TRUE;
    gtk_widget_set_sensitive(self->btn_connect, FALSE);
    gtk_widget_show(self->progress);
    queue_status(self, "연결 중...");

    ConnectTask *t = g_new(ConnectTask, 1);
    t->win = self;
    t->protocol = proto;
    t->host = g_strdup(host);
    t->user = g_strdup(gtk_entry_get_text(GTK_ENTRY(self->entry_user)));
    t->password = g_strdup(gtk_entry_get_text(GTK_ENTRY(self->entry_password)));
    t->port = port;
    g_thread_new("ftp-connect", connect_thread, t);
}

/* ── tree events ───────────────────────────────────────────────────────── */

static void on_server_row_activated_fix(GtkTreeView *tv, GtkTreePath *path,
                                        GtkTreeViewColumn *col, FtpMainWindow *self) {
    (void)tv; (void)path; (void)col;
    gchar node_path[FTP_MAX_PATH];
    gboolean is_dir = FALSE, is_parent = FALSE;
    if (!file_pane_get_selected(self->server_pane, node_path, sizeof node_path,
                                &is_dir, &is_parent))
        return;

    if (is_parent)
        load_server_directory(self, node_path);
    else if (is_dir)
        load_server_directory(self, node_path);
    else {
        gchar *name = g_path_get_basename(node_path);
        gchar *local = g_build_filename(self->local_path, name, NULL);
        start_transfer(self, g_strdup(node_path), local, FALSE, FALSE);
        g_free(name);
    }
}

static gboolean do_refresh_local(gpointer data) {
    FtpMainWindow *self = data;
    self->local_refresh_timeout = 0;
    file_pane_refresh_local_directory(self->local_pane);
    return G_SOURCE_REMOVE;
}

static void on_local_dir_changed(GFileMonitor *monitor, GFile *file,
                                  GFile *other, GFileMonitorEvent ev,
                                  FtpMainWindow *self) {
    (void)monitor; (void)file; (void)other; (void)ev;
    /* Debounce: wait 500 ms after last event before refreshing */
    if (self->local_refresh_timeout)
        g_source_remove(self->local_refresh_timeout);
    self->local_refresh_timeout = g_timeout_add(500, do_refresh_local, self);
}

static void start_local_monitor(FtpMainWindow *self, const gchar *path) {
    if (self->local_refresh_timeout) {
        g_source_remove(self->local_refresh_timeout);
        self->local_refresh_timeout = 0;
    }
    if (self->local_monitor) {
        g_file_monitor_cancel(self->local_monitor);
        g_clear_object(&self->local_monitor);
    }
    if (!path) return;
    GFile *gfile = g_file_new_for_path(path);
    self->local_monitor = g_file_monitor_directory(
        gfile, G_FILE_MONITOR_WATCH_MOVES, NULL, NULL);
    g_object_unref(gfile);
    if (self->local_monitor)
        g_signal_connect(self->local_monitor, "changed",
                         G_CALLBACK(on_local_dir_changed), self);
}

static void local_navigate_to(FtpMainWindow *self, const gchar *path) {
    gchar normalized[FTP_MAX_PATH];
    ftp_normalize_local_path(path, normalized, sizeof normalized);

    if (self->local_path && g_strcmp0(self->local_path, normalized) == 0) {
        file_pane_refresh_local_directory(self->local_pane);
        return;
    }

    g_free(self->local_path);
    self->local_path = g_strdup(normalized);
    g_strlcpy(self->settings.last_local_path, normalized, FTP_MAX_PATH);
    file_pane_show_local_directory(self->local_pane, normalized);
    start_local_monitor(self, normalized);
    queue_status(self, "로컬: %s", normalized);
}

static void on_local_row_activated(GtkTreeView *tv, GtkTreePath *path,
                                   GtkTreeViewColumn *col, FtpMainWindow *self) {
    (void)tv; (void)path; (void)col;
    gchar node_path[FTP_MAX_PATH];
    gboolean is_dir = FALSE, is_parent = FALSE;
    if (!file_pane_get_selected(self->local_pane, node_path, sizeof node_path,
                                &is_dir, &is_parent))
        return;

    if (is_parent || is_dir)
        local_navigate_to(self, node_path);
    else
        do_upload_selected(self);
}

static void tree_select_at(GtkTreeView *tv, GdkEventButton *ev) {
    GtkTreePath *path = NULL;
    if (gtk_tree_view_get_path_at_pos(tv, (gint)ev->x, (gint)ev->y,
                                      &path, NULL, NULL, NULL)) {
        gtk_tree_selection_select_path(gtk_tree_view_get_selection(tv), path);
        gtk_tree_path_free(path);
    }
}

static gboolean on_server_button_press(GtkWidget *widget, GdkEventButton *ev,
                                        FtpMainWindow *self) {
    if (ev->button != 3) return FALSE;
    tree_select_at(GTK_TREE_VIEW(widget), ev);
    gtk_menu_popup_at_pointer(GTK_MENU(self->ctx_server), (GdkEvent *)ev);
    return TRUE;
}

static gboolean on_local_button_press(GtkWidget *widget, GdkEventButton *ev,
                                       FtpMainWindow *self) {
    if (ev->button != 3) return FALSE;
    tree_select_at(GTK_TREE_VIEW(widget), ev);
    gtk_menu_popup_at_pointer(GTK_MENU(self->ctx_local), (GdkEvent *)ev);
    return TRUE;
}

/* ── context menus ─────────────────────────────────────────────────────── */

typedef struct {
    FtpMainWindow *win;
    gchar         *path;
    gboolean       is_dir;
} DeleteTask;

typedef struct {
    FtpMainWindow *win;
    gchar         *path;
    GError        *err;
} DeleteDone;

static gboolean idle_delete_done(gpointer data) {
    DeleteDone *d = data;
    FtpMainWindow *self = d->win;
    self->busy = FALSE;
    gtk_widget_hide(self->progress);
    if (d->err) {
        show_error(self, "삭제 오류", d->err->message);
        queue_log(self, "[오류] 삭제 실패: %s", d->err->message);
        g_error_free(d->err);
    } else {
        queue_status(self, "삭제 완료");
        queue_log(self, "[삭제] 서버: %s", d->path);
        load_server_directory(self, self->server_path);
    }
    g_free(d->path);
    g_free(d);
    return G_SOURCE_REMOVE;
}

static gpointer delete_thread(gpointer data) {
    DeleteTask *t = data;
    GError *err = NULL;
    ftp_session_delete(t->win->session, t->path, t->is_dir, &err);
    DeleteDone *done = g_new(DeleteDone, 1);
    done->win  = t->win;
    done->path = t->path;
    done->err  = err;
    t->path = NULL;
    g_free(t);
    g_idle_add(idle_delete_done, done);
    return NULL;
}

static void on_ctx_delete_server(GtkMenuItem *item, FtpMainWindow *self) {
    (void)item;
    if (!self->connected || self->busy) return;
    gchar path[FTP_MAX_PATH];
    gboolean is_dir = FALSE, is_parent = FALSE;
    if (!file_pane_get_selected(self->server_pane, path, sizeof path,
                                &is_dir, &is_parent) || is_parent)
        return;
    gchar *name = g_path_get_basename(path);
    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(self), GTK_DIALOG_MODAL,
        GTK_MESSAGE_WARNING, GTK_BUTTONS_YES_NO,
        "서버에서 삭제하시겠습니까?");
    gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg), "%s", name);
    g_free(name);
    gtk_widget_show_all(dlg);
    gint resp = gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
    if (resp != GTK_RESPONSE_YES) return;

    self->busy = TRUE;
    gtk_widget_show(self->progress);
    gtk_progress_bar_set_text(GTK_PROGRESS_BAR(self->progress), "삭제 중...");
    queue_status(self, "삭제 중...");

    DeleteTask *t = g_new(DeleteTask, 1);
    t->win    = self;
    t->path   = g_strdup(path);
    t->is_dir = is_dir;
    g_thread_new("ftp-delete", delete_thread, t);
}

static void on_ctx_delete_local(GtkMenuItem *item, FtpMainWindow *self) {
    (void)item;
    gchar path[FTP_MAX_PATH];
    gboolean is_dir = FALSE, is_parent = FALSE;
    if (!file_pane_get_selected(self->local_pane, path, sizeof path,
                                &is_dir, &is_parent) || is_parent)
        return;
    gchar *name = g_path_get_basename(path);
    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(self), GTK_DIALOG_MODAL,
        GTK_MESSAGE_WARNING, GTK_BUTTONS_YES_NO,
        "휴지통으로 이동하시겠습니까?");
    gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg), "%s", name);
    g_free(name);
    gtk_widget_show_all(dlg);
    gint resp = gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
    if (resp != GTK_RESPONSE_YES) return;

    GFile *gfile = g_file_new_for_path(path);
    GError *gerr = NULL;
    if (!g_file_trash(gfile, NULL, &gerr)) {
        show_error(self, "삭제 오류", gerr ? gerr->message : "삭제 실패");
        queue_log(self, "[오류] 로컬 삭제 실패: %s",
                  gerr ? gerr->message : "알 수 없는 오류");
        g_clear_error(&gerr);
    } else {
        queue_log(self, "[삭제] 로컬: %s", path);
    }
    g_object_unref(gfile);
    /* GFileMonitor handles auto-refresh */
}

static void on_ctx_download(GtkMenuItem *item, FtpMainWindow *self) {
    (void)item;
    do_download_selected(self);
}

static void on_ctx_upload(GtkMenuItem *item, FtpMainWindow *self) {
    (void)item;
    do_upload_selected(self);
}

static void on_ctx_refresh_server(GtkMenuItem *item, FtpMainWindow *self) {
    (void)item;
    if (self->connected && self->server_path)
        load_server_directory(self, self->server_path);
}

static void on_ctx_refresh_local(GtkMenuItem *item, FtpMainWindow *self) {
    (void)item;
    file_pane_refresh_local_directory(self->local_pane);
}

static gboolean on_server_popup(GtkWidget *w, FtpMainWindow *self) {
    (void)w;
    gtk_menu_popup_at_pointer(GTK_MENU(self->ctx_server), NULL);
    return TRUE;
}

static gboolean on_local_popup(GtkWidget *w, FtpMainWindow *self) {
    (void)w;
    gtk_menu_popup_at_pointer(GTK_MENU(self->ctx_local), NULL);
    return TRUE;
}

static void setup_context_menus_fixed(FtpMainWindow *self) {
    GtkWidget *m;
    GtkWidget *sv = file_pane_get_tree_view(self->server_pane);
    GtkWidget *lv = file_pane_get_tree_view(self->local_pane);

    /* Server context menu */
    self->ctx_server = gtk_menu_new();
    m = gtk_menu_item_new_with_label("다운로드");
    g_signal_connect(m, "activate", G_CALLBACK(on_ctx_download), self);
    gtk_menu_shell_append(GTK_MENU_SHELL(self->ctx_server), m);
    gtk_menu_shell_append(GTK_MENU_SHELL(self->ctx_server), gtk_separator_menu_item_new());
    m = gtk_menu_item_new_with_label("삭제");
    g_signal_connect(m, "activate", G_CALLBACK(on_ctx_delete_server), self);
    gtk_menu_shell_append(GTK_MENU_SHELL(self->ctx_server), m);
    gtk_menu_shell_append(GTK_MENU_SHELL(self->ctx_server), gtk_separator_menu_item_new());
    m = gtk_menu_item_new_with_label("새로 고침");
    g_signal_connect(m, "activate", G_CALLBACK(on_ctx_refresh_server), self);
    gtk_menu_shell_append(GTK_MENU_SHELL(self->ctx_server), m);
    gtk_widget_show_all(self->ctx_server);
    gtk_menu_attach_to_widget(GTK_MENU(self->ctx_server), sv, NULL);

    /* Local context menu */
    self->ctx_local = gtk_menu_new();
    m = gtk_menu_item_new_with_label("업로드");
    g_signal_connect(m, "activate", G_CALLBACK(on_ctx_upload), self);
    gtk_menu_shell_append(GTK_MENU_SHELL(self->ctx_local), m);
    gtk_menu_shell_append(GTK_MENU_SHELL(self->ctx_local), gtk_separator_menu_item_new());
    m = gtk_menu_item_new_with_label("삭제 (휴지통)");
    g_signal_connect(m, "activate", G_CALLBACK(on_ctx_delete_local), self);
    gtk_menu_shell_append(GTK_MENU_SHELL(self->ctx_local), m);
    gtk_menu_shell_append(GTK_MENU_SHELL(self->ctx_local), gtk_separator_menu_item_new());
    m = gtk_menu_item_new_with_label("새로 고침");
    g_signal_connect(m, "activate", G_CALLBACK(on_ctx_refresh_local), self);
    gtk_menu_shell_append(GTK_MENU_SHELL(self->ctx_local), m);
    gtk_widget_show_all(self->ctx_local);
    gtk_menu_attach_to_widget(GTK_MENU(self->ctx_local), lv, NULL);

    /* Right-click shows popup directly; popup-menu for keyboard (Shift+F10) */
    gtk_widget_add_events(sv, GDK_BUTTON_PRESS_MASK);
    gtk_widget_add_events(lv, GDK_BUTTON_PRESS_MASK);
    g_signal_connect(sv, "button-press-event", G_CALLBACK(on_server_button_press), self);
    g_signal_connect(lv, "button-press-event", G_CALLBACK(on_local_button_press), self);
    g_signal_connect(sv, "popup-menu", G_CALLBACK(on_server_popup), self);
    g_signal_connect(lv, "popup-menu", G_CALLBACK(on_local_popup), self);
}

/* ── toolbar profiles ─────────────────────────────────────────────────── */

static void on_profile_save(GtkButton *btn, FtpMainWindow *self) {
    (void)btn;
    FtpProfile p;
    memset(&p, 0, sizeof p);
    g_strlcpy(p.host, gtk_entry_get_text(GTK_ENTRY(self->entry_host)), FTP_MAX_HOST);
    g_strlcpy(p.user, gtk_entry_get_text(GTK_ENTRY(self->entry_user)), FTP_MAX_USER);
    g_strlcpy(p.password, gtk_entry_get_text(GTK_ENTRY(self->entry_password)), FTP_MAX_PASS);
    p.protocol = toolbar_protocol(self);
    const gchar *pt = gtk_entry_get_text(GTK_ENTRY(self->entry_port));
    p.port = pt && pt[0] ? atoi(pt) : ftp_default_port(p.protocol);
    p.save_password = TRUE;

    g_snprintf(p.name, FTP_MAX_NAME, "%s@%s",
               p.user[0] ? p.user : "user",
               p.host[0] ? p.host : "host");

    FtpProfile *existing = ftp_profile_find(self->profiles, p.name);
    gboolean is_new = (existing == NULL);
    if (!site_dialog_run_edit(GTK_WINDOW(self), &p, is_new)) return;

    if (existing)
        memcpy(existing, &p, sizeof p);
    else
        self->profiles = g_list_append(self->profiles, ftp_profile_copy(&p));
    ftp_profile_save_all(self->profiles);
    refresh_profile_combo(self);
}

static void on_sites_manage(GtkButton *btn, FtpMainWindow *self) {
    (void)btn;
    FtpProfile apply;
    memset(&apply, 0, sizeof apply);
    if (site_dialog_run_manage(GTK_WINDOW(self), &self->profiles, &apply)) {
        ftp_profile_save_all(self->profiles);
        refresh_profile_combo(self);
    }
    if (apply.name[0])
        apply_profile(self, &apply);
}

static void on_upload_btn(GtkButton *btn, FtpMainWindow *self) {
    (void)btn;
    do_upload_selected(self);
}

static void on_download_btn(GtkButton *btn, FtpMainWindow *self) {
    (void)btn;
    do_download_selected(self);
}

/* ── window build ──────────────────────────────────────────────────────── */

static GtkWidget *make_toolbar_button_icon(const gchar *icon_name, const gchar *tooltip) {
    GtkWidget *img = gtk_image_new_from_icon_name(icon_name, GTK_ICON_SIZE_BUTTON);
    GtkWidget *btn = gtk_button_new();
    gtk_button_set_image(GTK_BUTTON(btn), img);
    gtk_widget_set_tooltip_text(btn, tooltip);
    return btn;
}

static void ftp_main_window_init(FtpMainWindow *self) {
    gtk_window_set_title(GTK_WINDOW(self), "FTP Client (GTK)");
    gtk_window_set_default_size(GTK_WINDOW(self), 1024, 700);

    self->session = ftp_session_new();
    self->server_path = NULL;
    ftp_settings_load(&self->settings);
    gchar normalized[FTP_MAX_PATH];
    ftp_normalize_local_path(self->settings.last_local_path,
                             normalized, sizeof normalized);
    g_strlcpy(self->settings.last_local_path, normalized, FTP_MAX_PATH);
    self->local_path = g_strdup(normalized);
    self->profiles = ftp_profile_load_all();

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(self), vbox);

    /* Toolbar */
    GtkWidget *toolbar = gtk_toolbar_new();
    gtk_box_pack_start(GTK_BOX(vbox), toolbar, FALSE, FALSE, 0);

    self->combo_profiles = gtk_combo_box_text_new();
    gtk_widget_set_tooltip_text(self->combo_profiles, "저장된 프로파일 선택");
    gtk_widget_set_size_request(self->combo_profiles, 160, -1);
    GtkToolItem *ti_profiles = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(ti_profiles), self->combo_profiles);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), ti_profiles, -1);

    GtkToolItem *sep0 = gtk_separator_tool_item_new();
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), sep0, -1);

    self->combo_protocol = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(self->combo_protocol), "FTP");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(self->combo_protocol), "FTPS");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(self->combo_protocol), "SFTP");
    gtk_combo_box_set_active(GTK_COMBO_BOX(self->combo_protocol), 0);
    GtkToolItem *ti_proto = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(ti_proto), self->combo_protocol);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), ti_proto, -1);

    self->entry_host = gtk_entry_new();
    gtk_entry_set_width_chars(GTK_ENTRY(self->entry_host), 18);
    gtk_entry_set_placeholder_text(GTK_ENTRY(self->entry_host), "호스트");
    GtkToolItem *ti_host = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(ti_host), self->entry_host);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), ti_host, -1);

    self->entry_port = gtk_entry_new();
    gtk_entry_set_width_chars(GTK_ENTRY(self->entry_port), 5);
    gtk_entry_set_placeholder_text(GTK_ENTRY(self->entry_port), "포트");
    GtkToolItem *ti_port = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(ti_port), self->entry_port);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), ti_port, -1);

    self->entry_user = gtk_entry_new();
    gtk_entry_set_width_chars(GTK_ENTRY(self->entry_user), 10);
    gtk_entry_set_placeholder_text(GTK_ENTRY(self->entry_user), "사용자");
    GtkToolItem *ti_user = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(ti_user), self->entry_user);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), ti_user, -1);

    self->entry_password = gtk_entry_new();
    gtk_entry_set_visibility(GTK_ENTRY(self->entry_password), FALSE);
    gtk_entry_set_width_chars(GTK_ENTRY(self->entry_password), 10);
    gtk_entry_set_placeholder_text(GTK_ENTRY(self->entry_password), "비밀번호");
    GtkToolItem *ti_pass = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(ti_pass), self->entry_password);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), ti_pass, -1);

    self->btn_connect = gtk_button_new_with_label("연결");
    GtkToolItem *ti_conn = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(ti_conn), self->btn_connect);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), ti_conn, -1);

    GtkToolItem *sep = gtk_separator_tool_item_new();
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), sep, -1);

    GtkWidget *btn_save = gtk_button_new_with_label("사이트 저장");
    GtkToolItem *ti_save = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(ti_save), btn_save);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), ti_save, -1);

    GtkWidget *btn_manage = gtk_button_new_with_label("사이트 관리");
    GtkToolItem *ti_mgr = gtk_tool_item_new();
    gtk_container_add(GTK_CONTAINER(ti_mgr), btn_manage);
    gtk_toolbar_insert(GTK_TOOLBAR(toolbar), ti_mgr, -1);


    /* Vertical paned: file panes (top) | log panel (bottom) */
    GtkWidget *vpaned = gtk_paned_new(GTK_ORIENTATION_VERTICAL);
    gtk_paned_set_wide_handle(GTK_PANED(vpaned), TRUE);
    gtk_box_pack_start(GTK_BOX(vbox), vpaned, TRUE, TRUE, 0);

    /* ── File pane area ── */
    GtkWidget *paned_main = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_paned_set_wide_handle(GTK_PANED(paned_main), TRUE);
    gtk_widget_set_size_request(paned_main, -1, 300);
    gtk_paned_pack1(GTK_PANED(vpaned), paned_main, TRUE, TRUE);

    self->server_pane = file_pane_new_server();
    GtkWidget *server_w = file_pane_get_widget(self->server_pane);
    gtk_widget_set_size_request(server_w, 200, -1);
    gtk_paned_pack1(GTK_PANED(paned_main), server_w, TRUE, TRUE);

    /* Transfer bar sits between the two file panes */
    GtkWidget *right_panel = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
    gtk_widget_set_size_request(right_panel, 200, -1);
    gtk_paned_pack2(GTK_PANED(paned_main), right_panel, TRUE, TRUE);
    gtk_paned_set_position(GTK_PANED(paned_main), 490);

    GtkWidget *transfer_bar = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_widget_set_size_request(transfer_bar, 60, -1);
    gtk_widget_set_valign(transfer_bar, GTK_ALIGN_CENTER);
    gtk_widget_set_margin_start(transfer_bar, 4);
    gtk_widget_set_margin_end(transfer_bar, 4);
    gtk_box_pack_start(GTK_BOX(right_panel), transfer_bar, FALSE, FALSE, 0);

    self->btn_upload   = make_toolbar_button_icon("go-previous", "업로드: 로컬 → 서버  (←)");
    self->btn_download = make_toolbar_button_icon("go-next",     "다운로드: 서버 → 로컬 (→)");
    gtk_box_pack_start(GTK_BOX(transfer_bar), self->btn_upload, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(transfer_bar), self->btn_download, FALSE, FALSE, 0);

    self->local_pane = file_pane_new_local();
    GtkWidget *local_w = file_pane_get_widget(self->local_pane);
    gtk_widget_set_hexpand(local_w, TRUE);
    gtk_widget_set_vexpand(local_w, TRUE);
    gtk_box_pack_start(GTK_BOX(right_panel), local_w, TRUE, TRUE, 0);

    /* ── Log panel (minimum 7 visible lines) ── */
    GtkWidget *log_frame = gtk_frame_new("로그");
    gtk_paned_pack2(GTK_PANED(vpaned), log_frame, FALSE, TRUE);
    gtk_paned_set_position(GTK_PANED(vpaned), 450);

    GtkWidget *log_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(log_scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(log_frame), log_scroll);

    self->log_view = gtk_text_view_new();
    self->log_buf  = gtk_text_view_get_buffer(GTK_TEXT_VIEW(self->log_view));
    gtk_text_view_set_editable(GTK_TEXT_VIEW(self->log_view), FALSE);
    gtk_text_view_set_cursor_visible(GTK_TEXT_VIEW(self->log_view), FALSE);
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(self->log_view), GTK_WRAP_WORD_CHAR);
    gtk_text_view_set_left_margin(GTK_TEXT_VIEW(self->log_view), 4);
    /* Use monospace font; calculate min-height for 7 lines */
    {
        PangoFontDescription *mono =
            pango_font_description_from_string("Monospace 9");
        gtk_widget_override_font(self->log_view, mono);
        pango_font_description_free(mono);
    }
    /* 7 lines × ~18 px/line = 126 px; add scrollbar + frame border ≈ 160 px */
    gtk_widget_set_size_request(log_frame, -1, 160);
    gtk_container_add(GTK_CONTAINER(log_scroll), self->log_view);

    /* ── Status bar + progress ── */
    self->progress = gtk_progress_bar_new();
    gtk_progress_bar_set_show_text(GTK_PROGRESS_BAR(self->progress), TRUE);
    gtk_box_pack_start(GTK_BOX(vbox), self->progress, FALSE, FALSE, 0);
    gtk_widget_hide(self->progress);

    self->statusbar = gtk_statusbar_new();
    self->status_ctx = gtk_statusbar_get_context_id(GTK_STATUSBAR(self->statusbar), "main");
    gtk_box_pack_start(GTK_BOX(vbox), self->statusbar, FALSE, FALSE, 0);

    load_icons(self);
    refresh_profile_combo(self);
    file_pane_init_local_home(self->local_pane, ftp_home_directory());
    file_pane_show_local_directory(self->local_pane, self->local_path);
    start_local_monitor(self, self->local_path);
    file_pane_set_path_label(self->server_pane, NULL);

    setup_context_menus_fixed(self);
    update_connect_button(self);
    set_status(self, "준비됨");
    append_log(self, "[시작] FTP Client 준비됨.");

    g_signal_connect(self->combo_profiles, "changed",
                     G_CALLBACK(on_profile_combo_changed), self);
    g_signal_connect(file_pane_get_refresh_button(self->server_pane), "clicked",
                     G_CALLBACK(on_ctx_refresh_server), self);
    g_signal_connect(file_pane_get_refresh_button(self->local_pane), "clicked",
                     G_CALLBACK(on_ctx_refresh_local), self);
    g_signal_connect(self->btn_connect, "clicked", G_CALLBACK(on_connect_clicked), self);
    g_signal_connect(btn_save, "clicked", G_CALLBACK(on_profile_save), self);
    g_signal_connect(btn_manage, "clicked", G_CALLBACK(on_sites_manage), self);
    g_signal_connect(self->btn_upload, "clicked", G_CALLBACK(on_upload_btn), self);
    g_signal_connect(self->btn_download, "clicked", G_CALLBACK(on_download_btn), self);

    GtkWidget *sv = file_pane_get_tree_view(self->server_pane);
    GtkWidget *lv = file_pane_get_tree_view(self->local_pane);
    g_signal_connect(sv, "row-activated", G_CALLBACK(on_server_row_activated_fix), self);
    g_signal_connect(lv, "row-activated", G_CALLBACK(on_local_row_activated), self);
}

static void ftp_main_window_dispose(GObject *obj) {
    FtpMainWindow *self = FTP_MAIN_WINDOW(obj);
    if (self->local_path) {
        ftp_normalize_local_path(self->local_path,
                                 self->settings.last_local_path,
                                 FTP_MAX_PATH);
    }
    if (self->server_path)
        g_strlcpy(self->settings.last_server_path, self->server_path, FTP_MAX_PATH);
    ftp_settings_save(&self->settings);
    ftp_profile_save_all(self->profiles);
    g_list_free_full(self->profiles, (GDestroyNotify)ftp_profile_free);
    disconnect_session(self);
    g_clear_pointer(&self->server_path, g_free);
    g_clear_pointer(&self->local_path, g_free);
    g_clear_object(&self->icon_folder);
    g_clear_object(&self->icon_file);
    g_clear_object(&self->icon_parent);
    if (self->local_refresh_timeout) {
        g_source_remove(self->local_refresh_timeout);
        self->local_refresh_timeout = 0;
    }
    if (self->local_monitor) {
        g_file_monitor_cancel(self->local_monitor);
        g_clear_object(&self->local_monitor);
    }
    g_clear_pointer(&self->session, ftp_session_free);
    G_OBJECT_CLASS(ftp_main_window_parent_class)->dispose(obj);
}

static void ftp_main_window_class_init(FtpMainWindowClass *klass) {
    GObjectClass *obj = G_OBJECT_CLASS(klass);
    obj->dispose = ftp_main_window_dispose;
}

FtpMainWindow *ftp_main_window_new(GtkApplication *app) {
    return g_object_new(FTP_MAIN_WINDOW_TYPE,
                       "application", app, NULL);
}
