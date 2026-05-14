#pragma once

#include <gtk/gtk.h>
#include <stdint.h>

/* A GTK DrawingArea that renders a PCM waveform with a playback cursor.
   No external state; all data is stored as g_object_data on the widget. */

GtkWidget *waveform_widget_new     (void);

/* Replace displayed waveform with new PCM data. */
void       waveform_widget_set_data   (GtkWidget *w,
                                       const int16_t *samples,
                                       int count, int sample_rate);

/* Append PCM samples to the existing waveform (for real-time streaming). */
void       waveform_widget_append_data(GtkWidget *w,
                                       const int16_t *samples,
                                       int count, int sample_rate);

/* Move the playback cursor.  ratio: 0.0–1.0 */
void       waveform_widget_set_pos (GtkWidget *w, double ratio);

void       waveform_widget_clear   (GtkWidget *w);
