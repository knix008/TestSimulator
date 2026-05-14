#include "tts_festival.h"

#include <sndfile.h>

#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <unistd.h>

/* ── Helpers ──────────────────────────────────────────────────────────────── */

static const char *TMP_TXT = "/tmp/tts_festival_in.txt";
static const char *TMP_WAV = "/tmp/tts_festival_out.wav";

static bool cmd_exists(const char *cmd)
{
    char buf[256];
    snprintf(buf, sizeof(buf), "command -v %s >/dev/null 2>&1", cmd);
    return system(buf) == 0;
}

/* ── TTSEngine implementation ─────────────────────────────────────────────── */

static bool festival_init_fn(TTSEngine *self)
{
    (void)self;
    return cmd_exists("text2wave");
}

static bool festival_synthesize_fn(TTSEngine *self,
                                    const char *text,
                                    const char *voice,
                                    int speed, int pitch,
                                    AudioData **out)
{
    (void)self; (void)speed; (void)pitch;

    /* Write input text */
    FILE *f = fopen(TMP_TXT, "w");
    if (!f) return false;
    fprintf(f, "%s", text);
    fclose(f);

    /* Build text2wave command — optionally select a voice */
    char cmd[512];
    if (voice && voice[0] && strcmp(voice, "default") != 0)
        snprintf(cmd, sizeof(cmd),
                 "text2wave -eval '(voice_%s)' -o %s %s 2>/dev/null",
                 voice, TMP_WAV, TMP_TXT);
    else
        snprintf(cmd, sizeof(cmd),
                 "text2wave -o %s %s 2>/dev/null", TMP_WAV, TMP_TXT);

    int ret = system(cmd);
    remove(TMP_TXT);

    if (ret != 0) {
        fprintf(stderr, "[festival] text2wave failed (exit %d)\n", ret);
        return false;
    }

    /* Read WAV via libsndfile */
    SF_INFO info = {0};
    SNDFILE *sf  = sf_open(TMP_WAV, SFM_READ, &info);
    remove(TMP_WAV);

    if (!sf) {
        fprintf(stderr, "[festival] Could not read output WAV\n");
        return false;
    }

    sf_count_t total = info.frames * info.channels;
    AudioData  *audio = malloc(sizeof(AudioData));
    audio->sample_rate = info.samplerate;
    audio->channels    = info.channels;
    audio->num_samples = (int)total;
    audio->samples     = malloc((size_t)total * sizeof(int16_t));
    sf_read_short(sf, audio->samples, total);
    sf_close(sf);

    *out = audio;
    return true;
}

static const char **festival_get_voices_fn(TTSEngine *self, int *count)
{
    (void)self;
    /* Common Festival voices — availability depends on installed packages */
    static const char *voices[] = {
        "default",
        "kal_diphone",
        "don_diphone",
        "rab_diphone",
        NULL
    };
    *count = 4;
    return voices;
}

static void festival_cleanup_fn(TTSEngine *self)
{
    free(self);
}

/* ── Constructor ──────────────────────────────────────────────────────────── */

TTSEngine *tts_festival_new(void)
{
    TTSEngine *eng  = malloc(sizeof(TTSEngine));
    eng->name       = "Festival";
    eng->init       = festival_init_fn;
    eng->synthesize = festival_synthesize_fn;
    eng->get_voices = festival_get_voices_fn;
    eng->cleanup    = festival_cleanup_fn;
    eng->priv       = NULL;
    return eng;
}
