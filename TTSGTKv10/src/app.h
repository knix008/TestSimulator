#pragma once

/* GTK-free application logic layer.
   Manages TTS engines, synthesis threads, and audio playback.
   The UI layer registers callbacks to receive state-change notifications. */

#include <glib.h>
#include <stdbool.h>
#include "tts_engine.h"
#include "audio_player.h"

/* ── Event callbacks (always called on the GLib main thread) ──────────────── */

typedef struct App App;

typedef void (*AppOnSynthStart)(App *app, void *user);
typedef void (*AppOnSynthDone) (App *app, bool ok, void *user);
typedef void (*AppOnPlayback)  (App *app, bool playing, double pos, void *user);

/* ── App struct (opaque to UI) ────────────────────────────────────────────── */

struct App {
    TTSEngine  **engines;
    int          engine_count;
    int          active_engine_idx;

    AudioData   *audio;        /* current synthesised audio, may be NULL */
    AudioPlayer *player;

    bool         synthesizing;
    GMutex       mutex;

    /* Callbacks set by the UI layer */
    AppOnSynthStart on_synth_start;
    AppOnSynthDone  on_synth_done;
    AppOnPlayback   on_playback;
    void           *cb_user;
};

/* ── Lifecycle ────────────────────────────────────────────────────────────── */

App  *app_new  (void);
void  app_free (App *app);

/* ── Actions ──────────────────────────────────────────────────────────────── */

/* Launch synthesis in a background thread.
   Calls on_synth_start immediately, on_synth_done when finished. */
void app_synthesize(App        *app,
                    const char *text,
                    const char *voice,
                    int         speed,
                    int         pitch);

void app_play (App *app, double volume);
void app_stop (App *app);

/* ── Queries (thread-safe) ────────────────────────────────────────────────── */

bool           app_is_synthesizing (App *app);
bool           app_has_audio       (App *app);
TTSEngine     *app_active_engine   (App *app);
