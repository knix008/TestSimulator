/*
 * PandocLinux - GTK3 기반 Pandoc 문서 변환 도구 (C 구현)
 */

#include <gtk/gtk.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ── 포맷 테이블 ─────────────────────────────────────────────────── */

typedef struct { const char *id; const char *label; const char *ext; } Format;

static const Format INPUT_FORMATS[] = {
    { "docx",      "Microsoft Word (.docx)",      ".docx" },
    { "odt",       "OpenDocument Text (.odt)",     ".odt"  },
    { "markdown",  "Markdown (.md)",               ".md"   },
    { "rst",       "reStructuredText (.rst)",      ".rst"  },
    { "html",      "HTML (.html)",                 ".html" },
    { "latex",     "LaTeX (.tex)",                 ".tex"  },
    { "textile",   "Textile",                      ".txt"  },
    { "mediawiki", "MediaWiki markup",             ".txt"  },
    { "epub",      "EPUB (.epub)",                 ".epub" },
    { "csv",       "CSV (.csv)",                   ".csv"  },
    { "json",      "JSON (.json)",                 ".json" },
    { "org",       "Emacs Org-mode (.org)",        ".org"  },
    { "rtf",       "Rich Text Format (.rtf)",      ".rtf"  },
    { "txt",       "Plain Text (.txt)",            ".txt"  },
};
#define N_INPUT  (int)(sizeof(INPUT_FORMATS)  / sizeof(INPUT_FORMATS[0]))

static const Format OUTPUT_FORMATS[] = {
    { "docx",     "Microsoft Word (.docx)",         ".docx" },
    { "odt",      "OpenDocument Text (.odt)",        ".odt"  },
    { "pdf",      "PDF (.pdf)  *requires LaTeX",     ".pdf"  },
    { "markdown", "Markdown (.md)",                  ".md"   },
    { "rst",      "reStructuredText (.rst)",         ".rst"  },
    { "html",     "HTML (.html)",                    ".html" },
    { "html5",    "HTML5 (.html)",                   ".html" },
    { "latex",    "LaTeX (.tex)",                    ".tex"  },
    { "epub",     "EPUB (.epub)",                    ".epub" },
    { "epub3",    "EPUB3 (.epub)",                   ".epub" },
    { "rtf",      "Rich Text Format (.rtf)",         ".rtf"  },
    { "txt",      "Plain Text (.txt)",               ".txt"  },
    { "mediawiki","MediaWiki markup",                ".txt"  },
    { "org",      "Emacs Org-mode (.org)",           ".org"  },
    { "beamer",   "Beamer (LaTeX slides)",           ".tex"  },
    { "revealjs", "reveal.js (HTML slides)",         ".html" },
    { "asciidoc", "AsciiDoc",                        ".adoc" },
    { "man",      "Man page",                        ".1"    },
};
#define N_OUTPUT (int)(sizeof(OUTPUT_FORMATS) / sizeof(OUTPUT_FORMATS[0]))

/* ── 앱 상태 구조체 ──────────────────────────────────────────────── */

typedef struct {
    /* 창 */
    GtkWidget *window;

    /* 입력 파일 */
    GtkWidget *input_entry;

    /* 포맷 라디오 버튼 배열 */
    GtkWidget *in_radios[N_INPUT];
    GtkWidget *out_radios[N_OUTPUT];

    /* 출력 파일 */
    GtkWidget *output_entry;

    /* 추가 인자 */
    GtkWidget *extra_entry;

    /* 상태/진행 */
    GtkWidget *infobar;
    GtkWidget *infobar_label;
    GtkWidget *progress;
    GtkWidget *convert_btn;

    /* 로그 */
    GtkWidget     *log_view;
    GtkTextBuffer *log_buf;

    /* 타이머 ID */
    guint pulse_timer;
} App;

/* ── 유틸 ────────────────────────────────────────────────────────── */

/* 로그 추가 (메인 스레드 전용) */
static void app_log(App *app, const char *text)
{
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(app->log_buf, &end);
    gtk_text_buffer_insert(app->log_buf, &end, text, -1);
    gtk_text_buffer_insert(app->log_buf, &end, "\n", 1);

    GtkAdjustment *adj =
        gtk_scrolled_window_get_vadjustment(GTK_SCROLLED_WINDOW(
            gtk_widget_get_parent(app->log_view)));
    gtk_adjustment_set_value(adj, gtk_adjustment_get_upper(adj));
}

/* GLib idle 로 전달할 로그 메시지 */
typedef struct { App *app; char *text; } LogMsg;

static gboolean idle_log(gpointer data)
{
    LogMsg *m = data;
    app_log(m->app, m->text);
    g_free(m->text);
    g_free(m);
    return G_SOURCE_REMOVE;
}

static void post_log(App *app, const char *text)
{
    LogMsg *m = g_new(LogMsg, 1);
    m->app  = app;
    m->text = g_strdup(text);
    g_idle_add(idle_log, m);
}

/* 활성화된 라디오 버튼의 포맷 id 반환 */
static const char *get_active_fmt(GtkWidget **radios, const Format *fmts, int n)
{
    for (int i = 0; i < n; i++) {
        if (gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(radios[i])))
            return fmts[i].id;
    }
    return NULL;
}

/* 입력 파일의 확장자로 입력 포맷 라디오 버튼 자동 선택 */
static void auto_select_input_fmt(App *app, const char *path)
{
    const char *dot = strrchr(path, '.');
    if (!dot) return;
    const char *ext = dot + 1;

    const char *target = NULL;
    if      (!g_ascii_strcasecmp(ext,"docx"))     target = "docx";
    else if (!g_ascii_strcasecmp(ext,"odt"))      target = "odt";
    else if (!g_ascii_strcasecmp(ext,"md") ||
             !g_ascii_strcasecmp(ext,"markdown")) target = "markdown";
    else if (!g_ascii_strcasecmp(ext,"rst"))      target = "rst";
    else if (!g_ascii_strcasecmp(ext,"html") ||
             !g_ascii_strcasecmp(ext,"htm"))      target = "html";
    else if (!g_ascii_strcasecmp(ext,"tex"))      target = "latex";
    else if (!g_ascii_strcasecmp(ext,"epub"))     target = "epub";
    else if (!g_ascii_strcasecmp(ext,"txt"))      target = "txt";
    else if (!g_ascii_strcasecmp(ext,"rtf"))      target = "rtf";
    else if (!g_ascii_strcasecmp(ext,"org"))      target = "org";
    else if (!g_ascii_strcasecmp(ext,"csv"))      target = "csv";
    if (!target) return;

    for (int i = 0; i < N_INPUT; i++) {
        if (!strcmp(INPUT_FORMATS[i].id, target)) {
            gtk_toggle_button_set_active(
                GTK_TOGGLE_BUTTON(app->in_radios[i]), TRUE);
            return;
        }
    }
}

/* 출력 경로 자동 갱신 */
static void refresh_output_path(App *app)
{
    const char *in_path = gtk_entry_get_text(GTK_ENTRY(app->input_entry));
    if (!in_path || !*in_path) return;

    /* 활성화된 출력 포맷의 확장자 */
    const char *ext = ".out";
    for (int i = 0; i < N_OUTPUT; i++) {
        if (gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(app->out_radios[i]))) {
            ext = OUTPUT_FORMATS[i].ext;
            break;
        }
    }

    /* base (확장자 제거) + "_converted" + ext */
    const char *dot = strrchr(in_path, '.');
    char base[2048];
    if (dot) {
        size_t len = (size_t)(dot - in_path);
        if (len >= sizeof(base)) len = sizeof(base) - 1;
        strncpy(base, in_path, len);
        base[len] = '\0';
    } else {
        strncpy(base, in_path, sizeof(base) - 1);
        base[sizeof(base) - 1] = '\0';
    }

    char out_path[2300];
    snprintf(out_path, sizeof(out_path), "%s_converted%s", base, ext);
    gtk_entry_set_text(GTK_ENTRY(app->output_entry), out_path);
}

/* ── 변환 스레드 ─────────────────────────────────────────────────── */

typedef struct {
    App  *app;
    char *input_path;
    char *output_path;
    char *in_fmt;
    char *out_fmt;
    char *extra_args;
} ConvertArgs;

typedef struct { App *app; char *output_path; gboolean success; } ConvertResult;

static gboolean idle_convert_done(gpointer data)
{
    ConvertResult *r = data;
    App *app = r->app;

    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(app->progress), 0.0);
    gtk_widget_set_sensitive(app->convert_btn, TRUE);
    if (app->pulse_timer) {
        g_source_remove(app->pulse_timer);
        app->pulse_timer = 0;
    }

    if (r->success) {
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(app->progress), 1.0);
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window),
            GTK_DIALOG_MODAL,
            GTK_MESSAGE_INFO,
            GTK_BUTTONS_OK,
            "변환 완료");
        gtk_message_dialog_format_secondary_text(
            GTK_MESSAGE_DIALOG(dlg),
            "파일이 저장되었습니다:\n%s", r->output_path);
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(app->progress), 0.0);
    }

    g_free(r->output_path);
    g_free(r);
    return G_SOURCE_REMOVE;
}

static gpointer convert_thread(gpointer data)
{
    ConvertArgs *a = data;
    App *app = a->app;

    /* 명령 조립: pandoc -f IN -t OUT -o OUTPUT [EXTRA] INPUT */
    GString *cmd = g_string_new(NULL);
    g_string_printf(cmd, "pandoc -f %s -t %s -o \"%s\"",
                    a->in_fmt, a->out_fmt, a->output_path);

    /* PDF 출력 시 xelatex 엔진 및 한글 폰트 자동 추가 */
    if (!strcmp(a->out_fmt, "pdf")) {
        g_string_append(cmd, " --pdf-engine=xelatex");
        g_string_append(cmd, " -V mainfont=\"Noto Sans CJK KR\"");
        g_string_append(cmd, " -V monofont=\"Noto Sans Mono CJK KR\"");
        g_string_append(cmd, " -V geometry:margin=2.5cm");
    }

    if (a->extra_args && *a->extra_args)
        g_string_append_printf(cmd, " %s", a->extra_args);
    g_string_append_printf(cmd, " \"%s\" 2>&1", a->input_path);

    {
        char msg[512];
        snprintf(msg, sizeof(msg), "  명령: %s", cmd->str);
        post_log(app, msg);
    }

    FILE *fp = popen(cmd->str, "r");
    gboolean success = FALSE;
    if (!fp) {
        post_log(app, "✖  popen() 실패");
    } else {
        char line[1024];
        while (fgets(line, sizeof(line), fp)) {
            line[strcspn(line, "\n")] = '\0';
            post_log(app, line);
        }
        int ret = pclose(fp);
        if (ret == 0) {
            post_log(app, "✔  변환 완료!");
            success = TRUE;
        } else {
            char msg[64];
            snprintf(msg, sizeof(msg), "✖  변환 실패 (exit %d)", ret);
            post_log(app, msg);
        }
    }

    g_string_free(cmd, TRUE);

    ConvertResult *r = g_new(ConvertResult, 1);
    r->app         = app;
    r->output_path = g_strdup(a->output_path);
    r->success     = success;
    g_idle_add(idle_convert_done, r);

    g_free(a->input_path);
    g_free(a->output_path);
    g_free(a->in_fmt);
    g_free(a->out_fmt);
    g_free(a->extra_args);
    g_free(a);
    return NULL;
}

/* ── 시그널 핸들러 ───────────────────────────────────────────────── */

static void on_open_file(GtkButton *btn, gpointer user_data)
{
    (void)btn;
    App *app = user_data;

    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "변환할 파일 선택", GTK_WINDOW(app->window),
        GTK_FILE_CHOOSER_ACTION_OPEN,
        "_취소", GTK_RESPONSE_CANCEL,
        "_열기", GTK_RESPONSE_OK, NULL);

    GtkFileFilter *f1 = gtk_file_filter_new();
    gtk_file_filter_set_name(f1, "문서 파일");
    const char *patterns[] = {
        "*.docx","*.odt","*.md","*.rst","*.html","*.htm",
        "*.tex","*.epub","*.txt","*.rtf","*.org","*.csv", NULL
    };
    for (int i = 0; patterns[i]; i++)
        gtk_file_filter_add_pattern(f1, patterns[i]);
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), f1);

    GtkFileFilter *f2 = gtk_file_filter_new();
    gtk_file_filter_set_name(f2, "모든 파일");
    gtk_file_filter_add_pattern(f2, "*");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), f2);

    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_OK) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
        gtk_entry_set_text(GTK_ENTRY(app->input_entry), path);
        auto_select_input_fmt(app, path);
        refresh_output_path(app);
        g_free(path);
    }
    gtk_widget_destroy(dialog);
}

static void on_save_file(GtkButton *btn, gpointer user_data)
{
    (void)btn;
    App *app = user_data;

    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "저장 위치 선택", GTK_WINDOW(app->window),
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL,
        "_저장", GTK_RESPONSE_OK, NULL);

    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dialog), TRUE);
    const char *cur = gtk_entry_get_text(GTK_ENTRY(app->output_entry));
    if (cur && *cur)
        gtk_file_chooser_set_filename(GTK_FILE_CHOOSER(dialog), cur);

    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_OK) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
        gtk_entry_set_text(GTK_ENTRY(app->output_entry), path);
        g_free(path);
    }
    gtk_widget_destroy(dialog);
}

/* 출력 포맷 라디오 버튼 toggled → 출력 경로 갱신 */
static void on_out_radio_toggled(GtkToggleButton *btn, gpointer user_data)
{
    if (!gtk_toggle_button_get_active(btn)) return;
    App *app = user_data;
    refresh_output_path(app);
}

static gboolean pulse_cb(gpointer data)
{
    App *app = data;
    gtk_progress_bar_pulse(GTK_PROGRESS_BAR(app->progress));
    return G_SOURCE_CONTINUE;
}

static void on_convert(GtkButton *btn, gpointer user_data)
{
    (void)btn;
    App *app = user_data;

    const char *input_path  = gtk_entry_get_text(GTK_ENTRY(app->input_entry));
    const char *output_path = gtk_entry_get_text(GTK_ENTRY(app->output_entry));

    /* 선택된 포맷 id */
    const char *in_fmt_raw  = get_active_fmt(app->in_radios,  INPUT_FORMATS,  N_INPUT);
    const char *out_fmt_raw = get_active_fmt(app->out_radios, OUTPUT_FORMATS, N_OUTPUT);
    gchar *in_fmt  = in_fmt_raw  ? g_strdup(in_fmt_raw)  : NULL;
    gchar *out_fmt = out_fmt_raw ? g_strdup(out_fmt_raw) : NULL;

    /* 검증 */
    GString *errors = g_string_new(NULL);
    if (!input_path || !*input_path)
        g_string_append(errors, "• 입력 파일을 선택해 주세요.\n");
    else if (!g_file_test(input_path, G_FILE_TEST_IS_REGULAR))
        g_string_append_printf(errors, "• 입력 파일을 찾을 수 없습니다:\n  %s\n",
                               input_path);
    if (!output_path || !*output_path)
        g_string_append(errors, "• 출력 파일 경로를 입력해 주세요.\n");
    if (!in_fmt)
        g_string_append(errors, "• 입력 포맷을 선택해 주세요.\n");
    if (!out_fmt)
        g_string_append(errors, "• 출력 포맷을 선택해 주세요.\n");

    if (errors->len > 0) {
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window), GTK_DIALOG_MODAL,
            GTK_MESSAGE_ERROR, GTK_BUTTONS_OK, "입력 오류");
        gtk_message_dialog_format_secondary_text(
            GTK_MESSAGE_DIALOG(dlg), "%s", errors->str);
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
        g_string_free(errors, TRUE);
        g_free(in_fmt); g_free(out_fmt);
        return;
    }
    g_string_free(errors, TRUE);

    /* 로그 초기화 */
    gtk_text_buffer_set_text(app->log_buf, "", 0);
    {
        char msg[512];
        snprintf(msg, sizeof(msg), "변환 시작: %s", g_path_get_basename(input_path));
        app_log(app, msg);
        snprintf(msg, sizeof(msg), "  %s  →  %s", in_fmt, out_fmt);
        app_log(app, msg);
        snprintf(msg, sizeof(msg), "  출력: %s", output_path);
        app_log(app, msg);
    }

    gtk_widget_set_sensitive(app->convert_btn, FALSE);
    app->pulse_timer = g_timeout_add(80, pulse_cb, app);

    ConvertArgs *args = g_new(ConvertArgs, 1);
    args->app         = app;
    args->input_path  = g_strdup(input_path);
    args->output_path = g_strdup(output_path);
    args->in_fmt      = in_fmt;
    args->out_fmt     = out_fmt;
    args->extra_args  = g_strdup(gtk_entry_get_text(GTK_ENTRY(app->extra_entry)));

    g_thread_new("pandoc-convert", convert_thread, args);
}

/* ── UI 구축 ─────────────────────────────────────────────────────── */

/* 라디오 버튼 그룹을 ScrolledWindow 안의 VBox 에 생성 */
static GtkWidget *make_radio_group(const Format *fmts, int n,
                                   GtkWidget **radios_out,
                                   GCallback toggled_cb, gpointer cb_data)
{
    GtkWidget *sw = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(sw),
        GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_size_request(sw, -1, 180);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 2);
    gtk_container_set_border_width(GTK_CONTAINER(vbox), 6);
    gtk_container_add(GTK_CONTAINER(sw), vbox);

    GSList *group = NULL;
    for (int i = 0; i < n; i++) {
        GtkWidget *radio =
            gtk_radio_button_new_with_label(group, fmts[i].label);
        group = gtk_radio_button_get_group(GTK_RADIO_BUTTON(radio));
        radios_out[i] = radio;
        if (toggled_cb)
            g_signal_connect(radio, "toggled", toggled_cb, cb_data);
        gtk_box_pack_start(GTK_BOX(vbox), radio, FALSE, FALSE, 0);
    }

    return sw;
}

static void build_ui(App *app)
{
    app->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(app->window), "PandocLinux - 문서 변환기");
    gtk_window_set_default_size(GTK_WINDOW(app->window), 720, 620);
    gtk_container_set_border_width(GTK_CONTAINER(app->window), 10);
    g_signal_connect(app->window, "destroy", G_CALLBACK(gtk_main_quit), NULL);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 8);
    gtk_container_add(GTK_CONTAINER(app->window), vbox);

    /* ── Pandoc 상태 InfoBar ── */
    app->infobar = gtk_info_bar_new();
    gtk_info_bar_set_show_close_button(GTK_INFO_BAR(app->infobar), FALSE);
    app->infobar_label = gtk_label_new("");
    gtk_container_add(
        GTK_CONTAINER(gtk_info_bar_get_content_area(GTK_INFO_BAR(app->infobar))),
        app->infobar_label);
    gtk_box_pack_start(GTK_BOX(vbox), app->infobar, FALSE, FALSE, 0);

    /* ── 입력 파일 ── */
    GtkWidget *in_frame = gtk_frame_new("  입력 파일  ");
    gtk_box_pack_start(GTK_BOX(vbox), in_frame, FALSE, FALSE, 0);
    {
        GtkWidget *hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
        gtk_container_set_border_width(GTK_CONTAINER(hbox), 8);
        gtk_container_add(GTK_CONTAINER(in_frame), hbox);

        app->input_entry = gtk_entry_new();
        gtk_entry_set_placeholder_text(GTK_ENTRY(app->input_entry),
                                       "변환할 파일을 선택하세요...");
        gtk_editable_set_editable(GTK_EDITABLE(app->input_entry), FALSE);
        gtk_widget_set_hexpand(app->input_entry, TRUE);
        gtk_box_pack_start(GTK_BOX(hbox), app->input_entry, TRUE, TRUE, 0);

        GtkWidget *btn = gtk_button_new_with_label("파일 선택...");
        g_signal_connect(btn, "clicked", G_CALLBACK(on_open_file), app);
        gtk_box_pack_start(GTK_BOX(hbox), btn, FALSE, FALSE, 0);
    }

    /* ── 포맷 선택 (2열, 라디오 버튼) ── */
    GtkWidget *fmt_hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 10);
    gtk_box_pack_start(GTK_BOX(vbox), fmt_hbox, TRUE, TRUE, 0);

    /* 입력 포맷 */
    {
        GtkWidget *frame = gtk_frame_new("  입력 포맷  ");
        gtk_box_pack_start(GTK_BOX(fmt_hbox), frame, TRUE, TRUE, 0);

        GtkWidget *sw = make_radio_group(INPUT_FORMATS, N_INPUT,
                                         app->in_radios, NULL, NULL);
        gtk_container_add(GTK_CONTAINER(frame), sw);
    }

    /* 출력 포맷 */
    {
        GtkWidget *frame = gtk_frame_new("  출력 포맷  ");
        gtk_box_pack_start(GTK_BOX(fmt_hbox), frame, TRUE, TRUE, 0);

        GtkWidget *sw = make_radio_group(OUTPUT_FORMATS, N_OUTPUT,
                                         app->out_radios,
                                         G_CALLBACK(on_out_radio_toggled), app);
        gtk_container_add(GTK_CONTAINER(frame), sw);
    }

    /* ── 출력 파일 ── */
    GtkWidget *out_frame = gtk_frame_new("  출력 파일  ");
    gtk_box_pack_start(GTK_BOX(vbox), out_frame, FALSE, FALSE, 0);
    {
        GtkWidget *hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
        gtk_container_set_border_width(GTK_CONTAINER(hbox), 8);
        gtk_container_add(GTK_CONTAINER(out_frame), hbox);

        app->output_entry = gtk_entry_new();
        gtk_entry_set_placeholder_text(GTK_ENTRY(app->output_entry),
                                       "저장할 파일 경로...");
        gtk_widget_set_hexpand(app->output_entry, TRUE);
        gtk_box_pack_start(GTK_BOX(hbox), app->output_entry, TRUE, TRUE, 0);

        GtkWidget *btn = gtk_button_new_with_label("저장 위치...");
        g_signal_connect(btn, "clicked", G_CALLBACK(on_save_file), app);
        gtk_box_pack_start(GTK_BOX(hbox), btn, FALSE, FALSE, 0);
    }

    /* ── 추가 옵션 Expander ── */
    GtkWidget *expander = gtk_expander_new(" 추가 Pandoc 옵션");
    gtk_box_pack_start(GTK_BOX(vbox), expander, FALSE, FALSE, 0);
    {
        GtkWidget *hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
        gtk_container_set_border_width(GTK_CONTAINER(hbox), 6);
        gtk_container_add(GTK_CONTAINER(expander), hbox);

        gtk_box_pack_start(GTK_BOX(hbox),
            gtk_label_new("추가 인자:"), FALSE, FALSE, 0);

        app->extra_entry = gtk_entry_new();
        gtk_entry_set_placeholder_text(GTK_ENTRY(app->extra_entry),
                                       "예: --toc --standalone");
        gtk_widget_set_hexpand(app->extra_entry, TRUE);
        gtk_box_pack_start(GTK_BOX(hbox), app->extra_entry, TRUE, TRUE, 0);
    }

    /* ── 변환 버튼 + 프로그레스바 ── */
    GtkWidget *action_hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_box_pack_start(GTK_BOX(vbox), action_hbox, FALSE, FALSE, 0);

    app->progress = gtk_progress_bar_new();
    gtk_widget_set_hexpand(app->progress, TRUE);
    gtk_box_pack_start(GTK_BOX(action_hbox), app->progress, TRUE, TRUE, 0);

    app->convert_btn = gtk_button_new_with_label("  변환 시작  ");
    gtk_style_context_add_class(
        gtk_widget_get_style_context(app->convert_btn), "suggested-action");
    g_signal_connect(app->convert_btn, "clicked", G_CALLBACK(on_convert), app);
    gtk_box_pack_start(GTK_BOX(action_hbox), app->convert_btn, FALSE, FALSE, 0);

    /* ── 로그 ── */
    GtkWidget *log_frame = gtk_frame_new("  변환 로그  ");
    gtk_box_pack_start(GTK_BOX(vbox), log_frame, TRUE, TRUE, 0);
    {
        GtkWidget *sw = gtk_scrolled_window_new(NULL, NULL);
        gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(sw),
            GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
        gtk_widget_set_size_request(sw, -1, 90);
        gtk_container_add(GTK_CONTAINER(log_frame), sw);

        app->log_view = gtk_text_view_new();
        gtk_text_view_set_editable(GTK_TEXT_VIEW(app->log_view), FALSE);
        gtk_text_view_set_cursor_visible(GTK_TEXT_VIEW(app->log_view), FALSE);
        gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(app->log_view),
                                    GTK_WRAP_WORD_CHAR);
        app->log_buf = gtk_text_view_get_buffer(GTK_TEXT_VIEW(app->log_view));
        gtk_container_add(GTK_CONTAINER(sw), app->log_view);
    }
}

/* ── Pandoc 설치 확인 ────────────────────────────────────────────── */

static void check_pandoc(App *app)
{
    FILE *fp = popen("pandoc --version 2>&1", "r");
    if (!fp) {
        gtk_info_bar_set_message_type(GTK_INFO_BAR(app->infobar),
                                      GTK_MESSAGE_WARNING);
        gtk_label_set_text(GTK_LABEL(app->infobar_label),
            "⚠  Pandoc이 설치되어 있지 않습니다. "
            "setup.sh 를 실행하거나 'sudo apt install pandoc' 으로 설치하세요.");
        gtk_widget_set_sensitive(app->convert_btn, FALSE);
        return;
    }
    char line[256] = {0};
    if (fgets(line, sizeof(line), fp) == NULL)
        line[0] = '\0';
    pclose(fp);
    line[strcspn(line, "\n")] = '\0';

    if (strncmp(line, "pandoc", 6) != 0) {
        gtk_info_bar_set_message_type(GTK_INFO_BAR(app->infobar),
                                      GTK_MESSAGE_WARNING);
        gtk_label_set_text(GTK_LABEL(app->infobar_label),
            "⚠  Pandoc을 찾을 수 없습니다. setup.sh 를 실행해 주세요.");
        gtk_widget_set_sensitive(app->convert_btn, FALSE);
    } else {
        char msg[300];
        snprintf(msg, sizeof(msg), "✔  %s", line);
        gtk_info_bar_set_message_type(GTK_INFO_BAR(app->infobar),
                                      GTK_MESSAGE_INFO);
        gtk_label_set_text(GTK_LABEL(app->infobar_label), msg);
    }
}

/* ── main ────────────────────────────────────────────────────────── */

int main(int argc, char *argv[])
{
    gtk_init(&argc, &argv);

    App *app = g_new0(App, 1);
    build_ui(app);
    gtk_widget_show_all(app->window);
    check_pandoc(app);

    gtk_main();

    g_free(app);
    return 0;
}
