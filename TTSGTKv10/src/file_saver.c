#include "file_saver.h"

#include <sndfile.h>
#include <lame/lame.h>

#include <stdlib.h>
#include <stdio.h>

/* ── WAV ──────────────────────────────────────────────────────────────────── */

bool file_save_wav(const char *path, const AudioData *data)
{
    SF_INFO info = {
        .frames     = data->num_samples / data->channels,
        .samplerate = data->sample_rate,
        .channels   = data->channels,
        .format     = SF_FORMAT_WAV | SF_FORMAT_PCM_16,
    };

    SNDFILE *sf = sf_open(path, SFM_WRITE, &info);
    if (!sf) {
        fprintf(stderr, "[saver] sf_open '%s': %s\n", path, sf_strerror(NULL));
        return false;
    }

    sf_count_t written = sf_write_short(sf, data->samples, data->num_samples);
    sf_close(sf);

    if (written != data->num_samples) {
        fprintf(stderr, "[saver] WAV: wrote %lld / %d samples\n",
                (long long)written, data->num_samples);
        return false;
    }
    return true;
}

/* ── MP3 ──────────────────────────────────────────────────────────────────── */

bool file_save_mp3(const char *path, const AudioData *data, int bitrate)
{
    lame_global_flags *lame = lame_init();
    if (!lame) return false;

    lame_set_in_samplerate(lame,  data->sample_rate);
    lame_set_num_channels (lame,  data->channels);
    lame_set_brate        (lame,  bitrate);
    lame_set_quality      (lame,  2);   /* 0=best, 9=worst */

    if (lame_init_params(lame) < 0) {
        lame_close(lame);
        return false;
    }

    /* Worst-case MP3 output size per LAME docs */
    int frame_count = data->num_samples / data->channels;
    int mp3_size    = frame_count * 5 / 4 + 7200;
    unsigned char *mp3 = malloc((size_t)mp3_size);

    int encoded;
    if (data->channels == 1) {
        /* Mono: pass same pointer for both channels */
        encoded = lame_encode_buffer(lame,
                                     data->samples, data->samples,
                                     frame_count, mp3, mp3_size);
    } else {
        /* Stereo: de-interleave */
        int16_t *L = malloc((size_t)frame_count * sizeof(int16_t));
        int16_t *R = malloc((size_t)frame_count * sizeof(int16_t));
        for (int i = 0; i < frame_count; i++) {
            L[i] = data->samples[i * 2];
            R[i] = data->samples[i * 2 + 1];
        }
        encoded = lame_encode_buffer(lame, L, R, frame_count, mp3, mp3_size);
        free(L); free(R);
    }

    int flush = 0;
    if (encoded >= 0)
        flush = lame_encode_flush(lame, mp3 + encoded, mp3_size - encoded);

    lame_close(lame);

    if (encoded < 0) {
        fprintf(stderr, "[saver] LAME encode error: %d\n", encoded);
        free(mp3);
        return false;
    }

    FILE *fp = fopen(path, "wb");
    if (!fp) { free(mp3); return false; }
    fwrite(mp3, 1, (size_t)(encoded + flush), fp);
    fclose(fp);
    free(mp3);
    return true;
}
