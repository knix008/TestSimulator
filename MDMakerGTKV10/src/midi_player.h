#pragma once
#include <stdbool.h>
#include "midi_parser.h"

typedef enum {
    PLAYER_STOPPED,
    PLAYER_PLAYING,
    PLAYER_PAUSED
} PlayerState;

/* Callbacks are invoked from the caller's context (UI timer / main thread). */
typedef void (*PlayerStateCb)   (PlayerState state, void *user_data);
typedef void (*PlayerPositionCb)(double seconds,     void *user_data);
typedef void (*PlayerDoneCb)    (void *user_data);

typedef struct MidiPlayer MidiPlayer;

MidiPlayer   *midi_player_new (const char *soundfont_path);
void          midi_player_free(MidiPlayer *mp);

bool          midi_player_load(MidiPlayer *mp, const char *midi_path,
                                const MidiFile *mf);
void          midi_player_play (MidiPlayer *mp);
void          midi_player_pause(MidiPlayer *mp);
void          midi_player_stop (MidiPlayer *mp);
void          midi_player_seek (MidiPlayer *mp, double seconds);

/*
 * Call this periodically (e.g. from a GTK timer at ~50 ms) on the UI thread.
 * Fires position_cb with the current playback time, and done_cb if the player
 * has just finished.  No GLib/GTK dependency in the player itself.
 */
void          midi_player_tick(MidiPlayer *mp);

double        midi_player_get_position(const MidiPlayer *mp);
double        midi_player_get_duration(const MidiPlayer *mp);
PlayerState   midi_player_get_state   (const MidiPlayer *mp);

void          midi_player_set_instrument(MidiPlayer *mp, int program);
int           midi_player_get_instrument(const MidiPlayer *mp);

void midi_player_set_state_cb   (MidiPlayer *mp, PlayerStateCb    cb, void *data);
void midi_player_set_position_cb(MidiPlayer *mp, PlayerPositionCb cb, void *data);
void midi_player_set_done_cb    (MidiPlayer *mp, PlayerDoneCb     cb, void *data);
