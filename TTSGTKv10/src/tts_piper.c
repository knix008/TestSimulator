#include "tts_piper.h"

#include <sndfile.h>

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <dirent.h>
#include <unistd.h>
#include <limits.h>

#ifndef PATH_MAX
#define PATH_MAX 4096
#endif

#define MAX_MODELS    128
#define TMP_TXT       "/tmp/tts_piper_in.txt"
#define TMP_WAV       "/tmp/tts_piper_out.wav"
#define DEFAULT_SPEED 175   /* WPM → length_scale = DEFAULT_SPEED / speed */

/* ── Internal state ──────────────────────────────────────────────────────── */

typedef struct {
    char *binary;                       /* "piper" or "piper-tts" */
    char *model_paths[MAX_MODELS];      /* absolute .onnx paths   */
    char *model_names[MAX_MODELS];      /* display names          */
    int   count;
} PiperPriv;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/* Return a strdup'd binary name if it exists in PATH, else NULL. */
static char *find_binary(void)
{
    static const char *candidates[] = { "piper", "piper-tts", NULL };
    char cmd[128];
    for (int i = 0; candidates[i]; i++) {
        snprintf(cmd, sizeof(cmd),
                 "command -v %s >/dev/null 2>&1", candidates[i]);
        if (system(cmd) == 0) return strdup(candidates[i]);
    }
    return NULL;
}

/* Scan one directory for .onnx files that have a companion .onnx.json. */
static void scan_dir(PiperPriv *priv, const char *dirpath)
{
    DIR *d = opendir(dirpath);
    if (!d) return;

    struct dirent *ent;
    while ((ent = readdir(d)) && priv->count < MAX_MODELS) {
        const char *name = ent->d_name;
        size_t      len  = strlen(name);

        /* Must end with ".onnx" but not ".onnx.json" */
        if (len <= 5 || strcmp(name + len - 5, ".onnx") != 0) continue;

        /* Require companion JSON config */
        char json[PATH_MAX];
        snprintf(json, sizeof(json), "%s/%s.json", dirpath, name);
        if (access(json, F_OK) != 0) continue;

        char full[PATH_MAX];
        snprintf(full, sizeof(full), "%s/%s", dirpath, name);

        priv->model_paths[priv->count] = strdup(full);

        /* Display name: strip .onnx suffix */
        size_t dlen = len - 5;
        char   display[256];
        if (dlen >= sizeof(display)) dlen = sizeof(display) - 1;
        strncpy(display, name, dlen);
        display[dlen] = '\0';
        priv->model_names[priv->count] = strdup(display);

        priv->count++;
    }
    closedir(d);
}

/* Scan a directory and one level of its subdirectories. */
static void scan_tree(PiperPriv *priv, const char *root)
{
    scan_dir(priv, root);

    DIR *d = opendir(root);
    if (!d) return;

    struct dirent *ent;
    while ((ent = readdir(d))) {
        if (ent->d_name[0] == '.') continue;
        char sub[PATH_MAX];
        snprintf(sub, sizeof(sub), "%s/%s", root, ent->d_name);
        /* Only descend into directories */
        if (ent->d_type == DT_DIR) scan_dir(priv, sub);
    }
    closedir(d);
}

/* ── TTSEngine implementation ─────────────────────────────────────────────── */

static bool piper_init_fn(TTSEngine *self)
{
    PiperPriv *priv = self->priv;

    priv->binary = find_binary();
    if (!priv->binary) {
        fprintf(stderr, "[piper] binary not found in PATH "
                        "(install with: pip install piper-tts)\n");
        return false;
    }

    /* Scan model directories */
    const char *home = getenv("HOME");
    if (home) {
        char path[PATH_MAX];
        snprintf(path, sizeof(path), "%s/.local/share/piper", home);
        scan_tree(priv, path);

        snprintf(path, sizeof(path), "%s/.config/piper", home);
        scan_tree(priv, path);

        snprintf(path, sizeof(path), "%s/.piper", home);
        scan_tree(priv, path);
    }

    scan_tree(priv, "/usr/share/piper");
    scan_tree(priv, "/usr/local/share/piper");
    scan_dir (priv, "./models");

    if (priv->count == 0)
        fprintf(stderr, "[piper] No models found — "
                        "download .onnx files to ~/.local/share/piper/\n");

    return true;   /* engine is usable even before models are installed */
}

/* Find model path by display name; fall back to index 0. */
static const char *resolve_model(PiperPriv *priv, const char *voice)
{
    if (priv->count == 0) return NULL;
    for (int i = 0; i < priv->count; i++)
        if (strcmp(priv->model_names[i], voice) == 0)
            return priv->model_paths[i];
    return priv->model_paths[0];
}

static bool piper_synthesize_fn(TTSEngine *self,
                                 const char *text,
                                 const char *voice,
                                 int speed, int pitch,
                                 AudioData **out)
{
    (void)pitch;   /* Piper has no direct pitch control via CLI */
    PiperPriv *priv = self->priv;

    const char *model = resolve_model(priv, voice);
    if (!model) {
        fprintf(stderr, "[piper] No model available — "
                        "run ./download_ko_model.sh\n");
        return false;
    }

    /* Write text to temp file */
    FILE *f = fopen(TMP_TXT, "w");
    if (!f) return false;
    fputs(text, f);
    fclose(f);

    /* length_scale: higher = slower (175 WPM = 1.0) */
    double length_scale = (double)DEFAULT_SPEED / (double)speed;
    if (length_scale < 0.25) length_scale = 0.25;
    if (length_scale > 4.0)  length_scale = 4.0;

    char cmd[PATH_MAX * 2 + 256];
    snprintf(cmd, sizeof(cmd),
             "%s --model \"%s\" --output_file %s"
             " --length_scale %.3f"
             " < %s 2>/dev/null",
             priv->binary, model, TMP_WAV, length_scale, TMP_TXT);

    int ret = system(cmd);
    remove(TMP_TXT);

    if (ret != 0) {
        fprintf(stderr, "[piper] Command failed (exit %d)\n", ret);
        return false;
    }

    /* Read generated WAV */
    SF_INFO  info = {0};
    SNDFILE *sf   = sf_open(TMP_WAV, SFM_READ, &info);
    remove(TMP_WAV);

    if (!sf) {
        fprintf(stderr, "[piper] Could not read output WAV: %s\n",
                sf_strerror(NULL));
        return false;
    }

    sf_count_t total = info.frames * info.channels;
    AudioData *audio  = malloc(sizeof(AudioData));
    audio->sample_rate = info.samplerate;
    audio->channels    = info.channels;
    audio->num_samples = (int)total;
    audio->samples     = malloc((size_t)total * sizeof(int16_t));
    sf_read_short(sf, audio->samples, total);
    sf_close(sf);

    *out = audio;
    return true;
}

static const char **piper_get_voices_fn(TTSEngine *self, int *count)
{
    PiperPriv *priv = self->priv;

    if (priv->count == 0) {
        static const char *hint[] =
            { "[모델 없음 — download_ko_model.sh 실행]" };
        *count = 1;
        return hint;
    }

    const char **names = malloc(((size_t)priv->count + 1) * sizeof(char *));
    for (int i = 0; i < priv->count; i++)
        names[i] = priv->model_names[i];
    names[priv->count] = NULL;
    *count = priv->count;
    return names;
}

static void piper_cleanup_fn(TTSEngine *self)
{
    PiperPriv *priv = self->priv;
    free(priv->binary);
    for (int i = 0; i < priv->count; i++) {
        free(priv->model_paths[i]);
        free(priv->model_names[i]);
    }
    free(priv);
    free(self);
}

/* ── Constructor ──────────────────────────────────────────────────────────── */

TTSEngine *tts_piper_new(void)
{
    PiperPriv *priv = calloc(1, sizeof(PiperPriv));
    TTSEngine *eng  = malloc(sizeof(TTSEngine));

    eng->name       = "Piper TTS";
    eng->init       = piper_init_fn;
    eng->synthesize = piper_synthesize_fn;
    eng->get_voices = piper_get_voices_fn;
    eng->cleanup    = piper_cleanup_fn;
    eng->priv       = priv;
    return eng;
}
