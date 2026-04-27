/**
 * CaptureMaster - Capture Module
 *
 * Linux/Wayland: XDG ScreenCast Portal  +  PipeWire (one-frame capture)
 * Linux/X11:     GDK root-window fallback
 * macOS:         Core Graphics (CGDisplayCreateImage)
 */

/* PipeWire/SPA headers need locale_t (POSIX.1-2008) */
#define _GNU_SOURCE

#include "capture.h"
#include "utils.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <gdk/gdk.h>
#include <gdk-pixbuf/gdk-pixbuf.h>
#include <gtk/gtk.h>
#include <glib/gstdio.h>
#ifdef GDK_WINDOWING_WAYLAND
#include <gdk/gdkwayland.h>
#endif

#ifdef __linux__
#include <sys/mman.h>
#include <gio/gio.h>
#include <pipewire/pipewire.h>
#include <spa/param/video/format-utils.h>
#include <spa/pod/builder.h>
#include <spa/utils/result.h>
#endif

#ifdef __APPLE__
#include <CoreGraphics/CoreGraphics.h>
#endif

/* ─────────────────────────── error buffer ─────────────────────────── */

static char error_buffer[512] = {0};

static void set_error(const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(error_buffer, sizeof(error_buffer), fmt, ap);
    va_end(ap);
    utils_log_error("%s", error_buffer);
}

/* ─────────────────────── public lifecycle ──────────────────────────── */

bool capture_init(void) {
    if (!gdk_init_check(NULL, NULL)) {
        set_error("Failed to initialize GDK");
        return false;
    }
    utils_log_info("Capture system initialized");
    return true;
}

void capture_cleanup(void) {
    utils_log_info("Capture system cleaned up");
}

const char* capture_get_platform(void) {
#ifdef __APPLE__
    return "macOS";
#elif __linux__
    return "Linux";
#else
    return "Unknown";
#endif
}

bool capture_is_supported(void) {
#if defined(__APPLE__) || defined(__linux__)
    return true;
#else
    return false;
#endif
}

const char* capture_get_last_error(void) {
    return error_buffer[0] ? error_buffer : "No error";
}

/* ─────────────────────── GdkPixbuf → ImageData ─────────────────────── */

static ImageData* pixbuf_to_imagedata(GdkPixbuf *pixbuf) {
    ImageData *img = (ImageData*)utils_malloc(sizeof(ImageData));
    if (!img) return NULL;

    img->width    = gdk_pixbuf_get_width(pixbuf);
    img->height   = gdk_pixbuf_get_height(pixbuf);
    img->channels = gdk_pixbuf_get_n_channels(pixbuf);

    int    rowstride = gdk_pixbuf_get_rowstride(pixbuf);
    guchar *pixels   = gdk_pixbuf_get_pixels(pixbuf);

    img->size = (size_t)img->height * img->width * img->channels;
    img->data = (uint8_t*)utils_malloc(img->size);
    if (!img->data) { utils_free(img); return NULL; }

    for (int y = 0; y < img->height; y++) {
        memcpy(img->data + y * img->width * img->channels,
               pixels    + y * rowstride,
               img->width * img->channels);
    }
    return img;
}

/* ──────────────────────── crop helper ─────────────────────────────── */

static ImageData* crop_image(const ImageData *src,
                              int x, int y, int w, int h) {
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > src->width)  w = src->width  - x;
    if (y + h > src->height) h = src->height - y;
    if (w <= 0 || h <= 0) return NULL;

    ImageData *dst = (ImageData*)utils_malloc(sizeof(ImageData));
    if (!dst) return NULL;

    dst->width    = w;
    dst->height   = h;
    dst->channels = src->channels;
    dst->size     = (size_t)w * h * src->channels;
    dst->data     = (uint8_t*)utils_malloc(dst->size);
    if (!dst->data) { utils_free(dst); return NULL; }

    for (int row = 0; row < h; row++) {
        memcpy(dst->data + row * w * src->channels,
               src->data + (y + row) * src->width * src->channels
                         + x * src->channels,
               w * src->channels);
    }
    return dst;
}

/* ═══════════════════════ Linux-only section ════════════════════════ */
#ifdef __linux__

/* Root-window GdkPixbuf capture on native Wayland returns a valid size but
 * all-black pixels (compositors do not expose the framebuffer). Use portal
 * + PipeWire instead. */
static gboolean linux_display_is_wayland(void) {
    GdkDisplay *d = gdk_display_get_default();
#ifdef GDK_WINDOWING_WAYLAND
    return d != NULL && GDK_IS_WAYLAND_DISPLAY(d);
#else
    (void)d;
    return FALSE;
#endif
}

/* ──────────────────────── X11/GDK path ─────────────────────────── */

static ImageData* capture_via_gdk(void) {
    GdkDisplay *display = gdk_display_get_default();
    if (!display) return NULL;

    GdkScreen  *screen = gdk_display_get_default_screen(display);
    GdkWindow  *root   = gdk_screen_get_root_window(screen);
    GdkMonitor *mon    = gdk_display_get_primary_monitor(display);
    if (!mon) mon = gdk_display_get_monitor(display, 0);
    if (!root || !mon) return NULL;

    GdkRectangle geo;
    gdk_monitor_get_geometry(mon, &geo);
    if (geo.width <= 0 || geo.height <= 0) return NULL;

    GdkPixbuf *pb = gdk_pixbuf_get_from_window(root,
                                               geo.x, geo.y,
                                               geo.width, geo.height);
    if (!pb) return NULL;

    ImageData *img = pixbuf_to_imagedata(pb);
    g_object_unref(pb);
    return img;
}

static ImageData* capture_via_gnome_screenshot(CaptureMode mode) {
    if (!g_find_program_in_path("gnome-screenshot"))
        return NULL;

    GError *err = NULL;
    gchar  *tmp_path = NULL;
    int fd = g_file_open_tmp("capturemaster-XXXXXX.png", &tmp_path, &err);
    if (fd < 0) {
        if (err) g_error_free(err);
        return NULL;
    }
    close(fd);

    gchar *cmd = NULL;
    switch (mode) {
        case CAPTURE_MODE_AREA:
            cmd = g_strdup_printf("gnome-screenshot -a -f \"%s\"", tmp_path);
            break;
        case CAPTURE_MODE_WINDOW:
            cmd = g_strdup_printf("gnome-screenshot -w -f \"%s\"", tmp_path);
            break;
        case CAPTURE_MODE_FULLSCREEN:
        default:
            cmd = g_strdup_printf("gnome-screenshot -f \"%s\"", tmp_path);
            break;
    }

    gchar *out = NULL, *err_out = NULL;
    int status = 0;
    gboolean ok = g_spawn_command_line_sync(cmd, &out, &err_out, &status, &err);
    g_free(cmd);
    g_free(out);
    g_free(err_out);
    if (!ok || status != 0) {
        if (err) g_error_free(err);
        g_unlink(tmp_path);
        g_free(tmp_path);
        return NULL;
    }

    GdkPixbuf *pb = gdk_pixbuf_new_from_file(tmp_path, &err);
    g_unlink(tmp_path);
    g_free(tmp_path);
    if (!pb) {
        if (err) g_error_free(err);
        return NULL;
    }

    ImageData *img = pixbuf_to_imagedata(pb);
    g_object_unref(pb);
    return img;
}

/* ──────────────────── PipeWire one-frame capture ───────────────── */

typedef struct {
    struct pw_main_loop *loop;
    struct pw_stream    *stream;
    struct spa_hook      stream_hook;
    int                  width;
    int                  height;
    int                  pw_format;   /* SPA_VIDEO_FORMAT_* */
    ImageData           *image;
    gboolean             done;
} PwCapState;

static void pw_on_timeout(void *data, uint64_t expirations) {
    (void)expirations;
    PwCapState *cap = (PwCapState*)data;
    if (!cap->done) {
        set_error("PipeWire capture timed out");
        cap->done = TRUE;
        pw_main_loop_quit(cap->loop);
    }
}

static void pw_on_state_changed(void *data,
                                 enum pw_stream_state old_state,
                                 enum pw_stream_state new_state,
                                 const char *error) {
    PwCapState *cap = (PwCapState*)data;
    utils_log_info("PipeWire: %s → %s",
                   pw_stream_state_as_string(old_state),
                   pw_stream_state_as_string(new_state));
    if (new_state == PW_STREAM_STATE_ERROR) {
        set_error("PipeWire stream error: %s", error ? error : "unknown");
        cap->done = TRUE;
        pw_main_loop_quit(cap->loop);
    }
}

static void pw_on_param_changed(void *data, uint32_t id,
                                 const struct spa_pod *param) {
    PwCapState *cap = (PwCapState*)data;
    if (!param || id != SPA_PARAM_Format) return;

    struct spa_video_info_raw info;
    memset(&info, 0, sizeof(info));
    if (spa_format_video_raw_parse(param, &info) < 0) return;

    cap->width     = (int)info.size.width;
    cap->height    = (int)info.size.height;
    cap->pw_format = (int)info.format;

    utils_log_info("PipeWire: format %dx%d format_id=%d",
                   cap->width, cap->height, cap->pw_format);

    /* MUST respond with buffer parameters so the server allocates buffers
     * and transitions from PAUSED → STREAMING.                           */
    int stride = cap->width * 4;
    uint8_t buf[1024];
    struct spa_pod_builder b = SPA_POD_BUILDER_INIT(buf, sizeof(buf));
    const struct spa_pod *params[1];
    params[0] = spa_pod_builder_add_object(&b,
        SPA_TYPE_OBJECT_ParamBuffers, SPA_PARAM_Buffers,
        SPA_PARAM_BUFFERS_buffers, SPA_POD_CHOICE_RANGE_Int(2, 1, 32),
        SPA_PARAM_BUFFERS_blocks,  SPA_POD_Int(1),
        SPA_PARAM_BUFFERS_size,    SPA_POD_Int(stride * cap->height),
        SPA_PARAM_BUFFERS_stride,  SPA_POD_Int(stride),
        SPA_PARAM_BUFFERS_align,   SPA_POD_Int(16));
    pw_stream_update_params(cap->stream, params, 1);
}

static void pw_on_process(void *data) {
    PwCapState *cap = (PwCapState*)data;
    if (cap->done) return;

    struct pw_buffer *pwbuf = pw_stream_dequeue_buffer(cap->stream);
    if (!pwbuf) return;

    struct spa_buffer *sbuf = pwbuf->buffer;
    struct spa_data   *d    = &sbuf->datas[0];

    int w = cap->width, h = cap->height;
    if (w <= 0 || h <= 0) {
        pw_stream_queue_buffer(cap->stream, pwbuf);
        return;
    }

    int stride = (d->chunk && d->chunk->stride > 0)
                 ? d->chunk->stride : w * 4;

    /* Resolve pixel data pointer.
     * GNOME uses DMA-BUF (d->type == SPA_DATA_DmaBuf):
     *   d->data is NULL; must mmap() d->fd.
     * X11 / software uses MemFd or MemPtr:
     *   PW_STREAM_FLAG_MAP_BUFFERS makes d->data valid.        */
    uint8_t *src    = NULL;
    void    *mapped = NULL;

    if (d->type == SPA_DATA_DmaBuf) {
        size_t map_size = (size_t)stride * h;
        mapped = mmap(NULL, map_size, PROT_READ, MAP_SHARED, (int)d->fd, 0);
        if (mapped == MAP_FAILED) {
            utils_log_error("PipeWire: mmap DmaBuf failed: %m");
            pw_stream_queue_buffer(cap->stream, pwbuf);
            return;
        }
        src = (uint8_t*)mapped;
    } else {
        if (!d->data || (d->chunk && d->chunk->size == 0)) {
            pw_stream_queue_buffer(cap->stream, pwbuf);
            return;
        }
        src = (uint8_t*)d->data + (d->chunk ? d->chunk->offset : 0);
    }

    /* Convert to RGB ImageData */
    ImageData *img = (ImageData*)utils_malloc(sizeof(ImageData));
    if (img) {
        img->width    = w;
        img->height   = h;
        img->channels = 3;
        img->size     = (size_t)w * h * 3;
        img->data     = (uint8_t*)utils_malloc(img->size);

        if (img->data) {
            /* BGRx / BGRA: bytes are B,G,R,x → output R,G,B
             * RGBx / RGBA: bytes are R,G,B,x → output R,G,B  */
            int is_bgr = (cap->pw_format == SPA_VIDEO_FORMAT_BGRx ||
                          cap->pw_format == SPA_VIDEO_FORMAT_BGRA);

            for (int y = 0; y < h; y++) {
                const uint8_t *row = src + y * stride;
                uint8_t       *out = img->data + y * w * 3;
                for (int x = 0; x < w; x++) {
                    const uint8_t *p = row + x * 4;
                    out[x * 3 + 0] = is_bgr ? p[2] : p[0]; /* R */
                    out[x * 3 + 1] = p[1];                  /* G */
                    out[x * 3 + 2] = is_bgr ? p[0] : p[2]; /* B */
                }
            }
            cap->image = img;
        } else {
            utils_free(img);
        }
    }

    if (mapped)
        munmap(mapped, (size_t)stride * h);

    pw_stream_queue_buffer(cap->stream, pwbuf);
    cap->done = TRUE;
    pw_main_loop_quit(cap->loop);
}

static const struct pw_stream_events pw_stream_events = {
    PW_VERSION_STREAM_EVENTS,
    .state_changed = pw_on_state_changed,
    .param_changed = pw_on_param_changed,
    .process       = pw_on_process,
};

static ImageData* capture_via_pipewire(uint32_t node_id) {
    utils_log_info("PipeWire: connecting to node %u", node_id);

    pw_init(NULL, NULL);

    PwCapState cap;
    memset(&cap, 0, sizeof(cap));

    cap.loop = pw_main_loop_new(NULL);
    if (!cap.loop) {
        set_error("pw_main_loop_new failed");
        pw_deinit();
        return NULL;
    }

    struct pw_context *ctx = pw_context_new(
        pw_main_loop_get_loop(cap.loop), NULL, 0);
    if (!ctx) {
        set_error("pw_context_new failed");
        pw_main_loop_destroy(cap.loop);
        pw_deinit();
        return NULL;
    }

    struct pw_core *core = pw_context_connect(ctx, NULL, 0);
    if (!core) {
        set_error("pw_context_connect failed");
        pw_context_destroy(ctx);
        pw_main_loop_destroy(cap.loop);
        pw_deinit();
        return NULL;
    }

    cap.stream = pw_stream_new(core, "capturemaster",
        pw_properties_new(
            PW_KEY_MEDIA_TYPE,     "Video",
            PW_KEY_MEDIA_CATEGORY, "Capture",
            PW_KEY_MEDIA_ROLE,     "Screen",
            NULL));
    if (!cap.stream) {
        set_error("pw_stream_new failed");
        goto cleanup;
    }

    pw_stream_add_listener(cap.stream, &cap.stream_hook,
                           &pw_stream_events, &cap);

    /* request BGRx/BGRA/RGBx/RGBA — let the server pick */
    uint8_t pod_buf[1024];
    struct spa_pod_builder b = SPA_POD_BUILDER_INIT(pod_buf, sizeof(pod_buf));
    const struct spa_pod *params[1];
    params[0] = spa_pod_builder_add_object(&b,
        SPA_TYPE_OBJECT_Format,  SPA_PARAM_EnumFormat,
        SPA_FORMAT_mediaType,    SPA_POD_Id(SPA_MEDIA_TYPE_video),
        SPA_FORMAT_mediaSubtype, SPA_POD_Id(SPA_MEDIA_SUBTYPE_raw),
        SPA_FORMAT_VIDEO_format, SPA_POD_CHOICE_ENUM_Id(4,
            SPA_VIDEO_FORMAT_BGRx,
            SPA_VIDEO_FORMAT_BGRA,
            SPA_VIDEO_FORMAT_RGBx,
            SPA_VIDEO_FORMAT_RGBA));

    int ret = pw_stream_connect(cap.stream,
        PW_DIRECTION_INPUT,
        node_id,
        PW_STREAM_FLAG_AUTOCONNECT | PW_STREAM_FLAG_MAP_BUFFERS,
        params, 1);
    if (ret < 0) {
        set_error("pw_stream_connect failed: %s", strerror(-ret));
        goto cleanup;
    }

    /* 5-second watchdog timer */
    struct pw_loop *pwloop = pw_main_loop_get_loop(cap.loop);
    struct spa_source *timer =
        pw_loop_add_timer(pwloop, pw_on_timeout, &cap);
    if (timer) {
        struct timespec ts = {5, 0};
        pw_loop_update_timer(pwloop, timer, &ts, NULL, false);
    }

    pw_main_loop_run(cap.loop);

cleanup:
    if (cap.stream) {
        spa_hook_remove(&cap.stream_hook);
        pw_stream_destroy(cap.stream);
    }
    pw_core_disconnect(core);
    pw_context_destroy(ctx);
    pw_main_loop_destroy(cap.loop);
    pw_deinit();

    if (cap.image)
        utils_log_info("PipeWire capture: %dx%d", cap.image->width, cap.image->height);

    return cap.image;
}

/* ──────────────── XDG ScreenCast Portal (D-Bus) ────────────────── */

typedef struct {
    gboolean  done;
    guint32   response;
    GVariant *results;   /* caller unref */
} SCResp;

static void sc_resp_cb(GDBusConnection *c, const char *s, const char *p,
                        const char *i, const char *sig,
                        GVariant *params, gpointer ud) {
    (void)c; (void)s; (void)p; (void)i; (void)sig;
    SCResp *r = (SCResp*)ud;
    GVariant *res = NULL;
    g_variant_get(params, "(u@a{sv})", &r->response, &res);
    r->results = res;
    r->done    = TRUE;
}

/* Call a ScreenCast portal method, wait for Response, return results.
 * Caller must g_variant_unref() the returned GVariant.
 * Returns NULL on error or cancellation.                            */
static GVariant* sc_call(GDBusConnection *conn,
                          const char      *sender_flat,
                          const char      *method,
                          const char      *token,
                          GVariant        *args) {
    char req_path[256];
    snprintf(req_path, sizeof(req_path),
             "/org/freedesktop/portal/desktop/request/%s/%s",
             sender_flat, token);

    SCResp state = {FALSE, 2, NULL};
    guint sub = g_dbus_connection_signal_subscribe(conn, NULL,
        "org.freedesktop.portal.Request", "Response", req_path,
        NULL, G_DBUS_SIGNAL_FLAGS_NO_MATCH_RULE,
        sc_resp_cb, &state, NULL);

    GError   *err = NULL;
    GVariant *ret = g_dbus_connection_call_sync(conn,
        "org.freedesktop.portal.Desktop",
        "/org/freedesktop/portal/desktop",
        "org.freedesktop.portal.ScreenCast",
        method, args, G_VARIANT_TYPE("(o)"),
        G_DBUS_CALL_FLAGS_NONE, -1, NULL, &err);

    if (!ret) {
        utils_log_error("ScreenCast.%s: %s", method,
                        err ? err->message : "unknown");
        if (err) g_error_free(err);
        g_dbus_connection_signal_unsubscribe(conn, sub);
        return NULL;
    }
    g_variant_unref(ret);

    /* pump GLib main context until portal responds */
    while (!state.done) {
        if (!g_main_context_iteration(NULL, FALSE))
            g_usleep(5000);
    }
    g_dbus_connection_signal_unsubscribe(conn, sub);

    if (state.response != 0) {
        utils_log_error("ScreenCast.%s response=%u (0=OK,1=cancel,2=err)",
                        method, state.response);
        if (state.results) g_variant_unref(state.results);
        return NULL;
    }
    return state.results;   /* may be non-NULL even if empty dict */
}

/* Portal a{sv} entries are often boxed as 'v' wrapping 'o' or 's'. */
static gboolean portal_dict_get_object_path(GVariant *dict, const char *key,
                                            char *out, size_t outsz) {
    GVariant *v = g_variant_lookup_value(dict, key, NULL);
    if (!v)
        return FALSE;

    GVariant *inner = v;
    if (g_variant_is_of_type(v, G_VARIANT_TYPE_VARIANT)) {
        inner = g_variant_get_variant(v);
        g_variant_unref(v);
    }

    if (!g_variant_is_of_type(inner, G_VARIANT_TYPE_OBJECT_PATH) &&
        !g_variant_is_of_type(inner, G_VARIANT_TYPE_STRING)) {
        g_variant_unref(inner);
        return FALSE;
    }

    const char *s = g_variant_get_string(inner, NULL);
    if (!s || !g_variant_is_object_path(s)) {
        g_variant_unref(inner);
        return FALSE;
    }

    snprintf(out, outsz, "%s", s);
    g_variant_unref(inner);
    return TRUE;
}

static ImageData* capture_via_screencast(uint32_t source_types) {
    GError          *err  = NULL;
    GDBusConnection *conn = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, &err);
    if (!conn) {
        set_error("D-Bus unavailable: %s", err ? err->message : "?");
        if (err) g_error_free(err);
        return NULL;
    }

    /* flatten unique name ":1.234" → "1_234" */
    const char *uname = g_dbus_connection_get_unique_name(conn);
    char sender_flat[64];
    {
        const char *s = uname + 1;
        char       *d = sender_flat;
        while (*s && d - sender_flat < 63)
            *d++ = (*s == '.') ? '_' : *s, s++;
        *d = '\0';
    }

    GVariantBuilder opts;
    GVariant *res;

    /* ── 1. CreateSession ── */
    g_variant_builder_init(&opts, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&opts, "{sv}", "handle_token",
                          g_variant_new_string("h1"));
    g_variant_builder_add(&opts, "{sv}", "session_handle_token",
                          g_variant_new_string("s1"));
    res = sc_call(conn, sender_flat, "CreateSession", "h1",
                  g_variant_new("(a{sv})", &opts));
    if (!res) {
        set_error("ScreenCast: CreateSession failed");
        g_object_unref(conn);
        return NULL;
    }
    char session[256];
    if (!portal_dict_get_object_path(res, "session_handle",
                                     session, sizeof(session))) {
        set_error("ScreenCast: CreateSession missing session_handle");
        g_variant_unref(res);
        g_object_unref(conn);
        return NULL;
    }
    g_variant_unref(res);
    utils_log_info("ScreenCast session: %s", session);

    /* ── 2. SelectSources ── */
    g_variant_builder_init(&opts, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&opts, "{sv}", "handle_token",
                          g_variant_new_string("h2"));
    g_variant_builder_add(&opts, "{sv}", "types",
                          g_variant_new_uint32(source_types));
    g_variant_builder_add(&opts, "{sv}", "multiple",
                          g_variant_new_boolean(FALSE));
    g_variant_builder_add(&opts, "{sv}", "cursor_mode",
                          g_variant_new_uint32(1));   /* HIDDEN */
    res = sc_call(conn, sender_flat, "SelectSources", "h2",
                  g_variant_new("(oa{sv})", session, &opts));
    if (!res) {
        set_error("ScreenCast: SelectSources failed");
        g_object_unref(conn);
        return NULL;
    }
    g_variant_unref(res);

    /* ── 3. Start ── */
    g_variant_builder_init(&opts, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&opts, "{sv}", "handle_token",
                          g_variant_new_string("h3"));
    res = sc_call(conn, sender_flat, "Start", "h3",
                  g_variant_new("(osa{sv})", session, "", &opts));
    if (!res) {
        set_error("ScreenCast: Start failed");
        g_object_unref(conn);
        return NULL;
    }

    /* extract PipeWire node ID from streams array */
    guint32  node_id   = 0;
    gboolean found     = FALSE;
    GVariant *streams  = g_variant_lookup_value(res, "streams", NULL);
    if (streams) {
        GVariantIter iter;
        g_variant_iter_init(&iter, streams);
        GVariant *item;
        if ((item = g_variant_iter_next_value(&iter))) {
            guint32   nid;
            GVariant *props = NULL;
            g_variant_get(item, "(u@a{sv})", &nid, &props);
            node_id = nid;
            found   = TRUE;
            utils_log_info("ScreenCast: PipeWire node_id=%u", node_id);
            if (props) g_variant_unref(props);
            g_variant_unref(item);
        }
        g_variant_unref(streams);
    }
    g_variant_unref(res);

    ImageData *img = NULL;
    if (found) {
        img = capture_via_pipewire(node_id);
        if (!img)
            set_error("PipeWire capture failed after getting node_id=%u", node_id);
    } else {
        set_error("ScreenCast: no streams returned");
    }

    /* close portal session */
    g_dbus_connection_call_sync(conn,
        "org.freedesktop.portal.Desktop", session,
        "org.freedesktop.portal.Session", "Close",
        NULL, NULL, G_DBUS_CALL_FLAGS_NONE, -1, NULL, NULL);

    g_object_unref(conn);
    return img;
}

#endif  /* __linux__ */

/* ═══════════════════════ macOS-only section ════════════════════════ */
#ifdef __APPLE__

static ImageData* capture_via_coregraphics(void) {
    CGDirectDisplayID display_id = CGMainDisplayID();
    CGImageRef cg_image = CGDisplayCreateImage(display_id);
    if (!cg_image) {
        set_error("CGDisplayCreateImage failed");
        return NULL;
    }

    size_t width     = CGImageGetWidth(cg_image);
    size_t height    = CGImageGetHeight(cg_image);
    size_t row_bytes = width * 4;

    uint8_t *raw = (uint8_t*)utils_malloc(row_bytes * height);
    if (!raw) { CGImageRelease(cg_image); return NULL; }

    CGColorSpaceRef cs = CGColorSpaceCreateDeviceRGB();
    CGContextRef ctx = CGBitmapContextCreate(raw, width, height, 8, row_bytes,
        cs, kCGImageAlphaNoneSkipLast | kCGBitmapByteOrderDefault);
    CGColorSpaceRelease(cs);

    if (!ctx) {
        utils_free(raw);
        CGImageRelease(cg_image);
        set_error("CGBitmapContextCreate failed");
        return NULL;
    }

    CGContextDrawImage(ctx,
        CGRectMake(0, 0, (CGFloat)width, (CGFloat)height), cg_image);
    CGContextRelease(ctx);
    CGImageRelease(cg_image);

    ImageData *img = (ImageData*)utils_malloc(sizeof(ImageData));
    if (!img) { utils_free(raw); return NULL; }

    img->width    = (int)width;
    img->height   = (int)height;
    img->channels = 3;
    img->size     = (size_t)width * height * 3;
    img->data     = (uint8_t*)utils_malloc(img->size);
    if (!img->data) { utils_free(raw); utils_free(img); return NULL; }

    /* RGBA → RGB */
    for (size_t i = 0; i < width * height; i++) {
        img->data[i * 3]     = raw[i * 4];
        img->data[i * 3 + 1] = raw[i * 4 + 1];
        img->data[i * 3 + 2] = raw[i * 4 + 2];
    }
    utils_free(raw);

    utils_log_info("Core Graphics capture: %dx%d", img->width, img->height);
    return img;
}

#endif  /* __APPLE__ */

/* ─────────────────────── public capture API ────────────────────────── */

ImageData* capture_fullscreen(void) {
    utils_log_info("Starting fullscreen capture");

#ifdef __APPLE__
    ImageData *img = capture_via_coregraphics();
    if (!img) set_error("macOS Core Graphics capture failed");
    return img;

#elif __linux__
    /* GNOME path: match gnome-screenshot behavior when available. */
    ImageData *img = capture_via_gnome_screenshot(CAPTURE_MODE_FULLSCREEN);
    if (img) {
        utils_log_info("gnome-screenshot fullscreen: %dx%d", img->width, img->height);
        return img;
    }

    /* 1. GDK root-window: works on X11; on Wayland it is black — skip it */
    img = NULL;
    if (!linux_display_is_wayland()) {
        img = capture_via_gdk();
        if (img) {
            utils_log_info("GDK capture: %dx%d", img->width, img->height);
            return img;
        }
    } else {
        utils_log_info("Wayland: skipping GDK root capture (use portal)");
    }

    /* 2. Native Wayland (or GDK fallback failed): portal + PipeWire */
    utils_log_info("Using XDG ScreenCast + PipeWire");
    img = capture_via_screencast(1); /* MONITOR */
    if (img) return img;

    set_error("Fullscreen capture failed (GDK + ScreenCast both failed)");
    return NULL;
#else
    set_error("Unsupported platform");
    return NULL;
#endif
}

ImageData* capture_area(const CaptureArea *area) {
    if (!area) { set_error("Invalid capture area"); return NULL; }

    utils_log_info("Area capture %dx%d at (%d,%d)",
                   area->width, area->height, area->x, area->y);

#ifdef __linux__
    ImageData *img = capture_via_gnome_screenshot(CAPTURE_MODE_AREA);
    if (img) {
        utils_log_info("gnome-screenshot area: %dx%d", img->width, img->height);
        return img;
    }
#endif

    ImageData *full = capture_fullscreen();
    if (!full) return NULL;

    ImageData *cropped = crop_image(full, area->x, area->y,
                                    area->width, area->height);
    image_free(full);
    if (!cropped) set_error("Crop region out of screen bounds");
    return cropped;
}

ImageData* capture_window(void) {
#ifdef __linux__
    ImageData *img = capture_via_gnome_screenshot(CAPTURE_MODE_WINDOW);
    if (img) {
        utils_log_info("gnome-screenshot window: %dx%d", img->width, img->height);
        return img;
    }

    utils_log_info("Window capture via XDG ScreenCast");
    /* WINDOW type lets the portal chooser ask which window to capture. */
    img = capture_via_screencast(2);
    if (img) return img;
    set_error("Window capture failed");
    return NULL;
#else
    utils_log_info("Window capture fallback to fullscreen");
    return capture_fullscreen();
#endif
}

/* ─────────────────────── image I/O helpers ─────────────────────────── */

bool image_save(const ImageData *img, const char *filepath,
                ImageFormat format) {
    if (!img || !img->data || !filepath) {
        set_error("Invalid parameters for image_save");
        return false;
    }
    utils_log_info("Saving %dx%d to: %s", img->width, img->height, filepath);

    GdkPixbuf *pixbuf = gdk_pixbuf_new_from_data(
        img->data, GDK_COLORSPACE_RGB,
        img->channels == 4, 8,
        img->width, img->height,
        img->width * img->channels,
        NULL, NULL);
    if (!pixbuf) { set_error("Failed to create pixbuf"); return false; }

    GError   *error   = NULL;
    gboolean  success = FALSE;

    if (format == IMAGE_FORMAT_PNG)
        success = gdk_pixbuf_save(pixbuf, filepath, "png",   &error, NULL);
    else
        success = gdk_pixbuf_save(pixbuf, filepath, "jpeg",  &error,
                                  "quality", "95", NULL);

    if (!success) {
        set_error("Save failed: %s", error ? error->message : "unknown");
        if (error) g_error_free(error);
    }
    g_object_unref(pixbuf);
    return (bool)success;
}

void image_free(ImageData *img) {
    if (img) {
        utils_free(img->data);
        utils_free(img);
    }
}

bool image_to_clipboard(const ImageData *img) {
    if (!img || !img->data) {
        set_error("Invalid image for clipboard");
        return false;
    }
    GdkPixbuf *pixbuf = gdk_pixbuf_new_from_data(
        img->data, GDK_COLORSPACE_RGB,
        img->channels == 4, 8,
        img->width, img->height,
        img->width * img->channels,
        NULL, NULL);
    if (!pixbuf) { set_error("Failed to create pixbuf"); return false; }

    GtkClipboard *cb = gtk_clipboard_get(GDK_SELECTION_CLIPBOARD);
    if (!cb) {
        g_object_unref(pixbuf);
        set_error("Cannot access clipboard");
        return false;
    }
    gtk_clipboard_set_image(cb, pixbuf);
    gtk_clipboard_store(cb);
    g_object_unref(pixbuf);

    utils_log_info("Image copied to clipboard");
    return true;
}
