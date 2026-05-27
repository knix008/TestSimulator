#include "midi_player.h"
#include <fluidsynth.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* No GTK / GLib dependency.  The UI layer calls midi_player_tick() from its
   own periodic timer and receives callbacks on the UI thread. */

struct MidiPlayer {
    fluid_settings_t     *settings;
    fluid_synth_t        *synth;
    fluid_audio_driver_t *adriver;
    fluid_player_t       *player;
    int                   sfid;

    char midi_path[1024];

    const MidiFile *mf;          /* weak ref – owned by caller */

    int         instrument;
    PlayerState state;
    double      pause_sec;
    double      total_sec;

    PlayerStateCb    state_cb;   void *state_data;
    PlayerPositionCb pos_cb;     void *pos_data;
    PlayerDoneCb     done_cb;    void *done_data;
};

/* ── helpers ─────────────────────────────────────────────────── */

static void set_state(MidiPlayer *mp, PlayerState s) {
    mp->state = s;
    if (mp->state_cb) mp->state_cb(s, mp->state_data);
}

/* Intercept program-change events for melody channels */
static int midi_event_handler(void *data, fluid_midi_event_t *ev) {
    MidiPlayer *mp   = data;
    int         type = fluid_midi_event_get_type(ev);
    int         ch   = fluid_midi_event_get_channel(ev);
    if (type == 0xC0 && ch != 9 && mp->instrument >= 0)
        fluid_midi_event_set_value(ev, mp->instrument);
    return fluid_synth_handle_midi_event(mp->synth, ev);
}

/* Create/re-create fluid_player loaded with the current MIDI file */
static bool build_player(MidiPlayer *mp) {
    if (mp->player) {
        fluid_player_stop(mp->player);
        delete_fluid_player(mp->player);
        mp->player = NULL;
    }
    mp->player = new_fluid_player(mp->synth);
    if (!mp->player) return false;

    fluid_player_set_playback_callback(mp->player, midi_event_handler, mp);

    if (fluid_player_add(mp->player, mp->midi_path) != FLUID_OK) {
        delete_fluid_player(mp->player);
        mp->player = NULL;
        return false;
    }
    return true;
}

static void apply_instrument(MidiPlayer *mp) {
    if (mp->instrument < 0) return;
    for (int ch = 0; ch < 16; ch++)
        if (ch != 9)
            fluid_synth_program_change(mp->synth, ch, mp->instrument);
}

/* ── public API ──────────────────────────────────────────────── */

MidiPlayer *midi_player_new(const char *soundfont_path) {
    MidiPlayer *mp = calloc(1, sizeof(MidiPlayer));
    if (!mp) return NULL;

    mp->instrument = -1;

    mp->settings = new_fluid_settings();
    if (!mp->settings) goto fail;

#ifdef __APPLE__
    fluid_settings_setstr(mp->settings, "audio.driver", "coreaudio");
#endif
    fluid_settings_setnum(mp->settings, "synth.sample-rate",   44100.0);
    fluid_settings_setint(mp->settings, "synth.reverb.active",  1);
    fluid_settings_setint(mp->settings, "synth.chorus.active",  1);

    mp->synth = new_fluid_synth(mp->settings);
    if (!mp->synth) goto fail;

    mp->sfid = fluid_synth_sfload(mp->synth, soundfont_path, 1);
    if (mp->sfid == FLUID_FAILED) {
        fprintf(stderr, "FluidSynth: SoundFont 로드 실패: %s\n", soundfont_path);
        goto fail;
    }

    mp->adriver = new_fluid_audio_driver(mp->settings, mp->synth);
    if (!mp->adriver) goto fail;

    return mp;
fail:
    midi_player_free(mp);
    return NULL;
}

void midi_player_free(MidiPlayer *mp) {
    if (!mp) return;
    if (mp->player)   { fluid_player_stop(mp->player); delete_fluid_player(mp->player); }
    if (mp->adriver)  delete_fluid_audio_driver(mp->adriver);
    if (mp->synth)    delete_fluid_synth(mp->synth);
    if (mp->settings) delete_fluid_settings(mp->settings);
    free(mp);
}

bool midi_player_load(MidiPlayer *mp, const char *midi_path, const MidiFile *mf) {
    if (!mp || !midi_path) return false;
    midi_player_stop(mp);
    snprintf(mp->midi_path, sizeof(mp->midi_path), "%s", midi_path);
    mp->mf        = mf;
    mp->total_sec = mf ? mf->total_seconds : 0.0;
    mp->pause_sec = 0.0;
    return build_player(mp);
}

void midi_player_play(MidiPlayer *mp) {
    if (!mp || !mp->player) return;
    if (mp->state == PLAYER_PLAYING) return;

    if (mp->state == PLAYER_PAUSED) {
        uint32_t tick = mp->mf
            ? midi_seconds_to_tick(mp->mf, mp->pause_sec)
            : (uint32_t)(mp->pause_sec * 480);
        build_player(mp);
        fluid_player_seek(mp->player, (int)tick);
    }
    apply_instrument(mp);
    fluid_player_play(mp->player);
    set_state(mp, PLAYER_PLAYING);
}

void midi_player_pause(MidiPlayer *mp) {
    if (!mp || mp->state != PLAYER_PLAYING) return;
    mp->pause_sec = midi_player_get_position(mp);
    fluid_player_stop(mp->player);
    fluid_synth_system_reset(mp->synth);
    set_state(mp, PLAYER_PAUSED);
}

void midi_player_stop(MidiPlayer *mp) {
    if (!mp) return;
    if (mp->player) fluid_player_stop(mp->player);
    fluid_synth_system_reset(mp->synth);
    mp->pause_sec = 0.0;
    set_state(mp, PLAYER_STOPPED);
}

void midi_player_seek(MidiPlayer *mp, double seconds) {
    if (!mp || !mp->player) return;
    if (seconds < 0.0) seconds = 0.0;
    if (mp->total_sec > 0.0 && seconds > mp->total_sec)
        seconds = mp->total_sec;

    uint32_t tick = mp->mf
        ? midi_seconds_to_tick(mp->mf, seconds)
        : (uint32_t)(seconds * 480);

    bool was_playing = (mp->state == PLAYER_PLAYING);
    if (was_playing) {
        fluid_player_stop(mp->player);
        fluid_synth_system_reset(mp->synth);
    }
    build_player(mp);
    fluid_player_seek(mp->player, (int)tick);

    if (was_playing) {
        apply_instrument(mp);
        fluid_player_play(mp->player);
        set_state(mp, PLAYER_PLAYING);
    } else {
        mp->pause_sec = seconds;
    }
}

/* Called from the UI timer (~50 ms).  Safe to call on the UI thread. */
void midi_player_tick(MidiPlayer *mp) {
    if (!mp || mp->state != PLAYER_PLAYING) return;

    double pos = midi_player_get_position(mp);
    if (mp->pos_cb) mp->pos_cb(pos, mp->pos_data);

    int status = mp->player
        ? fluid_player_get_status(mp->player)
        : FLUID_PLAYER_DONE;

    if (status == FLUID_PLAYER_DONE) {
        fluid_synth_system_reset(mp->synth);
        mp->state = PLAYER_STOPPED;
        if (mp->state_cb) mp->state_cb(PLAYER_STOPPED, mp->state_data);
        if (mp->done_cb)  mp->done_cb(mp->done_data);
    }
}

double midi_player_get_position(const MidiPlayer *mp) {
    if (!mp || !mp->player) return 0.0;
    if (mp->state == PLAYER_PAUSED) return mp->pause_sec;
    int tick = fluid_player_get_current_tick(mp->player);
    if (tick <= 0) return 0.0;
    if (mp->mf) return midi_tick_to_seconds(mp->mf, (uint32_t)tick);
    return (double)tick / 480.0;
}

double      midi_player_get_duration(const MidiPlayer *mp) { return mp ? mp->total_sec  : 0.0; }
PlayerState midi_player_get_state   (const MidiPlayer *mp) { return mp ? mp->state      : PLAYER_STOPPED; }

void midi_player_set_instrument(MidiPlayer *mp, int program) {
    if (!mp) return;
    mp->instrument = program;
    if (mp->state == PLAYER_PLAYING) apply_instrument(mp);
}

int midi_player_get_instrument(const MidiPlayer *mp) { return mp ? mp->instrument : 0; }

void midi_player_set_state_cb   (MidiPlayer *mp, PlayerStateCb    cb, void *d) { if (mp) { mp->state_cb = cb; mp->state_data = d; } }
void midi_player_set_position_cb(MidiPlayer *mp, PlayerPositionCb cb, void *d) { if (mp) { mp->pos_cb   = cb; mp->pos_data   = d; } }
void midi_player_set_done_cb    (MidiPlayer *mp, PlayerDoneCb     cb, void *d) { if (mp) { mp->done_cb  = cb; mp->done_data  = d; } }
