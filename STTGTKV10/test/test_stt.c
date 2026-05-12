/*
 * test_stt.c  –  CLI smoke-test for the whisper.cpp STT integration.
 *
 * Usage: test_stt <model.bin> <audio.wav>
 *
 * Reads a 16-bit PCM, 16 kHz, mono WAV file and runs Korean transcription.
 * The WAV file can be prepared with:
 *   ffmpeg -i input.mp3 -ar 16000 -ac 1 -sample_fmt s16 output.wav
 */

#define _POSIX_C_SOURCE 200809L
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "../stt_core.h"

/* ── Minimal WAV reader (PCM s16le, 16 kHz, mono) ────────────────────── */

typedef struct {
    uint32_t chunk_id;      /* "RIFF" */
    uint32_t chunk_size;
    uint32_t format;        /* "WAVE" */
    uint32_t subchunk1_id;  /* "fmt " */
    uint32_t subchunk1_size;
    uint16_t audio_format;  /* 1 = PCM */
    uint16_t num_channels;
    uint32_t sample_rate;
    uint32_t byte_rate;
    uint16_t block_align;
    uint16_t bits_per_sample;
    uint32_t subchunk2_id;  /* "data" */
    uint32_t subchunk2_size;
} WavHeader;

static float *wav_read_f32(const char *path, int *out_n) {
    FILE *fp = fopen(path, "rb");
    if (!fp) { fprintf(stderr, "Cannot open: %s\n", path); return NULL; }

    /* Read RIFF/WAVE header */
    char riff[4], wave[4];
    uint32_t riff_size;
    if (fread(riff, 1, 4, fp) != 4 || fread(&riff_size, 4, 1, fp) != 1 ||
        fread(wave, 1, 4, fp) != 4 ||
        memcmp(riff, "RIFF", 4) != 0 || memcmp(wave, "WAVE", 4) != 0) {
        fprintf(stderr, "Not a valid WAV file: %s\n", path);
        fclose(fp); return NULL;
    }

    /* Scan chunks until we find "fmt " and "data" */
    uint16_t audio_format = 0, num_channels = 0, bits_per_sample = 0;
    uint32_t sample_rate = 0;
    uint32_t data_size   = 0;
    int      found_fmt   = 0, found_data = 0;

    char     id[4];
    uint32_t chunk_size;
    while (fread(id, 1, 4, fp) == 4 && fread(&chunk_size, 4, 1, fp) == 1) {
        if (memcmp(id, "fmt ", 4) == 0) {
            if (fread(&audio_format,    2, 1, fp) != 1 ||
                fread(&num_channels,    2, 1, fp) != 1 ||
                fread(&sample_rate,     4, 1, fp) != 1) {
                fprintf(stderr, "WAV: truncated fmt chunk in %s\n", path);
                fclose(fp); return NULL;
            }
            fseek(fp, 6, SEEK_CUR);           /* skip byte_rate + block_align */
            if (fread(&bits_per_sample, 2, 1, fp) != 1) {
                fprintf(stderr, "WAV: truncated fmt chunk in %s\n", path);
                fclose(fp); return NULL;
            }
            if (chunk_size > 16)
                fseek(fp, (long)(chunk_size - 16), SEEK_CUR);
            found_fmt = 1;
        } else if (memcmp(id, "data", 4) == 0) {
            data_size   = chunk_size;
            found_data  = 1;
            break;                            /* PCM data follows immediately */
        } else {
            fseek(fp, (long)chunk_size, SEEK_CUR);
        }
    }

    if (!found_fmt || !found_data) {
        fprintf(stderr, "WAV: missing fmt or data chunk in %s\n", path);
        fclose(fp); return NULL;
    }
    if (audio_format != 1) {
        fprintf(stderr, "WAV: only PCM supported (format=%d)\n", audio_format);
        fclose(fp); return NULL;
    }
    if (num_channels != 1) {
        fprintf(stderr, "WAV: only mono supported (%d channels)\n", num_channels);
        fclose(fp); return NULL;
    }
    if (sample_rate != 16000) {
        fprintf(stderr, "WAV: sample rate %u (whisper needs 16000)\n", sample_rate);
    }
    if (bits_per_sample != 16) {
        fprintf(stderr, "WAV: only 16-bit supported (%d bps)\n", bits_per_sample);
        fclose(fp); return NULL;
    }

    int      n   = (int)(data_size / 2);
    int16_t *raw = malloc((size_t)n * sizeof(int16_t));
    if (!raw) { fclose(fp); return NULL; }

    int got = (int)fread(raw, sizeof(int16_t), (size_t)n, fp);
    fclose(fp);

    float *pcm = malloc((size_t)got * sizeof(float));
    for (int i = 0; i < got; i++)
        pcm[i] = (float)raw[i] / 32768.0f;
    free(raw);

    *out_n = got;
    return pcm;
}

/* ── Result callback ──────────────────────────────────────────────────── */

static void on_result(const char *text, void *userdata) {
    (void)userdata;
    printf("  RESULT: %s\n", text);
}

/* ── main ─────────────────────────────────────────────────────────────── */

int main(int argc, char *argv[]) {
    if (argc < 3) {
        fprintf(stderr, "Usage: %s <model.bin> <audio.wav>\n", argv[0]);
        return 1;
    }

    const char *model_path = argv[1];
    const char *wav_path   = argv[2];

    printf("[1/3] Loading model: %s\n", model_path);
    SttContext *ctx = stt_context_new(model_path);
    if (!ctx) { fprintf(stderr, "Model load failed.\n"); return 1; }
    printf("      Model loaded OK.\n");

    printf("[2/3] Reading audio: %s\n", wav_path);
    int    n_samples = 0;
    float *pcm       = wav_read_f32(wav_path, &n_samples);
    if (!pcm) { stt_context_free(ctx); return 1; }
    printf("      %d samples (%.2f s @ 16 kHz)\n",
           n_samples, (double)n_samples / 16000.0);

    printf("[3/3] Transcribing (language=ko)...\n");
    struct timespec t0, t1;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    int rc = stt_transcribe(ctx, pcm, n_samples, on_result, NULL);
    clock_gettime(CLOCK_MONOTONIC, &t1);
    double elapsed = (t1.tv_sec - t0.tv_sec) + (t1.tv_nsec - t0.tv_nsec) * 1e-9;
    if (rc != 0) fprintf(stderr, "      Transcription failed.\n");
    else         printf("  TIME: %.2fs\n", elapsed);

    free(pcm);
    stt_context_free(ctx);
    return rc;
}
