#include <gst/gst.h>
#include <gst/rtsp-server/rtsp-server.h>

#define DEFAULT_PORT "8554"
#define DEFAULT_MOUNT "/stream"

static gchar *build_launch_for_file(const char *video_file_path) {
    return g_strdup_printf(
        "( filesrc location=\"%s\" ! decodebin ! videoconvert ! x264enc tune=zerolatency speed-preset=ultrafast bitrate=1500 "
        "! rtph264pay name=pay0 pt=96 )",
        video_file_path);
}

static gchar *build_default_launch(void) {
    return g_strdup(
        "( videotestsrc is-live=true pattern=smpte ! videoconvert ! x264enc tune=zerolatency speed-preset=ultrafast bitrate=1000 "
        "! rtph264pay name=pay0 pt=96 )");
}

int main(int argc, char *argv[]) {
    gst_init(&argc, &argv);

    const char *video_path = (argc >= 2) ? argv[1] : NULL;
    gchar *launch = video_path ? build_launch_for_file(video_path) : build_default_launch();
    if (!launch) {
        g_printerr("Failed to prepare RTSP pipeline\n");
        return 1;
    }

    GstRTSPServer *server = gst_rtsp_server_new();
    GstRTSPMediaFactory *factory = gst_rtsp_media_factory_new();
    gst_rtsp_server_set_service(server, DEFAULT_PORT);
    gst_rtsp_media_factory_set_shared(factory, TRUE);
    gst_rtsp_media_factory_set_launch(factory, launch);

    GstRTSPMountPoints *mounts = gst_rtsp_server_get_mount_points(server);
    gst_rtsp_mount_points_add_factory(mounts, DEFAULT_MOUNT, factory);
    g_object_unref(mounts);
    g_free(launch);

    if (gst_rtsp_server_attach(server, NULL) == 0) {
        g_printerr("Failed to attach RTSP server\n");
        g_object_unref(server);
        return 1;
    }

    if (video_path) {
        g_print("RTSP server started at rtsp://127.0.0.1:%s%s (source: %s)\n", DEFAULT_PORT, DEFAULT_MOUNT, video_path);
    } else {
        g_print("RTSP server started at rtsp://127.0.0.1:%s%s (source: test pattern)\n", DEFAULT_PORT, DEFAULT_MOUNT);
    }

    GMainLoop *loop = g_main_loop_new(NULL, FALSE);
    g_main_loop_run(loop);

    g_main_loop_unref(loop);
    g_object_unref(server);
    return 0;
}
