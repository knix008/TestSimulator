#pragma once

#include <stdint.h>
#include <stdbool.h>

/* PCM audio buffer — mono, signed 16-bit little-endian */
typedef struct {
    int16_t *samples;
    int      num_samples;
    int      sample_rate;
    int      channels;
} AudioData;

typedef struct TTSEngine TTSEngine;

struct TTSEngine {
    const char  *name;

    /* Return true on success. Called once at startup. */
    bool  (*init)       (TTSEngine *self);

    /* Synthesize text → *out (caller must audio_data_free it).
       voice: voice/language identifier string (engine-specific).
       speed: words-per-minute (80–450).
       pitch: 0–100. */
    bool  (*synthesize) (TTSEngine  *self,
                         const char *text,
                         const char *voice,
                         int         speed,
                         int         pitch,
                         AudioData **out);

    /* Return NULL-terminated array of voice name strings.
       Caller must free() the outer array; strings are engine-owned. */
    const char **(*get_voices) (TTSEngine *self, int *count);

    void  (*cleanup)    (TTSEngine *self);

    void  *priv;
};

void       audio_data_free  (AudioData *data);
AudioData *audio_data_clone (const AudioData *src);
