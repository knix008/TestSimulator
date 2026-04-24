#include <gst/gst.h>
#include <gst/rtsp-server/rtsp-server.h>

int main(int argc, char *argv[]) {
    GMainLoop *loop;
    GstRTSPServer *server;
    GstRTSPMountPoints *mounts;
    GstRTSPMediaFactory *factory;
    
    gst_init(&argc, &argv);
    
    loop = g_main_loop_new(NULL, FALSE);
    
    // Create RTSP server
    server = gst_rtsp_server_new();
    g_object_set(server, "service", "8554", NULL);
    
    // Get mount points
    mounts = gst_rtsp_server_get_mount_points(server);
    
    // Create media factory
    factory = gst_rtsp_media_factory_new();
    
    // Set pipeline - simple test pattern
    gst_rtsp_media_factory_set_launch(factory,
        "( videotestsrc is-live=true ! "
        "video/x-raw,width=640,height=480,framerate=30/1 ! "
        "x264enc tune=zerolatency bitrate=2000 speed-preset=superfast key-int-max=30 ! "
        "rtph264pay name=pay0 pt=96 config-interval=1 )");
    
    // Share the media (for live sources)
    gst_rtsp_media_factory_set_shared(factory, TRUE);
    
    // Add factory to mount point
    gst_rtsp_mount_points_add_factory(mounts, "/test", factory);
    g_object_unref(mounts);
    
    // Attach server to default main context
    gst_rtsp_server_attach(server, NULL);
    
    g_print("\n========================================\n");
    g_print("Simple RTSP Test Server Started!\n");
    g_print("========================================\n");
    g_print("Stream URL: rtsp://localhost:8554/test\n");
    g_print("========================================\n\n");
    g_print("Press Ctrl+C to stop\n\n");
    
    // Run main loop
    g_main_loop_run(loop);
    
    return 0;
}
