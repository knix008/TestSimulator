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

/* Prime GdkPixbuf SVG backend after GTK is initialized (call once after gtk_init). */
void score_verovio_warmup_display(void);

/* Playhead in composite surface coordinates (vertical bar). Returns FALSE if hidden. */
gboolean score_verovio_playhead_at_time(const ScoreVerovio *score, double current_sec,
                                        double duration_sec, int *out_x, int *out_y,
                                        int *out_h);

#endif
