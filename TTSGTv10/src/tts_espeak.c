#include "tts_espeak.h"

#include <espeak-ng/espeak_ng.h>
#include <espeak-ng/speak_lib.h>

#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* ── Internal state ──────────────────────────────────────────────────────── */

typedef struct {
    int16_t *buf;
    int      size;
    int      capacity;
    int      sample_rate;
} EspeakPriv;

/* Pointer to the active priv during synthesis; the callback is global so we
   use a thread-local-style global (synthesis is synchronous in one thread). */
static EspeakPriv *g_active = NULL;

/* ── eSpeak-NG synthesis callback ────────────────────────────────────────── */

static int synth_cb(short *wav, int numsamples, espeak_EVENT *events)
{
    (void)events;
    if (!wav || !g_active) return 0;

    int needed = g_active->size + numsamples;
    if (needed > g_active->capacity) {
        g_active->capacity = needed * 2;
        g_active->buf = realloc(g_active->buf,
                                (size_t)g_active->capacity * sizeof(int16_t));
    }
    memcpy(g_active->buf + g_active->size, wav,
           (size_t)numsamples * sizeof(int16_t));
    g_active->size += numsamples;
    return 0;
}

/* ── TTSEngine implementation ────────────────────────────────────────────── */

static bool espeak_init_fn(TTSEngine *self)
{
    EspeakPriv *priv = self->priv;

    espeak_ng_InitializePath(NULL);

    espeak_ng_ERROR_CONTEXT ctx = NULL;
    espeak_ng_STATUS st = espeak_ng_Initialize(&ctx);
    if (st != ENS_OK) {
        fprintf(stderr, "[espeak] Initialize failed: %d\n", st);
        return false;
    }

    st = espeak_ng_InitializeOutput(ENOUTPUT_MODE_SYNCHRONOUS, 0, NULL);
    if (st != ENS_OK) {
        fprintf(stderr, "[espeak] InitializeOutput failed: %d\n", st);
        return false;
    }

    espeak_SetSynthCallback(synth_cb);
    priv->sample_rate = espeak_ng_GetSampleRate();
    return true;
}

static bool espeak_synthesize_fn(TTSEngine *self,
                                  const char *text,
                                  const char *voice,
                                  int speed, int pitch,
                                  AudioData **out)
{
    EspeakPriv *priv = self->priv;
    priv->size = 0;

    if (!priv->capacity) {
        priv->capacity = priv->sample_rate * 30; /* pre-alloc 30 s */
        priv->buf = malloc((size_t)priv->capacity * sizeof(int16_t));
    }

    g_active = priv;

    espeak_SetVoiceByName(voice && voice[0] ? voice : "en");
    espeak_SetParameter(espeakRATE,   speed, 0);
    espeak_SetParameter(espeakPITCH,  pitch, 0);
    espeak_SetParameter(espeakVOLUME, 100,   0);

    espeak_ng_STATUS st = espeak_ng_Synthesize(
        text, strlen(text), 0, POS_CHARACTER, 0, espeakCHARS_UTF8, NULL, NULL);

    if (st == ENS_OK) espeak_ng_Synchronize();
    g_active = NULL;

    if (st != ENS_OK || priv->size == 0) {
        fprintf(stderr, "[espeak] Synthesize failed or empty output\n");
        return false;
    }

    AudioData *audio     = malloc(sizeof(AudioData));
    audio->samples       = malloc((size_t)priv->size * sizeof(int16_t));
    audio->num_samples   = priv->size;
    audio->sample_rate   = priv->sample_rate;
    audio->channels      = 1;
    memcpy(audio->samples, priv->buf, (size_t)priv->size * sizeof(int16_t));

    *out = audio;
    return true;
}

static const char **espeak_get_voices_fn(TTSEngine *self, int *count)
{
    (void)self;
    const espeak_VOICE **ev = espeak_ListVoices(NULL);
    if (!ev) { *count = 0; return NULL; }

    int n = 0;
    while (ev[n]) n++;

    const char **names = malloc(((size_t)n + 1) * sizeof(char *));
    for (int i = 0; i < n; i++)
        names[i] = ev[i]->name;
    names[n] = NULL;
    *count = n;
    return names;
}

static void espeak_cleanup_fn(TTSEngine *self)
{
    EspeakPriv *priv = self->priv;
    free(priv->buf);
    free(priv);
    free(self);
    espeak_ng_Terminate();
}

/* ── Constructor ─────────────────────────────────────────────────────────── */

TTSEngine *tts_espeak_new(void)
{
    EspeakPriv *priv = calloc(1, sizeof(EspeakPriv));
    TTSEngine  *eng  = malloc(sizeof(TTSEngine));

    eng->name        = "eSpeak-NG";
    eng->init        = espeak_init_fn;
    eng->synthesize  = espeak_synthesize_fn;
    eng->get_voices  = espeak_get_voices_fn;
    eng->cleanup     = espeak_cleanup_fn;
    eng->priv        = priv;
    return eng;
}
