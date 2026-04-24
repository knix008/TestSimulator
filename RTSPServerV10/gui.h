#ifndef GUI_H
#define GUI_H

#include <gtk/gtk.h>
#include <gst/gst.h>
#include "rtsp_server.h"

typedef struct {
    GtkWidget *window;
    GtkWidget *start_button;
    GtkWidget *stop_button;
    GtkWidget *file_button;
    GtkWidget *webcam_button;
    GtkWidget *port_entry;
    GtkWidget *path_entry;
    GtkWidget *status_label;
    GtkWidget *clients_label;
    GtkWidget *file_chooser_button;
    
    // Playback controls
    GtkWidget *play_button;
    GtkWidget *pause_button;
    GtkWidget *stop_playback_button;
    GtkWidget *video_widget;        // GtkDrawingArea for embedded video
    GtkWidget *position_scale;
    GtkWidget *volume_scale;
    
    RTSPServerContext *server_ctx;
    gchar *selected_file;
    SourceType source_type;
    
    // Playback pipeline
    GstElement *playback_pipeline;
    GstElement *playback_sink;
    guintptr video_window_handle;
    gboolean is_playing;
    guint position_update_id;
    guint bus_watch_id;              // Bus message watch ID
    gboolean overlay_initialized;     // Track if overlay is set up
    gboolean seeking;                 // Track if user is seeking
} GUIContext;

GUIContext* gui_create(RTSPServerContext *server_ctx);
void gui_run(GUIContext *gui_ctx, int argc, char *argv[]);
void gui_free(GUIContext *gui_ctx);

#endif // GUI_H
