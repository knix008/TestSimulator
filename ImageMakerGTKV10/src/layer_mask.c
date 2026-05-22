#include "layer_mask.h"

#include <gdk/gdk.h>
#include <glib.h>
#include <math.h>
#include <string.h>

#ifndef G_PI
#define G_PI 3.14159265358979323846
#endif

/* RGB 거리 제곱 허용치 (채널당 약 42) */
#define COLOR_TOL_SQ (42 * 42 * 3)

/* flood fill용 ROI 상한 (픽셀 수, 메모리·시간) */
#define MAX_FLOOD_PIXELS ((gsize)4 * 1024 * 1024)
/* 전체 이미지 마스크 상한 (캔버스 최대 8192×8192) */
#define MAX_IMAGE_MASK_PIXELS ((gsize)8192 * 8192)

static gboolean *alloc_mask_array(gsize count) {
    if (count == 0 || count > MAX_FLOOD_PIXELS)
        return NULL;
    return g_new0(gboolean, count);
}

static gboolean *alloc_image_mask(int width, int height) {
    gsize count = (gsize)width * (gsize)height;
    if (count == 0 || count > MAX_IMAGE_MASK_PIXELS)
        return NULL;
    return g_new0(gboolean, count);
}

gboolean layer_has_selection(const Layer *layer) {
    return layer && layer->selections != NULL;
}

static inline const guchar *pixel_at(const guchar *pixels, int stride, int channels,
                                     int x, int y) {
    return pixels + y * stride + x * channels;
}

static inline int color_dist_sq(const guchar *a, const guchar *b) {
    int dr = (int)a[0] - (int)b[0];
    int dg = (int)a[1] - (int)b[1];
    int db = (int)a[2] - (int)b[2];
    return dr * dr + dg * dg + db * db;
}

static void compute_border_mean(const guchar *pixels, int stride, int channels,
                                const SelectionRect *r, guchar mean[3]) {
    guint64 sr = 0, sg = 0, sb = 0;
    guint count = 0;
    int x0 = r->x;
    int y0 = r->y;
    int x1 = r->x + r->width;
    int y1 = r->y + r->height;

    for (int x = x0; x < x1; x++) {
        const guchar *top = pixel_at(pixels, stride, channels, x, y0);
        const guchar *bot = pixel_at(pixels, stride, channels, x, y1 - 1);
        sr += top[0] + bot[0];
        sg += top[1] + bot[1];
        sb += top[2] + bot[2];
        count += 2;
    }
    for (int y = y0 + 1; y < y1 - 1; y++) {
        const guchar *left = pixel_at(pixels, stride, channels, x0, y);
        const guchar *right = pixel_at(pixels, stride, channels, x1 - 1, y);
        sr += left[0] + right[0];
        sg += left[1] + right[1];
        sb += left[2] + right[2];
        count += 2;
    }

    if (count == 0) {
        mean[0] = mean[1] = mean[2] = 0;
        return;
    }
    mean[0] = (guchar)(sr / count);
    mean[1] = (guchar)(sg / count);
    mean[2] = (guchar)(sb / count);
}

typedef struct {
    int x;
    int y;
} Point;

/* ROI 내부: 테두리와 색이 비슷한 연결 영역 = 배경 */
static void flood_background(const guchar *pixels, int stride, int channels,
                             const SelectionRect *r, const guchar border_mean[3],
                             gboolean *is_bg) {
    int roi_w = r->width;
    int roi_h = r->height;
    int x0 = r->x;
    int y0 = r->y;
    int x1 = x0 + roi_w;
    int y1 = y0 + roi_h;

    gsize area = (gsize)roi_w * (gsize)roi_h;
    gboolean *visited = alloc_mask_array(area);
    if (!visited)
        return;
    GArray *queue = g_array_new(FALSE, FALSE, sizeof(Point));

    for (int x = x0; x < x1; x++) {
        int ys[] = {y0, y1 - 1};
        for (int i = 0; i < 2; i++) {
            int y = ys[i];
            int lx = x - x0;
            int ly = y - y0;
            int idx = ly * roi_w + lx;
            if (visited[idx])
                continue;
            const guchar *p = pixel_at(pixels, stride, channels, x, y);
            if (color_dist_sq(p, border_mean) > COLOR_TOL_SQ)
                continue;
            visited[idx] = TRUE;
            is_bg[idx] = TRUE;
            Point pt = {x, y};
            g_array_append_val(queue, pt);
        }
    }
    for (int y = y0 + 1; y < y1 - 1; y++) {
        int xs[] = {x0, x1 - 1};
        for (int i = 0; i < 2; i++) {
            int x = xs[i];
            int lx = x - x0;
            int ly = y - y0;
            int idx = ly * roi_w + lx;
            if (visited[idx])
                continue;
            const guchar *p = pixel_at(pixels, stride, channels, x, y);
            if (color_dist_sq(p, border_mean) > COLOR_TOL_SQ)
                continue;
            visited[idx] = TRUE;
            is_bg[idx] = TRUE;
            Point pt = {x, y};
            g_array_append_val(queue, pt);
        }
    }

    static const int dx[] = {1, -1, 0, 0};
    static const int dy[] = {0, 0, 1, -1};

    for (guint qi = 0; qi < queue->len; qi++) {
        Point cur = g_array_index(queue, Point, qi);
        const guchar *cur_px = pixel_at(pixels, stride, channels, cur.x, cur.y);

        for (int d = 0; d < 4; d++) {
            int nx = cur.x + dx[d];
            int ny = cur.y + dy[d];
            if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1)
                continue;

            int lx = nx - x0;
            int ly = ny - y0;
            int idx = ly * roi_w + lx;
            if (visited[idx])
                continue;

            const guchar *np = pixel_at(pixels, stride, channels, nx, ny);
            if (color_dist_sq(np, cur_px) > COLOR_TOL_SQ &&
                color_dist_sq(np, border_mean) > COLOR_TOL_SQ)
                continue;

            visited[idx] = TRUE;
            is_bg[idx] = TRUE;
            Point pt = {nx, ny};
            g_array_append_val(queue, pt);
        }
    }

    g_array_free(queue, TRUE);
    g_free(visited);
}

/* ROI 내부: 중심과 색이 비슷한 연결 영역 = 전경 후보 */
static void flood_foreground(const guchar *pixels, int stride, int channels,
                             const SelectionRect *r, const guchar *seed_color,
                             gboolean *is_fg) {
    int roi_w = r->width;
    int roi_h = r->height;
    int x0 = r->x;
    int y0 = r->y;
    int x1 = x0 + roi_w;
    int y1 = y0 + roi_h;
    int cx = x0 + roi_w / 2;
    int cy = y0 + roi_h / 2;

    gsize area = (gsize)roi_w * (gsize)roi_h;
    gboolean *visited = alloc_mask_array(area);
    if (!visited)
        return;
    GArray *queue = g_array_new(FALSE, FALSE, sizeof(Point));

    int lx = cx - x0;
    int ly = cy - y0;
    visited[ly * roi_w + lx] = TRUE;
    is_fg[ly * roi_w + lx] = TRUE;
    Point start = {cx, cy};
    g_array_append_val(queue, start);

    static const int dx[] = {1, -1, 0, 0};
    static const int dy[] = {0, 0, 1, -1};

    for (guint qi = 0; qi < queue->len; qi++) {
        Point cur = g_array_index(queue, Point, qi);

        for (int d = 0; d < 4; d++) {
            int nx = cur.x + dx[d];
            int ny = cur.y + dy[d];
            if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1)
                continue;

            int nlx = nx - x0;
            int nly = ny - y0;
            int idx = nly * roi_w + nlx;
            if (visited[idx])
                continue;

            const guchar *np = pixel_at(pixels, stride, channels, nx, ny);
            if (color_dist_sq(np, seed_color) > COLOR_TOL_SQ)
                continue;

            visited[idx] = TRUE;
            is_fg[idx] = TRUE;
            Point pt = {nx, ny};
            g_array_append_val(queue, pt);
        }
    }

    g_array_free(queue, TRUE);
    g_free(visited);
}

static void segment_rect_fallback(const SelectionRect *r, gboolean *object_mask,
                                int img_w, int img_h) {
    for (int ly = 0; ly < r->height; ly++) {
        for (int lx = 0; lx < r->width; lx++) {
            int gx = r->x + lx;
            int gy = r->y + ly;
            if (gx >= 0 && gx < img_w && gy >= 0 && gy < img_h)
                object_mask[gy * img_w + gx] = TRUE;
        }
    }
}

/* 선택 사각형 안에서 객체(전경) 마스크 산출 */
static void segment_object_in_rect(const guchar *pixels, int stride, int channels,
                                   const SelectionRect *r, gboolean *object_mask,
                                   int img_w, int img_h) {
    int roi_w = r->width;
    int roi_h = r->height;
    gsize roi_pixels = (gsize)roi_w * (gsize)roi_h;

    if (roi_pixels == 0 || roi_pixels > MAX_FLOOD_PIXELS) {
        segment_rect_fallback(r, object_mask, img_w, img_h);
        return;
    }

    gboolean *is_bg = alloc_mask_array(roi_pixels);
    gboolean *is_fg = alloc_mask_array(roi_pixels);
    if (!is_bg || !is_fg) {
        g_free(is_bg);
        g_free(is_fg);
        segment_rect_fallback(r, object_mask, img_w, img_h);
        return;
    }

    guchar border_mean[3];
    compute_border_mean(pixels, stride, channels, r, border_mean);
    flood_background(pixels, stride, channels, r, border_mean, is_bg);

    int cx = r->x + roi_w / 2;
    int cy = r->y + roi_h / 2;
    const guchar *seed = pixel_at(pixels, stride, channels, cx, cy);
    flood_foreground(pixels, stride, channels, r, seed, is_fg);

    guint fg_count = 0;
    guint obj_count = 0;

    for (gsize i = 0; i < roi_pixels; i++) {
        if (is_fg[i])
            fg_count++;
        if (is_fg[i] && !is_bg[i])
            obj_count++;
    }

    /* 객체가 테두리에 닿아 배경 침식이 심할 때: 중심 연결 전경만 사용 */
    gboolean use_fg_only =
        (obj_count < (guint)(roi_pixels / 20)) && fg_count > 0;

    for (int ly = 0; ly < roi_h; ly++) {
        for (int lx = 0; lx < roi_w; lx++) {
            int idx = ly * roi_w + lx;
            gboolean is_object =
                use_fg_only ? is_fg[idx] : (is_fg[idx] && !is_bg[idx]);
            if (!is_object)
                continue;
            int gx = r->x + lx;
            int gy = r->y + ly;
            if (gx >= 0 && gx < img_w && gy >= 0 && gy < img_h)
                object_mask[gy * img_w + gx] = TRUE;
        }
    }

    g_free(is_bg);
    g_free(is_fg);
}

GdkPixbuf *layer_selection_extract_pixbuf(const Layer *layer, const SelectionRect *selection,
                                          int *out_w, int *out_h) {
    if (!layer || !layer->pixbuf || !selection)
        return NULL;

    GdkPixbuf *src = layer->pixbuf;
    int width = gdk_pixbuf_get_width(src);
    int height = gdk_pixbuf_get_height(src);
    int src_stride = gdk_pixbuf_get_rowstride(src);
    const guchar *src_pixels = gdk_pixbuf_get_pixels(src);
    int src_channels = gdk_pixbuf_get_n_channels(src);
    gboolean src_has_alpha = gdk_pixbuf_get_has_alpha(src);

    gboolean *object_mask = alloc_image_mask(width, height);
    if (!object_mask)
        return NULL;

    segment_object_in_rect(src_pixels, src_stride, src_channels, selection,
                           object_mask, width, height);

    int min_x = width, min_y = height, max_x = -1, max_y = -1;
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            if (!object_mask[y * width + x])
                continue;
            if (x < min_x)
                min_x = x;
            if (y < min_y)
                min_y = y;
            if (x > max_x)
                max_x = x;
            if (y > max_y)
                max_y = y;
        }
    }

    if (max_x < min_x || max_y < min_y) {
        g_free(object_mask);
        return NULL;
    }

    int crop_w = max_x - min_x + 1;
    int crop_h = max_y - min_y + 1;

    GdkPixbuf *out = gdk_pixbuf_new(GDK_COLORSPACE_RGB, TRUE, 8, crop_w, crop_h);
    if (!out) {
        g_free(object_mask);
        return NULL;
    }
    int out_stride = gdk_pixbuf_get_rowstride(out);
    guchar *out_pixels = gdk_pixbuf_get_pixels(out);
    if (!out_pixels) {
        g_object_unref(out);
        g_free(object_mask);
        return NULL;
    }

    for (int y = 0; y < crop_h; y++) {
        for (int x = 0; x < crop_w; x++) {
            int sx = min_x + x;
            int sy = min_y + y;
            guchar *dst = out_pixels + y * out_stride + x * 4;
            const guchar *sp = src_pixels + sy * src_stride + sx * src_channels;

            dst[0] = sp[0];
            dst[1] = sp[1];
            dst[2] = sp[2];
            if (object_mask[sy * width + sx]) {
                if (src_has_alpha && src_channels == 4)
                    dst[3] = sp[3];
                else
                    dst[3] = 255;
            } else {
                dst[3] = 0;
            }
        }
    }

    g_free(object_mask);

    if (out_w)
        *out_w = crop_w;
    if (out_h)
        *out_h = crop_h;
    return out;
}

void layer_selection_draw(cairo_t *cr, const Layer *layer, const SelectionRect *selection,
                          double opacity) {
    int nw = 0, nh = 0;
    GdkPixbuf *obj = layer_selection_extract_pixbuf(layer, selection, &nw, &nh);
    if (!obj || nw <= 0 || nh <= 0) {
        g_clear_object(&obj);
        return;
    }

    double cx = selection->place_x + selection->place_w / 2.0;
    double cy = selection->place_y + selection->place_h / 2.0;
    double sx = (double)selection->place_w / nw;
    double sy = (double)selection->place_h / nh;

    cairo_save(cr);
    cairo_translate(cr, cx, cy);
    cairo_rotate(cr, selection->place_angle * G_PI / 180.0);
    cairo_scale(cr, sx, sy);
    gdk_cairo_set_source_pixbuf(cr, obj, -nw / 2.0, -nh / 2.0);
    cairo_paint_with_alpha(cr, opacity);
    cairo_restore(cr);
    g_object_unref(obj);
}
