#ifndef SCORE_VIEW_H
#define SCORE_VIEW_H

#include <gtk/gtk.h>
#include "score_verovio.h"

typedef struct ScoreView ScoreView;

typedef enum {
    SCORE_SCROLL_NONE = 0,
    SCORE_SCROLL_FOLLOW, /* 재생 중 가로 따라가기 (악보가 오른쪽→왼쪽으로 흐름) */
    SCORE_SCROLL_JUMP
} ScoreScrollMode;

ScoreView *score_view_new(void);
GtkWidget *score_view_widget(ScoreView *view);

gboolean score_view_load(ScoreView *view, ScoreVerovio *score, ScoreProgressFn progress,
                         gpointer progress_data, GError **err);
void score_view_set_surface(ScoreView *view, cairo_surface_t *surface, int w, int h);
void score_view_set_viewport_width(ScoreView *view, int width_px);
void score_view_set_viewport_size(ScoreView *view, int width_px, int height_px);
void score_view_set_playhead(ScoreView *view, ScoreVerovio *score,
                             double current_sec, double duration_sec, gboolean visible,
                             ScoreScrollMode scroll_mode);
void score_view_reset_scroll_tracking(ScoreView *view);
void     score_view_clear(ScoreView *view);

/* Call after gtk_widget_show_all so SVG/fonts render correctly. */
void score_view_ensure_ready(ScoreView *view);

#endif
