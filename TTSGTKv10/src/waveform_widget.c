#include "waveform_widget.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdbool.h>

#define DATA_KEY      "wf-data"
#define TICK_AREA     22    /* pixels reserved at bottom for time axis */
#define CURSOR_RATIO  0.75  /* cursor fixed at 75% from left in scroll mode */
#define VIEW_SECS     8.0   /* seconds visible in scrolling window */

typedef struct {
    int16_t *samples;
    int      count;
    int      sample_rate;
    double   cursor;     /* 0.0–1.0, playback position */
    bool     streaming;  /* true while synthesis chunks are arriving */
} WfData;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

static double tick_interval(double span_sec)
{
    if (span_sec <= 2.0)  return 0.25;
    if (span_sec <= 5.0)  return 0.5;
    if (span_sec <= 15.0) return 1.0;
    if (span_sec <= 60.0) return 5.0;
    return 10.0;
}

static void draw_bar(cairo_t *cr, int col, double cy,
                     const WfData *d, int si, int ei, double y_scale)
{
    if (si < 0) si = 0;
    if (ei > d->count) ei = d->count;
    if (si >= ei) return;

    int16_t vmax = 0, vmin = 0;
    for (int i = si; i < ei; i++) {
        if (d->samples[i] > vmax) vmax = d->samples[i];
        if (d->samples[i] < vmin) vmin = d->samples[i];
    }
    double ytop = cy - vmax * y_scale;
    double ybot = cy - vmin * y_scale;
    if (fabs(ytop - ybot) < 1.0) ybot = ytop + 1.0;

    cairo_move_to(cr, col + 0.5, ytop);
    cairo_line_to(cr, col + 0.5, ybot);
    cairo_stroke(cr);
}

static void draw_time_axis(cairo_t *cr, int w, int wh, int h,
                           double t_left, double t_right)
{
    double span = t_right - t_left;
    if (span <= 0.0) return;

    double interval = tick_interval(span);

    cairo_select_font_face(cr, "Sans",
                           CAIRO_FONT_SLANT_NORMAL,
                           CAIRO_FONT_WEIGHT_NORMAL);
    cairo_set_font_size(cr, 9.0);

    /* First tick at or after t_left */
    double t0 = ceil(t_left / interval) * interval;

    for (double t = t0; t <= t_right + interval * 0.01; t += interval) {
        if (t < 0.0) continue;
        double x = (t - t_left) / span * w;
        if (x < 0 || x > w) continue;

        /* Faint grid line */
        cairo_set_source_rgba(cr, 0.30, 0.40, 0.55, 0.20);
        cairo_set_line_width(cr, 1.0);
        cairo_move_to(cr, x, 0);
        cairo_line_to(cr, x, wh);
        cairo_stroke(cr);

        /* Tick mark */
        cairo_set_source_rgba(cr, 0.50, 0.60, 0.75, 1.0);
        cairo_move_to(cr, x, wh);
        cairo_line_to(cr, x, wh + 5);
        cairo_stroke(cr);

        /* Label */
        char label[16];
        if (interval < 1.0)
            snprintf(label, sizeof(label), "%.2gs", t);
        else
            snprintf(label, sizeof(label), "%.0fs", t);

        cairo_text_extents_t ext;
        cairo_text_extents(cr, label, &ext);
        double lx = x - ext.width / 2.0;
        if (lx < 1.0)               lx = 1.0;
        if (lx + ext.width > w - 1) lx = (double)w - ext.width - 1.0;
        cairo_set_source_rgba(cr, 0.65, 0.72, 0.85, 1.0);
        cairo_move_to(cr, lx, h - 3);
        cairo_show_text(cr, label);
    }
}

/* ── Drawing ──────────────────────────────────────────────────────────────── */

static gboolean on_draw(GtkWidget *widget, cairo_t *cr, gpointer user_data)
{
    (void)user_data;
    WfData *d  = g_object_get_data(G_OBJECT(widget), DATA_KEY);
    int     w  = gtk_widget_get_allocated_width(widget);
    int     h  = gtk_widget_get_allocated_height(widget);
    int     wh = h - TICK_AREA;
    int     cy = wh / 2;

    /* Background */
    cairo_set_source_rgb(cr, 0.08, 0.08, 0.12);
    cairo_paint(cr);

    /* Center line */
    cairo_set_source_rgba(cr, 0.25, 0.45, 0.65, 0.5);
    cairo_set_line_width(cr, 1.0);
    cairo_move_to(cr, 0, cy);
    cairo_line_to(cr, w, cy);
    cairo_stroke(cr);

    /* Time axis baseline */
    cairo_set_source_rgba(cr, 0.30, 0.30, 0.40, 0.8);
    cairo_move_to(cr, 0, wh);
    cairo_line_to(cr, w, wh);
    cairo_stroke(cr);

    if (!d || d->count == 0 || d->sample_rate == 0) return FALSE;

    double total_sec = (double)d->count / (double)d->sample_rate;
    double y_scale   = (double)(cy - 3) / 32768.0;

    /* cursor_x: pixel position of playback bar (-1 = not playing) */
    int cursor_x = (d->cursor > 0.0 && !d->streaming)
                   ? (int)(d->cursor * w) : -1;

    /* ── Waveform bars ────────────────────────────────────────────────────── */
    cairo_set_line_width(cr, 1.0);

    int step = (int)ceil((double)d->count / w);
    if (step < 1) step = 1;

    for (int col = 0; col < w; col++) {
        int si = (int)((double)col / w * d->count);

        /* Played portion brighter than unplayed */
        if (cursor_x > 0 && col < cursor_x)
            cairo_set_source_rgb(cr, 0.45, 0.80, 1.0);   /* played  */
        else
            cairo_set_source_rgb(cr, 0.20, 0.50, 0.80);   /* unplayed */

        draw_bar(cr, col, cy, d, si, si + step, y_scale);
    }

    /* ── Playback cursor bar ──────────────────────────────────────────────── */
    if (cursor_x > 0 && cursor_x < w) {
        cairo_set_source_rgba(cr, 1.0, 0.35, 0.35, 0.9);
        cairo_set_line_width(cr, 2.0);
        cairo_move_to(cr, cursor_x, 0);
        cairo_line_to(cr, cursor_x, wh);
        cairo_stroke(cr);
    }

    /* ── Time axis ────────────────────────────────────────────────────────── */
    draw_time_axis(cr, w, wh, h, 0.0, total_sec);

    return FALSE;
}

/* ── Lifecycle ────────────────────────────────────────────────────────────── */

static void wf_data_free(gpointer ptr)
{
    WfData *d = ptr;
    free(d->samples);
    free(d);
}

GtkWidget *waveform_widget_new(void)
{
    GtkWidget *da = gtk_drawing_area_new();
    gtk_widget_set_size_request(da, -1, 150);

    WfData *d = calloc(1, sizeof(WfData));
    g_object_set_data_full(G_OBJECT(da), DATA_KEY, d, wf_data_free);
    g_signal_connect(da, "draw", G_CALLBACK(on_draw), NULL);

    return da;
}

void waveform_widget_set_data(GtkWidget *w, const int16_t *samples,
                               int count, int sample_rate)
{
    WfData *d = g_object_get_data(G_OBJECT(w), DATA_KEY);
    free(d->samples);
    d->samples     = malloc((size_t)count * sizeof(int16_t));
    d->count       = count;
    d->sample_rate = sample_rate;
    d->cursor      = 0.0;
    d->streaming   = false;
    memcpy(d->samples, samples, (size_t)count * sizeof(int16_t));
    gtk_widget_queue_draw(w);
}

void waveform_widget_append_data(GtkWidget *w, const int16_t *samples,
                                  int count, int sample_rate)
{
    WfData *d = g_object_get_data(G_OBJECT(w), DATA_KEY);
    int new_count = d->count + count;
    d->samples = realloc(d->samples, (size_t)new_count * sizeof(int16_t));
    memcpy(d->samples + d->count, samples, (size_t)count * sizeof(int16_t));
    d->count     = new_count;
    d->streaming = true;   /* enable live-edge scrolling view */
    if (d->sample_rate == 0) d->sample_rate = sample_rate;
    gtk_widget_queue_draw(w);
}

void waveform_widget_set_pos(GtkWidget *w, double ratio)
{
    WfData *d = g_object_get_data(G_OBJECT(w), DATA_KEY);
    d->cursor    = ratio;
    d->streaming = false;  /* playback takes over from streaming */
    gtk_widget_queue_draw(w);
}

void waveform_widget_clear(GtkWidget *w)
{
    WfData *d = g_object_get_data(G_OBJECT(w), DATA_KEY);
    free(d->samples);
    d->samples   = NULL;
    d->count     = 0;
    d->cursor    = 0.0;
    d->streaming = false;
    gtk_widget_queue_draw(w);
}
