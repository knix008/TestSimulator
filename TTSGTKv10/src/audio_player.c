#include "audio_player.h"

#include <gst/gst.h>
#include <gst/app/gstappsrc.h>

#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* ── Internal state ──────────────────────────────────────────────────────── */

struct AudioPlayer {
    GstElement  *pipeline;
    GstAppSrc   *appsrc;
    GstElement  *volume_el;

    const AudioData *data;      /* current audio; owned by caller */
    int          pushed;        /* samples already pushed */
    bool         eos_sent;

    double       volume;
    bool         is_playing;

    PlayerCallback  cb;
    void           *cb_data;

    guint        timer_id;
    GMutex       mutex;         /* guards data / pushed / is_playing */
};

/* ── GStreamer callbacks ──────────────────────────────────────────────────── */

#define CHUNK_SAMPLES 4096   /* push in small chunks so mid-playback volume changes apply */

/* Called from GStreamer streaming thread when pipeline needs more data. */
static void need_data_cb(GstAppSrc *src, guint length, gpointer user_data)
{
    (void)length;
    AudioPlayer *p = user_data;

    g_mutex_lock(&p->mutex);

    if (!p->data || p->eos_sent) {
        g_mutex_unlock(&p->mutex);
        gst_app_src_end_of_stream(src);
        return;
    }

    int remaining = p->data->num_samples - p->pushed;
    if (remaining <= 0) {
        p->eos_sent = true;
        g_mutex_unlock(&p->mutex);
        gst_app_src_end_of_stream(src);
        return;
    }

    int chunk = remaining < CHUNK_SAMPLES ? remaining : CHUNK_SAMPLES;
    gsize bytes = (gsize)chunk * sizeof(int16_t);

    GstBuffer *buf = gst_buffer_new_allocate(NULL, bytes, NULL);

    GstMapInfo map;
    gst_buffer_map(buf, &map, GST_MAP_WRITE);
    memcpy(map.data, p->data->samples + p->pushed, bytes);
    gst_buffer_unmap(buf, &map);

    GST_BUFFER_PTS(buf) = gst_util_uint64_scale(
        (guint64)p->pushed, GST_SECOND, (guint64)p->data->sample_rate);
    GST_BUFFER_DURATION(buf) = gst_util_uint64_scale(
        (guint64)chunk, GST_SECOND, (guint64)p->data->sample_rate);

    p->pushed += chunk;
    bool last = (p->pushed >= p->data->num_samples);
    if (last) p->eos_sent = true;
    g_mutex_unlock(&p->mutex);

    GstFlowReturn ret = gst_app_src_push_buffer(src, buf);
    if (ret != GST_FLOW_OK)
        fprintf(stderr, "[player] push_buffer: %d\n", ret);

    if (last)
        gst_app_src_end_of_stream(src);
}

/* Called from GLib main loop via bus watch. */
static gboolean bus_cb(GstBus *bus, GstMessage *msg, gpointer user_data)
{
    (void)bus;
    AudioPlayer *p = user_data;

    switch (GST_MESSAGE_TYPE(msg)) {
    case GST_MESSAGE_EOS:
        gst_element_set_state(p->pipeline, GST_STATE_NULL);
        g_mutex_lock(&p->mutex);
        p->is_playing = false;
        g_mutex_unlock(&p->mutex);
        if (p->cb) p->cb(false, 1.0, p->cb_data);
        break;

    case GST_MESSAGE_ERROR: {
        GError *err = NULL; gchar *dbg = NULL;
        gst_message_parse_error(msg, &err, &dbg);
        fprintf(stderr, "[player] GStreamer error: %s\n%s\n",
                err ? err->message : "?", dbg ? dbg : "");
        g_clear_error(&err); g_free(dbg);
        gst_element_set_state(p->pipeline, GST_STATE_NULL);
        g_mutex_lock(&p->mutex);
        p->is_playing = false;
        g_mutex_unlock(&p->mutex);
        if (p->cb) p->cb(false, 0.0, p->cb_data);
        break;
    }
    default: break;
    }
    return TRUE;
}

/* Position update timer — runs on main thread at ~20 Hz. */
static gboolean position_tick(gpointer user_data)
{
    AudioPlayer *p = user_data;

    g_mutex_lock(&p->mutex);
    bool playing = p->is_playing;
    g_mutex_unlock(&p->mutex);

    if (!playing) {
        p->timer_id = 0;
        return G_SOURCE_REMOVE;
    }

    if (p->cb) {
        GstFormat fmt = GST_FORMAT_TIME;
        gint64    gst_pos = 0, gst_dur = 0;
        gst_element_query_position(p->pipeline, fmt, &gst_pos);
        gst_element_query_duration(p->pipeline, fmt, &gst_dur);

        double ratio;
        if (gst_dur > 0) {
            ratio = (double)gst_pos / (double)gst_dur;
        } else {
            /* appsrc pipelines often report duration=0; estimate from
               how many samples have been pushed to the pipeline.        */
            g_mutex_lock(&p->mutex);
            ratio = (p->data && p->data->num_samples > 0)
                    ? (double)p->pushed / p->data->num_samples : 0.0;
            if (ratio > 1.0) ratio = 1.0;
            g_mutex_unlock(&p->mutex);
        }
        p->cb(true, ratio, p->cb_data);
    }
    return G_SOURCE_CONTINUE;
}

/* ── Public API ──────────────────────────────────────────────────────────── */

AudioPlayer *audio_player_new(void)
{
    AudioPlayer *p = calloc(1, sizeof(AudioPlayer));
    p->volume = 1.0;
    g_mutex_init(&p->mutex);

    p->pipeline  = gst_pipeline_new("tts-player");
    GstElement *src      = gst_element_factory_make("appsrc",       "src");
    GstElement *convert  = gst_element_factory_make("audioconvert", "cvt");
    GstElement *resample = gst_element_factory_make("audioresample","res");
    p->volume_el         = gst_element_factory_make("volume",       "vol");
    GstElement *sink     = gst_element_factory_make("autoaudiosink","sink");

    if (!src || !convert || !resample || !p->volume_el || !sink) {
        fprintf(stderr, "[player] Failed to create GStreamer elements\n");
        return p;
    }

    gst_bin_add_many(GST_BIN(p->pipeline),
                     src, convert, resample, p->volume_el, sink, NULL);
    gst_element_link_many(src, convert, resample, p->volume_el, sink, NULL);

    p->appsrc = GST_APP_SRC(src);
    g_object_set(src,
                 "stream-type", 0,              /* GST_APP_STREAM_TYPE_STREAM */
                 "format",      GST_FORMAT_TIME,
                 "is-live",     FALSE,
                 "max-bytes",   (guint64)(100 * 1024 * 1024),
                 NULL);
    g_signal_connect(src, "need-data", G_CALLBACK(need_data_cb), p);

    GstBus *bus = gst_element_get_bus(p->pipeline);
    gst_bus_add_watch(bus, bus_cb, p);
    gst_object_unref(bus);

    return p;
}

bool audio_player_play(AudioPlayer *p, const AudioData *data)
{
    /* Stop any running playback synchronously */
    audio_player_stop(p);

    /* Configure appsrc caps to match this audio */
    GstCaps *caps = gst_caps_new_simple("audio/x-raw",
        "format",   G_TYPE_STRING, "S16LE",
        "channels", G_TYPE_INT,    data->channels,
        "rate",     G_TYPE_INT,    data->sample_rate,
        "layout",   G_TYPE_STRING, "interleaved",
        NULL);
    g_object_set(p->appsrc, "caps", caps, NULL);
    gst_caps_unref(caps);

    g_object_set(p->volume_el, "volume", p->volume, NULL);

    g_mutex_lock(&p->mutex);
    p->data       = data;
    p->pushed     = 0;
    p->eos_sent   = false;
    p->is_playing = true;
    g_mutex_unlock(&p->mutex);

    gst_element_set_state(p->pipeline, GST_STATE_PLAYING);

    p->timer_id = g_timeout_add(50, position_tick, p);
    return true;
}

void audio_player_stop(AudioPlayer *p)
{
    if (p->timer_id) {
        g_source_remove(p->timer_id);
        p->timer_id = 0;
    }

    gst_element_set_state(p->pipeline, GST_STATE_NULL);
    /* Wait for NULL state (fast for NULL) */
    gst_element_get_state(p->pipeline, NULL, NULL, 2 * GST_SECOND);

    g_mutex_lock(&p->mutex);
    p->is_playing = false;
    p->pushed     = 0;
    p->eos_sent   = false;
    g_mutex_unlock(&p->mutex);
}

void audio_player_set_volume(AudioPlayer *p, double volume)
{
    p->volume = volume;
    if (p->volume_el)
        g_object_set(p->volume_el, "volume", volume, NULL);
}

bool audio_player_is_playing(AudioPlayer *p)
{
    g_mutex_lock(&p->mutex);
    bool v = p->is_playing;
    g_mutex_unlock(&p->mutex);
    return v;
}

double audio_player_get_position(AudioPlayer *p)
{
    GstFormat fmt = GST_FORMAT_TIME;
    gint64 pos = 0, dur = 0;
    gst_element_query_position(p->pipeline, fmt, &pos);
    gst_element_query_duration(p->pipeline, fmt, &dur);
    return (dur > 0) ? (double)pos / (double)dur : 0.0;
}

void audio_player_set_callback(AudioPlayer *p, PlayerCallback cb, void *user_data)
{
    p->cb      = cb;
    p->cb_data = user_data;
}

void audio_player_free(AudioPlayer *p)
{
    audio_player_stop(p);
    gst_object_unref(p->pipeline);
    g_mutex_clear(&p->mutex);
    free(p);
}
