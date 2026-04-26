#include "gst_helper.h"
#include <gst/video/videooverlay.h>
#include <stdlib.h>
#include <string.h>
#if defined(GDK_WINDOWING_X11)
#include <gdk/gdkx.h>
#endif

/* gtksink: GStreamer's native GTK widget sink.
 * We hold a strong reference (via gst_object_ref_sink) so it survives
 * pipeline teardown and can be reused across multiple play sessions. */
static GstElement *gtksink  = NULL;
static GstElement *pipeline = NULL;

/* XOverlay fallback (used when gtksink is unavailable) */
static GtkWidget *overlay_widget = NULL;

/* ------------------------------------------------------------------ */
/*  Helpers: safe status update from any thread                       */
/* ------------------------------------------------------------------ */

typedef struct { GtkWidget *label; gchar *text; } LabelUpdate;

static gboolean set_label_cb(gpointer data) {
    LabelUpdate *u = (LabelUpdate *)data;
    gtk_label_set_text(GTK_LABEL(u->label), u->text);
    g_free(u->text);
    g_free(u);
    return G_SOURCE_REMOVE;
}

static void set_label_async(GtkWidget *label, const gchar *text) {
    LabelUpdate *u = g_new(LabelUpdate, 1);
    u->label = label;
    u->text  = g_strdup(text);
    g_idle_add(set_label_cb, u);
}

/* ------------------------------------------------------------------ */
/*  Bus message handler — dispatched on the GLib main loop            */
/* ------------------------------------------------------------------ */

static void on_gst_message(GstBus *bus, GstMessage *msg, gpointer user_data) {
    GtkWidget *status_label = GTK_WIDGET(user_data);
    (void)bus;
    switch (GST_MESSAGE_TYPE(msg)) {
        case GST_MESSAGE_ERROR: {
            GError *err = NULL;
            gchar  *dbg = NULL;
            gst_message_parse_error(msg, &err, &dbg);
            gtk_label_set_text(GTK_LABEL(status_label),
                               err ? err->message : "재생 오류");
            g_printerr("GStreamer 오류: %s\n디버그: %s\n",
                       err ? err->message : "(없음)",
                       dbg ? dbg : "(없음)");
            g_error_free(err);
            g_free(dbg);
            break;
        }
        case GST_MESSAGE_EOS:
            gtk_label_set_text(GTK_LABEL(status_label), "재생 완료");
            break;
        case GST_MESSAGE_STATE_CHANGED:
            if (pipeline && GST_MESSAGE_SRC(msg) == GST_OBJECT(pipeline)) {
                GstState old_s, new_s;
                gst_message_parse_state_changed(msg, &old_s, &new_s, NULL);
                if (new_s == GST_STATE_PLAYING)
                    gtk_label_set_text(GTK_LABEL(status_label), "재생 중...");
                else if (new_s == GST_STATE_PAUSED)
                    gtk_label_set_text(GTK_LABEL(status_label), "일시 정지");
            }
            break;
        default:
            break;
    }
}

/* ------------------------------------------------------------------ */
/*  XOverlay sync handler (fallback path only)                        */
/* ------------------------------------------------------------------ */

static GstBusSyncReply bus_sync_handler(GstBus *bus, GstMessage *msg,
                                         gpointer user_data) {
    (void)bus; (void)user_data;
#if defined(GDK_WINDOWING_X11)
    if (gst_is_video_overlay_prepare_window_handle_message(msg)) {
        if (overlay_widget && gtk_widget_get_realized(overlay_widget)) {
            GdkWindow *gdkwin = gtk_widget_get_window(overlay_widget);
            if (gdkwin) {
                gst_video_overlay_set_window_handle(
                    GST_VIDEO_OVERLAY(GST_MESSAGE_SRC(msg)),
                    GDK_WINDOW_XID(gdkwin));
                gst_message_unref(msg);
                return GST_BUS_DROP;
            }
        }
    }
#endif
    return GST_BUS_PASS;
}

/* ------------------------------------------------------------------ */
/*  Video widget creation                                              */
/* ------------------------------------------------------------------ */

GtkWidget* create_gst_video_widget(void) {
    /* gtksink integrates GStreamer rendering into a GtkWidget natively.
     * gst_object_ref_sink: convert the floating ref to a strong ref so that
     * gtksink survives when the pipeline is torn down between plays. */
    gtksink = gst_element_factory_make("gtksink", "gtksink");
    if (gtksink) {
        gst_object_ref_sink(gtksink);   /* own a permanent strong reference */
        GtkWidget *widget = NULL;
        g_object_get(gtksink, "widget", &widget, NULL);
        if (widget) {
            gtk_widget_set_size_request(widget, 640, 400);
            g_object_unref(widget);     /* balance the ref from g_object_get */
            return widget;
        }
        gst_object_unref(gtksink);
        gtksink = NULL;
    }

    /* Fallback: drawing area with XOverlay */
    g_printerr("gtksink 없음 — XOverlay 폴백 사용\n");
    GtkWidget *video = gtk_drawing_area_new();
    gtk_widget_set_size_request(video, 640, 400);
    GtkCssProvider *css = gtk_css_provider_new();
    gtk_css_provider_load_from_data(css, "* { background-color: black; }", -1, NULL);
    gtk_style_context_add_provider(gtk_widget_get_style_context(video),
                                   GTK_STYLE_PROVIDER(css),
                                   GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    g_object_unref(css);
    return video;
}

/* ------------------------------------------------------------------ */
/*  Play task: background thread extracts stream URL only.            */
/*  All GStreamer / GTK calls happen on the main thread via g_idle_add.*/
/* ------------------------------------------------------------------ */

typedef struct {
    gchar     *url;
    GtkWidget *video_widget;
    GtkWidget *status_label;
} PlayTask;

typedef struct {
    gchar     *stream_url;   /* NULL means error */
    gchar     *error_msg;    /* set when stream_url is NULL */
    GtkWidget *video_widget;
    GtkWidget *status_label;
} PlayResult;

/* Runs on main thread */
static gboolean start_pipeline(gpointer data) {
    PlayResult *res = (PlayResult *)data;

    if (!res->stream_url) {
        gtk_label_set_text(GTK_LABEL(res->status_label), res->error_msg);
        g_free(res->error_msg);
        g_free(res);
        return G_SOURCE_REMOVE;
    }

    /* Tear down any running pipeline (does NOT destroy gtksink because we
     * hold our own strong reference via gst_object_ref_sink). */
    if (pipeline) {
        gst_element_set_state(pipeline, GST_STATE_NULL);
        gst_object_unref(pipeline);
        pipeline = NULL;
    }

    pipeline = gst_element_factory_make("playbin", "playbin");
    if (!pipeline) {
        gtk_label_set_text(GTK_LABEL(res->status_label),
                           "오류: GStreamer playbin 생성 실패");
        goto done;
    }

    g_object_set(pipeline, "uri", res->stream_url, NULL);

    if (gtksink) {
        /* gtksink path: video renders inside the GTK widget in our window */
        g_object_set(pipeline, "video-sink", gtksink, NULL);
    } else {
        /* XOverlay fallback */
        overlay_widget = res->video_widget;
        GstBus *sbus = gst_element_get_bus(pipeline);
        gst_bus_set_sync_handler(sbus, bus_sync_handler, NULL, NULL);
        gst_object_unref(sbus);
    }

    {
        GstBus *bus = gst_element_get_bus(pipeline);
        gst_bus_add_signal_watch(bus);
        g_signal_connect(bus, "message",
                         G_CALLBACK(on_gst_message), res->status_label);
        gst_object_unref(bus);
    }

    gtk_label_set_text(GTK_LABEL(res->status_label), "재생 시작 중...");
    gst_element_set_state(pipeline, GST_STATE_PLAYING);

done:
    g_free(res->stream_url);
    g_free(res);
    return G_SOURCE_REMOVE;
}

/* Runs on background thread */
static gpointer play_worker(gpointer data) {
    PlayTask *task = (PlayTask *)data;

    set_label_async(task->status_label, "스트림 URL 추출 중...");

    gchar *quoted_url = g_shell_quote(task->url);
    gchar *cmd = g_strdup_printf("yt-dlp -g -f b --no-playlist %s", quoted_url);
    g_free(quoted_url);

    FILE *fp = popen(cmd, "r");
    g_free(cmd);

    PlayResult *res = g_new0(PlayResult, 1);
    res->video_widget = task->video_widget;
    res->status_label = task->status_label;

    if (!fp) {
        res->error_msg = g_strdup("오류: yt-dlp 실행 실패");
        goto done;
    }

    {
        char buf[4096] = {0};
        gboolean ok = (fgets(buf, sizeof(buf), fp) != NULL);
        pclose(fp);

        if (!ok || buf[0] == '\0') {
            res->error_msg = g_strdup("오류: 스트림 URL 추출 실패");
            goto done;
        }
        buf[strcspn(buf, "\r\n")] = 0;
        res->stream_url = g_strdup(buf);
    }

done:
    g_idle_add(start_pipeline, res);
    g_free(task->url);
    g_free(task);
    return NULL;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

void gst_play_youtube_url(GtkWidget *video_widget, const gchar *url,
                           GtkWidget *status_label) {
    PlayTask *task     = g_new0(PlayTask, 1);
    task->url          = g_strdup(url);
    task->video_widget = video_widget;
    task->status_label = status_label;
    g_thread_new("play-worker", play_worker, task);
}

void gst_pause_playback(void) {
    if (!pipeline) return;
    GstState state;
    gst_element_get_state(pipeline, &state, NULL, 0);
    if (state == GST_STATE_PLAYING)
        gst_element_set_state(pipeline, GST_STATE_PAUSED);
    else if (state == GST_STATE_PAUSED)
        gst_element_set_state(pipeline, GST_STATE_PLAYING);
}

void gst_stop_playback(void) {
    if (pipeline) {
        gst_element_set_state(pipeline, GST_STATE_NULL);
        gst_object_unref(pipeline);
        pipeline = NULL;
    }
}
