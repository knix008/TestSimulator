#include "gui.h"
#include <gdk/gdk.h>
#include <gst/video/videooverlay.h>
#include <string.h>

#ifdef GDK_WINDOWING_WIN32
#include <gdk/gdkwin32.h>
#endif

#ifdef __APPLE__
#include <gdk/gdkquartz.h>
#endif

#ifdef GDK_WINDOWING_X11
#include <gdk/gdkx.h>
#endif

static void update_status(GUIContext *gui, const gchar *status) {
    gtk_label_set_text(GTK_LABEL(gui->status_label), status);
}

static void update_client_count(gint count, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    gchar *text = g_strdup_printf("연결된 클라이언트: %d", count);
    gtk_label_set_text(GTK_LABEL(gui->clients_label), text);
    g_free(text);
}

// Forward declarations
static void stop_playback(GUIContext *gui);
static void video_widget_realize_cb(GtkWidget *widget, GUIContext *gui);
static void on_position_scale_changed(GtkRange *range, gpointer user_data);

// Position update callback
static gboolean update_position(gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    
    if (!gui->playback_pipeline || !gui->is_playing || gui->seeking) {
        return TRUE;
    }
    
    gint64 current, duration;
    
    if (gst_element_query_position(gui->playback_pipeline, GST_FORMAT_TIME, &current) &&
        gst_element_query_duration(gui->playback_pipeline, GST_FORMAT_TIME, &duration)) {
        
        if (duration > 0) {
            gdouble position = (gdouble)current / duration;
            
            // Block the value-changed signal to prevent seek during update
            g_signal_handlers_block_by_func(gui->position_scale, 
                                           G_CALLBACK(on_position_scale_changed), gui);
            gtk_range_set_value(GTK_RANGE(gui->position_scale), position * 100.0);
            g_signal_handlers_unblock_by_func(gui->position_scale, 
                                             G_CALLBACK(on_position_scale_changed), gui);
            
            gchar *pos_str = g_strdup_printf("재생 중: %02d:%02d / %02d:%02d",
                                            (gint)(current / GST_SECOND / 60),
                                            (gint)((current / GST_SECOND) % 60),
                                            (gint)(duration / GST_SECOND / 60),
                                            (gint)((duration / GST_SECOND) % 60));
            gtk_button_set_label(GTK_BUTTON(gui->play_button), pos_str);
            g_free(pos_str);
        }
    }
    
    return TRUE;
}

// Draw callback for video widget - paint black background
static gboolean on_video_widget_draw(GtkWidget *widget, cairo_t *cr, gpointer user_data) {
    // Fill with black
    cairo_set_source_rgb(cr, 0.0, 0.0, 0.0);
    cairo_paint(cr);
    return FALSE;  // Allow other handlers to process
}

// Video widget realize callback - set up video overlay
static void video_widget_realize_cb(GtkWidget *widget, GUIContext *gui) {
    GdkWindow *window = gtk_widget_get_window(widget);
    
    if (!window) {
        g_printerr("Failed to get GDK window\n");
        return;
    }
    
    if (!gdk_window_ensure_native(window)) {
        g_printerr("Failed to create native window\n");
        return;
    }
    
    guintptr window_handle = 0;
    
#ifdef GDK_WINDOWING_WIN32
    window_handle = (guintptr)GDK_WINDOW_HWND(window);
#elif defined(GDK_WINDOWING_X11)
    window_handle = GDK_WINDOW_XID(window);
#elif defined(__APPLE__)
    window_handle = (guintptr)gdk_quartz_window_get_nsview(window);
#endif
    
    if (window_handle && gui->playback_pipeline) {
        GstElement *video_sink = NULL;
        g_object_get(gui->playback_pipeline, "video-sink", &video_sink, NULL);
        
        if (video_sink && GST_IS_VIDEO_OVERLAY(video_sink)) {
            gst_video_overlay_set_window_handle(GST_VIDEO_OVERLAY(video_sink), window_handle);
            gst_object_unref(video_sink);
        }
    }
}

// GStreamer bus message handler
static gboolean on_bus_message(GstBus *bus, GstMessage *message, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    
    switch (GST_MESSAGE_TYPE(message)) {
        case GST_MESSAGE_EOS:
            // End of stream - stop playback
            g_print("End of stream reached\n");
            stop_playback(gui);
            update_status(gui, "재생 종료");
            break;
            
        case GST_MESSAGE_ERROR: {
            GError *err = NULL;
            gchar *debug_info = NULL;
            gst_message_parse_error(message, &err, &debug_info);
            g_printerr("Error from %s: %s\n",
                      GST_OBJECT_NAME(message->src),
                      err->message);
            if (debug_info) {
                g_printerr("Debug info: %s\n", debug_info);
            }
            g_clear_error(&err);
            g_free(debug_info);
            
            stop_playback(gui);
            update_status(gui, "재생 오류 발생");
            break;
        }
        
        case GST_MESSAGE_WARNING: {
            GError *err = NULL;
            gchar *debug_info = NULL;
            gst_message_parse_warning(message, &err, &debug_info);
            g_warning("Warning from %s: %s\n",
                     GST_OBJECT_NAME(message->src),
                     err->message);
            g_clear_error(&err);
            g_free(debug_info);
            break;
        }
        
        case GST_MESSAGE_STATE_CHANGED: {
            if (GST_MESSAGE_SRC(message) == GST_OBJECT(gui->playback_pipeline)) {
                GstState old_state, new_state, pending_state;
                gst_message_parse_state_changed(message, &old_state, &new_state, &pending_state);
                // State tracking only - overlay is set in start_playback
            }
            break;
        }
        
        default:
            break;
    }
    
    return TRUE;
}

// Stop playback
static void stop_playback(GUIContext *gui) {
    if (gui->playback_pipeline) {
        gst_element_set_state(gui->playback_pipeline, GST_STATE_NULL);
        g_object_unref(gui->playback_pipeline);
        gui->playback_pipeline = NULL;
    }
    
    if (gui->position_update_id) {
        g_source_remove(gui->position_update_id);
        gui->position_update_id = 0;
    }
    
    if (gui->bus_watch_id) {
        g_source_remove(gui->bus_watch_id);
        gui->bus_watch_id = 0;
    }
    
    gui->is_playing = FALSE;
    gui->overlay_initialized = FALSE;
    gtk_button_set_label(GTK_BUTTON(gui->play_button), "▶ 재생");
    gtk_widget_set_sensitive(gui->play_button, TRUE);
    gtk_widget_set_sensitive(gui->pause_button, FALSE);
    gtk_widget_set_sensitive(gui->stop_playback_button, FALSE);
    gtk_range_set_value(GTK_RANGE(gui->position_scale), 0.0);
}

// Start playback with current file
static void start_playback(GUIContext *gui) {
    if (!gui->selected_file) {
        update_status(gui, "재생할 파일을 선택해주세요.");
        return;
    }
    
    // Stop any existing playback
    if (gui->playback_pipeline) {
        gst_element_set_state(gui->playback_pipeline, GST_STATE_NULL);
        
        // Remove existing bus watch
        if (gui->bus_watch_id) {
            g_source_remove(gui->bus_watch_id);
            gui->bus_watch_id = 0;
        }
        
        g_object_unref(gui->playback_pipeline);
        gui->playback_pipeline = NULL;
        gui->overlay_initialized = FALSE;
    }
    
    // Create new pipeline
    gchar *uri = g_filename_to_uri(gui->selected_file, NULL, NULL);
    gui->playback_pipeline = gst_element_factory_make("playbin", "player");
    
    if (!gui->playback_pipeline) {
        update_status(gui, "플레이어 생성 실패!");
        return;
    }
    
    g_object_set(G_OBJECT(gui->playback_pipeline), "uri", uri, NULL);
    g_free(uri);
    
    // Configure buffer settings for smooth playback
    g_object_set(G_OBJECT(gui->playback_pipeline),
                 "buffer-size", 1048576,     // 1MB buffer
                 "buffer-duration", 2000000000,  // 2 seconds in nanoseconds
                 NULL);
    
    // Set up bus message handler (only once)
    GstBus *bus = gst_element_get_bus(gui->playback_pipeline);
    gui->bus_watch_id = gst_bus_add_watch(bus, (GstBusFunc)on_bus_message, gui);
    gst_object_unref(bus);
    
    // Create video sink with overlay support
    GstElement *video_sink = NULL;
    
#ifdef GDK_WINDOWING_WIN32
    // Windows: Use d3dvideosink or directdrawsink for embedding
    video_sink = gst_element_factory_make("d3dvideosink", "videosink");
    if (!video_sink) {
        video_sink = gst_element_factory_make("directdrawsink", "videosink");
    }
#elif defined(__APPLE__)
    // macOS: Use glimagesink
    video_sink = gst_element_factory_make("glimagesink", "videosink");
#else
    // Linux: Use xvimagesink or ximagesink
    video_sink = gst_element_factory_make("xvimagesink", "videosink");
    if (!video_sink) {
        video_sink = gst_element_factory_make("ximagesink", "videosink");
    }
#endif
    
    if (!video_sink) {
        // Fallback to autovideosink
        video_sink = gst_element_factory_make("autovideosink", "videosink");
    }
    
    if (video_sink) {
        g_object_set(G_OBJECT(gui->playback_pipeline), "video-sink", video_sink, NULL);
        // Disable sync for smoother playback if needed
        // g_object_set(video_sink, "sync", TRUE, NULL);
    }
    
    // Set up video overlay if video widget is realized (only once)
    if (!gui->overlay_initialized && gtk_widget_get_realized(gui->video_widget)) {
        video_widget_realize_cb(gui->video_widget, gui);
        gui->overlay_initialized = TRUE;
    }
    
    // Set volume
    gdouble volume = gtk_range_get_value(GTK_RANGE(gui->volume_scale)) / 100.0;
    g_object_set(G_OBJECT(gui->playback_pipeline), "volume", volume, NULL);
    
    // Start playing
    GstStateChangeReturn ret = gst_element_set_state(gui->playback_pipeline, GST_STATE_PLAYING);
    
    if (ret == GST_STATE_CHANGE_FAILURE) {
        update_status(gui, "재생 시작 실패!");
        gst_object_unref(gui->playback_pipeline);
        gui->playback_pipeline = NULL;
        return;
    }
    
    gui->is_playing = TRUE;
    gtk_button_set_label(GTK_BUTTON(gui->play_button), "재생 중...");
    gtk_widget_set_sensitive(gui->pause_button, TRUE);
    gtk_widget_set_sensitive(gui->stop_playback_button, TRUE);
    
    // Start position update timer
    if (gui->position_update_id == 0) {
        gui->position_update_id = g_timeout_add(500, update_position, gui);
    }
    
    gchar *basename = g_path_get_basename(gui->selected_file);
    gchar *status = g_strdup_printf("재생 중: %s", basename);
    update_status(gui, status);
    g_free(status);
    g_free(basename);
}

// Play button callback
static void on_play_button_clicked(GtkButton *button, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    
    if (!gui->selected_file) {
        update_status(gui, "재생할 파일을 선택해주세요.");
        return;
    }
    
    // If paused, resume playback
    if (gui->playback_pipeline && !gui->is_playing) {
        gst_element_set_state(gui->playback_pipeline, GST_STATE_PLAYING);
        gui->is_playing = TRUE;
        gtk_button_set_label(GTK_BUTTON(button), "재생 중...");
        gtk_widget_set_sensitive(gui->pause_button, TRUE);
        update_status(gui, "재생 재개");
        return;
    }
    
    // If already playing, restart from beginning
    if (gui->is_playing) {
        start_playback(gui);
        return;
    }
    
    // Start new playback
    start_playback(gui);
}

// Pause button callback
static void on_pause_button_clicked(GtkButton *button, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    
    if (gui->playback_pipeline && gui->is_playing) {
        gst_element_set_state(gui->playback_pipeline, GST_STATE_PAUSED);
        gui->is_playing = FALSE;
        gtk_button_set_label(GTK_BUTTON(gui->play_button), "▶ 계속");
        gtk_widget_set_sensitive(gui->pause_button, FALSE);
        update_status(gui, "일시정지");
    }
}

// Stop playback button callback
static void on_stop_playback_button_clicked(GtkButton *button, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    stop_playback(gui);
    update_status(gui, "재생 중지");
}

// Reset seeking flag callback
static gboolean reset_seeking_flag(gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    gui->seeking = FALSE;
    return FALSE;  // Remove this timeout
}

// Position scale changed callback
static void on_position_scale_changed(GtkRange *range, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    
    if (!gui->playback_pipeline || gui->seeking) {
        return;
    }
    
    // User is manually seeking
    gui->seeking = TRUE;
    
    gdouble value = gtk_range_get_value(range);
    gint64 duration;
    
    if (gst_element_query_duration(gui->playback_pipeline, GST_FORMAT_TIME, &duration)) {
        gint64 position = (gint64)((value / 100.0) * duration);
        gst_element_seek_simple(gui->playback_pipeline, GST_FORMAT_TIME,
                               GST_SEEK_FLAG_FLUSH | GST_SEEK_FLAG_KEY_UNIT,
                               position);
    }
    
    // Reset seeking flag after a short delay
    g_timeout_add(200, reset_seeking_flag, gui);
}

// Volume scale changed callback
static void on_volume_scale_changed(GtkRange *range, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    
    if (gui->playback_pipeline) {
        gdouble volume = gtk_range_get_value(range) / 100.0;
        g_object_set(G_OBJECT(gui->playback_pipeline), "volume", volume, NULL);
    }
}

static void on_start_button_clicked(GtkButton *button, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    
    if (rtsp_server_is_running(gui->server_ctx)) {
        update_status(gui, "이미 실행 중입니다.");
        return;
    }
    
    const gchar *port_text = gtk_entry_get_text(GTK_ENTRY(gui->port_entry));
    const gchar *path_text = gtk_entry_get_text(GTK_ENTRY(gui->path_entry));
    
    if (strlen(port_text) == 0 || strlen(path_text) == 0) {
        update_status(gui, "포트와 경로를 입력해주세요.");
        return;
    }
    
    if (gui->source_type == SOURCE_FILE && (!gui->selected_file || strlen(gui->selected_file) == 0)) {
        update_status(gui, "비디오 파일을 선택해주세요.");
        return;
    }
    
    gboolean success = rtsp_server_start(gui->server_ctx, port_text, path_text, 
                                         gui->source_type, gui->selected_file);
    
    if (success) {
        gchar *url;
        if (gui->source_type == SOURCE_WEBCAM) {
            url = g_strdup_printf("RTSP 서버 시작됨 (웹캠)\nrtsp://localhost:%s/%s", 
                                 port_text, path_text);
        } else {
            url = g_strdup_printf("RTSP 서버 시작됨 (파일)\nrtsp://localhost:%s/%s", 
                                 port_text, path_text);
        }
        update_status(gui, url);
        g_free(url);
        
        gtk_widget_set_sensitive(gui->start_button, FALSE);
        gtk_widget_set_sensitive(gui->stop_button, TRUE);
        gtk_widget_set_sensitive(gui->file_button, FALSE);
        gtk_widget_set_sensitive(gui->webcam_button, FALSE);
        gtk_widget_set_sensitive(gui->port_entry, FALSE);
        gtk_widget_set_sensitive(gui->path_entry, FALSE);
        gtk_widget_set_sensitive(gui->file_chooser_button, FALSE);
    } else {
        update_status(gui, "서버 시작 실패!");
    }
}

static void on_stop_button_clicked(GtkButton *button, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    
    if (!rtsp_server_is_running(gui->server_ctx)) {
        update_status(gui, "서버가 실행 중이 아닙니다.");
        return;
    }
    
    rtsp_server_stop(gui->server_ctx);
    update_status(gui, "RTSP 서버 중지됨");
    update_client_count(0, gui);
    
    gtk_widget_set_sensitive(gui->start_button, TRUE);
    gtk_widget_set_sensitive(gui->stop_button, FALSE);
    gtk_widget_set_sensitive(gui->file_button, TRUE);
    gtk_widget_set_sensitive(gui->webcam_button, TRUE);
    gtk_widget_set_sensitive(gui->port_entry, TRUE);
    gtk_widget_set_sensitive(gui->path_entry, TRUE);
    gtk_widget_set_sensitive(gui->file_chooser_button, TRUE);
}

static void on_file_button_clicked(GtkButton *button, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    gui->source_type = SOURCE_FILE;
    gtk_widget_set_sensitive(gui->file_chooser_button, TRUE);
    gtk_button_set_label(GTK_BUTTON(gui->file_button), "● 파일 스트리밍");
    gtk_button_set_label(GTK_BUTTON(gui->webcam_button), "○ 웹캠 스트리밍");
    update_status(gui, "파일 스트리밍 모드 선택됨");
}

static void on_webcam_button_clicked(GtkButton *button, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    gui->source_type = SOURCE_WEBCAM;
    gtk_widget_set_sensitive(gui->file_chooser_button, FALSE);
    gtk_button_set_label(GTK_BUTTON(gui->file_button), "○ 파일 스트리밍");
    gtk_button_set_label(GTK_BUTTON(gui->webcam_button), "● 웹캠 스트리밍");
    update_status(gui, "웹캠 스트리밍 모드 선택됨");
}

static void on_file_chooser_file_set(GtkFileChooserButton *widget, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    gchar *filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(widget));
    
    if (filename) {
        if (gui->selected_file) {
            g_free(gui->selected_file);
        }
        gui->selected_file = filename;
        
        gchar *basename = g_path_get_basename(filename);
        gchar *status = g_strdup_printf("파일 선택: %s\n로컬 재생: 재생 버튼 / RTSP 스트리밍: RTSP 서버 시작", basename);
        update_status(gui, status);
        g_free(status);
        g_free(basename);
        
        // Enable play button
        gtk_widget_set_sensitive(gui->play_button, TRUE);
    }
}

static void activate(GtkApplication *gtk_app, gpointer user_data) {
    GUIContext *gui = (GUIContext *)user_data;
    
    // 메인 윈도우
    gui->window = gtk_application_window_new(gtk_app);
    gtk_window_set_title(GTK_WINDOW(gui->window), "RTSP 서버 + 비디오 플레이어");
    gtk_window_set_default_size(GTK_WINDOW(gui->window), 800, 700);
    gtk_container_set_border_width(GTK_CONTAINER(gui->window), 10);
    
    // 메인 박스
    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_container_add(GTK_CONTAINER(gui->window), vbox);
    
    // 타이틀 레이블
    GtkWidget *title_label = gtk_label_new(NULL);
    gtk_label_set_markup(GTK_LABEL(title_label), 
                         "<span size='large' weight='bold'>RTSP 스트리밍 서버 + 로컬 플레이어</span>");
    gtk_box_pack_start(GTK_BOX(vbox), title_label, FALSE, FALSE, 5);
    
    // 구분선
    GtkWidget *separator1 = gtk_separator_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_box_pack_start(GTK_BOX(vbox), separator1, FALSE, FALSE, 5);
    
    // =================================================================
    // 로컬 플레이어 섹션
    // =================================================================
    GtkWidget *player_frame = gtk_frame_new("로컬 비디오 플레이어");
    gtk_box_pack_start(GTK_BOX(vbox), player_frame, TRUE, TRUE, 0);
    
    GtkWidget *player_vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 5);
    gtk_container_set_border_width(GTK_CONTAINER(player_vbox), 10);
    gtk_container_add(GTK_CONTAINER(player_frame), player_vbox);
    
    // Video display area - GtkDrawingArea for embedding video
    gui->video_widget = gtk_drawing_area_new();
    gtk_widget_set_size_request(gui->video_widget, 640, 360);
    gtk_widget_set_hexpand(gui->video_widget, TRUE);
    gtk_widget_set_vexpand(gui->video_widget, TRUE);
    gtk_widget_set_app_paintable(gui->video_widget, TRUE);
    
    // Black background for video area using CSS
    GtkCssProvider *css_provider = gtk_css_provider_new();
    gtk_css_provider_load_from_data(css_provider,
                                    "* { background-color: black; }",
                                    -1, NULL);
    GtkStyleContext *context = gtk_widget_get_style_context(gui->video_widget);
    gtk_style_context_add_provider(context,
                                   GTK_STYLE_PROVIDER(css_provider),
                                   GTK_STYLE_PROVIDER_PRIORITY_USER);
    g_object_unref(css_provider);
    
    // Connect draw signal to paint black background
    g_signal_connect(gui->video_widget, "draw",
                     G_CALLBACK(on_video_widget_draw), NULL);
    
    // Connect realize signal to set up video overlay
    g_signal_connect(gui->video_widget, "realize", 
                     G_CALLBACK(video_widget_realize_cb), gui);
    
    gtk_box_pack_start(GTK_BOX(player_vbox), gui->video_widget, TRUE, TRUE, 5);
    
    // 플레이어 컨트롤
    GtkWidget *player_controls = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 5);
    gtk_box_pack_start(GTK_BOX(player_vbox), player_controls, FALSE, FALSE, 0);
    
    gui->play_button = gtk_button_new_with_label("▶ 재생");
    gui->pause_button = gtk_button_new_with_label("❚❚ 일시정지");
    gui->stop_playback_button = gtk_button_new_with_label("■ 정지");
    
    gtk_widget_set_sensitive(gui->play_button, FALSE);
    gtk_widget_set_sensitive(gui->pause_button, FALSE);
    gtk_widget_set_sensitive(gui->stop_playback_button, FALSE);
    
    gtk_box_pack_start(GTK_BOX(player_controls), gui->play_button, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(player_controls), gui->pause_button, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(player_controls), gui->stop_playback_button, TRUE, TRUE, 0);
    
    g_signal_connect(gui->play_button, "clicked", 
                     G_CALLBACK(on_play_button_clicked), gui);
    g_signal_connect(gui->pause_button, "clicked", 
                     G_CALLBACK(on_pause_button_clicked), gui);
    g_signal_connect(gui->stop_playback_button, "clicked", 
                     G_CALLBACK(on_stop_playback_button_clicked), gui);
    
    // Position scale
    GtkWidget *position_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 5);
    gtk_box_pack_start(GTK_BOX(player_vbox), position_box, FALSE, FALSE, 0);
    
    GtkWidget *pos_label = gtk_label_new("진행:");
    gtk_box_pack_start(GTK_BOX(position_box), pos_label, FALSE, FALSE, 0);
    
    gui->position_scale = gtk_scale_new_with_range(GTK_ORIENTATION_HORIZONTAL, 0.0, 100.0, 1.0);
    gtk_scale_set_draw_value(GTK_SCALE(gui->position_scale), FALSE);
    gtk_widget_set_hexpand(gui->position_scale, TRUE);
    gtk_box_pack_start(GTK_BOX(position_box), gui->position_scale, TRUE, TRUE, 0);
    
    g_signal_connect(gui->position_scale, "value-changed", 
                     G_CALLBACK(on_position_scale_changed), gui);
    
    // Volume scale
    GtkWidget *volume_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 5);
    gtk_box_pack_start(GTK_BOX(player_vbox), volume_box, FALSE, FALSE, 0);
    
    GtkWidget *vol_label = gtk_label_new("볼륨:");
    gtk_box_pack_start(GTK_BOX(volume_box), vol_label, FALSE, FALSE, 0);
    
    gui->volume_scale = gtk_scale_new_with_range(GTK_ORIENTATION_HORIZONTAL, 0.0, 100.0, 1.0);
    gtk_scale_set_draw_value(GTK_SCALE(gui->volume_scale), TRUE);
    gtk_range_set_value(GTK_RANGE(gui->volume_scale), 50.0);
    gtk_widget_set_size_request(gui->volume_scale, 200, -1);
    gtk_box_pack_start(GTK_BOX(volume_box), gui->volume_scale, FALSE, FALSE, 0);
    
    g_signal_connect(gui->volume_scale, "value-changed", 
                     G_CALLBACK(on_volume_scale_changed), gui);
    
    // 구분선
    GtkWidget *separator_player = gtk_separator_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_box_pack_start(GTK_BOX(vbox), separator_player, FALSE, FALSE, 5);
    
    // =================================================================
    // RTSP 서버 섹션
    // =================================================================
    
    // 스트리밍 모드 선택
    GtkWidget *mode_frame = gtk_frame_new("스트리밍 소스 선택");
    gtk_box_pack_start(GTK_BOX(vbox), mode_frame, FALSE, FALSE, 0);
    
    GtkWidget *mode_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 10);
    gtk_container_set_border_width(GTK_CONTAINER(mode_box), 10);
    gtk_container_add(GTK_CONTAINER(mode_frame), mode_box);
    
    gui->file_button = gtk_button_new_with_label("● 파일 스트리밍");
    gui->webcam_button = gtk_button_new_with_label("○ 웹캠 스트리밍");
    gtk_box_pack_start(GTK_BOX(mode_box), gui->file_button, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(mode_box), gui->webcam_button, TRUE, TRUE, 0);
    
    g_signal_connect(gui->file_button, "clicked", 
                     G_CALLBACK(on_file_button_clicked), gui);
    g_signal_connect(gui->webcam_button, "clicked", 
                     G_CALLBACK(on_webcam_button_clicked), gui);
    
    // 파일 선택
    GtkWidget *file_frame = gtk_frame_new("비디오 파일 선택");
    gtk_box_pack_start(GTK_BOX(vbox), file_frame, FALSE, FALSE, 0);
    
    GtkWidget *file_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 10);
    gtk_container_set_border_width(GTK_CONTAINER(file_box), 10);
    gtk_container_add(GTK_CONTAINER(file_frame), file_box);
    
    gui->file_chooser_button = gtk_file_chooser_button_new(
        "비디오 파일 선택", GTK_FILE_CHOOSER_ACTION_OPEN);
    
    GtkFileFilter *filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "비디오 파일");
    gtk_file_filter_add_mime_type(filter, "video/*");
    gtk_file_filter_add_pattern(filter, "*.mp4");
    gtk_file_filter_add_pattern(filter, "*.avi");
    gtk_file_filter_add_pattern(filter, "*.mkv");
    gtk_file_filter_add_pattern(filter, "*.mov");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(gui->file_chooser_button), filter);
    
    gtk_box_pack_start(GTK_BOX(file_box), gui->file_chooser_button, TRUE, TRUE, 0);
    
    g_signal_connect(gui->file_chooser_button, "file-set", 
                     G_CALLBACK(on_file_chooser_file_set), gui);
    
    // 서버 설정
    GtkWidget *settings_frame = gtk_frame_new("RTSP 서버 설정");
    gtk_box_pack_start(GTK_BOX(vbox), settings_frame, FALSE, FALSE, 0);
    
    GtkWidget *settings_grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(settings_grid), 10);
    gtk_grid_set_column_spacing(GTK_GRID(settings_grid), 10);
    gtk_container_set_border_width(GTK_CONTAINER(settings_grid), 10);
    gtk_container_add(GTK_CONTAINER(settings_frame), settings_grid);
    
    GtkWidget *port_label = gtk_label_new("포트:");
    gtk_widget_set_halign(port_label, GTK_ALIGN_END);
    gui->port_entry = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(gui->port_entry), "8554");
    gtk_entry_set_max_length(GTK_ENTRY(gui->port_entry), 5);
    gtk_widget_set_hexpand(gui->port_entry, TRUE);
    
    GtkWidget *path_label = gtk_label_new("경로:");
    gtk_widget_set_halign(path_label, GTK_ALIGN_END);
    gui->path_entry = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(gui->path_entry), "stream");
    gtk_widget_set_hexpand(gui->path_entry, TRUE);
    
    gtk_grid_attach(GTK_GRID(settings_grid), port_label, 0, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(settings_grid), gui->port_entry, 1, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(settings_grid), path_label, 0, 1, 1, 1);
    gtk_grid_attach(GTK_GRID(settings_grid), gui->path_entry, 1, 1, 1, 1);
    
    // RTSP 서버 제어 버튼
    GtkWidget *control_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 10);
    gtk_box_pack_start(GTK_BOX(vbox), control_box, FALSE, FALSE, 0);
    
    gui->start_button = gtk_button_new_with_label("▶ RTSP 서버 시작");
    gui->stop_button = gtk_button_new_with_label("■ RTSP 서버 중지");
    gtk_widget_set_sensitive(gui->stop_button, FALSE);
    
    gtk_box_pack_start(GTK_BOX(control_box), gui->start_button, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(control_box), gui->stop_button, TRUE, TRUE, 0);
    
    g_signal_connect(gui->start_button, "clicked", 
                     G_CALLBACK(on_start_button_clicked), gui);
    g_signal_connect(gui->stop_button, "clicked", 
                     G_CALLBACK(on_stop_button_clicked), gui);
    
    // 구분선
    GtkWidget *separator2 = gtk_separator_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_box_pack_start(GTK_BOX(vbox), separator2, FALSE, FALSE, 5);
    
    // 상태 표시
    GtkWidget *status_frame = gtk_frame_new("상태");
    gtk_box_pack_start(GTK_BOX(vbox), status_frame, TRUE, TRUE, 0);
    
    GtkWidget *status_vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 5);
    gtk_container_set_border_width(GTK_CONTAINER(status_vbox), 10);
    gtk_container_add(GTK_CONTAINER(status_frame), status_vbox);
    
    gui->status_label = gtk_label_new("대기 중...");
    gtk_label_set_line_wrap(GTK_LABEL(gui->status_label), TRUE);
    gtk_widget_set_halign(gui->status_label, GTK_ALIGN_START);
    gtk_box_pack_start(GTK_BOX(status_vbox), gui->status_label, FALSE, FALSE, 0);
    
    gui->clients_label = gtk_label_new("연결된 클라이언트: 0");
    gtk_widget_set_halign(gui->clients_label, GTK_ALIGN_START);
    gtk_box_pack_start(GTK_BOX(status_vbox), gui->clients_label, FALSE, FALSE, 0);
    
    gtk_widget_show_all(gui->window);
}

GUIContext* gui_create(RTSPServerContext *server_ctx) {
    GUIContext *gui = g_new0(GUIContext, 1);
    gui->server_ctx = server_ctx;
    gui->selected_file = NULL;
    gui->source_type = SOURCE_FILE;
    gui->playback_pipeline = NULL;
    gui->is_playing = FALSE;
    gui->position_update_id = 0;
    gui->video_widget = NULL;
    gui->bus_watch_id = 0;
    gui->overlay_initialized = FALSE;
    gui->seeking = FALSE;
    
    // 클라이언트 카운트 콜백 설정
    rtsp_server_set_client_callback(server_ctx, update_client_count, gui);
    
    return gui;
}

void gui_run(GUIContext *gui_ctx, int argc, char *argv[]) {
    GtkApplication *app = gtk_application_new(
        "com.example.rtspserver", G_APPLICATION_DEFAULT_FLAGS);
    
    g_signal_connect(app, "activate", G_CALLBACK(activate), gui_ctx);
    
    g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
}

void gui_free(GUIContext *gui_ctx) {
    if (!gui_ctx) return;
    
    // Stop playback
    if (gui_ctx->playback_pipeline) {
        gst_element_set_state(gui_ctx->playback_pipeline, GST_STATE_NULL);
        g_object_unref(gui_ctx->playback_pipeline);
    }
    
    if (gui_ctx->position_update_id) {
        g_source_remove(gui_ctx->position_update_id);
    }
    
    if (gui_ctx->selected_file) {
        g_free(gui_ctx->selected_file);
    }
    
    g_free(gui_ctx);
}
