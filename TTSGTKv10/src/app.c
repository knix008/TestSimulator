#include "app.h"
#include "tts_espeak.h"
#include "tts_sherpa.h"

#include <glib.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* ── Synthesis thread ─────────────────────────────────────────────────────── */

typedef struct {
    App       *app;
    char      *text;
    char      *voice;
    int        speed;
    int        pitch;
    TTSEngine *engine;
} SynthJob;

/* Runs on the GLib main thread via g_idle_add. */
static gboolean synth_done_idle(gpointer data)
{
    App *app = data;

    g_mutex_lock(&app->mutex);
    app->synthesizing = false;
    g_mutex_unlock(&app->mutex);

    bool ok = app->audio != NULL;
    if (app->on_synth_done)
        app->on_synth_done(app, ok, app->cb_user);

    return G_SOURCE_REMOVE;
}

static gpointer synth_thread(gpointer data)
{
    SynthJob *job = data;
    App      *app = job->app;

    AudioData *audio = NULL;
    bool ok = job->engine->synthesize(job->engine,
                                      job->text, job->voice,
                                      job->speed, job->pitch,
                                      &audio);
    if (!ok) {
        fprintf(stderr, "[app] synthesis failed\n");
        audio = NULL;
    }

    /* Replace current audio */
    g_mutex_lock(&app->mutex);
    audio_data_free(app->audio);
    app->audio = audio;
    g_mutex_unlock(&app->mutex);

    free(job->text);
    free(job->voice);
    free(job);

    g_idle_add(synth_done_idle, app);
    return NULL;
}

/* ── Partial audio delivery (synthesis thread → GLib main thread) ────────── */

typedef struct {
    App     *app;
    int16_t *samples;
    int      count;
    int      sample_rate;
} PartialDelivery;

static gboolean deliver_partial_idle(gpointer data)
{
    PartialDelivery *d = data;
    if (d->app->on_synth_partial)
        d->app->on_synth_partial(d->app, d->samples, d->count,
                                  d->sample_rate, d->app->cb_user);
    free(d->samples);
    free(d);
    return G_SOURCE_REMOVE;
}

/* Called from the synthesis thread via engine->progress_cb. */
static void engine_progress_cb(const int16_t *samples, int count,
                                int sample_rate, float progress, void *user)
{
    (void)progress;
    App *app = user;
    if (!app->on_synth_partial || count <= 0) return;

    PartialDelivery *d = malloc(sizeof(PartialDelivery));
    d->app         = app;
    d->count       = count;
    d->sample_rate = sample_rate;
    d->samples     = malloc((size_t)count * sizeof(int16_t));
    memcpy(d->samples, samples, (size_t)count * sizeof(int16_t));
    g_idle_add(deliver_partial_idle, d);
}

/* ── Playback callback (from audio_player, GLib main thread) ──────────────── */

static void playback_cb(bool playing, double pos, void *user)
{
    App *app = user;
    if (app->on_playback)
        app->on_playback(app, playing, pos, app->cb_user);
}

/* ── Lifecycle ────────────────────────────────────────────────────────────── */

App *app_new(void)
{
    App *app = calloc(1, sizeof(App));
    g_mutex_init(&app->mutex);

    /* Register available TTS engines */
    int cap = 2;
    app->engines = malloc((size_t)cap * sizeof(TTSEngine *));

    /* Sherpa-ONNX — primary: VITS C API, embedded-ready */
    TTSEngine *sherpa = tts_sherpa_new();
    if (sherpa->init(sherpa)) {
        sherpa->progress_cb   = engine_progress_cb;
        sherpa->progress_user = app;
        app->engines[app->engine_count++] = sherpa;
    } else {
        sherpa->cleanup(sherpa);
    }

    /* eSpeak-NG — fallback, always available */
    TTSEngine *espeak = tts_espeak_new();
    if (espeak->init(espeak)) {
        app->engines[app->engine_count++] = espeak;
    } else {
        espeak->cleanup(espeak);
    }

    app->player = audio_player_new();
    audio_player_set_callback(app->player, playback_cb, app);

    return app;
}

void app_free(App *app)
{
    app_stop(app);

    audio_player_free(app->player);
    audio_data_free(app->audio);

    for (int i = 0; i < app->engine_count; i++)
        app->engines[i]->cleanup(app->engines[i]);
    free(app->engines);

    g_mutex_clear(&app->mutex);
    free(app);
}

/* ── Actions ──────────────────────────────────────────────────────────────── */

void app_synthesize(App *app, const char *text,
                    const char *voice, int speed, int pitch)
{
    g_mutex_lock(&app->mutex);
    if (app->synthesizing) {
        g_mutex_unlock(&app->mutex);
        return;
    }
    app->synthesizing = true;
    g_mutex_unlock(&app->mutex);

    TTSEngine *engine = app_active_engine(app);
    if (!engine) {
        g_mutex_lock(&app->mutex);
        app->synthesizing = false;
        g_mutex_unlock(&app->mutex);
        return;
    }

    if (app->on_synth_start)
        app->on_synth_start(app, app->cb_user);

    SynthJob *job = malloc(sizeof(SynthJob));
    job->app    = app;
    job->text   = strdup(text);
    job->voice  = strdup(voice ? voice : "");
    job->speed  = speed;
    job->pitch  = pitch;
    job->engine = engine;

    g_thread_new("tts-synth", synth_thread, job);
}

void app_play(App *app, double volume)
{
    g_mutex_lock(&app->mutex);
    AudioData *audio = app->audio;
    g_mutex_unlock(&app->mutex);

    if (!audio) return;
    audio_player_set_volume(app->player, volume);
    audio_player_play(app->player, audio);
}

void app_stop(App *app)
{
    audio_player_stop(app->player);
}

/* ── Queries ──────────────────────────────────────────────────────────────── */

bool app_is_synthesizing(App *app)
{
    g_mutex_lock(&app->mutex);
    bool v = app->synthesizing;
    g_mutex_unlock(&app->mutex);
    return v;
}

bool app_has_audio(App *app)
{
    g_mutex_lock(&app->mutex);
    bool v = app->audio != NULL;
    g_mutex_unlock(&app->mutex);
    return v;
}

TTSEngine *app_active_engine(App *app)
{
    int idx = app->active_engine_idx;
    if (idx < 0 || idx >= app->engine_count) return NULL;
    return app->engines[idx];
}
