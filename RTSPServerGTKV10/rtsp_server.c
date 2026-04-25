#include "rtsp_server.h"

static void rtsp_append_log(App *app, const char *message) {
    if (!message) {
        return;
    }
    g_print("%s\n", message);
    if (!app || !app->rtsp_log_buffer) {
        return;
    }
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(app->rtsp_log_buffer, &end);
    gtk_text_buffer_insert(app->rtsp_log_buffer, &end, message, -1);
    gtk_text_buffer_insert(app->rtsp_log_buffer, &end, "\n", -1);
}

static void on_client_connected(GstRTSPServer *server, GstRTSPClient *client, gpointer user_data) {
    (void)server;
    App *app = (App *)user_data;
    const GstRTSPConnection *conn = gst_rtsp_client_get_connection(client);
    const gchar *ip = conn ? gst_rtsp_connection_get_ip(conn) : NULL;
    gchar *msg = g_strdup_printf("[RTSP] Client connected: %s", (ip && *ip) ? ip : "unknown");
    rtsp_append_log(app, msg);
    g_free(msg);
}

static gchar *build_launch_default(void) {
    return g_strdup(
        "( "
        "videotestsrc is-live=true pattern=smpte ! queue ! videoconvert ! "
        "x264enc tune=zerolatency speed-preset=ultrafast bitrate=1000 key-int-max=30 ! "
        "video/x-h264,profile=baseline ! h264parse config-interval=1 ! "
        "rtph264pay name=pay0 pt=96 "
        "audiotestsrc is-live=true wave=sine freq=440 ! queue ! audioconvert ! audioresample ! "
        "audio/x-raw,rate=48000,channels=2 ! "
        "avenc_aac bitrate=128000 ! rtpmp4gpay name=pay1 pt=97 "
        ")");
}

static gchar *build_launch_for_file(const char *video_file_path) {
    gchar *uri = gst_filename_to_uri(video_file_path, NULL);
    if (!uri) {
        return NULL;
    }

    gchar *launch = g_strdup_printf(
        "( "
        "uridecodebin uri=\"%s\" name=dec "
        "dec. ! queue ! videoconvert ! "
        "x264enc tune=zerolatency speed-preset=ultrafast bitrate=1500 key-int-max=30 ! "
        "video/x-h264,profile=baseline ! h264parse config-interval=1 ! "
        "rtph264pay name=pay0 pt=96 "
        "dec. ! queue ! audioconvert ! audioresample ! "
        "audio/x-raw,rate=48000,channels=2 ! "
        "avenc_aac bitrate=128000 ! rtpmp4gpay name=pay1 pt=97 "
        ")",
        uri);

    g_free(uri);
    return launch;
}

gboolean rtsp_server_is_running(const App *app) {
    return app && app->rtsp_attach_id != 0;
}

void rtsp_server_stop(App *app) {
    if (!app) {
        return;
    }

    if (app->rtsp_attach_id != 0) {
        g_source_remove(app->rtsp_attach_id);
        app->rtsp_attach_id = 0;
    }
    if (app->media_factory) {
        g_object_unref(app->media_factory);
        app->media_factory = NULL;
    }
    if (app->rtsp_server) {
        g_object_unref(app->rtsp_server);
        app->rtsp_server = NULL;
    }
}

gboolean rtsp_server_start(App *app, const char *mount_point, const char *port, const char *video_file_path) {
    if (!app || !mount_point || !*mount_point || !port || !*port) {
        return FALSE;
    }

    rtsp_server_stop(app);

    app->rtsp_server = gst_rtsp_server_new();
    if (!app->rtsp_server) {
        return FALSE;
    }

    g_object_set(app->rtsp_server, "address", "0.0.0.0", NULL);
    g_object_set(app->rtsp_server, "service", port, NULL);
    g_signal_connect(app->rtsp_server, "client-connected", G_CALLBACK(on_client_connected), app);

    app->media_factory = gst_rtsp_media_factory_new();
    if (!app->media_factory) {
        rtsp_server_stop(app);
        return FALSE;
    }

    gst_rtsp_media_factory_set_shared(app->media_factory, TRUE);
    gst_rtsp_media_factory_set_protocols(
        app->media_factory,
        GST_RTSP_LOWER_TRANS_TCP | GST_RTSP_LOWER_TRANS_UDP | GST_RTSP_LOWER_TRANS_UDP_MCAST);

    gchar *launch = video_file_path ? build_launch_for_file(video_file_path) : build_launch_default();
    if (!launch) {
        rtsp_server_stop(app);
        return FALSE;
    }
    gst_rtsp_media_factory_set_launch(app->media_factory, launch);
    g_free(launch);

    GstRTSPMountPoints *mounts = gst_rtsp_server_get_mount_points(app->rtsp_server);
    gst_rtsp_mount_points_add_factory(mounts, mount_point, g_object_ref(app->media_factory));
    g_object_unref(mounts);

    app->rtsp_attach_id = gst_rtsp_server_attach(app->rtsp_server, NULL);
    if (app->rtsp_attach_id == 0) {
        rtsp_server_stop(app);
        return FALSE;
    }

    gchar *msg = g_strdup_printf("[RTSP] Server ready on rtsp://127.0.0.1:%s%s", port, mount_point);
    rtsp_append_log(app, msg);
    g_free(msg);
    return TRUE;
}

gboolean rtsp_server_set_source(App *app, const char *video_file_path, const char *mount_point) {
    (void)mount_point;
    if (!app || !app->media_factory || !video_file_path) {
        return FALSE;
    }

    gchar *launch = build_launch_for_file(video_file_path);
    if (!launch) {
        return FALSE;
    }

    gst_rtsp_media_factory_set_launch(app->media_factory, launch);
    g_free(launch);
    rtsp_append_log(app, "[RTSP] Media source updated.");
    return TRUE;
}
