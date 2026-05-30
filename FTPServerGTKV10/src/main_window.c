#include "main_window.h"
#include "settings.h"
#include "log_manager.h"
#include "gtk_log_dispatch.h"
#include "ftp_server.h"
#include "sftp_server.h"
#include "cert_manager.h"
#include "platform.h"
#include <glib.h>
#include <glib/gstdio.h>
#include <string.h>
#include <stdlib.h>

/* ========================================================================
   Application State
   ======================================================================== */

struct _AppState {
    ServerSettings  cfg;

    FtpServer  ftp_srv;
    FtpServer  ftps_srv;
    SftpServer sftp_srv;
    bool       servers_running;

    GtkWidget *window;
    GtkWidget *btn_start;

    /* Protocol */
    GtkWidget *chk_ftp,  *ent_ftp_port;
    GtkWidget *chk_ftps, *ent_ftps_port;
    GtkWidget *chk_sftp, *ent_sftp_port;

    /* Shared folders */
    GtkListStore *folders_store;
    GtkWidget    *folders_view;

    /* FTPS cert (single-row widgets) */
    GtkWidget *ent_cert_path, *ent_cert_pass;
    GtkWidget *frm_ftps;

    /* SFTP key (single-row widgets) */
    GtkWidget *ent_key_path;
    GtkWidget *frm_sftp;

    /* Auth */
    GtkWidget    *chk_anon;
    GtkListStore *users_store;
    GtkWidget    *users_view;

    /* Performance */
    GtkWidget *ent_bufsize, *ent_threads;

    /* Status */
    GtkWidget *lbl_cur_clients, *lbl_tot_clients;
    GtkWidget *lbl_uploads, *lbl_downloads;

    /* Log */
    GtkTextBuffer *log_buf;
    GtkWidget     *log_view;

    /* Profile */
    GtkComboBoxText *combo_profile;
};

/* ========================================================================
   Helpers
   ======================================================================== */

static char *mask_password(const char *pw) {
    if (!pw || !*pw) return g_strdup("");
    return g_strnfill(strlen(pw), '*');
}

static int entry_int(GtkWidget *e, int def) {
    const char *t = gtk_entry_get_text(GTK_ENTRY(e));
    if (!t || !*t) return def;
    int v = atoi(t);
    return v > 0 ? v : def;
}

/* ========================================================================
   Collect UI → cfg
   ======================================================================== */
static void ui_to_cfg(AppState *app) {
    ServerSettings *c = &app->cfg;

    c->protocols.enable_ftp  = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(app->chk_ftp));
    c->protocols.enable_ftps = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(app->chk_ftps));
    c->protocols.enable_sftp = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(app->chk_sftp));
    c->protocols.ftp_port    = entry_int(app->ent_ftp_port,  21);
    c->protocols.ftps_port   = entry_int(app->ent_ftps_port, 990);
    c->protocols.sftp_port   = entry_int(app->ent_sftp_port, 22);

    c->folder_count = 0;
    GtkTreeIter it;
    if (gtk_tree_model_get_iter_first(GTK_TREE_MODEL(app->folders_store), &it)) {
        do {
            gchar *vn, *pp;
            gtk_tree_model_get(GTK_TREE_MODEL(app->folders_store), &it,
                               0, &vn, 1, &pp, -1);
            if (c->folder_count < MAX_FOLDERS) {
                g_strlcpy(c->folders[c->folder_count].virtual_name, vn, MAX_NAME_LEN);
                g_strlcpy(c->folders[c->folder_count].physical_path, pp, MAX_PATH_LEN);
                c->folder_count++;
            }
            g_free(vn); g_free(pp);
        } while (gtk_tree_model_iter_next(GTK_TREE_MODEL(app->folders_store), &it));
    }

    g_strlcpy(c->cert_path,    gtk_entry_get_text(GTK_ENTRY(app->ent_cert_path)), MAX_PATH_LEN);
    g_strlcpy(c->cert_password,gtk_entry_get_text(GTK_ENTRY(app->ent_cert_pass)), MAX_NAME_LEN);
    g_strlcpy(c->sftp_host_key_path, gtk_entry_get_text(GTK_ENTRY(app->ent_key_path)), MAX_PATH_LEN);

    c->allow_anonymous = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(app->chk_anon));

    c->user_count = 0;
    if (gtk_tree_model_get_iter_first(GTK_TREE_MODEL(app->users_store), &it)) {
        do {
            gchar *uname, *upass, *uperms;
            gtk_tree_model_get(GTK_TREE_MODEL(app->users_store), &it,
                               0, &uname, 1, &upass, 3, &uperms, -1);
            if (c->user_count < MAX_USERS) {
                g_strlcpy(c->users[c->user_count].username, uname, MAX_NAME_LEN);
                g_strlcpy(c->users[c->user_count].password, upass, MAX_NAME_LEN);
                c->users[c->user_count].can_read  = strstr(uperms, "읽기") != NULL;
                c->users[c->user_count].can_write = strstr(uperms, "쓰기") != NULL;
                c->user_count++;
            }
            g_free(uname); g_free(upass); g_free(uperms);
        } while (gtk_tree_model_iter_next(GTK_TREE_MODEL(app->users_store), &it));
    }

    c->buffer_size_kb = entry_int(app->ent_bufsize, 64);
    c->max_threads    = entry_int(app->ent_threads, 10);
}

/* ========================================================================
   Apply cfg → UI
   ======================================================================== */
static void cfg_to_ui(AppState *app) {
    ServerSettings *c = &app->cfg;
    char buf[32];

    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(app->chk_ftp),  c->protocols.enable_ftp);
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(app->chk_ftps), c->protocols.enable_ftps);
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(app->chk_sftp), c->protocols.enable_sftp);

    snprintf(buf, sizeof(buf), "%d", c->protocols.ftp_port);  gtk_entry_set_text(GTK_ENTRY(app->ent_ftp_port),  buf);
    snprintf(buf, sizeof(buf), "%d", c->protocols.ftps_port); gtk_entry_set_text(GTK_ENTRY(app->ent_ftps_port), buf);
    snprintf(buf, sizeof(buf), "%d", c->protocols.sftp_port); gtk_entry_set_text(GTK_ENTRY(app->ent_sftp_port), buf);

    gtk_list_store_clear(app->folders_store);
    for (int i = 0; i < c->folder_count; i++) {
        GtkTreeIter it;
        gtk_list_store_append(app->folders_store, &it);
        gtk_list_store_set(app->folders_store, &it,
                           0, c->folders[i].virtual_name,
                           1, c->folders[i].physical_path, -1);
    }

    gtk_entry_set_text(GTK_ENTRY(app->ent_cert_path), c->cert_path);
    gtk_entry_set_text(GTK_ENTRY(app->ent_cert_pass), c->cert_password);
    gtk_entry_set_text(GTK_ENTRY(app->ent_key_path),  c->sftp_host_key_path);

    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(app->chk_anon), c->allow_anonymous);

    gtk_list_store_clear(app->users_store);
    for (int i = 0; i < c->user_count; i++) {
        UserEntry *u = &c->users[i];
        const char *perms = (u->can_read && u->can_write) ? "읽기+쓰기" :
                             u->can_read  ? "읽기" :
                             u->can_write ? "쓰기" : "없음";
        char *masked = mask_password(u->password);
        GtkTreeIter it;
        gtk_list_store_append(app->users_store, &it);
        gtk_list_store_set(app->users_store, &it,
                           0, u->username, 1, u->password, 2, masked, 3, perms, -1);
        g_free(masked);
    }

    snprintf(buf, sizeof(buf), "%d", c->buffer_size_kb); gtk_entry_set_text(GTK_ENTRY(app->ent_bufsize), buf);
    snprintf(buf, sizeof(buf), "%d", c->max_threads);    gtk_entry_set_text(GTK_ENTRY(app->ent_threads), buf);

}

/* ========================================================================
   Log callback — already on GTK main thread (delivered via gtk_log_dispatch)
   ======================================================================== */
static void on_log_message(const char *msg, void *ud) {
    AppState *app = ud;
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(app->log_buf, &end);
    gtk_text_buffer_insert(app->log_buf, &end, msg, -1);
    gtk_text_buffer_insert(app->log_buf, &end, "\n", 1);

    GtkTextMark *mark = gtk_text_buffer_get_mark(app->log_buf, "insert");
    gtk_text_view_scroll_to_mark(GTK_TEXT_VIEW(app->log_view), mark, 0.0, FALSE, 0.0, 1.0);
}

/* ========================================================================
   Stats update callbacks (worker threads → g_idle_add → GTK main thread)
   ======================================================================== */
typedef struct { AppState *app; int cur; int tot; } CountArgs;
static gboolean idle_update_count(gpointer d) {
    CountArgs *a = d;
    char buf[64];
    snprintf(buf, sizeof(buf), "%d", a->cur);
    gtk_label_set_text(GTK_LABEL(a->app->lbl_cur_clients), buf);
    snprintf(buf, sizeof(buf), "%d", a->tot);
    gtk_label_set_text(GTK_LABEL(a->app->lbl_tot_clients), buf);
    g_free(a);
    return G_SOURCE_REMOVE;
}
static void on_ftp_count(int cur, int tot, void *ud) {
    CountArgs *a = g_new(CountArgs, 1);
    a->app = ud; a->cur = cur; a->tot = tot;
    g_idle_add(idle_update_count, a);
}

typedef struct { AppState *app; char fname[256]; long bytes; bool is_upload; } XferArgs;
static gboolean idle_update_xfer(gpointer d) {
    XferArgs *a = d;
    char buf[128];
    snprintf(buf, sizeof(buf), "%ld bytes", a->bytes);
    if (a->is_upload)
        gtk_label_set_text(GTK_LABEL(a->app->lbl_uploads), buf);
    else
        gtk_label_set_text(GTK_LABEL(a->app->lbl_downloads), buf);
    g_free(a);
    return G_SOURCE_REMOVE;
}
static void on_ftp_upload(const char *fn, long bytes, void *ud) {
    XferArgs *a = g_new(XferArgs, 1);
    a->app = ud; g_strlcpy(a->fname, fn ? fn : "", 256);
    a->bytes = bytes; a->is_upload = true;
    g_idle_add(idle_update_xfer, a);
}
static void on_ftp_download(const char *fn, long bytes, void *ud) {
    XferArgs *a = g_new(XferArgs, 1);
    a->app = ud; g_strlcpy(a->fname, fn ? fn : "", 256);
    a->bytes = bytes; a->is_upload = false;
    g_idle_add(idle_update_xfer, a);
}

/* ========================================================================
   Start / Stop servers
   ======================================================================== */
static bool start_servers(AppState *app) {
    ServerSettings *c = &app->cfg;

    if (c->folder_count == 0) {
        GtkWidget *dlg = gtk_message_dialog_new(GTK_WINDOW(app->window),
            GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
            "공유 폴더를 하나 이상 추가해 주세요.");
        gtk_dialog_run(GTK_DIALOG(dlg)); gtk_widget_destroy(dlg);
        return false;
    }
    if (!c->protocols.enable_ftp && !c->protocols.enable_ftps && !c->protocols.enable_sftp) {
        GtkWidget *dlg = gtk_message_dialog_new(GTK_WINDOW(app->window),
            GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
            "하나 이상의 프로토콜을 활성화해 주세요.");
        gtk_dialog_run(GTK_DIALOG(dlg)); gtk_widget_destroy(dlg);
        return false;
    }

    if (c->protocols.enable_ftp) {
        ftp_server_init(&app->ftp_srv, c, false);
        app->ftp_srv.count_cb = on_ftp_count;   app->ftp_srv.count_ud = app;
        app->ftp_srv.up_cb    = on_ftp_upload;   app->ftp_srv.up_ud   = app;
        app->ftp_srv.dn_cb    = on_ftp_download; app->ftp_srv.dn_ud   = app;
        if (!ftp_server_start(&app->ftp_srv, c->protocols.ftp_port)) {
            GtkWidget *dlg = gtk_message_dialog_new(GTK_WINDOW(app->window),
                GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
                "FTP 서버 시작 실패 (포트 %d).", c->protocols.ftp_port);
            gtk_dialog_run(GTK_DIALOG(dlg)); gtk_widget_destroy(dlg);
            return false;
        }
    }

    if (c->protocols.enable_ftps) {
        if (!c->cert_path[0]) {
            GtkWidget *dlg = gtk_message_dialog_new(GTK_WINDOW(app->window),
                GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
                "FTPS 인증서 경로를 설정해 주세요.");
            gtk_dialog_run(GTK_DIALOG(dlg)); gtk_widget_destroy(dlg);
            if (c->protocols.enable_ftp) ftp_server_stop(&app->ftp_srv);
            return false;
        }
        ftp_server_init(&app->ftps_srv, c, true);
        if (!ftp_server_load_cert(&app->ftps_srv, c->cert_path, c->cert_password)) {
            GtkWidget *dlg = gtk_message_dialog_new(GTK_WINDOW(app->window),
                GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
                "FTPS 인증서 로드 실패.");
            gtk_dialog_run(GTK_DIALOG(dlg)); gtk_widget_destroy(dlg);
            if (c->protocols.enable_ftp) ftp_server_stop(&app->ftp_srv);
            return false;
        }
        app->ftps_srv.count_cb = on_ftp_count;   app->ftps_srv.count_ud = app;
        app->ftps_srv.up_cb    = on_ftp_upload;   app->ftps_srv.up_ud   = app;
        app->ftps_srv.dn_cb    = on_ftp_download; app->ftps_srv.dn_ud   = app;
        if (!ftp_server_start(&app->ftps_srv, c->protocols.ftps_port)) {
            GtkWidget *dlg = gtk_message_dialog_new(GTK_WINDOW(app->window),
                GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
                "FTPS 서버 시작 실패 (포트 %d).", c->protocols.ftps_port);
            gtk_dialog_run(GTK_DIALOG(dlg)); gtk_widget_destroy(dlg);
            if (c->protocols.enable_ftp) ftp_server_stop(&app->ftp_srv);
            return false;
        }
    }

    if (c->protocols.enable_sftp) {
        sftp_srv_init(&app->sftp_srv, c);
        app->sftp_srv.count_cb = (SftpCountCb)on_ftp_count;
        app->sftp_srv.count_ud = app;
        if (!sftp_srv_start(&app->sftp_srv, c->protocols.sftp_port)) {
            GtkWidget *dlg = gtk_message_dialog_new(GTK_WINDOW(app->window),
                GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
                "SFTP 서버 시작 실패 (포트 %d).", c->protocols.sftp_port);
            gtk_dialog_run(GTK_DIALOG(dlg)); gtk_widget_destroy(dlg);
            if (c->protocols.enable_ftp)  ftp_server_stop(&app->ftp_srv);
            if (c->protocols.enable_ftps) ftp_server_stop(&app->ftps_srv);
            return false;
        }
        if (c->sftp_host_key_path[0])
            gtk_entry_set_text(GTK_ENTRY(app->ent_key_path), c->sftp_host_key_path);
    }

    return true;
}

static void stop_servers(AppState *app) {
    if (app->cfg.protocols.enable_ftp)  ftp_server_stop(&app->ftp_srv);
    if (app->cfg.protocols.enable_ftps) ftp_server_stop(&app->ftps_srv);
    if (app->cfg.protocols.enable_sftp) sftp_srv_stop(&app->sftp_srv);
}

/* ========================================================================
   Signal handlers
   ======================================================================== */

static void on_start_stop_clicked(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    if (!app->servers_running) {
        ui_to_cfg(app);
        if (start_servers(app)) {
            app->servers_running = true;
            GtkStyleContext *ctx = gtk_widget_get_style_context(btn);
            gtk_style_context_remove_class(ctx, "btn-start");
            gtk_style_context_add_class(ctx, "btn-stop");
            gtk_button_set_label(GTK_BUTTON(btn), "■  중지");
        }
    } else {
        stop_servers(app);
        app->servers_running = false;
        GtkStyleContext *ctx = gtk_widget_get_style_context(btn);
        gtk_style_context_remove_class(ctx, "btn-stop");
        gtk_style_context_add_class(ctx, "btn-start");
        gtk_button_set_label(GTK_BUTTON(btn), "▶  시작");
    }
}

/* ---- Browse helpers --------------------------------------------------- */

static void browse_for_directory(GtkWidget *btn, gpointer ud) {
    GtkWidget *entry  = GTK_WIDGET(ud);
    GtkWidget *parent = gtk_widget_get_toplevel(btn);
    GtkWidget *fc = gtk_file_chooser_dialog_new("폴더 선택",
        GTK_IS_WINDOW(parent) ? GTK_WINDOW(parent) : NULL,
        GTK_FILE_CHOOSER_ACTION_SELECT_FOLDER,
        "_취소", GTK_RESPONSE_CANCEL, "_선택", GTK_RESPONSE_ACCEPT, NULL);
    if (gtk_dialog_run(GTK_DIALOG(fc)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(fc));
        gtk_entry_set_text(GTK_ENTRY(entry), path);
        g_free(path);
    }
    gtk_widget_destroy(fc);
}

static void browse_for_save_pfx(GtkWidget *btn, gpointer ud) {
    GtkWidget *entry  = GTK_WIDGET(ud);
    GtkWidget *parent = gtk_widget_get_toplevel(btn);
    GtkWidget *fc = gtk_file_chooser_dialog_new("저장 위치",
        GTK_IS_WINDOW(parent) ? GTK_WINDOW(parent) : NULL,
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL, "_저장", GTK_RESPONSE_ACCEPT, NULL);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(fc), "server.pfx");
    if (gtk_dialog_run(GTK_DIALOG(fc)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(fc));
        gtk_entry_set_text(GTK_ENTRY(entry), path);
        g_free(path);
    }
    gtk_widget_destroy(fc);
}

/* ---- Folder management ----------------------------------------------- */

static void on_add_folder(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    GtkWidget *dlg = gtk_dialog_new_with_buttons("공유 폴더 추가",
        GTK_WINDOW(app->window),
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        "_취소", GTK_RESPONSE_CANCEL, "_추가", GTK_RESPONSE_OK, NULL);
    gtk_dialog_set_default_response(GTK_DIALOG(dlg), GTK_RESPONSE_OK);

    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(dlg));
    gtk_container_set_border_width(GTK_CONTAINER(content), 12);
    GtkWidget *grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 6);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 8);
    gtk_container_add(GTK_CONTAINER(content), grid);

    GtkWidget *lbl1 = gtk_label_new("가상 이름:");
    gtk_widget_set_halign(lbl1, GTK_ALIGN_END);
    GtkWidget *ent_vn = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(ent_vn), "예: data");

    GtkWidget *lbl2 = gtk_label_new("실제 경로:");
    gtk_widget_set_halign(lbl2, GTK_ALIGN_END);
    GtkWidget *ent_pp     = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(ent_pp), "/home/user/shared");
    GtkWidget *btn_browse = gtk_button_new_with_label("…");

    gtk_grid_attach(GTK_GRID(grid), lbl1,       0, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), ent_vn,     1, 0, 2, 1);
    gtk_grid_attach(GTK_GRID(grid), lbl2,       0, 1, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), ent_pp,     1, 1, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), btn_browse, 2, 1, 1, 1);
    gtk_widget_set_hexpand(ent_vn, TRUE);
    gtk_widget_set_hexpand(ent_pp, TRUE);

    g_signal_connect(btn_browse, "clicked", G_CALLBACK(browse_for_directory), ent_pp);

    gtk_widget_show_all(dlg);
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_OK) {
        const char *vn = gtk_entry_get_text(GTK_ENTRY(ent_vn));
        const char *pp = gtk_entry_get_text(GTK_ENTRY(ent_pp));
        if (*vn && *pp) {
            GtkTreeIter it;
            gtk_list_store_append(app->folders_store, &it);
            gtk_list_store_set(app->folders_store, &it, 0, vn, 1, pp, -1);
        }
    }
    gtk_widget_destroy(dlg);
}

static void on_remove_folder(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(app->folders_view));
    GtkTreeIter it; GtkTreeModel *model;
    if (gtk_tree_selection_get_selected(sel, &model, &it))
        gtk_list_store_remove(app->folders_store, &it);
}

/* ---- Cert browse ------------------------------------------------------- */

static void on_browse_cert(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    GtkWidget *fc = gtk_file_chooser_dialog_new("인증서 파일 선택",
        GTK_WINDOW(app->window), GTK_FILE_CHOOSER_ACTION_OPEN,
        "_취소", GTK_RESPONSE_CANCEL, "_열기", GTK_RESPONSE_ACCEPT, NULL);
    GtkFileFilter *ff = gtk_file_filter_new();
    gtk_file_filter_add_pattern(ff, "*.pfx");
    gtk_file_filter_add_pattern(ff, "*.p12");
    gtk_file_filter_set_name(ff, "PKCS#12 인증서");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(fc), ff);
    if (gtk_dialog_run(GTK_DIALOG(fc)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(fc));
        gtk_entry_set_text(GTK_ENTRY(app->ent_cert_path), path);
        g_free(path);
    }
    gtk_widget_destroy(fc);
}

/* ---- Generate cert ----------------------------------------------------- */

static void on_generate_cert(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    GtkWidget *dlg = gtk_dialog_new_with_buttons("인증서 생성",
        GTK_WINDOW(app->window),
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        "_취소", GTK_RESPONSE_CANCEL, "_생성", GTK_RESPONSE_OK, NULL);
    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(dlg));
    gtk_container_set_border_width(GTK_CONTAINER(content), 12);
    GtkWidget *grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 6);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 8);
    gtk_container_add(GTK_CONTAINER(content), grid);

    GtkWidget *lbl_cn  = gtk_label_new("Common Name:");
    GtkWidget *ent_cn  = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(ent_cn), "myserver.local");
    GtkWidget *lbl_yr  = gtk_label_new("유효 기간 (년):");
    GtkWidget *ent_yr  = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(ent_yr), "10");
    GtkWidget *lbl_pw  = gtk_label_new("비밀번호:");
    GtkWidget *ent_pw  = gtk_entry_new();
    gtk_entry_set_visibility(GTK_ENTRY(ent_pw), FALSE);
    GtkWidget *lbl_out = gtk_label_new("저장 경로:");
    GtkWidget *ent_out = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(ent_out), "/path/to/cert.pfx");
    GtkWidget *btn_save = gtk_button_new_with_label("…");

    gtk_widget_set_halign(lbl_cn, GTK_ALIGN_END);
    gtk_widget_set_halign(lbl_yr, GTK_ALIGN_END);
    gtk_widget_set_halign(lbl_pw, GTK_ALIGN_END);
    gtk_widget_set_halign(lbl_out, GTK_ALIGN_END);
    gtk_widget_set_hexpand(ent_cn, TRUE);
    gtk_widget_set_hexpand(ent_yr, TRUE);
    gtk_widget_set_hexpand(ent_pw, TRUE);
    gtk_widget_set_hexpand(ent_out, TRUE);

    gtk_grid_attach(GTK_GRID(grid), lbl_cn,  0, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), ent_cn,  1, 0, 2, 1);
    gtk_grid_attach(GTK_GRID(grid), lbl_yr,  0, 1, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), ent_yr,  1, 1, 2, 1);
    gtk_grid_attach(GTK_GRID(grid), lbl_pw,  0, 2, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), ent_pw,  1, 2, 2, 1);
    gtk_grid_attach(GTK_GRID(grid), lbl_out, 0, 3, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), ent_out, 1, 3, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), btn_save,2, 3, 1, 1);

    g_signal_connect(btn_save, "clicked", G_CALLBACK(browse_for_save_pfx), ent_out);

    gtk_widget_show_all(dlg);
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_OK) {
        const char *cn  = gtk_entry_get_text(GTK_ENTRY(ent_cn));
        int          yr = entry_int(ent_yr, 10);
        const char *pw  = gtk_entry_get_text(GTK_ENTRY(ent_pw));
        const char *out = gtk_entry_get_text(GTK_ENTRY(ent_out));
        if (*cn && *out) {
            if (cert_generate_self_signed(out, pw, cn, yr)) {
                gtk_entry_set_text(GTK_ENTRY(app->ent_cert_path), out);
                gtk_entry_set_text(GTK_ENTRY(app->ent_cert_pass), pw);
                GtkWidget *ok = gtk_message_dialog_new(GTK_WINDOW(app->window),
                    GTK_DIALOG_MODAL, GTK_MESSAGE_INFO, GTK_BUTTONS_OK,
                    "인증서가 생성되었습니다.");
                gtk_dialog_run(GTK_DIALOG(ok)); gtk_widget_destroy(ok);
            } else {
                GtkWidget *err = gtk_message_dialog_new(GTK_WINDOW(app->window),
                    GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
                    "인증서 생성 실패.");
                gtk_dialog_run(GTK_DIALOG(err)); gtk_widget_destroy(err);
            }
        }
    }
    gtk_widget_destroy(dlg);
}

/* ---- SFTP key management ---------------------------------------------- */

static void on_generate_sftp_key(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    char *path = sftp_get_default_key_path();
    if (sftp_generate_host_key(path)) {
        g_strlcpy(app->cfg.sftp_host_key_path, path, MAX_PATH_LEN);
        gtk_entry_set_text(GTK_ENTRY(app->ent_key_path), path);
        char *fp = sftp_get_fingerprint(path);
        free(fp);
        log_manager_log("SFTP 호스트 키 생성: %s", path);
    }
    free(path);
}

static void on_open_key_folder(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    const char *kp = gtk_entry_get_text(GTK_ENTRY(app->ent_key_path));
    char *dir;
    if (*kp) {
        dir = path_dirname_str(kp);
    } else {
        char *cfgdir = get_config_dir();
        dir = path_join(cfgdir, "FTPServerGTK");
        free(cfgdir);
    }
    char *cmd = g_strdup_printf("xdg-open \"%s\"", dir);
    g_spawn_command_line_async(cmd, NULL);
    g_free(cmd);
    free(dir);
}

/* ---- User management -------------------------------------------------- */

static void show_user_dialog(AppState *app,
                              const char *init_user, const char *init_pass,
                              bool init_read, bool init_write,
                              bool is_edit, GtkTreeIter *edit_iter) {
    GtkWidget *dlg = gtk_dialog_new_with_buttons(is_edit ? "사용자 편집" : "사용자 추가",
        GTK_WINDOW(app->window),
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        "_취소", GTK_RESPONSE_CANCEL,
        is_edit ? "_저장" : "_추가", GTK_RESPONSE_OK, NULL);
    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(dlg));
    gtk_container_set_border_width(GTK_CONTAINER(content), 12);
    GtkWidget *grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 6);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 8);
    gtk_container_add(GTK_CONTAINER(content), grid);

    GtkWidget *lbl_u = gtk_label_new("사용자 이름:");
    gtk_widget_set_halign(lbl_u, GTK_ALIGN_END);
    GtkWidget *ent_u = gtk_entry_new();
    if (init_user) gtk_entry_set_text(GTK_ENTRY(ent_u), init_user);

    GtkWidget *lbl_p = gtk_label_new("비밀번호:");
    gtk_widget_set_halign(lbl_p, GTK_ALIGN_END);
    GtkWidget *ent_p = gtk_entry_new();
    gtk_entry_set_visibility(GTK_ENTRY(ent_p), FALSE);
    if (init_pass) gtk_entry_set_text(GTK_ENTRY(ent_p), init_pass);

    GtkWidget *chk_r = gtk_check_button_new_with_label("읽기");
    GtkWidget *chk_w = gtk_check_button_new_with_label("쓰기");
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(chk_r), init_read);
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(chk_w), init_write);
    GtkWidget *perm_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_box_pack_start(GTK_BOX(perm_box), chk_r, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(perm_box), chk_w, FALSE, FALSE, 0);

    gtk_widget_set_hexpand(ent_u, TRUE);
    gtk_widget_set_hexpand(ent_p, TRUE);

    gtk_grid_attach(GTK_GRID(grid), lbl_u,    0, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), ent_u,    1, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), lbl_p,    0, 1, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), ent_p,    1, 1, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), gtk_label_new("권한:"), 0, 2, 1, 1);
    gtk_grid_attach(GTK_GRID(grid), perm_box, 1, 2, 1, 1);

    gtk_widget_show_all(dlg);
    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_OK) {
        const char *uname = gtk_entry_get_text(GTK_ENTRY(ent_u));
        const char *upass = gtk_entry_get_text(GTK_ENTRY(ent_p));
        bool cr = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(chk_r));
        bool cw = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(chk_w));
        const char *perms = (cr && cw) ? "읽기+쓰기" :
                             cr ? "읽기" : cw ? "쓰기" : "없음";
        if (*uname) {
            char *masked = mask_password(upass);
            if (is_edit && edit_iter) {
                gtk_list_store_set(app->users_store, edit_iter,
                                   0, uname, 1, upass, 2, masked, 3, perms, -1);
            } else {
                GtkTreeIter it;
                gtk_list_store_append(app->users_store, &it);
                gtk_list_store_set(app->users_store, &it,
                                   0, uname, 1, upass, 2, masked, 3, perms, -1);
            }
            g_free(masked);
        }
    }
    gtk_widget_destroy(dlg);
}

static void on_add_user(GtkWidget *btn, gpointer ud) {
    show_user_dialog(ud, NULL, NULL, true, false, false, NULL);
}

static void on_remove_user(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(app->users_view));
    GtkTreeIter it; GtkTreeModel *model;
    if (gtk_tree_selection_get_selected(sel, &model, &it))
        gtk_list_store_remove(app->users_store, &it);
}

static void on_user_row_activated(GtkTreeView *tv, GtkTreePath *path,
                                   GtkTreeViewColumn *col, gpointer ud) {
    AppState *app = ud;
    GtkTreeIter it;
    if (!gtk_tree_model_get_iter(GTK_TREE_MODEL(app->users_store), &it, path)) return;
    gchar *uname, *upass, *uperms;
    gtk_tree_model_get(GTK_TREE_MODEL(app->users_store), &it,
                       0, &uname, 1, &upass, 3, &uperms, -1);
    bool cr = strstr(uperms, "읽기") != NULL;
    bool cw = strstr(uperms, "쓰기") != NULL;
    show_user_dialog(app, uname, upass, cr, cw, true, &it);
    g_free(uname); g_free(upass); g_free(uperms);
}

/* ---- Profile management ----------------------------------------------- */

static void on_save_profile(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    const char *name = gtk_combo_box_text_get_active_text(app->combo_profile);
    if (!name || !*name) {
        GtkWidget *dlg = gtk_message_dialog_new(GTK_WINDOW(app->window),
            GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
            "프로파일 이름을 입력해 주세요.");
        gtk_dialog_run(GTK_DIALOG(dlg)); gtk_widget_destroy(dlg);
        return;
    }
    ui_to_cfg(app);
    if (settings_save_profile(&app->cfg, name)) {
        int count = 0;
        char **profiles = settings_list_profiles(&count);
        gtk_combo_box_text_remove_all(app->combo_profile);
        for (int i = 0; i < count; i++)
            gtk_combo_box_text_append_text(app->combo_profile, profiles[i]);
        settings_free_profiles(profiles, count);
        gtk_combo_box_text_prepend_text(app->combo_profile, name);
        gtk_combo_box_set_active(GTK_COMBO_BOX(app->combo_profile), 0);
    }
}

static void on_delete_profile(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    const char *name = gtk_combo_box_text_get_active_text(app->combo_profile);
    if (name && *name) {
        settings_delete_profile(name);
        gtk_combo_box_text_remove(app->combo_profile,
            gtk_combo_box_get_active(GTK_COMBO_BOX(app->combo_profile)));
    }
}

static void on_profile_changed(GtkComboBoxText *cb, gpointer ud) {
    AppState *app = ud;
    const char *name = gtk_combo_box_text_get_active_text(cb);
    if (!name || !*name) return;
    if (settings_load_profile(&app->cfg, name))
        cfg_to_ui(app);
}

/* ---- Log helpers ------------------------------------------------------- */

static void on_copy_log(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    GtkClipboard *clip = gtk_clipboard_get(GDK_SELECTION_CLIPBOARD);
    GtkTextIter start, end;
    gtk_text_buffer_get_bounds(app->log_buf, &start, &end);
    char *text = gtk_text_buffer_get_text(app->log_buf, &start, &end, FALSE);
    gtk_clipboard_set_text(clip, text, -1);
    g_free(text);
}

static void on_save_log(GtkWidget *btn, gpointer ud) {
    AppState *app = ud;
    GtkWidget *fc = gtk_file_chooser_dialog_new("로그 저장",
        GTK_WINDOW(app->window), GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL, "_저장", GTK_RESPONSE_ACCEPT, NULL);
    char *name = g_strdup_printf("ftpserver_log_%ld.txt", (long)time(NULL));
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(fc), name);
    g_free(name);
    if (gtk_dialog_run(GTK_DIALOG(fc)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(fc));
        GtkTextIter s, e;
        gtk_text_buffer_get_bounds(app->log_buf, &s, &e);
        char *text = gtk_text_buffer_get_text(app->log_buf, &s, &e, FALSE);
        g_file_set_contents(path, text, -1, NULL);
        g_free(text); g_free(path);
    }
    gtk_widget_destroy(fc);
}

/* ---- Window close handler ---------------------------------------------- */

static gboolean on_window_delete(GtkWidget *win, GdkEvent *event, gpointer ud) {
    AppState *app = ud;
    ui_to_cfg(app);
    char *path = settings_get_default_path();
    settings_save(&app->cfg, path);
    free(path);
    gtk_main_quit();
    return TRUE;
}

/* ---- Protocol checkbox toggles ---------------------------------------- */

static void on_ftps_toggled(GtkToggleButton *btn, gpointer ud) {
    AppState *app = ud;
    gtk_widget_set_sensitive(app->frm_ftps, gtk_toggle_button_get_active(btn));
}

static void on_sftp_toggled(GtkToggleButton *btn, gpointer ud) {
    AppState *app = ud;
    gtk_widget_set_sensitive(app->frm_sftp, gtk_toggle_button_get_active(btn));
}

/* ========================================================================
   Build UI
   ======================================================================== */

GtkWidget *build_main_window(AppState *app) {
    GtkWidget *win = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    app->window = win;
    gtk_window_set_title(GTK_WINDOW(win), "FTP Server Manager");
    gtk_window_set_default_size(GTK_WINDOW(win), 960, 780);
    gtk_window_set_position(GTK_WINDOW(win), GTK_WIN_POS_CENTER);
    g_signal_connect(win, "delete-event", G_CALLBACK(on_window_delete), app);

    GtkCssProvider *css = gtk_css_provider_new();
    gtk_css_provider_load_from_data(css,
        ".btn-start { background: #2e7d32; color: white; font-weight: bold; }\n"
        ".btn-stop  { background: #c62828; color: white; font-weight: bold; }\n"
        ".btn-start:hover { background: #388e3c; }\n"
        ".btn-stop:hover  { background: #d32f2f; }\n"
        "#log-view { background-color: #191919; color: #b4dcb4; "
        "            font-family: Monospace; font-size: 9pt; }\n",
        -1, NULL);
    gtk_style_context_add_provider_for_screen(gdk_screen_get_default(),
        GTK_STYLE_PROVIDER(css), GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    g_object_unref(css);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(win), vbox);

    /* ---- Header --------------------------------------------------------- */
    GtkWidget *hdr = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_container_set_border_width(GTK_CONTAINER(hdr), 8);
    GtkWidget *title = gtk_label_new(NULL);
    gtk_label_set_markup(GTK_LABEL(title),
        "<span size='large' weight='bold'>FTP Server Manager</span>");
    gtk_box_pack_start(GTK_BOX(hdr), title, TRUE, TRUE, 0);
    GtkWidget *btn_start = gtk_button_new_with_label("▶  시작");
    gtk_widget_set_name(btn_start, "btn-start-stop");
    GtkStyleContext *sctx = gtk_widget_get_style_context(btn_start);
    gtk_style_context_add_class(sctx, "btn-start");
    gtk_widget_set_size_request(btn_start, 120, 36);
    g_signal_connect(btn_start, "clicked", G_CALLBACK(on_start_stop_clicked), app);
    gtk_box_pack_end(GTK_BOX(hdr), btn_start, FALSE, FALSE, 0);
    app->btn_start = btn_start;
    gtk_box_pack_start(GTK_BOX(vbox), hdr, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), gtk_separator_new(GTK_ORIENTATION_HORIZONTAL), FALSE, FALSE, 0);

    /* ---- Profile row ---------------------------------------------------- */
    GtkWidget *prof_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_container_set_border_width(GTK_CONTAINER(prof_row), 6);
    gtk_box_pack_start(GTK_BOX(prof_row), gtk_label_new("프로파일:"), FALSE, FALSE, 0);
    GtkComboBoxText *combo = GTK_COMBO_BOX_TEXT(gtk_combo_box_text_new_with_entry());
    app->combo_profile = combo;
    gtk_widget_set_size_request(GTK_WIDGET(combo), 200, -1);
    int pcount = 0;
    char **profiles = settings_list_profiles(&pcount);
    for (int i = 0; i < pcount; i++) gtk_combo_box_text_append_text(combo, profiles[i]);
    settings_free_profiles(profiles, pcount);
    gtk_box_pack_start(GTK_BOX(prof_row), GTK_WIDGET(combo), FALSE, FALSE, 0);
    GtkWidget *btn_save_prof = gtk_button_new_with_label("저장");
    GtkWidget *btn_del_prof  = gtk_button_new_with_label("삭제");
    g_signal_connect(btn_save_prof, "clicked", G_CALLBACK(on_save_profile), app);
    g_signal_connect(btn_del_prof,  "clicked", G_CALLBACK(on_delete_profile), app);
    gtk_box_pack_start(GTK_BOX(prof_row), btn_save_prof, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(prof_row), btn_del_prof,  FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), prof_row, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), gtk_separator_new(GTK_ORIENTATION_HORIZONTAL), FALSE, FALSE, 0);

    /* ---- Protocol settings --------------------------------------------- */
    GtkWidget *frm_proto = gtk_frame_new("프로토콜 설정");
    gtk_container_set_border_width(GTK_CONTAINER(frm_proto), 6);
    GtkWidget *proto_grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(proto_grid), 4);
    gtk_grid_set_column_spacing(GTK_GRID(proto_grid), 8);
    gtk_container_set_border_width(GTK_CONTAINER(proto_grid), 6);
    gtk_container_add(GTK_CONTAINER(frm_proto), proto_grid);

    GtkWidget *chk_ftp  = gtk_check_button_new_with_label("FTP (포트:");
    GtkWidget *ent_ftp  = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(ent_ftp), "21");
    gtk_widget_set_size_request(ent_ftp, 60, -1);

    GtkWidget *chk_ftps = gtk_check_button_new_with_label("FTPS (포트:");
    GtkWidget *ent_ftps = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(ent_ftps), "990");
    gtk_widget_set_size_request(ent_ftps, 60, -1);

    GtkWidget *chk_sftp = gtk_check_button_new_with_label("SFTP (포트:");
    GtkWidget *ent_sftp = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(ent_sftp), "22");
    gtk_widget_set_size_request(ent_sftp, 60, -1);

    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(chk_ftp), TRUE);

    gtk_grid_attach(GTK_GRID(proto_grid), chk_ftp,  0, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(proto_grid), ent_ftp,  1, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(proto_grid), gtk_label_new(")"), 2, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(proto_grid), chk_ftps, 3, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(proto_grid), ent_ftps, 4, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(proto_grid), gtk_label_new(")"), 5, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(proto_grid), chk_sftp, 6, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(proto_grid), ent_sftp, 7, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(proto_grid), gtk_label_new(")"), 8, 0, 1, 1);

    app->chk_ftp = chk_ftp;  app->ent_ftp_port  = ent_ftp;
    app->chk_ftps = chk_ftps; app->ent_ftps_port = ent_ftps;
    app->chk_sftp = chk_sftp; app->ent_sftp_port = ent_sftp;

    gtk_box_pack_start(GTK_BOX(vbox), frm_proto, FALSE, FALSE, 0);

    /* ====================================================================
       Main content: [공유 폴더] | [인증] — same height, equal width
       ==================================================================== */
    GtkWidget *main_hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_container_set_border_width(GTK_CONTAINER(main_hbox), 4);
    gtk_box_pack_start(GTK_BOX(vbox), main_hbox, TRUE, TRUE, 0);

    /* ---- 공유 폴더 (left, expand) --------------------------------------- */
    GtkWidget *frm_folders = gtk_frame_new("공유 폴더");
    gtk_container_set_border_width(GTK_CONTAINER(frm_folders), 4);
    GtkWidget *fv = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_container_set_border_width(GTK_CONTAINER(fv), 4);
    gtk_container_add(GTK_CONTAINER(frm_folders), fv);

    app->folders_store = gtk_list_store_new(2, G_TYPE_STRING, G_TYPE_STRING);
    GtkWidget *folders_tv = gtk_tree_view_new_with_model(GTK_TREE_MODEL(app->folders_store));
    app->folders_view = folders_tv;
    GtkCellRenderer *cr_txt = gtk_cell_renderer_text_new();
    gtk_tree_view_append_column(GTK_TREE_VIEW(folders_tv),
        gtk_tree_view_column_new_with_attributes("가상 이름", cr_txt, "text", 0, NULL));
    cr_txt = gtk_cell_renderer_text_new();
    gtk_tree_view_append_column(GTK_TREE_VIEW(folders_tv),
        gtk_tree_view_column_new_with_attributes("실제 경로", cr_txt, "text", 1, NULL));
    GtkWidget *folders_sw = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(folders_sw),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_size_request(folders_sw, -1, 100);
    gtk_container_add(GTK_CONTAINER(folders_sw), folders_tv);
    gtk_box_pack_start(GTK_BOX(fv), folders_sw, TRUE, TRUE, 0);

    GtkWidget *fv_btns     = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    GtkWidget *btn_add_fol = gtk_button_new_with_label("+ 추가");
    GtkWidget *btn_rem_fol = gtk_button_new_with_label("- 제거");
    g_signal_connect(btn_add_fol, "clicked", G_CALLBACK(on_add_folder),    app);
    g_signal_connect(btn_rem_fol, "clicked", G_CALLBACK(on_remove_folder), app);
    gtk_box_pack_start(GTK_BOX(fv_btns), btn_add_fol, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(fv_btns), btn_rem_fol, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(fv), fv_btns, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(main_hbox), frm_folders, TRUE, TRUE, 0);

    /* ---- 인증 (right, expand, same height) ------------------------------ */
    GtkWidget *frm_auth = gtk_frame_new("인증");
    gtk_container_set_border_width(GTK_CONTAINER(frm_auth), 4);
    GtkWidget *auth_vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_container_set_border_width(GTK_CONTAINER(auth_vbox), 6);
    gtk_container_add(GTK_CONTAINER(frm_auth), auth_vbox);

    GtkWidget *chk_anon = gtk_check_button_new_with_label("익명 접근 허용 (읽기 전용)");
    gtk_box_pack_start(GTK_BOX(auth_vbox), chk_anon, FALSE, FALSE, 0);
    app->chk_anon = chk_anon;

    /* cols: 0=username 1=real_password(hidden) 2=masked_display 3=permissions */
    app->users_store = gtk_list_store_new(4, G_TYPE_STRING, G_TYPE_STRING,
                                             G_TYPE_STRING, G_TYPE_STRING);
    GtkWidget *users_tv = gtk_tree_view_new_with_model(GTK_TREE_MODEL(app->users_store));
    app->users_view = users_tv;
    g_signal_connect(users_tv, "row-activated", G_CALLBACK(on_user_row_activated), app);
    GtkCellRenderer *ur = gtk_cell_renderer_text_new();
    gtk_tree_view_append_column(GTK_TREE_VIEW(users_tv),
        gtk_tree_view_column_new_with_attributes("사용자 이름", ur, "text", 0, NULL));
    ur = gtk_cell_renderer_text_new();
    gtk_tree_view_append_column(GTK_TREE_VIEW(users_tv),
        gtk_tree_view_column_new_with_attributes("비밀번호", ur, "text", 2, NULL));
    ur = gtk_cell_renderer_text_new();
    gtk_tree_view_append_column(GTK_TREE_VIEW(users_tv),
        gtk_tree_view_column_new_with_attributes("권한", ur, "text", 3, NULL));
    GtkWidget *users_sw = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(users_sw),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_size_request(users_sw, -1, 100);
    gtk_container_add(GTK_CONTAINER(users_sw), users_tv);
    gtk_box_pack_start(GTK_BOX(auth_vbox), users_sw, TRUE, TRUE, 0);

    GtkWidget *user_btns     = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    GtkWidget *btn_add_user  = gtk_button_new_with_label("+ 추가");
    GtkWidget *btn_rem_user  = gtk_button_new_with_label("- 제거");
    g_signal_connect(btn_add_user, "clicked", G_CALLBACK(on_add_user),    app);
    g_signal_connect(btn_rem_user, "clicked", G_CALLBACK(on_remove_user), app);
    gtk_box_pack_start(GTK_BOX(user_btns), btn_add_user, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(user_btns), btn_rem_user, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(auth_vbox), user_btns, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(main_hbox), frm_auth, TRUE, TRUE, 0);

    /* ====================================================================
       Cert/key row: [FTPS 인증서 (한 행)] | [SFTP 호스트 키 (한 행)]
       ==================================================================== */
    GtkWidget *cert_hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_container_set_border_width(GTK_CONTAINER(cert_hbox), 4);
    gtk_box_pack_start(GTK_BOX(vbox), cert_hbox, FALSE, FALSE, 0);

    /* ---- FTPS 인증서 (single row) --------------------------------------- */
    GtkWidget *frm_ftps_cert = gtk_frame_new("FTPS 인증서");
    gtk_container_set_border_width(GTK_CONTAINER(frm_ftps_cert), 4);
    app->frm_ftps = frm_ftps_cert;
    GtkWidget *cert_grid = gtk_grid_new();
    gtk_grid_set_column_spacing(GTK_GRID(cert_grid), 4);
    gtk_container_set_border_width(GTK_CONTAINER(cert_grid), 6);
    gtk_container_add(GTK_CONTAINER(frm_ftps_cert), cert_grid);

    GtkWidget *lbl_cert    = gtk_label_new("인증서:");
    gtk_widget_set_halign(lbl_cert, GTK_ALIGN_END);
    GtkWidget *ent_cert    = gtk_entry_new();
    gtk_widget_set_hexpand(ent_cert, TRUE);
    GtkWidget *btn_br_cert = gtk_button_new_with_label("…");
    GtkWidget *btn_gen_cert= gtk_button_new_with_label("생성");
    GtkWidget *lbl_certpw  = gtk_label_new("비밀번호:");
    gtk_widget_set_halign(lbl_certpw, GTK_ALIGN_END);
    GtkWidget *ent_certpw  = gtk_entry_new();
    gtk_entry_set_visibility(GTK_ENTRY(ent_certpw), FALSE);
    gtk_widget_set_hexpand(ent_certpw, TRUE);
    gtk_widget_set_size_request(ent_certpw, 90, -1);

    /* All on row 0 */
    gtk_grid_attach(GTK_GRID(cert_grid), lbl_cert,    0, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(cert_grid), ent_cert,    1, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(cert_grid), btn_br_cert, 2, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(cert_grid), btn_gen_cert,3, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(cert_grid), lbl_certpw,  4, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(cert_grid), ent_certpw,  5, 0, 1, 1);

    app->ent_cert_path = ent_cert;
    app->ent_cert_pass = ent_certpw;
    g_signal_connect(btn_br_cert,  "clicked", G_CALLBACK(on_browse_cert),   app);
    g_signal_connect(btn_gen_cert, "clicked", G_CALLBACK(on_generate_cert), app);
    gtk_widget_set_sensitive(frm_ftps_cert, FALSE);
    g_signal_connect(chk_ftps, "toggled", G_CALLBACK(on_ftps_toggled), app);
    gtk_box_pack_start(GTK_BOX(cert_hbox), frm_ftps_cert, TRUE, TRUE, 0);

    /* ---- SFTP 호스트 키 (single row) ------------------------------------ */
    GtkWidget *frm_sftp_key = gtk_frame_new("SFTP 호스트 키");
    gtk_container_set_border_width(GTK_CONTAINER(frm_sftp_key), 4);
    app->frm_sftp = frm_sftp_key;
    GtkWidget *key_grid = gtk_grid_new();
    gtk_grid_set_column_spacing(GTK_GRID(key_grid), 4);
    gtk_container_set_border_width(GTK_CONTAINER(key_grid), 6);
    gtk_container_add(GTK_CONTAINER(frm_sftp_key), key_grid);

    GtkWidget *lbl_key     = gtk_label_new("키 파일:");
    gtk_widget_set_halign(lbl_key, GTK_ALIGN_END);
    GtkWidget *ent_key     = gtk_entry_new();
    gtk_editable_set_editable(GTK_EDITABLE(ent_key), FALSE);
    gtk_widget_set_hexpand(ent_key, TRUE);
    GtkWidget *btn_gen_key = gtk_button_new_with_label("생성");
    GtkWidget *btn_kdir    = gtk_button_new_with_label("폴더 열기");

    /* All on row 0 */
    gtk_grid_attach(GTK_GRID(key_grid), lbl_key,    0, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(key_grid), ent_key,    1, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(key_grid), btn_gen_key,2, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(key_grid), btn_kdir,   3, 0, 1, 1);

    app->ent_key_path = ent_key;
    g_signal_connect(btn_gen_key, "clicked", G_CALLBACK(on_generate_sftp_key), app);
    g_signal_connect(btn_kdir,    "clicked", G_CALLBACK(on_open_key_folder),   app);
    gtk_widget_set_sensitive(frm_sftp_key, FALSE);
    g_signal_connect(chk_sftp, "toggled", G_CALLBACK(on_sftp_toggled), app);
    gtk_box_pack_start(GTK_BOX(cert_hbox), frm_sftp_key, TRUE, TRUE, 0);

    /* ---- Performance frame --------------------------------------------- */
    GtkWidget *frm_perf = gtk_frame_new("성능");
    gtk_container_set_border_width(GTK_CONTAINER(frm_perf), 4);
    GtkWidget *perf_grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(perf_grid), 4);
    gtk_grid_set_column_spacing(GTK_GRID(perf_grid), 8);
    gtk_container_set_border_width(GTK_CONTAINER(perf_grid), 6);
    gtk_container_add(GTK_CONTAINER(frm_perf), perf_grid);

    GtkWidget *lbl_buf = gtk_label_new("버퍼 크기 (KB):");
    gtk_widget_set_halign(lbl_buf, GTK_ALIGN_END);
    GtkWidget *ent_buf = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(ent_buf), "64");
    gtk_widget_set_size_request(ent_buf, 70, -1);
    GtkWidget *lbl_thr = gtk_label_new("최대 동시 연결수:");
    gtk_widget_set_halign(lbl_thr, GTK_ALIGN_END);
    GtkWidget *ent_thr = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(ent_thr), "10");
    gtk_widget_set_size_request(ent_thr, 70, -1);

    gtk_grid_attach(GTK_GRID(perf_grid), lbl_buf, 0, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(perf_grid), ent_buf, 1, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(perf_grid), lbl_thr, 2, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(perf_grid), ent_thr, 3, 0, 1, 1);
    app->ent_bufsize = ent_buf;
    app->ent_threads = ent_thr;
    gtk_box_pack_start(GTK_BOX(vbox), frm_perf, FALSE, FALSE, 0);

    /* ---- Status row ---------------------------------------------------- */
    GtkWidget *frm_status = gtk_frame_new("상태");
    gtk_container_set_border_width(GTK_CONTAINER(frm_status), 4);
    GtkWidget *stat_grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(stat_grid), 2);
    gtk_grid_set_column_spacing(GTK_GRID(stat_grid), 16);
    gtk_container_set_border_width(GTK_CONTAINER(stat_grid), 6);
    gtk_container_add(GTK_CONTAINER(frm_status), stat_grid);

    gtk_grid_attach(GTK_GRID(stat_grid), gtk_label_new("현재 접속:"), 0, 0, 1, 1);
    GtkWidget *lbl_cur = gtk_label_new("0");
    gtk_widget_set_halign(lbl_cur, GTK_ALIGN_START);
    gtk_grid_attach(GTK_GRID(stat_grid), lbl_cur, 1, 0, 1, 1);
    app->lbl_cur_clients = lbl_cur;

    gtk_grid_attach(GTK_GRID(stat_grid), gtk_label_new("총 접속:"), 2, 0, 1, 1);
    GtkWidget *lbl_tot = gtk_label_new("0");
    gtk_widget_set_halign(lbl_tot, GTK_ALIGN_START);
    gtk_grid_attach(GTK_GRID(stat_grid), lbl_tot, 3, 0, 1, 1);
    app->lbl_tot_clients = lbl_tot;

    gtk_grid_attach(GTK_GRID(stat_grid), gtk_label_new("업로드:"), 4, 0, 1, 1);
    GtkWidget *lbl_up = gtk_label_new("0 bytes");
    gtk_widget_set_halign(lbl_up, GTK_ALIGN_START);
    gtk_grid_attach(GTK_GRID(stat_grid), lbl_up, 5, 0, 1, 1);
    app->lbl_uploads = lbl_up;

    gtk_grid_attach(GTK_GRID(stat_grid), gtk_label_new("다운로드:"), 6, 0, 1, 1);
    GtkWidget *lbl_dn = gtk_label_new("0 bytes");
    gtk_widget_set_halign(lbl_dn, GTK_ALIGN_START);
    gtk_grid_attach(GTK_GRID(stat_grid), lbl_dn, 7, 0, 1, 1);
    app->lbl_downloads = lbl_dn;

    gtk_box_pack_start(GTK_BOX(vbox), frm_status, FALSE, FALSE, 0);

    /* ---- Log area ------------------------------------------------------- */
    GtkWidget *frm_log = gtk_frame_new("로그");
    gtk_container_set_border_width(GTK_CONTAINER(frm_log), 4);
    GtkWidget *log_vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_container_set_border_width(GTK_CONTAINER(log_vbox), 4);
    gtk_container_add(GTK_CONTAINER(frm_log), log_vbox);

    GtkTextBuffer *logbuf = gtk_text_buffer_new(NULL);
    app->log_buf = logbuf;
    GtkWidget *log_tv = gtk_text_view_new_with_buffer(logbuf);
    gtk_widget_set_name(log_tv, "log-view");
    gtk_text_view_set_editable(GTK_TEXT_VIEW(log_tv), FALSE);
    gtk_text_view_set_cursor_visible(GTK_TEXT_VIEW(log_tv), FALSE);
    app->log_view = log_tv;
    GtkWidget *log_sw = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(log_sw),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_size_request(log_sw, -1, 150);
    gtk_container_add(GTK_CONTAINER(log_sw), log_tv);
    gtk_box_pack_start(GTK_BOX(log_vbox), log_sw, TRUE, TRUE, 0);

    GtkWidget *log_btns    = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    GtkWidget *btn_copy_log = gtk_button_new_with_label("복사");
    GtkWidget *btn_save_log = gtk_button_new_with_label("저장");
    g_signal_connect(btn_copy_log, "clicked", G_CALLBACK(on_copy_log), app);
    g_signal_connect(btn_save_log, "clicked", G_CALLBACK(on_save_log), app);
    gtk_box_pack_end(GTK_BOX(log_btns), btn_save_log, FALSE, FALSE, 0);
    gtk_box_pack_end(GTK_BOX(log_btns), btn_copy_log, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(log_vbox), log_btns, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), frm_log, TRUE, TRUE, 0);

    /* Connect profile combo signal now that all widgets exist */
    g_signal_connect(combo, "changed", G_CALLBACK(on_profile_changed), app);

    /* Apply loaded settings to UI */
    cfg_to_ui(app);

    /* Install GTK-safe log callback */
    gtk_log_install(on_log_message, app);

    gtk_widget_show_all(win);
    return win;
}

/* ========================================================================
   AppState lifecycle
   ======================================================================== */

AppState *app_state_new(void) {
    AppState *app = calloc(1, sizeof(AppState));
    settings_init(&app->cfg);

    char *path = settings_get_default_path();
    settings_load(&app->cfg, path);
    free(path);

    return app;
}

void app_state_free(AppState *app) {
    if (app->servers_running) stop_servers(app);
    gtk_log_uninstall();
    free(app);
}
