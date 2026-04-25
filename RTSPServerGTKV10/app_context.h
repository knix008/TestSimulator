#ifndef APP_CONTEXT_H
#define APP_CONTEXT_H

#include <gtk/gtk.h>
#include <gst/gst.h>
#include <gst/rtsp-server/rtsp-server.h>

typedef gboolean (*MediaOpenedCallback)(const char *video_file_path, gpointer user_data);

typedef struct {
    GtkWidget *window;
    GtkWidget *video_overlay;
    GtkWidget *video_area;
    GtkWidget *state_icon;
    GtkWidget *play_button;
    GtkWidget *pause_button;
    GtkWidget *stop_button;
    GtkWidget *open_button;
    GtkWidget *progress_scale;
    GtkWidget *time_label;
    GtkWidget *status_label;
    GtkWidget *rtsp_port_entry;
    GtkWidget *rtsp_mount_entry;
    GtkWidget *rtsp_start_button;
    GtkWidget *rtsp_stop_button;
    GtkWidget *rtsp_url_label;
    GtkWidget *rtsp_log_view;
    GtkTextBuffer *rtsp_log_buffer;

    GstElement *play_pipeline;
    GstElement *video_sink;
    GstRTSPServer *rtsp_server;
    GstRTSPMediaFactory *media_factory;
    guint rtsp_attach_id;

    gboolean is_paused;
    gboolean has_media;
    gboolean is_seeking;
    guint hide_play_icon_timeout_id;
    char *current_media_path;
    MediaOpenedCallback on_media_opened;
    gpointer on_media_opened_user_data;
} App;

#endif
