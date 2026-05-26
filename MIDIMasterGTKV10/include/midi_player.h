#ifndef MIDI_PLAYER_H
#define MIDI_PLAYER_H

#include <glib.h>

typedef enum {
    MIDI_STATE_STOPPED,
    MIDI_STATE_PLAYING,
    MIDI_STATE_PAUSED
} MidiPlaybackState;

typedef struct MidiPlayer MidiPlayer;

MidiPlayer *midi_player_new(const char *soundfont_path);
void        midi_player_free(MidiPlayer *player);

gboolean midi_player_load(MidiPlayer *player, const char *midi_path, GError **err);
void     midi_player_set_total_seconds(MidiPlayer *player, double seconds);
void     midi_player_set_instrument(MidiPlayer *player, int program);

void midi_player_play(MidiPlayer *player);
void midi_player_pause(MidiPlayer *player);
void midi_player_stop(MidiPlayer *player);
void midi_player_seek_seconds(MidiPlayer *player, double seconds);

MidiPlaybackState midi_player_state(const MidiPlayer *player);
double            midi_player_current_seconds(const MidiPlayer *player);
double            midi_player_total_seconds(const MidiPlayer *player);

typedef void (*MidiPlayerPositionCb)(double seconds, gpointer user_data);
typedef void (*MidiPlayerStateCb)(MidiPlaybackState state, gpointer user_data);
typedef void (*MidiPlayerVoidCb)(gpointer user_data);

void midi_player_on_position(MidiPlayer *player, MidiPlayerPositionCb cb, gpointer data);
void midi_player_on_state(MidiPlayer *player, MidiPlayerStateCb cb, gpointer data);
void midi_player_on_stopped(MidiPlayer *player, MidiPlayerVoidCb cb, gpointer data);
void midi_player_on_completed(MidiPlayer *player, MidiPlayerVoidCb cb, gpointer data);

#endif
