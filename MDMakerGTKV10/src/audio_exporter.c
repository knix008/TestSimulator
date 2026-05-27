#include "audio_exporter.h"
#include <fluidsynth.h>
#include <sndfile.h>
#include <lame/lame.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* No GTK / GLib dependency.
   Worker thread calls progress_cb / done_cb directly — callers must
   handle thread-safety (e.g. marshal to GTK main thread via g_idle_add). */

#define BLOCK_SIZE  2048
#define TAIL_BLOCKS   88     /* ~2 s reverb tail at 44100 / 2048 */
#define SAMPLE_RATE 44100

typedef struct {
    char midi_path[1024];
    char out_path [1024];
    char sf_path  [1024];
    int  instrument;
    int  as_mp3;
    ExportProgressCb progress_cb;
    ExportDoneCb     done_cb;
    void            *user_data;
} ExportTask;

/* ── rendering thread ────────────────────────────────────────── */

static void *export_thread(void *arg) {
    ExportTask *task = arg;

    fluid_settings_t *settings = new_fluid_settings();
    fluid_settings_setstr (settings, "audio.driver",       "none");
    fluid_settings_setnum (settings, "synth.sample-rate",  (double)SAMPLE_RATE);
    fluid_settings_setint (settings, "synth.reverb.active", 1);
    fluid_settings_setint (settings, "synth.chorus.active", 1);

    fluid_synth_t  *synth  = new_fluid_synth(settings);
    fluid_player_t *player = NULL;

    if (!synth) {
        task->done_cb(0, "신디사이저 생성 실패", task->user_data);
        goto cleanup_settings;
    }
    if (fluid_synth_sfload(synth, task->sf_path, 1) == FLUID_FAILED) {
        task->done_cb(0, "SoundFont 로드 실패", task->user_data);
        goto cleanup_synth;
    }

    player = new_fluid_player(synth);
    if (!player || fluid_player_add(player, task->midi_path) != FLUID_OK) {
        task->done_cb(0, "MIDI 파일 로드 실패", task->user_data);
        goto cleanup_player;
    }

    if (task->instrument >= 0)
        for (int ch = 0; ch < 16; ch++)
            if (ch != 9)
                fluid_synth_program_change(synth, ch, task->instrument);

    fluid_player_play(player);

    int   total_ticks = fluid_player_get_total_ticks(player);
    float left [BLOCK_SIZE];
    float right[BLOCK_SIZE];

/* Macro: shared render loop body used for both WAV and MP3 */
#define RENDER_LOOP(write_block)                                            \
    do {                                                                    \
        int playing_done = 0, tail_blk = 0;                                \
        long blk = 0;                                                       \
        while (!playing_done || tail_blk < TAIL_BLOCKS) {                  \
            fluid_synth_write_float(synth, BLOCK_SIZE,                     \
                                    left, 0, 1, right, 0, 1);              \
            write_block;                                                    \
            blk++;                                                          \
            if (!playing_done &&                                            \
                fluid_player_get_status(player) == FLUID_PLAYER_DONE)      \
                playing_done = 1;                                           \
            if (playing_done) tail_blk++;                                   \
            if (blk % 20 == 0 && task->progress_cb) {                      \
                int pct;                                                    \
                if (!playing_done && total_ticks > 0) {                    \
                    int ct = fluid_player_get_current_tick(player);        \
                    pct = (int)((double)ct / total_ticks * 93.0);          \
                } else {                                                    \
                    pct = 93 + (int)((double)tail_blk/TAIL_BLOCKS * 6.0); \
                }                                                           \
                task->progress_cb(pct < 99 ? pct : 99, task->user_data);  \
            }                                                               \
        }                                                                   \
    } while (0)

    if (!task->as_mp3) {
        /* ── WAV ── */
        SF_INFO sfi = {
            .samplerate = SAMPLE_RATE, .channels = 2,
            .format     = SF_FORMAT_WAV | SF_FORMAT_PCM_16
        };
        SNDFILE *sf = sf_open(task->out_path, SFM_WRITE, &sfi);
        if (!sf) { task->done_cb(0,"WAV 파일 생성 실패",task->user_data); goto cleanup_player; }

        float interleaved[BLOCK_SIZE * 2];
        RENDER_LOOP({
            for (int i = 0; i < BLOCK_SIZE; i++) {
                interleaved[i*2]   = left[i];
                interleaved[i*2+1] = right[i];
            }
            sf_writef_float(sf, interleaved, BLOCK_SIZE);
        });
        sf_close(sf);

    } else {
        /* ── MP3 ── */
        FILE *fp = fopen(task->out_path, "wb");
        if (!fp) { task->done_cb(0,"MP3 파일 생성 실패",task->user_data); goto cleanup_player; }

        lame_global_flags *gfp = lame_init();
        lame_set_in_samplerate(gfp, SAMPLE_RATE);
        lame_set_num_channels (gfp, 2);
        lame_set_brate        (gfp, 192);
        lame_set_quality      (gfp, 2);
        if (lame_init_params(gfp) < 0) {
            lame_close(gfp); fclose(fp);
            task->done_cb(0,"LAME 초기화 실패",task->user_data);
            goto cleanup_player;
        }

        size_t         mp3_sz  = (size_t)(1.25 * BLOCK_SIZE + 7200);
        unsigned char *mp3_buf = malloc(mp3_sz);

        RENDER_LOOP({
            int bytes = lame_encode_buffer_ieee_float(
                gfp, left, right, BLOCK_SIZE, mp3_buf, (int)mp3_sz);
            if (bytes > 0) fwrite(mp3_buf, 1, (size_t)bytes, fp);
        });

        int flush = lame_encode_flush(gfp, mp3_buf, (int)mp3_sz);
        if (flush > 0) fwrite(mp3_buf, 1, (size_t)flush, fp);

        free(mp3_buf);
        lame_close(gfp);
        fclose(fp);
    }

#undef RENDER_LOOP

    if (task->progress_cb) task->progress_cb(100, task->user_data);
    task->done_cb(1, NULL, task->user_data);

cleanup_player:
    if (player) { fluid_player_stop(player); delete_fluid_player(player); }
cleanup_synth:
    delete_fluid_synth(synth);
cleanup_settings:
    delete_fluid_settings(settings);
    free(task);
    return NULL;
}

/* ── public ──────────────────────────────────────────────────── */

void audio_export_start(
    const char     *midi_path,
    const char     *out_path,
    const char     *soundfont_path,
    int             instrument,
    int             as_mp3,
    ExportProgressCb progress_cb,
    ExportDoneCb     done_cb,
    void            *user_data)
{
    ExportTask *task = calloc(1, sizeof(ExportTask));
    snprintf(task->midi_path, sizeof(task->midi_path), "%s", midi_path);
    snprintf(task->out_path,  sizeof(task->out_path),  "%s", out_path);
    snprintf(task->sf_path,   sizeof(task->sf_path),   "%s", soundfont_path);
    task->instrument  = instrument;
    task->as_mp3      = as_mp3;
    task->progress_cb = progress_cb;
    task->done_cb     = done_cb;
    task->user_data   = user_data;

    pthread_t tid;
    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
    pthread_create(&tid, &attr, export_thread, task);
    pthread_attr_destroy(&attr);
}
