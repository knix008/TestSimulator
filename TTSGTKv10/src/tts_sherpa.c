#include "tts_sherpa.h"
#include "sherpa-onnx/c-api/c-api.h"

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <math.h>
#include <limits.h>
#include <sys/stat.h>
#include <dirent.h>

#ifndef PATH_MAX
#define PATH_MAX 4096
#endif

/* ── Internal state ──────────────────────────────────────────────────────── */

typedef struct {
    char *model_dir;
    char *model_onnx;
    char *tokens;
    char *data_dir;
    char *voice_name;
    const SherpaOnnxOfflineTts *tts;
    int   sample_rate;
} SherpaPriv;

/* ── Model discovery ──────────────────────────────────────────────────────── */

static bool is_valid_model_dir(const char *dir)
{
    char path[PATH_MAX + 256];
    struct stat st;

    DIR *d = opendir(dir);
    if (!d) return false;

    bool found_onnx = false;
    struct dirent *ent;
    while ((ent = readdir(d))) {
        size_t len = strlen(ent->d_name);
        if (len > 5 && strcmp(ent->d_name + len - 5, ".onnx") == 0) {
            found_onnx = true;
            break;
        }
    }
    closedir(d);
    if (!found_onnx) return false;

    snprintf(path, sizeof(path), "%s/tokens.txt", dir);
    return stat(path, &st) == 0;
}

static char *scan_for_model(const char *base)
{
    if (is_valid_model_dir(base)) return strdup(base);

    DIR *d = opendir(base);
    if (!d) return NULL;

    char *result = NULL;
    struct dirent *ent;
    while ((ent = readdir(d)) && !result) {
        if (ent->d_name[0] == '.') continue;
        char sub[PATH_MAX + 256];
        snprintf(sub, sizeof(sub), "%s/%s", base, ent->d_name);
        struct stat st;
        if (stat(sub, &st) == 0 && S_ISDIR(st.st_mode) && is_valid_model_dir(sub))
            result = strdup(sub);
    }
    closedir(d);
    return result;
}

static char *find_onnx(const char *dir)
{
    DIR *d = opendir(dir);
    if (!d) return NULL;

    struct dirent *ent;
    while ((ent = readdir(d))) {
        size_t len = strlen(ent->d_name);
        if (len > 5 && strcmp(ent->d_name + len - 5, ".onnx") == 0) {
            char path[PATH_MAX + 256];
            snprintf(path, sizeof(path), "%s/%s", dir, ent->d_name);
            closedir(d);
            return strdup(path);
        }
    }
    closedir(d);
    return NULL;
}

/* ── TTSEngine implementation ─────────────────────────────────────────────── */

static bool sherpa_init_fn(TTSEngine *self)
{
    SherpaPriv *priv = self->priv;

    /* Search order: project ./models/ first, then ~/.local/share/sherpa-onnx */
    static char home_path[PATH_MAX];
    const char *home = getenv("HOME");

    const char *search[] = {
        "./models",
        NULL,    /* filled with $HOME path */
#ifdef __APPLE__
        NULL,    /* filled with macOS path */
#endif
        "/usr/local/share/sherpa-onnx",
        "/usr/share/sherpa-onnx",
        NULL
    };

    if (home) {
        snprintf(home_path, sizeof(home_path),
                 "%s/.local/share/sherpa-onnx", home);
        search[1] = home_path;
    }

    char *model_dir = NULL;
    for (int i = 0; search[i]; i++) {
        model_dir = scan_for_model(search[i]);
        if (model_dir) break;
    }

    if (!model_dir) {
        fprintf(stderr, "[sherpa] No model found in ./models/ — run: make sherpa-model\n");
        return true;   /* engine present, model absent — show hint in voice list */
    }

    priv->model_dir  = model_dir;
    priv->model_onnx = find_onnx(model_dir);
    if (!priv->model_onnx) {
        fprintf(stderr, "[sherpa] No .onnx file in %s\n", model_dir);
        free(model_dir);
        priv->model_dir = NULL;
        return false;
    }

    char tok[PATH_MAX + 256];
    snprintf(tok, sizeof(tok), "%s/tokens.txt", model_dir);
    priv->tokens = strdup(tok);

    char data[PATH_MAX + 256];
    snprintf(data, sizeof(data), "%s/espeak-ng-data", model_dir);
    struct stat st;
    priv->data_dir = (stat(data, &st) == 0 && S_ISDIR(st.st_mode))
                     ? strdup(data) : strdup("");

    const char *slash = strrchr(model_dir, '/');
    priv->voice_name = strdup(slash ? slash + 1 : model_dir);

    SherpaOnnxOfflineTtsVitsModelConfig vits = {0};
    vits.model         = priv->model_onnx;
    vits.tokens        = priv->tokens;
    vits.data_dir      = priv->data_dir;
    vits.noise_scale   = 0.667f;
    vits.noise_scale_w = 0.8f;
    vits.length_scale  = 1.0f;

    SherpaOnnxOfflineTtsModelConfig mc = {0};
    mc.vits        = vits;
    mc.num_threads = 2;
    mc.provider    = "cpu";

    SherpaOnnxOfflineTtsConfig cfg = {0};
    cfg.model = mc;

    priv->tts = SherpaOnnxCreateOfflineTts(&cfg);
    if (!priv->tts) {
        fprintf(stderr, "[sherpa] Failed to load model: %s\n", priv->model_onnx);
        return false;
    }

    priv->sample_rate = SherpaOnnxOfflineTtsSampleRate(priv->tts);
    fprintf(stderr, "[sherpa] Loaded: %s (%d Hz)\n",
            priv->voice_name, priv->sample_rate);
    return true;
}

/* Pitch shift via linear-interpolation resampling.
   pitch 50 = 1.0× (no change), 25 = 0.5× (one octave down), 100 = 2.0× (one octave up).
   pitch = int(pitch_multiplier × 50)  where pitch_multiplier comes from the UI slider. */
static void apply_pitch_shift(AudioData *audio, int pitch)
{
    if (pitch == 50) return;

    float ratio = (float)pitch / 50.0f;   /* 50→1.0×, 25→0.5×, 100→2.0× */
    int new_n = (int)((float)audio->num_samples / ratio);
    if (new_n <= 0) return;

    int16_t *shifted = malloc((size_t)new_n * sizeof(int16_t));
    for (int i = 0; i < new_n; i++) {
        float   src  = (float)i * ratio;
        int     si   = (int)src;
        float   frac = src - (float)si;
        int16_t a = (si     < audio->num_samples) ? audio->samples[si]     : 0;
        int16_t b = (si + 1 < audio->num_samples) ? audio->samples[si + 1] : 0;
        shifted[i] = (int16_t)((1.0f - frac) * (float)a + frac * (float)b);
    }
    free(audio->samples);
    audio->samples     = shifted;
    audio->num_samples = new_n;
}

/* Sherpa progress callback — converts float samples and forwards to engine->progress_cb. */
typedef struct {
    TTSEngine *engine;
    int        sample_rate;
} SherpaProgressCtx;

static int32_t sherpa_progress_fn(const float *samples, int32_t n,
                                   float progress, void *arg)
{
    SherpaProgressCtx *ctx = arg;
    if (!ctx->engine->progress_cb || n <= 0) return 1;

    int16_t *pcm = malloc((size_t)n * sizeof(int16_t));
    for (int i = 0; i < n; i++) {
        float s = samples[i];
        if (s >  1.0f) s =  1.0f;
        if (s < -1.0f) s = -1.0f;
        pcm[i] = (int16_t)(s * 32767.0f);
    }
    ctx->engine->progress_cb(pcm, n, ctx->sample_rate,
                              progress, ctx->engine->progress_user);
    free(pcm);
    return 1; /* continue */
}

static bool sherpa_synthesize_fn(TTSEngine *self,
                                  const char *text,
                                  const char *voice,
                                  int speed, int pitch,
                                  AudioData **out)
{
    (void)voice;
    SherpaPriv *priv = self->priv;

    if (!priv->tts) {
        fprintf(stderr, "[sherpa] No model — run: make sherpa-model\n");
        return false;
    }

    /* Normalize: 175 WPM = 1.0 (sherpa speed > 1 = faster) */
    SherpaOnnxGenerationConfig gen = {0};
    gen.sid   = 0;
    gen.speed = (float)(speed > 0 ? speed : 175) / 175.0f;
    if (gen.speed < 0.25f) gen.speed = 0.25f;
    if (gen.speed > 4.0f)  gen.speed = 4.0f;

    SherpaProgressCtx ctx = { self, priv->sample_rate };

    const SherpaOnnxGeneratedAudio *audio =
        SherpaOnnxOfflineTtsGenerateWithConfig(priv->tts, text, &gen,
                                               sherpa_progress_fn, &ctx);

    if (!audio || audio->n == 0) {
        fprintf(stderr, "[sherpa] Synthesis returned empty audio\n");
        if (audio) SherpaOnnxDestroyOfflineTtsGeneratedAudio(audio);
        return false;
    }

    AudioData *result   = malloc(sizeof(AudioData));
    result->sample_rate = audio->sample_rate;
    result->channels    = 1;
    result->num_samples = audio->n;
    result->samples     = malloc((size_t)audio->n * sizeof(int16_t));

    for (int i = 0; i < audio->n; i++) {
        float s = audio->samples[i];
        if (s >  1.0f) s =  1.0f;
        if (s < -1.0f) s = -1.0f;
        result->samples[i] = (int16_t)(s * 32767.0f);
    }

    SherpaOnnxDestroyOfflineTtsGeneratedAudio(audio);

    /* Apply pitch shift post-processing */
    apply_pitch_shift(result, pitch);

    *out = result;
    return true;
}

static const char **sherpa_get_voices_fn(TTSEngine *self, int *count)
{
    SherpaPriv *priv = self->priv;
    const char **names = malloc(2 * sizeof(char *));

    if (!priv->tts || !priv->voice_name) {
        names[0] = "[모델 없음 — make sherpa-model 실행]";
    } else {
        names[0] = priv->voice_name;
    }
    names[1] = NULL;
    *count = 1;
    return names;
}

static void sherpa_cleanup_fn(TTSEngine *self)
{
    SherpaPriv *priv = self->priv;
    if (priv->tts)
        SherpaOnnxDestroyOfflineTts((SherpaOnnxOfflineTts *)priv->tts);
    free(priv->model_dir);
    free(priv->model_onnx);
    free(priv->tokens);
    free(priv->data_dir);
    free(priv->voice_name);
    free(priv);
    free(self);
}

/* ── Constructor ──────────────────────────────────────────────────────────── */

TTSEngine *tts_sherpa_new(void)
{
    SherpaPriv *priv = calloc(1, sizeof(SherpaPriv));
    TTSEngine  *eng  = malloc(sizeof(TTSEngine));

    eng->name       = "Sherpa-ONNX";
    eng->init       = sherpa_init_fn;
    eng->synthesize = sherpa_synthesize_fn;
    eng->get_voices = sherpa_get_voices_fn;
    eng->cleanup    = sherpa_cleanup_fn;
    eng->priv       = priv;
    return eng;
}
