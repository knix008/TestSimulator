#include "waveform_widget.h"

#include <stdlib.h>
#include <string.h>
#include <math.h>

#define DATA_KEY "wf-data"

typedef struct {
    int16_t *samples;
    int      count;
    int      sample_rate;
    double   cursor;   /* 0.0–1.0 */
} WfData;

/* ── Drawing ──────────────────────────────────────────────────────────────── */

static gboolean on_draw(GtkWidget *widget, cairo_t *cr, gpointer user_data)
{
    (void)user_data;
    WfData *d = g_object_get_data(G_OBJECT(widget), DATA_KEY);
    int w = gtk_widget_get_allocated_width(widget);
    int h = gtk_widget_get_allocated_height(widget);
    int cy = h / 2;

    /* Background */
    cairo_set_source_rgb(cr, 0.08, 0.08, 0.12);
    cairo_paint(cr);

    /* Center line */
    cairo_set_source_rgba(cr, 0.25, 0.45, 0.65, 0.5);
    cairo_set_line_width(cr, 1.0);
    cairo_move_to(cr, 0, cy);
    cairo_line_to(cr, w, cy);
    cairo_stroke(cr);

    if (!d || d->count == 0) return FALSE;

    /* Waveform — draw min/max bars per pixel column */
    double y_scale = (double)(cy - 3) / 32768.0;
    int    step    = (int)ceil((double)d->count / w);
    if (step < 1) step = 1;

    cairo_set_source_rgb(cr, 0.20, 0.60, 1.0);
    cairo_set_line_width(cr, 1.0);

    for (int col = 0; col < w; col++) {
        int start = (int)((double)col / w * d->count);
        int end   = start + step;
        if (end > d->count) end = d->count;
        if (start >= d->count) break;

        int16_t vmax = 0, vmin = 0;
        for (int i = start; i < end; i++) {
            if (d->samples[i] > vmax) vmax = d->samples[i];
            if (d->samples[i] < vmin) vmin = d->samples[i];
        }

        double ytop = cy - vmax * y_scale;
        double ybot = cy - vmin * y_scale;
        if (fabs(ytop - ybot) < 1.0) ybot = ytop + 1.0;

        cairo_move_to(cr, col + 0.5, ytop);
        cairo_line_to(cr, col + 0.5, ybot);
    }
    cairo_stroke(cr);

    /* Playback cursor */
    if (d->cursor > 0.001 && d->cursor < 0.999) {
        double cx = d->cursor * w;
        cairo_set_source_rgba(cr, 1.0, 0.35, 0.35, 0.9);
        cairo_set_line_width(cr, 2.0);
        cairo_move_to(cr, cx, 0);
        cairo_line_to(cr, cx, h);
        cairo_stroke(cr);
    }

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
    gtk_widget_set_size_request(da, -1, 130);

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
    memcpy(d->samples, samples, (size_t)count * sizeof(int16_t));
    gtk_widget_queue_draw(w);
}

void waveform_widget_set_pos(GtkWidget *w, double ratio)
{
    WfData *d = g_object_get_data(G_OBJECT(w), DATA_KEY);
    d->cursor = ratio;
    gtk_widget_queue_draw(w);
}

void waveform_widget_clear(GtkWidget *w)
{
    WfData *d = g_object_get_data(G_OBJECT(w), DATA_KEY);
    free(d->samples);
    d->samples = NULL;
    d->count   = 0;
    d->cursor  = 0.0;
    gtk_widget_queue_draw(w);
}
