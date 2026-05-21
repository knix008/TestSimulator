#include "site_dialog.h"
#include <stdlib.h>
#include <string.h>

typedef struct {
    GtkListStore *store;
    GList       **profiles;
    GtkWidget    *tree;
    GtkWindow    *parent;
    gboolean     *changed;
} ManageCtx;

static void refresh_store(ManageCtx *ctx) {
    gtk_list_store_clear(ctx->store);
    for (GList *l = *ctx->profiles; l; l = l->next) {
        FtpProfile *p = l->data;
        GtkTreeIter iter;
        gtk_list_store_append(ctx->store, &iter);
        gtk_list_store_set(ctx->store, &iter, 0, p->name, -1);
    }
}

static FtpProfile *get_selected_profile(ManageCtx *ctx) {
    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(ctx->tree));
    GtkTreeIter iter;
    if (!gtk_tree_selection_get_selected(sel, NULL, &iter)) return NULL;

    GtkTreePath *path = gtk_tree_model_get_path(GTK_TREE_MODEL(ctx->store), &iter);
    gint *indices = gtk_tree_path_get_indices(path);
    gint idx = indices ? indices[0] : -1;
    gtk_tree_path_free(path);

    if (idx < 0) return NULL;
    return g_list_nth_data(*ctx->profiles, (guint)idx);
}

static void on_manage_add(GtkButton *btn, ManageCtx *ctx) {
    (void)btn;
    FtpProfile *p = ftp_profile_new("New Site");
    if (!site_dialog_run_edit(ctx->parent, p, TRUE)) {
        ftp_profile_free(p);
        return;
    }
    *ctx->profiles = g_list_append(*ctx->profiles, p);
    refresh_store(ctx);
    *ctx->changed = TRUE;
}

static void on_manage_edit(GtkButton *btn, ManageCtx *ctx) {
    (void)btn;
    FtpProfile *p = get_selected_profile(ctx);
    if (!p) return;
    FtpProfile tmp;
    memcpy(&tmp, p, sizeof(tmp));
    if (site_dialog_run_edit(ctx->parent, &tmp, FALSE)) {
        memcpy(p, &tmp, sizeof(tmp));
        refresh_store(ctx);
        *ctx->changed = TRUE;
    }
}

static void on_manage_delete(GtkButton *btn, ManageCtx *ctx) {
    (void)btn;
    FtpProfile *p = get_selected_profile(ctx);
    if (!p) return;
    *ctx->profiles = g_list_remove(*ctx->profiles, p);
    ftp_profile_free(p);
    refresh_store(ctx);
    *ctx->changed = TRUE;
}

static void combo_set_protocol(GtkComboBox *combo, FtpProtocol p) {
    gtk_combo_box_set_active(GTK_COMBO_BOX(combo), (gint)p);
}

static FtpProtocol combo_get_protocol(GtkComboBox *combo) {
    return (FtpProtocol)gtk_combo_box_get_active(GTK_COMBO_BOX(combo));
}

gboolean site_dialog_run_edit(GtkWindow *parent,
                             FtpProfile *profile,
                             gboolean is_new) {
    GtkWidget *dlg = gtk_dialog_new_with_buttons(
        is_new ? "사이트 추가" : "사이트 편집",
        parent,
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        "_Cancel", GTK_RESPONSE_CANCEL,
        "_OK", GTK_RESPONSE_OK,
        NULL);
    gtk_window_set_default_size(GTK_WINDOW(dlg), 420, 320);

    GtkWidget *grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 8);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 8);
    gtk_container_set_border_width(GTK_CONTAINER(grid), 12);
    gtk_box_pack_start(GTK_BOX(gtk_dialog_get_content_area(GTK_DIALOG(dlg))),
                       grid, TRUE, TRUE, 0);

    GtkWidget *e_name = gtk_entry_new();
    GtkWidget *e_host = gtk_entry_new();
    GtkWidget *e_port = gtk_entry_new();
    GtkWidget *e_user = gtk_entry_new();
    GtkWidget *e_pass = gtk_entry_new();
    gtk_entry_set_visibility(GTK_ENTRY(e_pass), FALSE);

    GtkWidget *combo = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(combo), "FTP");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(combo), "FTPS");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(combo), "SFTP");

    gtk_entry_set_text(GTK_ENTRY(e_name), profile->name);
    gtk_entry_set_text(GTK_ENTRY(e_host), profile->host);
    if (profile->port > 0) {
        gchar buf[16];
        g_snprintf(buf, sizeof buf, "%d", profile->port);
        gtk_entry_set_text(GTK_ENTRY(e_port), buf);
    }
    gtk_entry_set_text(GTK_ENTRY(e_user), profile->user);
    gtk_entry_set_text(GTK_ENTRY(e_pass), profile->password);
    combo_set_protocol(GTK_COMBO_BOX(combo), profile->protocol);

    gint row = 0;
#define ADD_ROW(lbl, w) \
    do { \
        GtkWidget *lab = gtk_label_new(lbl); \
        gtk_label_set_xalign(GTK_LABEL(lab), 1.0f); \
        gtk_grid_attach(GTK_GRID(grid), lab, 0, row, 1, 1); \
        gtk_grid_attach(GTK_GRID(grid), w, 1, row, 1, 1); \
        row++; \
    } while (0)

    ADD_ROW("이름:", e_name);
    ADD_ROW("프로토콜:", combo);
    ADD_ROW("호스트:", e_host);
    ADD_ROW("포트:", e_port);
    ADD_ROW("사용자:", e_user);
    ADD_ROW("비밀번호:", e_pass);
#undef ADD_ROW

    gtk_widget_show_all(dlg);
    gint resp;
    while (TRUE) {
        resp = gtk_dialog_run(GTK_DIALOG(dlg));
        if (resp != GTK_RESPONSE_OK) break;
        const gchar *nm = gtk_entry_get_text(GTK_ENTRY(e_name));
        if (nm && nm[0]) break;
        /* Empty name: highlight the field and retry */
        GdkRGBA red = { 1.0, 0.8, 0.8, 1.0 };
        gtk_widget_override_background_color(e_name, GTK_STATE_FLAG_NORMAL, &red);
        gtk_widget_grab_focus(e_name);
    }
    if (resp == GTK_RESPONSE_OK) {
        g_strlcpy(profile->name, gtk_entry_get_text(GTK_ENTRY(e_name)), FTP_MAX_NAME);
        g_strlcpy(profile->host, gtk_entry_get_text(GTK_ENTRY(e_host)), FTP_MAX_HOST);
        g_strlcpy(profile->user, gtk_entry_get_text(GTK_ENTRY(e_user)), FTP_MAX_USER);
        g_strlcpy(profile->password, gtk_entry_get_text(GTK_ENTRY(e_pass)), FTP_MAX_PASS);
        profile->protocol = combo_get_protocol(GTK_COMBO_BOX(combo));
        const gchar *pt = gtk_entry_get_text(GTK_ENTRY(e_port));
        profile->port = pt && pt[0] ? atoi(pt) : ftp_default_port(profile->protocol);
        profile->save_password = TRUE;
    }

    gtk_widget_destroy(dlg);
    return resp == GTK_RESPONSE_OK;
}

enum { RESPONSE_APPLY = 1 };

gboolean site_dialog_run_manage(GtkWindow *parent,
                                GList **profiles_io,
                                FtpProfile *apply_out) {
    GtkWidget *dlg = gtk_dialog_new_with_buttons(
        "연결 사이트 관리",
        parent,
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        "_Close", GTK_RESPONSE_CLOSE,
        NULL);
    gtk_dialog_add_button(GTK_DIALOG(dlg), "적용", RESPONSE_APPLY);
    gtk_window_set_default_size(GTK_WINDOW(dlg), 480, 360);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_container_set_border_width(GTK_CONTAINER(vbox), 10);
    gtk_box_pack_start(GTK_BOX(gtk_dialog_get_content_area(GTK_DIALOG(dlg))),
                       vbox, TRUE, TRUE, 0);

    GtkListStore *store = gtk_list_store_new(1, G_TYPE_STRING);
    GtkWidget *tree = gtk_tree_view_new_with_model(GTK_TREE_MODEL(store));
    GtkCellRenderer *rend = gtk_cell_renderer_text_new();
    gtk_tree_view_append_column(GTK_TREE_VIEW(tree),
        gtk_tree_view_column_new_with_attributes("사이트", rend, "text", 0, NULL));

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_size_request(scroll, -1, 220);
    gtk_container_add(GTK_CONTAINER(scroll), tree);
    gtk_box_pack_start(GTK_BOX(vbox), scroll, TRUE, TRUE, 0);

    GtkWidget *hbtn = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    GtkWidget *btn_add  = gtk_button_new_with_label("추가");
    GtkWidget *btn_edit = gtk_button_new_with_label("편집");
    GtkWidget *btn_del  = gtk_button_new_with_label("삭제");
    gtk_box_pack_start(GTK_BOX(hbtn), btn_add,  FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(hbtn), btn_edit, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(hbtn), btn_del,  FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), hbtn, FALSE, FALSE, 0);

    gboolean changed = FALSE;
    ManageCtx ctx = { store, profiles_io, tree, parent, &changed };
    refresh_store(&ctx);

    g_signal_connect(btn_add,  "clicked", G_CALLBACK(on_manage_add),    &ctx);
    g_signal_connect(btn_edit, "clicked", G_CALLBACK(on_manage_edit),   &ctx);
    g_signal_connect(btn_del,  "clicked", G_CALLBACK(on_manage_delete), &ctx);

    gtk_widget_show_all(dlg);
    gint resp = gtk_dialog_run(GTK_DIALOG(dlg));

    if (resp == RESPONSE_APPLY && apply_out) {
        FtpProfile *p = get_selected_profile(&ctx);
        if (p)
            memcpy(apply_out, p, sizeof(FtpProfile));
    }

    gtk_widget_destroy(dlg);
    g_object_unref(store);
    return changed;
}
