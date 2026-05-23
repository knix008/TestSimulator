/**
 * EasyMD GTK
 * fileio.c - Hand-built file chooser dialogs + raw I/O wrappers.
 *
 * Uses a custom GtkDialog instead of GtkFileChooserDialog so that the
 * entire widget tree is styled by our own CSS — no dark-theme bleed-through
 * from the native file-chooser internals.
 */
#define _POSIX_C_SOURCE 200809L

#include "fileio.h"
#include "fileio_core.h"
#include "mdcore.h"
#include "utils.h"

#include <glib/gstdio.h>
#include <errno.h>
#include <string.h>
#include <unistd.h>
#include <zlib.h>

/* =====================================================================
 * CSS — injected once at USER+20 priority (820 > Yaru-dark 200).
 * All selectors use #name or widget-name based IDs we control.
 * ===================================================================== */
static const gchar FC_CSS[] =
    /* ── Path bar (dark strip at top) ─────────────────────────── */
    "#fc-path-bar {"
    "  background-color: #2a2a40;"
    "  border-bottom: 1px solid #1a1a2e;"
    "  padding: 4px 6px;"
    "}"
    "#fc-path-entry {"
    "  background-color: #1e1e30;"
    "  color: #c8c8e8;"
    "  caret-color: #c8c8e8;"
    "  border: 1px solid #3a3a5c;"
    "  font-family: monospace;"
    "  font-size: 12px;"
    "}"
    /* ── Navigation buttons ─────────────────────────────────────── */
    "#fc-nav-btn {"
    "  background-color: #3a3a58;"
    "  color: #e0e0f8;"
    "  border: 1px solid #5a5a80;"
    "  min-width: 30px; min-height: 30px;"
    "}"
    "#fc-nav-btn label { color: #e0e0f8; }"
    "#fc-nav-btn image { color: #e0e0f8; }"
    "#fc-nav-btn:hover { background-color: #4a4a70; }"
    /* ── File list (light background, dark text) ────────────────── */
    "#fc-file-list { background-color: #f8f8ff; color: #1e1e2e; }"
    "#fc-file-list row { background-color: transparent; color: #1e1e2e; }"
    "#fc-file-list row:nth-child(even) { background-color: #f0f0f8; }"
    "#fc-file-list row:hover  { background-color: #dcdcf0; }"
    "#fc-file-list row:selected { background-color: #4444bb; color: #ffffff; }"
    /* ── Scrolled window / viewport wrapping the list ──────────── */
    "#fc-scroll { background-color: #f8f8ff; }"
    "#fc-scroll > viewport { background-color: #f8f8ff; }"
    "#fc-scroll viewport { background-color: #f8f8ff; }"
    /* ── Bottom bar ─────────────────────────────────────────────── */
    "#fc-bottom-bar {"
    "  background-color: #ededf6;"
    "  border-top: 1px solid #d0d0e8;"
    "  padding: 6px 8px;"
    "}"
    "#fc-label { color: #1e1e2e; font-weight: bold; }"
    "#fc-name-entry {"
    "  background-color: #ffffff;"
    "  color: #1e1e2e;"
    "  caret-color: #1e1e2e;"
    "  border: 1px solid #8888aa;"
    "}"
    /* ── Dialog background ──────────────────────────────────────── */
    "#fc-dialog { background-color: #f5f5fb; color: #1e1e2e; }"
    "#fc-dialog > * { background-color: #f5f5fb; color: #1e1e2e; }"
    /* ── Buttons inside fc-dialog ───────────────────────────────── */
    "#fc-dialog button {"
    "  background-color: #3a3a50;"
    "  color: #f0f0f0;"
    "  border: 1px solid #5a5a78;"
    "}"
    "#fc-dialog button label { color: #f0f0f0; }"
    "#fc-dialog button image { color: #f0f0f0; }"
    "#fc-dialog button:hover { background-color: #4a4a65; }"
    "#fc-dialog button.suggested-action {"
    "  background-color: #4444bb; color: #ffffff; border-color: #3333aa;"
    "}"
    "#fc-dialog button.suggested-action label { color: #ffffff; }"
    "#fc-dialog button.suggested-action:hover { background-color: #5555cc; }"
    "#fc-dialog button.destructive-action {"
    "  background-color: #bb2222; color: #ffffff; border-color: #991111;"
    "}"
    "#fc-dialog button.destructive-action label { color: #ffffff; }";

static void fc_ensure_css(void) {
    static gboolean done = FALSE;
    if (done) return;
    done = TRUE;
    GtkCssProvider *p = gtk_css_provider_new();
    gtk_css_provider_load_from_data(p, FC_CSS, -1, NULL);
    gtk_style_context_add_provider_for_screen(
        gdk_screen_get_default(), GTK_STYLE_PROVIDER(p),
        GTK_STYLE_PROVIDER_PRIORITY_USER + 20);
    g_object_unref(p);
}

/* =====================================================================
 * Custom file-list widget internals
 * ===================================================================== */
enum { FC_COL_ICON, FC_COL_NAME, FC_COL_IS_DIR, FC_COL_FULLPATH, FC_N_COLS };

typedef struct {
    GtkWidget    *dialog;
    GtkWidget    *path_entry;   /* shows / accepts the current directory */
    GtkWidget    *file_view;    /* GtkTreeView listing files             */
    GtkListStore *store;
    GtkWidget    *name_entry;   /* filename input at the bottom          */
    gchar        *current_dir;  /* heap-allocated current directory path */
} FCState;

static gint fc_cmp(gconstpointer a, gconstpointer b) {
    return g_ascii_strcasecmp(*(const gchar **)a, *(const gchar **)b);
}

static void fc_populate(FCState *fc) {
    gtk_list_store_clear(fc->store);
    gtk_entry_set_text(GTK_ENTRY(fc->path_entry), fc->current_dir);

    GDir *dir = g_dir_open(fc->current_dir, 0, NULL);
    if (!dir) return;

    GPtrArray *dirs  = g_ptr_array_new_with_free_func(g_free);
    GPtrArray *files = g_ptr_array_new_with_free_func(g_free);
    const gchar *n;
    while ((n = g_dir_read_name(dir))) {
        if (n[0] == '.') continue;
        gchar *full = g_build_filename(fc->current_dir, n, NULL);
        if (g_file_test(full, G_FILE_TEST_IS_DIR))
            g_ptr_array_add(dirs,  g_strdup(n));
        else
            g_ptr_array_add(files, g_strdup(n));
        g_free(full);
    }
    g_dir_close(dir);
    g_ptr_array_sort(dirs,  fc_cmp);
    g_ptr_array_sort(files, fc_cmp);

    GtkTreeIter it;
    if (g_strcmp0(fc->current_dir, "/") != 0) {
        gchar *up = g_path_get_dirname(fc->current_dir);
        gtk_list_store_append(fc->store, &it);
        gtk_list_store_set(fc->store, &it,
            FC_COL_ICON, "go-up-symbolic", FC_COL_NAME, "..",
            FC_COL_IS_DIR, TRUE, FC_COL_FULLPATH, up, -1);
        g_free(up);
    }
    for (guint i = 0; i < dirs->len; i++) {
        const gchar *dn = dirs->pdata[i];
        gchar *full = g_build_filename(fc->current_dir, dn, NULL);
        gtk_list_store_append(fc->store, &it);
        gtk_list_store_set(fc->store, &it,
            FC_COL_ICON, "folder-symbolic", FC_COL_NAME, dn,
            FC_COL_IS_DIR, TRUE, FC_COL_FULLPATH, full, -1);
        g_free(full);
    }
    for (guint i = 0; i < files->len; i++) {
        const gchar *fn = files->pdata[i];
        gchar *full = g_build_filename(fc->current_dir, fn, NULL);
        gtk_list_store_append(fc->store, &it);
        gtk_list_store_set(fc->store, &it,
            FC_COL_ICON, "text-x-generic-symbolic", FC_COL_NAME, fn,
            FC_COL_IS_DIR, FALSE, FC_COL_FULLPATH, full, -1);
        g_free(full);
    }
    g_ptr_array_free(dirs,  TRUE);
    g_ptr_array_free(files, TRUE);
}

static void fc_go_to(FCState *fc, const gchar *path) {
    g_free(fc->current_dir);
    fc->current_dir = g_strdup(path);
    fc_populate(fc);
}

/* ── Signal handlers ────────────────────────────────────────────────── */

static void fc_row_activated(GtkTreeView *tv, GtkTreePath *tp,
                              GtkTreeViewColumn *col, FCState *fc) {
    (void)col;
    GtkTreeModel *m = gtk_tree_view_get_model(tv);
    GtkTreeIter it;
    if (!gtk_tree_model_get_iter(m, &it, tp)) return;
    gboolean is_dir; gchar *full, *name;
    gtk_tree_model_get(m, &it,
        FC_COL_IS_DIR, &is_dir,
        FC_COL_FULLPATH, &full,
        FC_COL_NAME, &name, -1);
    if (is_dir) {
        fc_go_to(fc, full);
    } else {
        if (fc->name_entry)
            gtk_entry_set_text(GTK_ENTRY(fc->name_entry), name);
        gtk_dialog_response(GTK_DIALOG(fc->dialog), GTK_RESPONSE_ACCEPT);
    }
    g_free(full); g_free(name);
}

static void fc_selection_changed(GtkTreeSelection *sel, FCState *fc) {
    if (!fc->name_entry) return;
    GtkTreeModel *m; GtkTreeIter it;
    if (!gtk_tree_selection_get_selected(sel, &m, &it)) return;
    gboolean is_dir; gchar *name;
    gtk_tree_model_get(m, &it, FC_COL_IS_DIR, &is_dir, FC_COL_NAME, &name, -1);
    if (!is_dir && g_strcmp0(name, "..") != 0)
        gtk_entry_set_text(GTK_ENTRY(fc->name_entry), name);
    g_free(name);
}

static void fc_go_up_cb(GtkButton *b, FCState *fc) {
    (void)b;
    gchar *up = g_path_get_dirname(fc->current_dir);
    if (g_strcmp0(up, fc->current_dir) != 0) fc_go_to(fc, up);
    g_free(up);
}

static void fc_go_home_cb(GtkButton *b, FCState *fc) {
    (void)b;
    fc_go_to(fc, g_get_home_dir());
}

static void fc_path_activate(GtkEntry *e, FCState *fc) {
    const gchar *t = gtk_entry_get_text(e);
    if (t && *t && g_file_test(t, G_FILE_TEST_IS_DIR))
        fc_go_to(fc, t);
    else
        gtk_entry_set_text(GTK_ENTRY(fc->path_entry), fc->current_dir);
}

static void fc_name_activate(GtkEntry *e, FCState *fc) {
    (void)e;
    gtk_dialog_response(GTK_DIALOG(fc->dialog), GTK_RESPONSE_ACCEPT);
}

/* ── Dialog builder ─────────────────────────────────────────────────── */

static void fc_build(GtkWindow *parent, const gchar *title,
                     const gchar *ok_label, const gchar *start_name,
                     FCState *fc) {
    fc_ensure_css();

    GtkWidget *dlg = gtk_dialog_new_with_buttons(
        title, parent,
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        "취소",   GTK_RESPONSE_CANCEL,
        ok_label, GTK_RESPONSE_ACCEPT,
        NULL);
    gtk_window_set_default_size(GTK_WINDOW(dlg), 720, 520);
    gtk_widget_set_name(dlg, "fc-dialog");
    fc->dialog = dlg;

    GtkWidget *ca = gtk_dialog_get_content_area(GTK_DIALOG(dlg));
    gtk_box_set_spacing(GTK_BOX(ca), 0);
    gtk_container_set_border_width(GTK_CONTAINER(ca), 0);

    /* ── Path bar ─────────────────────────────────────────────── */
    GtkWidget *pbar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_widget_set_name(pbar, "fc-path-bar");
    gtk_container_set_border_width(GTK_CONTAINER(pbar), 6);

    GtkWidget *btn_up   = gtk_button_new_from_icon_name("go-up-symbolic",  GTK_ICON_SIZE_BUTTON);
    GtkWidget *btn_home = gtk_button_new_from_icon_name("go-home-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_widget_set_name(btn_up,   "fc-nav-btn");
    gtk_widget_set_name(btn_home, "fc-nav-btn");
    gtk_widget_set_tooltip_text(btn_up,   "상위 폴더");
    gtk_widget_set_tooltip_text(btn_home, "홈 폴더");

    GtkWidget *pe = gtk_entry_new();
    gtk_widget_set_name(pe, "fc-path-entry");
    gtk_entry_set_text(GTK_ENTRY(pe), fc->current_dir);
    gtk_widget_set_hexpand(pe, TRUE);
    fc->path_entry = pe;

    gtk_box_pack_start(GTK_BOX(pbar), btn_up,   FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(pbar), btn_home, FALSE, FALSE, 2);
    gtk_box_pack_start(GTK_BOX(pbar), pe,       TRUE,  TRUE,  2);

    g_signal_connect(btn_up,   "clicked",  G_CALLBACK(fc_go_up_cb),     fc);
    g_signal_connect(btn_home, "clicked",  G_CALLBACK(fc_go_home_cb),   fc);
    g_signal_connect(pe,       "activate", G_CALLBACK(fc_path_activate), fc);

    /* ── File list ────────────────────────────────────────────── */
    fc->store = gtk_list_store_new(FC_N_COLS,
        G_TYPE_STRING, G_TYPE_STRING, G_TYPE_BOOLEAN, G_TYPE_STRING);

    GtkWidget *tv = gtk_tree_view_new_with_model(GTK_TREE_MODEL(fc->store));
    g_object_unref(fc->store);
    gtk_widget_set_name(tv, "fc-file-list");
    gtk_tree_view_set_headers_visible(GTK_TREE_VIEW(tv), FALSE);
    gtk_tree_view_set_activate_on_single_click(GTK_TREE_VIEW(tv), FALSE);
    fc->file_view = tv;

    GtkTreeViewColumn *col = gtk_tree_view_column_new();
    GtkCellRenderer *ir = gtk_cell_renderer_pixbuf_new();
    g_object_set(ir, "stock-size", GTK_ICON_SIZE_SMALL_TOOLBAR, NULL);
    GtkCellRenderer *tr = gtk_cell_renderer_text_new();
    g_object_set(tr, "ypad", 3, "xpad", 6, NULL);
    gtk_tree_view_column_pack_start(col, ir, FALSE);
    gtk_tree_view_column_add_attribute(col, ir, "icon-name", FC_COL_ICON);
    gtk_tree_view_column_pack_start(col, tr, TRUE);
    gtk_tree_view_column_add_attribute(col, tr, "text", FC_COL_NAME);
    gtk_tree_view_append_column(GTK_TREE_VIEW(tv), col);

    GtkTreeSelection *sel = gtk_tree_view_get_selection(GTK_TREE_VIEW(tv));
    g_signal_connect(sel, "changed",       G_CALLBACK(fc_selection_changed), fc);
    g_signal_connect(tv,  "row-activated", G_CALLBACK(fc_row_activated),     fc);

    GtkWidget *sw = gtk_scrolled_window_new(NULL, NULL);
    gtk_widget_set_name(sw, "fc-scroll");
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(sw),
        GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_scrolled_window_set_shadow_type(GTK_SCROLLED_WINDOW(sw), GTK_SHADOW_IN);
    gtk_container_add(GTK_CONTAINER(sw), tv);
    gtk_widget_set_vexpand(sw, TRUE);
    gtk_widget_set_margin_start(sw, 6);
    gtk_widget_set_margin_end(sw, 6);

    /* ── Bottom bar: filename entry ───────────────────────────── */
    GtkWidget *bbar = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_widget_set_name(bbar, "fc-bottom-bar");
    gtk_container_set_border_width(GTK_CONTAINER(bbar), 8);

    GtkWidget *name_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    GtkWidget *nlbl = gtk_label_new("파일 이름:");
    gtk_widget_set_name(nlbl, "fc-label");
    gtk_widget_set_size_request(nlbl, 80, -1);
    gtk_label_set_xalign(GTK_LABEL(nlbl), 1.0f);

    GtkWidget *ne = gtk_entry_new();
    gtk_widget_set_name(ne, "fc-name-entry");
    gtk_widget_set_hexpand(ne, TRUE);
    if (start_name && *start_name)
        gtk_entry_set_text(GTK_ENTRY(ne), start_name);
    fc->name_entry = ne;
    g_signal_connect(ne, "activate", G_CALLBACK(fc_name_activate), fc);

    gtk_box_pack_start(GTK_BOX(name_row), nlbl, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(name_row), ne,   TRUE,  TRUE,  0);
    gtk_box_pack_start(GTK_BOX(bbar), name_row, FALSE, FALSE, 0);

    /* ── Assemble ─────────────────────────────────────────────── */
    gtk_box_pack_start(GTK_BOX(ca), pbar, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(ca), sw,   TRUE,  TRUE,  0);
    gtk_box_pack_start(GTK_BOX(ca), bbar, FALSE, FALSE, 0);

    /* Mark the OK button as primary action */
    GtkWidget *okb = gtk_dialog_get_widget_for_response(
                        GTK_DIALOG(dlg), GTK_RESPONSE_ACCEPT);
    if (okb)
        gtk_style_context_add_class(
            gtk_widget_get_style_context(okb), "suggested-action");

    fc_populate(fc);
    gtk_widget_show_all(dlg);
    gtk_widget_grab_focus(ne);
}

/* ── Overwrite-confirmation helper ─────────────────────────────────── */
static gboolean fc_confirm_overwrite(GtkWindow *parent, const gchar *path) {
    gchar *base = g_path_get_basename(path);
    GtkWidget *m = gtk_message_dialog_new(parent,
        GTK_DIALOG_MODAL,
        GTK_MESSAGE_QUESTION,
        GTK_BUTTONS_NONE,
        "파일 '%s'이(가) 이미 존재합니다.", base);
    gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(m),
        "덮어쓸까요?");
    gtk_dialog_add_buttons(GTK_DIALOG(m),
        "취소",   GTK_RESPONSE_CANCEL,
        "덮어쓰기", GTK_RESPONSE_ACCEPT, NULL);
    GtkWidget *ow = gtk_dialog_get_widget_for_response(
                        GTK_DIALOG(m), GTK_RESPONSE_ACCEPT);
    if (ow)
        gtk_style_context_add_class(
            gtk_widget_get_style_context(ow), "destructive-action");
    utils_apply_dialog_css(m);
    gboolean ok = (gtk_dialog_run(GTK_DIALOG(m)) == GTK_RESPONSE_ACCEPT);
    gtk_widget_destroy(m);
    g_free(base);
    return ok;
}

/* =====================================================================
 * Public API
 * ===================================================================== */

gboolean fileio_open_dialog(GtkWindow *parent, gchar **out_path) {
    if (!out_path) return FALSE;
    *out_path = NULL;

    FCState fc = {0};
    fc.current_dir = g_strdup(g_get_home_dir());
    fc_build(parent, "Markdown 파일 열기", "열기", NULL, &fc);

    gboolean ok = FALSE;
    while (gtk_dialog_run(GTK_DIALOG(fc.dialog)) == GTK_RESPONSE_ACCEPT) {
        const gchar *name = gtk_entry_get_text(GTK_ENTRY(fc.name_entry));
        if (!name || !*name) continue;

        gchar *full;
        if (g_path_is_absolute(name))
            full = g_strdup(name);
        else
            full = g_build_filename(fc.current_dir, name, NULL);

        if (g_file_test(full, G_FILE_TEST_IS_REGULAR)) {
            *out_path = full;
            ok = TRUE;
            break;
        }
        g_free(full);
    }
    gtk_widget_destroy(fc.dialog);
    g_free(fc.current_dir);
    return ok;
}

gboolean fileio_save_dialog(GtkWindow *parent,
                            const gchar *current_path,
                            gchar **out_path) {
    if (!out_path) return FALSE;
    *out_path = NULL;

    FCState fc = {0};
    const gchar *start_name = "untitled.md";

    if (current_path && *current_path) {
        fc.current_dir = g_path_get_dirname(current_path);
        const gchar *base = strrchr(current_path, '/');
        start_name = base ? base + 1 : current_path;
    } else {
        fc.current_dir = g_strdup(g_get_home_dir());
    }

    fc_build(parent, "Markdown 파일 저장", "저장", start_name, &fc);

    gboolean ok = FALSE;
    while (gtk_dialog_run(GTK_DIALOG(fc.dialog)) == GTK_RESPONSE_ACCEPT) {
        const gchar *name = gtk_entry_get_text(GTK_ENTRY(fc.name_entry));
        if (!name || !*name) continue;

        const gchar *dot = strrchr(name, '.');
        gchar *fname = dot ? g_strdup(name) : g_strconcat(name, ".md", NULL);
        gchar *full  = g_path_is_absolute(fname)
                       ? fname
                       : g_build_filename(fc.current_dir, fname, NULL);
        if (!g_path_is_absolute(fname)) g_free(fname);

        if (g_file_test(full, G_FILE_TEST_EXISTS)) {
            if (!fc_confirm_overwrite(GTK_WINDOW(fc.dialog), full)) {
                g_free(full);
                continue;
            }
        }
        *out_path = full;
        ok = TRUE;
        break;
    }
    gtk_widget_destroy(fc.dialog);
    g_free(fc.current_dir);
    return ok;
}

gboolean fileio_save_as_dialog(GtkWindow *parent,
                               const gchar *title,
                               const gchar *default_name,
                               const gchar *start_dir,
                               gchar **out_path) {
    if (!out_path) return FALSE;
    *out_path = NULL;

    FCState fc = {0};
    fc.current_dir = g_strdup(
        (start_dir && *start_dir) ? start_dir : g_get_home_dir());
    fc_build(parent, title, "저장", default_name, &fc);

    gboolean ok = FALSE;
    while (gtk_dialog_run(GTK_DIALOG(fc.dialog)) == GTK_RESPONSE_ACCEPT) {
        const gchar *name = gtk_entry_get_text(GTK_ENTRY(fc.name_entry));
        if (!name || !*name) continue;

        gchar *full = g_path_is_absolute(name)
                      ? g_strdup(name)
                      : g_build_filename(fc.current_dir, name, NULL);

        if (g_file_test(full, G_FILE_TEST_EXISTS)) {
            if (!fc_confirm_overwrite(GTK_WINDOW(fc.dialog), full)) {
                g_free(full);
                continue;
            }
        }
        *out_path = full;
        ok = TRUE;
        break;
    }
    gtk_widget_destroy(fc.dialog);
    g_free(fc.current_dir);
    return ok;
}

/* =====================================================================
 * HTML export
 * ===================================================================== */

/* HTML document wrapper: split into head and tail to avoid printf escaping. */
static const gchar HTML_HEAD[] =
    "<!DOCTYPE html>\n"
    "<html lang=\"ko\">\n"
    "<head>\n"
    "<meta charset=\"UTF-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
    "<title>EasyMD Export</title>\n"
    "<style>\n"
    "  body { font-family: 'Noto Sans', sans-serif; max-width: 860px;"
    "         margin: 2em auto; padding: 0 1.5em; color: #1e1e2e;"
    "         background: #ffffff; line-height: 1.7; }\n"
    "  h1,h2,h3,h4,h5,h6 { color: #2a2a6a; margin-top: 1.4em; }\n"
    "  h1 { border-bottom: 2px solid #4444bb; padding-bottom: 0.3em; }\n"
    "  h2 { border-bottom: 1px solid #d0d0e8; padding-bottom: 0.2em; }\n"
    "  a  { color: #4444bb; }\n"
    "  pre { background: #f4f4f8; padding: 1em; border-radius: 6px;"
    "        overflow-x: auto; border: 1px solid #ddd; }\n"
    "  code { background: #f0f0f8; padding: 0.15em 0.4em;"
    "         border-radius: 3px; font-size: 0.9em; }\n"
    "  pre code { background: transparent; padding: 0; }\n"
    "  blockquote { border-left: 4px solid #9999cc; margin-left: 0;"
    "               padding-left: 1em; color: #555; }\n"
    "  table { border-collapse: collapse; width: 100%; }\n"
    "  th,td { border: 1px solid #ccc; padding: 8px 12px; }\n"
    "  th { background: #eeeef8; font-weight: bold; }\n"
    "  tr:nth-child(even) { background: #f8f8ff; }\n"
    "  img { max-width: 100%; }\n"
    "  hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }\n"
    "</style>\n"
    "</head>\n"
    "<body>\n";

static const gchar HTML_TAIL[] = "</body>\n</html>\n";

gboolean fileio_export_html(const gchar *path, const gchar *markdown,
                            GError **error) {
    char  *body = mdcore_to_html(markdown ? markdown : "");
    gchar *html = g_strconcat(HTML_HEAD, body ? body : "", HTML_TAIL, NULL);
    free(body);

    gboolean ok = fileio_core_write(path, html, error);
    g_free(html);
    return ok;
}

/* =====================================================================
 * Word export (.docx — Office Open XML ZIP package)
 * ===================================================================== */

static const gchar DOCX_CONTENT_TYPES[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">\n"
    "  <Default Extension=\"rels\""
    " ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>\n"
    "  <Default Extension=\"xml\" ContentType=\"application/xml\"/>\n"
    "  <Default Extension=\"htm\" ContentType=\"text/html\"/>\n"
    "  <Override PartName=\"/word/document.xml\""
    " ContentType=\"application/vnd.openxmlformats-officedocument."
    "wordprocessingml.document.main+xml\"/>\n"
    "</Types>\n";

static const gchar DOCX_ROOT_RELS[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n"
    "  <Relationship Id=\"rId1\""
    " Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\""
    " Target=\"word/document.xml\"/>\n"
    "</Relationships>\n";

static const gchar DOCX_DOCUMENT_RELS[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\n"
    "  <Relationship Id=\"rId1\""
    " Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk\""
    " Target=\"afchunk.htm\"/>\n"
    "</Relationships>\n";

static const gchar DOCX_DOCUMENT_XML[] =
    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
    "<w:document"
    " xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\""
    " xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">\n"
    "  <w:body>\n"
    "    <w:altChunk r:id=\"rId1\"/>\n"
    "    <w:sectPr>\n"
    "      <w:pgSz w:w=\"12240\" w:h=\"15840\"/>\n"
    "      <w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/>\n"
    "    </w:sectPr>\n"
    "  </w:body>\n"
    "</w:document>\n";

/* Minimal ZIP writer (store only) — no external zip binary required. */
typedef struct {
    GByteArray *local;
    GByteArray *central;
    guint32     entries;
} DocxZip;

static void docx_zip_put16(GByteArray *buf, guint16 v) {
    guint8 b[2] = { (guint8)(v & 0xff), (guint8)((v >> 8) & 0xff) };
    g_byte_array_append(buf, b, 2);
}

static void docx_zip_put32(GByteArray *buf, guint32 v) {
    guint8 b[4] = {
        (guint8)(v & 0xff),
        (guint8)((v >> 8) & 0xff),
        (guint8)((v >> 16) & 0xff),
        (guint8)((v >> 24) & 0xff)
    };
    g_byte_array_append(buf, b, 4);
}

static guint32 docx_zip_crc32(const guchar *data, gsize len) {
    return (guint32)crc32(0L, data, (uInt)len);
}

static gboolean docx_zip_add(DocxZip *zip,
                            const gchar *name,
                            const gchar *data,
                            gsize len,
                            GError **error) {
    (void)error;
    if (!name || !*name) return FALSE;

    gsize name_len = strlen(name);
    if (name_len > 0xffff || len > 0xffffffffU)
        return FALSE;

    guint32 crc    = docx_zip_crc32((const guchar *)data, len);
    guint32 offset = zip->local->len;

    docx_zip_put32(zip->local, 0x04034b50U);
    docx_zip_put16(zip->local, 20);
    docx_zip_put16(zip->local, 0);
    docx_zip_put16(zip->local, 0);
    docx_zip_put16(zip->local, 0);
    docx_zip_put16(zip->local, 0);
    docx_zip_put32(zip->local, crc);
    docx_zip_put32(zip->local, (guint32)len);
    docx_zip_put32(zip->local, (guint32)len);
    docx_zip_put16(zip->local, (guint16)name_len);
    docx_zip_put16(zip->local, 0);
    g_byte_array_append(zip->local, (const guchar *)name, (guint)name_len);
    if (len > 0)
        g_byte_array_append(zip->local, (const guchar *)data, (guint)len);

    docx_zip_put32(zip->central, 0x02014b50U);
    docx_zip_put16(zip->central, 20);
    docx_zip_put16(zip->central, 20);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put32(zip->central, crc);
    docx_zip_put32(zip->central, (guint32)len);
    docx_zip_put32(zip->central, (guint32)len);
    docx_zip_put16(zip->central, (guint16)name_len);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put16(zip->central, 0);
    docx_zip_put32(zip->central, 0);
    docx_zip_put32(zip->central, offset);
    g_byte_array_append(zip->central, (const guchar *)name, (guint)name_len);

    zip->entries++;
    return TRUE;
}

static void docx_zip_free(DocxZip *zip) {
    if (!zip) return;
    if (zip->local)   g_byte_array_unref(zip->local);
    if (zip->central) g_byte_array_unref(zip->central);
    zip->local = zip->central = NULL;
}

static gboolean docx_ensure_parent_dir(const gchar *path, GError **error) {
    gchar *dir = g_path_get_dirname(path);
    if (g_file_test(dir, G_FILE_TEST_IS_DIR)) {
        g_free(dir);
        return TRUE;
    }
    if (g_mkdir_with_parents(dir, 0755) == 0 || errno == EEXIST) {
        g_free(dir);
        return TRUE;
    }
    g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
                "출력 폴더를 만들 수 없습니다: %s", dir);
    g_free(dir);
    return FALSE;
}

static gboolean docx_zip_write_file(DocxZip *zip,
                                    const gchar *outpath,
                                    GError **error) {
    GByteArray *out = g_byte_array_new();
    guint32     cd_offset = zip->local->len;

    g_byte_array_append(out, zip->local->data, zip->local->len);
    g_byte_array_append(out, zip->central->data, zip->central->len);

    docx_zip_put32(out, 0x06054b50U);
    docx_zip_put16(out, 0);
    docx_zip_put16(out, 0);
    docx_zip_put16(out, (guint16)zip->entries);
    docx_zip_put16(out, (guint16)zip->entries);
    docx_zip_put32(out, zip->central->len);
    docx_zip_put32(out, cd_offset);
    docx_zip_put16(out, 0);

    gboolean ok = g_file_set_contents(outpath,
                                      (const gchar *)out->data,
                                      (gssize)out->len,
                                      error);
    g_byte_array_unref(out);
    return ok;
}

gboolean fileio_export_word(const gchar *path, const gchar *markdown,
                            GError **error) {
    if (!docx_ensure_parent_dir(path, error))
        return FALSE;

    char *body = mdcore_to_html(markdown ? markdown : "");
    gchar *html = g_strconcat(HTML_HEAD, body ? body : "", HTML_TAIL, NULL);
    free(body);

    gsize html_len = html ? strlen(html) : 0;

    DocxZip zip = {
        g_byte_array_new(),
        g_byte_array_new(),
        0
    };

    gboolean ok =
        docx_zip_add(&zip, "[Content_Types].xml",
                     DOCX_CONTENT_TYPES, strlen(DOCX_CONTENT_TYPES), error) &&
        docx_zip_add(&zip, "_rels/.rels",
                     DOCX_ROOT_RELS, strlen(DOCX_ROOT_RELS), error) &&
        docx_zip_add(&zip, "word/document.xml",
                     DOCX_DOCUMENT_XML, strlen(DOCX_DOCUMENT_XML), error) &&
        docx_zip_add(&zip, "word/_rels/document.xml.rels",
                     DOCX_DOCUMENT_RELS, strlen(DOCX_DOCUMENT_RELS), error) &&
        docx_zip_add(&zip, "word/afchunk.htm", html, html_len, error);

    g_free(html);

    if (ok)
        ok = docx_zip_write_file(&zip, path, error);
    else if (error && !*error)
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "DOCX 패키지를 구성하지 못했습니다.");

    docx_zip_free(&zip);
    return ok;
}

/* =====================================================================
 * Raw I/O (thin wrappers around fileio_core)
 * ===================================================================== */

gchar *fileio_read_file(const gchar *path, GError **error) {
    return fileio_core_read(path, error);
}

gboolean fileio_write_file(const gchar *path,
                           const gchar *content,
                           GError **error) {
    return fileio_core_write(path, content, error);
}
