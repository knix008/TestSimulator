#include "score_verovio.h"
#include "paths.h"
#include "verovio/c_wrapper.h"

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <gdk/gdk.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

/* Must match the "scale" option passed to Verovio (see score_verovio_load). */
#define VEROVIO_SCORE_SCALE 50

/* Cap composite size to avoid multi‑GB surfaces on long scores (OOM / UI freeze). */
#define SCORE_MAX_SURFACE_HEIGHT 12000
#define SCORE_MAX_SURFACE_PIXELS ((size_t)12000 * 1800)

typedef struct {
    double t_sec;
    int    x;
    int    page;
} PlayheadPoint;

struct ScoreVerovio {
    GMutex lock;
    void *toolkit;
    int   page_count;
    int   page_width;
    int   surface_h;
    int   surface_w;
    char *converted_xml;
    char **page_svgs;
    int   *page_y;
    int   *page_w;
    int   *page_h;
    PlayheadPoint *playhead_map;
    int            playhead_map_n;
    int            playhead_map_cap;
    double         playhead_duration_sec;
};

static char *json_first_array_string(const char *json, const char *key);
static int json_int_field(const char *json, const char *key);
static gboolean note_x_in_svg(const char *svg, int pixel_w, const char *note_id, int *out_x);
static double svg_definition_scale_width(const char *svg);
static double svg_unit_to_pixel_scale(const char *svg, int pixel_w, int pixel_h);

/* Convert panel width (px) to Verovio pageWidth (MEI units), same as Qt binding. */
static int verovio_page_width_from_pixels(int width_px)
{
    if (width_px < 400)
        width_px = 400;
    return (int)((double)width_px * 100.0 / (double)VEROVIO_SCORE_SCALE);
}

static void flush_gdk_display(void)
{
    GdkDisplay *dpy = gdk_display_get_default();
    if (dpy)
        gdk_display_flush(dpy);
}

static void score_report_progress(ScoreProgressFn fn, gpointer user_data, int pct,
                                  const char *phase)
{
    if (!fn)
        return;
    if (pct < 0)
        pct = 0;
    if (pct > 100)
        pct = 100;
    fn(pct, phase ? phase : "", user_data);
}

static void *create_toolkit(GError **err)
{
    const char *res = paths_verovio_resources();
    void *tk = vrvToolkit_constructorResourcePath(res);
    if (!tk)
        tk = vrvToolkit_constructor();
    if (!tk) {
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                            "Verovio toolkit init failed (check resource path)");
        return NULL;
    }
    enableLog(false);
    vrvToolkit_setResourcePath(tk, res);
    return tk;
}

static char *path_for_script(const char *name)
{
    char exe[4096];
    ssize_t n = readlink("/proc/self/exe", exe, sizeof exe - 1);
    if (n <= 0)
        return g_strdup(name);
    exe[n] = '\0';
    char *slash = strrchr(exe, '/');
    if (slash)
        *slash = '\0';
    return g_strdup_printf("%s/scripts/%s", exe, name);
}

static char *convert_midi_to_musicxml(const char *midi_path, GError **err)
{
    char *script = path_for_script("midi-to-musicxml.py");
    char tmpl[] = "/tmp/midimaster_XXXXXX.musicxml";
    int fd = g_mkstemp(tmpl);
    if (fd < 0) {
        g_free(script);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                            "Cannot create temp MusicXML file");
        return NULL;
    }
    close(fd);

    char cmd[8192];
    snprintf(cmd, sizeof cmd, "python3 '%s' '%s' '%s' 2>&1", script, midi_path, tmpl);
    g_free(script);

    FILE *fp = popen(cmd, "r");
    if (!fp) {
        unlink(tmpl);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                            "Cannot run MIDI converter (python3)");
        return NULL;
    }

    char msg[1024] = {0};
    size_t len = fread(msg, 1, sizeof msg - 1, fp);
    int rc = pclose(fp);
    if (rc != 0) {
        unlink(tmpl);
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "MIDI→MusicXML conversion failed.\n"
                    "Install: pip install --user music21\n%s",
                    len > 0 ? msg : "");
        return NULL;
    }

    return g_strdup(tmpl);
}

static void strip_musicxml_titles(const char *musicxml_path)
{
    char *script = path_for_script("strip_musicxml_titles.py");
    char cmd[8192];
    snprintf(cmd, sizeof cmd, "python3 '%s' '%s' 2>/dev/null", script, musicxml_path);
    g_free(script);

    if (system(cmd) != 0) {
        /* Best-effort; Verovio still loads if strip script is missing. */
    }
}

void score_verovio_warmup_display(void)
{
    static int done;
    if (done)
        return;
    done = 1;

    flush_gdk_display();

    const char *probe =
        "<svg xmlns=\"http://www.w3.org/2000/svg\" "
        "xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"10\" height=\"10\">"
        "<defs><symbol id=\"t\" viewBox=\"0 0 10 10\">"
        "<path d=\"M0 0h10v10H0z\"/>"
        "</symbol></defs>"
        "<use xlink:href=\"#t\"/>"
        "</svg>";

    char tmpl[] = "/tmp/midimaster_warm_XXXXXX.svg";
    int fd = g_mkstemp(tmpl);
    if (fd < 0)
        return;
    ssize_t nw = write(fd, probe, (size_t)strlen(probe));
    if (nw < 0) {
        close(fd);
        unlink(tmpl);
        return;
    }
    close(fd);

    GError *err = NULL;
    GdkPixbuf *pb = gdk_pixbuf_new_from_file(tmpl, &err);
    unlink(tmpl);
    if (pb) {
        g_object_unref(pb);
        flush_gdk_display();
    } else {
        g_clear_error(&err);
    }
}

ScoreVerovio *score_verovio_new(void)
{
    GError *err = NULL;
    ScoreVerovio *s = g_new0(ScoreVerovio, 1);
    g_mutex_init(&s->lock);
    s->toolkit = create_toolkit(&err);
    if (!s->toolkit) {
        g_warning("%s", err ? err->message : "Verovio init failed");
        g_clear_error(&err);
        g_free(s);
        return NULL;
    }
    return s;
}

static void score_clear_page_cache(ScoreVerovio *score)
{
    if (!score)
        return;
    if (score->page_svgs) {
        for (int i = 0; i < score->page_count; i++)
            g_free(score->page_svgs[i]);
        g_free(score->page_svgs);
        score->page_svgs = NULL;
    }
    g_free(score->page_y);
    score->page_y = NULL;
    g_free(score->page_w);
    score->page_w = NULL;
    g_free(score->page_h);
    score->page_h = NULL;
    g_free(score->playhead_map);
    score->playhead_map = NULL;
    score->playhead_map_n = 0;
    score->playhead_map_cap = 0;
}

static void playhead_map_add(ScoreVerovio *score, double t_sec, int x, int page)
{
    if (score->playhead_map_n > 0) {
        PlayheadPoint *last = &score->playhead_map[score->playhead_map_n - 1];
        if (t_sec <= last->t_sec + 0.001)
            return;
    }
    if (score->playhead_map_n >= score->playhead_map_cap) {
        score->playhead_map_cap = score->playhead_map_cap < 64 ? 64 : score->playhead_map_cap * 2;
        score->playhead_map =
            g_realloc(score->playhead_map, (gsize)score->playhead_map_cap * sizeof(PlayheadPoint));
    }
    PlayheadPoint *pt = &score->playhead_map[score->playhead_map_n++];
    pt->t_sec = t_sec;
    pt->x = x;
    pt->page = page;
}

static double json_number_after_key_at(const char *pos, const char *key, const char **end)
{
    char needle[48];
    snprintf(needle, sizeof needle, "\"%s\":", key);
    const char *p = strstr(pos, needle);
    if (!p)
        return -1.0;
    p += strlen(needle);
    while (*p == ' ' || *p == '\t')
        p++;
    char *e = NULL;
    double v = strtod(p, &e);
    if (end)
        *end = e;
    return v;
}

static gboolean lookup_note_x_on_score(const ScoreVerovio *score, const char *note_id, int page_hint,
                                       int *x, int *page_out)
{
    if (!note_id || !note_id[0])
        return FALSE;

    if (page_hint > 0 && page_hint <= score->page_count && score->page_svgs[page_hint - 1]) {
        int pw = score->page_w[page_hint - 1] > 0 ? score->page_w[page_hint - 1] : score->surface_w;
        if (note_x_in_svg(score->page_svgs[page_hint - 1], pw, note_id, x)) {
            if (page_out)
                *page_out = page_hint - 1;
            return TRUE;
        }
    }

    for (int p = 0; p < score->page_count; p++) {
        if (!score->page_svgs[p])
            continue;
        int pw = score->page_w[p] > 0 ? score->page_w[p] : score->surface_w;
        if (note_x_in_svg(score->page_svgs[p], pw, note_id, x)) {
            if (page_out)
                *page_out = p;
            return TRUE;
        }
    }
    return FALSE;
}

static void playhead_page_rect(const ScoreVerovio *score, int page, int *y, int *h)
{
    if (page < 0)
        page = 0;
    if (page >= score->page_count)
        page = score->page_count > 0 ? score->page_count - 1 : 0;

    *y = score->page_y ? score->page_y[page] : 0;
    *h = score->page_h && score->page_h[page] > 0 ? score->page_h[page] : score->surface_h;
    if (*h < 1)
        *h = score->surface_h > 0 ? score->surface_h : 400;

    /* Extend past page margins so the playhead reads as one tall progress line. */
    int pad = *h / 5;
    if (pad < 48)
        pad = 48;
    *y -= pad;
    *h += pad * 2;
    if (*y < 0) {
        *h += *y;
        *y = 0;
    }
    if (score->surface_h > 0 && *y + *h > score->surface_h)
        *h = score->surface_h - *y;
}

static void svg_page_pixel_size(const char *svg, int page_width_px, int *out_w, int *out_h)
{
    int w = page_width_px > 0 ? page_width_px : 800;
    double units_w = svg_definition_scale_width(svg);
    double units_h = 0.0;

    const char *vb = strstr(svg, "viewBox=\"");
    if (vb) {
        double vx = 0, vy = 0, vw = 0, vh = 0;
        if (sscanf(vb, "viewBox=\"%lf %lf %lf %lf", &vx, &vy, &vw, &vh) >= 4 && vh > 1.0)
            units_h = vh;
    }
    if (units_h < 1.0)
        units_h = 28000.0;

    int h = 600;
    if (units_w > 1.0)
        h = (int)((double)w * units_h / units_w);
    if (h < 200)
        h = 200;

    if (out_w)
        *out_w = w;
    if (out_h)
        *out_h = h;
}

static void score_precompute_page_layout(ScoreVerovio *score)
{
    int composite_y = 0;
    const int gap = 8;

    for (int p = 0; p < score->page_count; p++) {
        const char *svg = score->page_svgs[p];
        if (!svg)
            continue;

        int pw = 0, ph = 0;
        svg_page_pixel_size(svg, score->page_width, &pw, &ph);
        score->page_y[p] = composite_y;
        score->page_w[p] = pw;
        score->page_h[p] = ph;
        composite_y += ph + gap;
    }
}

static void score_build_playhead_map(ScoreVerovio *score)
{
    score->playhead_map_n = 0;
    score_precompute_page_layout(score);

    const char *timemap = vrvToolkit_renderToTimemap(score->toolkit, "{\"includeMeasures\":true}");
    if (!timemap || !timemap[0])
        return;

    double max_t = 0.0;
    const char *cursor = timemap;
    while ((cursor = strstr(cursor, "\"tstamp\"")) != NULL) {
        const char *end = NULL;
        double t_raw = json_number_after_key_at(cursor, "tstamp", &end);
        if (t_raw < 0.0)
            break;
        if (t_raw > max_t)
            max_t = t_raw;
        cursor = end ? end : cursor + 8;
    }

    gboolean tstamp_is_ms = (max_t > 200.0);

    cursor = timemap;
    while ((cursor = strstr(cursor, "\"tstamp\"")) != NULL) {
        const char *end = NULL;
        double t_raw = json_number_after_key_at(cursor, "tstamp", &end);
        if (t_raw < 0.0)
            break;

        double t_sec = tstamp_is_ms ? t_raw / 1000.0 : t_raw;

        char *note_id = json_first_array_string(cursor, "on");
        if (!note_id)
            note_id = json_first_array_string(cursor, "chords");

        int x = 0, page = 0;
        if (note_id && lookup_note_x_on_score(score, note_id, 0, &x, &page))
            playhead_map_add(score, t_sec, x, page);

        g_free(note_id);
        cursor = end ? end : cursor + 8;
    }

    if (score->playhead_map_n > 0)
        score->playhead_duration_sec = score->playhead_map[score->playhead_map_n - 1].t_sec;
}

static void playhead_map_interp(const ScoreVerovio *score, double sec, int *x, int *page)
{
    int n = score->playhead_map_n;
    if (n < 1)
        return;

    if (sec <= score->playhead_map[0].t_sec) {
        *x = score->playhead_map[0].x;
        *page = score->playhead_map[0].page;
        return;
    }

    if (sec >= score->playhead_map[n - 1].t_sec) {
        *x = score->playhead_map[n - 1].x;
        *page = score->playhead_map[n - 1].page;
        return;
    }

    for (int i = 1; i < n; i++) {
        const PlayheadPoint *a = &score->playhead_map[i - 1];
        const PlayheadPoint *b = &score->playhead_map[i];
        if (sec > b->t_sec)
            continue;
        double span = b->t_sec - a->t_sec;
        double f = span > 0.0 ? (sec - a->t_sec) / span : 0.0;
        *x = (int)(a->x + f * (double)(b->x - a->x));
        *page = a->page == b->page ? a->page : (f < 0.5 ? a->page : b->page);
        return;
    }
}

void score_verovio_free(ScoreVerovio *score)
{
    if (!score)
        return;
    g_mutex_lock(&score->lock);
    score_clear_page_cache(score);
    if (score->converted_xml) {
        unlink(score->converted_xml);
        g_free(score->converted_xml);
        score->converted_xml = NULL;
    }
    if (score->toolkit) {
        vrvToolkit_destructor(score->toolkit);
        score->toolkit = NULL;
    }
    g_mutex_unlock(&score->lock);
    g_mutex_clear(&score->lock);
    g_free(score);
}

static gboolean score_verovio_cache_page_svgs(ScoreVerovio *score, ScoreProgressFn progress,
                                             gpointer progress_data)
{
    int pages = score->page_count;
    if (pages < 1)
        pages = 1;

    score->page_svgs = g_new0(char *, pages);
    score->page_y = g_new0(int, pages);
    score->page_w = g_new0(int, pages);
    score->page_h = g_new0(int, pages);

    for (int p = 1; p <= pages; p++) {
        const char *svg = vrvToolkit_renderToSVG(score->toolkit, p, false);
        if (svg && svg[0])
            score->page_svgs[p - 1] = g_strdup(svg);

        if (pages > 0) {
            int pct = 55 + (int)(30.0 * (double)p / (double)pages);
            score_report_progress(progress, progress_data, pct, "악보 SVG 생성 중…");
        }
    }

    score_report_progress(progress, progress_data, 88, "재생 위치 맵 생성 중…");
    score_build_playhead_map(score);
    score_report_progress(progress, progress_data, 92, NULL);
    return TRUE;
}

gboolean score_verovio_load(ScoreVerovio *score, const char *midi_path,
                            int page_width_px, ScoreProgressFn progress,
                            gpointer progress_data, GError **err)
{
    gboolean ok;

    g_return_val_if_fail(score && score->toolkit && midi_path, FALSE);

    g_mutex_lock(&score->lock);

    score_report_progress(progress, progress_data, 0, "악보 준비 중…");

    if (score->converted_xml) {
        unlink(score->converted_xml);
        g_free(score->converted_xml);
        score->converted_xml = NULL;
    }

    score->page_width = page_width_px;
    int verovio_pw = verovio_page_width_from_pixels(page_width_px);

    const char *load_path = midi_path;
    const char *input_from = "auto";

    if (g_str_has_suffix(midi_path, ".mid") || g_str_has_suffix(midi_path, ".midi")) {
        score_report_progress(progress, progress_data, 5, "MIDI → MusicXML 변환 중…");
        score->converted_xml = convert_midi_to_musicxml(midi_path, err);
        if (!score->converted_xml) {
            g_mutex_unlock(&score->lock);
            return FALSE;
        }
        load_path = score->converted_xml;
        input_from = "xml";
        score_report_progress(progress, progress_data, 28, NULL);
    }

    if (!vrvToolkit_setInputFrom(score->toolkit, input_from)) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "Verovio: unsupported input format: %s", input_from);
        g_mutex_unlock(&score->lock);
        return FALSE;
    }

    score_report_progress(progress, progress_data, 32, "MusicXML 정리 중…");
    strip_musicxml_titles(load_path);

    char opts[384];
    snprintf(opts, sizeof opts,
             "{\"pageWidth\":%d,\"adjustPageHeight\":true,\"breaks\":\"auto\","
             "\"scale\":%d,\"header\":\"none\",\"footer\":\"none\","
             "\"pageMarginLeft\":20,\"pageMarginRight\":20,"
             "\"smuflTextFont\":\"embedded\",\"font\":\"Leipzig\"}",
             verovio_pw, VEROVIO_SCORE_SCALE);

    score_report_progress(progress, progress_data, 38, "Verovio 악보 분석 중…");
    vrvToolkit_setOptions(score->toolkit, opts);

    if (!vrvToolkit_loadFile(score->toolkit, load_path)) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "Verovio cannot load: %s", load_path);
        g_mutex_unlock(&score->lock);
        return FALSE;
    }

    score_report_progress(progress, progress_data, 48, "악보 레이아웃 중…");
    vrvToolkit_redoLayout(score->toolkit, "");
    score->page_count = vrvToolkit_getPageCount(score->toolkit);
    if (score->page_count < 1)
        score->page_count = 1;
    score_clear_page_cache(score);

    ok = score_verovio_cache_page_svgs(score, progress, progress_data);
    g_mutex_unlock(&score->lock);
    return ok;
}

int score_verovio_page_count(const ScoreVerovio *score)
{
    return score ? score->page_count : 0;
}

static GdkPixbuf *svg_string_to_pixbuf(const char *svg, GError **err)
{
    char tmpl[] = "/tmp/midimaster_svg_XXXXXX.svg";
    int fd = g_mkstemp(tmpl);
    if (fd < 0) {
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                            "Cannot create temp SVG file");
        return NULL;
    }

    size_t len = strlen(svg);
    if (write(fd, svg, len) != (ssize_t)len) {
        close(fd);
        unlink(tmpl);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Cannot write SVG");
        return NULL;
    }
    close(fd);

    GError *load_err = NULL;
    GdkPixbuf *pb = gdk_pixbuf_new_from_file(tmpl, &load_err);
    unlink(tmpl);
    if (!pb) {
        if (err)
            g_propagate_error(err, load_err);
        else
            g_clear_error(&load_err);
        return NULL;
    }
    g_clear_error(&load_err);
    return pb;
}

static cairo_surface_t *svg_to_surface(const char *svg, double scale, int *w, int *h)
{
    GError *err = NULL;
    GdkPixbuf *pixbuf = svg_string_to_pixbuf(svg, &err);

    if (!pixbuf) {
        g_warning("SVG→Pixbuf: %s", err ? err->message : "unknown");
        g_clear_error(&err);
        return NULL;
    }

    int iw = gdk_pixbuf_get_width(pixbuf);
    int ih = gdk_pixbuf_get_height(pixbuf);
    if (iw < 1)
        iw = 800;
    if (ih < 1)
        ih = 200;

    int pw = (int)ceil(iw * scale);
    int ph = (int)ceil(ih * scale);
    if (pw < 1)
        pw = 1;
    if (ph < 1)
        ph = 1;

    cairo_surface_t *surface = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, pw, ph);
    cairo_t *cr = cairo_create(surface);
    cairo_set_source_rgb(cr, 1, 1, 1);
    cairo_paint(cr);

    if (fabs(scale - 1.0) > 0.01) {
        cairo_scale(cr, scale, scale);
        gdk_cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
    } else {
        gdk_cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
    }
    cairo_paint(cr);
    cairo_destroy(cr);
    cairo_surface_flush(surface);
    g_object_unref(pixbuf);

    if (w)
        *w = pw;
    if (h)
        *h = ph;
    return surface;
}

static const char *json_skip_ws(const char *p)
{
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')
        p++;
    return p;
}

static char *json_first_array_string(const char *json, const char *key)
{
    char keyneedle[64];
    snprintf(keyneedle, sizeof keyneedle, "\"%s\"", key);
    const char *p = json;
    while ((p = strstr(p, keyneedle)) != NULL) {
        p += strlen(keyneedle);
        p = json_skip_ws(p);
        if (*p != ':')
            continue;
        p++;
        p = json_skip_ws(p);
        if (*p != '[')
            continue;
        p++;
        p = json_skip_ws(p);
        if (*p != '"')
            continue;
        p++;
        const char *end = strchr(p, '"');
        if (!end)
            return NULL;
        return g_strndup(p, (gsize)(end - p));
    }
    return NULL;
}

static int json_int_field(const char *json, const char *key)
{
    char needle[64];
    snprintf(needle, sizeof needle, "\"%s\":", key);
    const char *p = strstr(json, needle);
    if (!p)
        return -1;
    p += strlen(needle);
    return (int)strtol(p, NULL, 10);
}

static double svg_root_width_units(const char *svg)
{
    const char *root = strstr(svg, "<svg ");
    if (!root)
        return 0.0;

    const char *limit = root + 1200;
    for (const char *p = root; p < limit && *p; p++) {
        if (strncmp(p, "width=\"", 7) != 0)
            continue;
        double w = 0.0;
        if (sscanf(p + 7, "%lf", &w) == 1 && w > 1.0)
            return w;
    }

    const char *vb = strstr(root, "viewBox=\"");
    if (!vb || vb > limit)
        vb = strstr(svg, "viewBox=\"");
    if (vb) {
        double vx = 0, vy = 0, vw = 0, vh = 0;
        if (sscanf(vb, "viewBox=\"%lf %lf %lf %lf", &vx, &vy, &vw, &vh) >= 4 && vw > 1.0)
            return vw;
    }
    return 0.0;
}

static double svg_definition_scale_width(const char *svg)
{
    const char *ds = strstr(svg, "definition-scale");
    if (ds) {
        const char *vb = strstr(ds, "viewBox=\"");
        if (vb && vb < ds + 400) {
            double vx = 0, vy = 0, vw = 0, vh = 0;
            if (sscanf(vb, "viewBox=\"%lf %lf %lf %lf", &vx, &vy, &vw, &vh) >= 4 && vw > 1.0)
                return vw;
        }
    }
    return svg_root_width_units(svg);
}

static double svg_unit_to_pixel_scale(const char *svg, int pixel_w, int pixel_h)
{
    double units = svg_definition_scale_width(svg);
    if (units > 1.0)
        return (double)pixel_w / units;
    (void)pixel_h;
    return (double)pixel_w / 20000.0;
}

static gboolean parse_use_xy_near(const char *pos, int *out_x, int *out_y)
{
    if (!pos)
        return FALSE;
    const char *limit = pos + 2000;
    for (const char *p = pos; p < limit && *p; p++) {
        if (strncmp(p, "<use ", 5) != 0 && strncmp(p, "<use>", 5) != 0)
            continue;
        const char *xp = strstr(p, "x=\"");
        const char *yp = strstr(p, "y=\"");
        if (!xp || !yp || xp > p + 300 || yp > p + 300)
            continue;
        int x = 0, y = 0;
        if (sscanf(xp + 3, "%d", &x) == 1 && sscanf(yp + 3, "%d", &y) == 1) {
            *out_x = x;
            *out_y = y;
            return TRUE;
        }
    }
    return FALSE;
}

static gboolean parse_translate_near(const char *pos, int *out_x, int *out_y)
{
    if (!pos)
        return FALSE;

    const char *start = pos;
    if (pos > start + 4000)
        start = pos - 4000;

    const char *best = NULL;
    for (const char *p = pos; p >= start; p--) {
        if (strncmp(p, "transform=\"translate(", 22) == 0) {
            best = p + 22;
            break;
        }
    }
    if (!best) {
        for (const char *p = pos; p < pos + 2000 && *p; p++) {
            if (strncmp(p, "transform=\"translate(", 22) == 0) {
                best = p + 22;
                break;
            }
        }
    }
    if (!best)
        return FALSE;

    int x = 0, y = 0;
    if (sscanf(best, "%d,%d", &x, &y) == 2 || sscanf(best, "%d %d", &x, &y) == 2) {
        *out_x = x;
        *out_y = y;
        return TRUE;
    }
    return FALSE;
}

static gboolean note_x_in_svg(const char *svg, int pixel_w, const char *note_id, int *out_x)
{
    if (!svg || !note_id || !note_id[0])
        return FALSE;

    char *id_attr = g_strdup_printf("id=\"%s\"", note_id);
    const char *hit = strstr(svg, id_attr);
    g_free(id_attr);
    if (!hit)
        return FALSE;

    int note_x = 0, note_y = 0;
    if (!parse_translate_near(hit, &note_x, &note_y) && !parse_use_xy_near(hit, &note_x, &note_y))
        return FALSE;

    double scale = svg_unit_to_pixel_scale(svg, pixel_w, 0);
    *out_x = (int)(note_x * scale);
    return TRUE;
}

static double score_fit_render_scale(ScoreVerovio *score, double scale)
{
    if (!score || score->page_count < 1)
        return scale;

    score_precompute_page_layout(score);
    int total_h = 0;
    for (int p = 0; p < score->page_count; p++) {
        int y = score->page_y ? score->page_y[p] : 0;
        int h = score->page_h ? score->page_h[p] : 0;
        int bottom = y + h;
        if (bottom > total_h)
            total_h = bottom;
    }

    if (total_h > SCORE_MAX_SURFACE_HEIGHT && total_h > 0) {
        scale *= (double)SCORE_MAX_SURFACE_HEIGHT / (double)total_h;
        if (scale < 0.15)
            scale = 0.15;
    }
    return scale;
}

struct ScoreRenderJob {
    ScoreVerovio     *score;
    double            scale;
    double            composite_scale;
    ScoreProgressFn   progress;
    gpointer          progress_data;
    int               pages;
    int               next_page;
    int               paint_page;
    int               layout_y;
    int               page_total;
    cairo_surface_t **page_surfaces;
    cairo_surface_t  *composite;
    cairo_t          *composite_cr;
    int               total_w;
    int               total_h;
    gboolean          composite_ready;
    gboolean          finished;
    gboolean          failed;
};

static void score_job_measure_pages(ScoreRenderJob *job, int *out_w, int *out_h, int *out_count)
{
    const int gap = 8;
    int total_w = 0;
    int total_h = 0;
    int page_total = 0;

    for (int p = 0; p < job->pages; p++) {
        cairo_surface_t *page = job->page_surfaces[p];
        if (!page)
            continue;
        page_total++;
        int w = cairo_image_surface_get_width(page);
        int h = cairo_image_surface_get_height(page);
        if (w > total_w)
            total_w = w;
        total_h += h + gap;
    }

    if (out_w)
        *out_w = total_w > 0 ? total_w : 800;
    if (out_h)
        *out_h = total_h > 0 ? total_h : 600;
    if (out_count)
        *out_count = page_total;
}

static gboolean score_composite_begin(ScoreVerovio *score, ScoreRenderJob *job, GError **err)
{
    int src_w = 0, src_h = 0;
    score_job_measure_pages(job, &src_w, &src_h, &job->page_total);
    if (job->page_total < 1) {
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "No score pages to display");
        return FALSE;
    }

    job->composite_scale = 1.0;
    size_t pixels = (size_t)src_w * (size_t)src_h;
    if (pixels > SCORE_MAX_SURFACE_PIXELS) {
        job->composite_scale = sqrt((double)SCORE_MAX_SURFACE_PIXELS / (double)pixels);
        if (job->composite_scale < 0.05)
            job->composite_scale = 0.05;
    }

    job->total_w = (int)ceil((double)src_w * job->composite_scale);
    job->total_h = (int)ceil((double)src_h * job->composite_scale);
    if (job->total_w < 1)
        job->total_w = 1;
    if (job->total_h < 1)
        job->total_h = 1;

    job->composite = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, job->total_w, job->total_h);
    if (cairo_surface_status(job->composite) != CAIRO_STATUS_SUCCESS) {
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                            "Score image allocation failed (score too large)");
        return FALSE;
    }

    job->composite_cr = cairo_create(job->composite);
    cairo_set_source_rgb(job->composite_cr, 1, 1, 1);
    cairo_paint(job->composite_cr);
    if (fabs(job->composite_scale - 1.0) > 0.001)
        cairo_scale(job->composite_cr, job->composite_scale, job->composite_scale);

    job->layout_y = 0;
    job->paint_page = 0;
    job->composite_ready = TRUE;
    score->surface_w = job->total_w;
    score->surface_h = job->total_h;
    return TRUE;
}

static gboolean score_composite_paint_next(ScoreRenderJob *job)
{
    const int gap = 8;
    ScoreVerovio *score = job->score;

    while (job->paint_page < job->pages) {
        int p = job->paint_page++;
        cairo_surface_t *page = job->page_surfaces[p];
        if (!page)
            continue;

        int w = cairo_image_surface_get_width(page);
        int h = cairo_image_surface_get_height(page);
        score->page_y[p] = job->layout_y;
        score->page_w[p] = (int)ceil((double)w * job->composite_scale);
        score->page_h[p] = (int)ceil((double)h * job->composite_scale);

        cairo_set_source_surface(job->composite_cr, page, 0, job->layout_y);
        cairo_paint(job->composite_cr);
        job->layout_y += h + gap;

        int painted = 0;
        for (int i = 0; i < job->paint_page; i++) {
            if (job->page_surfaces[i])
                painted++;
        }
        int pct = 99;
        if (job->page_total > 0) {
            pct = 98 + (int)(1.0 * (double)painted / (double)job->page_total);
            if (pct > 99)
                pct = 99;
        }
        score_report_progress(job->progress, job->progress_data, pct, "악보 합치는 중…");
        return TRUE;
    }
    return FALSE;
}

static void score_composite_finish(ScoreRenderJob *job)
{
    if (job->composite_cr) {
        cairo_destroy(job->composite_cr);
        job->composite_cr = NULL;
    }
    if (job->composite)
        cairo_surface_flush(job->composite);
}

ScoreRenderJob *score_verovio_render_job_new(ScoreVerovio *score, double scale,
                                             ScoreProgressFn progress,
                                             gpointer progress_data)
{
    if (!score || !score->toolkit)
        return NULL;
    if (scale < 0.5)
        scale = 0.5;
    if (scale > 3.0)
        scale = 3.0;

    g_mutex_lock(&score->lock);

    int pages = score->page_count;
    if (pages < 1)
        pages = 1;

    if (!score->page_svgs) {
        score_clear_page_cache(score);
        if (!score_verovio_cache_page_svgs(score, progress, progress_data)) {
            g_mutex_unlock(&score->lock);
            return NULL;
        }
    }

    scale = score_fit_render_scale(score, scale);
    score_report_progress(progress, progress_data, 93, "화면에 표시 중…");

    ScoreRenderJob *job = g_new0(ScoreRenderJob, 1);
    job->score = score;
    job->scale = scale;
    job->progress = progress;
    job->progress_data = progress_data;
    job->pages = pages;
    job->page_surfaces = g_new0(cairo_surface_t *, pages);
    g_mutex_unlock(&score->lock);
    return job;
}

gboolean score_verovio_render_job_step(ScoreRenderJob *job, GError **err)
{
    if (!job || job->finished || job->failed)
        return FALSE;

    ScoreVerovio *score = job->score;
    g_mutex_lock(&score->lock);

    while (job->next_page < job->pages) {
        int p = job->next_page++;
        const char *svg = score->page_svgs[p];
        if (!svg)
            continue;

        int w = 0, h = 0;
        cairo_surface_t *page = svg_to_surface(svg, job->scale, &w, &h);
        if (!page) {
            if (err)
                g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                                    "SVG page rasterization failed (check librsvg2-common)");
            job->failed = TRUE;
            g_mutex_unlock(&score->lock);
            return FALSE;
        }
        job->page_surfaces[p] = page;

        int page_total = 0;
        for (int i = 0; i <= p; i++) {
            if (job->page_surfaces[i])
                page_total++;
        }
        int pct = 93 + (int)(5.0 * (double)page_total / (double)job->pages);
        if (pct > 98)
            pct = 98;
        score_report_progress(job->progress, job->progress_data, pct, "화면에 표시 중…");
        g_mutex_unlock(&score->lock);
        return TRUE;
    }

    if (!job->composite_ready) {
        if (!score_composite_begin(score, job, err)) {
            job->failed = TRUE;
            g_mutex_unlock(&score->lock);
            return FALSE;
        }
        g_mutex_unlock(&score->lock);
        return TRUE;
    }

    if (score_composite_paint_next(job)) {
        g_mutex_unlock(&score->lock);
        return TRUE;
    }

    score_composite_finish(job);
    score_report_progress(job->progress, job->progress_data, 100, "완료");
    job->finished = TRUE;
    g_mutex_unlock(&score->lock);
    return FALSE;
}

cairo_surface_t *score_verovio_render_job_take_surface(ScoreRenderJob *job, int *out_w, int *out_h)
{
    if (!job || !job->composite)
        return NULL;
    if (out_w)
        *out_w = job->total_w;
    if (out_h)
        *out_h = job->total_h;
    cairo_surface_t *surface = job->composite;
    job->composite = NULL;
    return surface;
}

void score_verovio_render_job_free(ScoreRenderJob *job)
{
    if (!job)
        return;
    if (job->composite_cr) {
        cairo_destroy(job->composite_cr);
        job->composite_cr = NULL;
    }
    if (job->page_surfaces) {
        for (int p = 0; p < job->pages; p++) {
            if (job->page_surfaces[p])
                cairo_surface_destroy(job->page_surfaces[p]);
        }
        g_free(job->page_surfaces);
    }
    if (job->composite)
        cairo_surface_destroy(job->composite);
    g_free(job);
}

cairo_surface_t *score_verovio_render_surface(ScoreVerovio *score, double scale,
                                              int *out_w, int *out_h,
                                              ScoreProgressFn progress,
                                              gpointer progress_data)
{
    ScoreRenderJob *job = score_verovio_render_job_new(score, scale, progress, progress_data);
    if (!job)
        return NULL;

    GError *err = NULL;
    while (score_verovio_render_job_step(job, &err))
        ;
    g_clear_error(&err);

    cairo_surface_t *composite = score_verovio_render_job_take_surface(job, out_w, out_h);
    score_verovio_render_job_free(job);
    return composite;
}

gboolean score_verovio_playhead_at_time(const ScoreVerovio *score, double current_sec,
                                        double duration_sec, int *out_x, int *out_y,
                                        int *out_h)
{
    int x = 0, y = 0, h = 180, page = 0;
    gboolean result = FALSE;

    if (!score || !score->toolkit || duration_sec <= 0.0
        || score->surface_w < 1 || score->surface_h < 1)
        return FALSE;

    if (current_sec < 0.0)
        current_sec = 0.0;
    if (current_sec > duration_sec)
        current_sec = duration_sec;

    g_mutex_lock(&((ScoreVerovio *)score)->lock);

    if (score->playhead_map_n > 0) {
        double map_sec = current_sec;
        if (score->playhead_duration_sec > 0.01 && duration_sec > 0.01
            && fabs(score->playhead_duration_sec - duration_sec) > 0.25)
            map_sec = current_sec * score->playhead_duration_sec / duration_sec;
        playhead_map_interp(score, map_sec, &x, &page);
        playhead_page_rect(score, page, &y, &h);
    } else {
        int ms = (int)(current_sec * 1000.0);
        const char *json = vrvToolkit_getElementsAtTime(score->toolkit, ms);
        char *note_id = json ? json_first_array_string(json, "notes") : NULL;
        if (!note_id && json)
            note_id = json_first_array_string(json, "chords");
        int page_hint = json ? json_int_field(json, "page") : -1;

        if (note_id && lookup_note_x_on_score(score, note_id, page_hint, &x, &page))
            playhead_page_rect(score, page, &y, &h);
        else {
            double t = current_sec / duration_sec;
            x = (int)(t * (double)score->surface_w * 0.85);
            if (x < 80)
                x = 80;
            page = score->page_count > 0 ? (int)(t * (double)score->page_count) : 0;
            if (page >= score->page_count)
                page = score->page_count - 1;
            playhead_page_rect(score, page, &y, &h);
        }
        g_free(note_id);
    }

    if (out_x)
        *out_x = x;
    if (out_y)
        *out_y = y;
    if (out_h)
        *out_h = h;
    result = TRUE;

    g_mutex_unlock(&((ScoreVerovio *)score)->lock);
    return result;
}
