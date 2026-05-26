#include "midi_player.h"

#include <fluidsynth.h>
#include <fluidsynth/log.h>
#include <math.h>
#include <string.h>

static gboolean g_fluidsynth_log_done;

static void fluidsynth_quiet_startup(void)
{
    if (g_fluidsynth_log_done)
        return;
    g_fluidsynth_log_done = TRUE;
    /* PulseAudio driver notice + RT priority warning are harmless on desktop Linux. */
    fluid_set_log_function(FLUID_INFO, NULL, NULL);
    fluid_set_log_function(FLUID_WARN, NULL, NULL);
}

static void fluidsynth_apply_audio_settings(fluid_settings_t *settings)
{
    fluidsynth_quiet_startup();
    /* Avoid "Failed to set thread to high priority" without realtime group membership. */
    fluid_settings_setint(settings, "audio.realtime-prio", 0);
}

#define DRUM_CHANNEL 9

struct MidiPlayer {
    fluid_settings_t   *settings;
    fluid_synth_t      *synth;
    fluid_audio_driver_t *driver;
    fluid_player_t     *player;
    char               *midi_path;
    int                 program;
    MidiPlaybackState   state;
    guint               poll_id;
    double              total_sec;
    int                 pause_tick;

    MidiPlayerPositionCb on_position;
    gpointer             pos_data;
    MidiPlayerStateCb    on_state;
    gpointer             state_data;
    MidiPlayerVoidCb     on_stopped;
    gpointer             stopped_data;
    MidiPlayerVoidCb     on_completed;
    gpointer             completed_data;
};

static double ticks_to_seconds(int tick, int division, int tempo_us)
{
    if (division <= 0)
        return 0.0;
    return (double)tick * (double)tempo_us / (1000000.0 * (double)division);
}

static int seconds_to_ticks(double seconds, int division, int tempo_us)
{
    if (division <= 0 || tempo_us <= 0)
        return 0;
    return (int)(seconds * 1000000.0 * (double)division / (double)tempo_us);
}

static void apply_instrument(fluid_synth_t *synth, int program)
{
    for (int ch = 0; ch < 16; ch++) {
        if (ch == DRUM_CHANNEL)
            continue;
        fluid_synth_program_change(synth, ch, program);
    }
}

typedef struct {
    MidiPlayer *player;
    double      sec;
} PositionIdle;

static gboolean emit_position_idle(gpointer data)
{
    PositionIdle *job = data;
    if (job->player->on_position)
        job->player->on_position(job->sec, job->player->pos_data);
    g_free(job);
    return G_SOURCE_REMOVE;
}

static void emit_position(MidiPlayer *p, double sec)
{
    if (!p->on_position)
        return;
    PositionIdle *job = g_new(PositionIdle, 1);
    job->player = p;
    job->sec = sec;
    g_idle_add(emit_position_idle, job);
}

static gboolean poll_cb(gpointer data)
{
    MidiPlayer *p = data;
    if (!p->player || p->state != MIDI_STATE_PLAYING)
        return G_SOURCE_CONTINUE;

    int status = fluid_player_get_status(p->player);
    int tick = fluid_player_get_current_tick(p->player);
    int div = fluid_player_get_division(p->player);
    int tempo = fluid_player_get_midi_tempo(p->player);
    if (tempo <= 0)
        tempo = 500000;

    double sec = ticks_to_seconds(tick, div, tempo);
    if (sec > p->total_sec)
        p->total_sec = sec;
    emit_position(p, sec);

    if (status == FLUID_PLAYER_DONE) {
        p->poll_id = 0; /* GLib removes this source; clear before callbacks fire */
        p->state = MIDI_STATE_STOPPED;
        if (p->on_completed)
            p->on_completed(p->completed_data);
        if (p->on_state)
            p->on_state(p->state, p->state_data);
        return G_SOURCE_REMOVE;
    }
    return G_SOURCE_CONTINUE;
}

MidiPlayer *midi_player_new(const char *soundfont_path)
{
    MidiPlayer *p = g_new0(MidiPlayer, 1);
    p->program = 0;
    p->state = MIDI_STATE_STOPPED;
    p->pause_tick = 0;

    p->settings = new_fluid_settings();
    fluidsynth_apply_audio_settings(p->settings);
    fluid_settings_setstr(p->settings, "audio.driver", "pulseaudio");
    fluid_settings_setint(p->settings, "synth.chorus.active", 1);
    fluid_settings_setint(p->settings, "synth.reverb.active", 1);

    p->synth = new_fluid_synth(p->settings);
    if (fluid_synth_sfload(p->synth, soundfont_path, 1) == FLUID_FAILED)
        g_warning("SoundFont load failed: %s", soundfont_path);

    p->driver = new_fluid_audio_driver(p->settings, p->synth);
    if (!p->driver) {
        fluid_settings_setstr(p->settings, "audio.driver", "alsa");
        p->driver = new_fluid_audio_driver(p->settings, p->synth);
    }
    if (!p->driver) {
        fluid_settings_setstr(p->settings, "audio.driver", "jack");
        p->driver = new_fluid_audio_driver(p->settings, p->synth);
    }

    apply_instrument(p->synth, p->program);
    return p;
}

void midi_player_free(MidiPlayer *p)
{
    if (!p)
        return;
    midi_player_stop(p);
    if (p->poll_id)
        g_source_remove(p->poll_id);
    if (p->player)
        delete_fluid_player(p->player);
    if (p->driver)
        delete_fluid_audio_driver(p->driver);
    if (p->synth)
        delete_fluid_synth(p->synth);
    if (p->settings)
        delete_fluid_settings(p->settings);
    g_free(p->midi_path);
    g_free(p);
}

gboolean midi_player_load(MidiPlayer *p, const char *midi_path, GError **err)
{
    g_return_val_if_fail(p && midi_path, FALSE);
    midi_player_stop(p);

    if (p->player) {
        delete_fluid_player(p->player);
        p->player = NULL;
    }

    p->player = new_fluid_player(p->synth);
    if (fluid_player_add(p->player, midi_path) != FLUID_OK) {
        delete_fluid_player(p->player);
        p->player = NULL;
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "FluidSynth cannot load: %s", midi_path);
        return FALSE;
    }

    g_free(p->midi_path);
    p->midi_path = g_strdup(midi_path);
    p->pause_tick = 0;

    int total = fluid_player_get_total_ticks(p->player);
    int div = fluid_player_get_division(p->player);
    int tempo = fluid_player_get_midi_tempo(p->player);
    if (tempo <= 0)
        tempo = 500000;
    p->total_sec = ticks_to_seconds(total, div, tempo);
    if (p->total_sec < 0.01)
        p->total_sec = 0.01;

    apply_instrument(p->synth, p->program);
    return TRUE;
}

void midi_player_set_total_seconds(MidiPlayer *p, double seconds)
{
    if (!p)
        return;
    if (seconds > p->total_sec)
        p->total_sec = seconds;
    if (p->total_sec < 0.01)
        p->total_sec = 0.01;
}

void midi_player_set_instrument(MidiPlayer *p, int program)
{
    p->program = program;
    if (p->synth)
        apply_instrument(p->synth, program);
}

void midi_player_play(MidiPlayer *p)
{
    if (!p->player)
        return;

    if (p->state == MIDI_STATE_PAUSED) {
        fluid_player_seek(p->player, p->pause_tick);
        fluid_player_play(p->player);
        p->state = MIDI_STATE_PLAYING;
    } else if (p->state == MIDI_STATE_STOPPED) {
        fluid_player_stop(p->player);
        fluid_player_seek(p->player, 0);
        p->pause_tick = 0;
        fluid_player_play(p->player);
        p->state = MIDI_STATE_PLAYING;
    } else {
        return;
    }

    if (!p->poll_id)
        p->poll_id = g_timeout_add(50, poll_cb, p);

    if (p->on_state)
        p->on_state(p->state, p->state_data);
}

void midi_player_pause(MidiPlayer *p)
{
    if (!p->player || p->state != MIDI_STATE_PLAYING)
        return;

    p->pause_tick = fluid_player_get_current_tick(p->player);
    fluid_player_stop(p->player);
    p->state = MIDI_STATE_PAUSED;

    if (p->poll_id) {
        g_source_remove(p->poll_id);
        p->poll_id = 0;
    }

    if (p->on_state)
        p->on_state(p->state, p->state_data);
}

void midi_player_stop(MidiPlayer *p)
{
    if (!p)
        return;
    if (p->poll_id) {
        g_source_remove(p->poll_id);
        p->poll_id = 0;
    }
    if (p->player) {
        fluid_player_stop(p->player);
        fluid_player_seek(p->player, 0);
    }
    p->pause_tick = 0;
    if (p->state == MIDI_STATE_STOPPED)
        return;
    p->state = MIDI_STATE_STOPPED;
    if (p->on_stopped)
        p->on_stopped(p->stopped_data);
    if (p->on_state)
        p->on_state(p->state, p->state_data);
}

void midi_player_seek_seconds(MidiPlayer *p, double seconds)
{
    if (!p->player)
        return;

    if (seconds < 0.0)
        seconds = 0.0;
    if (seconds > p->total_sec)
        seconds = p->total_sec;

    int div = fluid_player_get_division(p->player);
    int tempo = fluid_player_get_midi_tempo(p->player);
    if (tempo <= 0)
        tempo = 500000;
    int tick = seconds_to_ticks(seconds, div, tempo);

    gboolean was_playing = (p->state == MIDI_STATE_PLAYING);

    /* Stop poll before stop/seek to prevent spurious FLUID_PLAYER_DONE detection. */
    if (p->poll_id) {
        g_source_remove(p->poll_id);
        p->poll_id = 0;
    }

    fluid_player_stop(p->player);
    fluid_player_seek(p->player, tick);
    p->pause_tick = tick;

    if (was_playing) {
        fluid_player_play(p->player);
        p->poll_id = g_timeout_add(50, poll_cb, p);
    }

    emit_position(p, seconds);
}

MidiPlaybackState midi_player_state(const MidiPlayer *p)
{
    return p ? p->state : MIDI_STATE_STOPPED;
}

double midi_player_current_seconds(const MidiPlayer *p)
{
    if (!p || !p->player)
        return 0.0;
    int tick = fluid_player_get_current_tick(p->player);
    if (p->state == MIDI_STATE_PAUSED)
        tick = p->pause_tick;
    int div = fluid_player_get_division(p->player);
    int tempo = fluid_player_get_midi_tempo(p->player);
    if (tempo <= 0)
        tempo = 500000;
    return ticks_to_seconds(tick, div, tempo);
}

double midi_player_total_seconds(const MidiPlayer *p)
{
    return p ? p->total_sec : 0.0;
}

void midi_player_on_position(MidiPlayer *p, MidiPlayerPositionCb cb, gpointer data)
{
    p->on_position = cb;
    p->pos_data = data;
}

void midi_player_on_state(MidiPlayer *p, MidiPlayerStateCb cb, gpointer data)
{
    p->on_state = cb;
    p->state_data = data;
}

void midi_player_on_stopped(MidiPlayer *p, MidiPlayerVoidCb cb, gpointer data)
{
    p->on_stopped = cb;
    p->stopped_data = data;
}

void midi_player_on_completed(MidiPlayer *p, MidiPlayerVoidCb cb, gpointer data)
{
    p->on_completed = cb;
    p->completed_data = data;
}
