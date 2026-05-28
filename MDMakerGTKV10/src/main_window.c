#include "main_window.h"
#include "document_view.h"
#include "md_merger.h"
#include "markdown_converter.h"
#include "app_settings.h"

#include <string.h>
#include <time.h>

/* ── private state ─────────────────────────────────────────────────── */
typedef struct {
    GtkWidget    *window;
    GtkWidget    *entry_src;
    GtkWidget    *entry_output;
    GtkWidget    *entry_exclude;
    GtkWidget    *check_recursive;
    GtkWidget    *check_header;
    GtkWidget    *combo_sort;
    GtkWidget    *list_store;   /* GtkListStore: col0=gboolean checked, col1=char* full_path, col2=char* display */
    GtkWidget    *tree_view;
    GtkWidget    *label_count;
    GtkWidget    *text_log;
    GtkTextBuffer *log_buffer;

    AppSettings  *settings;
    gboolean      suppress_sort_refresh;
} MainWindow;

enum { COL_CHECKED = 0, COL_FULLPATH, COL_DISPLAY, N_COLS };

/* ── helpers ───────────────────────────────────────────────────────── */
static void log_msg(MainWindow *mw, const char *msg)
{
    time_t now = time(NULL);
    struct tm *tm = localtime(&now);
    char ts[16];
    strftime(ts, sizeof ts, "%H:%M:%S", tm);
    char *line = g_strdup_printf("[%s] %s\n", ts, msg);
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(mw->log_buffer, &end);
    gtk_text_buffer_insert(mw->log_buffer, &end, line, -1);
    g_free(line);
    /* scroll to end */
    GtkTextMark *mark = gtk_text_buffer_get_insert(mw->log_buffer);
    gtk_text_view_scroll_mark_onscreen(GTK_TEXT_VIEW(mw->text_log), mark);
}

static void persist_settings(MainWindow *mw)
{
    const char *src    = gtk_entry_get_text(GTK_ENTRY(mw->entry_src));
    const char *output = gtk_entry_get_text(GTK_ENTRY(mw->entry_output));
    if (src && *src)    { g_free(mw->settings->last_source_dir);  mw->settings->last_source_dir  = g_strdup(src); }
    if (output && *output){ g_free(mw->settings->last_output_file); mw->settings->last_output_file = g_strdup(output); }
    app_settings_save(mw->settings);
}

static MergeOptions build_options(MainWindow *mw, gboolean for_refresh)
{
    MergeOptions opts = {0};
    opts.source_directory = g_strdup(gtk_entry_get_text(GTK_ENTRY(mw->entry_src)));
    opts.recursive        = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(mw->check_recursive));
    opts.insert_header    = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(mw->check_header));
    opts.output_file      = g_strdup(gtk_entry_get_text(GTK_ENTRY(mw->entry_output)));

    int sort_idx = gtk_combo_box_get_active(GTK_COMBO_BOX(mw->combo_sort));
    if (for_refresh && sort_idx == SORT_CUSTOM) sort_idx = SORT_NAME_ASC;
    opts.sort_order = (FileSortOrder)sort_idx;

    const char *excl_text = gtk_entry_get_text(GTK_ENTRY(mw->entry_exclude));
    if (excl_text && *excl_text) {
        char **parts = g_strsplit(excl_text, ",", -1);
        int n = g_strv_length(parts);
        opts.exclude_patterns   = g_new0(char *, n + 1);
        opts.n_exclude_patterns = 0;
        for (int i = 0; i < n; i++) {
            char *p = g_strstrip(parts[i]);
            if (*p) opts.exclude_patterns[opts.n_exclude_patterns++] = g_strdup(p);
        }
        g_strfreev(parts);
    }
    return opts;
}

static void free_merge_options(MergeOptions *opts)
{
    g_free(opts->source_directory);
    g_free(opts->output_file);
    if (opts->exclude_patterns) {
        for (int i = 0; i < opts->n_exclude_patterns; i++) g_free(opts->exclude_patterns[i]);
        g_free(opts->exclude_patterns);
    }
}

static void refresh_files(MainWindow *mw)
{
    GtkListStore *store = GTK_LIST_STORE(
        gtk_tree_view_get_model(GTK_TREE_VIEW(mw->tree_view)));

    const char *dir = gtk_entry_get_text(GTK_ENTRY(mw->entry_src));
    if (!dir || !*dir || !g_file_test(dir, G_FILE_TEST_IS_DIR)) {
        gtk_list_store_clear(store);
        gtk_label_set_text(GTK_LABEL(mw->label_count), "0개 파일");
        return;
    }

    MergeOptions opts = build_options(mw, TRUE);
    GPtrArray   *files = md_merger_get_files(&opts);
    free_merge_options(&opts);

    gtk_list_store_clear(store);
    for (guint i = 0; i < files->len; i++) {
        const char *fpath = g_ptr_array_index(files, i);
        const char *rel   = fpath;
        if (g_str_has_prefix(fpath, dir))
            rel = fpath + strlen(dir) + (fpath[strlen(dir)] == G_DIR_SEPARATOR ? 1 : 0);
        GtkTreeIter it;
        gtk_list_store_append(store, &it);
        gtk_list_store_set(store, &it,
            COL_CHECKED,  TRUE,
            COL_FULLPATH, fpath,
            COL_DISPLAY,  rel,
            -1);
    }

    char *msg = g_strdup_printf("%u개 파일", files->len);
    gtk_label_set_text(GTK_LABEL(mw->label_count), msg);
    g_free(msg);

    char *log = g_strdup_printf("[새로고침] %u개 파일 로드됨", files->len);
    log_msg(mw, log);
    g_free(log);

    g_ptr_array_unref(files);
}

/* Collect checked files into a GPtrArray<char*> (owned by caller). */
static GPtrArray *get_checked_files(MainWindow *mw)
{
    GtkListStore *store = GTK_LIST_STORE(
        gtk_tree_view_get_model(GTK_TREE_VIEW(mw->tree_view)));
    GPtrArray *arr = g_ptr_array_new_with_free_func(g_free);
    GtkTreeIter it;
    if (!gtk_tree_model_get_iter_first(GTK_TREE_MODEL(store), &it))
        return arr;
    do {
        gboolean checked;
        char *fpath;
        gtk_tree_model_get(GTK_TREE_MODEL(store), &it,
            COL_CHECKED,  &checked,
            COL_FULLPATH, &fpath,
            -1);
        if (checked) g_ptr_array_add(arr, fpath);
        else         g_free(fpath);
    } while (gtk_tree_model_iter_next(GTK_TREE_MODEL(store), &it));
    return arr;
}

/* ── signal handlers ───────────────────────────────────────────────── */
static void on_browse_src(GtkButton *btn, gpointer data)
{
    MainWindow *mw = data;
    (void)btn;

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "소스 디렉토리 선택",
        GTK_WINDOW(mw->window),
        GTK_FILE_CHOOSER_ACTION_SELECT_FOLDER,
        "_취소", GTK_RESPONSE_CANCEL,
        "_선택", GTK_RESPONSE_ACCEPT,
        NULL);

    const char *cur = gtk_entry_get_text(GTK_ENTRY(mw->entry_src));
    if (cur && *cur && g_file_test(cur, G_FILE_TEST_IS_DIR))
        gtk_file_chooser_set_current_folder(GTK_FILE_CHOOSER(dlg), cur);
    else if (mw->settings->last_source_dir)
        gtk_file_chooser_set_current_folder(GTK_FILE_CHOOSER(dlg), mw->settings->last_source_dir);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char *folder = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        gtk_entry_set_text(GTK_ENTRY(mw->entry_src), folder);

        const char *out = gtk_entry_get_text(GTK_ENTRY(mw->entry_output));
        if (!out || !*out) {
            char *def = g_build_filename(folder, "merged.md", NULL);
            gtk_entry_set_text(GTK_ENTRY(mw->entry_output), def);
            g_free(def);
        }
        g_free(folder);
        persist_settings(mw);
        refresh_files(mw);
    }
    gtk_widget_destroy(dlg);
}

static void on_browse_out(GtkButton *btn, gpointer data)
{
    MainWindow *mw = data;
    (void)btn;

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "출력 파일 저장",
        GTK_WINDOW(mw->window),
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL,
        "_저장", GTK_RESPONSE_ACCEPT,
        NULL);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dlg), TRUE);

    GtkFileFilter *ff = gtk_file_filter_new();
    gtk_file_filter_set_name(ff, "Markdown (*.md)");
    gtk_file_filter_add_pattern(ff, "*.md");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), ff);

    const char *out = gtk_entry_get_text(GTK_ENTRY(mw->entry_output));
    if (out && *out) {
        gtk_file_chooser_set_filename(GTK_FILE_CHOOSER(dlg), out);
    } else {
        gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dlg), "merged.md");
    }

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char *fname = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        gtk_entry_set_text(GTK_ENTRY(mw->entry_output), fname);
        g_free(fname);
        persist_settings(mw);
    }
    gtk_widget_destroy(dlg);
}

static void on_refresh(GtkButton *btn, gpointer data)
{
    (void)btn;
    refresh_files(data);
}

static void on_recursive_toggled(GtkToggleButton *tb, gpointer data)
{
    (void)tb;
    refresh_files(data);
}

static void on_sort_changed(GtkComboBox *cb, gpointer data)
{
    MainWindow *mw = data;
    (void)cb;
    if (!mw->suppress_sort_refresh)
        refresh_files(mw);
}

static void on_exclude_activate(GtkEntry *e, gpointer data)
{
    (void)e;
    refresh_files(data);
}

static void on_checked_toggled(GtkCellRendererToggle *cell, char *path_str, gpointer data)
{
    (void)cell;
    MainWindow *mw = data;
    GtkListStore *store = GTK_LIST_STORE(
        gtk_tree_view_get_model(GTK_TREE_VIEW(mw->tree_view)));
    GtkTreePath *path = gtk_tree_path_new_from_string(path_str);
    GtkTreeIter  it;
    if (gtk_tree_model_get_iter(GTK_TREE_MODEL(store), &it, path)) {
        gboolean val;
        gtk_tree_model_get(GTK_TREE_MODEL(store), &it, COL_CHECKED, &val, -1);
        gtk_list_store_set(store, &it, COL_CHECKED, !val, -1);
    }
    gtk_tree_path_free(path);
}

/* Move selected row up/down */
static void move_row(MainWindow *mw, int direction)
{
    GtkTreeView      *tv    = GTK_TREE_VIEW(mw->tree_view);
    GtkListStore     *store = GTK_LIST_STORE(gtk_tree_view_get_model(tv));
    GtkTreeSelection *sel   = gtk_tree_view_get_selection(tv);

    GtkTreeIter it;
    if (!gtk_tree_selection_get_selected(sel, NULL, &it)) return;

    GtkTreePath *path = gtk_tree_model_get_path(GTK_TREE_MODEL(store), &it);
    if (direction < 0) {
        if (!gtk_tree_path_prev(path)) { gtk_tree_path_free(path); return; }
    } else {
        gtk_tree_path_next(path);
    }
    GtkTreeIter other;
    if (!gtk_tree_model_get_iter(GTK_TREE_MODEL(store), &other, path)) {
        gtk_tree_path_free(path); return;
    }
    gtk_list_store_swap(store, &it, &other);
    gtk_tree_path_free(path);

    /* switch to custom sort */
    mw->suppress_sort_refresh = TRUE;
    gtk_combo_box_set_active(GTK_COMBO_BOX(mw->combo_sort), SORT_CUSTOM);
    mw->suppress_sort_refresh = FALSE;
}

static void on_move_up  (GtkButton *b, gpointer d) { (void)b; move_row(d, -1); }
static void on_move_down(GtkButton *b, gpointer d) { (void)b; move_row(d, +1); }

static void on_generate(GtkButton *btn, gpointer data)
{
    MainWindow *mw = data;
    (void)btn;

    const char *out_path = gtk_entry_get_text(GTK_ENTRY(mw->entry_output));
    if (!out_path || !*out_path) {
        GtkWidget *d = gtk_message_dialog_new(GTK_WINDOW(mw->window),
            GTK_DIALOG_MODAL, GTK_MESSAGE_WARNING, GTK_BUTTONS_OK,
            "출력 파일 경로를 입력해 주세요.");
        gtk_dialog_run(GTK_DIALOG(d));
        gtk_widget_destroy(d);
        return;
    }

    GPtrArray *files = get_checked_files(mw);
    if (files->len == 0) {
        GtkWidget *d = gtk_message_dialog_new(GTK_WINDOW(mw->window),
            GTK_DIALOG_MODAL, GTK_MESSAGE_WARNING, GTK_BUTTONS_OK,
            "병합할 파일을 선택해 주세요.");
        gtk_dialog_run(GTK_DIALOG(d));
        gtk_widget_destroy(d);
        g_ptr_array_unref(files);
        return;
    }

    MergeOptions opts = build_options(mw, FALSE);
    char *content = md_merger_merge(files, &opts);
    free_merge_options(&opts);
    g_ptr_array_unref(files);

    /* apply heading numbering */
    char *numbered = markdown_apply_heading_numbering(content);
    g_free(content);

    /* write file */
    GError *err = NULL;
    char *out_dir = g_path_get_dirname(out_path);
    g_mkdir_with_parents(out_dir, 0755);
    g_free(out_dir);

    if (!g_file_set_contents(out_path, numbered, -1, &err)) {
        char *msg = g_strdup_printf("[오류] %s", err->message);
        log_msg(mw, msg);
        g_free(msg);
        GtkWidget *d = gtk_message_dialog_new(GTK_WINDOW(mw->window),
            GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
            "%s", err->message);
        gtk_dialog_run(GTK_DIALOG(d));
        gtk_widget_destroy(d);
        g_error_free(err);
        g_free(numbered);
        return;
    }

    char *log = g_strdup_printf("[완료] → %s", out_path);
    log_msg(mw, log);
    g_free(log);
    persist_settings(mw);

    document_view_show(GTK_WINDOW(mw->window), numbered, out_path, mw->settings);
    g_free(numbered);
}

static void on_preview(GtkButton *btn, gpointer data)
{
    MainWindow *mw = data;
    (void)btn;

    GPtrArray *files = get_checked_files(mw);
    if (files->len == 0) {
        GtkWidget *d = gtk_message_dialog_new(GTK_WINDOW(mw->window),
            GTK_DIALOG_MODAL, GTK_MESSAGE_WARNING, GTK_BUTTONS_OK,
            "미리볼 파일이 없습니다.");
        gtk_dialog_run(GTK_DIALOG(d));
        gtk_widget_destroy(d);
        g_ptr_array_unref(files);
        return;
    }

    MergeOptions opts = build_options(mw, FALSE);
    char *content = md_merger_merge(files, &opts);
    free_merge_options(&opts);
    g_ptr_array_unref(files);

    char *numbered = markdown_apply_heading_numbering(content);
    g_free(content);

    document_view_show(GTK_WINDOW(mw->window), numbered, NULL, mw->settings);
    g_free(numbered);
}

/* ── window construction ───────────────────────────────────────────── */
GtkWidget *main_window_new(GtkApplication *app)
{
    MainWindow *mw = g_new0(MainWindow, 1);
    mw->settings = app_settings_load();

    /* top-level window */
    mw->window = gtk_application_window_new(app);
    gtk_window_set_title(GTK_WINDOW(mw->window), "MD Maker");
    gtk_window_set_default_size(GTK_WINDOW(mw->window), 780, 620);
    g_object_set_data_full(G_OBJECT(mw->window), "mw", mw, g_free);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_container_set_border_width(GTK_CONTAINER(vbox), 8);
    gtk_container_add(GTK_CONTAINER(mw->window), vbox);

    /* ── Source directory row ── */
    GtkWidget *row1 = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_box_pack_start(GTK_BOX(vbox), row1, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(row1), gtk_label_new("소스 디렉토리:"), FALSE, FALSE, 0);
    mw->entry_src = gtk_entry_new();
    gtk_widget_set_hexpand(mw->entry_src, TRUE);
    gtk_box_pack_start(GTK_BOX(row1), mw->entry_src, TRUE, TRUE, 0);
    GtkWidget *btn_browse_src = gtk_button_new_with_label("찾아보기");
    gtk_box_pack_start(GTK_BOX(row1), btn_browse_src, FALSE, FALSE, 0);
    g_signal_connect(btn_browse_src, "clicked", G_CALLBACK(on_browse_src), mw);
    g_signal_connect(mw->entry_src, "activate", G_CALLBACK(on_exclude_activate), mw);

    /* ── Output file row ── */
    GtkWidget *row2 = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_box_pack_start(GTK_BOX(vbox), row2, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(row2), gtk_label_new("출력 파일:"), FALSE, FALSE, 0);
    mw->entry_output = gtk_entry_new();
    gtk_widget_set_hexpand(mw->entry_output, TRUE);
    gtk_box_pack_start(GTK_BOX(row2), mw->entry_output, TRUE, TRUE, 0);
    GtkWidget *btn_browse_out = gtk_button_new_with_label("찾아보기");
    gtk_box_pack_start(GTK_BOX(row2), btn_browse_out, FALSE, FALSE, 0);
    g_signal_connect(btn_browse_out, "clicked", G_CALLBACK(on_browse_out), mw);

    /* ── Options row ── */
    GtkWidget *row3 = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_box_pack_start(GTK_BOX(vbox), row3, FALSE, FALSE, 0);

    mw->check_recursive = gtk_check_button_new_with_label("하위 폴더 포함");
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(mw->check_recursive), TRUE);
    gtk_box_pack_start(GTK_BOX(row3), mw->check_recursive, FALSE, FALSE, 0);
    g_signal_connect(mw->check_recursive, "toggled", G_CALLBACK(on_recursive_toggled), mw);

    mw->check_header = gtk_check_button_new_with_label("파일명을 헤더로 삽입");
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(mw->check_header), TRUE);
    gtk_box_pack_start(GTK_BOX(row3), mw->check_header, FALSE, FALSE, 0);

    gtk_box_pack_start(GTK_BOX(row3), gtk_label_new("정렬:"), FALSE, FALSE, 0);
    mw->combo_sort = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(mw->combo_sort), "이름 오름차순");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(mw->combo_sort), "이름 내림차순");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(mw->combo_sort), "날짜 최신순");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(mw->combo_sort), "날짜 오래된순");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(mw->combo_sort), "사용자 지정");
    gtk_combo_box_set_active(GTK_COMBO_BOX(mw->combo_sort), 0);
    gtk_box_pack_start(GTK_BOX(row3), mw->combo_sort, FALSE, FALSE, 0);
    g_signal_connect(mw->combo_sort, "changed", G_CALLBACK(on_sort_changed), mw);

    gtk_box_pack_start(GTK_BOX(row3), gtk_label_new("제외 패턴:"), FALSE, FALSE, 0);
    mw->entry_exclude = gtk_entry_new();
    gtk_widget_set_size_request(mw->entry_exclude, 150, -1);
    gtk_entry_set_placeholder_text(GTK_ENTRY(mw->entry_exclude), "예: draft*, *.bak");
    gtk_box_pack_start(GTK_BOX(row3), mw->entry_exclude, FALSE, FALSE, 0);
    g_signal_connect(mw->entry_exclude, "activate", G_CALLBACK(on_exclude_activate), mw);

    GtkWidget *btn_refresh = gtk_button_new_with_label("새로고침");
    gtk_box_pack_end(GTK_BOX(row3), btn_refresh, FALSE, FALSE, 0);
    g_signal_connect(btn_refresh, "clicked", G_CALLBACK(on_refresh), mw);

    /* ── File list + move buttons ── */
    GtkWidget *hpaned = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_box_pack_start(GTK_BOX(vbox), hpaned, TRUE, TRUE, 0);

    GtkListStore *store = gtk_list_store_new(N_COLS, G_TYPE_BOOLEAN, G_TYPE_STRING, G_TYPE_STRING);
    mw->tree_view = gtk_tree_view_new_with_model(GTK_TREE_MODEL(store));
    g_object_unref(store);
    gtk_tree_view_set_headers_visible(GTK_TREE_VIEW(mw->tree_view), TRUE);
    gtk_tree_view_set_reorderable(GTK_TREE_VIEW(mw->tree_view), FALSE);

    /* checkbox column */
    GtkCellRenderer *toggle = gtk_cell_renderer_toggle_new();
    g_signal_connect(toggle, "toggled", G_CALLBACK(on_checked_toggled), mw);
    GtkTreeViewColumn *col_chk = gtk_tree_view_column_new_with_attributes(
        "선택", toggle, "active", COL_CHECKED, NULL);
    gtk_tree_view_append_column(GTK_TREE_VIEW(mw->tree_view), col_chk);

    /* filename column */
    GtkCellRenderer *text_r = gtk_cell_renderer_text_new();
    GtkTreeViewColumn *col_name = gtk_tree_view_column_new_with_attributes(
        "파일명", text_r, "text", COL_DISPLAY, NULL);
    gtk_tree_view_column_set_expand(col_name, TRUE);
    gtk_tree_view_append_column(GTK_TREE_VIEW(mw->tree_view), col_name);

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
        GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(scroll), mw->tree_view);
    gtk_box_pack_start(GTK_BOX(hpaned), scroll, TRUE, TRUE, 0);

    /* up/down buttons */
    GtkWidget *vbtn = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_widget_set_valign(vbtn, GTK_ALIGN_CENTER);
    gtk_box_pack_start(GTK_BOX(hpaned), vbtn, FALSE, FALSE, 0);
    GtkWidget *btn_up   = gtk_button_new_with_label("▲");
    GtkWidget *btn_down = gtk_button_new_with_label("▼");
    gtk_box_pack_start(GTK_BOX(vbtn), btn_up,   FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbtn), btn_down,  FALSE, FALSE, 0);
    g_signal_connect(btn_up,   "clicked", G_CALLBACK(on_move_up),   mw);
    g_signal_connect(btn_down, "clicked", G_CALLBACK(on_move_down), mw);

    /* ── Status + action buttons ── */
    GtkWidget *row4 = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_box_pack_start(GTK_BOX(vbox), row4, FALSE, FALSE, 0);
    mw->label_count = gtk_label_new("0개 파일");
    gtk_box_pack_start(GTK_BOX(row4), mw->label_count, FALSE, FALSE, 0);

    GtkWidget *btn_preview  = gtk_button_new_with_label("미리보기");
    GtkWidget *btn_generate = gtk_button_new_with_label("생성");
    gtk_box_pack_end(GTK_BOX(row4), btn_generate, FALSE, FALSE, 0);
    gtk_box_pack_end(GTK_BOX(row4), btn_preview,  FALSE, FALSE, 0);
    g_signal_connect(btn_generate, "clicked", G_CALLBACK(on_generate), mw);
    g_signal_connect(btn_preview,  "clicked", G_CALLBACK(on_preview),  mw);

    /* ── Log area ── */
    GtkWidget *log_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(log_scroll),
        GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_size_request(log_scroll, -1, 100);
    mw->text_log   = gtk_text_view_new();
    mw->log_buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(mw->text_log));
    gtk_text_view_set_editable(GTK_TEXT_VIEW(mw->text_log), FALSE);
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(mw->text_log), GTK_WRAP_CHAR);
    gtk_container_add(GTK_CONTAINER(log_scroll), mw->text_log);
    gtk_box_pack_start(GTK_BOX(vbox), log_scroll, FALSE, FALSE, 0);

    /* restore settings */
    if (mw->settings->last_source_dir)
        gtk_entry_set_text(GTK_ENTRY(mw->entry_src), mw->settings->last_source_dir);
    if (mw->settings->last_output_file)
        gtk_entry_set_text(GTK_ENTRY(mw->entry_output), mw->settings->last_output_file);

    gtk_widget_show_all(mw->window);

    if (mw->settings->last_source_dir &&
        g_file_test(mw->settings->last_source_dir, G_FILE_TEST_IS_DIR))
        refresh_files(mw);

    return mw->window;
}
