/* score_verovio.c — Cairo-based MIDI score renderer
 *
 * Renders a horizontal scrolling strip of sheet music directly from MIDI
 * note events using Cairo + Pango. The public API mirrors the old Verovio
 * interface so that score_view.c and main_window.c need no changes.
 *
 * Layout (same units as SheetMusicRenderer.cs in the Windows version):
 *   • Each "system" = BARS_PER_SYSTEM bars of treble + bass grand staff
 *   • Systems are placed side-by-side horizontally
 *   • Strip: width = n_systems × system_w,  height = SYSTEM_H
 */

#include "score_verovio.h"

#include <cairo.h>
#include <pango/pangocairo.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <glib.h>

/* ── Layout constants ──────────────────────────────────────────────────── */
#define SYSTEM_H            300
#define TREBLE_REL_TOP       62
#define BASS_REL_TOP        192
#define STAFF_SPACING        14
#define BARS_PER_SYSTEM       4
#define LEFT_MARGIN         108
#define RIGHT_MARGIN         16
#define NOTE_HEAD_RX          6   /* ellipse half-width  */
#define NOTE_HEAD_RY          4   /* ellipse half-height */
#define STEM_LEN             42   /* STAFF_SPACING * 3   */
#define DRUM_CH               9   /* 0-based channel 9 = GM percussion */
#define QUANTIZE_DIV         16   /* sixteenth-note grid */

static const int chroma_to_diatonic[12] = {0,0,1,1,2,3,3,4,4,5,5,6};
static const int is_accidental[12]      = {0,1,0,1,0,0,1,0,1,0,1,0};

/* ── Data structures ───────────────────────────────────────────────────── */
typedef struct {
    int    note_number;
    int    channel;       /* 0-based */
    double start_sec;
    double duration_sec;
} MidiNote;

typedef struct { gint64 tick; int tempo_us; } TempoEntry;

struct ScoreVerovio {
    MidiNote    *notes;
    int          note_count;
    int          note_cap;

    int          tempo_us;
    double       total_sec;
    int          division;

    int          system_w;
    int          n_systems;
    double       sec_per_system;
    double       sec_per_bar;

    cairo_surface_t *surface;
    int surface_w, surface_h;
};

/* ── Public lifecycle ──────────────────────────────────────────────────── */
ScoreVerovio *score_verovio_new(void)
{
    return g_new0(ScoreVerovio, 1);
}

void score_verovio_free(ScoreVerovio *score)
{
    if (!score) return;
    g_free(score->notes);
    if (score->surface)
        cairo_surface_destroy(score->surface);
    g_free(score);
}

/* ── MIDI parsing helpers ──────────────────────────────────────────────── */
static guint32 rd32(const unsigned char *p)
{ return ((guint32)p[0]<<24)|((guint32)p[1]<<16)|((guint32)p[2]<<8)|p[3]; }

static guint16 rd16(const unsigned char *p)
{ return (guint16)(((guint16)p[0]<<8)|p[1]); }

static guint32 read_vl(const unsigned char *b, guint32 pos, guint32 len, guint32 *v)
{
    *v = 0;
    unsigned char c;
    do {
        if (pos >= len) return pos;
        c = b[pos++];
        *v = (*v << 7) | (c & 0x7f);
    } while (c & 0x80);
    return pos;
}

#define MAX_TEMPO 1024
#define MAX_OPEN  2048

typedef struct { int ch; int note; gint64 tick; } OpenNote;

static double ticks_to_sec(gint64 ticks, TempoEntry *map, int nm, int div)
{
    double s = 0.0;
    gint64 prev = 0;
    int cur = 500000;
    for (int i = 0; i < nm; i++) {
        if (map[i].tick >= ticks) break;
        s += (double)(map[i].tick - prev) * cur / (1e6 * div);
        prev = map[i].tick;
        cur  = map[i].tempo_us;
    }
    s += (double)(ticks - prev) * cur / (1e6 * div);
    return s;
}

static int tempo_cmp(const void *a, const void *b)
{
    const TempoEntry *ta = a, *tb = b;
    return (ta->tick < tb->tick) ? -1 : (ta->tick > tb->tick) ? 1 : 0;
}

static int note_cmp(const void *a, const void *b)
{
    const MidiNote *na = a, *nb = b;
    return (na->start_sec < nb->start_sec) ? -1 : (na->start_sec > nb->start_sec) ? 1 : 0;
}

static gboolean parse_midi_notes(const char *path, ScoreVerovio *sc, GError **err)
{
    FILE *f = fopen(path, "rb");
    if (!f) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Cannot open %s", path);
        return FALSE;
    }

    unsigned char hdr[14];
    if (fread(hdr, 1, 14, f) != 14) {
        fclose(f);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Truncated header");
        return FALSE;
    }

    /* Skip RIFF wrapper if present */
    if (memcmp(hdr, "RIFF", 4) == 0) {
        fseek(f, 12, SEEK_SET);
        if (fread(hdr, 1, 14, f) != 14) {
            fclose(f);
            g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Bad RIFF MIDI");
            return FALSE;
        }
    }
    if (memcmp(hdr, "MThd", 4) != 0) {
        fclose(f);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Not a MIDI file");
        return FALSE;
    }

    /* hdr layout: MThd(0-3) len(4-7) format(8-9) ntrks(10-11) division(12-13) */
    int ntrks    = (int)rd16(hdr + 10);
    int division = (int)rd16(hdr + 12);
    if (division <= 0 || ntrks < 1) {
        fclose(f);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Bad MIDI header");
        return FALSE;
    }
    sc->division = division;

    TempoEntry *tmap = g_new0(TempoEntry, MAX_TEMPO);
    int          nm   = 0;
    tmap[nm].tick = 0; tmap[nm].tempo_us = 500000; nm++;

    OpenNote *open = g_new0(OpenNote, MAX_OPEN);
    int        no  = 0;
    gint64 max_tick = 0;

    for (int t = 0; t < ntrks; t++) {
        unsigned char th[8];
        if (fread(th, 1, 8, f) != 8 || memcmp(th, "MTrk", 4) != 0)
            break;
        guint32 tlen = rd32(th + 4);
        unsigned char *buf = g_malloc(tlen);
        if (!buf || fread(buf, 1, tlen, f) != tlen) {
            g_free(buf); break;
        }

        guint32 pos = 0;
        gint64 abs_tick = 0;
        int running = 0;

        while (pos < tlen) {
            guint32 delta;
            pos = read_vl(buf, pos, tlen, &delta);
            abs_tick += delta;
            if (abs_tick > max_tick) max_tick = abs_tick;
            if (pos >= tlen) break;

            unsigned char status = buf[pos];
            if (status < 0x80) {
                status = (unsigned char)running;
            } else {
                pos++;
                if (status < 0xf0) running = status;
            }

            if (status == 0xff) {
                unsigned char meta = (pos < tlen) ? buf[pos++] : 0;
                guint32 mlen;
                pos = read_vl(buf, pos, tlen, &mlen);
                if (meta == 0x51 && mlen == 3 && pos + 2 < tlen && nm < MAX_TEMPO) {
                    tmap[nm].tick     = abs_tick;
                    tmap[nm].tempo_us = (buf[pos]<<16)|(buf[pos+1]<<8)|buf[pos+2];
                    nm++;
                }
                pos += mlen;
            } else if (status == 0xf0 || status == 0xf7) {
                guint32 slen;
                pos = read_vl(buf, pos, tlen, &slen);
                pos += slen;
            } else {
                int cmd = status & 0xf0;
                int ch  = status & 0x0f;
                int p1  = (pos < tlen) ? buf[pos++] : 0;
                int p2  = (cmd != 0xc0 && cmd != 0xd0 && pos < tlen) ? buf[pos++] : 0;

                if (cmd == 0x90 && p2 > 0) {
                    if (no < MAX_OPEN) {
                        open[no].ch   = ch;
                        open[no].note = p1;
                        open[no].tick = abs_tick;
                        no++;
                    }
                } else if (cmd == 0x80 || (cmd == 0x90 && p2 == 0)) {
                    for (int k = 0; k < no; k++) {
                        if (open[k].ch == ch && open[k].note == p1) {
                            double st = ticks_to_sec(open[k].tick, tmap, nm, division);
                            double du = ticks_to_sec(abs_tick, tmap, nm, division) - st;
                            if (du < 1.0/128.0) du = 1.0/128.0;

                            if (sc->note_count >= sc->note_cap) {
                                sc->note_cap = sc->note_cap ? sc->note_cap * 2 : 512;
                                sc->notes = g_realloc(sc->notes,
                                            (gsize)sc->note_cap * sizeof(MidiNote));
                            }
                            sc->notes[sc->note_count].note_number  = p1;
                            sc->notes[sc->note_count].channel      = ch;
                            sc->notes[sc->note_count].start_sec    = st;
                            sc->notes[sc->note_count].duration_sec = du;
                            sc->note_count++;

                            open[k] = open[--no];
                            break;
                        }
                    }
                }
            }
        }
        g_free(buf);
    }
    fclose(f);

    qsort(tmap, (size_t)nm, sizeof(TempoEntry), tempo_cmp);
    sc->tempo_us  = (nm > 0) ? tmap[nm-1].tempo_us : 500000;
    sc->total_sec = ticks_to_sec(max_tick, tmap, nm, division);
    if (sc->total_sec < 0.01) sc->total_sec = 0.01;

    qsort(sc->notes, (size_t)sc->note_count, sizeof(MidiNote), note_cmp);

    g_free(tmap);
    g_free(open);
    return TRUE;
}

/* ── Pitch / layout helpers ────────────────────────────────────────────── */
static int to_diatonic(int midi)
{
    return (midi / 12) * 7 + chroma_to_diatonic[midi % 12];
}

/* Y position relative to system top (sys_y=0).  Returns INT_MIN if out of range. */
static int note_rel_y(int note_number, int *out_treble)
{
    int treble    = (note_number >= 60);
    int staff_top = treble ? TREBLE_REL_TOP : BASS_REL_TOP;
    int ref_note  = treble ? 64 : 43;   /* E4 for treble, G2 for bass */
    int ref_rel_y = staff_top + 4 * STAFF_SPACING;

    int d_ref  = to_diatonic(ref_note);
    int d_curr = to_diatonic(note_number);
    int rel_y  = ref_rel_y - (int)round((d_curr - d_ref) * STAFF_SPACING * 0.5);

    int limit = 5 * STAFF_SPACING;
    if (rel_y < staff_top - limit || rel_y > staff_top + 4 * STAFF_SPACING + limit)
        return INT_MIN;

    if (out_treble) *out_treble = treble;
    return rel_y;
}

static int time_to_x(double sec, double sys_start_sec, int sys_x,
                      int sys_w, double sec_per_system, int quantize)
{
    double avail   = sys_w - LEFT_MARGIN - RIGHT_MARGIN;
    double bar_sec = sec_per_system / BARS_PER_SYSTEM;
    double rel     = sec - sys_start_sec;
    if (rel < 0.0) rel = 0.0;
    double rel_bars = rel / bar_sec;

    if (quantize) {
        double beat = (rel_bars - floor(rel_bars)) * 4.0;
        beat = round(beat * QUANTIZE_DIV) / QUANTIZE_DIV;
        rel_bars = floor(rel_bars) + beat / 4.0;
    }

    double frac = rel_bars / BARS_PER_SYSTEM;
    if (frac < 0.0) frac = 0.0;
    if (frac > 1.0) frac = 1.0;
    return sys_x + LEFT_MARGIN + (int)(frac * avail);
}

/* ── Cairo drawing ─────────────────────────────────────────────────────── */
static void draw_pango_text(cairo_t *cr, double x, double y,
                            const char *text, const char *font, double size)
{
    PangoLayout *lay = pango_cairo_create_layout(cr);
    char desc[128];
    snprintf(desc, sizeof desc, "%s %.0f", font, size);
    PangoFontDescription *fd = pango_font_description_from_string(desc);
    pango_layout_set_font_description(lay, fd);
    pango_font_description_free(fd);
    pango_layout_set_text(lay, text, -1);
    cairo_move_to(cr, x, y);
    pango_cairo_show_layout(cr, lay);
    g_object_unref(lay);
}

static void draw_note_head(cairo_t *cr, double x, double y, gboolean filled,
                           gboolean stem_up)
{
    cairo_save(cr);
    cairo_translate(cr, x, y);
    cairo_rotate(cr, -22.0 * M_PI / 180.0);
    cairo_scale(cr, NOTE_HEAD_RX, NOTE_HEAD_RY);
    cairo_arc(cr, 0, 0, 1.0, 0, 2 * M_PI);
    if (filled) {
        cairo_set_source_rgb(cr, 0, 0, 0);
        cairo_fill(cr);
    } else {
        cairo_set_source_rgb(cr, 1, 1, 1);
        cairo_fill_preserve(cr);
        cairo_set_source_rgb(cr, 0, 0, 0);
        cairo_set_line_width(cr, 1.0 / NOTE_HEAD_RX);
        cairo_stroke(cr);
    }
    cairo_restore(cr);

    /* Stem */
    cairo_set_source_rgb(cr, 0, 0, 0);
    cairo_set_line_width(cr, 1.3);
    double sx  = stem_up ? x + NOTE_HEAD_RX - 1 : x - NOTE_HEAD_RX + 1;
    double sy2 = stem_up ? y - STEM_LEN : y + STEM_LEN;
    cairo_move_to(cr, sx, y);
    cairo_line_to(cr, sx, sy2);
    cairo_stroke(cr);
}

static void draw_ledger_lines(cairo_t *cr, int note_number, double x, int sys_y, int treble)
{
    int staff_top = sys_y + (treble ? TREBLE_REL_TOP : BASS_REL_TOP);
    int top_line  = staff_top;
    int bot_line  = staff_top + 4 * STAFF_SPACING;
    int rel_y     = note_rel_y(note_number, NULL);
    if (rel_y == INT_MIN) return;
    int ny       = sys_y + rel_y;
    double hw    = NOTE_HEAD_RX + 4;

    cairo_set_source_rgb(cr, 0, 0, 0);
    cairo_set_line_width(cr, 1.0);
    for (int ly = top_line - STAFF_SPACING; ly >= ny - NOTE_HEAD_RY; ly -= STAFF_SPACING) {
        cairo_move_to(cr, x - hw, ly);
        cairo_line_to(cr, x + hw, ly);
        cairo_stroke(cr);
    }
    for (int ly = bot_line + STAFF_SPACING; ly <= ny + NOTE_HEAD_RY; ly += STAFF_SPACING) {
        cairo_move_to(cr, x - hw, ly);
        cairo_line_to(cr, x + hw, ly);
        cairo_stroke(cr);
    }
}

static void draw_staves(cairo_t *cr, int sys_x, int sys_y, int sys_w)
{
    cairo_set_source_rgb(cr, 0, 0, 0);
    int treble_top = sys_y + TREBLE_REL_TOP;
    int bass_top   = sys_y + BASS_REL_TOP;
    /* Staff lines span the full system width so the clef/time-sig sit inside. */
    int x0 = sys_x + 4;
    int x1 = sys_x + sys_w - RIGHT_MARGIN;
    cairo_set_line_width(cr, 1.0);
    for (int i = 0; i < 5; i++) {
        cairo_move_to(cr, x0, treble_top + i * STAFF_SPACING);
        cairo_line_to(cr, x1, treble_top + i * STAFF_SPACING);
        cairo_stroke(cr);
        cairo_move_to(cr, x0, bass_top + i * STAFF_SPACING);
        cairo_line_to(cr, x1, bass_top + i * STAFF_SPACING);
        cairo_stroke(cr);
    }
    /* Left system barline connecting both staves */
    cairo_set_line_width(cr, 2.0);
    cairo_move_to(cr, x0, treble_top);
    cairo_line_to(cr, x0, bass_top + 4 * STAFF_SPACING);
    cairo_stroke(cr);
}

static void draw_clef_and_sig(cairo_t *cr, int sys_x, int sys_y)
{
    cairo_set_source_rgb(cr, 0, 0, 0);

    /* G clef: anchor just above treble top line so the curl sits on G4 (line 4). */
    draw_pango_text(cr, sys_x + 8, sys_y + TREBLE_REL_TOP - 18,
                    "\xf0\x9d\x84\x9e", "serif", 48);

    /* F clef: anchor so the dot falls near bass line 4 (F3). */
    draw_pango_text(cr, sys_x + 10, sys_y + BASS_REL_TOP - 4,
                    "\xf0\x9d\x84\xa2", "serif", 38);

    /* 4/4 time signature.
     * Upper "4": starts at top staff line.
     * Lower "4": starts at middle staff line (2 * STAFF_SPACING below top).
     * Font size ~20pt fits within one staff half (2 * STAFF_SPACING = 28px). */
    draw_pango_text(cr, sys_x + 65, sys_y + TREBLE_REL_TOP,
                    "4", "serif bold", 20);
    draw_pango_text(cr, sys_x + 65, sys_y + TREBLE_REL_TOP + 2 * STAFF_SPACING,
                    "4", "serif bold", 20);
    draw_pango_text(cr, sys_x + 65, sys_y + BASS_REL_TOP,
                    "4", "serif bold", 20);
    draw_pango_text(cr, sys_x + 65, sys_y + BASS_REL_TOP + 2 * STAFF_SPACING,
                    "4", "serif bold", 20);
}

static void draw_barlines(cairo_t *cr, int sys_x, int sys_y, int sys_w)
{
    int treble_top = sys_y + TREBLE_REL_TOP;
    int bass_top   = sys_y + BASS_REL_TOP;
    int bass_bot   = bass_top + 4 * STAFF_SPACING;
    double avail   = sys_w - LEFT_MARGIN - RIGHT_MARGIN;
    double bar_w   = avail / BARS_PER_SYSTEM;

    cairo_set_source_rgb(cr, 0, 0, 0);
    for (int i = 0; i <= BARS_PER_SYSTEM; i++) {
        int bx = sys_x + LEFT_MARGIN + (int)round(i * bar_w);
        cairo_set_line_width(cr, (i == 0) ? 1.8 : 1.0);
        cairo_move_to(cr, bx, treble_top);
        cairo_line_to(cr, bx, treble_top + 4 * STAFF_SPACING);
        cairo_stroke(cr);
        cairo_move_to(cr, bx, bass_top);
        cairo_line_to(cr, bx, bass_bot);
        cairo_stroke(cr);
    }
}

static void draw_measure_numbers(cairo_t *cr, int sys_x, int sys_y,
                                 int sys_w, int sys_idx)
{
    int first = sys_idx * BARS_PER_SYSTEM + 1;
    double avail = sys_w - LEFT_MARGIN - RIGHT_MARGIN;
    double bar_w = avail / BARS_PER_SYSTEM;
    cairo_set_source_rgb(cr, 0.5, 0.5, 0.5);
    for (int i = 0; i < BARS_PER_SYSTEM; i++) {
        int mx = sys_x + LEFT_MARGIN + (int)(i * bar_w) + 4;
        char buf[16];
        snprintf(buf, sizeof buf, "%d", first + i);
        draw_pango_text(cr, mx, sys_y + 8, buf, "serif italic", 10);
    }
}

static void draw_notes_in_system(cairo_t *cr,
                                 const MidiNote *notes, int note_count,
                                 int sys_idx, int sys_x, int sys_y, int sys_w,
                                 double sec_per_system, int tempo_us)
{
    double sys_start = sys_idx * sec_per_system;
    double sys_end   = sys_start + sec_per_system;
    double beat_sec  = tempo_us / 1e6;
    if (beat_sec <= 0.0) beat_sec = 0.5;

    for (int i = 0; i < note_count; i++) {
        const MidiNote *n = &notes[i];
        if (n->start_sec >= sys_end) break;
        if (n->start_sec + n->duration_sec <= sys_start) continue;
        if (n->channel == DRUM_CH) continue;

        int treble = 0;
        int rel_y  = note_rel_y(n->note_number, &treble);
        if (rel_y == INT_MIN) continue;

        double draw_start = (n->start_sec >= sys_start) ? n->start_sec : sys_start;
        int x = time_to_x(draw_start, sys_start, sys_x, sys_w, sec_per_system, 1);
        int y = sys_y + rel_y;

        int staff_top = sys_y + (treble ? TREBLE_REL_TOP : BASS_REL_TOP);
        int staff_mid = staff_top + 2 * STAFF_SPACING;
        gboolean stem_up = (y >= staff_mid);
        gboolean filled  = (n->duration_sec < beat_sec * 0.95);

        draw_note_head(cr, x, y, filled, stem_up);
        draw_ledger_lines(cr, n->note_number, x, sys_y, treble);

        if (is_accidental[n->note_number % 12]) {
            cairo_set_source_rgb(cr, 0, 0, 0);
            draw_pango_text(cr, x - 14, y - 8, "#", "serif", 11);
        }
    }
}

static void render_system(cairo_t *cr,
                           const MidiNote *notes, int note_count,
                           int sys_idx, int sys_x, int sys_y, int sys_w,
                           double sec_per_system, int tempo_us)
{
    /* Separator line */
    cairo_set_source_rgba(cr, 0.86, 0.86, 0.88, 1.0);
    cairo_set_line_width(cr, 1.0);
    cairo_move_to(cr, sys_x, sys_y + SYSTEM_H - 1);
    cairo_line_to(cr, sys_x + sys_w, sys_y + SYSTEM_H - 1);
    cairo_stroke(cr);

    draw_staves(cr, sys_x, sys_y, sys_w);
    draw_clef_and_sig(cr, sys_x, sys_y);
    draw_measure_numbers(cr, sys_x, sys_y, sys_w, sys_idx);
    draw_barlines(cr, sys_x, sys_y, sys_w);
    draw_notes_in_system(cr, notes, note_count,
                         sys_idx, sys_x, sys_y, sys_w,
                         sec_per_system, tempo_us);
}

/* ── Public API ────────────────────────────────────────────────────────── */
gboolean score_verovio_load(ScoreVerovio *score, const char *midi_path,
                            int page_width_px, ScoreProgressFn progress,
                            gpointer progress_data, GError **err)
{
    if (!score || !midi_path) return FALSE;

    g_free(score->notes);
    score->notes      = NULL;
    score->note_count = 0;
    score->note_cap   = 0;
    if (score->surface) {
        cairo_surface_destroy(score->surface);
        score->surface = NULL;
    }

    if (progress) progress(5, "MIDI 읽는 중…", progress_data);

    if (!parse_midi_notes(midi_path, score, err))
        return FALSE;

    score->system_w       = (page_width_px > 200) ? page_width_px : 800;
    score->sec_per_bar    = 4.0 * score->tempo_us / 1e6;
    score->sec_per_system = score->sec_per_bar * BARS_PER_SYSTEM;
    if (score->sec_per_system <= 0.0) score->sec_per_system = 8.0;
    score->n_systems = (int)ceil(score->total_sec / score->sec_per_system) + 1;
    if (score->n_systems < 1) score->n_systems = 1;

    if (progress) progress(30, "악보 준비 완료", progress_data);
    return TRUE;
}

int score_verovio_page_count(const ScoreVerovio *score)
{
    return score ? score->n_systems : 0;
}

cairo_surface_t *score_verovio_render_surface(ScoreVerovio *score, double scale,
                                              int *out_w, int *out_h,
                                              ScoreProgressFn progress,
                                              gpointer progress_data)
{
    (void)scale;
    if (!score || score->n_systems < 1) return NULL;

    if (progress) progress(35, "악보 그리는 중…", progress_data);

    int strip_w = score->system_w;
    int strip_h = score->n_systems * SYSTEM_H;

    cairo_surface_t *surf = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, strip_w, strip_h);
    if (cairo_surface_status(surf) != CAIRO_STATUS_SUCCESS) {
        cairo_surface_destroy(surf);
        return NULL;
    }

    cairo_t *cr = cairo_create(surf);
    cairo_set_source_rgb(cr, 1, 1, 1);
    cairo_paint(cr);

    for (int s = 0; s < score->n_systems; s++) {
        render_system(cr, score->notes, score->note_count,
                      s, 0, s * SYSTEM_H,
                      score->system_w, score->sec_per_system, score->tempo_us);

        if (progress && (s % 4 == 0)) {
            int pct = 35 + (int)(60.0 * (s + 1) / score->n_systems);
            progress(pct, "악보 그리는 중…", progress_data);
        }
    }

    cairo_destroy(cr);
    cairo_surface_flush(surf);

    if (score->surface)
        cairo_surface_destroy(score->surface);
    score->surface   = surf;
    score->surface_w = strip_w;
    score->surface_h = strip_h;

    if (out_w) *out_w = strip_w;
    if (out_h) *out_h = strip_h;

    if (progress) progress(100, "완료", progress_data);
    return cairo_surface_reference(surf);
}

/* ── Incremental job (thin wrappers — single-step for this renderer) ───── */
struct ScoreRenderJob {
    ScoreVerovio    *score;
    double           scale;
    ScoreProgressFn  progress;
    gpointer         progress_data;
    cairo_surface_t *surface;
    int              w, h;
    gboolean         done;
};

ScoreRenderJob *score_verovio_render_job_new(ScoreVerovio *score, double scale,
                                             ScoreProgressFn progress,
                                             gpointer progress_data)
{
    ScoreRenderJob *j = g_new0(ScoreRenderJob, 1);
    j->score = score; j->scale = scale;
    j->progress = progress; j->progress_data = progress_data;
    return j;
}

gboolean score_verovio_render_job_step(ScoreRenderJob *job, GError **err)
{
    (void)err;
    if (!job || job->done) return FALSE;
    job->surface = score_verovio_render_surface(job->score, job->scale,
                                                &job->w, &job->h,
                                                job->progress, job->progress_data);
    job->done = TRUE;
    return FALSE;
}

cairo_surface_t *score_verovio_render_job_take_surface(ScoreRenderJob *job,
                                                       int *out_w, int *out_h)
{
    if (!job) return NULL;
    cairo_surface_t *s = job->surface;
    job->surface = NULL;
    if (out_w) *out_w = job->w;
    if (out_h) *out_h = job->h;
    return s;
}

void score_verovio_render_job_free(ScoreRenderJob *job) { g_free(job); }

/* ── Playhead ──────────────────────────────────────────────────────────── */
gboolean score_verovio_playhead_at_time(const ScoreVerovio *score,
                                        double current_sec, double duration_sec,
                                        int *out_x, int *out_y, int *out_h,
                                        int *out_page, int *out_line)
{
    (void)duration_sec;
    if (!score || score->n_systems < 1 || score->sec_per_system <= 0.0)
        return FALSE;

    int sys = (int)(current_sec / score->sec_per_system);
    if (sys < 0) sys = 0;
    if (sys >= score->n_systems) sys = score->n_systems - 1;

    double sys_start = sys * score->sec_per_system;
    double rel       = current_sec - sys_start;
    if (rel < 0.0) rel = 0.0;
    double frac = rel / score->sec_per_system;
    if (frac > 1.0) frac = 1.0;
    double avail = score->system_w - LEFT_MARGIN - RIGHT_MARGIN;

    if (out_x) *out_x = LEFT_MARGIN + (int)(frac * avail);
    if (out_y) *out_y = sys * SYSTEM_H;
    if (out_h) *out_h = SYSTEM_H;
    if (out_page) *out_page = sys;
    if (out_line)  *out_line  = sys;
    return TRUE;
}

int score_verovio_playhead_bar_h(const ScoreVerovio *score)
{
    (void)score;
    return SYSTEM_H;
}

int score_verovio_playhead_line_key(const ScoreVerovio *score, int page, int system)
{
    (void)score; (void)system;
    return page;
}

int score_verovio_total_system_rows(const ScoreVerovio *score)
{
    return score ? score->n_systems : 0;
}

int score_verovio_page_system_rows(const ScoreVerovio *score, int page)
{
    (void)score; (void)page;
    return 1;
}
