#define _POSIX_C_SOURCE 200809L   /* for strdup */

#include "app_ui.h"
#include "audio_capture.h"
#include "model_manager.h"
#include "stt_core.h"
#include "video_player.h"

#include <glib.h>
#include <pango/pangocairo.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ── State machine ──────────────────────────────────────────────────────── */

typedef enum {
    STATE_IDLE,
    STATE_STREAMING,         /* real-time mic STT running */
    STATE_PROCESSING,        /* flushing remaining audio after mic stop */
    STATE_DOWNLOADING,
    STATE_VIDEO,             /* video file playing with real-time STT */
    STATE_VIDEO_PROCESSING,  /* video ended, flushing STT remainder */
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

    /* video */
    VideoPlayer     *video_player;
    GtkWidget       *content_paned;    /* VPaned: video (top) / text (bottom) */
    GtkWidget       *video_frame;      /* inner VBox inside video section */
    GtkWidget       *video_overlay;    /* GtkOverlay wrapping video_box */
    GtkWidget       *video_box;        /* main child of overlay: placeholder or video widget */
    GtkWidget       *video_placeholder;/* dark drawing area shown when no video */
    GtkWidget       *overlay_icon;     /* pause/play icon, briefly visible */
    GtkWidget       *seek_scale;       /* progress/seek bar */
    GtkWidget       *open_btn;
    GtkWidget       *pause_btn;
    GtkWidget       *time_label;
    guint            time_timer_id;
    guint            overlay_timer_id;
    gboolean         seeking;          /* user is dragging the seek bar */
    gboolean         seek_was_playing; /* was playing before drag started */

    /* Deduplication: suppress consecutive outputs that share the same
       leading bytes (catches "MBC 뉴스 이준범" / "MBC 뉴스 김성현" etc.) */
    char             stt_dedup[512];

    AppState state;
};

/* ── UI helpers ─────────────────────────────────────────────────────────── */

static void set_status(AppWindow *win, const char *msg) {
    gtk_label_set_text(GTK_LABEL(win->status_label), msg);
}

/* ── Video placeholder draw callback ────────────────────────────────────── */

static gboolean draw_video_placeholder(GtkWidget *w, cairo_t *cr, gpointer data) {
    AppWindow *win = (AppWindow *)data;
    int W = gtk_widget_get_allocated_width(w);
    int H = gtk_widget_get_allocated_height(w);

    cairo_set_source_rgb(cr, 0.08, 0.08, 0.08);
    cairo_paint(cr);

    const char *lines[2];
    if (win && win->state == STATE_VIDEO) {
        lines[0] = "♪  오디오 파일 재생 중";
        lines[1] = "STT 결과는 아래 영역에 표시됩니다";
    } else {
        lines[0] = "동영상 / 오디오 파일을 열어주세요";
        lines[1] = "[ 파일 열기 ] 버튼을 누르세요";
    }

    /* Use Pango for correct Unicode/emoji rendering */
    PangoLayout *layout = pango_cairo_create_layout(cr);
    PangoFontDescription *fd = pango_font_description_from_string("Sans 13");
    pango_layout_set_font_description(layout, fd);
    pango_font_description_free(fd);

    cairo_set_source_rgb(cr, 0.50, 0.50, 0.50);

    int line_h = 30;
    double top_y = (H - 2 * line_h) / 2.0;

    for (int i = 0; i < 2; i++) {
        pango_layout_set_text(layout, lines[i], -1);
        int pw, ph;
        pango_layout_get_pixel_size(layout, &pw, &ph);
        cairo_move_to(cr, (W - pw) / 2.0, top_y + i * line_h);
        pango_cairo_show_layout(cr, layout);
    }

    g_object_unref(layout);
    return FALSE;
}

static void set_ui_sensitive(AppWindow *win) {
    gboolean idle      = (win->state == STATE_IDLE);
    gboolean streaming = (win->state == STATE_STREAMING);
    gboolean video     = (win->state == STATE_VIDEO);
    gboolean dl        = (win->state == STATE_DOWNLOADING);

    gtk_widget_set_sensitive(win->mic_combo,    idle);
    gtk_widget_set_sensitive(win->model_combo,  idle);
    gtk_widget_set_sensitive(win->download_btn, idle);
    gtk_widget_set_sensitive(win->record_btn,   idle || streaming);
    gtk_widget_set_sensitive(win->open_btn,     idle || video);
    gtk_widget_set_sensitive(win->clear_btn,    idle || video);
    gtk_widget_set_sensitive(win->copy_btn,     idle || video);

    gtk_button_set_label(GTK_BUTTON(win->open_btn),
                         video ? "■ 동영상 중지" : "📂 파일 열기");
    gtk_widget_set_visible(win->pause_btn, video);
    gtk_widget_set_sensitive(win->seek_scale, video);

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
    AppWindow *win = (AppWindow *)userdata;

    /* Deduplication: suppress outputs that are identical to or share a long
       common prefix with the previous result.
       "MBC 뉴스 이준범입니다" and "MBC 뉴스 김성현입니다" both start with
       "MBC 뉴스 " (10 bytes) — one of the two would be suppressed.          */
    size_t tlen = strlen(text);
    size_t plen = strlen(win->stt_dedup);
    size_t cmp  = tlen < plen ? tlen : plen;
    /* Suppress exact match OR shared prefix ≥ 10 bytes */
    if (cmp >= 10 && strncmp(text, win->stt_dedup, 10) == 0) return;
    if (strcmp(text, win->stt_dedup) == 0) return;
    strncpy(win->stt_dedup, text, sizeof(win->stt_dedup) - 1);
    win->stt_dedup[sizeof(win->stt_dedup) - 1] = '\0';

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

/* ── Video audio callback (GStreamer streaming thread → SttStream) ─────── */

static void on_video_audio(const float *frames, int n, void *userdata) {
    AppWindow *win = (AppWindow *)userdata;
    if (win->stream)
        stt_stream_push(win->stream, frames, n);
}

/* ── Overlay icon (pause/play feedback) ─────────────────────────────────── */

static gboolean hide_overlay_icon(gpointer data) {
    AppWindow *win = (AppWindow *)data;
    gtk_widget_hide(win->overlay_icon);
    win->overlay_timer_id = 0;
    return G_SOURCE_REMOVE;
}

static void show_overlay_icon(AppWindow *win, const char *markup) {
    if (win->overlay_timer_id) {
        g_source_remove(win->overlay_timer_id);
        win->overlay_timer_id = 0;
    }
    gtk_label_set_markup(GTK_LABEL(win->overlay_icon), markup);
    gtk_widget_show(win->overlay_icon);
    win->overlay_timer_id = g_timeout_add(1200, hide_overlay_icon, win);
}

/* ── Seek bar: drag start / end ─────────────────────────────────────────── */

static gboolean on_seek_pressed(GtkWidget *w, GdkEventButton *ev, gpointer data) {
    (void)w; (void)ev;
    AppWindow *win = (AppWindow *)data;
    if (!win->video_player || win->state != STATE_VIDEO) return FALSE;
    win->seek_was_playing = !video_player_is_paused(win->video_player);
    win->seeking = TRUE;
    video_player_pause(win->video_player);
    return FALSE;
}

static gboolean on_seek_released(GtkWidget *w, GdkEventButton *ev, gpointer data) {
    (void)w; (void)ev;
    AppWindow *win = (AppWindow *)data;
    if (!win->video_player || win->state != STATE_VIDEO || !win->seeking) return FALSE;
    win->seeking = FALSE;

    gint64 pos = (gint64)gtk_range_get_value(GTK_RANGE(win->seek_scale));
    video_player_seek(win->video_player, pos);

    /* Discard audio accumulated before the seek, start fresh */
    if (win->stream) {
        stt_stream_cancel(win->stream);
        win->stream = stt_stream_new_ex(win->stt, STT_STREAM_TRANSCRIPTION,
                                         on_stt_segment, win);
    }
    win->stt_dedup[0] = '\0';

    if (win->seek_was_playing) {
        video_player_resume(win->video_player);
        gtk_button_set_label(GTK_BUTTON(win->pause_btn), "⏸ 일시정지");
    }
    return FALSE;
}

/* ── Video time display (GTK main thread, 500 ms interval) ──────────────── */

static gboolean update_time_label(gpointer data) {
    AppWindow *win = (AppWindow *)data;
    if (win->state != STATE_VIDEO || !win->video_player) {
        win->time_timer_id = 0;
        return G_SOURCE_REMOVE;
    }
    gint64 pos = video_player_position(win->video_player);
    gint64 dur = video_player_duration(win->video_player);

    char buf[32];
    snprintf(buf, sizeof(buf), "%d:%02d / %d:%02d",
             (int)(pos / 60), (int)(pos % 60),
             (int)(dur / 60), (int)(dur % 60));
    gtk_label_set_text(GTK_LABEL(win->time_label), buf);

    /* Update seek bar (skip when user is dragging to avoid feedback) */
    if (!win->seeking && dur > 0) {
        gdouble cur_max = gtk_adjustment_get_upper(
            gtk_range_get_adjustment(GTK_RANGE(win->seek_scale)));
        if ((gint64)cur_max != dur)
            gtk_range_set_range(GTK_RANGE(win->seek_scale), 0.0, (gdouble)dur);
        g_signal_handlers_block_by_func(win->seek_scale, on_seek_released, win);
        gtk_range_set_value(GTK_RANGE(win->seek_scale), (gdouble)pos);
        g_signal_handlers_unblock_by_func(win->seek_scale, on_seek_released, win);
    }
    return G_SOURCE_CONTINUE;
}

/* ── Pause / resume (GTK main thread) ───────────────────────────────────── */

static void on_pause_clicked(GtkButton *btn, gpointer data) {
    AppWindow *win = (AppWindow *)data;
    if (!win->video_player) return;

    if (video_player_is_paused(win->video_player)) {
        video_player_resume(win->video_player);
        gtk_button_set_label(btn, "⏸ 일시정지");
        show_overlay_icon(win, "<span color='white' size='xx-large'>▶</span>");
        set_status(win, "동영상 재생 중 – 실시간 인식 (한국어)");
    } else {
        video_player_pause(win->video_player);
        gtk_button_set_label(btn, "▶ 재생");
        show_overlay_icon(win, "<span color='white' size='xx-large'>⏸</span>");
        set_status(win, "일시정지");
    }
}

/* ── Audio-only file: hide video placeholder, show audio indicator ───────── */

static void on_audio_only(void *userdata) {
    AppWindow *win = (AppWindow *)userdata;
    if (win->state != STATE_VIDEO) return;
    /* Replace placeholder text with audio-mode indicator */
    gtk_widget_queue_draw(win->video_placeholder);
    set_status(win, "오디오 파일 재생 중 – 실시간 인식 (한국어)");
}

/* ── Video EOS: called on GTK main thread ───────────────────────────────── */

static gboolean video_flush_done_idle(gpointer data) {
    AppWindow *win = (AppWindow *)data;
    win->state = STATE_IDLE;
    gtk_button_set_label(GTK_BUTTON(win->record_btn), "▶ STT 시작");
    set_status(win, "동영상 처리 완료");
    set_ui_sensitive(win);
    return G_SOURCE_REMOVE;
}

static void *video_flush_thread(void *arg) {
    FlushTask *task = (FlushTask *)arg;
    stt_stream_flush(task->stream);
    stt_stream_free(task->stream);
    g_idle_add(video_flush_done_idle, task->win);
    free(task);
    return NULL;
}

static void on_video_eos(void *userdata) {
    AppWindow *win = (AppWindow *)userdata;
    if (win->state != STATE_VIDEO) return;

    /* Stop time-update timer */
    if (win->time_timer_id) {
        g_source_remove(win->time_timer_id);
        win->time_timer_id = 0;
    }
    gtk_label_set_text(GTK_LABEL(win->time_label), "0:00 / 0:00");
    gtk_range_set_range(GTK_RANGE(win->seek_scale), 0.0, 1.0);
    gtk_range_set_value(GTK_RANGE(win->seek_scale), 0.0);
    win->seeking = FALSE;

    if (win->overlay_timer_id) {
        g_source_remove(win->overlay_timer_id);
        win->overlay_timer_id = 0;
        gtk_widget_hide(win->overlay_icon);
    }

    video_player_stop(win->video_player);
    video_player_free(win->video_player);
    win->video_player = NULL;

    /* Remove video widget, restore placeholder */
    GList *children = gtk_container_get_children(GTK_CONTAINER(win->video_box));
    for (GList *l = children; l; l = l->next) {
        if (GTK_WIDGET(l->data) != win->video_placeholder)
            gtk_container_remove(GTK_CONTAINER(win->video_box), GTK_WIDGET(l->data));
    }
    g_list_free(children);
    gtk_widget_show(win->video_placeholder);
    gtk_paned_set_position(GTK_PANED(win->content_paned), 300);

    SttStream *stream = win->stream;
    win->stream       = NULL;
    win->state        = STATE_VIDEO_PROCESSING;
    set_status(win, "잔여 음성 처리 중...");
    set_ui_sensitive(win);

    FlushTask *task = malloc(sizeof(FlushTask));
    task->win    = win;
    task->stream = stream;
    pthread_t tid;
    pthread_create(&tid, NULL, video_flush_thread, task);
    pthread_detach(tid);
}

/* ── File open dialog ────────────────────────────────────────────────────── */

static void on_file_open_clicked(GtkButton *btn, gpointer data) {
    (void)btn;
    AppWindow *win = (AppWindow *)data;

    /* Stop video if already playing */
    if (win->state == STATE_VIDEO) {
        on_video_eos(win);
        return;
    }

    if (!win->stt) {
        set_status(win, "모델을 먼저 선택하고 다운로드하세요.");
        return;
    }

    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "동영상 파일 열기", GTK_WINDOW(win->window),
        GTK_FILE_CHOOSER_ACTION_OPEN,
        "취소", GTK_RESPONSE_CANCEL,
        "열기", GTK_RESPONSE_ACCEPT,
        NULL);

    /* Video file filter */
    GtkFileFilter *filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "동영상 파일");
    const char *exts[] = { "*.mp4","*.mkv","*.avi","*.mov","*.webm",
                            "*.flv","*.ts","*.m4v","*.wmv","*.mp3","*.wav",
                            "*.aac","*.ogg","*.flac", NULL };
    for (int i = 0; exts[i]; i++)
        gtk_file_filter_add_pattern(filter, exts[i]);
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), filter);

    GtkFileFilter *all = gtk_file_filter_new();
    gtk_file_filter_set_name(all, "모든 파일");
    gtk_file_filter_add_pattern(all, "*");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), all);

    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));

        win->video_player = video_player_new(path, on_video_audio,
                                              on_video_eos, on_audio_only, win);
        g_free(path);

        if (!win->video_player) {
            set_status(win, "[오류] 동영상을 열 수 없습니다.");
        } else {
            /* Hide placeholder, embed actual video widget */
            gtk_widget_hide(win->video_placeholder);
            GtkWidget *vw = video_player_widget(win->video_player);
            gtk_box_pack_start(GTK_BOX(win->video_box), vw, TRUE, TRUE, 0);
            gtk_widget_show(vw);

            /* Position paned divider so video and text are both visible */
            gtk_paned_set_position(GTK_PANED(win->content_paned), 360);

            /* Ensure the window is tall enough */
            int cw, ch;
            gtk_window_get_size(GTK_WINDOW(win->window), &cw, &ch);
            if (ch < 720)
                gtk_window_resize(GTK_WINDOW(win->window),
                                  cw < 960 ? 960 : cw, 720);

            win->stream = stt_stream_new_ex(win->stt, STT_STREAM_TRANSCRIPTION,
                                            on_stt_segment, win);
            win->state  = STATE_VIDEO;

            gtk_button_set_label(GTK_BUTTON(win->pause_btn), "⏸ 일시정지");
            gtk_range_set_range(GTK_RANGE(win->seek_scale), 0.0, 1.0);
            gtk_range_set_value(GTK_RANGE(win->seek_scale), 0.0);
            win->time_timer_id = g_timeout_add(500, update_time_label, win);

            set_status(win, "동영상 재생 중 – 실시간 인식 (한국어)");
            set_ui_sensitive(win);

            video_player_play(win->video_player);
        }
    }
    gtk_widget_destroy(dialog);
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
    (void)w;
    AppWindow *win = (AppWindow *)data;

    /* ① GLib 타이머 제거 (콜백이 더 이상 호출되지 않도록) */
    if (win->time_timer_id) {
        g_source_remove(win->time_timer_id);
        win->time_timer_id = 0;
    }
    if (win->overlay_timer_id) {
        g_source_remove(win->overlay_timer_id);
        win->overlay_timer_id = 0;
    }

    /* ② 오디오 캡처 중지 (마이크 → STT 피드 차단) */
    audio_capture_stop(win->capture);

    /* ③ stream 참조를 먼저 NULL 처리
         on_video_audio 등 GStreamer 스트리밍 스레드가 해제된 포인터를
         사용하지 않도록 반드시 video_player_stop 보다 먼저 수행한다. */
    SttStream *stream = win->stream;
    win->stream = NULL;

    /* ④ 비디오 플레이어 중지 (GStreamer 파이프라인 → NULL 상태로 전환)
         파이프라인이 완전히 멈춰야 남은 on_new_sample 콜백도 사라진다. */
    if (win->video_player) {
        video_player_stop(win->video_player);
        video_player_free(win->video_player);
        win->video_player = NULL;
    }

    /* ⑤ STT 스트림 취소 (워커 스레드 종료 대기, 미처리 오디오 폐기) */
    if (stream)
        stt_stream_cancel(stream);

    gtk_main_quit();
}

/* ── Window construction ─────────────────────────────────────────────────── */

AppWindow *app_window_new(void) {
    AppWindow *win = calloc(1, sizeof(AppWindow));
    win->state = STATE_IDLE;

    win->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(win->window),
                         "STT Korean – 한국어 실시간 음성 인식");
    gtk_window_set_default_size(GTK_WINDOW(win->window), 960, 720);
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

    /* ── Main content: GtkPaned (video top / STT text bottom) ── */
    win->content_paned = gtk_paned_new(GTK_ORIENTATION_VERTICAL);
    gtk_box_pack_start(GTK_BOX(root), win->content_paned, TRUE, TRUE, 0);

    /* ── Top pane: dedicated video section (always visible) ── */
    GtkWidget *video_section = gtk_frame_new("동영상");
    gtk_paned_pack1(GTK_PANED(win->content_paned), video_section, FALSE, FALSE);

    win->video_frame = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(video_section), win->video_frame);

    /* GtkOverlay: video_box is the main child, overlay_icon floats on top */
    win->video_overlay = gtk_overlay_new();
    gtk_box_pack_start(GTK_BOX(win->video_frame), win->video_overlay, TRUE, TRUE, 0);

    win->video_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(win->video_overlay), win->video_box);

    /* Pause/play overlay icon */
    win->overlay_icon = gtk_label_new("");
    gtk_widget_set_halign(win->overlay_icon, GTK_ALIGN_CENTER);
    gtk_widget_set_valign(win->overlay_icon, GTK_ALIGN_CENTER);
    gtk_widget_set_no_show_all(win->overlay_icon, TRUE);
    GtkCssProvider *icon_css = gtk_css_provider_new();
    gtk_css_provider_load_from_data(icon_css,
        "label { background-color: rgba(0,0,0,0.55);"
        "        border-radius: 50px;"
        "        padding: 12px 18px; }", -1, NULL);
    gtk_style_context_add_provider(gtk_widget_get_style_context(win->overlay_icon),
        GTK_STYLE_PROVIDER(icon_css), GTK_STYLE_PROVIDER_PRIORITY_USER);
    g_object_unref(icon_css);
    gtk_overlay_add_overlay(GTK_OVERLAY(win->video_overlay), win->overlay_icon);

    /* Placeholder shown when no video is loaded */
    win->video_placeholder = gtk_drawing_area_new();
    gtk_widget_set_size_request(win->video_placeholder, -1, 270);
    g_signal_connect(win->video_placeholder, "draw",
                     G_CALLBACK(draw_video_placeholder), win);
    gtk_box_pack_start(GTK_BOX(win->video_box), win->video_placeholder, TRUE, TRUE, 0);

    /* Video control bar: [⏸/▶] [seek scale............] [0:00 / 5:23] */
    GtkWidget *vctrl = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_container_set_border_width(GTK_CONTAINER(vctrl), 4);
    gtk_box_pack_start(GTK_BOX(win->video_frame), vctrl, FALSE, FALSE, 0);

    win->pause_btn = gtk_button_new_with_label("⏸ 일시정지");
    gtk_widget_set_no_show_all(win->pause_btn, TRUE);
    gtk_box_pack_start(GTK_BOX(vctrl), win->pause_btn, FALSE, FALSE, 0);
    g_signal_connect(win->pause_btn, "clicked", G_CALLBACK(on_pause_clicked), win);

    win->seek_scale = gtk_scale_new_with_range(GTK_ORIENTATION_HORIZONTAL, 0.0, 1.0, 1.0);
    gtk_scale_set_draw_value(GTK_SCALE(win->seek_scale), FALSE);
    gtk_widget_set_hexpand(win->seek_scale, TRUE);
    gtk_widget_set_sensitive(win->seek_scale, FALSE);
    gtk_box_pack_start(GTK_BOX(vctrl), win->seek_scale, TRUE, TRUE, 0);
    g_signal_connect(win->seek_scale, "button-press-event",
                     G_CALLBACK(on_seek_pressed), win);
    g_signal_connect(win->seek_scale, "button-release-event",
                     G_CALLBACK(on_seek_released), win);

    win->time_label = gtk_label_new("0:00 / 0:00");
    gtk_box_pack_start(GTK_BOX(vctrl), win->time_label, FALSE, FALSE, 0);

    /* ── Bottom pane: STT results section (always visible) ── */
    GtkWidget *text_section = gtk_frame_new("STT 결과");
    gtk_widget_set_size_request(text_section, -1, 150);
    gtk_paned_pack2(GTK_PANED(win->content_paned), text_section, TRUE, FALSE);

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(text_section), scroll);

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

    win->open_btn = gtk_button_new_with_label("📂 파일 열기");
    gtk_box_pack_start(GTK_BOX(btns), win->open_btn, FALSE, FALSE, 0);
    g_signal_connect(win->open_btn, "clicked", G_CALLBACK(on_file_open_clicked), win);

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
    /* Timers and player/stream are cleaned up in on_window_destroy.
       Guard against double-free for any that were missed. */
    if (win->time_timer_id)    { g_source_remove(win->time_timer_id);    win->time_timer_id    = 0; }
    if (win->overlay_timer_id) { g_source_remove(win->overlay_timer_id); win->overlay_timer_id = 0; }
    if (win->video_player)     { video_player_free(win->video_player);   win->video_player     = NULL; }
    if (win->stream)           { stt_stream_cancel(win->stream);         win->stream           = NULL; }
    audio_capture_free(win->capture);
    audio_device_list_free(win->devices);
    stt_context_free(win->stt);
    free(win);
}

GtkWidget *app_window_widget(AppWindow *win) {
    return win->window;
}
