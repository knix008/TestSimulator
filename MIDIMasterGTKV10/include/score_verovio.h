#ifndef SCORE_VEROVIO_H
#define SCORE_VEROVIO_H

#include <cairo.h>
#include <glib.h>

typedef struct ScoreVerovio ScoreVerovio;

typedef void (*ScoreProgressFn)(int percent, const char *phase, gpointer user_data);

ScoreVerovio *score_verovio_new(void);
void          score_verovio_free(ScoreVerovio *score);

gboolean score_verovio_load(ScoreVerovio *score, const char *midi_path,
                            int page_width_px, ScoreProgressFn progress,
                            gpointer progress_data, GError **err);

int score_verovio_page_count(const ScoreVerovio *score);

cairo_surface_t *score_verovio_render_surface(ScoreVerovio *score, double scale,
                                              int *out_w, int *out_h,
                                              ScoreProgressFn progress,
                                              gpointer progress_data);

/* Incremental render (one page per step) to keep the GTK main loop responsive. */
typedef struct ScoreRenderJob ScoreRenderJob;

ScoreRenderJob *score_verovio_render_job_new(ScoreVerovio *score, double scale,
                                             ScoreProgressFn progress,
                                             gpointer progress_data);
/* TRUE while more steps remain; FALSE when finished or on error. */
gboolean score_verovio_render_job_step(ScoreRenderJob *job, GError **err);
cairo_surface_t *score_verovio_render_job_take_surface(ScoreRenderJob *job,
                                                       int *out_w, int *out_h);
void score_verovio_render_job_free(ScoreRenderJob *job);

/* Playhead in composite surface coordinates (vertical bar). Returns FALSE if hidden. */
gboolean score_verovio_playhead_at_time(const ScoreVerovio *score, double current_sec,
                                        double duration_sec, int *out_x, int *out_y,
                                        int *out_h, int *out_page, int *out_line);

/* Fixed playhead bar height in surface pixels (0 if score not rendered yet). */
int score_verovio_playhead_bar_h(const ScoreVerovio *score);

/* Global staff-line index (0..N-1) for scroll / line-change detection. */
int score_verovio_playhead_line_key(const ScoreVerovio *score, int page, int system);

/* Layout stats after render (Verovio system = printed score line, may include 2+ staves). */
int score_verovio_total_system_rows(const ScoreVerovio *score);
int score_verovio_page_system_rows(const ScoreVerovio *score, int page);

#endif
