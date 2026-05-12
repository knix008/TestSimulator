#include "video_player.h"

#include <gst/gst.h>
#include <gst/app/gstappsink.h>
#include <stdio.h>
#include <stdlib.h>

struct VideoPlayer {
    GstElement       *pipeline;
    GstElement       *video_entry; /* first element of video chain */
    GstElement       *audio_entry; /* first element of audio chain (audioconvert) */
    GstElement       *appsink;
    GtkWidget        *widget;      /* embed this in your GTK layout */
    video_audio_cb_t      audio_cb;
    video_eos_cb_t        eos_cb;
    video_audio_only_cb_t audio_only_cb;
    void                 *userdata;
    guint                 bus_watch_id;
    guint                 eos_idle_id;
    gboolean              has_video;    /* TRUE once a video pad is linked */
    guint                 audio_only_idle_id;
};

/* ── appsink: new audio sample ─────────────────────────────────────────────── */

static GstFlowReturn on_new_sample(GstAppSink *sink, gpointer data) {
    VideoPlayer *vp     = (VideoPlayer *)data;
    GstSample   *sample = gst_app_sink_pull_sample(sink);
    if (!sample) return GST_FLOW_OK;

    GstBuffer *buf = gst_sample_get_buffer(sample);
    GstMapInfo map;
    if (gst_buffer_map(buf, &map, GST_MAP_READ)) {
        int n = (int)(map.size / sizeof(float));
        if (vp->audio_cb && n > 0)
            vp->audio_cb((const float *)map.data, n, vp->userdata);
        gst_buffer_unmap(buf, &map);
    }
    gst_sample_unref(sample);
    return GST_FLOW_OK;
}

/* ── EOS/ERROR/audio-only: deliver to GTK main thread via idle ──────────── */

static gboolean audio_only_idle(gpointer data) {
    VideoPlayer *vp        = (VideoPlayer *)data;
    vp->audio_only_idle_id = 0;
    if (vp->audio_only_cb)
        vp->audio_only_cb(vp->userdata);
    return G_SOURCE_REMOVE;
}

static gboolean eos_idle(gpointer data) {
    VideoPlayer *vp  = (VideoPlayer *)data;
    vp->eos_idle_id  = 0;
    if (vp->eos_cb)
        vp->eos_cb(vp->userdata);
    return G_SOURCE_REMOVE;
}

static gboolean on_bus_message(GstBus *bus, GstMessage *msg, gpointer data) {
    (void)bus;
    VideoPlayer *vp = (VideoPlayer *)data;

    switch (GST_MESSAGE_TYPE(msg)) {
    case GST_MESSAGE_EOS:
        if (!vp->eos_idle_id)
            vp->eos_idle_id = g_idle_add(eos_idle, vp);
        break;
    case GST_MESSAGE_ASYNC_DONE:
        /* Pipeline reached PAUSED for the first time – all pads are linked.
           If no video pad was seen, this is an audio-only file. */
        if (!vp->has_video && !vp->audio_only_idle_id && vp->audio_only_cb)
            vp->audio_only_idle_id = g_idle_add(audio_only_idle, vp);
        break;
    case GST_MESSAGE_ERROR: {
        GError *err = NULL; gchar *dbg = NULL;
        gst_message_parse_error(msg, &err, &dbg);
        fprintf(stderr, "[video] %s\n", err->message);
        g_error_free(err); g_free(dbg);
        if (!vp->eos_idle_id)
            vp->eos_idle_id = g_idle_add(eos_idle, vp);
        break;
    }
    default: break;
    }
    return TRUE;
}

/* ── decodebin: dynamic pad linking ─────────────────────────────────────── */

static void on_pad_added(GstElement *src, GstPad *pad, gpointer data) {
    (void)src;
    VideoPlayer  *vp   = (VideoPlayer *)data;
    GstCaps      *caps = gst_pad_get_current_caps(pad);
    if (!caps) return;

    GstStructure *s    = gst_caps_get_structure(caps, 0);
    const gchar  *name = gst_structure_get_name(s);
    GstElement   *target = NULL;

    if      (g_str_has_prefix(name, "video/") && vp->video_entry)
        target = vp->video_entry;
    else if (g_str_has_prefix(name, "audio/") && vp->audio_entry)
        target = vp->audio_entry;

    if (target) {
        GstPad *sink = gst_element_get_static_pad(target, "sink");
        if (!gst_pad_is_linked(sink))
            gst_pad_link(pad, sink);
        gst_object_unref(sink);
        gst_element_sync_state_with_parent(target);
        if (target == vp->video_entry)
            vp->has_video = TRUE;
    }
    gst_caps_unref(caps);
}


/* ── Constructor ─────────────────────────────────────────────────────────── */

VideoPlayer *video_player_new(const char            *path,
                               video_audio_cb_t       audio_cb,
                               video_eos_cb_t         eos_cb,
                               video_audio_only_cb_t  audio_only_cb,
                               void                  *userdata) {
    VideoPlayer *vp = calloc(1, sizeof(VideoPlayer));
    vp->audio_cb      = audio_cb;
    vp->eos_cb        = eos_cb;
    vp->audio_only_cb = audio_only_cb;
    vp->userdata      = userdata;

    vp->pipeline              = gst_pipeline_new("sttgtk-player");
    GstElement *filesrc       = gst_element_factory_make("filesrc",       NULL);
    GstElement *decodebin     = gst_element_factory_make("decodebin",     NULL);
    GstElement *audioconvert  = gst_element_factory_make("audioconvert",  NULL);
    GstElement *audioresample = gst_element_factory_make("audioresample", NULL);
    GstElement *capsfilter    = gst_element_factory_make("capsfilter",    NULL);
    vp->appsink               = gst_element_factory_make("appsink",       NULL);

    if (!vp->pipeline || !filesrc || !decodebin ||
        !audioconvert || !audioresample || !capsfilter || !vp->appsink) {
        fprintf(stderr, "[video] failed to create pipeline elements\n");
        goto fail;
    }
    vp->audio_entry = audioconvert;

    /* ── Video display chain ──────────────────────────────────────────────
       Try gtksink; fall back to fakesink (audio-only mode).               */
    GstElement *videoconvert = gst_element_factory_make("videoconvert", NULL);
    GstElement *videoscale   = gst_element_factory_make("videoscale",   NULL);
    GstElement *gtksink      = gst_element_factory_make("gtksink",      NULL);

    if (videoconvert && videoscale && gtksink) {
        vp->video_entry = videoconvert;
        gst_bin_add_many(GST_BIN(vp->pipeline), videoconvert, videoscale, gtksink, NULL);
        gst_element_link_many(videoconvert, videoscale, gtksink, NULL);
        g_object_get(gtksink, "widget", &vp->widget, NULL);
        gtk_widget_set_size_request(vp->widget, -1, 360);
    } else {
        if (videoconvert) gst_object_unref(videoconvert);
        if (videoscale)   gst_object_unref(videoscale);
        if (gtksink)      gst_object_unref(gtksink);
        /* Use fakesink to absorb video pads without errors */
        GstElement *fakesink = gst_element_factory_make("fakesink", NULL);
        if (fakesink) {
            vp->video_entry = fakesink;
            gst_bin_add(GST_BIN(vp->pipeline), fakesink);
        }
        /* Placeholder widget */
        vp->widget = gtk_label_new("비디오 표시 불가 (gtksink 없음)");
        gtk_widget_set_size_request(vp->widget, -1, 240);
    }

    /* ── Source location ─────────────────────────────────────────────────── */
    g_object_set(filesrc, "location", path, NULL);

    /* ── Audio caps: 16 kHz, mono, float32 ──────────────────────────────── */
    GstCaps *caps = gst_caps_new_simple("audio/x-raw",
        "format",   G_TYPE_STRING, "F32LE",
        "rate",     G_TYPE_INT,    16000,
        "channels", G_TYPE_INT,    1,
        "layout",   G_TYPE_STRING, "interleaved",
        NULL);
    g_object_set(capsfilter, "caps", caps, NULL);
    gst_caps_unref(caps);

    /* ── Appsink ──────────────────────────────────────────────────────────── */
    g_object_set(vp->appsink, "sync", TRUE, NULL);
    GstAppSinkCallbacks cbs = { .eos = NULL, .new_preroll = NULL,
                                .new_sample = on_new_sample };
    gst_app_sink_set_callbacks(GST_APP_SINK(vp->appsink), &cbs, vp, NULL);

    /* ── Add audio elements and link ─────────────────────────────────────── */
    gst_bin_add_many(GST_BIN(vp->pipeline),
        filesrc, decodebin, audioconvert, audioresample, capsfilter, vp->appsink,
        NULL);
    gst_element_link(filesrc, decodebin);
    gst_element_link_many(audioconvert, audioresample, capsfilter, vp->appsink, NULL);
    g_signal_connect(decodebin, "pad-added", G_CALLBACK(on_pad_added), vp);

    /* ── Bus watch ───────────────────────────────────────────────────────── */
    GstBus *bus      = gst_element_get_bus(vp->pipeline);
    vp->bus_watch_id = gst_bus_add_watch(bus, on_bus_message, vp);
    gst_object_unref(bus);

    return vp;

fail:
    if (vp->pipeline) gst_object_unref(vp->pipeline);
    free(vp);
    return NULL;
}

/* ── Public API ──────────────────────────────────────────────────────────── */

void video_player_free(VideoPlayer *vp) {
    if (!vp) return;
    if (vp->eos_idle_id) {
        g_source_remove(vp->eos_idle_id);
        vp->eos_idle_id = 0;
    }
    if (vp->audio_only_idle_id) {
        g_source_remove(vp->audio_only_idle_id);
        vp->audio_only_idle_id = 0;
    }
    if (vp->bus_watch_id) {
        g_source_remove(vp->bus_watch_id);
        vp->bus_watch_id = 0;
    }
    gst_element_set_state(vp->pipeline, GST_STATE_NULL);
    gst_object_unref(vp->pipeline);
    free(vp);
}

GtkWidget *video_player_widget(VideoPlayer *vp) {
    return vp ? vp->widget : NULL;
}

void video_player_play(VideoPlayer *vp) {
    if (vp) gst_element_set_state(vp->pipeline, GST_STATE_PLAYING);
}

void video_player_pause(VideoPlayer *vp) {
    if (vp) gst_element_set_state(vp->pipeline, GST_STATE_PAUSED);
}

void video_player_resume(VideoPlayer *vp) {
    if (vp) gst_element_set_state(vp->pipeline, GST_STATE_PLAYING);
}

void video_player_stop(VideoPlayer *vp) {
    if (vp) gst_element_set_state(vp->pipeline, GST_STATE_NULL);
}

gboolean video_player_is_paused(VideoPlayer *vp) {
    if (!vp) return FALSE;
    GstState state;
    gst_element_get_state(vp->pipeline, &state, NULL, 0);
    return state == GST_STATE_PAUSED;
}

gint64 video_player_position(VideoPlayer *vp) {
    if (!vp) return 0;
    gint64 pos = 0;
    gst_element_query_position(vp->pipeline, GST_FORMAT_TIME, &pos);
    return pos / GST_SECOND;
}

gint64 video_player_duration(VideoPlayer *vp) {
    if (!vp) return 0;
    gint64 dur = 0;
    gst_element_query_duration(vp->pipeline, GST_FORMAT_TIME, &dur);
    return dur / GST_SECOND;
}

void video_player_seek(VideoPlayer *vp, gint64 seconds) {
    if (!vp) return;
    gst_element_seek_simple(vp->pipeline, GST_FORMAT_TIME,
        GST_SEEK_FLAG_FLUSH | GST_SEEK_FLAG_KEY_UNIT,
        seconds * GST_SECOND);
}
