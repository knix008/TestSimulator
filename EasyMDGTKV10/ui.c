/**
 * EasyMD GTK
 * ui.c - Main window: menu bar, toolbar, outline | editor | preview, statusbar.
 *
 * Layout:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ Menu   File / Edit / Insert / View / Help                         │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │ Toolbar [H1][H2][H3] [B][I][S] [`code`][block] [link][img] [• 1.] │
 *   │         [> quote] [— hr] [▦ table]                                │
 *   ├──────────────┬───────────────────────┬───────────────────────────┤
 *   │  Outline     │       Editor          │       Live Preview        │
 *   │  (TreeView)  │     (GtkTextView)     │       (WebKit2)           │
 *   ├──────────────┴───────────────────────┴───────────────────────────┤
 *   │ Statusbar:  filename | modified flag | line count                 │
 *   └──────────────────────────────────────────────────────────────────┘
 */
#include "ui.h"

#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <string.h>

#include "editor.h"
#include "fileio.h"
#include "outline.h"
#include "preview.h"
#include "utils.h"

#define APP_NAME    "EasyMD GTK"
#define APP_VERSION "1.0.0"

/* Default and minimum sidebar widths. The sidebar is implemented as the
 * left-hand pane of a GtkPaned, so the user can drag the divider freely.
 * Toggling collapses to position 0 / restores `saved_sidebar_pos`. */
#define EASYMD_SIDEBAR_DEFAULT_WIDTH 240
#define EASYMD_SIDEBAR_MIN_VISIBLE   60

struct UIContext {
    GtkWidget    *window;
    GtkWidget    *header_bar;        /* GtkHeaderBar (title only)          */
    GtkWidget    *editor_view;       /* GtkTextView                        */
    GtkTextBuffer *editor_buffer;
    GtkWidget    *outline_view;      /* GtkTreeView                        */
    GtkWidget    *outline_paned;     /* GtkPaned (outline | inner-paned)   */
    GtkWidget    *sidebar_menu_item; /* "≡ 사이드바" first menu-bar item   */
    gboolean      sidebar_visible;
    int           saved_sidebar_pos; /* last user-chosen width when shown  */
    WebKitWebView *preview_view;     /* WebKitWebView                      */
    GtkWidget    *statusbar;
    guint         status_ctx;

    GdkPixbuf    *app_icon;          /* daemon_hammer.* (also About logo)  */

    gchar        *current_path;      /* absolute path or NULL              */
    gboolean      modified;
    guint         debounce_id;       /* g_timeout id for debounced refresh */
};

/* ------------------------------------------------------------------ */
/*  Forward declarations                                              */
/* ------------------------------------------------------------------ */
static void on_buffer_changed(GtkTextBuffer *buf, gpointer user_data);
static gboolean refresh_now(gpointer user_data);
static void update_title(UIContext *ctx);
static void set_modified(UIContext *ctx, gboolean modified);
static void status_set(UIContext *ctx, const char *msg);

/* Menu / toolbar callbacks */
static void on_new_file   (GtkWidget *w, gpointer ud);
static void on_open_file  (GtkWidget *w, gpointer ud);
static void on_save_file  (GtkWidget *w, gpointer ud);
static void on_save_as    (GtkWidget *w, gpointer ud);
static void on_quit       (GtkWidget *w, gpointer ud);
static void on_about      (GtkWidget *w, gpointer ud);

static void on_cut        (GtkWidget *w, gpointer ud);
static void on_copy       (GtkWidget *w, gpointer ud);
static void on_paste      (GtkWidget *w, gpointer ud);

/* Insert callbacks operate on ctx->editor_buffer. */
static void on_ins_h1    (GtkWidget *w, gpointer ud);
static void on_ins_h2    (GtkWidget *w, gpointer ud);
static void on_ins_h3    (GtkWidget *w, gpointer ud);
static void on_ins_h4    (GtkWidget *w, gpointer ud);
static void on_ins_h5    (GtkWidget *w, gpointer ud);
static void on_ins_h6    (GtkWidget *w, gpointer ud);
static void on_ins_bold  (GtkWidget *w, gpointer ud);
static void on_ins_italic(GtkWidget *w, gpointer ud);
static void on_ins_strike(GtkWidget *w, gpointer ud);
static void on_ins_code  (GtkWidget *w, gpointer ud);
static void on_ins_fence (GtkWidget *w, gpointer ud);
static void on_ins_link  (GtkWidget *w, gpointer ud);
static void on_ins_image (GtkWidget *w, gpointer ud);
static void on_ins_ul    (GtkWidget *w, gpointer ud);
static void on_ins_ol    (GtkWidget *w, gpointer ud);
static void on_ins_quote (GtkWidget *w, gpointer ud);
static void on_ins_hr    (GtkWidget *w, gpointer ud);
static void on_ins_table (GtkWidget *w, gpointer ud);

/* Outline navigation */
static void on_outline_row_activated(GtkTreeView       *tv,
                                     GtkTreePath       *path,
                                     GtkTreeViewColumn *col,
                                     gpointer           ud);
static void on_outline_cursor_changed(GtkTreeView *tv, gpointer ud);

/* Sidebar (outline) show/hide */
static void apply_sidebar_state    (UIContext *ctx, gboolean visible);
static void on_sidebar_toggle_item (GtkMenuItem *m, gpointer ud);

/* Window close & dirty-check */
static gboolean confirm_discard_changes(UIContext *ctx);
static gboolean on_window_delete_event(GtkWidget *w, GdkEvent *ev, gpointer ud);

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

static gchar *get_buffer_text(GtkTextBuffer *buf) {
    GtkTextIter s, e;
    gtk_text_buffer_get_bounds(buf, &s, &e);
    return gtk_text_buffer_get_text(buf, &s, &e, FALSE);
}

static void update_title(UIContext *ctx) {
    const char *fname = ctx->current_path
                        ? strrchr(ctx->current_path, '/')
                        : NULL;
    fname = fname ? fname + 1 : (ctx->current_path ? ctx->current_path : "untitled.md");

    gchar *title = g_strdup_printf("%s%s — %s",
                                   ctx->modified ? "● " : "",
                                   fname, APP_NAME);
    gtk_window_set_title(GTK_WINDOW(ctx->window), title);
    if (ctx->header_bar) {
        gtk_header_bar_set_title(GTK_HEADER_BAR(ctx->header_bar), fname);
        gtk_header_bar_set_subtitle(GTK_HEADER_BAR(ctx->header_bar),
                                    ctx->modified ? "수정됨" : "저장됨");
    }
    g_free(title);
}

static void set_modified(UIContext *ctx, gboolean modified) {
    if (ctx->modified == modified) return;
    ctx->modified = modified;
    update_title(ctx);
}

static void status_set(UIContext *ctx, const char *msg) {
    if (!ctx->statusbar) return;
    gtk_statusbar_pop(GTK_STATUSBAR(ctx->statusbar), ctx->status_ctx);
    gtk_statusbar_push(GTK_STATUSBAR(ctx->statusbar), ctx->status_ctx, msg);
}

/* ------------------------------------------------------------------ */
/*  Debounced preview / outline refresh                               */
/* ------------------------------------------------------------------ */

static gboolean refresh_now(gpointer user_data) {
    UIContext *ctx = user_data;
    ctx->debounce_id = 0;

    gchar *text = get_buffer_text(ctx->editor_buffer);

    gchar *base_uri = NULL;
    if (ctx->current_path) {
        gchar *dir = g_path_get_dirname(ctx->current_path);
        gchar *with_slash = g_strconcat(dir, "/", NULL);
        GFile *gf = g_file_new_for_path(with_slash);
        base_uri = g_file_get_uri(gf);
        g_object_unref(gf);
        g_free(with_slash);
        g_free(dir);
    }

    preview_update(ctx->preview_view, text, base_uri);
    outline_update(GTK_TREE_VIEW(ctx->outline_view), text);

    /* Status: line count */
    int lines = gtk_text_buffer_get_line_count(ctx->editor_buffer);
    int chars = gtk_text_buffer_get_char_count(ctx->editor_buffer);
    gchar *s = g_strdup_printf("줄 %d · 문자 %d%s",
                               lines, chars,
                               ctx->modified ? " · 수정됨" : "");
    status_set(ctx, s);
    g_free(s);

    g_free(text);
    g_free(base_uri);
    return G_SOURCE_REMOVE;
}

static void on_buffer_changed(GtkTextBuffer *buf, gpointer user_data) {
    (void)buf;
    UIContext *ctx = user_data;
    set_modified(ctx, TRUE);
    if (ctx->debounce_id) g_source_remove(ctx->debounce_id);
    ctx->debounce_id = g_timeout_add(180, refresh_now, ctx);
}

/* ------------------------------------------------------------------ */
/*  File operations                                                   */
/* ------------------------------------------------------------------ */

static gboolean confirm_discard_changes(UIContext *ctx) {
    if (!ctx->modified) return TRUE;

    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(ctx->window),
        GTK_DIALOG_MODAL,
        GTK_MESSAGE_QUESTION,
        GTK_BUTTONS_NONE,
        "저장하지 않은 변경사항이 있습니다.\n계속하시겠습니까?");
    gtk_dialog_add_buttons(GTK_DIALOG(dlg),
                           "취소",       GTK_RESPONSE_CANCEL,
                           "버리기",     GTK_RESPONSE_REJECT,
                           "저장",       GTK_RESPONSE_ACCEPT,
                           NULL);
    gint resp = gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);

    if (resp == GTK_RESPONSE_CANCEL || resp == GTK_RESPONSE_DELETE_EVENT) {
        return FALSE;
    }
    if (resp == GTK_RESPONSE_ACCEPT) {
        on_save_file(NULL, ctx);
        if (ctx->modified) return FALSE;     /* save was cancelled */
    }
    return TRUE;
}

static void load_path(UIContext *ctx, const char *path) {
    GError *err = NULL;
    gchar *contents = fileio_read_file(path, &err);
    if (!contents) {
        utils_log_error("열기 실패: %s", err ? err->message : "?");
        GtkWidget *m = gtk_message_dialog_new(
            GTK_WINDOW(ctx->window),
            GTK_DIALOG_MODAL,
            GTK_MESSAGE_ERROR, GTK_BUTTONS_CLOSE,
            "파일을 열 수 없습니다:\n%s", err ? err->message : path);
        gtk_dialog_run(GTK_DIALOG(m));
        gtk_widget_destroy(m);
        if (err) g_error_free(err);
        return;
    }

    g_signal_handlers_block_by_func(ctx->editor_buffer, on_buffer_changed, ctx);
    gtk_text_buffer_set_text(ctx->editor_buffer, contents, -1);
    g_signal_handlers_unblock_by_func(ctx->editor_buffer, on_buffer_changed, ctx);

    g_free(ctx->current_path);
    ctx->current_path = g_strdup(path);
    set_modified(ctx, FALSE);
    update_title(ctx);
    refresh_now(ctx);
    g_free(contents);
}

void ui_load_file(UIContext *ctx, const char *path) {
    g_return_if_fail(ctx && path);
    load_path(ctx, path);
}

static void on_new_file(GtkWidget *w, gpointer ud) {
    (void)w;
    UIContext *ctx = ud;
    if (!confirm_discard_changes(ctx)) return;

    g_signal_handlers_block_by_func(ctx->editor_buffer, on_buffer_changed, ctx);
    gtk_text_buffer_set_text(ctx->editor_buffer, "", -1);
    g_signal_handlers_unblock_by_func(ctx->editor_buffer, on_buffer_changed, ctx);

    g_free(ctx->current_path);
    ctx->current_path = NULL;
    set_modified(ctx, FALSE);
    update_title(ctx);
    refresh_now(ctx);
}

static void on_open_file(GtkWidget *w, gpointer ud) {
    (void)w;
    UIContext *ctx = ud;
    if (!confirm_discard_changes(ctx)) return;
    gchar *path = NULL;
    if (fileio_open_dialog(GTK_WINDOW(ctx->window), &path)) {
        load_path(ctx, path);
        g_free(path);
    }
}

static gboolean save_to(UIContext *ctx, const char *path) {
    GError *err = NULL;
    gchar *text = get_buffer_text(ctx->editor_buffer);
    gboolean ok = fileio_write_file(path, text, &err);
    g_free(text);
    if (!ok) {
        utils_log_error("저장 실패: %s", err ? err->message : "?");
        GtkWidget *m = gtk_message_dialog_new(
            GTK_WINDOW(ctx->window),
            GTK_DIALOG_MODAL,
            GTK_MESSAGE_ERROR, GTK_BUTTONS_CLOSE,
            "저장 실패:\n%s", err ? err->message : path);
        gtk_dialog_run(GTK_DIALOG(m));
        gtk_widget_destroy(m);
        if (err) g_error_free(err);
        return FALSE;
    }
    if (ctx->current_path != path) {
        g_free(ctx->current_path);
        ctx->current_path = g_strdup(path);
    }
    set_modified(ctx, FALSE);
    update_title(ctx);
    return TRUE;
}

static void on_save_file(GtkWidget *w, gpointer ud) {
    (void)w;
    UIContext *ctx = ud;
    if (ctx->current_path) {
        save_to(ctx, ctx->current_path);
    } else {
        on_save_as(NULL, ctx);
    }
}

static void on_save_as(GtkWidget *w, gpointer ud) {
    (void)w;
    UIContext *ctx = ud;
    gchar *path = NULL;
    if (fileio_save_dialog(GTK_WINDOW(ctx->window), ctx->current_path, &path)) {
        save_to(ctx, path);
        g_free(path);
    }
}

static void on_quit(GtkWidget *w, gpointer ud) {
    (void)w;
    UIContext *ctx = ud;
    if (!confirm_discard_changes(ctx)) return;
    gtk_main_quit();
}

static gboolean on_window_delete_event(GtkWidget *w, GdkEvent *ev, gpointer ud) {
    (void)w; (void)ev;
    UIContext *ctx = ud;
    if (!confirm_discard_changes(ctx)) return TRUE; /* block close */
    return FALSE;
}

static void on_about(GtkWidget *w, gpointer ud) {
    (void)w;
    UIContext *ctx = ud;
    GtkWidget *dlg = gtk_about_dialog_new();
    gtk_about_dialog_set_program_name(GTK_ABOUT_DIALOG(dlg), APP_NAME);
    gtk_about_dialog_set_version    (GTK_ABOUT_DIALOG(dlg), APP_VERSION);
    gtk_about_dialog_set_comments   (GTK_ABOUT_DIALOG(dlg),
        "GTK3 + WebKit2 + libcmark 기반 마크다운 편집기.\n"
        "왼쪽 문서 구조 / 가운데 편집기 / 오른쪽 실시간 미리보기.");
    gtk_about_dialog_set_license_type(GTK_ABOUT_DIALOG(dlg), GTK_LICENSE_MIT_X11);
    if (ctx->app_icon) {
        gtk_about_dialog_set_logo(GTK_ABOUT_DIALOG(dlg), ctx->app_icon);
    } else {
        gtk_about_dialog_set_logo_icon_name(GTK_ABOUT_DIALOG(dlg), "easymd");
    }
    gtk_window_set_transient_for(GTK_WINDOW(dlg), GTK_WINDOW(ctx->window));
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

/* ------------------------------------------------------------------ */
/*  Edit / Insert callbacks                                           */
/* ------------------------------------------------------------------ */

static void on_cut  (GtkWidget *w, gpointer ud) { (void)w;
    UIContext *ctx = ud;
    GtkClipboard *clip = gtk_widget_get_clipboard(GTK_WIDGET(ctx->editor_view),
                                                  GDK_SELECTION_CLIPBOARD);
    gtk_text_buffer_cut_clipboard(ctx->editor_buffer, clip, TRUE);
}
static void on_copy (GtkWidget *w, gpointer ud) { (void)w;
    UIContext *ctx = ud;
    GtkClipboard *clip = gtk_widget_get_clipboard(GTK_WIDGET(ctx->editor_view),
                                                  GDK_SELECTION_CLIPBOARD);
    gtk_text_buffer_copy_clipboard(ctx->editor_buffer, clip);
}
static void on_paste(GtkWidget *w, gpointer ud) { (void)w;
    UIContext *ctx = ud;
    GtkClipboard *clip = gtk_widget_get_clipboard(GTK_WIDGET(ctx->editor_view),
                                                  GDK_SELECTION_CLIPBOARD);
    gtk_text_buffer_paste_clipboard(ctx->editor_buffer, clip, NULL, TRUE);
}

#define INS_H(N) static void on_ins_h##N(GtkWidget *w, gpointer ud) { \
    (void)w; UIContext *ctx = ud; editor_set_heading(ctx->editor_buffer, N); \
    gtk_widget_grab_focus(GTK_WIDGET(ctx->editor_view)); }
INS_H(1) INS_H(2) INS_H(3) INS_H(4) INS_H(5) INS_H(6)
#undef INS_H

static void on_ins_bold(GtkWidget *w, gpointer ud) { (void)w;
    editor_wrap_inline(((UIContext*)ud)->editor_buffer, "**", "**", "굵게"); }
static void on_ins_italic(GtkWidget *w, gpointer ud) { (void)w;
    editor_wrap_inline(((UIContext*)ud)->editor_buffer, "*", "*", "기울임"); }
static void on_ins_strike(GtkWidget *w, gpointer ud) { (void)w;
    editor_wrap_inline(((UIContext*)ud)->editor_buffer, "~~", "~~", "취소선"); }
static void on_ins_code(GtkWidget *w, gpointer ud) { (void)w;
    editor_wrap_inline(((UIContext*)ud)->editor_buffer, "`", "`", "code"); }
static void on_ins_fence(GtkWidget *w, gpointer ud) { (void)w;
    editor_insert_code_fence(((UIContext*)ud)->editor_buffer); }
static void on_ins_link (GtkWidget *w, gpointer ud) { (void)w;
    editor_insert_link(((UIContext*)ud)->editor_buffer, FALSE); }
static void on_ins_image(GtkWidget *w, gpointer ud) { (void)w;
    editor_insert_link(((UIContext*)ud)->editor_buffer, TRUE); }
static void on_ins_ul   (GtkWidget *w, gpointer ud) { (void)w;
    editor_prefix_lines(((UIContext*)ud)->editor_buffer, "- "); }
static void on_ins_ol   (GtkWidget *w, gpointer ud) { (void)w;
    editor_numbered_list(((UIContext*)ud)->editor_buffer); }
static void on_ins_quote(GtkWidget *w, gpointer ud) { (void)w;
    editor_prefix_lines(((UIContext*)ud)->editor_buffer, "> "); }
static void on_ins_hr   (GtkWidget *w, gpointer ud) { (void)w;
    editor_insert_hr(((UIContext*)ud)->editor_buffer); }
static void on_ins_table(GtkWidget *w, gpointer ud) { (void)w;
    editor_insert_table(((UIContext*)ud)->editor_buffer, 2, 3); }

/* ------------------------------------------------------------------ */
/*  Outline -> editor navigation                                      */
/* ------------------------------------------------------------------ */

static void on_outline_row_activated(GtkTreeView       *tv,
                                     GtkTreePath       *path,
                                     GtkTreeViewColumn *col,
                                     gpointer           ud) {
    (void)col;
    UIContext *ctx = ud;
    GtkTreeIter iter;
    GtkTreeModel *m = gtk_tree_view_get_model(tv);
    if (!gtk_tree_model_get_iter(m, &iter, path)) return;
    int line = -1;
    gtk_tree_model_get(m, &iter, OUTLINE_COL_LINE, &line, -1);
    if (line <= 0) return;

    editor_goto_line(GTK_TEXT_VIEW(ctx->editor_view), line);
    preview_scroll_to_line(ctx->preview_view, line);
}

static void on_outline_cursor_changed(GtkTreeView *tv, gpointer ud) {
    UIContext *ctx = ud;
    GtkTreePath *path = NULL;
    GtkTreeViewColumn *focus_col = NULL;
    gtk_tree_view_get_cursor(tv, &path, &focus_col);
    (void)focus_col;
    if (!path) return;

    GtkTreeModel *m = gtk_tree_view_get_model(tv);
    GtkTreeIter iter;
    if (gtk_tree_model_get_iter(m, &iter, path)) {
        int line = -1;
        gtk_tree_model_get(m, &iter, OUTLINE_COL_LINE, &line, -1);
        if (line > 0) {
            editor_goto_line(GTK_TEXT_VIEW(ctx->editor_view), line);
            preview_scroll_to_line(ctx->preview_view, line);
        }
    }
    gtk_tree_path_free(path);
}

/* ------------------------------------------------------------------ */
/*  Sidebar (outline) show / hide                                     */
/* ------------------------------------------------------------------ */

/* Position-based show/hide: the sidebar is the left-hand pane of a
 * GtkPaned, which is freely drag-resizable when shown. Hiding sets the
 * divider to 0; showing restores the previous user-chosen width. */
static void apply_sidebar_state(UIContext *ctx, gboolean visible) {
    if (!ctx || !ctx->outline_paned) return;
    if (ctx->sidebar_visible == visible) return;

    GtkPaned *paned = GTK_PANED(ctx->outline_paned);

    if (!visible) {
        /* Remember the user's current width before collapsing. */
        int cur = gtk_paned_get_position(paned);
        if (cur >= EASYMD_SIDEBAR_MIN_VISIBLE) {
            ctx->saved_sidebar_pos = cur;
        }
        gtk_paned_set_position(paned, 0);
    } else {
        int target = ctx->saved_sidebar_pos > 0
                     ? ctx->saved_sidebar_pos
                     : EASYMD_SIDEBAR_DEFAULT_WIDTH;
        gtk_paned_set_position(paned, target);
    }
    ctx->sidebar_visible = visible;
}

/* Activate handler for the first menu-bar item (sidebar icon only). */
static void on_sidebar_toggle_item(GtkMenuItem *m, gpointer ud) {
    (void)m;
    UIContext *ctx = ud;
    apply_sidebar_state(ctx, !ctx->sidebar_visible);
}

/* ------------------------------------------------------------------ */
/*  Menu / toolbar construction                                       */
/* ------------------------------------------------------------------ */

/* Top-level menubar entry: small icon + mnemonic label (no accelerator). */
static GtkWidget *menu_bar_item_icon(const char *icon_name,
                                     const char *mnemonic_label) {
    GtkWidget *m = gtk_menu_item_new();
    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    GtkWidget *img = gtk_image_new_from_icon_name(icon_name,
                                                  GTK_ICON_SIZE_MENU);
    gtk_box_pack_start(GTK_BOX(box), img, FALSE, FALSE, 0);
    GtkWidget *lbl = gtk_label_new_with_mnemonic(mnemonic_label);
    gtk_box_pack_start(GTK_BOX(box), lbl, FALSE, FALSE, 0);
    gtk_container_add(GTK_CONTAINER(m), box);
    return m;
}

/* Menu item with optional themed icon (symbolic, GTK_ICON_SIZE_MENU).
 * icon_name == NULL keeps the classic text-only row (mnemonic preserved). */
static GtkWidget *mi_icon(const char *icon_name,
                          const char *label,
                          const char *accel,
                          GCallback cb,
                          gpointer ud,
                          GtkAccelGroup *ag) {
    GtkWidget *m = gtk_menu_item_new();

    if (!icon_name || !icon_name[0]) {
        GtkWidget *lbl = gtk_label_new_with_mnemonic(label);
        gtk_container_add(GTK_CONTAINER(m), lbl);
    } else {
        GtkWidget *box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
        gtk_widget_set_margin_start(box, 4);
        gtk_widget_set_margin_end(box, 4);
        GtkWidget *img = gtk_image_new_from_icon_name(icon_name,
                                                      GTK_ICON_SIZE_MENU);
        gtk_box_pack_start(GTK_BOX(box), img, FALSE, FALSE, 0);
        GtkWidget *lbl = gtk_label_new_with_mnemonic(label);
        gtk_box_pack_start(GTK_BOX(box), lbl, FALSE, FALSE, 0);
        gtk_container_add(GTK_CONTAINER(m), box);
    }

    if (cb) g_signal_connect(m, "activate", cb, ud);
    if (accel && ag) {
        guint key; GdkModifierType mods;
        gtk_accelerator_parse(accel, &key, &mods);
        if (key) gtk_widget_add_accelerator(m, "activate", ag, key, mods,
                                            GTK_ACCEL_VISIBLE);
    }
    return m;
}

static GtkWidget *build_menu_bar(UIContext *ctx, GtkAccelGroup *ag) {
    GtkWidget *bar = gtk_menu_bar_new();

    /* --- Sidebar toggle (first item, icon only, no text label) ---
     * Single themed icon; meaning is in the tooltip + F9 accelerator. */
    GtkWidget *sidebar_mi = gtk_menu_item_new();
    GtkWidget *simg = gtk_image_new_from_icon_name("view-list-symbolic",
                                                     GTK_ICON_SIZE_MENU);
    gtk_widget_set_margin_start(simg, 4);
    gtk_widget_set_margin_end(simg, 4);
    gtk_container_add(GTK_CONTAINER(sidebar_mi), simg);
    gtk_widget_set_tooltip_text(sidebar_mi,
        "문서 구조 사이드바 표시 / 숨김 (F9)");
    g_signal_connect(sidebar_mi, "activate",
                     G_CALLBACK(on_sidebar_toggle_item), ctx);
    gtk_widget_add_accelerator(sidebar_mi, "activate", ag,
                               GDK_KEY_F9, 0, GTK_ACCEL_VISIBLE);
    gtk_menu_shell_append(GTK_MENU_SHELL(bar), sidebar_mi);
    ctx->sidebar_menu_item = sidebar_mi;

    /* --- File --- */
    GtkWidget *file = menu_bar_item_icon("folder-symbolic", "파일(_F)");
    GtkWidget *file_menu = gtk_menu_new();
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(file), file_menu);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu),
        mi_icon("document-new-symbolic",
                "새로 만들기(_N)", "<Control>n",
                G_CALLBACK(on_new_file), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu),
        mi_icon("document-open-symbolic",
                "열기(_O)…", "<Control>o",
                G_CALLBACK(on_open_file), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu),
        mi_icon("document-save-symbolic",
                "저장(_S)", "<Control>s",
                G_CALLBACK(on_save_file), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu),
        mi_icon("document-save-as-symbolic",
                "다른 이름으로 저장(_A)…", "<Control><Shift>s",
                G_CALLBACK(on_save_as), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu),
        mi_icon("application-exit-symbolic",
                "종료(_Q)", "<Control>q",
                G_CALLBACK(on_quit), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(bar), file);

    /* --- Edit --- */
    GtkWidget *edit = menu_bar_item_icon("document-edit-symbolic", "편집(_E)");
    GtkWidget *edit_menu = gtk_menu_new();
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(edit), edit_menu);
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu),
        mi_icon("edit-cut-symbolic",
                "잘라내기(_T)", "<Control>x", G_CALLBACK(on_cut), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu),
        mi_icon("edit-copy-symbolic",
                "복사(_C)", "<Control>c", G_CALLBACK(on_copy), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(edit_menu),
        mi_icon("edit-paste-symbolic",
                "붙여넣기(_P)", "<Control>v", G_CALLBACK(on_paste), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(bar), edit);

    /* --- Insert (Markdown) --- */
    GtkWidget *ins = menu_bar_item_icon("insert-object-symbolic", "삽입(_I)");
    GtkWidget *ins_menu = gtk_menu_new();
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(ins), ins_menu);

    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("starred-symbolic",
                "제목 1 (#)", "<Control>1", G_CALLBACK(on_ins_h1), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("emblem-documents-symbolic",
                "제목 2 (##)", "<Control>2", G_CALLBACK(on_ins_h2), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("view-list-symbolic",
                "제목 3 (###)", "<Control>3", G_CALLBACK(on_ins_h3), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("go-next-symbolic",
                "제목 4 (####)", "<Control>4", G_CALLBACK(on_ins_h4), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("go-next-symbolic",
                "제목 5 (#####)", "<Control>5", G_CALLBACK(on_ins_h5), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("go-next-symbolic",
                "제목 6 (######)", "<Control>6", G_CALLBACK(on_ins_h6), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("format-text-bold-symbolic",
                "굵게 **", "<Control>b", G_CALLBACK(on_ins_bold), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("format-text-italic-symbolic",
                "기울임 *", "<Control>i", G_CALLBACK(on_ins_italic), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("format-text-strikethrough-symbolic",
                "취소선 ~~", "<Control>d", G_CALLBACK(on_ins_strike), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("accessories-text-editor-symbolic",
                "인라인 코드 `","<Control>e", G_CALLBACK(on_ins_code),  ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("applications-development-symbolic",
                "코드 블록 ```", NULL, G_CALLBACK(on_ins_fence), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("insert-link-symbolic",
                "링크 [](url)", "<Control>k", G_CALLBACK(on_ins_link), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("insert-image-symbolic",
                "이미지 ![](url)", NULL, G_CALLBACK(on_ins_image), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("view-list-symbolic",
                "글머리 기호 -", NULL, G_CALLBACK(on_ins_ul), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("view-sort-ascending-symbolic",
                "번호 매기기 1.", NULL, G_CALLBACK(on_ins_ol), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("format-indent-more-symbolic",
                "인용 >", NULL, G_CALLBACK(on_ins_quote), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("format-justify-fill-symbolic",
                "수평선 ---", NULL, G_CALLBACK(on_ins_hr), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(ins_menu),
        mi_icon("view-grid-symbolic",
                "표 (2x3)", NULL, G_CALLBACK(on_ins_table), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(bar), ins);

    /* --- Help --- */
    GtkWidget *help = menu_bar_item_icon("help-browser-symbolic", "도움말(_H)");
    GtkWidget *help_menu = gtk_menu_new();
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(help), help_menu);
    gtk_menu_shell_append(GTK_MENU_SHELL(help_menu),
        mi_icon("help-about-symbolic",
                "정보(_A)", "F1", G_CALLBACK(on_about), ctx, ag));
    gtk_menu_shell_append(GTK_MENU_SHELL(bar), help);

    return bar;
}

/* Build a flat GtkButton with [icon][label] always visible.
 * Using a plain GtkBox + GtkButton (instead of GtkToolbar/GtkToolButton)
 * bypasses the desktop's `gtk-toolbar-style` preference, which can hide
 * labels even after gtk_toolbar_set_style(BOTH_HORIZ). */
static GtkWidget *make_md_button(const char *icon_name,
                                 const char *label,
                                 const char *tip,
                                 GCallback   cb,
                                 gpointer    ud) {
    GtkWidget *btn = gtk_button_new();
    gtk_button_set_relief(GTK_BUTTON(btn), GTK_RELIEF_NONE);
    gtk_widget_set_focus_on_click(btn, FALSE);
    gtk_widget_set_tooltip_text(btn, tip);

    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_widget_set_margin_start(box, 4);
    gtk_widget_set_margin_end(box, 4);

    if (icon_name && icon_name[0]) {
        GtkWidget *img = gtk_image_new_from_icon_name(
            icon_name, GTK_ICON_SIZE_SMALL_TOOLBAR);
        gtk_box_pack_start(GTK_BOX(box), img, FALSE, FALSE, 0);
    }
    GtkWidget *lbl = gtk_label_new(label);
    gtk_box_pack_start(GTK_BOX(box), lbl, FALSE, FALSE, 0);

    gtk_container_add(GTK_CONTAINER(btn), box);
    g_signal_connect(btn, "clicked", cb, ud);
    return btn;
}

/* Build a markdown insertion toolbar using a horizontal GtkBox.
 *
 * Each button shows: [icon] + label  (always — independent of GTK's
 * `gtk-toolbar-style` setting). Icons match the Insert menu and the
 * outline panel so H1/H2/H3 visually align with the document tree. */
static GtkWidget *build_toolbar(UIContext *ctx) {
    GtkWidget *bar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 2);
    gtk_widget_set_margin_top(bar, 2);
    gtk_widget_set_margin_bottom(bar, 2);
    gtk_widget_set_margin_start(bar, 4);
    gtk_widget_set_margin_end(bar, 4);

#define ADD_BTN(ICON, LABEL, TIP, CB)                               \
    gtk_box_pack_start(GTK_BOX(bar),                                \
        make_md_button((ICON), (LABEL), (TIP),                      \
                       G_CALLBACK(CB), ctx),                        \
        FALSE, FALSE, 0)

#define ADD_SEP()                                                   \
    do {                                                            \
        GtkWidget *sep = gtk_separator_new(GTK_ORIENTATION_VERTICAL); \
        gtk_widget_set_margin_start(sep, 4);                        \
        gtk_widget_set_margin_end(sep, 4);                          \
        gtk_box_pack_start(GTK_BOX(bar), sep, FALSE, FALSE, 0);     \
    } while (0)

    /* Headings — same icon family as the outline panel (★ / 📄 / ▤). */
    ADD_BTN("starred-symbolic",            "H1", "제목 1 (Ctrl+1)", on_ins_h1);
    ADD_BTN("emblem-documents-symbolic",   "H2", "제목 2 (Ctrl+2)", on_ins_h2);
    ADD_BTN("view-list-symbolic",          "H3", "제목 3 (Ctrl+3)", on_ins_h3);
    ADD_SEP();
    /* Inline emphasis. */
    ADD_BTN("format-text-bold-symbolic",          "Bold",   "굵게 (Ctrl+B)",   on_ins_bold);
    ADD_BTN("format-text-italic-symbolic",        "Italic", "기울임 (Ctrl+I)", on_ins_italic);
    ADD_BTN("format-text-strikethrough-symbolic", "Strike", "취소선 (Ctrl+D)", on_ins_strike);
    ADD_SEP();
    /* Code. */
    ADD_BTN("accessories-text-editor-symbolic", "Code",  "인라인 코드 (Ctrl+E)", on_ins_code);
    ADD_BTN("applications-development-symbolic","Block", "코드 블록",            on_ins_fence);
    ADD_SEP();
    /* Link / image. */
    ADD_BTN("insert-link-symbolic",  "Link",  "링크 (Ctrl+K)", on_ins_link);
    ADD_BTN("insert-image-symbolic", "Image", "이미지",         on_ins_image);
    ADD_SEP();
    /* Block-level formatting. */
    ADD_BTN("view-list-symbolic",             "List",     "글머리 기호", on_ins_ul);
    ADD_BTN("view-sort-ascending-symbolic",   "Numbered", "번호 매기기", on_ins_ol);
    ADD_BTN("format-indent-more-symbolic",    "Quote",    "인용",        on_ins_quote);
    ADD_BTN("format-justify-fill-symbolic",   "HR",       "수평선",      on_ins_hr);
    ADD_BTN("view-grid-symbolic",             "Table",    "표 (2x3)",    on_ins_table);

#undef ADD_BTN
#undef ADD_SEP

    return bar;
}

/* ------------------------------------------------------------------ */
/*  Main UI assembly                                                  */
/* ------------------------------------------------------------------ */

static const char *INITIAL_DOC =
    "# EasyMD GTK\n"
    "\n"
    "GTK3 기반의 간단한 **마크다운 편집기**입니다.\n"
    "\n"
    "## 사용 방법\n"
    "\n"
    "1. 왼쪽: 문서의 **목차/구조**가 표시됩니다 (제목을 더블클릭하면 이동).\n"
    "2. 가운데: 마크다운 본문을 *편집*합니다.\n"
    "3. 오른쪽: `cmark + WebKit2`로 실시간 미리보기가 갱신됩니다.\n"
    "\n"
    "### 단축키\n"
    "\n"
    "- `Ctrl+B` 굵게, `Ctrl+I` 기울임, `Ctrl+E` 인라인 코드\n"
    "- `Ctrl+1`..`Ctrl+6` 제목 수준\n"
    "- `Ctrl+K` 링크 삽입\n"
    "- `Ctrl+S` 저장 / `Ctrl+O` 열기\n"
    "\n"
    "> 팁: 상단 **삽입 메뉴** 또는 툴바 버튼만으로도 모든 기호를 마우스로 입력할 수 있습니다.\n"
    "\n"
    "```\necho \"행복한 마크다운 편집!\"\n```\n";

/* ------------------------------------------------------------------ */
/*  App icon (daemon_hammer.*)                                         */
/* ------------------------------------------------------------------ */
/* Try a list of plausible locations for the app icon and return the
 * first GdkPixbuf that loads successfully. The caller becomes the owner
 * (ref) and must g_object_unref() when done.
 *
 * Search order:
 *   1) Same directory as the executable (so running from a build dir works)
 *   2) Current working directory
 *   3) "<prefix>/share/icons/hicolor/256x256/apps/easymd.{ico,png,jpg}"
 *      where <prefix> is derived from the executable path (../share)
 *   4) ~/.local/share/icons/hicolor/256x256/apps/easymd.{ico,png,jpg}
 */
static GdkPixbuf *easymd_load_app_icon(const char *argv0) {
    gchar *resolved_exe = argv0 ? g_find_program_in_path(argv0) : NULL;
    gchar *exe_dir = g_path_get_dirname(resolved_exe ? resolved_exe : (argv0 ? argv0 : "."));
    gchar *exe_parent = g_path_get_dirname(exe_dir);

    const gchar *home = g_get_home_dir();

    GPtrArray *paths = g_ptr_array_new_with_free_func(g_free);

    /* 1) Beside the executable. */
    g_ptr_array_add(paths, g_build_filename(exe_dir, "daemon_hammer.ico", NULL));
    g_ptr_array_add(paths, g_build_filename(exe_dir, "daemon_hammer.png", NULL));
    g_ptr_array_add(paths, g_build_filename(exe_dir, "daemon_hammer.jpg", NULL));

    /* 2) Current working directory (matches "make run" / dev workflow). */
    g_ptr_array_add(paths, g_strdup("daemon_hammer.ico"));
    g_ptr_array_add(paths, g_strdup("daemon_hammer.png"));
    g_ptr_array_add(paths, g_strdup("daemon_hammer.jpg"));

    /* 3) Sibling share/ tree (handles `make install` style layouts). */
    if (exe_parent) {
        g_ptr_array_add(paths, g_build_filename(exe_parent, "share", "icons",
                                                "hicolor", "256x256", "apps",
                                                "easymd.ico", NULL));
        g_ptr_array_add(paths, g_build_filename(exe_parent, "share", "icons",
                                                "hicolor", "256x256", "apps",
                                                "easymd.png", NULL));
    }

    /* 4) User-local install (where `make install-desktop` puts it). */
    if (home) {
        g_ptr_array_add(paths, g_build_filename(home, ".local", "share",
                                                "icons", "hicolor", "256x256",
                                                "apps", "easymd.ico", NULL));
        g_ptr_array_add(paths, g_build_filename(home, ".local", "share",
                                                "icons", "hicolor", "256x256",
                                                "apps", "easymd.png", NULL));
    }

    GdkPixbuf *icon = NULL;
    for (guint i = 0; i < paths->len && !icon; i++) {
        const gchar *p = g_ptr_array_index(paths, i);
        if (!g_file_test(p, G_FILE_TEST_EXISTS)) continue;
        GError *err = NULL;
        icon = gdk_pixbuf_new_from_file(p, &err);
        if (icon) {
            /* utils_log_info("App icon loaded from: %s", p); */
        } else if (err) {
            utils_log_info("App icon at %s failed to load: %s", p, err->message);
            g_error_free(err);
        }
    }

    if (!icon) {
        utils_log_info("App icon not found; falling back to themed name 'easymd'");
    }

    g_ptr_array_free(paths, TRUE);
    g_free(exe_parent);
    g_free(exe_dir);
    g_free(resolved_exe);
    return icon;
}

UIContext *ui_init(int argc, char **argv) {
    /* Set program/class name BEFORE gtk_init so window manager / Wayland
     * compositor can match this process to the .desktop entry and use
     * the icon installed by `make install-desktop`. */
    g_set_prgname("easymd");
    gdk_set_program_class("easymd");

    gtk_init(&argc, &argv);

    UIContext *ctx = g_new0(UIContext, 1);

    /* --- Window + header bar --- */
    ctx->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_default_size(GTK_WINDOW(ctx->window), 1280, 800);
    gtk_window_set_position(GTK_WINDOW(ctx->window), GTK_WIN_POS_CENTER);

    /* App icon (taskbar, alt-tab, window decoration).
     * Set the themed name first as a fallback (works once the icon is
     * installed via `make install-desktop`), then try to load the bundled
     * daemon_hammer.* file for an immediate visual even before install. */
    gtk_window_set_icon_name(GTK_WINDOW(ctx->window), "easymd");
    gtk_window_set_default_icon_name("easymd");

    ctx->app_icon = easymd_load_app_icon(argc > 0 ? argv[0] : NULL);
    if (ctx->app_icon) {
        gtk_window_set_default_icon(ctx->app_icon);
        gtk_window_set_icon(GTK_WINDOW(ctx->window), ctx->app_icon);
    }

    ctx->header_bar = gtk_header_bar_new();
    gtk_header_bar_set_show_close_button(GTK_HEADER_BAR(ctx->header_bar), TRUE);
    gtk_header_bar_set_title(GTK_HEADER_BAR(ctx->header_bar), "untitled.md");
    gtk_header_bar_set_subtitle(GTK_HEADER_BAR(ctx->header_bar), APP_NAME);
    gtk_window_set_titlebar(GTK_WINDOW(ctx->window), ctx->header_bar);

    GtkAccelGroup *ag = gtk_accel_group_new();
    gtk_window_add_accel_group(GTK_WINDOW(ctx->window), ag);

    /* --- Vertical container --- */
    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(ctx->window), vbox);

    /* Menu bar */
    GtkWidget *menu_bar = build_menu_bar(ctx, ag);
    gtk_box_pack_start(GTK_BOX(vbox), menu_bar, FALSE, FALSE, 0);

    /* Toolbar */
    GtkWidget *toolbar = build_toolbar(ctx);
    gtk_box_pack_start(GTK_BOX(vbox), toolbar, FALSE, FALSE, 0);

    /* --- Editor --- */
    ctx->editor_view   = gtk_text_view_new();
    ctx->editor_buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(ctx->editor_view));
    gtk_text_view_set_monospace(GTK_TEXT_VIEW(ctx->editor_view), TRUE);
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(ctx->editor_view), GTK_WRAP_WORD_CHAR);
    gtk_text_view_set_left_margin(GTK_TEXT_VIEW(ctx->editor_view), 12);
    gtk_text_view_set_right_margin(GTK_TEXT_VIEW(ctx->editor_view), 12);
    gtk_text_view_set_top_margin(GTK_TEXT_VIEW(ctx->editor_view), 8);
    gtk_text_view_set_bottom_margin(GTK_TEXT_VIEW(ctx->editor_view), 8);

    GtkWidget *editor_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(editor_scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(editor_scroll), ctx->editor_view);

    /* --- Outline (left, in a resizable sidebar) --- */
    ctx->outline_view = gtk_tree_view_new();
    outline_init(GTK_TREE_VIEW(ctx->outline_view));
    g_signal_connect(ctx->outline_view, "row-activated",
                     G_CALLBACK(on_outline_row_activated), ctx);
    g_signal_connect(ctx->outline_view, "cursor-changed",
                     G_CALLBACK(on_outline_cursor_changed), ctx);

    GtkWidget *outline_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(outline_scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(outline_scroll), ctx->outline_view);
    /* Allow the sidebar to shrink to 0 width when the user collapses it
     * via the "≡ 사이드바" menu item. */
    gtk_widget_set_size_request(outline_scroll, 0, -1);

    /* --- Preview (right) --- */
    ctx->preview_view = WEBKIT_WEB_VIEW(webkit_web_view_new());
    preview_init(ctx->preview_view);

    /* --- Inner paned: editor | preview (drag-to-resize) --- */
    GtkWidget *inner = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_paned_pack1(GTK_PANED(inner), editor_scroll,                TRUE, FALSE);
    gtk_paned_pack2(GTK_PANED(inner), GTK_WIDGET(ctx->preview_view), TRUE, FALSE);
    gtk_paned_set_position(GTK_PANED(inner), 600);

    /* --- Outer paned: [sidebar] | [inner paned] (drag-to-resize) ---
     * pack1 uses shrink=TRUE so the divider can travel to position 0,
     * which is how we collapse the sidebar via the menu toggle. */
    ctx->outline_paned = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_paned_pack1(GTK_PANED(ctx->outline_paned), outline_scroll, FALSE, TRUE);
    gtk_paned_pack2(GTK_PANED(ctx->outline_paned), inner,          TRUE,  FALSE);
    gtk_paned_set_position(GTK_PANED(ctx->outline_paned),
                           EASYMD_SIDEBAR_DEFAULT_WIDTH);
    gtk_paned_set_wide_handle(GTK_PANED(ctx->outline_paned), TRUE);

    ctx->sidebar_visible    = TRUE;
    ctx->saved_sidebar_pos  = EASYMD_SIDEBAR_DEFAULT_WIDTH;

    gtk_box_pack_start(GTK_BOX(vbox), ctx->outline_paned, TRUE, TRUE, 0);

    /* --- Statusbar --- */
    ctx->statusbar = gtk_statusbar_new();
    ctx->status_ctx = gtk_statusbar_get_context_id(
        GTK_STATUSBAR(ctx->statusbar), "main");
    gtk_box_pack_start(GTK_BOX(vbox), ctx->statusbar, FALSE, FALSE, 0);

    /* Initial document so the user sees a working preview/outline. */
    gtk_text_buffer_set_text(ctx->editor_buffer, INITIAL_DOC, -1);

    g_signal_connect(ctx->editor_buffer, "changed",
                     G_CALLBACK(on_buffer_changed), ctx);
    g_signal_connect(ctx->window, "delete-event",
                     G_CALLBACK(on_window_delete_event), ctx);
    g_signal_connect(ctx->window, "destroy",
                     G_CALLBACK(gtk_main_quit), NULL);

    set_modified(ctx, FALSE);
    update_title(ctx);
    return ctx;
}

void ui_show(UIContext *ctx) {
    if (!ctx) return;
    gtk_widget_show_all(ctx->window);
    /* First refresh after the window has a size. */
    refresh_now(ctx);
}

void ui_run(UIContext *ctx) {
    (void)ctx;
    gtk_main();
}

void ui_cleanup(UIContext *ctx) {
    if (!ctx) return;
    if (ctx->debounce_id) {
        g_source_remove(ctx->debounce_id);
        ctx->debounce_id = 0;
    }
    g_clear_object(&ctx->app_icon);
    g_free(ctx->current_path);
    g_free(ctx);
}
