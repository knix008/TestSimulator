#include "ui.h"
#include "waveform_widget.h"
#include "file_saver.h"
#include "audio_player.h"

#include <string.h>
#include <stdio.h>

/* ── UI state (one per window) ────────────────────────────────────────────── */

typedef struct {
    App *app;

    /* Widgets */
    GtkWidget *window;
    GtkWidget *engine_combo;
    GtkWidget *voice_combo;
    GtkWidget *speed_scale;
    GtkWidget *pitch_scale;
    GtkWidget *volume_scale;
    GtkWidget *text_view;
    GtkWidget *waveform;
    GtkWidget *progress;
    GtkWidget *play_btn;
    GtkWidget *stop_btn;
    GtkWidget *save_wav_btn;
    GtkWidget *save_mp3_btn;
    GtkWidget *status_label;
} UiState;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

static void set_status(UiState *ui, const char *msg)
{
    gtk_label_set_text(GTK_LABEL(ui->status_label), msg);
}

static void set_playback_sensitive(UiState *ui, bool can_play)
{
    gtk_widget_set_sensitive(ui->play_btn,     can_play);
    gtk_widget_set_sensitive(ui->save_wav_btn, can_play);
    gtk_widget_set_sensitive(ui->save_mp3_btn, can_play);
}

static void set_synth_sensitive(UiState *ui, bool sensitive)
{
    gtk_widget_set_sensitive(ui->engine_combo, sensitive);
    gtk_widget_set_sensitive(ui->voice_combo,  sensitive);
    gtk_widget_set_sensitive(ui->text_view,    sensitive);
}

static void populate_voices(UiState *ui, TTSEngine *engine)
{
    GtkComboBoxText *cb = GTK_COMBO_BOX_TEXT(ui->voice_combo);
    gtk_combo_box_text_remove_all(cb);
    if (!engine) return;

    int count = 0;
    const char **voices = engine->get_voices(engine, &count);
    if (!voices) return;

    for (int i = 0; i < count; i++)
        gtk_combo_box_text_append_text(cb, voices[i]);
    free(voices);

    gtk_combo_box_set_active(GTK_COMBO_BOX(cb), 0);
}

/* ── App callbacks (called on GLib main thread) ───────────────────────────── */

static void cb_synth_start(App *app, void *user)
{
    (void)app;
    UiState *ui = user;
    set_synth_sensitive(ui, false);
    set_playback_sensitive(ui, false);
    gtk_widget_set_sensitive(ui->stop_btn, false);
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(ui->progress), 0.0);
    set_status(ui, "합성 중...");
}

static void cb_synth_done(App *app, bool ok, void *user)
{
    UiState *ui = user;
    set_synth_sensitive(ui, true);
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(ui->progress), 0.0);

    if (ok) {
        AudioData *audio = app->audio;
        waveform_widget_set_data(ui->waveform,
                                 audio->samples,
                                 audio->num_samples,
                                 audio->sample_rate);

        char buf[128];
        double dur = (double)audio->num_samples / audio->sample_rate;
        snprintf(buf, sizeof(buf),
                 "준비 완료  (%.1f초, %d Hz)", dur, audio->sample_rate);
        set_status(ui, buf);
        set_playback_sensitive(ui, true);
    } else {
        set_status(ui, "합성 실패");
        set_playback_sensitive(ui, false);
    }
}

static void cb_playback(App *app, bool playing, double pos, void *user)
{
    (void)app;
    UiState *ui = user;
    waveform_widget_set_pos(ui->waveform, pos);

    if (!playing) {
        gtk_widget_set_sensitive(ui->play_btn, true);
        gtk_widget_set_sensitive(ui->stop_btn, false);
        set_status(ui, "재생 완료");
    }
}

/* ── Progress pulse timer ─────────────────────────────────────────────────── */

static gboolean pulse_progress(gpointer user)
{
    UiState *ui = user;
    if (!app_is_synthesizing(ui->app)) return G_SOURCE_REMOVE;
    gtk_progress_bar_pulse(GTK_PROGRESS_BAR(ui->progress));
    return G_SOURCE_CONTINUE;
}

/* ── Signal handlers ──────────────────────────────────────────────────────── */

static void on_engine_changed(GtkComboBox *combo, gpointer user)
{
    UiState *ui = user;
    int idx = gtk_combo_box_get_active(combo);
    if (idx < 0 || idx >= ui->app->engine_count) return;

    ui->app->active_engine_idx = idx;
    populate_voices(ui, ui->app->engines[idx]);
    waveform_widget_clear(ui->waveform);
    audio_data_free(ui->app->audio);
    ui->app->audio = NULL;
    set_playback_sensitive(ui, false);
}

static void on_synthesize(GtkWidget *btn, gpointer user)
{
    (void)btn;
    UiState *ui = user;

    if (app_is_synthesizing(ui->app)) return;

    GtkTextBuffer *buf = gtk_text_view_get_buffer(GTK_TEXT_VIEW(ui->text_view));
    GtkTextIter s, e;
    gtk_text_buffer_get_bounds(buf, &s, &e);
    char *text = gtk_text_buffer_get_text(buf, &s, &e, FALSE);

    if (!text || strlen(g_strstrip(text)) == 0) {
        set_status(ui, "텍스트를 입력하세요.");
        g_free(text);
        return;
    }

    char *voice = gtk_combo_box_text_get_active_text(
                      GTK_COMBO_BOX_TEXT(ui->voice_combo));
    int speed = (int)gtk_range_get_value(GTK_RANGE(ui->speed_scale));
    int pitch = (int)gtk_range_get_value(GTK_RANGE(ui->pitch_scale));

    app_synthesize(ui->app, text, voice, speed, pitch);
    g_free(text);
    g_free(voice);

    g_timeout_add(100, pulse_progress, ui);
}

static void on_play(GtkWidget *btn, gpointer user)
{
    (void)btn;
    UiState *ui = user;
    if (!app_has_audio(ui->app)) return;

    double vol = gtk_range_get_value(GTK_RANGE(ui->volume_scale)) / 100.0;
    app_play(ui->app, vol);

    gtk_widget_set_sensitive(ui->play_btn, false);
    gtk_widget_set_sensitive(ui->stop_btn, true);
    set_status(ui, "재생 중...");
}

static void on_stop(GtkWidget *btn, gpointer user)
{
    (void)btn;
    UiState *ui = user;
    app_stop(ui->app);
    waveform_widget_set_pos(ui->waveform, 0.0);
    gtk_widget_set_sensitive(ui->play_btn, true);
    gtk_widget_set_sensitive(ui->stop_btn, false);
    set_status(ui, "정지됨");
}

static void on_volume_changed(GtkRange *range, gpointer user)
{
    UiState *ui = user;
    double vol = gtk_range_get_value(range) / 100.0;
    audio_player_set_volume(ui->app->player, vol);
}

static void on_load_file(GtkWidget *btn, gpointer user)
{
    (void)btn;
    UiState *ui = user;

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "텍스트 파일 열기", GTK_WINDOW(ui->window),
        GTK_FILE_CHOOSER_ACTION_OPEN,
        "_취소", GTK_RESPONSE_CANCEL,
        "_열기", GTK_RESPONSE_ACCEPT, NULL);

    GtkFileFilter *ff = gtk_file_filter_new();
    gtk_file_filter_set_name(ff, "텍스트 파일");
    gtk_file_filter_add_mime_type(ff, "text/plain");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), ff);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        gchar *content = NULL; gsize len;
        if (g_file_get_contents(path, &content, &len, NULL)) {
            GtkTextBuffer *buf =
                gtk_text_view_get_buffer(GTK_TEXT_VIEW(ui->text_view));
            gtk_text_buffer_set_text(buf, content, -1);
            g_free(content);
            char status[512];
            snprintf(status, sizeof(status), "파일 로드됨: %s", path);
            set_status(ui, status);
        } else {
            set_status(ui, "파일 읽기 실패");
        }
        g_free(path);
    }
    gtk_widget_destroy(dlg);
}

static void save_dialog(UiState *ui, bool as_mp3)
{
    if (!app_has_audio(ui->app)) return;

    const char *title      = as_mp3 ? "MP3로 저장" : "WAV로 저장";
    const char *default_fn = as_mp3 ? "output.mp3" : "output.wav";
    const char *ext        = as_mp3 ? ".mp3"       : ".wav";

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        title, GTK_WINDOW(ui->window),
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL,
        "_저장", GTK_RESPONSE_ACCEPT, NULL);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dlg), default_fn);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dlg), TRUE);

    GtkFileFilter *ff = gtk_file_filter_new();
    char ff_label[32];
    snprintf(ff_label, sizeof(ff_label), "%s 파일 (*%s)",
             as_mp3 ? "MP3" : "WAV", ext);
    gtk_file_filter_set_name(ff, ff_label);
    char pattern[16];
    snprintf(pattern, sizeof(pattern), "*%s", ext);
    gtk_file_filter_add_pattern(ff, pattern);
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), ff);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        char *final = g_str_has_suffix(path, ext)
                      ? path
                      : g_strconcat(path, ext, NULL);

        bool ok = as_mp3
                  ? file_save_mp3(final, ui->app->audio, 128)
                  : file_save_wav(final, ui->app->audio);

        char status[512];
        if (ok)
            snprintf(status, sizeof(status), "%s 저장됨: %s",
                     as_mp3 ? "MP3" : "WAV", final);
        else
            snprintf(status, sizeof(status), "%s 저장 실패",
                     as_mp3 ? "MP3" : "WAV");
        set_status(ui, status);

        if (final != path) g_free(final);
        g_free(path);
    }
    gtk_widget_destroy(dlg);
}

static void on_save_wav(GtkWidget *btn, gpointer user)
{ (void)btn; save_dialog(user, false); }

static void on_save_mp3(GtkWidget *btn, gpointer user)
{ (void)btn; save_dialog(user, true); }

/* ── Widget helpers ───────────────────────────────────────────────────────── */

static GtkWidget *labeled_scale(const char *label, double min, double max,
                                 double step, double val,
                                 GtkWidget **scale_out)
{
    GtkWidget *hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_pack_start(GTK_BOX(hbox), gtk_label_new(label), FALSE, FALSE, 0);

    GtkWidget *sc = gtk_scale_new_with_range(GTK_ORIENTATION_HORIZONTAL,
                                             min, max, step);
    gtk_range_set_value(GTK_RANGE(sc), val);
    gtk_scale_set_draw_value(GTK_SCALE(sc), TRUE);
    gtk_widget_set_hexpand(sc, TRUE);
    gtk_box_pack_start(GTK_BOX(hbox), sc, TRUE, TRUE, 0);

    if (scale_out) *scale_out = sc;
    return hbox;
}

/* ── Main UI builder ──────────────────────────────────────────────────────── */

GtkWidget *ui_build(App *app)
{
    UiState *ui = g_new0(UiState, 1);
    ui->app = app;

    /* Register app callbacks */
    app->on_synth_start = cb_synth_start;
    app->on_synth_done  = cb_synth_done;
    app->on_playback    = cb_playback;
    app->cb_user        = ui;

    /* Window */
    ui->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(ui->window), "TTS Simulator");
    gtk_window_set_default_size(GTK_WINDOW(ui->window), 820, 680);
    gtk_container_set_border_width(GTK_CONTAINER(ui->window), 10);
    g_signal_connect(ui->window, "destroy", G_CALLBACK(gtk_main_quit), NULL);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 8);
    gtk_container_add(GTK_CONTAINER(ui->window), vbox);

    /* ── Engine / Voice ──────────────────────────────────────────────────── */
    GtkWidget *ef = gtk_frame_new("TTS 엔진 / 음성");
    gtk_box_pack_start(GTK_BOX(vbox), ef, FALSE, FALSE, 0);
    GtkWidget *ehbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_container_set_border_width(GTK_CONTAINER(ehbox), 8);
    gtk_container_add(GTK_CONTAINER(ef), ehbox);

    gtk_box_pack_start(GTK_BOX(ehbox), gtk_label_new("엔진:"), FALSE, FALSE, 0);
    ui->engine_combo = gtk_combo_box_text_new();
    gtk_widget_set_size_request(ui->engine_combo, 140, -1);
    for (int i = 0; i < app->engine_count; i++)
        gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(ui->engine_combo),
                                       app->engines[i]->name);
    gtk_combo_box_set_active(GTK_COMBO_BOX(ui->engine_combo), 0);
    g_signal_connect(ui->engine_combo, "changed",
                     G_CALLBACK(on_engine_changed), ui);
    gtk_box_pack_start(GTK_BOX(ehbox), ui->engine_combo, FALSE, FALSE, 0);

    gtk_box_pack_start(GTK_BOX(ehbox),
                       gtk_label_new("음성:"), FALSE, FALSE, 8);
    ui->voice_combo = gtk_combo_box_text_new();
    gtk_widget_set_size_request(ui->voice_combo, 210, -1);
    gtk_box_pack_start(GTK_BOX(ehbox), ui->voice_combo, FALSE, FALSE, 0);
    populate_voices(ui, app_active_engine(app));

    /* ── Parameters ──────────────────────────────────────────────────────── */
    GtkWidget *pf = gtk_frame_new("파라미터");
    gtk_box_pack_start(GTK_BOX(vbox), pf, FALSE, FALSE, 0);
    GtkWidget *pgrid = gtk_grid_new();
    gtk_grid_set_column_spacing(GTK_GRID(pgrid), 8);
    gtk_grid_set_row_spacing   (GTK_GRID(pgrid), 4);
    gtk_container_set_border_width(GTK_CONTAINER(pgrid), 8);
    gtk_container_add(GTK_CONTAINER(pf), pgrid);

    GtkWidget *speed_row = labeled_scale("속도 (WPM):", 80, 450, 5, 175,
                                          &ui->speed_scale);
    gtk_widget_set_hexpand(speed_row, TRUE);
    gtk_grid_attach(GTK_GRID(pgrid), speed_row, 0, 0, 1, 1);

    GtkWidget *pitch_row = labeled_scale("피치:", 0, 100, 1, 50,
                                          &ui->pitch_scale);
    gtk_widget_set_hexpand(pitch_row, TRUE);
    gtk_grid_attach(GTK_GRID(pgrid), pitch_row, 1, 0, 1, 1);

    /* ── Text input ──────────────────────────────────────────────────────── */
    GtkWidget *tf = gtk_frame_new("텍스트 입력");
    gtk_box_pack_start(GTK_BOX(vbox), tf, TRUE, TRUE, 0);
    GtkWidget *tvbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_container_set_border_width(GTK_CONTAINER(tvbox), 8);
    gtk_container_add(GTK_CONTAINER(tf), tvbox);

    GtkWidget *file_btn = gtk_button_new_with_label("파일에서 텍스트 불러오기...");
    g_signal_connect(file_btn, "clicked", G_CALLBACK(on_load_file), ui);
    gtk_box_pack_start(GTK_BOX(tvbox), file_btn, FALSE, FALSE, 0);

    GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_widget_set_size_request(scroll, -1, 110);
    gtk_box_pack_start(GTK_BOX(tvbox), scroll, TRUE, TRUE, 0);

    ui->text_view = gtk_text_view_new();
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(ui->text_view),
                                GTK_WRAP_WORD_CHAR);
    gtk_container_add(GTK_CONTAINER(scroll), ui->text_view);

    GtkWidget *synth_btn = gtk_button_new_with_label("합성 (Synthesize)");
    gtk_style_context_add_class(gtk_widget_get_style_context(synth_btn),
                                "suggested-action");
    g_signal_connect(synth_btn, "clicked", G_CALLBACK(on_synthesize), ui);
    gtk_box_pack_start(GTK_BOX(tvbox), synth_btn, FALSE, FALSE, 0);

    /* ── Waveform ─────────────────────────────────────────────────────────── */
    GtkWidget *wf_frame = gtk_frame_new("파형 (Waveform)");
    gtk_box_pack_start(GTK_BOX(vbox), wf_frame, FALSE, FALSE, 0);
    ui->waveform = waveform_widget_new();
    gtk_container_set_border_width(GTK_CONTAINER(wf_frame), 4);
    gtk_container_add(GTK_CONTAINER(wf_frame), ui->waveform);

    /* ── Progress ─────────────────────────────────────────────────────────── */
    ui->progress = gtk_progress_bar_new();
    gtk_box_pack_start(GTK_BOX(vbox), ui->progress, FALSE, FALSE, 0);

    /* ── Playback controls ────────────────────────────────────────────────── */
    GtkWidget *cf = gtk_frame_new("재생 제어");
    gtk_box_pack_start(GTK_BOX(vbox), cf, FALSE, FALSE, 0);
    GtkWidget *cvbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_container_set_border_width(GTK_CONTAINER(cvbox), 8);
    gtk_container_add(GTK_CONTAINER(cf), cvbox);

    /* Volume row */
    GtkWidget *vol_row = labeled_scale("볼륨:", 0, 100, 1, 80, &ui->volume_scale);
    g_signal_connect(ui->volume_scale, "value-changed",
                     G_CALLBACK(on_volume_changed), ui);
    gtk_box_pack_start(GTK_BOX(cvbox), vol_row, FALSE, FALSE, 0);

    /* Button row */
    GtkWidget *btn_hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_box_pack_start(GTK_BOX(cvbox), btn_hbox, FALSE, FALSE, 0);

    ui->play_btn = gtk_button_new_with_label("▶ 재생");
    gtk_widget_set_sensitive(ui->play_btn, false);
    g_signal_connect(ui->play_btn, "clicked", G_CALLBACK(on_play), ui);
    gtk_box_pack_start(GTK_BOX(btn_hbox), ui->play_btn, TRUE, TRUE, 0);

    ui->stop_btn = gtk_button_new_with_label("■ 정지");
    gtk_widget_set_sensitive(ui->stop_btn, false);
    g_signal_connect(ui->stop_btn, "clicked", G_CALLBACK(on_stop), ui);
    gtk_box_pack_start(GTK_BOX(btn_hbox), ui->stop_btn, TRUE, TRUE, 0);

    ui->save_wav_btn = gtk_button_new_with_label("WAV 저장");
    gtk_widget_set_sensitive(ui->save_wav_btn, false);
    g_signal_connect(ui->save_wav_btn, "clicked", G_CALLBACK(on_save_wav), ui);
    gtk_box_pack_start(GTK_BOX(btn_hbox), ui->save_wav_btn, TRUE, TRUE, 0);

    ui->save_mp3_btn = gtk_button_new_with_label("MP3 저장");
    gtk_widget_set_sensitive(ui->save_mp3_btn, false);
    g_signal_connect(ui->save_mp3_btn, "clicked", G_CALLBACK(on_save_mp3), ui);
    gtk_box_pack_start(GTK_BOX(btn_hbox), ui->save_mp3_btn, TRUE, TRUE, 0);

    /* ── Status bar ───────────────────────────────────────────────────────── */
    GtkWidget *sf2 = gtk_frame_new(NULL);
    gtk_box_pack_start(GTK_BOX(vbox), sf2, FALSE, FALSE, 0);
    ui->status_label = gtk_label_new("준비됨");
    gtk_label_set_xalign(GTK_LABEL(ui->status_label), 0.02f);
    gtk_container_add(GTK_CONTAINER(sf2), ui->status_label);

    return ui->window;
}
