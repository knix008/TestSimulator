#include "main_window.h"
#include "midi_parser.h"
#include "midi_player.h"
#include "piano_roll.h"
#include "audio_exporter.h"
#include "general_midi.h"
#include <gtk/gtk.h>
#include <glib.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* ── App state ─────────────────────────────────────────────────── */

typedef struct {
    GtkWidget  *window;
    GtkWidget  *lbl_file;
    GtkWidget  *lbl_tracks;
    GtkWidget  *lbl_notes;
    GtkWidget  *lbl_duration;
    GtkWidget  *btn_play;
    GtkWidget  *btn_pause;
    GtkWidget  *btn_stop;
    GtkWidget  *combo_instr;
    GtkWidget  *lbl_cur_time;
    GtkWidget  *lbl_tot_time;
    GtkWidget  *slider;
    GtkWidget  *statusbar;
    GtkWidget  *progressbar;
    GtkWidget  *progress_box;
    guint       statusbar_ctx;
    guint       ui_timer_id;

    PianoRoll  *piano_roll;
    MidiFile   *midi_file;
    MidiPlayer *player;

    char  soundfont_path[1024];
    char  midi_path[1024];

    gboolean slider_dragging;
    gboolean exporting;
} AppState;

/* ── helpers ───────────────────────────────────────────────────── */

static void format_time(char *buf, size_t sz, double secs) {
    int m = (int)(secs / 60.0);
    int s = (int)(secs) % 60;
    snprintf(buf, sz, "%02d:%02d", m, s);
}

static void set_status(AppState *app, const char *msg) {
    gtk_statusbar_pop (GTK_STATUSBAR(app->statusbar), app->statusbar_ctx);
    gtk_statusbar_push(GTK_STATUSBAR(app->statusbar), app->statusbar_ctx, msg);
}

static void update_buttons(AppState *app) {
    PlayerState st       = midi_player_get_state(app->player);
    gboolean    has_file = (app->midi_file != NULL) && !app->exporting;
    gtk_widget_set_sensitive(app->btn_play,  has_file && st != PLAYER_PLAYING);
    gtk_widget_set_sensitive(app->btn_pause, has_file && st == PLAYER_PLAYING);
    gtk_widget_set_sensitive(app->btn_stop,  has_file && st != PLAYER_STOPPED);
    gtk_widget_set_sensitive(app->slider,    has_file);
}

/* ── UI timer (GTK main thread) ─────────────────────────────── */

/* midi_player_tick() is called here so no GLib/GTK is needed inside
   the player itself.  Callbacks fired by tick() run here on the UI thread. */

static gboolean on_ui_timer(gpointer data) {
    AppState *app = data;
    midi_player_tick(app->player);
    return G_SOURCE_CONTINUE;
}

/* ── player callbacks (called from on_ui_timer on GTK main thread) ── */

static void on_position(double secs, void *data) {
    AppState *app = data;
    if (app->slider_dragging) return;
    double dur = midi_player_get_duration(app->player);
    if (dur <= 0.0) return;

    char buf[16];
    format_time(buf, sizeof(buf), secs);
    gtk_label_set_text(GTK_LABEL(app->lbl_cur_time), buf);
    gtk_range_set_value(GTK_RANGE(app->slider), secs / dur * 1000.0);
    piano_roll_set_position(app->piano_roll, secs);
}

static void on_playback_done(void *data) {
    AppState *app = data;
    piano_roll_set_position(app->piano_roll, 0.0);
    gtk_label_set_text(GTK_LABEL(app->lbl_cur_time), "00:00");
    gtk_range_set_value(GTK_RANGE(app->slider), 0.0);
    update_buttons(app);
    set_status(app, "재생 완료.");
}

static void on_state_change(PlayerState st, void *data) {
    (void)st;
    update_buttons(data);
}

/* ── file load ─────────────────────────────────────────────────── */

static void load_file(AppState *app, const char *path) {
    midi_player_stop(app->player);
    if (app->midi_file) { midi_free(app->midi_file); app->midi_file = NULL; }
    piano_roll_reset(app->piano_roll);

    MidiFile *mf = midi_parse(path);
    if (!mf) { set_status(app, "파일 파싱 실패."); update_buttons(app); return; }
    app->midi_file = mf;
    snprintf(app->midi_path, sizeof(app->midi_path), "%s", path);

    const char *fname = g_path_get_basename(path);
    gtk_label_set_text(GTK_LABEL(app->lbl_file), fname);

    char buf[64];
    snprintf(buf, sizeof(buf), "트랙: %d", mf->track_count);
    gtk_label_set_text(GTK_LABEL(app->lbl_tracks), buf);
    snprintf(buf, sizeof(buf), "음표: %d", mf->total_notes);
    gtk_label_set_text(GTK_LABEL(app->lbl_notes), buf);

    char tbuf[16];
    format_time(tbuf, sizeof(tbuf), mf->total_seconds);
    snprintf(buf, sizeof(buf), "길이: %s", tbuf);
    gtk_label_set_text(GTK_LABEL(app->lbl_duration), buf);
    gtk_label_set_text(GTK_LABEL(app->lbl_tot_time), tbuf);
    gtk_label_set_text(GTK_LABEL(app->lbl_cur_time), "00:00");
    gtk_range_set_value(GTK_RANGE(app->slider), 0.0);

    piano_roll_set_file(app->piano_roll, mf);
    midi_player_load(app->player, path, mf);

    int idx = gtk_combo_box_get_active(GTK_COMBO_BOX(app->combo_instr));
    if (idx >= 0) midi_player_set_instrument(app->player, idx);

    update_buttons(app);
    set_status(app, "파일 로드 완료.");
}

/* ── menu: open ────────────────────────────────────────────────── */

static void on_open(GtkMenuItem *item, gpointer data) {
    (void)item;
    AppState *app = data;
    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "MIDI 파일 열기", GTK_WINDOW(app->window),
        GTK_FILE_CHOOSER_ACTION_OPEN,
        "취소", GTK_RESPONSE_CANCEL,
        "열기", GTK_RESPONSE_ACCEPT, NULL);

    GtkFileFilter *ff = gtk_file_filter_new();
    gtk_file_filter_set_name(ff, "MIDI 파일 (*.mid, *.midi)");
    gtk_file_filter_add_pattern(ff, "*.mid");
    gtk_file_filter_add_pattern(ff, "*.midi");
    gtk_file_filter_add_pattern(ff, "*.MID");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), ff);

    GtkFileFilter *fall = gtk_file_filter_new();
    gtk_file_filter_set_name(fall, "모든 파일");
    gtk_file_filter_add_pattern(fall, "*");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), fall);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char *filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        load_file(app, filename);
        g_free(filename);
    }
    gtk_widget_destroy(dlg);
}

/* ── menu: export ──────────────────────────────────────────────── */

/* These structs marshal export callbacks from the worker thread to GTK. */
typedef struct { AppState *app; int percent; } ProgressIdleData;
typedef struct { AppState *app; int ok;      char *err; } DoneIdleData;

static gboolean idle_update_progress(gpointer data) {
    ProgressIdleData *d = data;
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(d->app->progressbar),
                                   d->percent / 100.0);
    char buf[48];
    snprintf(buf, sizeof(buf), "내보내기 중... %d%%", d->percent);
    set_status(d->app, buf);
    g_free(d);
    return G_SOURCE_REMOVE;
}

static gboolean idle_export_done(gpointer data) {
    DoneIdleData *d = data;
    AppState *app   = d->app;
    app->exporting  = FALSE;
    gtk_widget_set_visible(app->progress_box, FALSE);
    update_buttons(app);

    if (d->ok) {
        set_status(app, "내보내기 완료.");
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window), GTK_DIALOG_MODAL,
            GTK_MESSAGE_INFO, GTK_BUTTONS_OK,
            "내보내기가 완료되었습니다.");
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
    } else {
        char msg[512];
        snprintf(msg, sizeof(msg), "내보내기 실패: %s",
                 d->err ? d->err : "알 수 없는 오류");
        set_status(app, msg);
        GtkWidget *dlg = gtk_message_dialog_new(
            GTK_WINDOW(app->window), GTK_DIALOG_MODAL,
            GTK_MESSAGE_ERROR, GTK_BUTTONS_OK, "%s", msg);
        gtk_dialog_run(GTK_DIALOG(dlg));
        gtk_widget_destroy(dlg);
    }
    g_free(d->err);
    g_free(d);
    return G_SOURCE_REMOVE;
}

/* Called from worker thread → marshal to GTK main thread via g_idle_add */
static void export_progress_cb(int pct, void *data) {
    ProgressIdleData *d = g_new(ProgressIdleData, 1);
    d->app = data; d->percent = pct;
    g_idle_add(idle_update_progress, d);
}

static void export_done_cb(int ok, const char *err, void *data) {
    DoneIdleData *d = g_new(DoneIdleData, 1);
    d->app = data;
    d->ok  = ok;
    d->err = err ? g_strdup(err) : NULL;
    g_idle_add(idle_export_done, d);
}

static void do_export(AppState *app, int as_mp3) {
    if (!app->midi_file || app->exporting) return;

    const char *ext   = as_mp3 ? "mp3"          : "wav";
    const char *title = as_mp3 ? "MP3로 내보내기" : "WAV로 내보내기";

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        title, GTK_WINDOW(app->window),
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "취소", GTK_RESPONSE_CANCEL,
        "저장", GTK_RESPONSE_ACCEPT, NULL);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dlg), TRUE);

    /* suggest a default filename */
    const char *base = g_path_get_basename(app->midi_path);
    const char *dot  = strrchr(base, '.');
    int nlen = dot ? (int)(dot - base) : (int)strlen(base);
    char suggested[512];
    snprintf(suggested, sizeof(suggested), "%.*s.%s", nlen, base, ext);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dlg), suggested);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char *out = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        gtk_widget_destroy(dlg);

        app->exporting = TRUE;
        gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(app->progressbar), 0.0);
        gtk_widget_set_visible(app->progress_box, TRUE);
        update_buttons(app);

        audio_export_start(
            app->midi_path, out, app->soundfont_path,
            midi_player_get_instrument(app->player),
            as_mp3,
            export_progress_cb, export_done_cb, app);
        g_free(out);
    } else {
        gtk_widget_destroy(dlg);
    }
}

static void on_export_wav(GtkMenuItem *i, gpointer d) { (void)i; do_export(d, 0); }
static void on_export_mp3(GtkMenuItem *i, gpointer d) { (void)i; do_export(d, 1); }

/* ── transport ─────────────────────────────────────────────────── */

static void on_play (GtkButton *b, gpointer d) { (void)b; midi_player_play (d); }
static void on_pause(GtkButton *b, gpointer d) { (void)b; midi_player_pause(d); }
static void on_stop (GtkButton *b, gpointer d) {
    (void)b;
    AppState *app = d;
    midi_player_stop(app->player);
    piano_roll_set_position(app->piano_roll, 0.0);
    gtk_label_set_text(GTK_LABEL(app->lbl_cur_time), "00:00");
    gtk_range_set_value(GTK_RANGE(app->slider), 0.0);
}

static void on_instrument_changed(GtkComboBox *combo, gpointer data) {
    AppState *app = data;
    int idx = gtk_combo_box_get_active(combo);
    if (idx >= 0) midi_player_set_instrument(app->player, idx);
}

static gboolean on_slider_pressed(GtkWidget *w, GdkEventButton *ev, gpointer d) {
    (void)w; (void)ev; ((AppState*)d)->slider_dragging = TRUE; return FALSE;
}
static gboolean on_slider_released(GtkWidget *w, GdkEventButton *ev, gpointer d) {
    (void)w; (void)ev;
    AppState *app = d;
    app->slider_dragging = FALSE;
    double val = gtk_range_get_value(GTK_RANGE(app->slider));
    double dur = midi_player_get_duration(app->player);
    if (dur > 0.0) midi_player_seek(app->player, val / 1000.0 * dur);
    return FALSE;
}

/* ── window construction ───────────────────────────────────────── */

GtkWidget *main_window_new(const char *soundfont_path) {
    AppState *app = g_new0(AppState, 1);
    g_strlcpy(app->soundfont_path, soundfont_path, sizeof(app->soundfont_path));

    /* player (core — no GTK) */
    app->player = midi_player_new(soundfont_path);
    if (app->player) {
        midi_player_set_position_cb(app->player, on_position,     app);
        midi_player_set_done_cb    (app->player, on_playback_done, app);
        midi_player_set_state_cb   (app->player, on_state_change,  app);
    }

    /* window */
    app->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(app->window), "MIDI Master – GTK");
    gtk_window_set_default_size(GTK_WINDOW(app->window), 1100, 720);
    g_signal_connect(app->window, "destroy", G_CALLBACK(gtk_main_quit), NULL);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(app->window), vbox);

    /* ── menu ── */
    GtkWidget *menubar   = gtk_menu_bar_new();
    GtkWidget *file_mi   = gtk_menu_item_new_with_label("파일");
    GtkWidget *file_menu = gtk_menu_new();
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(file_mi), file_menu);
    gtk_menu_shell_append(GTK_MENU_SHELL(menubar), file_mi);

    GtkWidget *mi_open = gtk_menu_item_new_with_label("열기 (Ctrl+O)");
    GtkWidget *mi_wav  = gtk_menu_item_new_with_label("WAV 내보내기...");
    GtkWidget *mi_mp3  = gtk_menu_item_new_with_label("MP3 내보내기...");
    GtkWidget *mi_quit = gtk_menu_item_new_with_label("종료");

    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), mi_open);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), mi_wav);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), mi_mp3);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), mi_quit);

    g_signal_connect(mi_open, "activate", G_CALLBACK(on_open),       app);
    g_signal_connect(mi_wav,  "activate", G_CALLBACK(on_export_wav),  app);
    g_signal_connect(mi_mp3,  "activate", G_CALLBACK(on_export_mp3),  app);
    g_signal_connect(mi_quit, "activate", G_CALLBACK(gtk_main_quit),  NULL);

    GtkAccelGroup *accel = gtk_accel_group_new();
    gtk_window_add_accel_group(GTK_WINDOW(app->window), accel);
    gtk_widget_add_accelerator(mi_open, "activate", accel,
                                GDK_KEY_o, GDK_CONTROL_MASK, GTK_ACCEL_VISIBLE);

    gtk_box_pack_start(GTK_BOX(vbox), menubar, FALSE, FALSE, 0);

    /* ── info panel ── */
    GtkWidget *info_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 10);
    gtk_widget_set_margin_start (info_box, 8);
    gtk_widget_set_margin_end   (info_box, 8);
    gtk_widget_set_margin_top   (info_box, 4);
    gtk_widget_set_margin_bottom(info_box, 4);
    gtk_widget_set_name(info_box, "info-panel");

    GtkCssProvider *css = gtk_css_provider_new();
    gtk_css_provider_load_from_data(css,
        "#info-panel { background: #ddeeff; border-radius: 4px; padding: 4px 8px; }",
        -1, NULL);
    gtk_style_context_add_provider(gtk_widget_get_style_context(info_box),
                                    GTK_STYLE_PROVIDER(css),
                                    GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    g_object_unref(css);

    app->lbl_file     = gtk_label_new("파일: —");
    app->lbl_tracks   = gtk_label_new("트랙: —");
    app->lbl_notes    = gtk_label_new("음표: —");
    app->lbl_duration = gtk_label_new("길이: —");

    gtk_box_pack_start(GTK_BOX(info_box), app->lbl_file,     FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(info_box), gtk_separator_new(GTK_ORIENTATION_VERTICAL), FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(info_box), app->lbl_tracks,   FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(info_box), gtk_separator_new(GTK_ORIENTATION_VERTICAL), FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(info_box), app->lbl_notes,    FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(info_box), gtk_separator_new(GTK_ORIENTATION_VERTICAL), FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(info_box), app->lbl_duration, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), info_box, FALSE, FALSE, 0);

    /* ── piano roll ── */
    GtkWidget *roll = piano_roll_widget(app->piano_roll = piano_roll_new());
    gtk_box_pack_start(GTK_BOX(vbox), roll, TRUE, TRUE, 0);

    /* ── time / slider ── */
    GtkWidget *time_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_widget_set_margin_start (time_box, 8);
    gtk_widget_set_margin_end   (time_box, 8);
    gtk_widget_set_margin_top   (time_box, 4);

    app->lbl_cur_time = gtk_label_new("00:00");
    app->slider = gtk_scale_new_with_range(GTK_ORIENTATION_HORIZONTAL, 0.0, 1000.0, 1.0);
    gtk_scale_set_draw_value(GTK_SCALE(app->slider), FALSE);
    gtk_widget_set_sensitive(app->slider, FALSE);
    app->lbl_tot_time = gtk_label_new("00:00");

    g_signal_connect(app->slider, "button-press-event",   G_CALLBACK(on_slider_pressed),  app);
    g_signal_connect(app->slider, "button-release-event", G_CALLBACK(on_slider_released), app);

    gtk_box_pack_start(GTK_BOX(time_box), app->lbl_cur_time, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(time_box), app->slider,       TRUE,  TRUE,  4);
    gtk_box_pack_start(GTK_BOX(time_box), app->lbl_tot_time, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), time_box, FALSE, FALSE, 0);

    /* ── controls ── */
    GtkWidget *ctrl_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_widget_set_margin_start (ctrl_box, 8);
    gtk_widget_set_margin_end   (ctrl_box, 8);
    gtk_widget_set_margin_top   (ctrl_box, 4);
    gtk_widget_set_margin_bottom(ctrl_box, 4);

    app->btn_play  = gtk_button_new_with_label("▶  재생");
    app->btn_pause = gtk_button_new_with_label("⏸  일시정지");
    app->btn_stop  = gtk_button_new_with_label("⏹  정지");

    g_signal_connect(app->btn_play,  "clicked", G_CALLBACK(on_play),  app);
    g_signal_connect(app->btn_pause, "clicked", G_CALLBACK(on_pause), app->player);
    g_signal_connect(app->btn_stop,  "clicked", G_CALLBACK(on_stop),  app);

    gtk_box_pack_start(GTK_BOX(ctrl_box), app->btn_play,  FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(ctrl_box), app->btn_pause, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(ctrl_box), app->btn_stop,  FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(ctrl_box), gtk_separator_new(GTK_ORIENTATION_VERTICAL), FALSE, FALSE, 4);

    gtk_box_pack_start(GTK_BOX(ctrl_box), gtk_label_new("악기:"), FALSE, FALSE, 0);

    app->combo_instr = gtk_combo_box_text_new();
    for (int i = 0; i < 128; i++) {
        char entry[80];
        snprintf(entry, sizeof(entry), "%d: %s", i, GM_INSTRUMENT_NAMES[i]);
        gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(app->combo_instr), entry);
    }
    gtk_combo_box_set_active(GTK_COMBO_BOX(app->combo_instr), 0);
    g_signal_connect(app->combo_instr, "changed",
                     G_CALLBACK(on_instrument_changed), app);
    gtk_box_pack_start(GTK_BOX(ctrl_box), app->combo_instr, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(ctrl_box), gtk_label_new("  템포: 100%"), FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), ctrl_box, FALSE, FALSE, 0);

    /* ── progress bar (hidden by default) ── */
    app->progress_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
    gtk_widget_set_margin_start(app->progress_box, 8);
    gtk_widget_set_margin_end  (app->progress_box, 8);
    app->progressbar  = gtk_progress_bar_new();
    gtk_progress_bar_set_show_text(GTK_PROGRESS_BAR(app->progressbar), TRUE);
    gtk_box_pack_start(GTK_BOX(app->progress_box), app->progressbar, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), app->progress_box, FALSE, FALSE, 0);
    gtk_widget_set_visible(app->progress_box, FALSE);

    /* ── status bar ── */
    app->statusbar     = gtk_statusbar_new();
    app->statusbar_ctx = gtk_statusbar_get_context_id(
        GTK_STATUSBAR(app->statusbar), "main");
    gtk_box_pack_start(GTK_BOX(vbox), app->statusbar, FALSE, FALSE, 0);
    set_status(app, app->player ? "준비." : "FluidSynth 초기화 실패 — SoundFont를 확인하세요.");

    update_buttons(app);

    gtk_widget_show_all(app->window);
    gtk_widget_set_visible(app->progress_box, FALSE);

    /* ── start UI timer (~50 ms) that drives midi_player_tick() ── */
    app->ui_timer_id = g_timeout_add(50, on_ui_timer, app);

    return app->window;
}
