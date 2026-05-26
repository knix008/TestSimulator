#include "audio_export.h"

#include <fluidsynth.h>
#include <fluidsynth/log.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static void fluidsynth_export_settings(fluid_settings_t *settings)
{
    static gboolean quiet;
    if (!quiet) {
        fluid_set_log_function(FLUID_INFO, NULL, NULL);
        fluid_set_log_function(FLUID_WARN, NULL, NULL);
        quiet = TRUE;
    }
    fluid_settings_setint(settings, "audio.realtime-prio", 0);
}

#ifdef HAVE_LAME
#include <lame/lame.h>
#endif

#define DRUM_CHANNEL 9

typedef struct {
    AudioExportProgressCb cb;
    gpointer              user_data;
    int                   pct_lo;
    int                   pct_hi;
} ExportProgressCtx;

static void export_report(ExportProgressCtx *ctx, double fraction)
{
    if (!ctx || !ctx->cb)
        return;
    if (fraction < 0.0)
        fraction = 0.0;
    if (fraction > 1.0)
        fraction = 1.0;
    int pct = ctx->pct_lo + (int)((double)(ctx->pct_hi - ctx->pct_lo) * fraction + 0.5);
    if (pct < ctx->pct_lo)
        pct = ctx->pct_lo;
    if (pct > ctx->pct_hi)
        pct = ctx->pct_hi;
    ctx->cb(pct, ctx->user_data);
}

static gboolean export_wav_fluidsynth(const char *midi_path, const char *wav_path,
                                       const char *sf2, int program,
                                       ExportProgressCtx *progress, GError **err)
{
    fluid_settings_t *settings = new_fluid_settings();
    fluidsynth_export_settings(settings);
    fluid_settings_setnum(settings, "synth.sample-rate", 44100);
    fluid_settings_setstr(settings, "audio.file.name", wav_path);
    fluid_settings_setstr(settings, "audio.file.type", "wav");
    fluid_settings_setstr(settings, "player.timing-source", "sample");
    fluid_settings_setint(settings, "synth.threadsafe-api", 0);
    fluid_settings_setint(settings, "audio.period-size", 4096);
    fluid_settings_setint(settings, "synth.chorus.active", 1);
    fluid_settings_setint(settings, "synth.reverb.active", 1);

    fluid_synth_t *synth = new_fluid_synth(settings);
    if (!synth) {
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "FluidSynth init failed");
        delete_fluid_settings(settings);
        return FALSE;
    }
    if (fluid_synth_sfload(synth, sf2, 1) == FLUID_FAILED) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Cannot load SoundFont: %s", sf2);
        delete_fluid_synth(synth);
        delete_fluid_settings(settings);
        return FALSE;
    }

    for (int ch = 0; ch < 16; ch++) {
        if (ch == DRUM_CHANNEL)
            continue;
        fluid_synth_program_change(synth, ch, program);
    }

    fluid_player_t *player = new_fluid_player(synth);
    if (!player) {
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "FluidSynth player failed");
        delete_fluid_synth(synth);
        delete_fluid_settings(settings);
        return FALSE;
    }
    if (fluid_player_add(player, midi_path) != FLUID_OK) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Cannot load MIDI: %s", midi_path);
        delete_fluid_player(player);
        delete_fluid_synth(synth);
        delete_fluid_settings(settings);
        return FALSE;
    }

    fluid_file_renderer_t *renderer = new_fluid_file_renderer(synth);
    if (!renderer) {
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                            "FluidSynth file renderer failed");
        delete_fluid_player(player);
        delete_fluid_synth(synth);
        delete_fluid_settings(settings);
        return FALSE;
    }

    int total_ticks = fluid_player_get_total_ticks(player);
    if (total_ticks < 1)
        total_ticks = 1;

    fluid_player_play(player);

    /*
     * Render at CPU speed using fluid_file_renderer_process_block.
     * Rate-limit progress reporting to once per ~500 blocks (~47 s of rendered
     * audio) so the UI-idle path is called at most a few hundred times total —
     * well within the fixed export_schedule_ui locking model.
     */
    gboolean failed = FALSE;
    int block_count = 0;
    int last_pct = -1;

    while (fluid_player_get_status(player) == FLUID_PLAYER_PLAYING) {
        if (fluid_file_renderer_process_block(renderer) != FLUID_OK) {
            g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                                "Audio render block failed");
            failed = TRUE;
            break;
        }
        if (progress && (++block_count % 500 == 0)) {
            int cur = fluid_player_get_current_tick(player);
            if (cur < 0) cur = 0;
            if (cur > total_ticks) cur = total_ticks;
            int pct = progress->pct_lo + (int)((double)(progress->pct_hi - progress->pct_lo)
                                               * cur / total_ticks);
            if (pct != last_pct) {
                export_report(progress, (double)cur / (double)total_ticks);
                last_pct = pct;
            }
        }
    }

    if (fluid_player_get_status(player) == FLUID_PLAYER_PLAYING)
        fluid_player_stop(player);
    fluid_player_join(player);
    delete_fluid_file_renderer(renderer);
    delete_fluid_player(player);
    delete_fluid_synth(synth);
    delete_fluid_settings(settings);

    if (failed)
        return FALSE;
    if (progress)
        export_report(progress, 1.0);
    return TRUE;
}

gboolean audio_export_wav(const char *midi_path, const char *wav_path,
                          const char *soundfont_path, int program,
                          AudioExportProgressCb progress, gpointer user_data,
                          GError **err)
{
    ExportProgressCtx pctx = { progress, user_data, 5, 100 };
    if (progress)
        progress(0, user_data);
    if (!export_wav_fluidsynth(midi_path, wav_path, soundfont_path, program, progress ? &pctx : NULL,
                               err))
        return FALSE;
    if (progress)
        progress(100, user_data);
    return TRUE;
}

gboolean audio_export_mp3(const char *midi_path, const char *mp3_path,
                          const char *soundfont_path, int program,
                          AudioExportProgressCb progress, gpointer user_data,
                          GError **err)
{
#ifdef HAVE_LAME
    char tmp[] = "/tmp/midimaster_export_XXXXXX.wav";
    int fd = g_mkstemp(tmp);
    if (fd < 0) {
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Cannot create temp WAV");
        return FALSE;
    }
    close(fd);

    ExportProgressCtx wav_ctx = { progress, user_data, 5, 82 };
    if (progress)
        progress(0, user_data);
    if (!export_wav_fluidsynth(midi_path, tmp, soundfont_path, program, progress ? &wav_ctx : NULL,
                               err)) {
        unlink(tmp);
        return FALSE;
    }
    if (progress)
        progress(85, user_data);

    FILE *fin = fopen(tmp, "rb");
    if (!fin) {
        unlink(tmp);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Cannot read temp WAV");
        return FALSE;
    }

    fseek(fin, 0, SEEK_END);
    long sz = ftell(fin);
    fseek(fin, 0, SEEK_SET);
    if (sz < 44) {
        fclose(fin);
        unlink(tmp);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Invalid temp WAV");
        return FALSE;
    }

    /* Skip 44-byte WAV header; assume PCM 16 stereo 44100 from FluidSynth */
    fseek(fin, 44, SEEK_SET);
    sz -= 44;
    short *pcm = g_malloc(sz);
    if ((long)fread(pcm, 1, (size_t)sz, fin) != sz) {
        fclose(fin);
        unlink(tmp);
        g_free(pcm);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "WAV read failed");
        return FALSE;
    }
    fclose(fin);
    unlink(tmp);

    int frames = (int)(sz / (2 * sizeof(short)));
    short *left = g_malloc(sizeof(short) * frames);
    short *right = g_malloc(sizeof(short) * frames);
    for (int i = 0; i < frames; i++) {
        left[i] = pcm[i * 2];
        right[i] = pcm[i * 2 + 1];
    }
    g_free(pcm);

    lame_t lame = lame_init();
    lame_set_in_samplerate(lame, 44100);
    lame_set_num_channels(lame, 2);
    lame_set_brate(lame, 192);
    lame_init_params(lame);

    FILE *fout = fopen(mp3_path, "wb");
    if (!fout) {
        lame_close(lame);
        g_free(left);
        g_free(right);
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Cannot write MP3: %s", mp3_path);
        return FALSE;
    }

    unsigned char *mp3buf = g_malloc((size_t)frames * 2 + 7200);
    int done = 0;
    while (done < frames) {
        int chunk = frames - done;
        if (chunk > 1152)
            chunk = 1152;
        int n = lame_encode_buffer(lame, left + done, right + done, chunk,
                                   mp3buf, (int)(frames * 2 + 7200));
        if (n > 0)
            fwrite(mp3buf, 1, (size_t)n, fout);
        done += chunk;
        if (progress)
            progress(85 + (int)(14.0 * done / frames), user_data);
    }
    int flush = lame_encode_flush(lame, mp3buf, (int)(frames * 2 + 7200));
    if (flush > 0)
        fwrite(mp3buf, 1, (size_t)flush, fout);

    fclose(fout);
    lame_close(lame);
    g_free(left);
    g_free(right);
    g_free(mp3buf);

    if (progress)
        progress(100, user_data);
    return TRUE;
#else
    (void)midi_path;
    (void)mp3_path;
    (void)soundfont_path;
    (void)program;
    (void)progress;
    (void)user_data;
    g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                        "MP3 export requires libmp3lame (install libmp3lame-dev)");
    return FALSE;
#endif
}
