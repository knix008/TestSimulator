#include "piano_roll.h"
#include <math.h>
#include <stdlib.h>

#define KEY_W        42     /* piano keyboard width (pixels) */
#define NOTE_H        8     /* pixels per semitone row */
#define PX_PER_SEC   80.0  /* time axis scale */
#define MIN_PITCH     0
#define MAX_PITCH   127

/* Note colours per MIDI channel */
static const double CHAN_RGB[16][3] = {
    {0.25, 0.60, 1.00}, {0.25, 0.90, 0.45}, {1.00, 0.80, 0.20},
    {1.00, 0.40, 0.25}, {0.80, 0.25, 1.00}, {1.00, 0.25, 0.60},
    {0.25, 1.00, 1.00}, {0.95, 0.95, 0.25}, {0.55, 0.90, 0.25},
    {0.75, 0.75, 0.75}, {0.40, 0.80, 1.00}, {0.60, 1.00, 0.65},
    {1.00, 0.60, 0.45}, {0.90, 0.55, 0.90}, {0.40, 0.90, 0.80},
    {1.00, 0.70, 0.70}
};

static const int BLACK_KEY[12] = {0,1,0,1,0,0,1,0,1,0,1,0};

struct PianoRoll {
    GtkWidget       *scrolled;
    GtkWidget       *draw;
    const MidiFile  *mf;
    double           cur_sec;
};

/* ── draw ──────────────────────────────────────────────────────── */

static gboolean on_draw(GtkWidget *widget, cairo_t *cr, gpointer data) {
    (void)widget;
    PianoRoll *pr = data;

    int total_h = (MAX_PITCH - MIN_PITCH + 1) * NOTE_H;
    double total_w = pr->mf
        ? KEY_W + pr->mf->total_seconds * PX_PER_SEC
        : 800.0;

    /* background */
    cairo_set_source_rgb(cr, 0.12, 0.12, 0.14);
    cairo_paint(cr);

    /* pitch rows */
    for (int p = MIN_PITCH; p <= MAX_PITCH; p++) {
        int y = (MAX_PITCH - p) * NOTE_H;
        int n = p % 12;
        if (BLACK_KEY[n])
            cairo_set_source_rgb(cr, 0.10, 0.10, 0.12);
        else
            cairo_set_source_rgb(cr, 0.15, 0.15, 0.18);
        cairo_rectangle(cr, KEY_W, y, total_w - KEY_W, NOTE_H);
        cairo_fill(cr);

        /* horizontal grid line */
        cairo_set_source_rgba(cr, 1.0, 1.0, 1.0, 0.05);
        cairo_move_to(cr, KEY_W, y);
        cairo_line_to(cr, total_w, y);
        cairo_stroke(cr);
    }

    /* C-note highlight lines */
    cairo_set_source_rgba(cr, 1.0, 1.0, 1.0, 0.12);
    cairo_set_line_width(cr, 1.0);
    for (int p = MIN_PITCH; p <= MAX_PITCH; p++) {
        if (p % 12 == 0) {
            int y = (MAX_PITCH - p) * NOTE_H;
            cairo_move_to(cr, KEY_W, y);
            cairo_line_to(cr, total_w, y);
            cairo_stroke(cr);
        }
    }

    /* vertical bar lines (every 4 beats at 120 BPM as fallback) */
    if (pr->mf) {
        double beat_sec = (pr->mf->tempo_count > 0 && pr->mf->tempo_map[0].tempo_us > 0)
            ? pr->mf->tempo_map[0].tempo_us / 1000000.0
            : 0.5;
        double bar_sec = beat_sec * 4.0;
        cairo_set_source_rgba(cr, 1.0, 1.0, 1.0, 0.08);
        cairo_set_line_width(cr, 1.0);
        for (double t = 0.0; t < pr->mf->total_seconds; t += bar_sec) {
            double x = KEY_W + t * PX_PER_SEC;
            cairo_move_to(cr, x, 0);
            cairo_line_to(cr, x, total_h);
            cairo_stroke(cr);
        }
    }

    /* notes */
    if (pr->mf) {
        for (int i = 0; i < pr->mf->total_notes; i++) {
            const MidiNote *n = &pr->mf->all_notes[i];
            int    ch = n->channel & 15;
            double x  = KEY_W + n->start_sec * PX_PER_SEC;
            double w  = (n->end_sec - n->start_sec) * PX_PER_SEC;
            if (w < 2.0) w = 2.0;
            int    y  = (MAX_PITCH - n->pitch) * NOTE_H;

            double r = CHAN_RGB[ch][0];
            double g = CHAN_RGB[ch][1];
            double b = CHAN_RGB[ch][2];
            double a = 0.55 + 0.45 * (n->velocity / 127.0);

            cairo_set_source_rgba(cr, r, g, b, a);
            cairo_rectangle(cr, x, y + 1, w, NOTE_H - 1);
            cairo_fill(cr);

            /* slight outline */
            cairo_set_source_rgba(cr, r * 0.5, g * 0.5, b * 0.5, 0.8);
            cairo_set_line_width(cr, 0.5);
            cairo_rectangle(cr, x, y + 1, w, NOTE_H - 1);
            cairo_stroke(cr);
        }
    }

    /* piano keyboard */
    for (int p = MIN_PITCH; p <= MAX_PITCH; p++) {
        int y = (MAX_PITCH - p) * NOTE_H;
        int n = p % 12;
        if (BLACK_KEY[n]) {
            cairo_set_source_rgb(cr, 0.10, 0.10, 0.10);
            cairo_rectangle(cr, 0, y, KEY_W * 0.65, NOTE_H);
            cairo_fill(cr);
        } else {
            cairo_set_source_rgb(cr, 0.92, 0.92, 0.92);
            cairo_rectangle(cr, 0, y + 1, KEY_W - 1, NOTE_H - 1);
            cairo_fill(cr);
            /* C label */
            if (n == 0) {
                cairo_set_source_rgb(cr, 0.3, 0.3, 0.3);
                cairo_select_font_face(cr, "Sans", CAIRO_FONT_SLANT_NORMAL,
                                       CAIRO_FONT_WEIGHT_NORMAL);
                cairo_set_font_size(cr, 7.0);
                char label[8];
                snprintf(label, sizeof(label), "C%d", p / 12 - 1);
                cairo_move_to(cr, 2, y + NOTE_H - 2);
                cairo_show_text(cr, label);
            }
        }
    }
    /* separator line */
    cairo_set_source_rgb(cr, 0.4, 0.4, 0.4);
    cairo_set_line_width(cr, 1.0);
    cairo_move_to(cr, KEY_W, 0);
    cairo_line_to(cr, KEY_W, total_h);
    cairo_stroke(cr);

    /* playhead */
    if (pr->mf && pr->cur_sec >= 0.0) {
        double ph_x = KEY_W + pr->cur_sec * PX_PER_SEC;
        cairo_set_source_rgba(cr, 1.0, 0.15, 0.15, 0.90);
        cairo_set_line_width(cr, 1.5);
        cairo_move_to(cr, ph_x, 0);
        cairo_line_to(cr, ph_x, total_h);
        cairo_stroke(cr);
    }

    return TRUE;
}

/* ── public ────────────────────────────────────────────────────── */

PianoRoll *piano_roll_new(void) {
    PianoRoll *pr = g_new0(PianoRoll, 1);
    pr->cur_sec = -1.0;

    pr->scrolled = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(pr->scrolled),
                                    GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);

    pr->draw = gtk_drawing_area_new();
    gtk_widget_set_size_request(pr->draw, 800,
                                 (MAX_PITCH - MIN_PITCH + 1) * NOTE_H);
    g_signal_connect(pr->draw, "draw", G_CALLBACK(on_draw), pr);
    gtk_container_add(GTK_CONTAINER(pr->scrolled), pr->draw);

    return pr;
}

void piano_roll_free(PianoRoll *pr) {
    if (pr) g_free(pr);
}

GtkWidget *piano_roll_widget(PianoRoll *pr) {
    return pr ? pr->scrolled : NULL;
}

void piano_roll_set_file(PianoRoll *pr, const MidiFile *mf) {
    if (!pr) return;
    pr->mf      = mf;
    pr->cur_sec = -1.0;
    if (mf) {
        int    total_h = (MAX_PITCH - MIN_PITCH + 1) * NOTE_H;
        double total_w = KEY_W + mf->total_seconds * PX_PER_SEC;
        gtk_widget_set_size_request(pr->draw, (int)total_w, total_h);

        /* scroll to pitch range */
        GtkAdjustment *vadj = gtk_scrolled_window_get_vadjustment(
            GTK_SCROLLED_WINDOW(pr->scrolled));
        int center = (MAX_PITCH - (mf->pitch_min + mf->pitch_max) / 2) * NOTE_H;
        gtk_adjustment_set_value(vadj, (gdouble)(center - 200));
    }
    gtk_widget_queue_draw(pr->draw);
}

void piano_roll_set_position(PianoRoll *pr, double seconds) {
    if (!pr || !pr->mf) return;
    pr->cur_sec = seconds;

    /* auto-scroll horizontally to follow playhead */
    GtkAdjustment *hadj = gtk_scrolled_window_get_hadjustment(
        GTK_SCROLLED_WINDOW(pr->scrolled));
    double ph_x    = KEY_W + seconds * PX_PER_SEC;
    double page    = gtk_adjustment_get_page_size(hadj);
    double cur_val = gtk_adjustment_get_value(hadj);

    if (ph_x > cur_val + page * 0.85)
        gtk_adjustment_set_value(hadj, ph_x - page * 0.25);
    else if (ph_x < cur_val + KEY_W + 10)
        gtk_adjustment_set_value(hadj, fmax(0.0, ph_x - page * 0.25));

    gtk_widget_queue_draw(pr->draw);
}

void piano_roll_reset(PianoRoll *pr) {
    if (!pr) return;
    pr->mf      = NULL;
    pr->cur_sec = -1.0;
    gtk_widget_set_size_request(pr->draw, 800,
                                 (MAX_PITCH - MIN_PITCH + 1) * NOTE_H);
    gtk_widget_queue_draw(pr->draw);
}
