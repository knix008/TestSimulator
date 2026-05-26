#ifndef IMAGE_EFFECTS_H
#define IMAGE_EFFECTS_H

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <glib.h>

/* 깊은 복사 (RGBA 보장). */
GdkPixbuf *image_effects_clone(const GdkPixbuf *src);

/* 색상 조정 (V30 슬라이더 범위와 동일). */
void image_effects_adjust(GdkPixbuf *img,
                          int brightness,  /* -100..100 */
                          int contrast,
                          int saturation,
                          int hue,         /* -180..180 */
                          int gamma_pct,   /* 50..200, 100=중립 */
                          int temperature); /* -100..100 */

gboolean image_effects_grayscale(GdkPixbuf *img);
gboolean image_effects_sepia(GdkPixbuf *img);
gboolean image_effects_invert(GdkPixbuf *img);
gboolean image_effects_vignette(GdkPixbuf *img);
gboolean image_effects_detect_edges(GdkPixbuf *img);
gboolean image_effects_polaroid(GdkPixbuf *img);
gboolean image_effects_glow(GdkPixbuf *img);
gboolean image_effects_high_contrast_bw(GdkPixbuf *img);
gboolean image_effects_posterize(GdkPixbuf *img, int levels);
gboolean image_effects_emboss(GdkPixbuf *img);
gboolean image_effects_solarize(GdkPixbuf *img, int threshold);

gboolean image_effects_gaussian_blur(GdkPixbuf *img, int sigma);
gboolean image_effects_sharpen(GdkPixbuf *img, int amount);
gboolean image_effects_pixelate(GdkPixbuf *img, int block);
gboolean image_effects_oil_paint(GdkPixbuf *img, int brush);
gboolean image_effects_box_blur(GdkPixbuf *img, int radius);
gboolean image_effects_brightness_factor(GdkPixbuf *img, float factor);

/* 기하 변환 — 새 pixbuf 반환. */
GdkPixbuf *image_effects_resize(const GdkPixbuf *src, int w, int h);
GdkPixbuf *image_effects_rotate(const GdkPixbuf *src, double degrees);
GdkPixbuf *image_effects_flip_h(const GdkPixbuf *src);
GdkPixbuf *image_effects_flip_v(const GdkPixbuf *src);
GdkPixbuf *image_effects_crop(const GdkPixbuf *src, int x, int y, int w, int h);

typedef void (*ImageEffectsProgressFn)(int percent, const char *message,
                                       gpointer user_data);

/* 배경 제거: target RGB, tolerance 0..255, flood_from_edges. */
gboolean image_effects_remove_bg_color(GdkPixbuf *img,
                                     guint8 tr, guint8 tg, guint8 tb,
                                     int tolerance,
                                     ImageEffectsProgressFn progress,
                                     gpointer progress_data);
gboolean image_effects_remove_bg_flood(GdkPixbuf *img,
                                       guint8 tr, guint8 tg, guint8 tb,
                                       int tolerance,
                                       ImageEffectsProgressFn progress,
                                       gpointer progress_data);

#endif
