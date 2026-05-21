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
    gboolean       disposed; /* TRUE once dispose begins; idle callbacks check this */
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
    gboolean       upload;
    guint          batch_total;
    guint          batch_ok;
    gchar         *remote;
    gchar         *local;
    gboolean       is_dir;
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
    if (!l->win->disposed)
        append_log(l->win, l->message);
    g_free(l->message);
    g_object_unref(l->win);
    g_free(l);
    return G_SOURCE_REMOVE;
}

static void queue_log(FtpMainWindow *self, const gchar *fmt, ...) {
    if (self->disposed) return;
    va_list ap;
    va_start(ap, fmt);
    gchar *msg = g_strdup_vprintf(fmt, ap);
    va_end(ap);
    LogIdle *l = g_new(LogIdle, 1);
    l->win     = g_object_ref(self);
    l->message = msg;
    g_idle_add(idle_append_log, l);
}

static void set_status(FtpMainWindow *self, const gchar *text) {
    gtk_statusbar_pop(GTK_STATUSBAR(self->statusbar), self->status_ctx);
    gtk_statusbar_push(GTK_STATUSBAR(self->statusbar), self->status_ctx, text ? text : "");
}

static gboolean idle_set_status(gpointer data) {
    StatusIdle *s = data;
    if (!s->win->disposed)
        set_status(s->win, s->message);
    g_free(s->message);
    g_object_unref(s->win);
    g_free(s);
    return G_SOURCE_REMOVE;
}

static void queue_status(FtpMainWindow *self, const gchar *fmt, ...) {
    if (self->disposed) return;
    va_list ap;
    va_start(ap, fmt);
    gchar *msg = g_strdup_vprintf(fmt, ap);
    va_end(ap);
    StatusIdle *s = g_new(StatusIdle, 1);
    s->win     = g_object_ref(self);
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
    file_pane_populate_flat(self->server_pane, entries, self->server_path);
    g_ptr_array_unref(entries);
    queue_status(self, "서버: %s", self->server_path);
}

static gboolean idle_list_done(gpointer data) {
    ListDone *d = data;
    if (!d->win->disposed)
        server_load_done(d->win, d->entries, d->path, d->err);
    else {
        if (d->entries) g_ptr_array_unref(d->entries);
        if (d->err)     g_error_free(d->err);
    }
    g_free(d->path);
    g_object_unref(d->win);
    g_free(d);
    return G_SOURCE_REMOVE;
}

static gpointer list_thread(gpointer data) {
    PathTask *t = data;
    GError *err = NULL;
    GPtrArray *arr = ftp_session_list_directory(t->win->session, t->path, &err);

    ListDone *done = g_new(ListDone, 1);
    done->win = g_object_ref(t->win);
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
    if (!p->win->disposed) {
        gchar *pct = g_strdup_printf("%d%%", p->percent);
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(p->win->progress),
                                      p->percent / 100.0);
        gtk_progress_bar_set_text(GTK_PROGRESS_BAR(p->win->progress), pct);
        g_free(pct);
    }
    g_free(p->detail);
    g_object_unref(p->win);
    g_free(p);
    return G_SOURCE_REMOVE;
}

static void on_progress(gint percent, const gchar *detail, gpointer data) {
    FtpMainWindow *self = data;
    if (self->disposed) return;
    queue_status(self, "%s  %d%%", detail ? detail : "전송", percent);

    ProgressIdle *p = g_new(ProgressIdle, 1);
    p->win     = g_object_ref(self);
    p->percent = percent;
    p->detail  = g_strdup(detail);
    g_idle_add(idle_update_progress, p);
}

static gboolean idle_transfer_done(gpointer data) {
    TransferDone *d = data;
    FtpMainWindow *self = d->win;

    if (self->disposed) {
        if (d->err) g_error_free(d->err);
        g_free(d->remote); g_free(d->local);
        g_object_unref(d->win);
        g_free(d);
        return G_SOURCE_REMOVE;
    }

    self->busy = FALSE;
    gtk_widget_hide(self->progress);

    if (d->batch_total > 1) {
        if (d->batch_ok == d->batch_total) {
            queue_status(self, d->upload ? "업로드 완료 (%u개)" : "다운로드 완료 (%u개)",
                         d->batch_total);
            queue_log(self, "[%s] %u개 파일 전송 완료",
                      d->upload ? "업로드" : "다운로드", d->batch_total);
        } else {
            gchar *msg = g_strdup_printf(
                d->upload ? "업로드: %u/%u개 성공" : "다운로드: %u/%u개 성공",
                d->batch_ok, d->batch_total);
            if (d->err)
                show_error(self, d->upload ? "업로드 오류" : "다운로드 오류", d->err->message);
            queue_status(self, "%s", msg);
            queue_log(self, "[오류] %s — %s",
                      d->upload ? "업로드" : "다운로드", msg);
            g_free(msg);
            if (d->err) g_error_free(d->err);
        }
        if (d->upload)
            load_server_directory(self, self->server_path);
        else
            file_pane_refresh_local_directory(self->local_pane);
    } else if (d->err) {
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
    g_object_unref(d->win);
    g_free(d);
    return G_SOURCE_REMOVE;
}

typedef struct {
    gchar     *remote;
    gchar     *local;
    gboolean   is_dir;
} XferItem;

typedef struct {
    FtpMainWindow *win;
    GPtrArray     *items;   /* XferItem*; NULL = single-file task */
    gchar         *remote;
    gchar         *local;
    gboolean       is_dir;
    gboolean       upload;
} TransferTask;

static void xfer_item_free(gpointer data) {
    XferItem *x = data;
    g_free(x->remote);
    g_free(x->local);
    g_free(x);
}

static gboolean run_one_transfer(TransferTask *t, XferItem *item, GError **err) {
    if (t->upload)
        return ftp_session_upload(t->win->session, item->local, item->remote,
                                  item->is_dir, on_progress, t->win, err);
    return ftp_session_download(t->win->session, item->remote, item->local,
                                item->is_dir, on_progress, t->win, err);
}

static gpointer transfer_thread(gpointer data) {
    TransferTask *t = data;
    TransferDone *done = g_new0(TransferDone, 1);
    done->win    = g_object_ref(t->win);
    done->upload = t->upload;

    if (t->items) {
        guint n = t->items->len;
        done->batch_total = n;
        for (guint i = 0; i < n; i++) {
            XferItem *item = g_ptr_array_index(t->items, i);
            GError *err = NULL;
            if (run_one_transfer(t, item, &err)) {
                done->batch_ok++;
            } else {
                if (!err)
                    g_set_error(&err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                                "Transfer failed");
                if (done->err) g_error_free(done->err);
                done->err = err;
                err = NULL;
            }
        }
        g_ptr_array_unref(t->items);
        t->items = NULL;
    } else {
        XferItem single = {
            .remote = t->remote,
            .local  = t->local,
            .is_dir = t->is_dir
        };
        done->batch_total = 1;
        done->remote = t->remote;
        done->local  = t->local;
        done->is_dir = t->is_dir;
        t->remote = NULL;
        t->local  = NULL;

        GError *err = NULL;
        if (run_one_transfer(t, &single, &err)) {
            done->batch_ok = 1;
        } else {
            if (!err)
                g_set_error(&err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                            "Transfer failed");
            done->err = err;
        }
    }

    g_free(t);
    g_idle_add(idle_transfer_done, done);
    return NULL;
}

static void begin_transfer_ui(FtpMainWindow *self, gboolean upload, guint count) {
    self->busy = TRUE;
    gtk_widget_show(self->progress);
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(self->progress), 0.0);
    if (count > 1) {
        queue_status(self, upload ? "업로드 중... (%u개)" : "다운로드 중... (%u개)",
                     count);
    } else {
        queue_status(self, upload ? "업로드 중..." : "다운로드 중...");
    }
}

static void start_transfer_task(FtpMainWindow *self, TransferTask *t) {
    if (!self->connected) {
        show_error(self, "오류", "서버에 연결되어 있지 않습니다.");
        if (t->items) g_ptr_array_unref(t->items);
        g_free(t->remote);
        g_free(t->local);
        g_free(t);
        return;
    }
    if (self->busy) {
        if (t->items) g_ptr_array_unref(t->items);
        g_free(t->remote);
        g_free(t->local);
        g_free(t);
        return;
    }

    guint count = t->items ? t->items->len : 1;
    begin_transfer_ui(self, t->upload, count);
    t->win = self;
    g_thread_new("ftp-xfer", transfer_thread, t);
}

static void start_transfer(FtpMainWindow *self,
                           const gchar *remote,
                           const gchar *local,
                           gboolean is_dir,
                           gboolean upload) {
    TransferTask *t = g_new(TransferTask, 1);
    t->items  = NULL;
    t->remote = g_strdup(remote);
    t->local  = g_strdup(local);
    t->is_dir = is_dir;
    t->upload = upload;
    start_transfer_task(self, t);
}

static gboolean path_under_directory(const gchar *path, const gchar *dir) {
    if (!path || !dir || g_strcmp0(path, dir) == 0)
        return FALSE;
    gsize dlen = strlen(dir);
    if (strncmp(path, dir, dlen) != 0)
        return FALSE;
    return path[dlen] == '/' || path[dlen] == G_DIR_SEPARATOR;
}

static gboolean selection_covered_by_dir(GPtrArray *sel, FtpDirEntry *e) {
    for (guint i = 0; i < sel->len; i++) {
        FtpDirEntry *p = g_ptr_array_index(sel, i);
        if (!p->is_dir || g_strcmp0(p->path, e->path) == 0)
            continue;
        if (path_under_directory(e->path, p->path))
            return TRUE;
    }
    return FALSE;
}

static GPtrArray *build_upload_items(FtpMainWindow *self, GPtrArray *sel) {
    GPtrArray *items = g_ptr_array_new_with_free_func(xfer_item_free);
    for (guint i = 0; i < sel->len; i++) {
        FtpDirEntry *e = g_ptr_array_index(sel, i);
        if (selection_covered_by_dir(sel, e))
            continue;
        gchar *name = g_path_get_basename(e->path);
        XferItem *xi = g_new0(XferItem, 1);
        xi->local  = g_strdup(e->path);
        xi->remote = remote_dest_path(self, name);
        xi->is_dir = e->is_dir;
        g_ptr_array_add(items, xi);
        g_free(name);
    }
    return items;
}

static GPtrArray *build_download_items(FtpMainWindow *self, GPtrArray *sel) {
    GPtrArray *items = g_ptr_array_new_with_free_func(xfer_item_free);
    const gchar *local_base = self->local_path ? self->local_path : "/";
    for (guint i = 0; i < sel->len; i++) {
        FtpDirEntry *e = g_ptr_array_index(sel, i);
        if (selection_covered_by_dir(sel, e))
            continue;
        gchar *name = g_path_get_basename(e->path);
        XferItem *xi = g_new0(XferItem, 1);
        xi->remote = g_strdup(e->path);
        xi->local  = g_build_filename(local_base, name, NULL);
        xi->is_dir = e->is_dir;
        g_ptr_array_add(items, xi);
        g_free(name);
    }
    return items;
}

static void start_selected_transfers(FtpMainWindow *self,
                                     FilePane *pane,
                                     gboolean upload) {
    GPtrArray *sel = file_pane_get_selected_entries(pane);
    if (sel->len == 0) {
        g_ptr_array_unref(sel);
        return;
    }

    GPtrArray *items = upload
        ? build_upload_items(self, sel)
        : build_download_items(self, sel);
    g_ptr_array_unref(sel);

    if (items->len == 0) {
        g_ptr_array_unref(items);
        return;
    }

    queue_log(self, "[%s] %u개 항목 전송 시작",
              upload ? "업로드" : "다운로드", items->len);

    if (items->len == 1) {
        XferItem *xi = g_ptr_array_index(items, 0);
        start_transfer(self, xi->remote, xi->local, xi->is_dir, upload);
        g_ptr_array_unref(items);
        return;
    }

    TransferTask *t = g_new0(TransferTask, 1);
    t->items  = items;
    t->upload = upload;
    start_transfer_task(self, t);
}

static void do_upload_selected(FtpMainWindow *self) {
    start_selected_transfers(self, self->local_pane, TRUE);
}

static void do_download_selected(FtpMainWindow *self) {
    start_selected_transfers(self, self->server_pane, FALSE);
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

    if (self->disposed) {
        if (d->err) g_error_free(d->err);
        g_object_unref(d->win);
        g_free(d);
        return G_SOURCE_REMOVE;
    }

    self->busy = FALSE;
    gtk_widget_set_sensitive(self->btn_connect, TRUE);
    gtk_widget_hide(self->progress);

    if (d->ok) {
        self->connected = TRUE;
        update_connect_button(self);
        g_free(self->server_path);
        self->server_path = g_strdup("/");
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
    g_object_unref(d->win);
    g_free(d);
    return G_SOURCE_REMOVE;
}

static gpointer connect_thread(gpointer data) {
    ConnectTask *t = data;
    GError *err = NULL;
    gboolean ok = ftp_session_connect(t->win->session, t->protocol,
                                      t->host, t->port, t->user, t->password, &err);

    ConnectDone *done = g_new(ConnectDone, 1);
    done->win = g_object_ref(t->win);
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
    (void)tv; (void)col;
    gchar node_path[FTP_MAX_PATH];
    gboolean is_dir = FALSE, is_parent = FALSE;
    if (!file_pane_entry_at_path(self->server_pane, path, node_path, sizeof node_path,
                                &is_dir, &is_parent))
        return;

    if (is_parent || is_dir)
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
    (void)tv; (void)col;
    gchar node_path[FTP_MAX_PATH];
    gboolean is_dir = FALSE, is_parent = FALSE;
    if (!file_pane_entry_at_path(self->local_pane, path, node_path, sizeof node_path,
                                &is_dir, &is_parent))
        return;

    if (is_parent || is_dir)
        local_navigate_to(self, node_path);
    else
        do_upload_selected(self);
}

static void tree_select_at(GtkTreeView *tv, GdkEventButton *ev) {
    GtkTreePath *path = NULL;
    GtkTreeSelection *sel = gtk_tree_view_get_selection(tv);
    if (!gtk_tree_view_get_path_at_pos(tv, (gint)ev->x, (gint)ev->y,
                                       &path, NULL, NULL, NULL))
        return;
    /* Keep existing multi-selection when right-clicking an already-selected row */
    if (!gtk_tree_selection_path_is_selected(sel, path))
        gtk_tree_selection_select_path(sel, path);
    gtk_tree_path_free(path);
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
    gchar     *path;
    gboolean   is_dir;
} DeleteItem;

typedef struct {
    FtpMainWindow *win;
    GPtrArray     *items; /* DeleteItem* */
} DeleteTask;

typedef struct {
    FtpMainWindow *win;
    guint          total;
    guint          ok;
    GError        *err;
} DeleteDone;

static void delete_item_free(gpointer data) {
    DeleteItem *d = data;
    g_free(d->path);
    g_free(d);
}

static GPtrArray *build_delete_items(GPtrArray *sel) {
    GPtrArray *items = g_ptr_array_new_with_free_func(delete_item_free);
    for (guint i = 0; i < sel->len; i++) {
        FtpDirEntry *e = g_ptr_array_index(sel, i);
        DeleteItem *d = g_new0(DeleteItem, 1);
        d->path   = g_strdup(e->path);
        d->is_dir = e->is_dir;
        g_ptr_array_add(items, d);
    }
    return items;
}

static gboolean idle_delete_done(gpointer data) {
    DeleteDone *d = data;
    FtpMainWindow *self = d->win;
    if (self->disposed) {
        if (d->err) g_error_free(d->err);
        g_object_unref(d->win);
        g_free(d);
        return G_SOURCE_REMOVE;
    }
    self->busy = FALSE;
    gtk_widget_hide(self->progress);
    if (d->total > 1) {
        if (d->ok == d->total) {
            queue_status(self, "삭제 완료 (%u개)", d->total);
            queue_log(self, "[삭제] 서버 %u개 항목 삭제 완료", d->total);
        } else {
            gchar *msg = g_strdup_printf("삭제: %u/%u개 성공", d->ok, d->total);
            if (d->err)
                show_error(self, "삭제 오류", d->err->message);
            queue_status(self, "%s", msg);
            queue_log(self, "[오류] 서버 삭제 — %s", msg);
            g_free(msg);
            if (d->err) g_error_free(d->err);
        }
    } else if (d->err) {
        show_error(self, "삭제 오류", d->err->message);
        queue_log(self, "[오류] 삭제 실패: %s", d->err->message);
        g_error_free(d->err);
    } else {
        queue_status(self, "삭제 완료");
        queue_log(self, "[삭제] 서버: 1개 항목 삭제 완료");
    }
    if (self->connected && self->server_path)
        load_server_directory(self, self->server_path);
    g_object_unref(d->win);
    g_free(d);
    return G_SOURCE_REMOVE;
}

static gpointer delete_thread(gpointer data) {
    DeleteTask *t = data;
    guint n = t->items->len;
    guint ok = 0;
    GError *last_err = NULL;

    for (guint i = 0; i < n; i++) {
        DeleteItem *item = g_ptr_array_index(t->items, i);
        GError *err = NULL;
        if (ftp_session_delete(t->win->session, item->path, item->is_dir, &err))
            ok++;
        else {
            if (!err)
                g_set_error(&err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Delete failed");
            if (last_err) g_error_free(last_err);
            last_err = err;
        }
    }

    DeleteDone *done = g_new0(DeleteDone, 1);
    done->win   = g_object_ref(t->win);
    done->total = n;
    done->ok    = ok;
    done->err   = last_err;
    g_ptr_array_unref(t->items);
    g_free(t);
    g_idle_add(idle_delete_done, done);
    return NULL;
}

static gboolean confirm_delete_dialog(FtpMainWindow *self,
                                      const gchar *title,
                                      GPtrArray *sel) {
    gchar *secondary;
    if (sel->len == 1) {
        FtpDirEntry *e = g_ptr_array_index(sel, 0);
        gchar *name = g_path_get_basename(e->path);
        secondary = g_strdup_printf("%s", name);
        g_free(name);
    } else {
        secondary = g_strdup_printf("선택한 %u개 항목", sel->len);
    }

    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(self), GTK_DIALOG_MODAL,
        GTK_MESSAGE_WARNING, GTK_BUTTONS_YES_NO, "%s", title);
    gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg), "%s", secondary);
    g_free(secondary);
    gtk_widget_show_all(dlg);
    gint resp = gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
    return resp == GTK_RESPONSE_YES;
}

static void on_ctx_delete_server(GtkMenuItem *item, FtpMainWindow *self) {
    (void)item;
    if (!self->connected || self->busy) return;

    GPtrArray *sel = file_pane_get_selected_entries(self->server_pane);
    if (sel->len == 0) {
        g_ptr_array_unref(sel);
        return;
    }

    if (!confirm_delete_dialog(self, "서버에서 삭제하시겠습니까?", sel)) {
        g_ptr_array_unref(sel);
        return;
    }

    GPtrArray *items = build_delete_items(sel);
    g_ptr_array_unref(sel);

    self->busy = TRUE;
    gtk_widget_show(self->progress);
    gtk_progress_bar_set_text(GTK_PROGRESS_BAR(self->progress), "삭제 중...");
    if (items->len > 1)
        queue_status(self, "삭제 중... (%u개)", items->len);
    else
        queue_status(self, "삭제 중...");

    DeleteTask *t = g_new(DeleteTask, 1);
    t->win   = self;
    t->items = items;
    g_thread_new("ftp-delete", delete_thread, t);
}

static void on_ctx_delete_local(GtkMenuItem *item, FtpMainWindow *self) {
    (void)item;

    GPtrArray *sel = file_pane_get_selected_entries(self->local_pane);
    if (sel->len == 0) {
        g_ptr_array_unref(sel);
        return;
    }

    if (!confirm_delete_dialog(self, "휴지통으로 이동하시겠습니까?", sel)) {
        g_ptr_array_unref(sel);
        return;
    }

    guint total = sel->len;
    guint ok = 0;
    GError *last_err = NULL;
    for (guint i = 0; i < total; i++) {
        FtpDirEntry *e = g_ptr_array_index(sel, i);
        GFile *gfile = g_file_new_for_path(e->path);
        GError *gerr = NULL;
        if (g_file_trash(gfile, NULL, &gerr)) {
            ok++;
            queue_log(self, "[삭제] 로컬: %s", e->path);
        } else {
            if (!gerr)
                g_set_error(&gerr, G_FILE_ERROR, G_FILE_ERROR_FAILED, "삭제 실패");
            if (last_err) g_error_free(last_err);
            last_err = gerr;
            queue_log(self, "[오류] 로컬 삭제 실패: %s — %s",
                      e->path, gerr->message);
        }
        g_object_unref(gfile);
    }
    g_ptr_array_unref(sel);

    if (total > 1) {
        if (ok == total)
            queue_status(self, "휴지통으로 이동 완료 (%u개)", ok);
        else {
            gchar *msg = g_strdup_printf("삭제: %u/%u개 성공", ok, total);
            if (last_err)
                show_error(self, "삭제 오류", last_err->message);
            queue_status(self, "%s", msg);
            g_free(msg);
        }
    } else if (last_err) {
        show_error(self, "삭제 오류", last_err->message);
    } else {
        queue_status(self, "휴지통으로 이동 완료");
    }
    if (last_err) g_error_free(last_err);
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

/* HANDLE_W must match the CSS min-width of #file-paned > separator */
#define HANDLE_W 44

/* Position upload/download buttons INSIDE the wide handle, stacked vertically.
   Both server and local pane columns are fully unobstructed. */
static gboolean on_transfer_btn_position(GtkOverlay *overlay, GtkWidget *widget,
                                          GdkRectangle *alloc, GtkWidget *paned) {
    gint side = GPOINTER_TO_INT(g_object_get_data(G_OBJECT(widget), "xfer-side"));
    if (side == 0) return FALSE;

    GtkAllocation oa;
    gtk_widget_get_allocation(GTK_WIDGET(overlay), &oa);

    gint hp = gtk_paned_get_position(GTK_PANED(paned)); /* handle left edge */
    gint bw, bh;
    gtk_widget_get_preferred_width (widget, NULL, &bw);
    gtk_widget_get_preferred_height(widget, NULL, &bh);

    /* Horizontally: center button within the HANDLE_W-wide separator */
    alloc->x      = hp + (HANDLE_W - bw) / 2;
    alloc->width  = bw;
    alloc->height = bh;

    /* Vertically: upload above center, download below center */
    gint gap = 4;
    gint cy  = oa.height / 2;
    if (side < 0) /* upload (←) */
        alloc->y = cy - bh - gap;
    else          /* download (→) */
        alloc->y = cy + gap;

    /* Clamp */
    if (alloc->x < 0) alloc->x = 0;
    if (alloc->y < 0) alloc->y = 0;
    if (alloc->x + alloc->width  > oa.width)  alloc->x = oa.width  - alloc->width;
    if (alloc->y + alloc->height > oa.height) alloc->y = oa.height - alloc->height;

    return TRUE;
}

static void on_paned_pos_notify(GObject *paned, GParamSpec *spec,
                                 GtkWidget *overlay) {
    (void)paned; (void)spec;
    /* Re-trigger get-child-position for the floating buttons only.
       queue_allocate is lighter than queue_resize: it re-allocates the
       overlay's own children without propagating upward, so the paned
       children are not touched and there is no visual flicker. */
    gtk_widget_queue_allocate(overlay);
}

/* Called on the second size-allocate (after set_position fires the first)
   to make both panes visible.  They were hidden with opacity=0 to prevent
   the brief flash that occurs when paned position is still 0.             */
static void reveal_panes_on_allocate(GtkWidget *paned,
                                      GtkAllocation *alloc,
                                      gpointer data) {
    (void)alloc; (void)data;
    g_signal_handlers_disconnect_by_func(paned, reveal_panes_on_allocate, data);
    GtkWidget *c1 = gtk_paned_get_child1(GTK_PANED(paned));
    GtkWidget *c2 = gtk_paned_get_child2(GTK_PANED(paned));
    if (c1) gtk_widget_set_opacity(c1, 1.0);
    if (c2) gtk_widget_set_opacity(c2, 1.0);
}

/* gtk_paned_set_position() called before realization is clamped to 0
   because GTK doesn't know the widget width yet.  Set the initial
   50/50 split on the first valid size-allocate instead.              */
static void paned_set_initial_pos(GtkWidget *paned,
                                   GtkAllocation *alloc,
                                   gpointer data) {
    (void)data;
    if (alloc->width < 100) return; /* not a valid allocation yet */
    /* Disconnect so this only fires once */
    g_signal_handlers_disconnect_by_func(paned, paned_set_initial_pos, data);
    gint pos = (alloc->width - HANDLE_W) / 2;
    gtk_paned_set_position(GTK_PANED(paned), pos);
    /* Reveal panes on the very next size-allocate (after set_position takes
       effect), so columns are rendered at their final widths from the start. */
    g_signal_connect(paned, "size-allocate",
                     G_CALLBACK(reveal_panes_on_allocate), NULL);
}

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

    /* ── File pane area ──
       GtkOverlay as container so transfer buttons float over the paned handle
       without blocking it.  The horizontal GtkPaned holds server and local
       panes DIRECTLY → the handle is freely grabbable from BOTH sides.      */
    GtkWidget *file_overlay = gtk_overlay_new();
    gtk_widget_set_size_request(file_overlay, -1, 300);
    gtk_paned_pack1(GTK_PANED(vpaned), file_overlay, TRUE, TRUE);

    GtkWidget *paned_main = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_paned_set_wide_handle(GTK_PANED(paned_main), TRUE);
    gtk_widget_set_name(paned_main, "file-paned"); /* CSS target for wide handle */
    gtk_container_add(GTK_CONTAINER(file_overlay), paned_main);

    self->server_pane = file_pane_new_server();
    GtkWidget *server_w = file_pane_get_widget(self->server_pane);
    gtk_widget_set_size_request(server_w, 200, -1);
    gtk_paned_pack1(GTK_PANED(paned_main), server_w, TRUE, TRUE);

    self->local_pane = file_pane_new_local();
    GtkWidget *local_w = file_pane_get_widget(self->local_pane);
    gtk_widget_set_size_request(local_w, 200, -1);
    gtk_paned_pack2(GTK_PANED(paned_main), local_w, TRUE, TRUE);
    /* server=480 | handle=44 | local=remaining */
    /* Position is set dynamically on first size-allocate (see paned_set_initial_pos) */
    g_signal_connect(paned_main, "size-allocate",
                     G_CALLBACK(paned_set_initial_pos), NULL);

    /* Upload button floats left of the handle (inside server pane area) */
    self->btn_upload = make_toolbar_button_icon("go-previous",
        "업로드: 선택한 로컬 항목 → 서버 (Ctrl/Shift로 다중 선택)");
    gtk_widget_set_halign(self->btn_upload, GTK_ALIGN_START);
    gtk_widget_set_valign(self->btn_upload, GTK_ALIGN_CENTER);
    g_object_set_data(G_OBJECT(self->btn_upload), "xfer-side", GINT_TO_POINTER(-1));
    gtk_overlay_add_overlay(GTK_OVERLAY(file_overlay), self->btn_upload);

    /* Download button floats right of the handle (inside local pane area) */
    self->btn_download = make_toolbar_button_icon("go-next",
        "다운로드: 선택한 서버 항목 → 로컬 (Ctrl/Shift로 다중 선택)");
    gtk_widget_set_halign(self->btn_download, GTK_ALIGN_START);
    gtk_widget_set_valign(self->btn_download, GTK_ALIGN_CENTER);
    g_object_set_data(G_OBJECT(self->btn_download), "xfer-side", GINT_TO_POINTER(1));
    gtk_overlay_add_overlay(GTK_OVERLAY(file_overlay), self->btn_download);

    /* Dynamic positioning: buttons track the handle as user drags it */
    g_signal_connect(file_overlay, "get-child-position",
                     G_CALLBACK(on_transfer_btn_position), paned_main);
    g_signal_connect(paned_main, "notify::position",
                     G_CALLBACK(on_paned_pos_notify), file_overlay);

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

    /* Vertical paned (log splitter): thin, standard handle */
    /* Horizontal file paned (#file-paned): wide handle (HANDLE_W px) that
       hosts the upload/download overlay buttons without obscuring columns. */
    GtkCssProvider *css = gtk_css_provider_new();
    gtk_css_provider_load_from_data(css,
        /* generic paned: subtle thin separator */
        "paned > separator {"
        "  min-width: 4px; min-height: 4px;"
        "  background: alpha(@theme_fg_color, 0.1);"
        "}"
        "paned > separator:hover {"
        "  background: alpha(@theme_selected_bg_color, 0.35);"
        "}"
        /* file paned: wide handle that hosts the transfer buttons */
        "#file-paned > separator {"
        "  min-width: 44px;"
        "  background: alpha(@theme_fg_color, 0.06);"
        "  border-left:  1px solid alpha(@theme_fg_color, 0.2);"
        "  border-right: 1px solid alpha(@theme_fg_color, 0.2);"
        "}"
        "#file-paned > separator:hover {"
        "  background: alpha(@theme_selected_bg_color, 0.15);"
        "}",
        -1, NULL);
    gtk_style_context_add_provider_for_screen(
        gdk_screen_get_default(),
        GTK_STYLE_PROVIDER(css),
        GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    g_object_unref(css);

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

    /* Guard: dispose must only run once. */
    if (self->disposed) {
        G_OBJECT_CLASS(ftp_main_window_parent_class)->dispose(obj);
        return;
    }
    /* Signal all pending idle callbacks to skip their work. */
    self->disposed = TRUE;

    /* Cancel async sources before anything else. */
    if (self->local_refresh_timeout) {
        g_source_remove(self->local_refresh_timeout);
        self->local_refresh_timeout = 0;
    }
    if (self->local_monitor) {
        g_file_monitor_cancel(self->local_monitor);
        g_clear_object(&self->local_monitor);
    }

    /* Save settings and profiles. */
    if (self->local_path)
        ftp_normalize_local_path(self->local_path,
                                 self->settings.last_local_path, FTP_MAX_PATH);
    ftp_settings_save(&self->settings);
    ftp_profile_save_all(self->profiles);
    g_list_free_full(self->profiles, (GDestroyNotify)ftp_profile_free);
    self->profiles = NULL;

    /* Disconnect backend only — no queue_status/queue_log (UI is going away). */
    if (self->session) {
        ftp_session_disconnect(self->session);
        self->connected = FALSE;
    }

    g_clear_pointer(&self->server_path, g_free);
    g_clear_pointer(&self->local_path, g_free);
    g_clear_object(&self->icon_folder);
    g_clear_object(&self->icon_file);
    g_clear_object(&self->icon_parent);
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
