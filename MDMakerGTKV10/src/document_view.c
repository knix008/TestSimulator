#include "document_view.h"
#include "markdown_converter.h"
#include "docx_writer.h"

#include <webkit2/webkit2.h>
#include <stdio.h>
#include <string.h>
#include <glib/gstdio.h>

/* ── private state ─────────────────────────────────────────────────── */
typedef struct {
    GtkWidget    *window;
    GtkWidget    *text_view;
    GtkTextBuffer *buffer;
    GtkWidget    *web_view;
    GtkWidget    *tree_view;  /* outline */
    GtkTreeStore *outline_store;
    GtkWidget    *notebook;
    GtkWidget    *status_bar;
    GtkWidget    *progress_bar;
    guint         progress_pulse_id;
    gulong        load_progress_handler_id;
    GtkWidget    *btn_save;

    char         *file_path;  /* NULL = preview only */
    AppSettings  *settings;
    gboolean      is_dirty;

    guint         outline_timer_id;
    gulong        outline_signal_id;   /* cursor-changed handler ID for blocking */
    int           last_outline_index;  /* -1 = none; scroll target for preview */
    gboolean      preview_needs_update;
    char         *cached_preview_html;
    guint         preview_cache_generation;
    guint         preview_cache_ready_gen;
    gboolean      preview_web_loaded;

    char         *pending_pdf_path;    /* PDF export after WebKit load */
    char         *last_pdf_path;       /* path written on last PDF export */
    WebKitPrintOperation *pdf_print_op;
} DocView;

enum { OUTLINE_COL_TEXT = 0, OUTLINE_COL_INDEX, OUTLINE_COL_LINE, OUTLINE_N_COLS };

/* ── helpers ───────────────────────────────────────────────────────── */
static void set_status(DocView *dv, const char *msg)
{
    guint ctx = gtk_statusbar_get_context_id(GTK_STATUSBAR(dv->status_bar), "info");
    gtk_statusbar_pop(GTK_STATUSBAR(dv->status_bar), ctx);
    gtk_statusbar_push(GTK_STATUSBAR(dv->status_bar), ctx, msg);
}

static gboolean progress_pulse_cb(gpointer data)
{
    gtk_progress_bar_pulse(GTK_PROGRESS_BAR(data));
    return G_SOURCE_CONTINUE;
}

static void progress_stop_pulse(DocView *dv)
{
    if (dv->progress_pulse_id) {
        g_source_remove(dv->progress_pulse_id);
        dv->progress_pulse_id = 0;
    }
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(dv->progress_bar), 0.0);
}

static void progress_show(DocView *dv, const char *msg, double fraction)
{
    progress_stop_pulse(dv);
    gtk_widget_show(dv->progress_bar);
    if (fraction < 0.0) {
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(dv->progress_bar), 0.0);
        dv->progress_pulse_id = g_timeout_add(80, progress_pulse_cb, dv->progress_bar);
    } else {
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(dv->progress_bar), fraction);
    }
    if (msg) set_status(dv, msg);
}

static void progress_set(DocView *dv, double fraction, const char *msg)
{
    progress_stop_pulse(dv);
    gtk_widget_show(dv->progress_bar);
    if (fraction < 0.0) fraction = 0.0;
    if (fraction > 1.0) fraction = 1.0;
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(dv->progress_bar),
        fraction);
    if (msg) set_status(dv, msg);
}

static void progress_hide(DocView *dv)
{
    progress_stop_pulse(dv);
    gtk_widget_hide(dv->progress_bar);
}

static void progress_disconnect_load(DocView *dv)
{
    if (dv->load_progress_handler_id) {
        g_signal_handler_disconnect(dv->web_view, dv->load_progress_handler_id);
        dv->load_progress_handler_id = 0;
    }
}

static void update_title(DocView *dv)
{
    const char *base = dv->file_path ? g_path_get_basename(dv->file_path) : "미리보기";
    char *title = g_strdup_printf("%s%s — MD Maker", base, dv->is_dirty ? " *" : "");
    gtk_window_set_title(GTK_WINDOW(dv->window), title);
    g_free(title);
}

#define WRITE_CHUNK_SIZE (64 * 1024)

typedef struct {
    DocView *dv;
    char    *path;
    char    *data;
    gsize    len;
    gsize    written;
    FILE    *fp;
    gboolean failed;
    gboolean update_dirty;
    double   frac_lo;
    double   frac_hi;
    const char *msg_progress;
    const char *msg_done;
    const char *msg_fail;
} WriteJob;

static void write_job_finish(WriteJob *job, gboolean ok)
{
    DocView *dv = job->dv;
    if (ok) {
        if (job->update_dirty) {
            dv->is_dirty = FALSE;
            update_title(dv);
            gtk_widget_set_sensitive(dv->btn_save, FALSE);
        }
        progress_set(dv, 1.0, job->msg_done);
    } else {
        GtkWidget *d = gtk_message_dialog_new(GTK_WINDOW(dv->window),
            GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
            "%s", job->msg_fail);
        gtk_dialog_run(GTK_DIALOG(d));
        gtk_widget_destroy(d);
        set_status(dv, job->msg_fail);
    }
    progress_hide(dv);
    g_free(job->data);
    g_free(job->path);
    g_free(job);
}

static gboolean write_idle_cb(gpointer data)
{
    WriteJob *job = data;
    gsize chunk = MIN(WRITE_CHUNK_SIZE, job->len - job->written);

    if (chunk > 0) {
        if (fwrite(job->data + job->written, 1, chunk, job->fp) != chunk)
            job->failed = TRUE;
        else
            job->written += chunk;
    }

    if (!job->failed && job->written < job->len) {
        double frac = (double)job->written / (double)job->len;
        progress_set(job->dv,
            job->frac_lo + (job->frac_hi - job->frac_lo) * frac,
            job->msg_progress);
        return G_SOURCE_CONTINUE;
    }

    if (!job->failed)
        job->failed = (fclose(job->fp) != 0);
    else
        fclose(job->fp);

    write_job_finish(job, !job->failed);
    return G_SOURCE_REMOVE;
}

static void write_start_async(DocView *dv, const char *path, char *data,
                              const char *msg_progress, const char *msg_done,
                              const char *msg_fail, gboolean update_dirty,
                              double frac_lo, double frac_hi)
{
    WriteJob *job = g_new0(WriteJob, 1);
    job->dv            = dv;
    job->path          = g_strdup(path);
    job->data          = data;
    job->len           = strlen(data);
    job->update_dirty  = update_dirty;
    job->frac_lo       = frac_lo;
    job->frac_hi       = frac_hi;
    job->msg_progress  = msg_progress;
    job->msg_done      = msg_done;
    job->msg_fail      = msg_fail;

    progress_set(dv, frac_lo, msg_progress);

    job->fp = fopen(path, "wb");
    if (!job->fp) {
        write_job_finish(job, FALSE);
        return;
    }

    if (job->len == 0) {
        if (fclose(job->fp) != 0)
            write_job_finish(job, FALSE);
        else
            write_job_finish(job, TRUE);
        return;
    }

    g_idle_add(write_idle_cb, job);
}

static void save_start_async(DocView *dv, const char *path, char *text)
{
    progress_show(dv, "저장 중…", 0.0);
    write_start_async(dv, path, text,
        "저장 중…", "저장 완료", "저장 실패",
        TRUE, 0.0, 1.0);
}

typedef struct {
    DocView *dv;
    char    *path;
    char    *md;
} HtmlExportJob;

static gboolean html_export_idle(gpointer data)
{
    HtmlExportJob *job = data;
    progress_set(job->dv, 0.2, "HTML 변환 중…");
    char *html = markdown_to_html(job->md, job->dv->settings);
    g_free(job->md);
    write_start_async(job->dv, job->path, html,
        "HTML 저장 중…", "HTML보내기 완료", "HTML보내기 실패",
        FALSE, 0.5, 1.0);
    g_free(job->path);
    g_free(job);
    return G_SOURCE_REMOVE;
}

static void html_export_start(DocView *dv, const char *path, char *md)
{
    HtmlExportJob *job = g_new(HtmlExportJob, 1);
    job->dv   = dv;
    job->path = g_strdup(path);
    job->md   = md;
    progress_show(dv, "HTML보내기 중…", 0.05);
    g_idle_add(html_export_idle, job);
}

typedef struct {
    DocView *dv;
    char    *path;
    char    *md;
    gboolean ok;
    GError  *err;
} WordExportJob;

static gboolean word_export_done_idle(gpointer data)
{
    WordExportJob *job = data;
    DocView *dv = job->dv;

    if (job->ok) {
        progress_set(dv, 1.0, "Word보내기 완료");
    } else {
        GtkWidget *d = gtk_message_dialog_new(GTK_WINDOW(dv->window),
            GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
            "Word보내기 실패:\n%s",
            job->err ? job->err->message : "알 수 없는 오류");
        gtk_dialog_run(GTK_DIALOG(d));
        gtk_widget_destroy(d);
        set_status(dv, "Word보내기 실패");
    }
    progress_hide(dv);
    g_free(job->md);
    g_free(job->path);
    g_clear_error(&job->err);
    g_free(job);
    return G_SOURCE_REMOVE;
}

static gpointer word_export_thread(gpointer data)
{
    WordExportJob *job = data;
    job->ok = docx_write(job->md, job->path, job->dv->settings, &job->err);
    g_idle_add(word_export_done_idle, job);
    return NULL;
}

static void word_export_start(DocView *dv, const char *path, char *md)
{
    WordExportJob *job = g_new(WordExportJob, 1);
    job->dv   = dv;
    job->path = g_strdup(path);
    job->md   = md;
    progress_show(dv, "Word보내기 중…", -1.0);
    g_thread_new("word-export", word_export_thread, job);
}

typedef struct {
    DocView *dv;
    char    *md;
    guint    generation;
    char    *html;
} PreviewCacheJob;

static gboolean deferred_preview_scroll(gpointer data);
static gboolean deferred_preview_scroll_late(gpointer data);

static gboolean preview_tab_is_visible(DocView *dv)
{
    return gtk_notebook_get_current_page(GTK_NOTEBOOK(dv->notebook)) == 0;
}

static gboolean preview_cache_is_fresh(DocView *dv)
{
    return dv->cached_preview_html
        && dv->preview_cache_ready_gen == dv->preview_cache_generation
        && !dv->preview_needs_update;
}

static char *buffer_get_md_copy(DocView *dv)
{
    GtkTextIter start, end;
    gtk_text_buffer_get_bounds(dv->buffer, &start, &end);
    return gtk_text_buffer_get_text(dv->buffer, &start, &end, FALSE);
}

static void preview_cache_build_sync(DocView *dv)
{
    if (!GTK_IS_TEXT_BUFFER(dv->buffer)) return;
    char *md = buffer_get_md_copy(dv);
    char *html = markdown_to_html_with_anchors(md);
    g_free(md);
    g_free(dv->cached_preview_html);
    dv->cached_preview_html = html;
    dv->preview_cache_ready_gen = dv->preview_cache_generation;
    dv->preview_needs_update = FALSE;
}

static gboolean preview_cache_apply_idle(gpointer data)
{
    PreviewCacheJob *job = data;
    DocView *dv = job->dv;

    if (job->generation == dv->preview_cache_generation && job->html) {
        g_free(dv->cached_preview_html);
        dv->cached_preview_html = job->html;
        job->html = NULL;
        dv->preview_cache_ready_gen = job->generation;
        dv->preview_needs_update = FALSE;

        if (preview_tab_is_visible(dv)
            && !dv->pending_pdf_path && !dv->pdf_print_op) {
            dv->preview_web_loaded = FALSE;
            webkit_web_view_load_html(
                WEBKIT_WEB_VIEW(dv->web_view),
                dv->cached_preview_html, "file:///");
        }
    }

    g_free(job->html);
    g_free(job->md);
    g_free(job);
    return G_SOURCE_REMOVE;
}

static gpointer preview_cache_thread(gpointer data)
{
    PreviewCacheJob *job = data;
    job->html = markdown_to_html_with_anchors(job->md);
    g_idle_add(preview_cache_apply_idle, job);
    return NULL;
}

static void preview_cache_start_async(DocView *dv)
{
    if (!GTK_IS_TEXT_BUFFER(dv->buffer)) return;
    PreviewCacheJob *job = g_new(PreviewCacheJob, 1);
    job->dv          = dv;
    job->md          = buffer_get_md_copy(dv);
    job->generation  = dv->preview_cache_generation;
    job->html        = NULL;
    g_thread_new("preview-cache", preview_cache_thread, job);
}

static void preview_scroll_if_needed(DocView *dv)
{
    if (dv->last_outline_index < 0) return;
    g_idle_add(deferred_preview_scroll, dv);
    g_timeout_add(80, deferred_preview_scroll_late, dv);
}

/* Load cached HTML into WebView; skip reload if already showing current cache. */
static void preview_show(DocView *dv, gboolean scroll_after)
{
    if (!dv->cached_preview_html || dv->pending_pdf_path || dv->pdf_print_op)
        return;

    if (!preview_tab_is_visible(dv))
        return;

    if (dv->preview_web_loaded && preview_cache_is_fresh(dv)) {
        if (scroll_after)
            preview_scroll_if_needed(dv);
        return;
    }

    dv->preview_web_loaded = FALSE;
    webkit_web_view_load_html(
        WEBKIT_WEB_VIEW(dv->web_view),
        dv->cached_preview_html, "file:///");
}

static void update_preview(DocView *dv)
{
    preview_cache_build_sync(dv);
    preview_show(dv, dv->last_outline_index >= 0);
}

static void rebuild_outline(DocView *dv)
{
    if (!GTK_IS_TEXT_BUFFER(dv->buffer)) return;
    GtkTextIter start, end;
    gtk_text_buffer_get_bounds(dv->buffer, &start, &end);
    char *md = gtk_text_buffer_get_text(dv->buffer, &start, &end, FALSE);

    GPtrArray *outline = markdown_get_outline(md);
    g_free(md);

    if (dv->outline_signal_id)
        g_signal_handler_block(dv->tree_view, dv->outline_signal_id);

    gtk_tree_store_clear(dv->outline_store);

    /* parent_stack[level] = last inserted iter at that level (1-6) */
    GtkTreeIter parent_stack[7];
    gboolean    valid_stack[7];
    for (int l = 0; l < 7; l++) valid_stack[l] = FALSE;

    for (guint i = 0; i < outline->len; i++) {
        OutlineItem *item  = g_ptr_array_index(outline, i);
        int          level = item->level;

        /* find nearest ancestor */
        GtkTreeIter *parent = NULL;
        for (int l = level - 1; l >= 1; l--) {
            if (valid_stack[l]) { parent = &parent_stack[l]; break; }
        }

        GtkTreeIter it;
        gtk_tree_store_append(dv->outline_store, &it, parent);
        gtk_tree_store_set(dv->outline_store, &it,
            OUTLINE_COL_TEXT,  item->text,
            OUTLINE_COL_INDEX, item->index,
            OUTLINE_COL_LINE,  item->line,
            -1);
        parent_stack[level] = it;
        valid_stack[level]  = TRUE;
        /* invalidate deeper levels */
        for (int l = level + 1; l <= 6; l++) valid_stack[l] = FALSE;
    }

    gtk_tree_view_expand_all(GTK_TREE_VIEW(dv->tree_view));

    if (dv->outline_signal_id)
        g_signal_handler_unblock(dv->tree_view, dv->outline_signal_id);

    g_ptr_array_unref(outline);
}

static gboolean content_refresh_timer_cb(gpointer data)
{
    DocView *dv = data;
    dv->outline_timer_id = 0;
    rebuild_outline(dv);
    preview_cache_start_async(dv);
    return G_SOURCE_REMOVE;
}

/* ── signal handlers ───────────────────────────────────────────────── */
static void on_buffer_changed(GtkTextBuffer *buf, gpointer data)
{
    (void)buf;
    DocView *dv = data;
    dv->is_dirty = TRUE;
    dv->preview_cache_generation++;
    dv->preview_needs_update = TRUE;
    dv->preview_web_loaded = FALSE;
    update_title(dv);
    gtk_widget_set_sensitive(dv->btn_save, TRUE);

    /* debounce outline rebuild + preview HTML precompute (background) */
    if (dv->outline_timer_id) g_source_remove(dv->outline_timer_id);
    dv->outline_timer_id = g_timeout_add(400, content_refresh_timer_cb, dv);
}

static void on_switch_page(GtkNotebook *nb, GtkWidget *page, guint n, gpointer data)
{
    (void)nb; (void)page;
    DocView *dv = data;
    if (n != 0) return;

    if (!preview_cache_is_fresh(dv))
        preview_cache_build_sync(dv);
    preview_show(dv, FALSE);
}

/* ── scroll both panes to the selected outline item ─────────────────── */
static void scroll_editor_to_line(DocView *dv, int line)
{
    if (!GTK_IS_TEXT_BUFFER(dv->buffer)) return;
    GtkTextIter iter;
    gtk_text_buffer_get_iter_at_line(dv->buffer, &iter, line);
    gtk_text_buffer_place_cursor(dv->buffer, &iter);
    /* yalign=0.0 — selected line at the top of the visible editor area */
    GtkTextMark *mark = gtk_text_buffer_get_insert(dv->buffer);
    gtk_text_view_scroll_to_mark(GTK_TEXT_VIEW(dv->text_view),
        mark, 0.0, TRUE, 0.0, 0.0);
}

static void scroll_preview_to_index(DocView *dv, int idx)
{
    char *js = g_strdup_printf(
        "(function(){"
        "var el=document.getElementById('h-%d');"
        "if(!el)return;"
        "el.scrollIntoView({block:'start',inline:'nearest'});"
        "})();",
        idx);
    webkit_web_view_evaluate_javascript(
        WEBKIT_WEB_VIEW(dv->web_view), js, -1, NULL, NULL, NULL, NULL, NULL);
    g_free(js);
}

static gboolean deferred_preview_scroll(gpointer data)
{
    DocView *dv = data;
    if (dv->last_outline_index >= 0)
        scroll_preview_to_index(dv, dv->last_outline_index);
    return G_SOURCE_REMOVE;
}

static gboolean deferred_preview_scroll_late(gpointer data)
{
    deferred_preview_scroll(data);
    return G_SOURCE_REMOVE;
}

static void configure_print_to_file(GtkPrintSettings *settings, const char *path)
{
    char *uri = g_filename_to_uri(path, NULL, NULL);
    gtk_print_settings_set_printer(settings, "Print to File");
    gtk_print_settings_set(settings, GTK_PRINT_SETTINGS_OUTPUT_FILE_FORMAT, "pdf");
    gtk_print_settings_set(settings, GTK_PRINT_SETTINGS_OUTPUT_URI, uri);
    gtk_print_settings_set_print_pages(settings, GTK_PRINT_PAGES_ALL);
    gtk_print_settings_set_orientation(settings, GTK_PAGE_ORIENTATION_PORTRAIT);
    GtkPaperSize *paper = gtk_paper_size_new(GTK_PAPER_NAME_A4);
    gtk_print_settings_set_paper_size(settings, paper);
    gtk_paper_size_free(paper);
    g_free(uri);
}

static void on_estimated_load_progress(GObject *obj, GParamSpec *pspec, gpointer data)
{
    (void)pspec;
    DocView *dv = data;
    if (!dv->pending_pdf_path && !dv->pdf_print_op) return;
    double lp = webkit_web_view_get_estimated_load_progress(WEBKIT_WEB_VIEW(obj));
    progress_set(dv, 0.1 + 0.55 * lp, "PDF 준비 중…");
}

static void pdf_export_cleanup(DocView *dv)
{
    progress_disconnect_load(dv);
    g_clear_pointer(&dv->pending_pdf_path, g_free);
    if (dv->pdf_print_op) {
        g_object_unref(dv->pdf_print_op);
        dv->pdf_print_op = NULL;
    }
}

static void on_pdf_export_finished(WebKitPrintOperation *op, gpointer data)
{
    (void)op;
    DocView *dv = data;
    if (dv->last_pdf_path) {
        char *msg = g_strdup_printf("PDF 저장 완료: %s", dv->last_pdf_path);
        progress_set(dv, 1.0, msg);
        g_free(msg);
    } else {
        progress_set(dv, 1.0, "PDF 저장 완료");
    }
    pdf_export_cleanup(dv);
    progress_hide(dv);
    update_preview(dv);
}

static void on_pdf_export_failed(WebKitPrintOperation *op, GError *error, gpointer data)
{
    (void)op;
    DocView *dv = data;
    GtkWidget *d = gtk_message_dialog_new(GTK_WINDOW(dv->window),
        GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
        "PDF 저장 실패:\n%s", error ? error->message : "알 수 없는 오류");
    gtk_dialog_run(GTK_DIALOG(d));
    gtk_widget_destroy(d);
    set_status(dv, "PDF 저장 실패");
    pdf_export_cleanup(dv);
    progress_hide(dv);
    update_preview(dv);
}

static void start_pdf_print(DocView *dv, const char *path)
{
    GtkPrintSettings *settings = gtk_print_settings_new();
    configure_print_to_file(settings, path);

    progress_disconnect_load(dv);
    progress_show(dv, "PDF 생성 중…", -1.0);

    g_clear_pointer(&dv->pending_pdf_path, g_free);
    if (dv->pdf_print_op) {
        g_object_unref(dv->pdf_print_op);
        dv->pdf_print_op = NULL;
    }
    dv->pdf_print_op = webkit_print_operation_new(WEBKIT_WEB_VIEW(dv->web_view));
    webkit_print_operation_set_print_settings(dv->pdf_print_op, settings);
    g_object_unref(settings);

    g_signal_connect(dv->pdf_print_op, "finished",
        G_CALLBACK(on_pdf_export_finished), dv);
    g_signal_connect(dv->pdf_print_op, "failed",
        G_CALLBACK(on_pdf_export_failed), dv);
    webkit_print_operation_print(dv->pdf_print_op);
}

/* Fired when the WebView finishes loading — outline scroll or PDF export. */
static void on_web_load_changed(WebKitWebView *wv, WebKitLoadEvent event, gpointer data)
{
    (void)wv;
    if (event != WEBKIT_LOAD_FINISHED) return;
    DocView *dv = data;

    if (dv->pending_pdf_path) {
        char *path = dv->pending_pdf_path;
        dv->pending_pdf_path = NULL;
        start_pdf_print(dv, path);
        g_free(path);
        return;
    }

    dv->preview_needs_update = FALSE;
    dv->preview_web_loaded = TRUE;
    if (dv->last_outline_index >= 0)
        preview_scroll_if_needed(dv);
}

/* Single-click on outline item → scroll both editor and preview. */
static void on_outline_cursor_changed(GtkTreeView *tv, gpointer data)
{
    DocView *dv = data;
    GtkTreeSelection *sel   = gtk_tree_view_get_selection(tv);
    GtkTreeModel     *model = NULL;
    GtkTreeIter       it;
    if (!gtk_tree_selection_get_selected(sel, &model, &it)) return;

    int idx = 0, line = 0;
    gtk_tree_model_get(model, &it,
        OUTLINE_COL_INDEX, &idx,
        OUTLINE_COL_LINE,  &line,
        -1);

    dv->last_outline_index = idx;

    scroll_editor_to_line(dv, line);

    if (dv->pending_pdf_path || dv->pdf_print_op)
        return;

    if (!preview_cache_is_fresh(dv))
        preview_cache_build_sync(dv);
    if (preview_tab_is_visible(dv))
        preview_show(dv, TRUE);
}

static void do_save(DocView *dv)
{
    if (!dv->file_path) {
        GtkWidget *dlg = gtk_file_chooser_dialog_new(
            "저장",
            GTK_WINDOW(dv->window),
            GTK_FILE_CHOOSER_ACTION_SAVE,
            "_취소", GTK_RESPONSE_CANCEL,
            "_저장", GTK_RESPONSE_ACCEPT,
            NULL);
        gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dlg), TRUE);
        gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dlg), "document.md");
        GtkFileFilter *ff = gtk_file_filter_new();
        gtk_file_filter_add_pattern(ff, "*.md");
        gtk_file_filter_set_name(ff, "Markdown (*.md)");
        gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), ff);
        if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT)
            dv->file_path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        gtk_widget_destroy(dlg);
        if (!dv->file_path) return;
    }

    GtkTextIter start, end;
    gtk_text_buffer_get_bounds(dv->buffer, &start, &end);
    char *text = gtk_text_buffer_get_text(dv->buffer, &start, &end, FALSE);

    save_start_async(dv, dv->file_path, text);
}

static void on_save(GtkButton *btn, gpointer data)
{
    (void)btn;
    do_save(data);
}

/* ── helper: read markdown from buffer ─────────────────────────────── */
static char *buffer_get_md(DocView *dv)
{
    GtkTextIter s, e;
    gtk_text_buffer_get_bounds(dv->buffer, &s, &e);
    return gtk_text_buffer_get_text(dv->buffer, &s, &e, FALSE);
}

/* ── suggested export filename without extension ────────────────────── */
static char *suggest_basename(DocView *dv)
{
    const char *base = dv->file_path ? dv->file_path : "document";
    char *copy = g_strdup(base);
    char *dot  = strrchr(copy, '.');
    char *name = g_strdup(g_path_get_basename(dot ? ((*dot = '\0'), copy) : copy));
    g_free(copy);
    return name;
}

static void on_export_html(GtkButton *btn, gpointer data)
{
    (void)btn;
    DocView *dv = data;

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "HTML로 내보내기",
        GTK_WINDOW(dv->window),
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL,
        "_저장", GTK_RESPONSE_ACCEPT,
        NULL);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dlg), TRUE);

    const char *base = dv->file_path ? dv->file_path : "document";
    char *name_noext = g_strdup(base);
    char *dot = strrchr(name_noext, '.');
    if (dot) *dot = '\0';
    char *html_name = g_strdup_printf("%s.html", g_path_get_basename(name_noext));
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dlg), html_name);
    g_free(html_name);
    g_free(name_noext);

    GtkFileFilter *ff = gtk_file_filter_new();
    gtk_file_filter_add_pattern(ff, "*.html");
    gtk_file_filter_set_name(ff, "HTML (*.html)");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), ff);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char *fname = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        char *md    = buffer_get_md(dv);
        html_export_start(dv, fname, md);
        g_free(fname);
    }
    gtk_widget_destroy(dlg);
}

static void begin_pdf_export(DocView *dv, const char *path)
{
    GtkTextIter start, end;
    gtk_text_buffer_get_bounds(dv->buffer, &start, &end);
    char *md   = gtk_text_buffer_get_text(dv->buffer, &start, &end, FALSE);
    char *html = markdown_to_html_for_pdf(md, dv->settings);
    g_free(md);

    g_free(dv->last_pdf_path);
    dv->last_pdf_path = g_strdup(path);
    g_free(dv->pending_pdf_path);
    dv->pending_pdf_path = g_strdup(path);
    if (!dv->load_progress_handler_id) {
        dv->load_progress_handler_id = g_signal_connect(
            dv->web_view, "notify::estimated-load-progress",
            G_CALLBACK(on_estimated_load_progress), dv);
    }
    progress_show(dv, "PDF 저장 중…", 0.05);
    dv->preview_web_loaded = FALSE;
    webkit_web_view_load_html(WEBKIT_WEB_VIEW(dv->web_view), html, "file:///");
    g_free(html);
}

static void on_export_pdf(GtkButton *btn, gpointer data)
{
    (void)btn;
    DocView *dv = data;
    if (!dv->settings || !GTK_IS_TEXT_BUFFER(dv->buffer)) return;
    if (dv->pending_pdf_path || dv->pdf_print_op) return;

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "PDF로 내보내기",
        GTK_WINDOW(dv->window),
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL,
        "_저장", GTK_RESPONSE_ACCEPT,
        NULL);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dlg), TRUE);

    if (dv->settings->pdf_output_dir && dv->settings->pdf_output_dir[0])
        gtk_file_chooser_set_current_folder(GTK_FILE_CHOOSER(dlg), dv->settings->pdf_output_dir);
    else if (dv->file_path) {
        char *dir = g_path_get_dirname(dv->file_path);
        gtk_file_chooser_set_current_folder(GTK_FILE_CHOOSER(dlg), dir);
        g_free(dir);
    }

    char *bname    = suggest_basename(dv);
    char *pdf_name = g_strdup_printf("%s.pdf", bname);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dlg), pdf_name);
    g_free(pdf_name);
    g_free(bname);

    GtkFileFilter *ff = gtk_file_filter_new();
    gtk_file_filter_add_pattern(ff, "*.pdf");
    gtk_file_filter_set_name(ff, "PDF (*.pdf)");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), ff);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char *fname = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        g_free(dv->settings->pdf_output_dir);
        dv->settings->pdf_output_dir = g_path_get_dirname(fname);
        app_settings_save(dv->settings);
        begin_pdf_export(dv, fname);
        g_free(fname);
    }
    gtk_widget_destroy(dlg);
}

/* ── Word export via libzip/OpenXML (no pandoc) ─────────────────────── */
static void on_export_word(GtkButton *btn, gpointer data)
{
    (void)btn;
    DocView *dv = data;
    if (!GTK_IS_TEXT_BUFFER(dv->buffer)) return;

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "Word로 내보내기", GTK_WINDOW(dv->window),
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL,
        "_저장", GTK_RESPONSE_ACCEPT, NULL);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dlg), TRUE);
    char *bname     = suggest_basename(dv);
    char *docx_name = g_strdup_printf("%s.docx", bname);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dlg), docx_name);
    g_free(docx_name); g_free(bname);
    GtkFileFilter *ff = gtk_file_filter_new();
    gtk_file_filter_add_pattern(ff, "*.docx");
    gtk_file_filter_set_name(ff, "Word (*.docx)");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), ff);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char *fname = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        char *md    = buffer_get_md(dv);
        word_export_start(dv, fname, md);
        g_free(fname);
    }
    gtk_widget_destroy(dlg);
}

/* ── export settings dialog ─────────────────────────────────────────── */
static void on_export_settings(GtkButton *btn, gpointer data)
{
    (void)btn;
    DocView *dv = data;

    GtkWidget *dlg = gtk_dialog_new_with_buttons(
        "보내기 설정", GTK_WINDOW(dv->window),
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        "_취소", GTK_RESPONSE_CANCEL,
        "_적용", GTK_RESPONSE_ACCEPT, NULL);
    gtk_dialog_set_default_response(GTK_DIALOG(dlg), GTK_RESPONSE_ACCEPT);
    gtk_window_set_default_size(GTK_WINDOW(dlg), 380, -1);

    GtkWidget *grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 8);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 12);
    gtk_container_set_border_width(GTK_CONTAINER(grid), 16);
    gtk_container_add(GTK_CONTAINER(gtk_dialog_get_content_area(GTK_DIALOG(dlg))), grid);

    int row = 0;
#define LABEL(txt) G_STMT_START { \
    GtkWidget *_l = gtk_label_new(txt); \
    gtk_widget_set_halign(_l, GTK_ALIGN_END); \
    gtk_grid_attach(GTK_GRID(grid), _l, 0, row, 1, 1); } G_STMT_END

    LABEL("폰트:");
    GtkWidget *w_font = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(w_font),
        dv->settings->font_family ? dv->settings->font_family : "sans-serif");
    gtk_widget_set_hexpand(w_font, TRUE);
    gtk_grid_attach(GTK_GRID(grid), w_font, 1, row++, 1, 1);

    LABEL("폰트 크기 (pt):");
    GtkWidget *w_fsize = gtk_spin_button_new_with_range(6.0, 72.0, 0.5);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(w_fsize), dv->settings->font_size_pt);
    gtk_grid_attach(GTK_GRID(grid), w_fsize, 1, row++, 1, 1);

    LABEL("줄 간격:");
    GtkWidget *w_lh = gtk_spin_button_new_with_range(0.8, 4.0, 0.1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(w_lh), dv->settings->line_height);
    gtk_grid_attach(GTK_GRID(grid), w_lh, 1, row++, 1, 1);

    LABEL("단락 간격 (em):");
    GtkWidget *w_ps = gtk_spin_button_new_with_range(0.0, 4.0, 0.1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(w_ps), dv->settings->paragraph_spacing_em);
    gtk_grid_attach(GTK_GRID(grid), w_ps, 1, row++, 1, 1);

    LABEL("상하 여백 (인치):");
    GtkWidget *w_mv = gtk_spin_button_new_with_range(0.0, 4.0, 0.25);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(w_mv), dv->settings->margin_vertical_inch);
    gtk_grid_attach(GTK_GRID(grid), w_mv, 1, row++, 1, 1);

    LABEL("좌우 여백 (인치):");
    GtkWidget *w_mh = gtk_spin_button_new_with_range(0.0, 4.0, 0.25);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(w_mh), dv->settings->margin_horizontal_inch);
    gtk_grid_attach(GTK_GRID(grid), w_mh, 1, row++, 1, 1);
#undef LABEL

    gtk_widget_show_all(dlg);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        g_free(dv->settings->font_family);
        dv->settings->font_family            = g_strdup(gtk_entry_get_text(GTK_ENTRY(w_font)));
        dv->settings->font_size_pt           = gtk_spin_button_get_value(GTK_SPIN_BUTTON(w_fsize));
        dv->settings->line_height            = gtk_spin_button_get_value(GTK_SPIN_BUTTON(w_lh));
        dv->settings->paragraph_spacing_em   = gtk_spin_button_get_value(GTK_SPIN_BUTTON(w_ps));
        dv->settings->margin_vertical_inch   = gtk_spin_button_get_value(GTK_SPIN_BUTTON(w_mv));
        dv->settings->margin_horizontal_inch = gtk_spin_button_get_value(GTK_SPIN_BUTTON(w_mh));
        app_settings_save(dv->settings);
        set_status(dv, "설정 저장 완료");
    }
    gtk_widget_destroy(dlg);
}

static gboolean on_key_press(GtkWidget *widget, GdkEventKey *event, gpointer data)
{
    (void)widget;
    DocView *dv = data;
    if ((event->state & GDK_CONTROL_MASK) && event->keyval == GDK_KEY_s) {
        do_save(dv);
        return TRUE;
    }
    return FALSE;
}

static gboolean on_delete_event(GtkWidget *widget, GdkEvent *event, gpointer data)
{
    (void)widget; (void)event;
    DocView *dv = data;
    if (!dv->is_dirty) return FALSE;

    const char *name = dv->file_path ? g_path_get_basename(dv->file_path) : "문서";
    GtkWidget *dlg = gtk_message_dialog_new(GTK_WINDOW(dv->window),
        GTK_DIALOG_MODAL, GTK_MESSAGE_WARNING, GTK_BUTTONS_NONE,
        "'%s'의 변경 사항을 저장하시겠습니까?", name);
    gtk_dialog_add_buttons(GTK_DIALOG(dlg),
        "저장 안 함", GTK_RESPONSE_NO,
        "_취소",      GTK_RESPONSE_CANCEL,
        "_저장",      GTK_RESPONSE_YES,
        NULL);
    int r = gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);

    if (r == GTK_RESPONSE_CANCEL) return TRUE;   /* prevent close */
    if (r == GTK_RESPONSE_YES)    do_save(dv);
    return FALSE;
}

static void on_window_destroy(GtkWidget *widget, gpointer data)
{
    (void)widget;
    DocView *dv = data;
    if (dv->outline_timer_id) g_source_remove(dv->outline_timer_id);
    progress_hide(dv);
    pdf_export_cleanup(dv);
    if (dv->buffer) g_object_unref(dv->buffer);  /* release our explicit reference */
    g_free(dv->file_path);
    g_free(dv->last_pdf_path);
    g_free(dv->cached_preview_html);
    /* settings owned by MainWindow, not freed here */
    g_free(dv);
}

/* ── public API ────────────────────────────────────────────────────── */
void document_view_show(GtkWindow *parent, const char *content,
                        const char *file_path, AppSettings *settings)
{
    DocView *dv = g_new0(DocView, 1);
    dv->file_path           = file_path ? g_strdup(file_path) : NULL;
    dv->settings            = settings;
    dv->last_outline_index  = -1;

    /* window */
    dv->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(dv->window),
        file_path ? g_path_get_basename(file_path) : "미리보기 — MD Maker");
    gtk_window_set_default_size(GTK_WINDOW(dv->window), 1000, 720);
    if (parent) gtk_window_set_transient_for(GTK_WINDOW(dv->window), parent);
    g_signal_connect(dv->window, "delete-event",  G_CALLBACK(on_delete_event), dv);
    g_signal_connect(dv->window, "destroy",        G_CALLBACK(on_window_destroy), dv);
    g_signal_connect(dv->window, "key-press-event",G_CALLBACK(on_key_press), dv);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(dv->window), vbox);

    /* toolbar */
    GtkWidget *toolbar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_container_set_border_width(GTK_CONTAINER(toolbar), 4);
    gtk_box_pack_start(GTK_BOX(vbox), toolbar, FALSE, FALSE, 0);

    dv->btn_save              = gtk_button_new_with_label("저장");
    GtkWidget *btn_html       = gtk_button_new_with_label("HTML");
    GtkWidget *btn_word       = gtk_button_new_with_label("Word");
    GtkWidget *btn_pdf        = gtk_button_new_with_label("PDF");
    GtkWidget *btn_settings   = gtk_button_new_with_label("내보내기 설정…");
    gtk_widget_set_sensitive(dv->btn_save, FALSE);
    gtk_box_pack_start(GTK_BOX(toolbar), dv->btn_save,    FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(toolbar), gtk_separator_new(GTK_ORIENTATION_VERTICAL), FALSE, FALSE, 2);
    gtk_box_pack_start(GTK_BOX(toolbar), btn_html,        FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(toolbar), btn_word,        FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(toolbar), btn_pdf,         FALSE, FALSE, 0);
    gtk_box_pack_end  (GTK_BOX(toolbar), btn_settings,    FALSE, FALSE, 0);
    g_signal_connect(dv->btn_save,  "clicked", G_CALLBACK(on_save),            dv);
    g_signal_connect(btn_html,      "clicked", G_CALLBACK(on_export_html),     dv);
    g_signal_connect(btn_word,      "clicked", G_CALLBACK(on_export_word),     dv);
    g_signal_connect(btn_pdf,       "clicked", G_CALLBACK(on_export_pdf),      dv);
    g_signal_connect(btn_settings,  "clicked", G_CALLBACK(on_export_settings), dv);

    /* horizontal split: outline | notebook(preview/editor) */
    GtkWidget *hpaned = gtk_paned_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_box_pack_start(GTK_BOX(vbox), hpaned, TRUE, TRUE, 0);

    /* outline tree — hierarchical GtkTreeStore with connecting lines */
    dv->outline_store = gtk_tree_store_new(OUTLINE_N_COLS, G_TYPE_STRING, G_TYPE_INT, G_TYPE_INT);
    dv->tree_view = gtk_tree_view_new_with_model(GTK_TREE_MODEL(dv->outline_store));
    g_object_unref(dv->outline_store);
    gtk_tree_view_set_headers_visible(GTK_TREE_VIEW(dv->tree_view), FALSE);
    gtk_tree_view_set_enable_tree_lines(GTK_TREE_VIEW(dv->tree_view), TRUE);
    gtk_tree_view_set_show_expanders(GTK_TREE_VIEW(dv->tree_view), TRUE);

    GtkCellRenderer *cr = gtk_cell_renderer_text_new();
    GtkTreeViewColumn *col = gtk_tree_view_column_new_with_attributes(
        "목차", cr, "text", OUTLINE_COL_TEXT, NULL);
    gtk_tree_view_append_column(GTK_TREE_VIEW(dv->tree_view), col);
    dv->outline_signal_id = g_signal_connect(
        dv->tree_view, "cursor-changed", G_CALLBACK(on_outline_cursor_changed), dv);

    GtkWidget *outline_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(outline_scroll),
        GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_size_request(outline_scroll, 200, -1);
    gtk_container_add(GTK_CONTAINER(outline_scroll), dv->tree_view);
    gtk_paned_pack1(GTK_PANED(hpaned), outline_scroll, FALSE, FALSE);

    /* notebook: preview | editor */
    dv->notebook = gtk_notebook_new();
    gtk_paned_pack2(GTK_PANED(hpaned), dv->notebook, TRUE, TRUE);

    /* preview tab */
    dv->web_view = webkit_web_view_new();
    g_signal_connect(dv->web_view, "load-changed", G_CALLBACK(on_web_load_changed), dv);
    GtkWidget *web_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_container_add(GTK_CONTAINER(web_scroll), dv->web_view);
    gtk_notebook_append_page(GTK_NOTEBOOK(dv->notebook), web_scroll,
        gtk_label_new("미리보기"));

    /* editor tab — own the buffer explicitly so dv->buffer is always valid */
    dv->buffer    = gtk_text_buffer_new(NULL);   /* refcount = 1, owned by us */
    dv->text_view = gtk_text_view_new_with_buffer(dv->buffer); /* view takes +1 ref */
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(dv->text_view), GTK_WRAP_WORD_CHAR);
    gtk_text_view_set_left_margin(GTK_TEXT_VIEW(dv->text_view), 8);
    /* monospace font for editor */
    GtkCssProvider *font_css = gtk_css_provider_new();
    gtk_css_provider_load_from_data(font_css,
        "textview { font-family: monospace; font-size: 10pt; }", -1, NULL);
    gtk_style_context_add_provider(
        gtk_widget_get_style_context(dv->text_view),
        GTK_STYLE_PROVIDER(font_css),
        GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    g_object_unref(font_css);

    GtkWidget *editor_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(editor_scroll),
        GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(editor_scroll), dv->text_view);
    gtk_notebook_append_page(GTK_NOTEBOOK(dv->notebook), editor_scroll,
        gtk_label_new("편집기"));

    /* connect switch-page AFTER both tabs and dv->buffer are ready */
    g_signal_connect(dv->notebook, "switch-page", G_CALLBACK(on_switch_page), dv);

    /* status area: progress bar + status text */
    GtkWidget *status_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 2);
    dv->progress_bar = gtk_progress_bar_new();
    gtk_progress_bar_set_show_text(GTK_PROGRESS_BAR(dv->progress_bar), FALSE);
    gtk_widget_set_no_show_all(dv->progress_bar, TRUE);
    gtk_widget_hide(dv->progress_bar);
    gtk_box_pack_start(GTK_BOX(status_box), dv->progress_bar, FALSE, FALSE, 0);
    dv->status_bar = gtk_statusbar_new();
    gtk_box_pack_start(GTK_BOX(status_box), dv->status_bar, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), status_box, FALSE, FALSE, 0);

    /* load content — ensure valid UTF-8 before inserting into GtkTextBuffer */
    {
        const char *text = content ? content : "";
        char *safe = NULL;
        if (!g_utf8_validate(text, -1, NULL)) {
            safe = g_utf8_make_valid(text, -1);
            text = safe;
        }
        gtk_text_buffer_set_text(dv->buffer, text, -1);
        g_free(safe);
    }
    dv->is_dirty = FALSE;
    g_signal_connect(dv->buffer, "changed", G_CALLBACK(on_buffer_changed), dv);

    rebuild_outline(dv);

    /* precompute initial preview cache */
    {
        const char *text = content ? content : "";
        dv->cached_preview_html = markdown_to_html_with_anchors(text);
        dv->preview_cache_ready_gen = dv->preview_cache_generation;
        dv->preview_needs_update = FALSE;
        webkit_web_view_load_html(
            WEBKIT_WEB_VIEW(dv->web_view),
            dv->cached_preview_html, "file:///");
    }

    gtk_paned_set_position(GTK_PANED(hpaned), 220);
    gtk_widget_show_all(dv->window);
}
