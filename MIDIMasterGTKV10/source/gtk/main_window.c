#include "gtk/main_window.h"

#include <stdlib.h>
#include <string.h>

#include "gtk/app_icon.h"
#include "gtk/score_view.h"
#include "audio_export.h"
#include "general_midi.h"
#include "midi_file.h"
#include "midi_player.h"
#include "paths.h"
#include "score_verovio.h"

#define APP_NAME    "MIDI Master GTK V10"
#define APP_VERSION "10.0"

/* Horizontal inset for the main content area (pixels). */
enum { UI_MARGIN_H = 12 };

typedef struct {
    GtkWidget    *window;
    GtkWidget    *lbl_file;
    GtkWidget    *lbl_info;
    GtkWidget    *lbl_status;
    GtkWidget    *lbl_current;
    GtkWidget    *lbl_total;
    GtkWidget    *scale_pos;
    GtkWidget    *combo_inst;
    GtkWidget    *btn_play;
    GtkWidget    *btn_pause;
    GtkWidget    *btn_stop;
    GtkWidget    *progress;
    GtkWidget    *item_wav;
    GtkWidget    *item_mp3;

    MidiPlayer   *player;
    ScoreVerovio *score;
    ScoreView    *score_view;

    MidiFileInfo  file_info;
    gboolean      loaded;
    gboolean      seeking;
    int           instrument;
} AppState;

static AppState g_app;

static GMutex  g_export_mu;
static gboolean g_export_busy;

static GMutex   g_score_load_mu;
static guint    g_score_load_gen;
static gboolean g_score_load_active;
static GThread *g_score_load_thread;
static GMutex   g_score_load_thread_mu;
static GThread *g_export_thread;
static GMutex   g_export_thread_mu;

static gboolean g_app_quitting;
static GdkPixbuf *g_about_icon;

/* ---------- persistent settings ------------------------------------------ */

static char *settings_path(void)
{
    const char *cfg = g_get_user_config_dir();
    return g_build_filename(cfg, "midimaster", "settings.ini", NULL);
}

static char *settings_load_last_dir(void)
{
    char *path = settings_path();
    GKeyFile *kf = g_key_file_new();
    char *dir = NULL;
    if (g_key_file_load_from_file(kf, path, G_KEY_FILE_NONE, NULL))
        dir = g_key_file_get_string(kf, "General", "LastDir", NULL);
    g_key_file_free(kf);
    g_free(path);
    return dir;
}

static void settings_save_last_dir(const char *dir)
{
    char *path = settings_path();
    char *parent = g_path_get_dirname(path);
    g_mkdir_with_parents(parent, 0700);
    g_free(parent);

    GKeyFile *kf = g_key_file_new();
    g_key_file_load_from_file(kf, path, G_KEY_FILE_NONE, NULL);
    g_key_file_set_string(kf, "General", "LastDir", dir);
    g_key_file_save_to_file(kf, path, NULL);
    g_key_file_free(kf);
    g_free(path);
}

/* -------------------------------------------------------------------------- */

static char *g_score_midi_path;
static int   g_score_layout_width;
static char *g_score_pending_path;
static int   g_score_pending_width;
static gboolean g_score_pending_reload;

static void on_scale_value_changed(GtkRange *range, gpointer d);

static gboolean main_window_alive(void)
{
    return !g_app_quitting && g_app.window && GTK_IS_WIDGET(g_app.window);
}

static void set_status(const char *text)
{
    if (!main_window_alive() || !g_app.lbl_status || !GTK_IS_WIDGET(g_app.lbl_status))
        return;
    gtk_label_set_text(GTK_LABEL(g_app.lbl_status), text);
}

static void update_transport(void)
{
    gboolean has = g_app.loaded;
    MidiPlaybackState st = g_app.player ? midi_player_state(g_app.player) : MIDI_STATE_STOPPED;

    gtk_widget_set_sensitive(g_app.btn_play, has && st != MIDI_STATE_PLAYING);
    gtk_widget_set_sensitive(g_app.btn_pause, has && st == MIDI_STATE_PLAYING);
    gtk_widget_set_sensitive(g_app.btn_stop, has && st != MIDI_STATE_STOPPED);
    gtk_widget_set_sensitive(g_app.item_wav, has);
    gtk_widget_set_sensitive(g_app.item_mp3, has);
    gtk_widget_set_sensitive(g_app.scale_pos, has);
}

static void format_time_label(GtkWidget *lbl, double sec)
{
    if (sec < 0.0)
        sec = 0.0;
    int m = (int)(sec / 60.0);
    double s = sec - m * 60.0;
    char buf[32];
    snprintf(buf, sizeof buf, "%02d:%05.2f", m, s);
    gtk_label_set_text(GTK_LABEL(lbl), buf);
}

static double playback_duration(void)
{
    double total = g_app.file_info.duration_sec;
    if (g_app.player) {
        double pt = midi_player_total_seconds(g_app.player);
        if (pt > total)
            total = pt;
    }
    if (total < 0.01)
        total = 0.01;
    return total;
}

static void block_scale_signals(gboolean block)
{
    if (block)
        g_signal_handlers_block_by_func(g_app.scale_pos, G_CALLBACK(on_scale_value_changed), NULL);
    else
        g_signal_handlers_unblock_by_func(g_app.scale_pos, G_CALLBACK(on_scale_value_changed), NULL);
}

static void update_position_ui(double sec, gboolean move_scale, ScoreScrollMode scroll_mode)
{
    if (!main_window_alive())
        return;

    double total = playback_duration();
    if (sec < 0.0)
        sec = 0.0;
    if (sec > total)
        sec = total;

    format_time_label(g_app.lbl_current, sec);

    if (move_scale && !g_app.seeking) {
        block_scale_signals(TRUE);
        gtk_range_set_value(GTK_RANGE(g_app.scale_pos), sec / total * 1000.0);
        block_scale_signals(FALSE);
    }

    if (main_window_alive() && g_app.score_view && g_app.score)
        score_view_set_playhead(g_app.score_view, g_app.score, sec, total, TRUE, scroll_mode);
}

static void setup_transport_duration(void)
{
    double total = playback_duration();
    block_scale_signals(TRUE);
    gtk_range_set_range(GTK_RANGE(g_app.scale_pos), 0.0, 1000.0);
    gtk_range_set_value(GTK_RANGE(g_app.scale_pos), 0.0);
    block_scale_signals(FALSE);
    format_time_label(g_app.lbl_total, total);
    format_time_label(g_app.lbl_current, 0.0);
}

static void on_position(double sec, gpointer data)
{
    (void)data;
    if (g_app.seeking || !g_app.loaded)
        return;

    ScoreScrollMode scroll = SCORE_SCROLL_NONE;
    if (g_app.player && midi_player_state(g_app.player) == MIDI_STATE_PLAYING)
        scroll = SCORE_SCROLL_FOLLOW;
    update_position_ui(sec, TRUE, scroll);
}

static void on_stopped(gpointer data)
{
    (void)data;
    block_scale_signals(TRUE);
    gtk_range_set_value(GTK_RANGE(g_app.scale_pos), 0);
    block_scale_signals(FALSE);
    update_position_ui(0.0, FALSE, SCORE_SCROLL_NONE);
    score_view_set_playhead(g_app.score_view, g_app.score, 0, 0, FALSE, SCORE_SCROLL_NONE);
    update_transport();
}

static void on_completed(gpointer data)
{
    (void)data;
    double total = playback_duration();
    block_scale_signals(TRUE);
    gtk_range_set_value(GTK_RANGE(g_app.scale_pos), 1000);
    block_scale_signals(FALSE);
    update_position_ui(total, FALSE, SCORE_SCROLL_NONE);
    set_status("재생 완료");
    update_transport();
}

static void on_state(MidiPlaybackState st, gpointer data)
{
    (void)data;
    (void)st;
    update_transport();
}

static int score_panel_width(void)
{
    GtkWidget *panel = score_view_widget(g_app.score_view);
    int w = 0;

    if (gtk_widget_get_realized(panel))
        w = gtk_widget_get_allocated_width(panel);

    if (w < 120 && g_app.window && gtk_widget_get_realized(g_app.window))
        w = gtk_widget_get_allocated_width(g_app.window) - UI_MARGIN_H * 2;

    if (w < 400)
        w = 900;
    return w;
}

static int score_panel_height(void)
{
    GtkWidget *panel = score_view_widget(g_app.score_view);
    int h = 0;

    if (gtk_widget_get_realized(panel))
        h = gtk_widget_get_allocated_height(panel);

    if (h < 120 && g_app.window && gtk_widget_get_realized(g_app.window))
        h = gtk_widget_get_allocated_height(g_app.window) - 160;

    if (h < 120)
        h = 280;
    return h;
}

typedef struct {
    char     *path;
    int       width;
    int       height;
    guint     generation;
    gboolean  ok;
    GError   *err;
    cairo_surface_t *surface;
    int       surface_w;
    int       surface_h;
    guint     progress_ctx_generation;
} ScoreLoadJob;

typedef struct {
    guint generation;
    int   pct;
    char *phase;
} ScoreProgressMsg;

static void score_progress_show(gboolean visible);
static void score_progress_apply(int pct, const char *phase);
static void score_load_progress_cb(int pct, const char *phase, gpointer user_data);
static gboolean score_progress_ui_idle(gpointer data);

static void schedule_reload_score(const char *path);
static void score_load_run_pending_reload(void);
static gboolean score_load_ui_idle(gpointer data);
static void score_load_complete(ScoreLoadJob *job, gboolean ok, GError *err);
static gboolean export_ui_idle(gpointer data);

static void score_progress_show(gboolean visible)
{
    if (!g_app.progress || !GTK_IS_WIDGET(g_app.progress))
        return;
    gtk_widget_set_visible(g_app.progress, visible);
}

static void score_progress_apply(int pct, const char *phase)
{
    if (!g_app.progress || !GTK_IS_PROGRESS_BAR(g_app.progress))
        return;
    if (pct < 0)
        pct = 0;
    if (pct > 100)
        pct = 100;

    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(g_app.progress), pct / 100.0);
    char buf[192];
    if (phase && phase[0])
        snprintf(buf, sizeof buf, "%d%%  %s", pct, phase);
    else
        snprintf(buf, sizeof buf, "%d%%", pct);
    gtk_progress_bar_set_text(GTK_PROGRESS_BAR(g_app.progress), buf);
    gtk_progress_bar_set_show_text(GTK_PROGRESS_BAR(g_app.progress), TRUE);
}

static void score_load_progress_cb(int pct, const char *phase, gpointer user_data)
{
    guint gen = GPOINTER_TO_UINT(user_data);
    ScoreProgressMsg *msg = g_new0(ScoreProgressMsg, 1);
    msg->generation = gen;
    msg->pct = pct;
    if (phase && phase[0])
        msg->phase = g_strdup(phase);
    g_idle_add(score_progress_ui_idle, msg);
}

static gboolean score_progress_ui_idle(gpointer data)
{
    ScoreProgressMsg *msg = data;

    if (!g_app_quitting && main_window_alive()) {
        g_mutex_lock(&g_score_load_mu);
        gboolean apply = g_score_load_active && msg->generation == g_score_load_gen;
        g_mutex_unlock(&g_score_load_mu);
        if (apply)
            score_progress_apply(msg->pct, msg->phase);
    }

    g_free(msg->phase);
    g_free(msg);
    return G_SOURCE_REMOVE;
}

static void score_load_complete(ScoreLoadJob *job, gboolean ok, GError *err)
{
    (void)ok;
    score_progress_show(FALSE);

    g_mutex_lock(&g_score_load_mu);
    g_score_load_active = FALSE;
    g_mutex_unlock(&g_score_load_mu);

    score_load_run_pending_reload();

    if (!ok && main_window_alive()) {
        set_status(err ? err->message : "악보 로드 실패");
        if (g_app.score_view)
            score_view_clear(g_app.score_view);
        if (err) {
            GtkWidget *m = gtk_message_dialog_new(GTK_WINDOW(g_app.window), GTK_DIALOG_MODAL,
                                                  GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
                                                  "악보 로드 실패:\n%s", err->message);
            gtk_dialog_run(GTK_DIALOG(m));
            gtk_widget_destroy(m);
        }
    }

    g_clear_error(&err);
    if (job->surface) {
        cairo_surface_destroy(job->surface);
        job->surface = NULL;
    }
    g_free(job->path);
    g_free(job);
}

static gboolean score_load_ui_idle(gpointer data)
{
    ScoreLoadJob *job = data;
    gboolean ok = job->ok;
    GError *err = job->err;
    job->err = NULL;

    if (g_app_quitting) {
        g_clear_error(&err);
        score_load_complete(job, FALSE, NULL);
        return G_SOURCE_REMOVE;
    }

    g_mutex_lock(&g_score_load_mu);
    gboolean stale = (job->generation != g_score_load_gen);
    g_mutex_unlock(&g_score_load_mu);

    if (!stale && ok && main_window_alive() && job->surface) {
        score_view_set_surface(g_app.score_view, job->surface, job->surface_w, job->surface_h);
        job->surface = NULL;
        score_view_set_viewport_size(g_app.score_view, job->width, job->height);
        update_position_ui(0.0, FALSE, SCORE_SCROLL_JUMP);
        if (g_app.score) {
            int pages = score_verovio_page_count(g_app.score);
            int systems = score_verovio_total_system_rows(g_app.score);
            char msg[128];
            snprintf(msg, sizeof msg, "악보 로드 완료 (%d페이지, %d줄)", pages, systems);
            set_status(msg);
        } else {
            set_status("악보 로드 완료");
        }
    }

    score_load_complete(job, stale ? FALSE : ok, stale ? NULL : err);
    g_clear_error(&err);
    return G_SOURCE_REMOVE;
}

static void score_load_run_pending_reload(void)
{
    if (!g_score_pending_reload || !g_score_pending_path || g_app_quitting)
        return;

    char *path = g_score_pending_path;
    int width = g_score_pending_width;
    g_score_pending_path = NULL;
    g_score_pending_reload = FALSE;
    g_score_pending_width = 0;

    if (width < 400)
        width = 400;
    g_score_layout_width = width;
    schedule_reload_score(path);
    g_free(path);
}

static gpointer score_load_thread(gpointer data)
{
    ScoreLoadJob *job = data;
    GError *err = NULL;

    gpointer progress_ctx = GUINT_TO_POINTER(job->progress_ctx_generation);
    gboolean ok = score_verovio_load(g_app.score, job->path, job->width, score_load_progress_cb,
                                     progress_ctx, &err);

    if (ok) {
        int sw = 0, sh = 0;
        cairo_surface_t *surface = score_verovio_render_surface(g_app.score, 2.0, &sw, &sh,
                                                                 score_load_progress_cb,
                                                                 progress_ctx);
        if (!surface) {
            ok = FALSE;
            g_set_error_literal(&err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                                "Score rendering failed");
        } else {
            job->surface   = surface;
            job->surface_w = sw;
            job->surface_h = sh;
        }
    }

    job->ok  = ok;
    job->err = err;

    g_idle_add(score_load_ui_idle, job);

    g_mutex_lock(&g_score_load_thread_mu);
    g_score_load_thread = NULL;
    g_mutex_unlock(&g_score_load_thread_mu);
    return NULL;
}

static void schedule_reload_score(const char *path)
{
    if (!path || !g_app.score || g_app_quitting)
        return;

    g_mutex_lock(&g_score_load_mu);
    if (g_score_load_active) {
        g_free(g_score_pending_path);
        g_score_pending_path = g_strdup(path);
        g_score_pending_width = score_panel_width();
        g_score_pending_reload = TRUE;
        g_mutex_unlock(&g_score_load_mu);
        return;
    }
    g_mutex_unlock(&g_score_load_mu);

    g_mutex_lock(&g_score_load_thread_mu);
    if (g_score_load_thread)
        g_thread_join(g_score_load_thread);
    g_score_load_thread = NULL;
    g_mutex_unlock(&g_score_load_thread_mu);

    g_mutex_lock(&g_score_load_mu);
    g_score_load_gen++;
    guint gen = g_score_load_gen;
    g_score_load_active = TRUE;
    g_mutex_unlock(&g_score_load_mu);

    ScoreLoadJob *job = g_new0(ScoreLoadJob, 1);
    job->path = g_strdup(path);
    job->width = score_panel_width();
    if (job->width < 400)
        job->width = 400;
    job->height = score_panel_height();
    job->generation = gen;
    job->progress_ctx_generation = gen;
    g_score_layout_width = job->width;

    score_progress_show(TRUE);
    score_progress_apply(0, "악보 준비 중…");
    set_status("악보 로드 중…");
    g_mutex_lock(&g_score_load_thread_mu);
    g_score_load_thread = g_thread_new("score-load", score_load_thread, job);
    g_mutex_unlock(&g_score_load_thread_mu);
}

static gboolean on_score_configure(GtkWidget *widget, GdkEventConfigure *event, gpointer data)
{
    (void)widget;
    (void)data;
    if (!g_app.loaded || !g_score_midi_path)
        return FALSE;
    if (event->width < 120 || event->height < 80)
        return FALSE;

    if (g_app.score_view)
        score_view_set_viewport_size(g_app.score_view, event->width, event->height);

    int width = event->width;
    if (width < 400)
        width = 400;
    if (abs(width - g_score_layout_width) < 48)
        return FALSE;

    g_mutex_lock(&g_score_load_mu);
    if (g_score_load_active) {
        g_free(g_score_pending_path);
        g_score_pending_path = g_strdup(g_score_midi_path);
        g_score_pending_width = width;
        g_score_pending_reload = TRUE;
        g_mutex_unlock(&g_score_load_mu);
        return FALSE;
    }
    g_mutex_unlock(&g_score_load_mu);

    g_score_layout_width = width;
    schedule_reload_score(g_score_midi_path);
    return FALSE;
}

void main_window_prepare_score_display(void)
{
    if (g_app.score_view)
        score_view_ensure_ready(g_app.score_view);
}

static void open_file(GtkWidget *widget, gpointer data)
{
    (void)widget;
    (void)data;

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "MIDI 파일 열기", GTK_WINDOW(g_app.window), GTK_FILE_CHOOSER_ACTION_OPEN,
        "_취소", GTK_RESPONSE_CANCEL, "_열기", GTK_RESPONSE_ACCEPT, NULL);

    GtkFileFilter *f = gtk_file_filter_new();
    gtk_file_filter_set_name(f, "MIDI files");
    gtk_file_filter_add_pattern(f, "*.mid");
    gtk_file_filter_add_pattern(f, "*.midi");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), f);

    char *last_dir = settings_load_last_dir();
    if (last_dir) {
        gtk_file_chooser_set_current_folder(GTK_FILE_CHOOSER(dlg), last_dir);
        g_free(last_dir);
    }

    if (gtk_dialog_run(GTK_DIALOG(dlg)) != GTK_RESPONSE_ACCEPT) {
        gtk_widget_destroy(dlg);
        return;
    }

    char *path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
    char *chosen_dir = gtk_file_chooser_get_current_folder(GTK_FILE_CHOOSER(dlg));
    gtk_widget_destroy(dlg);

    if (chosen_dir) {
        settings_save_last_dir(chosen_dir);
        g_free(chosen_dir);
    }
    if (!path)
        return;

    GError *err = NULL;
    midi_file_info_clear(&g_app.file_info);
    if (!midi_file_load(path, &g_app.file_info, &err)) {
        GtkWidget *m = gtk_message_dialog_new(GTK_WINDOW(g_app.window), GTK_DIALOG_MODAL,
                                              GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
                                              "MIDI 열기 실패:\n%s", err->message);
        gtk_dialog_run(GTK_DIALOG(m));
        gtk_widget_destroy(m);
        g_clear_error(&err);
        g_free(path);
        return;
    }

    if (g_app.player)
        midi_player_stop(g_app.player);

    if (!midi_player_load(g_app.player, path, &err)) {
        GtkWidget *m = gtk_message_dialog_new(GTK_WINDOW(g_app.window), GTK_DIALOG_MODAL,
                                              GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
                                              "재생 로드 실패:\n%s", err->message);
        gtk_dialog_run(GTK_DIALOG(m));
        gtk_widget_destroy(m);
        g_clear_error(&err);
        g_free(path);
        return;
    }

    midi_player_set_total_seconds(g_app.player, g_app.file_info.duration_sec);

    g_free(g_score_midi_path);
    g_score_midi_path = g_strdup(path);
    g_app.loaded = TRUE;
    schedule_reload_score(path);

    char line[256];
    snprintf(line, sizeof line, "파일: %s", g_app.file_info.display_name);
    gtk_label_set_text(GTK_LABEL(g_app.lbl_file), line);

    snprintf(line, sizeof line, "트랙: %d   형식: Type %d   음표: %d개   길이: %.1f초",
             g_app.file_info.num_tracks, g_app.file_info.format,
             g_app.file_info.note_count, g_app.file_info.duration_sec);
    gtk_label_set_text(GTK_LABEL(g_app.lbl_info), line);

    setup_transport_duration();

    set_status("로드 완료");
    update_transport();
    g_free(path);
}

static void on_play(GtkWidget *w, gpointer d)
{
    (void)w;
    (void)d;
    if (!g_app.player)
        return;

    if (g_app.score_view && g_app.score && g_app.loaded) {
        score_view_reset_scroll_tracking(g_app.score_view);
        double sec = midi_player_current_seconds(g_app.player);
        double total = playback_duration();
        score_view_set_playhead(g_app.score_view, g_app.score, sec, total, TRUE, SCORE_SCROLL_JUMP);
    }
    midi_player_play(g_app.player);
}

static void on_pause(GtkWidget *w, gpointer d)
{
    (void)w;
    (void)d;
    if (g_app.player)
        midi_player_pause(g_app.player);
}

static void on_stop(GtkWidget *w, gpointer d)
{
    (void)w;
    (void)d;
    if (g_app.player)
        midi_player_stop(g_app.player);
}

static void on_inst_changed(GtkWidget *w, gpointer d)
{
    (void)w;
    (void)d;
    g_app.instrument = gtk_combo_box_get_active(GTK_COMBO_BOX(g_app.combo_inst));
    if (g_app.player)
        midi_player_set_instrument(g_app.player, g_app.instrument);
}

static gboolean on_scale_pressed(GtkWidget *w, GdkEventButton *ev, gpointer d)
{
    (void)w;
    (void)ev;
    (void)d;
    g_app.seeking = TRUE;
    return FALSE;
}

static gboolean on_scale_released(GtkWidget *w, GdkEventButton *ev, gpointer d)
{
    (void)w;
    (void)ev;
    (void)d;
    if (!g_app.loaded || !g_app.player) {
        g_app.seeking = FALSE;
        return FALSE;
    }

    double total = playback_duration();
    double sec = gtk_range_get_value(GTK_RANGE(g_app.scale_pos)) / 1000.0 * total;
    midi_player_seek_seconds(g_app.player, sec);
    update_position_ui(sec, TRUE, SCORE_SCROLL_JUMP);
    g_app.seeking = FALSE;
    return FALSE;
}

static void on_scale_value_changed(GtkRange *range, gpointer d)
{
    (void)range;
    (void)d;
    if (!g_app.loaded)
        return;

    double total = playback_duration();
    double sec = gtk_range_get_value(GTK_RANGE(g_app.scale_pos)) / 1000.0 * total;
    format_time_label(g_app.lbl_current, sec);

    if (g_app.seeking && g_app.score_view && g_app.score)
        score_view_set_playhead(g_app.score_view, g_app.score, sec, total, TRUE, SCORE_SCROLL_JUMP);
}

typedef struct {
    char     *midi_path;
    char     *out_path;
    char      ext[8];
    int       instrument;
    gboolean  is_mp3;

    GtkWidget *dialog;
    GtkWidget *label;
    GtkWidget *bar;

    GMutex    lock;
    guint     idle_id;
    int       pct;
    gboolean  finished;
    gboolean  ui_closed;
    gboolean  ok;
    GError   *err;
} ExportJob;

static void export_cancel_idle(ExportJob *job)
{
    g_mutex_lock(&job->lock);
    if (job->idle_id) {
        g_source_remove(job->idle_id);
        job->idle_id = 0;
    }
    g_mutex_unlock(&job->lock);
}

static void on_export_dialog_destroy(GtkWidget *widget, gpointer data)
{
    ExportJob *job = data;
    (void)widget;

    g_mutex_lock(&job->lock);
    job->ui_closed = TRUE;
    job->dialog = NULL;
    job->label = NULL;
    job->bar = NULL;
    g_mutex_unlock(&job->lock);
    export_cancel_idle(job);
}

static void export_schedule_ui(ExportJob *job)
{
    if (!job || g_app_quitting)
        return;

    g_mutex_lock(&job->lock);
    if (job->ui_closed) {
        g_mutex_unlock(&job->lock);
        return;
    }
    if (job->idle_id)
        g_source_remove(job->idle_id);
    job->idle_id = g_idle_add(export_ui_idle, job);
    g_mutex_unlock(&job->lock);
}

static const char *export_phase_text(const ExportJob *job, int pct)
{
    if (!job)
        return "";
    if (pct < 5)
        return "준비 중…";
    if (job->is_mp3) {
        if (pct < 85)
            return "WAV 오디오 생성 중…";
        if (pct < 100)
            return "MP3 인코딩 중…";
        return "완료";
    }
    if (pct < 100)
        return "WAV 파일 생성 중…";
    return "완료";
}

static gboolean export_ui_idle(gpointer data)
{
    ExportJob *job = data;

    g_mutex_lock(&job->lock);
    int pct = job->pct;
    gboolean done = job->finished;
    gboolean ok = job->ok;
    gboolean already_closed = job->ui_closed;
    GError *err = NULL;
    if (job->err)
        err = g_error_new_literal(job->err->domain, job->err->code, job->err->message);
    g_mutex_unlock(&job->lock);

    g_mutex_lock(&job->lock);
    job->idle_id = 0;
    g_mutex_unlock(&job->lock);

    if (g_app_quitting) {
        if (done) {
            g_mutex_lock(&g_export_mu);
            g_export_busy = FALSE;
            g_mutex_unlock(&g_export_mu);
            g_free(job->midi_path);
            g_free(job->out_path);
            g_mutex_clear(&job->lock);
            g_free(job);
        }
        g_clear_error(&err);
        return G_SOURCE_REMOVE;
    }

    if (!done) {
        g_mutex_lock(&job->lock);
        done = job->finished;
        g_mutex_unlock(&job->lock);
    }

    if (!done) {
        if (!already_closed && job->bar && GTK_IS_WIDGET(job->bar))
            gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(job->bar), pct / 100.0);
        if (!already_closed && job->label && GTK_IS_WIDGET(job->label)) {
            char buf[128];
            snprintf(buf, sizeof buf, "%s  %d%%", export_phase_text(job, pct), pct);
            gtk_label_set_text(GTK_LABEL(job->label), buf);
        }
        g_clear_error(&err);
        return G_SOURCE_REMOVE;
    }

    if (!already_closed) {
        if (job->bar && GTK_IS_WIDGET(job->bar))
            gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(job->bar), 1.0);
        if (job->label && GTK_IS_WIDGET(job->label)) {
            char buf[128];
            snprintf(buf, sizeof buf, "%s  100%%", export_phase_text(job, 100));
            gtk_label_set_text(GTK_LABEL(job->label), buf);
        }
    }

    g_mutex_lock(&g_export_mu);
    g_export_busy = FALSE;
    g_mutex_unlock(&g_export_mu);

    GtkWidget *dialog_to_destroy = NULL;
    g_mutex_lock(&job->lock);
    if (!job->ui_closed && job->dialog && GTK_IS_WIDGET(job->dialog))
        dialog_to_destroy = job->dialog;
    job->ui_closed = TRUE;
    job->dialog = NULL;
    job->label = NULL;
    job->bar = NULL;
    g_mutex_unlock(&job->lock);

    if (dialog_to_destroy) {
        g_signal_handlers_disconnect_by_func(dialog_to_destroy,
                                             G_CALLBACK(on_export_dialog_destroy), job);
        gtk_widget_hide(dialog_to_destroy);
        gtk_widget_destroy(dialog_to_destroy);
    }

    g_mutex_lock(&g_export_thread_mu);
    g_export_thread = NULL;
    g_mutex_unlock(&g_export_thread_mu);

    if (main_window_alive()) {
        gtk_widget_set_sensitive(g_app.item_wav, g_app.loaded);
        gtk_widget_set_sensitive(g_app.item_mp3, g_app.loaded);
    }

    if (!ok && main_window_alive()) {
        GtkWidget *m = gtk_message_dialog_new(
            GTK_WINDOW(g_app.window), GTK_DIALOG_MODAL, GTK_MESSAGE_ERROR, GTK_BUTTONS_OK,
            "보내기 실패:\n%s", err ? err->message : "알 수 없는 오류");
        gtk_dialog_run(GTK_DIALOG(m));
        gtk_widget_destroy(m);
    } else if (ok) {
        char msg[PATH_MAX + 32];
        snprintf(msg, sizeof msg, "보내기 완료: %s", job->out_path);
        set_status(msg);
    }
    g_clear_error(&err);

    g_free(job->midi_path);
    g_free(job->out_path);
    g_mutex_clear(&job->lock);
    g_free(job);
    return G_SOURCE_REMOVE;
}

static void export_progress_cb(int pct, gpointer data)
{
    ExportJob *job = data;
    if (!job || g_app_quitting)
        return;

    g_mutex_lock(&job->lock);
    if (job->ui_closed) {
        g_mutex_unlock(&job->lock);
        return;
    }
    job->pct = pct;
    g_mutex_unlock(&job->lock);

    export_schedule_ui(job);
}

static gpointer export_thread(gpointer data)
{
    ExportJob *job = data;
    GError *err = NULL;
    gboolean ok;

    if (job->is_mp3)
        ok = audio_export_mp3(job->midi_path, job->out_path, paths_soundfont(), job->instrument,
                              export_progress_cb, job, &err);
    else
        ok = audio_export_wav(job->midi_path, job->out_path, paths_soundfont(), job->instrument,
                              export_progress_cb, job, &err);

    g_mutex_lock(&job->lock);
    job->finished = TRUE;
    job->ok = ok;
    job->err = err;
    g_mutex_unlock(&job->lock);

    export_schedule_ui(job);
    return NULL;
}

static void export_show_progress_dialog(ExportJob *job)
{
    const char *title = job->is_mp3 ? "MP3로 보내기" : "WAV로 보내기";

    job->dialog = gtk_dialog_new();
    GtkWindow *win = GTK_WINDOW(job->dialog);
    gtk_window_set_title(win, title);
    gtk_window_set_transient_for(win, GTK_WINDOW(g_app.window));
    gtk_window_set_modal(win, FALSE);
    gtk_window_set_destroy_with_parent(win, TRUE);
    gtk_window_set_deletable(win, FALSE);
    gtk_window_set_skip_taskbar_hint(win, TRUE);
    gtk_window_set_resizable(GTK_WINDOW(job->dialog), FALSE);
    gtk_window_set_default_size(GTK_WINDOW(job->dialog), 380, -1);

    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(job->dialog));
    gtk_container_set_border_width(GTK_CONTAINER(content), 16);

    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    job->label = gtk_label_new("준비 중…  0%");
    gtk_label_set_xalign(GTK_LABEL(job->label), 0.0);
    gtk_widget_set_halign(job->label, GTK_ALIGN_FILL);
    gtk_box_pack_start(GTK_BOX(box), job->label, FALSE, FALSE, 0);

    job->bar = gtk_progress_bar_new();
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(job->bar), 0.0);
    gtk_progress_bar_set_show_text(GTK_PROGRESS_BAR(job->bar), FALSE);
    gtk_box_pack_start(GTK_BOX(box), job->bar, FALSE, FALSE, 0);

    gtk_box_pack_start(GTK_BOX(content), box, TRUE, TRUE, 0);
    g_signal_connect(job->dialog, "destroy", G_CALLBACK(on_export_dialog_destroy), job);
    gtk_widget_show_all(job->dialog);
}

static void export_file(const char *ext)
{
    if (!g_app.loaded || !g_app.file_info.path)
        return;

    GtkWidget *dlg = gtk_file_chooser_dialog_new(
        "보내기", GTK_WINDOW(g_app.window), GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL, "_저장", GTK_RESPONSE_ACCEPT, NULL);

    char filter[64];
    snprintf(filter, sizeof filter, "*.%s", ext);
    GtkFileFilter *f = gtk_file_filter_new();
    gtk_file_filter_add_pattern(f, filter);
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), f);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dlg), TRUE);

    char *base = g_path_get_basename(g_app.file_info.path);
    char *dot = strrchr(base, '.');
    if (dot)
        *dot = '\0';
    char *suggest = g_strconcat(base, ".", ext, NULL);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dlg), suggest);
    g_free(suggest);
    g_free(base);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) != GTK_RESPONSE_ACCEPT) {
        gtk_widget_destroy(dlg);
        return;
    }

    char *out = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
    gtk_widget_destroy(dlg);
    if (!out)
        return;

    g_mutex_lock(&g_export_mu);
    if (g_export_busy) {
        g_mutex_unlock(&g_export_mu);
        g_free(out);
        GtkWidget *m = gtk_message_dialog_new(GTK_WINDOW(g_app.window), GTK_DIALOG_MODAL,
                                              GTK_MESSAGE_INFO, GTK_BUTTONS_OK,
                                              "다른 파일 변환이 진행 중입니다.\n완료 후 다시 시도해 주세요.");
        gtk_dialog_run(GTK_DIALOG(m));
        gtk_widget_destroy(m);
        return;
    }
    g_export_busy = TRUE;
    g_mutex_unlock(&g_export_mu);

    ExportJob *job = g_new0(ExportJob, 1);
    g_mutex_init(&job->lock);
    job->midi_path = g_strdup(g_app.file_info.path);
    job->out_path = out;
    snprintf(job->ext, sizeof job->ext, "%s", ext);
    job->instrument = g_app.instrument;
    job->is_mp3 = g_str_equal(ext, "mp3");

    gtk_widget_set_sensitive(g_app.item_wav, FALSE);
    gtk_widget_set_sensitive(g_app.item_mp3, FALSE);

    export_show_progress_dialog(job);
    g_mutex_lock(&g_export_thread_mu);
    g_export_thread = g_thread_new("audio-export", export_thread, job);
    g_mutex_unlock(&g_export_thread_mu);
}

static void on_export_wav(GtkWidget *w, gpointer d)
{
    (void)w;
    (void)d;
    export_file("wav");
}

static void on_export_mp3(GtkWidget *w, gpointer d)
{
    (void)w;
    (void)d;
    export_file("mp3");
}

static void on_about(GtkWidget *w, gpointer d)
{
    (void)w;
    (void)d;

    GtkWidget *dlg = gtk_about_dialog_new();
    gtk_about_dialog_set_program_name(GTK_ABOUT_DIALOG(dlg), APP_NAME);
    gtk_about_dialog_set_version(GTK_ABOUT_DIALOG(dlg), APP_VERSION);
    gtk_about_dialog_set_comments(
        GTK_ABOUT_DIALOG(dlg),
        "GTK 3 MIDI 플레이어\n"
        "Cairo 악보 렌더링 · FluidSynth 재생 · WAV/MP3 보내기");
    gtk_about_dialog_set_license_type(GTK_ABOUT_DIALOG(dlg), GTK_LICENSE_LGPL_3_0);
    if (g_about_icon)
        gtk_about_dialog_set_logo(GTK_ABOUT_DIALOG(dlg), g_about_icon);

    gtk_window_set_transient_for(GTK_WINDOW(dlg), GTK_WINDOW(g_app.window));
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

static void on_destroy(GtkWidget *w, gpointer d)
{
    (void)w;
    (void)d;

    g_app_quitting = TRUE;

    g_mutex_lock(&g_score_load_mu);
    g_score_load_gen++;
    g_mutex_unlock(&g_score_load_mu);

    g_mutex_lock(&g_score_load_thread_mu);
    if (g_score_load_thread)
        g_thread_join(g_score_load_thread);
    g_score_load_thread = NULL;
    g_mutex_unlock(&g_score_load_thread_mu);

    g_mutex_lock(&g_export_thread_mu);
    if (g_export_thread)
        g_thread_join(g_export_thread);
    g_export_thread = NULL;
    g_mutex_unlock(&g_export_thread_mu);

    if (g_app.player) {
        midi_player_free(g_app.player);
        g_app.player = NULL;
    }
    g_free(g_score_midi_path);
    g_score_midi_path = NULL;
    g_free(g_score_pending_path);
    g_score_pending_path = NULL;
    g_score_pending_reload = FALSE;
    if (g_app.score) {
        score_verovio_free(g_app.score);
        g_app.score = NULL;
    }
    if (g_about_icon) {
        g_object_unref(g_about_icon);
        g_about_icon = NULL;
    }
    midi_file_info_clear(&g_app.file_info);
    gtk_main_quit();
}

GtkWidget *main_window_create(void)
{
    memset(&g_app, 0, sizeof g_app);
    g_app_quitting = FALSE;
    g_mutex_init(&g_export_mu);
    g_export_busy = FALSE;
    g_mutex_init(&g_export_thread_mu);
    g_export_thread = NULL;
    g_mutex_init(&g_score_load_mu);
    g_mutex_init(&g_score_load_thread_mu);
    g_score_load_gen = 0;
    g_score_load_active = FALSE;
    g_score_load_thread = NULL;
    g_app.instrument = 0;

    g_app.player = midi_player_new(paths_soundfont());
    g_app.score = score_verovio_new();
    g_app.score_view = score_view_new();

    midi_player_on_position(g_app.player, on_position, NULL);
    midi_player_on_state(g_app.player, on_state, NULL);
    midi_player_on_stopped(g_app.player, on_stopped, NULL);
    midi_player_on_completed(g_app.player, on_completed, NULL);

    g_app.window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(g_app.window), APP_NAME);
    gtk_window_set_default_size(GTK_WINDOW(g_app.window), 1100, 800);
    g_signal_connect(g_app.window, "destroy", G_CALLBACK(on_destroy), NULL);

    g_about_icon = app_icon_load_pixbuf(128);
    app_icon_apply(GTK_WINDOW(g_app.window));

    GtkWidget *outer = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(g_app.window), outer);

    GtkWidget *mbar = gtk_menu_bar_new();
    GtkWidget *menu_file = gtk_menu_item_new_with_mnemonic("_파일");
    GtkWidget *sub = gtk_menu_new();
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(menu_file), sub);

    GtkWidget *item_open = gtk_menu_item_new_with_mnemonic("_열기");
    g_signal_connect(item_open, "activate", G_CALLBACK(open_file), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(sub), item_open);

    g_app.item_wav = gtk_menu_item_new_with_mnemonic("WAV로 _보내기");
    g_signal_connect(g_app.item_wav, "activate", G_CALLBACK(on_export_wav), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(sub), g_app.item_wav);

    g_app.item_mp3 = gtk_menu_item_new_with_mnemonic("MP3로 _보내기");
    g_signal_connect(g_app.item_mp3, "activate", G_CALLBACK(on_export_mp3), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(sub), g_app.item_mp3);

    GtkWidget *item_exit = gtk_menu_item_new_with_mnemonic("_종료");
    g_signal_connect(item_exit, "activate", G_CALLBACK(on_destroy), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(sub), item_exit);

    gtk_menu_shell_append(GTK_MENU_SHELL(mbar), menu_file);

    GtkWidget *item_about = gtk_menu_item_new_with_mnemonic("_정보");
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"
    gtk_menu_item_set_right_justified(GTK_MENU_ITEM(item_about), TRUE);
#pragma GCC diagnostic pop
    g_signal_connect(item_about, "activate", G_CALLBACK(on_about), NULL);
    gtk_menu_shell_append(GTK_MENU_SHELL(mbar), item_about);

    gtk_box_pack_start(GTK_BOX(outer), mbar, FALSE, FALSE, 0);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_widget_set_margin_start(vbox, UI_MARGIN_H);
    gtk_widget_set_margin_end(vbox, UI_MARGIN_H);
    gtk_widget_set_margin_top(vbox, 4);
    gtk_widget_set_margin_bottom(vbox, 8);
    gtk_box_pack_start(GTK_BOX(outer), vbox, TRUE, TRUE, 0);

    g_app.lbl_file = gtk_label_new("파일: (없음)");
    gtk_label_set_xalign(GTK_LABEL(g_app.lbl_file), 0.0);
    gtk_box_pack_start(GTK_BOX(vbox), g_app.lbl_file, FALSE, FALSE, 0);

    g_app.lbl_info = gtk_label_new("");
    gtk_label_set_xalign(GTK_LABEL(g_app.lbl_info), 0.0);
    gtk_box_pack_start(GTK_BOX(vbox), g_app.lbl_info, FALSE, FALSE, 0);

    GtkWidget *toolbar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_pack_start(GTK_BOX(vbox), toolbar, FALSE, FALSE, 4);

    g_app.btn_play = gtk_button_new_with_label("▶ 재생");
    g_app.btn_pause = gtk_button_new_with_label("⏸ 일시정지");
    g_app.btn_stop = gtk_button_new_with_label("■ 정지");
    g_signal_connect(g_app.btn_play, "clicked", G_CALLBACK(on_play), NULL);
    g_signal_connect(g_app.btn_pause, "clicked", G_CALLBACK(on_pause), NULL);
    g_signal_connect(g_app.btn_stop, "clicked", G_CALLBACK(on_stop), NULL);
    gtk_box_pack_start(GTK_BOX(toolbar), g_app.btn_play, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(toolbar), g_app.btn_pause, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(toolbar), g_app.btn_stop, FALSE, FALSE, 0);

    gtk_box_pack_start(GTK_BOX(toolbar), gtk_label_new("악기:"), FALSE, FALSE, 0);
    g_app.combo_inst = gtk_combo_box_text_new();
    for (int i = 0; i < 128; i++) {
        char buf[128];
        snprintf(buf, sizeof buf, "%03d - %s", i, general_midi_name(i));
        gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(g_app.combo_inst), buf);
    }
    gtk_combo_box_set_active(GTK_COMBO_BOX(g_app.combo_inst), 0);
    g_signal_connect(g_app.combo_inst, "changed", G_CALLBACK(on_inst_changed), NULL);
    gtk_box_pack_start(GTK_BOX(toolbar), g_app.combo_inst, TRUE, TRUE, 0);

    GtkWidget *paned = gtk_paned_new(GTK_ORIENTATION_VERTICAL);
    gtk_box_pack_start(GTK_BOX(vbox), paned, TRUE, TRUE, 0);

    GtkWidget *score_panel = score_view_widget(g_app.score_view);
    g_signal_connect(score_panel, "configure-event", G_CALLBACK(on_score_configure), NULL);
    gtk_paned_pack1(GTK_PANED(paned), score_panel, TRUE, FALSE);

    GtkWidget *bottom = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_paned_pack2(GTK_PANED(paned), bottom, FALSE, FALSE);

    GtkWidget *pos_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    g_app.lbl_current = gtk_label_new("00:00.00");
    gtk_widget_set_size_request(g_app.lbl_current, 72, -1);
    gtk_label_set_xalign(GTK_LABEL(g_app.lbl_current), 1.0);

    g_app.scale_pos = gtk_scale_new_with_range(GTK_ORIENTATION_HORIZONTAL, 0, 1000, 1);
    gtk_scale_set_draw_value(GTK_SCALE(g_app.scale_pos), FALSE);
    gtk_range_set_increments(GTK_RANGE(g_app.scale_pos), 1, 10);
    gtk_widget_set_sensitive(g_app.scale_pos, FALSE);

    g_app.lbl_total = gtk_label_new("00:00.00");
    gtk_widget_set_size_request(g_app.lbl_total, 72, -1);
    gtk_label_set_xalign(GTK_LABEL(g_app.lbl_total), 0.0);

    g_signal_connect(g_app.scale_pos, "button-press-event", G_CALLBACK(on_scale_pressed), NULL);
    g_signal_connect(g_app.scale_pos, "button-release-event", G_CALLBACK(on_scale_released), NULL);
    g_signal_connect(g_app.scale_pos, "value-changed", G_CALLBACK(on_scale_value_changed), NULL);
    gtk_box_pack_start(GTK_BOX(pos_row), g_app.lbl_current, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(pos_row), g_app.scale_pos, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(pos_row), g_app.lbl_total, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(bottom), pos_row, FALSE, FALSE, 0);

    g_app.progress = gtk_progress_bar_new();
    gtk_progress_bar_set_show_text(GTK_PROGRESS_BAR(g_app.progress), TRUE);
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(g_app.progress), 0.0);
    gtk_widget_set_size_request(g_app.progress, -1, 20);
    gtk_widget_set_visible(g_app.progress, FALSE);
    gtk_box_pack_start(GTK_BOX(bottom), g_app.progress, FALSE, FALSE, 0);

    g_app.lbl_status = gtk_label_new("준비");
    gtk_label_set_xalign(GTK_LABEL(g_app.lbl_status), 0.0);
    gtk_box_pack_start(GTK_BOX(bottom), g_app.lbl_status, FALSE, FALSE, 0);

    gtk_paned_set_position(GTK_PANED(paned), 620);

    update_transport();
    return g_app.window;
}
