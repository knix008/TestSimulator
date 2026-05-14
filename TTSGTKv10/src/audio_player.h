#pragma once

#include "tts_engine.h"
#include <stdbool.h>

typedef struct AudioPlayer AudioPlayer;

/* Called on GLib main thread; is_playing=false means playback just ended.
   position: 0.0–1.0 ratio of elapsed / total duration. */
typedef void (*PlayerCallback)(bool is_playing, double position, void *user_data);

AudioPlayer *audio_player_new        (void);
void         audio_player_free       (AudioPlayer *player);

/* Start playback of audio data.  Stops any current playback first. */
bool         audio_player_play       (AudioPlayer *player, const AudioData *data);
void         audio_player_stop       (AudioPlayer *player);

/* 0.0 = silent, 1.0 = full volume */
void         audio_player_set_volume (AudioPlayer *player, double volume);

bool         audio_player_is_playing (AudioPlayer *player);

/* position: 0.0–1.0 */
double       audio_player_get_position (AudioPlayer *player);

/* Callback is invoked from the GLib main loop (~20 Hz). */
void         audio_player_set_callback (AudioPlayer *player,
                                        PlayerCallback cb,
                                        void *user_data);
