#define _POSIX_C_SOURCE 200809L   /* for strdup */

#include "app_ui.h"
#include "audio_capture.h"
#include "model_manager.h"
#include "stt_core.h"

#include <glib.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ── State machine ──────────────────────────────────────────────────────── */

typedef enum {
    STATE_IDLE,
    STATE_STREAMING,   /* real-time STT running */
    STATE_PROCESSING,  /* flushing remaining audio after stop */
    STATE_DOWNLOADING,
} AppState;

struct AppWindow {
    /* widgets */
    GtkWidget     *window;
    GtkWidget     *mic_combo;
    GtkWidget     *model_combo;
    GtkWidget     *download_btn;
    GtkWidget     *progress_bar;
    GtkWidget     *progress_label;
    GtkWidget     *record_btn;
    GtkWidget     *clear_btn;
    GtkWidget     *copy_btn;
    GtkWidget     *text_view;
    GtkTextBuffer *text_buffer;
    GtkTextMark   *end_mark;
    GtkWidget     *status_label;

    /* core objects */
    AudioDeviceList *devices;
    AudioCapture    *capture;
    SttStream       *stream;
    SttContext      *stt;

    AppState state;
};

/* ── UI helpers ─────────────────────────────────────────────────────────── */

static void set_status(AppWindow *win, const char *msg) {
    gtk_label_set_text(GTK_LABEL(win->status_label), msg);
}

static void set_ui_sensitive(AppWindow *win) {
    gboolean idle      = (win->state == STATE_IDLE);
    gboolean streaming = (win->state == STATE_STREAMING);
    gboolean dl        = (win->state == STATE_DOWNLOADING);

    gtk_widget_set_sensitive(win->mic_combo,    idle);
    gtk_widget_set_sensitive(win->model_combo,  idle);
    gtk_widget_set_sensitive(win->download_btn, idle);
    gtk_widget_set_sensitive(win->record_btn,   idle || streaming);
    gtk_widget_set_sensitive(win->clear_btn,    idle);
    gtk_widget_set_sensitive(win->copy_btn,     idle);

    gtk_widget_set_visible(win->progress_bar,   dl);
    gtk_widget_set_visible(win->progress_label, dl);
}

/* ── Idle-callback payload types ─────────────────────────────────────────── */

typedef struct { AppWindow *win; char *text; }   TextPayload;
typedef struct { AppWindow *win; double frac; }  ProgressPayload;
typedef struct { AppWindow *win; int success; }  DonePayload;

/* ── Text append (safe to call from any thread via g_idle_add) ─────────── */

static gboolean append_text_idle(gpointer data) {
    TextPayload *p = (TextPayload *)data;
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(p->win->text_buffer, &end);
    gtk_text_buffer_insert(p->win->text_buffer, &end, p->text, -1);
    gtk_text_buffer_insert(p->win->text_buffer, &end, "\n", -1);

    /* Auto-scroll */
    gtk_text_buffer_get_end_iter(p->win->text_buffer, &end);
    gtk_text_buffer_move_mark(p->win->text_buffer, p->win->end_mark, &end);
    gtk_text_view_scroll_mark_onscreen(GTK_TEXT_VIEW(p->win->text_view),
                                       p->win->end_mark);
    free(p->text);
    free(p);
    return G_SOURCE_REMOVE;
}

/* Called from SttStream worker thread */
static void on_stt_segment(const char *text, void *userdata) {
    AppWindow   *win = (AppWindow *)userdata;
    TextPayload *p   = malloc(sizeof(TextPayload));
    p->win  = win;
    p->text = strdup(text);
    g_idle_add(append_text_idle, p);
}

/* ── Flush thread (runs when user stops streaming) ───────────────────────── */

typedef struct {
    AppWindow *win;
    SttStream *stream;
} FlushTask;

static gboolean flush_done_idle(gpointer data) {
    AppWindow *win = (AppWindow *)data;
    win->state = STATE_IDLE;
    gtk_button_set_label(GTK_BUTTON(win->record_btn), "▶ STT 시작");
    set_status(win, "준비");
    set_ui_sensitive(win);
    return G_SOURCE_REMOVE;
}

static void *flush_thread(void *arg) {
    FlushTask *task = (FlushTask *)arg;
    stt_stream_flush(task->stream);   /* blocks: whisper processes remainder */
    stt_stream_free(task->stream);
    g_idle_add(flush_done_idle, task->win);
    free(task);
    return NULL;
}

/* ── Audio frame callback (PortAudio thread → SttStream) ─────────────────── */

static void on_audio_frame(const float *frames, int n, void *userdata) {
    AppWindow *win = (AppWindow *)userdata;
    if (win->stream)
        stt_stream_push(win->stream, frames, n);
}

/* ── Download callbacks ──────────────────────────────────────────────────── */

static gboolean progress_idle(gpointer data) {
    ProgressPayload *p = (ProgressPayload *)data;
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(p->win->progress_bar), p->frac);
    char buf[64];
    snprintf(buf, sizeof(buf), "다운로드 중... %.0f%%", p->frac * 100.0);
    gtk_label_set_text(GTK_LABEL(p->win->progress_label), buf);
    free(p);
    return G_SOURCE_REMOVE;
}

static gboolean download_done_idle(gpointer data) {
    DonePayload *p  = (DonePayload *)data;
    AppWindow   *win = p->win;
    int          ok  = p->success;
    free(p);

    win->state = STATE_IDLE;
    set_ui_sensitive(win);

    if (ok) {
        set_status(win, "다운로드 완료 – 모델 로드 중...");
        int n; const WhisperModel *models = model_list(&n);
        int idx = gtk_combo_box_get_active(GTK_COMBO_BOX(win->model_combo));
        if (idx >= 0 && idx < n) {
            stt_context_free(win->stt);
            win->stt = NULL;
            char *path = model_path(&models[idx]);
            win->stt = stt_context_new(path);
            free(path);

            /* Update combo label to show ✓ */
            char label[128];
            snprintf(label, sizeof(label), "%s ✓", models[idx].display_name);
            gtk_combo_box_text_remove(GTK_COMBO_BOX_TEXT(win->model_combo), idx);
            gtk_combo_box_text_insert_text(GTK_COMBO_BOX_TEXT(win->model_combo),
                                           idx, label);
            gtk_combo_box_set_active(GTK_COMBO_BOX(win->model_combo), idx);

            set_status(win, win->stt ? "모델 로드 완료 – 녹음 준비" : "[오류] 모델 로드 실패");
        }
    } else {
        set_status(win, "[오류] 다운로드 실패");
    }
    return G_SOURCE_REMOVE;
}

static void on_download_progress(double frac, void *userdata) {
    ProgressPayload *p = malloc(sizeof(ProgressPayload));
    p->win  = (AppWindow *)userdata;
    p->frac = frac;
    g_idle_add(progress_idle, p);
}

static void on_download_done(int success, void *userdata) {
    DonePayload *p = malloc(sizeof(DonePayload));
    p->win     = (AppWindow *)userdata;
    p->success = success;
    g_idle_add(download_done_idle, p);
}

/* ── Signal callbacks ────────────────────────────────────────────────────── */

static void on_mic_refresh_clicked(GtkButton *btn, gpointer data) {
    (void)btn;
    AppWindow *win = (AppWindow *)data;

    audio_device_list_free(win->devices);
    win->devices = audio_enumerate_devices();

    gtk_combo_box_text_remove_all(GTK_COMBO_BOX_TEXT(win->mic_combo));
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(win->mic_combo), "기본 장치");
    for (int i = 0; i < win->devices->count; i++)
        gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(win->mic_combo),
                                       win->devices->devices[i].name);
    gtk_combo_box_set_active(GTK_COMBO_BOX(win->mic_combo), 0);
}

static void on_model_combo_changed(GtkComboBox *combo, gpointer data) {
    AppWindow *win = (AppWindow *)data;
    int idx = gtk_combo_box_get_active(combo);
    int n;  const WhisperModel *models = model_list(&n);
    if (idx < 0 || idx >= n) return;

    stt_context_free(win->stt);
    win->stt = NULL;

    if (model_is_ready(&models[idx])) {
        set_status(win, "모델 로드 중...");
        char *path = model_path(&models[idx]);
        win->stt = stt_context_new(path);
        free(path);
        set_status(win, win->stt ? "모델 로드 완료 – 녹음 준비"
                                 : "[오류] 모델 로드 실패");
    } else {
        set_status(win, "모델 없음 – [다운로드] 버튼으로 내려받으세요");
    }
}

static void on_download_clicked(GtkButton *btn, gpointer data) {
    (void)btn;
    AppWindow *win = (AppWindow *)data;
    int idx = gtk_combo_box_get_active(GTK_COMBO_BOX(win->model_combo));
    int n;  const WhisperModel *models = model_list(&n);
    if (idx < 0 || idx >= n) return;

    if (model_is_ready(&models[idx])) { set_status(win, "이미 다운로드된 모델입니다."); return; }

    win->state = STATE_DOWNLOADING;
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(win->progress_bar), 0.0);
    set_ui_sensitive(win);
    set_status(win, "다운로드 시작...");
    model_download_async(&models[idx], on_download_progress, on_download_done, win);
}

static void on_record_clicked(GtkButton *btn, gpointer data) {
    (void)btn;
    AppWindow *win = (AppWindow *)data;

    if (win->state == STATE_STREAMING) {
        /* ── STOP ── */
        audio_capture_stop(win->capture);

        /* Hand the stream to the flush thread; clear our reference */
        SttStream *stream = win->stream;
        win->stream       = NULL;

        win->state = STATE_PROCESSING;
        gtk_button_set_label(GTK_BUTTON(win->record_btn), "처리 중...");
        set_status(win, "잔여 음성 처리 중...");
        set_ui_sensitive(win);

        FlushTask *task = malloc(sizeof(FlushTask));
        task->win    = win;
        task->stream = stream;
        pthread_t tid;
        pthread_create(&tid, NULL, flush_thread, task);
        pthread_detach(tid);

    } else {
        /* ── START ── */
        if (!win->stt) {
            set_status(win, "모델을 먼저 선택하고 다운로드하세요.");
            return;
        }

        int         mic_idx   = gtk_combo_box_get_active(GTK_COMBO_BOX(win->mic_combo));
        int         pa_index  = -1;
        const char *pa_source = "";
        if (mic_idx > 0 && win->devices && (mic_idx - 1) < win->devices->count) {
            AudioDevice *dev = &win->devices->devices[mic_idx - 1];
            pa_index  = dev->index;
            pa_source = dev->pa_source;
        }

        audio_capture_free(win->capture);
        win->capture = audio_capture_new(pa_index, pa_source, on_audio_frame, win);
        win->stream  = stt_stream_new(win->stt, on_stt_segment, win);

        if (audio_capture_start(win->capture) != 0) {
            SttStream *s = win->stream;
            win->stream  = NULL;
            stt_stream_flush(s);
            stt_stream_free(s);
            audio_capture_free(win->capture);
            win->capture = NULL;
            set_status(win, "[오류] 마이크를 열 수 없습니다.");
            return;
        }

        win->state = STATE_STREAMING;
        gtk_button_set_label(GTK_BUTTON(win->record_btn), "■ STT 중지");
        set_status(win, "실시간 인식 중... (한국어)");
        set_ui_sensitive(win);
    }
}

static void on_clear_clicked(GtkButton *btn, gpointer data) {
    (void)btn;
    AppWindow *win = (AppWindow *)data;
    gtk_text_buffer_set_text(win->text_buffer, "", -1);
    set_status(win, "텍스트 지움");
}

static void on_copy_clicked(GtkButton *btn, gpointer data) {
    (void)btn;
    AppWindow   *win = (AppWindow *)data;
    GtkClipboard *cb = gtk_clipboard_get(GDK_SELECTION_CLIPBOARD);
    GtkTextIter   s, e;
    gtk_text_buffer_get_bounds(win->text_buffer, &s, &e);
    char *text = gtk_text_buffer_get_text(win->text_buffer, &s, &e, FALSE);
    gtk_clipboard_set_text(cb, text, -1);
    g_free(text);
    set_status(win, "클립보드에 복사됨");
}

static void on_window_destroy(GtkWidget *w, gpointer data) {
    (void)w; (void)data;
    gtk_main_quit();
}

/* ── Window construction ─────────────────────────────────────────────────── */

AppWindow *app_window_new(void) {
    AppWindow *win = calloc(1, sizeof(AppWindow));
    win->state = STATE_IDLE;

    win->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(win->window),
                         "STT Korean – 한국어 실시간 음성 인식");
    gtk_window_set_default_size(GTK_WINDOW(win->window), 720, 540);
    gtk_container_set_border_width(GTK_CONTAINER(win->window), 8);
    g_signal_connect(win->window, "destroy", G_CALLBACK(on_window_destroy), win);

    GtkWidget *root = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_container_add(GTK_CONTAINER(win->window), root);

    /* ── Settings frame ── */
    GtkWidget *frame = gtk_frame_new("설정");
    gtk_box_pack_start(GTK_BOX(root), frame, FALSE, FALSE, 0);

    GtkWidget *grid = gtk_grid_new();
    gtk_grid_set_column_spacing(GTK_GRID(grid), 6);
    gtk_grid_set_row_spacing(GTK_GRID(grid), 4);
    gtk_container_set_border_width(GTK_CONTAINER(grid), 6);
    gtk_container_add(GTK_CONTAINER(frame), grid);

    /* Mic row */
    GtkWidget *lm = gtk_label_new("마이크:");
    gtk_widget_set_halign(lm, GTK_ALIGN_END);
    gtk_grid_attach(GTK_GRID(grid), lm, 0, 0, 1, 1);
    win->mic_combo = gtk_combo_box_text_new();
    gtk_widget_set_hexpand(win->mic_combo, TRUE);
    gtk_grid_attach(GTK_GRID(grid), win->mic_combo, 1, 0, 1, 1);
    GtkWidget *rb = gtk_button_new_with_label("새로고침");
    gtk_grid_attach(GTK_GRID(grid), rb, 2, 0, 1, 1);
    g_signal_connect(rb, "clicked", G_CALLBACK(on_mic_refresh_clicked), win);

    /* Model row */
    GtkWidget *lmod = gtk_label_new("모델:");
    gtk_widget_set_halign(lmod, GTK_ALIGN_END);
    gtk_grid_attach(GTK_GRID(grid), lmod, 0, 1, 1, 1);
    win->model_combo = gtk_combo_box_text_new();
    gtk_widget_set_hexpand(win->model_combo, TRUE);
    gtk_grid_attach(GTK_GRID(grid), win->model_combo, 1, 1, 1, 1);
    win->download_btn = gtk_button_new_with_label("다운로드");
    gtk_grid_attach(GTK_GRID(grid), win->download_btn, 2, 1, 1, 1);
    g_signal_connect(win->download_btn, "clicked", G_CALLBACK(on_download_clicked), win);

    /* Populate models */
    int n; const WhisperModel *models = model_list(&n);
    for (int i = 0; i < n; i++) {
        char label[128];
        snprintf(label, sizeof(label),
                 model_is_ready(&models[i]) ? "%s ✓" : "%s",
                 models[i].display_name);
        gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(win->model_combo), label);
    }
    gtk_combo_box_set_active(GTK_COMBO_BOX(win->model_combo), 0);
    g_signal_connect(win->model_combo, "changed",
                     G_CALLBACK(on_model_combo_changed), win);

    /* ── Download progress ── */
    win->progress_label = gtk_label_new("다운로드 중...");
    gtk_widget_set_no_show_all(win->progress_label, TRUE);
    gtk_box_pack_start(GTK_BOX(root), win->progress_label, FALSE, FALSE, 0);

    win->progress_bar = gtk_progress_bar_new();
    gtk_widget_set_no_show_all(win->progress_bar, TRUE);
    gtk_box_pack_start(GTK_BOX(root), win->progress_bar, FALSE, FALSE, 0);

    /* ── Text view ── */
    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_vexpand(scroll, TRUE);
    gtk_box_pack_start(GTK_BOX(root), scroll, TRUE, TRUE, 0);

    win->text_view = gtk_text_view_new();
    gtk_text_view_set_editable(GTK_TEXT_VIEW(win->text_view), TRUE);
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(win->text_view), GTK_WRAP_WORD_CHAR);
    gtk_text_view_set_left_margin(GTK_TEXT_VIEW(win->text_view), 6);
    gtk_text_view_set_right_margin(GTK_TEXT_VIEW(win->text_view), 6);
    gtk_text_view_set_top_margin(GTK_TEXT_VIEW(win->text_view), 4);
    win->text_buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(win->text_view));
    gtk_container_add(GTK_CONTAINER(scroll), win->text_view);

    /* Persistent end mark for auto-scroll */
    GtkTextIter iter;
    gtk_text_buffer_get_end_iter(win->text_buffer, &iter);
    win->end_mark = gtk_text_buffer_create_mark(win->text_buffer, "end", &iter, FALSE);

    /* ── Buttons ── */
    GtkWidget *btns = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_pack_start(GTK_BOX(root), btns, FALSE, FALSE, 0);

    win->record_btn = gtk_button_new_with_label("▶ STT 시작");
    gtk_widget_set_hexpand(win->record_btn, TRUE);
    gtk_box_pack_start(GTK_BOX(btns), win->record_btn, TRUE, TRUE, 0);
    g_signal_connect(win->record_btn, "clicked", G_CALLBACK(on_record_clicked), win);

    win->clear_btn = gtk_button_new_with_label("지우기");
    gtk_box_pack_start(GTK_BOX(btns), win->clear_btn, FALSE, FALSE, 0);
    g_signal_connect(win->clear_btn, "clicked", G_CALLBACK(on_clear_clicked), win);

    win->copy_btn = gtk_button_new_with_label("복사");
    gtk_box_pack_start(GTK_BOX(btns), win->copy_btn, FALSE, FALSE, 0);
    g_signal_connect(win->copy_btn, "clicked", G_CALLBACK(on_copy_clicked), win);

    /* ── Status bar ── */
    win->status_label = gtk_label_new("준비");
    gtk_widget_set_halign(win->status_label, GTK_ALIGN_START);
    gtk_box_pack_start(GTK_BOX(root), win->status_label, FALSE, FALSE, 0);

    /* Initialise device list and try to pre-load model */
    on_mic_refresh_clicked(NULL, win);
    on_model_combo_changed(GTK_COMBO_BOX(win->model_combo), win);

    return win;
}

void app_window_free(AppWindow *win) {
    if (!win) return;
    audio_capture_free(win->capture);
    audio_device_list_free(win->devices);
    stt_context_free(win->stt);
    /* stream freed by flush_thread or abandoned on exit */
    free(win);
}

GtkWidget *app_window_widget(AppWindow *win) {
    return win->window;
}
