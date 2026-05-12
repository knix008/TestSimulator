#include "stt_core.h"
#include "whisper.h"

#include <atomic>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <unistd.h>
#include <pthread.h>
#include <thread>

/* ── Korean-optimised prompt ─────────────────────────────────────────────
   Priming whisper with Korean context significantly reduces language
   switching and CJK-mix hallucinations.                                   */
static const char *KO_PROMPT =
    "다음은 한국어 음성입니다. 출근, 퇴근, 경비, 해제, 설정.";

/* ── Audio preprocessing ─────────────────────────────────────────────────
   Both steps work on a malloc'd copy so the caller's buffer is unchanged. */

/* Pre-emphasis boosts high-frequency consonants critical for Korean
   (ㄱ,ㄷ,ㅂ,ㅅ,ㅈ …).  Coefficient 0.97 is the ASR standard value.       */
static void pre_emphasis(float *pcm, int n) {
    for (int i = n - 1; i > 0; i--)
        pcm[i] -= 0.97f * pcm[i - 1];
}

/* RMS-normalise to a fixed target level so whisper always gets a
   consistent input amplitude regardless of mic gain.                       */
/* max_scale controls how much amplification is allowed:
   - 8.0f  for mic/command mode (amplify quiet speech up to 8×)
   - 1.5f  for file/transcription mode (don't amplify background noise
            to speech levels — the main cause of Whisper hallucinations) */
static void rms_normalize(float *pcm, int n, float max_scale) {
    float sum = 0.0f;
    for (int i = 0; i < n; i++) sum += pcm[i] * pcm[i];
    float rms = sqrtf(sum / (float)n);
    if (rms < 1e-5f) return;
    float scale = 0.12f / rms;
    if (scale > max_scale) scale = max_scale;
    for (int i = 0; i < n; i++) pcm[i] *= scale;
}

/* ── Post-processing: filter whisper artefacts ───────────────────────────
   Rule: a segment is kept only if it contains at least one Hangul syllable
   OR at least one ASCII alphanumeric character.  Everything else (silence
   markers, metadata tags, music notes, ellipses, lone punctuation …) is
   discarded.

   Hangul syllables occupy U+AC00–D7A3.  In UTF-8 their lead bytes are:
     0xEA (U+A000–AFFF),  0xEB (U+B000–BFFF),  0xEC (U+C000–CFFF),
     0xED + 0x80–0x9F    (U+D000–D7FF)                                      */

static bool has_hangul(const char *text) {
    for (const unsigned char *p = (const unsigned char *)text; *p; p++) {
        if (*p == 0xEA || *p == 0xEB || *p == 0xEC) return true;
        if (*p == 0xED && p[1] >= 0x80 && p[1] < 0xA0) return true;
    }
    return false;
}

static bool is_valid_korean_text(const char *text) {
    if (!text || text[0] == '\0') return false;

    /* Reject [metadata], (noise) markers, and leading "-" / "–" / "—"
       The dash prefix is Whisper's hallucination signature for music/noise. */
    if (text[0] == '[' || text[0] == '(' || text[0] == '-') return false;
    /* UTF-8 en-dash U+2013 (0xE2 0x80 0x93) and em-dash U+2014 (0xE2 0x80 0x94) */
    {
        const unsigned char *u = (const unsigned char *)text;
        if (u[0] == 0xE2 && u[1] == 0x80 && (u[2] == 0x93 || u[2] == 0x94))
            return false;
    }

    /* Reject whitespace-only strings */
    bool has_content = false;
    for (const char *p = text; *p; p++) {
        if ((unsigned char)*p > 0x20) { has_content = true; break; }
    }
    if (!has_content) return false;

    /* Must contain Hangul or ASCII alphanumeric.
       This single check correctly rejects Unicode-only noise such as
       …(U+2026), ♪(U+266A), ♫(U+266B), 。(U+3002), ・(U+30FB) etc.,
       while passing any real Korean or mixed Korean/English/number text. */
    if (has_hangul(text)) return true;
    for (const char *p = text; *p; p++) {
        if (isalnum((unsigned char)*p)) return true;
    }
    return false;
}

/* ── SttContext ───────────────────────────────────────────────────────── */

struct SttContext {
    struct whisper_context *wctx;
};

SttContext *stt_context_new(const char *model_path) {
    SttContext *ctx = static_cast<SttContext *>(calloc(1, sizeof(SttContext)));
    whisper_context_params cp = whisper_context_default_params();
    cp.use_gpu = true;

    /* Suppress whisper's verbose initialisation log */
    int saved; {
        int n = open("/dev/null", O_WRONLY);
        fflush(stderr);
        saved = dup(STDERR_FILENO);
        if (n >= 0) { dup2(n, STDERR_FILENO); close(n); }
    }
    ctx->wctx = whisper_init_from_file_with_params(model_path, cp);
    { fflush(stderr); dup2(saved, STDERR_FILENO); close(saved); }
    if (!ctx->wctx) {
        fprintf(stderr, "[stt] failed to load: %s\n", model_path);
        free(ctx);
        return nullptr;
    }
    return ctx;
}

void stt_context_free(SttContext *ctx) {
    if (!ctx) return;
    whisper_free(ctx->wctx);
    free(ctx);
}

/* ── Whisper inference (Korean-optimised) ────────────────────────────────

   Strategy: Beam search (beam_size=5) consistently outperforms greedy
   for Korean, which has many surface-form ambiguities (e.g. 퇴근 vs 태근).

   Preprocessing pipeline applied to a working copy:
     1. Pre-emphasis filter (boost Korean consonant energy)
     2. RMS normalisation  (consistent input level)
     3. Silence pad        (whisper needs ≥ 1 s for reliable mel encoding)  */

#define WHISPER_MIN_SAMPLES 16000   /* 1 s @ 16 kHz */

static int whisper_run(struct whisper_context *wctx,
                       const float *pcm_in, int n_in,
                       float no_speech_thold, float logprob_thold,
                       bool use_prompt,
                       stt_result_cb_t cb, void *userdata) {

    /* Working copy for in-place preprocessing */
    int    n     = (n_in < WHISPER_MIN_SAMPLES) ? WHISPER_MIN_SAMPLES : n_in;
    float *work  = static_cast<float *>(calloc((size_t)n, sizeof(float)));
    memcpy(work, pcm_in, (size_t)n_in * sizeof(float));
    /* tail is already zero (calloc) — silence padding */

    pre_emphasis(work, n);
    /* Transcription mode caps amplification at 1.5× so background music/noise
       stays below speech amplitude and Whisper can detect it as no_speech.
       Command mode (mic) allows up to 8× to catch quiet whispered words.   */
    rms_normalize(work, n, use_prompt ? 8.0f : 1.5f);

    /* ── Whisper parameters ────────────────────────────────────────────── */
    whisper_full_params p = whisper_full_default_params(WHISPER_SAMPLING_BEAM_SEARCH);

    /* Language & translation */
    p.language      = "ko";
    p.translate     = false;
    p.detect_language = false;

    /* Beam search: beam_size 5 matches OpenAI's default for best accuracy */
    p.beam_search.beam_size = 5;
    p.beam_search.patience  = 1.0f;

    /* Temperature schedule: start at 0 (deterministic), fall back
       to higher temps on entropy failures */
    p.temperature     = 0.0f;
    p.temperature_inc = 0.20f;

    p.no_speech_thold = no_speech_thold;
    p.entropy_thold   = 2.60f;   /* tighter than default 2.80 */
    p.logprob_thold   = logprob_thold;

    /* Output quality */
    p.suppress_blank       = true;
    p.single_segment       = true;    /* VAD handles segmentation for us   */
    p.no_timestamps        = true;
    p.print_special        = false;
    p.print_progress       = false;
    p.print_realtime       = false;
    p.print_timestamps     = false;

    /* Context: no carry-over between utterances (VAD gives clean chunks) */
    p.no_context           = true;

    /* Korean prompt only for command mode.
       In transcription mode, removing the prompt lets Whisper's no_speech
       detector work correctly — the prompt biases it to always output Korean
       even on silence or background noise, causing hallucinations.          */
    if (use_prompt) {
        p.initial_prompt       = KO_PROMPT;
        p.carry_initial_prompt = true;
    } else {
        p.language             = "ko";  /* still decode Korean when speech is present */
        p.initial_prompt       = nullptr;
        p.carry_initial_prompt = false;
    }

    /* Threading */
    p.n_threads = (int)std::thread::hardware_concurrency();
    if (p.n_threads < 1) p.n_threads = 4;
    if (p.n_threads > 8) p.n_threads = 8;

    int rc = whisper_full(wctx, p, work, n);
    free(work);
    if (rc != 0) return -1;

    int ns = whisper_full_n_segments(wctx);
    for (int i = 0; i < ns; i++) {
        /* Explicitly check no_speech probability — more reliable than relying
           solely on no_speech_thold in params, especially without a prompt.  */
        float nsp = whisper_full_get_segment_no_speech_prob(wctx, i);
        if (nsp > no_speech_thold) continue;

        const char *raw = whisper_full_get_segment_text(wctx, i);
        if (raw && raw[0] == ' ') raw++;
        if (is_valid_korean_text(raw) && cb)
            cb(raw, userdata);
    }
    return 0;
}

int stt_transcribe(SttContext *ctx, const float *pcm, int n,
                   stt_result_cb_t cb, void *userdata) {
    if (!ctx || !ctx->wctx || !pcm || n <= 0) return -1;
    return whisper_run(ctx->wctx, pcm, n, 0.60f, -1.00f, true, cb, userdata);
}

/* ── VAD parameters ───────────────────────────────────────────────────── */

#define SAMPLE_RATE           16000
#define VAD_FRAME             512        /* 32 ms per VAD frame             */
#define VAD_THRESH            0.015f     /* RMS energy threshold            */
#define VAD_EMA_ALPHA         0.10f      /* energy smoothing factor         */
#define MIN_SPEECH_FRAMES     8          /* 256 ms min speech (short cmds)  */
#define POST_SILENCE_FRAMES   22         /* ~700 ms trailing silence → send */
#define MAX_SPEECH_SAMPLES    (SAMPLE_RATE * 25)  /* 25 s hard cap          */
#define RING_CAP              (SAMPLE_RATE * 12)  /* 12 s ring buffer       */
#define PRE_ROLL_FRAMES       6          /* ~192 ms pre-speech capture      */

/* ── SttStream ────────────────────────────────────────────────────────── */

struct SttStream {
    SttContext           *ctx;
    stt_result_cb_t       cb;
    void                 *userdata;

    /* SPSC ring buffer (producer = PortAudio callback, consumer = worker) */
    float                *ring;
    int                   ring_head;
    int                   ring_tail;
    pthread_mutex_t       ring_mtx;
    pthread_cond_t        ring_cond;

    /* Speech accumulator (worker thread only) */
    float                *speech;
    int                   speech_len;

    /* VAD state (worker thread only) */
    float                 energy_ema;
    int                   speech_frames;
    int                   silence_frames;
    bool                  in_speech;

    /* Mode-dependent thresholds (set at creation time) */
    float                 vad_thresh;
    int                   min_speech_frames;
    float                 no_speech_thold;
    float                 logprob_thold;
    bool                  use_prompt; /* false = no KO_PROMPT, let no_speech detection work */
    std::atomic<bool>     cancelling; /* set by stt_stream_cancel to discard pending audio */

    /* Pre-roll: circular buffer of last PRE_ROLL_FRAMES frames captured
       before in_speech becomes true, to preserve word onsets. */
    float                 pre_roll[PRE_ROLL_FRAMES * VAD_FRAME];
    int                   pre_roll_pos;
    int                   pre_roll_count;

    /* Worker */
    pthread_t             worker;
    std::atomic<bool>     stopping;
};

/* ── Ring buffer helpers (call under ring_mtx) ──────────────────────── */

static int ring_avail(const SttStream *st) {
    return (st->ring_tail - st->ring_head + RING_CAP) % RING_CAP;
}

static void ring_write(SttStream *st, const float *src, int n) {
    for (int i = 0; i < n; i++) {
        st->ring[st->ring_tail] = src[i];
        st->ring_tail = (st->ring_tail + 1) % RING_CAP;
    }
}

static void ring_read(SttStream *st, float *dst, int n) {
    for (int i = 0; i < n; i++) {
        dst[i] = st->ring[st->ring_head];
        st->ring_head = (st->ring_head + 1) % RING_CAP;
    }
}

/* ── VAD + transcription (worker thread) ────────────────────────────── */

static void segment_run(SttStream *st) {
    /* Discard very short bursts (< 200 ms) — likely noise */
    if (st->speech_len < SAMPLE_RATE / 5) {
        st->speech_len = 0;
        return;
    }
    whisper_run(st->ctx->wctx, st->speech, st->speech_len,
                st->no_speech_thold, st->logprob_thold, st->use_prompt,
                st->cb, st->userdata);
    st->speech_len = 0;
}

static void vad_process_frame(SttStream *st, const float *frame, int n) {
    float sum = 0.0f;
    for (int i = 0; i < n; i++) sum += frame[i] * frame[i];
    float rms = sqrtf(sum / (float)n);

    st->energy_ema = VAD_EMA_ALPHA * rms + (1.0f - VAD_EMA_ALPHA) * st->energy_ema;
    bool is_speech = (st->energy_ema > st->vad_thresh);

    if (!st->in_speech) {
        /* Pre-speech: maintain a rolling window so word onsets aren't lost
           when in_speech is finally triggered. */
        memcpy(st->pre_roll + st->pre_roll_pos * n, frame, (size_t)n * sizeof(float));
        st->pre_roll_pos = (st->pre_roll_pos + 1) % PRE_ROLL_FRAMES;
        if (st->pre_roll_count < PRE_ROLL_FRAMES) st->pre_roll_count++;

        if (is_speech) {
            st->speech_frames++;
            st->silence_frames = 0;
            if (st->speech_frames >= st->min_speech_frames) {
                st->in_speech = true;
                /* Flush pre-roll (oldest first) into speech buffer */
                int start = (st->pre_roll_count < PRE_ROLL_FRAMES)
                            ? 0 : st->pre_roll_pos;
                for (int f = 0; f < st->pre_roll_count; f++) {
                    int idx  = (start + f) % PRE_ROLL_FRAMES;
                    int room = MAX_SPEECH_SAMPLES - st->speech_len;
                    if (room < n) break;
                    memcpy(st->speech + st->speech_len,
                           st->pre_roll + idx * n, (size_t)n * sizeof(float));
                    st->speech_len += n;
                }
                st->pre_roll_count = 0;
                st->pre_roll_pos   = 0;
            }
        } else {
            /* Isolated noise burst — don't let it accumulate toward threshold */
            st->speech_frames = 0;
        }
        return;
    }

    /* ── in_speech: accumulate audio and watch for trailing silence ──────── */
    if (st->speech_len + n <= MAX_SPEECH_SAMPLES) {
        memcpy(st->speech + st->speech_len, frame, (size_t)n * sizeof(float));
        st->speech_len += n;
    }

    if (is_speech) {
        st->speech_frames++;
        st->silence_frames = 0;
    } else {
        st->silence_frames++;
        if (st->silence_frames >= POST_SILENCE_FRAMES) {
            int trim = st->silence_frames * n;
            if (trim > st->speech_len) trim = st->speech_len;
            st->speech_len -= trim;
            segment_run(st);
            st->speech_frames  = 0;
            st->silence_frames = 0;
            st->in_speech      = false;
        }
    }

    if (st->speech_len >= MAX_SPEECH_SAMPLES) {
        segment_run(st);
        st->speech_frames  = 0;
        st->silence_frames = 0;
        st->in_speech      = false;
    }
}

static void *stream_worker(void *arg) {
    SttStream *st    = static_cast<SttStream *>(arg);
    float      frame[VAD_FRAME];
    int        frame_pos = 0;

    while (true) {
        pthread_mutex_lock(&st->ring_mtx);
        while (!st->stopping.load(std::memory_order_relaxed) && ring_avail(st) == 0)
            pthread_cond_wait(&st->ring_cond, &st->ring_mtx);

        int  avail = ring_avail(st);
        bool done  = st->stopping.load(std::memory_order_relaxed) && (avail == 0);
        int  need  = VAD_FRAME - frame_pos;
        int  take  = (avail < need) ? avail : need;
        ring_read(st, frame + frame_pos, take);
        pthread_mutex_unlock(&st->ring_mtx);

        frame_pos += take;

        if (frame_pos == VAD_FRAME) {
            vad_process_frame(st, frame, VAD_FRAME);
            frame_pos = 0;
        }

        if (done) {
            if (st->in_speech && frame_pos > 0 &&
                    st->speech_len + frame_pos <= MAX_SPEECH_SAMPLES) {
                memcpy(st->speech + st->speech_len, frame,
                       (size_t)frame_pos * sizeof(float));
                st->speech_len += frame_pos;
            }
            break;
        }
    }

    if (st->speech_len > 0 && !st->cancelling.load(std::memory_order_acquire))
        segment_run(st);

    return nullptr;
}

/* ── Public streaming API ────────────────────────────────────────────── */

SttStream *stt_stream_new_ex(SttContext *ctx, SttStreamMode mode,
                              stt_result_cb_t cb, void *userdata) {
    SttStream *st = static_cast<SttStream *>(calloc(1, sizeof(SttStream)));
    st->ctx      = ctx;
    st->cb       = cb;
    st->userdata = userdata;
    st->ring     = static_cast<float *>(malloc((size_t)RING_CAP * sizeof(float)));
    st->speech   = static_cast<float *>(malloc((size_t)MAX_SPEECH_SAMPLES * sizeof(float)));
    st->stopping.store(false, std::memory_order_relaxed);

    if (mode == STT_STREAM_TRANSCRIPTION) {
        /* File / video: strict — suppress hallucinations from background audio.
           use_prompt=false lets Whisper's no_speech detector work correctly;
           the KO_PROMPT biases the decoder to always output Korean, even on
           silence, causing the hallucinations the user sees.                  */
        st->vad_thresh        = 0.030f;
        st->min_speech_frames = 12;
        st->no_speech_thold   = 0.80f;
        st->logprob_thold     = -1.00f;
        st->use_prompt        = false;
    } else {
        /* Mic / command: permissive — catch short quiet Korean words */
        st->vad_thresh        = VAD_THRESH;
        st->min_speech_frames = MIN_SPEECH_FRAMES;
        st->no_speech_thold   = 0.35f;
        st->logprob_thold     = -1.20f;
        st->use_prompt        = true;
    }

    pthread_mutex_init(&st->ring_mtx, nullptr);
    pthread_cond_init(&st->ring_cond, nullptr);
    pthread_create(&st->worker, nullptr, stream_worker, st);
    return st;
}

SttStream *stt_stream_new(SttContext *ctx, stt_result_cb_t cb, void *userdata) {
    return stt_stream_new_ex(ctx, STT_STREAM_COMMAND, cb, userdata);
}

void stt_stream_push(SttStream *st, const float *pcm, int n) {
    if (!st || n <= 0) return;
    pthread_mutex_lock(&st->ring_mtx);
    int space = RING_CAP - ring_avail(st) - 1;
    int write = (n < space) ? n : space;
    if (write < n)
        fprintf(stderr, "[stt] ring overflow: dropping %d samples\n", n - write);
    ring_write(st, pcm, write);
    pthread_cond_signal(&st->ring_cond);
    pthread_mutex_unlock(&st->ring_mtx);
}

void stt_stream_flush(SttStream *st) {
    if (!st) return;
    pthread_mutex_lock(&st->ring_mtx);
    st->stopping.store(true, std::memory_order_relaxed);
    pthread_cond_signal(&st->ring_cond);
    pthread_mutex_unlock(&st->ring_mtx);
    pthread_join(st->worker, nullptr);
}

void stt_stream_free(SttStream *st) {
    if (!st) return;
    pthread_mutex_destroy(&st->ring_mtx);
    pthread_cond_destroy(&st->ring_cond);
    free(st->ring);
    free(st->speech);
    free(st);
}

void stt_stream_cancel(SttStream *st) {
    if (!st) return;
    st->cancelling.store(true, std::memory_order_release);
    pthread_mutex_lock(&st->ring_mtx);
    st->ring_head = st->ring_tail;  /* drain ring buffer */
    st->stopping.store(true, std::memory_order_relaxed);
    pthread_cond_signal(&st->ring_cond);
    pthread_mutex_unlock(&st->ring_mtx);
    pthread_join(st->worker, nullptr);
    stt_stream_free(st);
}
