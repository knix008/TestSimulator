#include "tts_engine.h"
#include <stdlib.h>
#include <string.h>

void audio_data_free(AudioData *data)
{
    if (!data) return;
    free(data->samples);
    free(data);
}

AudioData *audio_data_clone(const AudioData *src)
{
    if (!src) return NULL;
    AudioData *dst = malloc(sizeof(AudioData));
    dst->sample_rate  = src->sample_rate;
    dst->channels     = src->channels;
    dst->num_samples  = src->num_samples;
    dst->samples      = malloc((size_t)src->num_samples * sizeof(int16_t));
    memcpy(dst->samples, src->samples, (size_t)src->num_samples * sizeof(int16_t));
    return dst;
}
