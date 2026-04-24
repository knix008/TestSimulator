#ifndef RTSP_SERVER_H
#define RTSP_SERVER_H

#include <gst/gst.h>
#include <gst/rtsp-server/rtsp-server.h>

typedef enum {
    SOURCE_FILE,
    SOURCE_WEBCAM,
    SOURCE_TEST
} SourceType;

typedef struct {
    GstRTSPServer *server;
    GstRTSPMountPoints *mounts;
    guint server_id;
    gchar *video_file;
    gboolean is_running;
    SourceType source_type;
    gint client_count;
    
    // Callback for client count updates
    void (*on_client_count_changed)(gint count, gpointer user_data);
    gpointer callback_data;
} RTSPServerContext;

RTSPServerContext* rtsp_server_new(void);
void rtsp_server_free(RTSPServerContext *ctx);

gboolean rtsp_server_start(RTSPServerContext *ctx, 
                           const gchar *port, 
                           const gchar *path,
                           SourceType source_type,
                           const gchar *video_file);

void rtsp_server_stop(RTSPServerContext *ctx);

gboolean rtsp_server_is_running(RTSPServerContext *ctx);

gint rtsp_server_get_client_count(RTSPServerContext *ctx);

void rtsp_server_set_client_callback(RTSPServerContext *ctx,
                                     void (*callback)(gint count, gpointer user_data),
                                     gpointer user_data);

#endif // RTSP_SERVER_H
