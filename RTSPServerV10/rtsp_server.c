#include "rtsp_server.h"
#include <string.h>

static void on_client_connected(GstRTSPClient *client, gpointer user_data) {
    RTSPServerContext *ctx = (RTSPServerContext *)user_data;
    ctx->client_count++;
    g_print("Client connected! Total: %d\n", ctx->client_count);
    
    if (ctx->on_client_count_changed) {
        ctx->on_client_count_changed(ctx->client_count, ctx->callback_data);
    }
}

RTSPServerContext* rtsp_server_new(void) {
    RTSPServerContext *ctx = g_new0(RTSPServerContext, 1);
    ctx->is_running = FALSE;
    ctx->client_count = 0;
    ctx->video_file = NULL;
    ctx->server = NULL;
    ctx->mounts = NULL;
    ctx->server_id = 0;
    ctx->on_client_count_changed = NULL;
    ctx->callback_data = NULL;
    return ctx;
}

void rtsp_server_free(RTSPServerContext *ctx) {
    if (!ctx) return;
    
    rtsp_server_stop(ctx);
    
    if (ctx->video_file) {
        g_free(ctx->video_file);
    }
    
    g_free(ctx);
}

gboolean rtsp_server_start(RTSPServerContext *ctx, 
                           const gchar *port, 
                           const gchar *path,
                           SourceType source_type,
                           const gchar *video_file) {
    if (!ctx || ctx->is_running) {
        g_printerr("ERROR: Server already running or context is NULL\n");
        return FALSE;
    }
    
    if (source_type == SOURCE_FILE && (!video_file || strlen(video_file) == 0)) {
        g_printerr("ERROR: Video file not specified\n");
        return FALSE;
    }
    
    g_print("\n========================================\n");
    g_print("Starting RTSP Server...\n");
    g_print("========================================\n");
    
    // Create RTSP server
    ctx->server = gst_rtsp_server_new();
    g_object_set(ctx->server, "service", port, NULL);
    g_print("RTSP server created (port: %s)\n", port);
    
    // Get mount points
    ctx->mounts = gst_rtsp_server_get_mount_points(ctx->server);
    GstRTSPMediaFactory *factory = gst_rtsp_media_factory_new();
    
    // Setup pipeline
    gchar *pipeline;
    if (source_type == SOURCE_TEST) {
        g_print("Test pattern streaming mode\n");
        pipeline = g_strdup(
            "( videotestsrc is-live=true ! "
            "video/x-raw,width=640,height=480,framerate=30/1 ! "
            "x264enc tune=zerolatency bitrate=2000 speed-preset=superfast key-int-max=30 ! "
            "rtph264pay name=pay0 pt=96 config-interval=1 )"
        );
    } else if (source_type == SOURCE_WEBCAM) {
        g_print("Webcam streaming mode\n");
        pipeline = g_strdup(
            "( ksvideosrc ! videoconvert ! "
            "x264enc tune=zerolatency bitrate=2000 speed-preset=ultrafast ! "
            "rtph264pay name=pay0 pt=96 )"
        );
    } else {
        g_print("File streaming mode\n");
        g_print("  File: %s\n", video_file);
        
        // Check file exists
        if (!g_file_test(video_file, G_FILE_TEST_EXISTS)) {
            g_printerr("ERROR: File not found: %s\n", video_file);
            g_object_unref(factory);
            g_object_unref(ctx->mounts);
            g_object_unref(ctx->server);
            ctx->mounts = NULL;
            ctx->server = NULL;
            return FALSE;
        }
        
        // Convert Windows path to URI format
        gchar *uri;
        if (g_path_is_absolute(video_file)) {
            GFile *file = g_file_new_for_path(video_file);
            uri = g_file_get_uri(file);
            g_object_unref(file);
        } else {
            uri = g_strdup(video_file);
        }
        
        g_print("  URI: %s\n", uri);
        
        // File streaming pipeline - universal format support
        // Using filesrc + decodebin3 for better compatibility
        pipeline = g_strdup_printf(
            "( filesrc location=\"%s\" ! "
            "decodebin3 ! videoconvert ! video/x-raw ! "
            "x264enc tune=zerolatency bitrate=2000 speed-preset=ultrafast key-int-max=30 bframes=0 ! "
            "rtph264pay name=pay0 pt=96 config-interval=1 )",
            video_file
        );
        
        g_free(uri);
    }
    
    g_print("Pipeline: %s\n", pipeline);
    
    gst_rtsp_media_factory_set_launch(factory, pipeline);
    
    // For file sources, don't share the media to avoid EOS issues
    // For test sources, sharing is fine
    if (source_type == SOURCE_FILE) {
        gst_rtsp_media_factory_set_shared(factory, FALSE);
        gst_rtsp_media_factory_set_eos_shutdown(factory, FALSE);
        g_print("Media sharing: DISABLED (file source)\n");
    } else {
        gst_rtsp_media_factory_set_shared(factory, TRUE);
        g_print("Media sharing: ENABLED (live source)\n");
    }
    
    // Add factory to mount point
    gchar *mount_path = g_strdup_printf("/%s", path);
    gst_rtsp_mount_points_add_factory(ctx->mounts, mount_path, factory);
    g_print("Mount path: %s\n", mount_path);
    
    // Attach server to main loop
    g_print("Attaching server to main loop...\n");
    ctx->server_id = gst_rtsp_server_attach(ctx->server, NULL);
    
    if (ctx->server_id == 0) {
        g_printerr("ERROR: Failed to attach server to main loop\n");
        g_object_unref(ctx->mounts);
        g_object_unref(ctx->server);
        ctx->mounts = NULL;
        ctx->server = NULL;
        g_free(pipeline);
        g_free(mount_path);
        return FALSE;
    }
    
    g_print("Server attached (Source ID: %u)\n", ctx->server_id);
    
    // Connect client signal
    g_signal_connect(ctx->server, "client-connected", 
                     G_CALLBACK(on_client_connected), ctx);
    
    ctx->is_running = TRUE;
    ctx->source_type = source_type;
    ctx->client_count = 0;
    
    if (source_type == SOURCE_FILE && video_file) {
        if (ctx->video_file) {
            g_free(ctx->video_file);
        }
        ctx->video_file = g_strdup(video_file);
    }
    
    g_print("\n========================================\n");
    g_print("RTSP Server Started Successfully!\n");
    g_print("========================================\n");
    g_print("Stream URL: rtsp://localhost:%s%s\n", port, mount_path);
    g_print("========================================\n");
    g_print("\nConnect with:\n");
    g_print("  VLC: Media -> Open Network Stream\n");
    g_print("  ffplay: ffplay rtsp://localhost:%s%s\n", port, mount_path);
    g_print("  GStreamer: gst-launch-1.0 playbin uri=rtsp://localhost:%s%s\n\n", port, mount_path);
    
    g_free(pipeline);
    g_free(mount_path);
    
    return TRUE;
}

void rtsp_server_stop(RTSPServerContext *ctx) {
    if (!ctx || !ctx->is_running) {
        return;
    }
    
    // Stop server
    if (ctx->server_id) {
        g_source_remove(ctx->server_id);
        ctx->server_id = 0;
    }
    
    if (ctx->mounts) {
        g_object_unref(ctx->mounts);
        ctx->mounts = NULL;
    }
    
    if (ctx->server) {
        g_object_unref(ctx->server);
        ctx->server = NULL;
    }
    
    ctx->is_running = FALSE;
    ctx->client_count = 0;
    
    g_print("RTSP server stopped\n");
}

gboolean rtsp_server_is_running(RTSPServerContext *ctx) {
    return ctx && ctx->is_running;
}

gint rtsp_server_get_client_count(RTSPServerContext *ctx) {
    return ctx ? ctx->client_count : 0;
}

void rtsp_server_set_client_callback(RTSPServerContext *ctx,
                                     void (*callback)(gint count, gpointer user_data),
                                     gpointer user_data) {
    if (!ctx) return;
    ctx->on_client_count_changed = callback;
    ctx->callback_data = user_data;
}
