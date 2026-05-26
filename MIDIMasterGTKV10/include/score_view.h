#ifndef SCORE_VIEW_H
#define SCORE_VIEW_H

#include <gtk/gtk.h>
#include "score_verovio.h"

typedef struct ScoreView ScoreView;

ScoreView *score_view_new(void);
GtkWidget *score_view_widget(ScoreView *view);

gboolean score_view_load(ScoreView *view, ScoreVerovio *score, ScoreProgressFn progress,
                         gpointer progress_data, GError **err);
void score_view_set_surface(ScoreView *view, cairo_surface_t *surface, int w, int h);
void     score_view_set_viewport_width(ScoreView *view, int width_px);
void score_view_set_playhead(ScoreView *view, ScoreVerovio *score,
                             double current_sec, double duration_sec, gboolean visible);
void     score_view_clear(ScoreView *view);

/* Call after gtk_widget_show_all so SVG/fonts render correctly. */
void score_view_ensure_ready(ScoreView *view);

#endif
