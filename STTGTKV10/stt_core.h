#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/* Called from the worker thread when a segment is recognised. */
typedef void (*stt_result_cb_t)(const char *text, void *userdata);

/* ── Batch context ────────────────────────────────────────────────────── */

typedef struct SttContext SttContext;

SttContext *stt_context_new(const char *model_path);
void        stt_context_free(SttContext *ctx);

/* Blocking batch transcription.  Returns 0 on success. */
int stt_transcribe(SttContext      *ctx,
                   const float     *pcm,
                   int              n_samples,
                   stt_result_cb_t  cb,
                   void            *userdata);

/* ── Real-time streaming (VAD-based) ─────────────────────────────────── */

typedef struct SttStream SttStream;

/* Create a streaming session.  Starts an internal worker thread. */
SttStream *stt_stream_new(SttContext *ctx, stt_result_cb_t cb, void *userdata);

/* Push raw PCM frames from the PortAudio callback.
   Thread-safe; non-blocking (samples are queued). */
void stt_stream_push(SttStream *stream, const float *pcm, int n_samples);

/* Signal end-of-input and wait for the worker to finish processing.
   Blocks until all queued audio has been transcribed.
   Call stt_stream_free() afterwards. */
void stt_stream_flush(SttStream *stream);

/* Free memory.  Call after stt_stream_flush(). */
void stt_stream_free(SttStream *stream);

#ifdef __cplusplus
}
#endif
