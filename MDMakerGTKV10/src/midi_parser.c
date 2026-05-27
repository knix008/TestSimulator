#include "midi_parser.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ── helpers ─────────────────────────────────────────────────── */

static uint32_t read_u32_be(const uint8_t *p) {
    return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) |
           ((uint32_t)p[2] << 8)  |  (uint32_t)p[3];
}

static uint16_t read_u16_be(const uint8_t *p) {
    return (uint16_t)(((uint16_t)p[0] << 8) | p[1]);
}

static uint32_t read_vlq(const uint8_t *p, int *bytes_read) {
    uint32_t val = 0;
    int n = 0;
    uint8_t b;
    do {
        b = p[n++];
        val = (val << 7) | (b & 0x7F);
    } while (b & 0x80);
    *bytes_read = n;
    return val;
}

/* ── dynamic note array ──────────────────────────────────────── */

typedef struct {
    MidiNote *data;
    int       count;
    int       cap;
} NoteArray;

static void note_array_push(NoteArray *arr, MidiNote n) {
    if (arr->count >= arr->cap) {
        arr->cap  = arr->cap ? arr->cap * 2 : 64;
        arr->data = realloc(arr->data, (size_t)arr->cap * sizeof(MidiNote));
    }
    arr->data[arr->count++] = n;
}

/* ── tempo array ─────────────────────────────────────────────── */

static void add_tempo(MidiFile *mf, uint32_t tick, uint32_t tempo_us) {
    if (mf->tempo_count >= MIDI_MAX_TEMPO_EVENTS) return;
    mf->tempo_map[mf->tempo_count].tick     = tick;
    mf->tempo_map[mf->tempo_count].tempo_us = tempo_us;
    mf->tempo_count++;
}

static int cmp_tempo(const void *a, const void *b) {
    const TempoEvent *ta = a, *tb = b;
    return (ta->tick > tb->tick) - (ta->tick < tb->tick);
}

static int cmp_note(const void *a, const void *b) {
    const MidiNote *na = a, *nb = b;
    return (na->start_tick > nb->start_tick) - (na->start_tick < nb->start_tick);
}

/* ── tick → seconds ──────────────────────────────────────────── */

double midi_tick_to_seconds(const MidiFile *mf, uint32_t tick) {
    double   secs   = 0.0;
    uint32_t tempo  = 500000;
    uint32_t prev   = 0;

    for (int i = 0; i < mf->tempo_count; i++) {
        if (mf->tempo_map[i].tick >= tick) break;
        uint32_t dt = mf->tempo_map[i].tick - prev;
        secs  += (double)dt / mf->ticks_per_qn * (tempo / 1000000.0);
        prev   = mf->tempo_map[i].tick;
        tempo  = mf->tempo_map[i].tempo_us;
    }
    uint32_t rem = tick - prev;
    secs += (double)rem / mf->ticks_per_qn * (tempo / 1000000.0);
    return secs;
}

uint32_t midi_seconds_to_tick(const MidiFile *mf, double seconds) {
    double   elapsed = 0.0;
    uint32_t tempo   = 500000;
    uint32_t prev    = 0;

    for (int i = 0; i < mf->tempo_count; i++) {
        double seg_secs = (double)(mf->tempo_map[i].tick - prev)
                          / mf->ticks_per_qn * (tempo / 1000000.0);
        if (elapsed + seg_secs >= seconds) break;
        elapsed += seg_secs;
        prev     = mf->tempo_map[i].tick;
        tempo    = mf->tempo_map[i].tempo_us;
    }
    double rem_secs = seconds - elapsed;
    uint32_t rem_ticks = (uint32_t)(rem_secs * mf->ticks_per_qn / (tempo / 1000000.0));
    return prev + rem_ticks;
}

/* ── track parser ────────────────────────────────────────────── */

typedef struct {
    bool     active;
    uint32_t start_tick;
    int      velocity;
} OpenNote;

static void parse_track(MidiFile *mf, const uint8_t *buf, uint32_t len,
                         int track_idx, NoteArray *all)
{
    if (track_idx >= MIDI_MAX_TRACKS) return;
    MidiTrack *trk = &mf->tracks[track_idx];
    trk->instrument = -1;

    NoteArray  tnotes  = {0};
    OpenNote   open[16][128];
    memset(open, 0, sizeof(open));

    uint8_t  running  = 0;
    uint32_t abs_tick = 0;
    uint32_t pos      = 0;

    while (pos < len) {
        int      vlen;
        uint32_t delta = read_vlq(buf + pos, &vlen);
        pos      += (uint32_t)vlen;
        abs_tick += delta;

        if (pos >= len) break;
        uint8_t evbyte = buf[pos];

        /* ── meta event ─────────────────── */
        if (evbyte == 0xFF) {
            pos++;
            if (pos + 1 >= len) break;
            uint8_t  mtype = buf[pos++];
            uint32_t mlen  = read_vlq(buf + pos, &vlen);
            pos += (uint32_t)vlen;
            if (pos + mlen > len) break;

            if (mtype == 0x03 && mlen > 0) {
                uint32_t copy = mlen < 255 ? mlen : 255;
                memcpy(trk->name, buf + pos, copy);
                trk->name[copy] = '\0';
            } else if (mtype == 0x51 && mlen == 3) {
                uint32_t t = ((uint32_t)buf[pos]   << 16) |
                             ((uint32_t)buf[pos+1]  <<  8) |
                              (uint32_t)buf[pos+2];
                add_tempo(mf, abs_tick, t);
            }
            pos += mlen;
            continue;
        }

        /* ── sysex ──────────────────────── */
        if (evbyte == 0xF0 || evbyte == 0xF7) {
            pos++;
            uint32_t slen = read_vlq(buf + pos, &vlen);
            pos += (uint32_t)vlen + slen;
            continue;
        }

        /* ── midi event ─────────────────── */
        if (evbyte & 0x80) {
            running = evbyte;
            pos++;
        }
        if (!running) { pos++; continue; }

        uint8_t type = running & 0xF0;
        int     ch   = running & 0x0F;

        if (type == 0x90 || type == 0x80) {
            if (pos + 1 >= len) break;
            uint8_t pitch = buf[pos++];
            uint8_t vel   = buf[pos++];
            bool    on    = (type == 0x90 && vel > 0);

            if (on) {
                open[ch][pitch].active     = true;
                open[ch][pitch].start_tick = abs_tick;
                open[ch][pitch].velocity   = vel;
                if (trk->channel < 0) trk->channel = ch;
            } else {
                if (open[ch][pitch].active) {
                    MidiNote n = {
                        .pitch       = pitch,
                        .velocity    = open[ch][pitch].velocity,
                        .channel     = ch,
                        .track_index = track_idx,
                        .start_tick  = open[ch][pitch].start_tick,
                        .end_tick    = abs_tick
                    };
                    note_array_push(&tnotes, n);
                    note_array_push(all, n);
                    open[ch][pitch].active = false;
                }
            }
        } else if (type == 0xC0) {
            uint8_t prog = buf[pos++];
            if (trk->instrument < 0) trk->instrument = prog;
        } else if (type == 0xA0 || type == 0xB0 || type == 0xE0) {
            pos += 2;
        } else if (type == 0xD0) {
            pos += 1;
        } else {
            pos++;
        }
    }

    /* close any still-open notes at end-of-track */
    for (int c = 0; c < 16; c++)
        for (int p = 0; p < 128; p++)
            if (open[c][p].active) {
                MidiNote n = {
                    .pitch       = p,
                    .velocity    = open[c][p].velocity,
                    .channel     = c,
                    .track_index = track_idx,
                    .start_tick  = open[c][p].start_tick,
                    .end_tick    = abs_tick
                };
                note_array_push(&tnotes, n);
                note_array_push(all, n);
            }

    trk->notes      = tnotes.data;
    trk->note_count = tnotes.count;
    if (trk->instrument < 0) trk->instrument = 0;
    if (trk->channel    < 0) trk->channel    = 0;
    if (!trk->name[0]) snprintf(trk->name, sizeof(trk->name), "트랙 %d", track_idx + 1);
}

/* ── public: parse ───────────────────────────────────────────── */

MidiFile *midi_parse(const char *filepath) {
    FILE *fp = fopen(filepath, "rb");
    if (!fp) return NULL;

    fseek(fp, 0, SEEK_END);
    long fsize = ftell(fp);
    rewind(fp);

    uint8_t *buf = malloc((size_t)fsize);
    if (!buf) { fclose(fp); return NULL; }
    if (fread(buf, 1, (size_t)fsize, fp) != (size_t)fsize) {
        free(buf); fclose(fp); return NULL;
    }
    fclose(fp);

    /* header */
    if (fsize < 14 || memcmp(buf, "MThd", 4) != 0) { free(buf); return NULL; }
    uint32_t hlen    = read_u32_be(buf + 4);
    if (hlen < 6)    { free(buf); return NULL; }
    int format       = read_u16_be(buf + 8);
    int ntrks        = read_u16_be(buf + 10);
    int tpq          = read_u16_be(buf + 12);
    if (tpq & 0x8000) { free(buf); return NULL; } /* SMPTE not supported */

    MidiFile *mf = calloc(1, sizeof(MidiFile));
    if (!mf) { free(buf); return NULL; }

    mf->type        = format;
    mf->ticks_per_qn = tpq;
    snprintf(mf->filepath, sizeof(mf->filepath), "%s", filepath);

    /* default tempo = 120 BPM → 500000 µs/qn  */
    add_tempo(mf, 0, 500000);

    NoteArray all = {0};

    /* track chunks */
    uint32_t pos = 8 + hlen;
    int track_idx = 0;
    while (pos + 8 <= (uint32_t)fsize && track_idx < ntrks && track_idx < MIDI_MAX_TRACKS) {
        if (memcmp(buf + pos, "MTrk", 4) != 0) { pos++; continue; }
        uint32_t tlen = read_u32_be(buf + pos + 4);
        pos += 8;
        if (pos + tlen > (uint32_t)fsize) break;
        mf->tracks[track_idx].channel = -1;
        parse_track(mf, buf + pos, tlen, track_idx, &all);
        pos += tlen;
        track_idx++;
    }
    mf->track_count = track_idx;
    free(buf);

    /* sort tempo map (may have come from multiple tracks) */
    qsort(mf->tempo_map, (size_t)mf->tempo_count, sizeof(TempoEvent), cmp_tempo);

    /* sort all notes, convert ticks → seconds */
    qsort(all.data, (size_t)all.count, sizeof(MidiNote), cmp_note);
    mf->all_notes   = all.data;
    mf->total_notes = all.count;

    mf->pitch_min = 127;
    mf->pitch_max = 0;

    for (int i = 0; i < all.count; i++) {
        all.data[i].start_sec = midi_tick_to_seconds(mf, all.data[i].start_tick);
        all.data[i].end_sec   = midi_tick_to_seconds(mf, all.data[i].end_tick);
        if (all.data[i].pitch < mf->pitch_min) mf->pitch_min = all.data[i].pitch;
        if (all.data[i].pitch > mf->pitch_max) mf->pitch_max = all.data[i].pitch;
    }
    /* mirror seconds back into per-track arrays */
    for (int t = 0; t < mf->track_count; t++) {
        for (int n = 0; n < mf->tracks[t].note_count; n++) {
            MidiNote *tn = &mf->tracks[t].notes[n];
            tn->start_sec = midi_tick_to_seconds(mf, tn->start_tick);
            tn->end_sec   = midi_tick_to_seconds(mf, tn->end_tick);
        }
    }

    if (all.count > 0) {
        double last = all.data[all.count - 1].end_sec;
        mf->total_seconds = last + 1.0;
    } else {
        mf->total_seconds = 1.0;
    }
    if (mf->pitch_min > mf->pitch_max) { mf->pitch_min = 21; mf->pitch_max = 108; }

    return mf;
}

void midi_free(MidiFile *mf) {
    if (!mf) return;
    for (int i = 0; i < mf->track_count; i++)
        free(mf->tracks[i].notes);
    free(mf->all_notes);
    free(mf);
}
