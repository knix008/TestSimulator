#include "gtk_player.h"
#include "rtsp_server.h"

static char *pick_video_file_from_dialog(GtkWindow *parent) {
    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "Select Video File",
        parent,
        GTK_FILE_CHOOSER_ACTION_OPEN,
        "_Cancel", GTK_RESPONSE_CANCEL,
        "_Open", GTK_RESPONSE_ACCEPT,
        NULL);

    GtkFileFilter *filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "Video files");
    gtk_file_filter_add_mime_type(filter, "video/*");
    gtk_file_filter_add_pattern(filter, "*.mp4");
    gtk_file_filter_add_pattern(filter, "*.mkv");
    gtk_file_filter_add_pattern(filter, "*.avi");
    gtk_file_filter_add_pattern(filter, "*.mov");
    gtk_file_filter_add_pattern(filter, "*.webm");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), filter);

    char *selected = NULL;
    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        selected = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
    }

    gtk_widget_destroy(dialog);
    while (gtk_events_pending()) {
        gtk_main_iteration();
    }
    return selected;
}

static gboolean hide_state_icon_cb(gpointer data) {
    App *app = (App *)data;
    gtk_widget_hide(app->state_icon);
    app->hide_play_icon_timeout_id = 0;
    return G_SOURCE_REMOVE;
}

static void append_rtsp_log(App *app, const char *message) {
    if (!app->rtsp_log_buffer || !message) {
        return;
    }
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(app->rtsp_log_buffer, &end);
    gtk_text_buffer_insert(app->rtsp_log_buffer, &end, message, -1);
    gtk_text_buffer_insert(app->rtsp_log_buffer, &end, "\n", -1);
}

static char *build_rtsp_url(const char *port, const char *mount_point) {
    const char *mount = (mount_point && *mount_point) ? mount_point : "/stream";
    gchar *normalized_mount = (mount[0] == '/') ? g_strdup(mount) : g_strdup_printf("/%s", mount);
    gchar *url = g_strdup_printf("rtsp://127.0.0.1:%s%s", (port && *port) ? port : "8554", normalized_mount);
    g_free(normalized_mount);
    return url;
}

static void refresh_rtsp_url_label(App *app) {
    const char *port = gtk_entry_get_text(GTK_ENTRY(app->rtsp_port_entry));
    const char *mount = gtk_entry_get_text(GTK_ENTRY(app->rtsp_mount_entry));
    gchar *url = build_rtsp_url(port, mount);
    gchar *label = g_strdup_printf("RTSP URL: %s", url);
    gtk_label_set_text(GTK_LABEL(app->rtsp_url_label), label);
    g_free(label);
    g_free(url);
}

static void on_rtsp_config_changed(GtkEditable *editable, gpointer user_data) {
    (void)editable;
    App *app = (App *)user_data;
    refresh_rtsp_url_label(app);
}

static void update_rtsp_button_state(App *app) {
    gboolean running = rtsp_server_is_running(app);
    gtk_widget_set_sensitive(app->rtsp_start_button, !running);
    gtk_widget_set_sensitive(app->rtsp_stop_button, running);
}

static void on_rtsp_start_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    App *app = (App *)user_data;
    const char *port = gtk_entry_get_text(GTK_ENTRY(app->rtsp_port_entry));
    const char *mount = gtk_entry_get_text(GTK_ENTRY(app->rtsp_mount_entry));
    const char *source_file = app->current_media_path;

    if (!port || !*port || !mount || !*mount) {
        append_rtsp_log(app, "[RTSP] Port and mount are required.");
        return;
    }

    if (!rtsp_server_start(app, mount, port, source_file)) {
        append_rtsp_log(app, "[RTSP] Failed to start server.");
        update_rtsp_button_state(app);
        return;
    }

    gchar *url = build_rtsp_url(port, mount);
    gchar *msg = g_strdup_printf("[RTSP] Server started: %s", url);
    append_rtsp_log(app, msg);
    gchar *normalized_mount = (mount[0] == '/') ? g_strdup(mount) : g_strdup_printf("/%s", mount);
    gchar *localhost_url = g_strdup_printf("rtsp://localhost:%s%s", port, normalized_mount);
    gchar *tip = g_strdup_printf("[RTSP] Try VLC with: %s", localhost_url);
    append_rtsp_log(app, tip);
    g_free(msg);
    g_free(tip);
    g_free(localhost_url);
    g_free(normalized_mount);
    g_free(url);
    refresh_rtsp_url_label(app);
    update_rtsp_button_state(app);
}

static void on_rtsp_stop_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    App *app = (App *)user_data;
    if (!rtsp_server_is_running(app)) {
        append_rtsp_log(app, "[RTSP] Server is not running.");
        update_rtsp_button_state(app);
        return;
    }
    rtsp_server_stop(app);
    append_rtsp_log(app, "[RTSP] Server stopped.");
    update_rtsp_button_state(app);
}

static void show_state_icon(App *app, const char *icon_name, gboolean auto_hide) {
    if (app->hide_play_icon_timeout_id != 0) {
        g_source_remove(app->hide_play_icon_timeout_id);
        app->hide_play_icon_timeout_id = 0;
    }

    gtk_image_set_from_icon_name(GTK_IMAGE(app->state_icon), icon_name, GTK_ICON_SIZE_DIALOG);
    gtk_widget_show(app->state_icon);

    if (auto_hide) {
        app->hide_play_icon_timeout_id = g_timeout_add(700, hide_state_icon_cb, app);
    }
}

static void update_status(App *app, const char *text) {
    gtk_label_set_text(GTK_LABEL(app->status_label), text);
}

static void set_time_label(App *app, gint64 pos_ns, gint64 dur_ns) {
    gint64 pos_total = (pos_ns > 0) ? (pos_ns / GST_SECOND) : 0;
    gint64 dur_total = (dur_ns > 0) ? (dur_ns / GST_SECOND) : 0;

    gint pos_h = (gint)(pos_total / 3600);
    gint pos_m = (gint)((pos_total % 3600) / 60);
    gint pos_s = (gint)(pos_total % 60);
    gint dur_h = (gint)(dur_total / 3600);
    gint dur_m = (gint)((dur_total % 3600) / 60);
    gint dur_s = (gint)(dur_total % 60);

    gchar *text;
    if (dur_h > 0 || pos_h > 0) {
        text = g_strdup_printf("%02d:%02d:%02d / %02d:%02d:%02d", pos_h, pos_m, pos_s, dur_h, dur_m, dur_s);
    } else {
        text = g_strdup_printf("%02d:%02d / %02d:%02d", pos_m, pos_s, dur_m, dur_s);
    }
    gtk_label_set_text(GTK_LABEL(app->time_label), text);
    g_free(text);
}

static gboolean refresh_progress(gpointer data) {
    App *app = (App *)data;
    gint64 pos = GST_CLOCK_TIME_NONE;
    gint64 dur = GST_CLOCK_TIME_NONE;

    if (!app->play_pipeline) {
        return TRUE;
    }

    if (!gst_element_query_position(app->play_pipeline, GST_FORMAT_TIME, &pos) ||
        !gst_element_query_duration(app->play_pipeline, GST_FORMAT_TIME, &dur) ||
        dur <= 0) {
        return TRUE;
    }

    gdouble fraction = (gdouble)pos / (gdouble)dur;
    if (fraction < 0.0) {
        fraction = 0.0;
    } else if (fraction > 1.0) {
        fraction = 1.0;
    }

    if (!app->is_seeking) {
        gdouble pos_sec = (gdouble)pos / GST_SECOND;
        gdouble dur_sec = (gdouble)dur / GST_SECOND;
        gtk_range_set_range(GTK_RANGE(app->progress_scale), 0.0, dur_sec > 0.0 ? dur_sec : 1.0);
        gtk_range_set_value(GTK_RANGE(app->progress_scale), pos_sec);
    }
    set_time_label(app, pos, dur);

    gchar *msg = g_strdup_printf("Playback %.1f%%", fraction * 100.0);
    update_status(app, msg);
    g_free(msg);

    return TRUE;
}

static void set_pipeline_state(App *app, GstState state, const char *msg) {
    gst_element_set_state(app->play_pipeline, state);
    update_status(app, msg);
}

static void on_play_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    App *app = (App *)user_data;
    if (!app->has_media) {
        update_status(app, "No media loaded. Click Open first.");
        return;
    }
    app->is_paused = FALSE;
    set_pipeline_state(app, GST_STATE_PLAYING, "Playing");
    show_state_icon(app, "media-playback-start-symbolic", TRUE);
}

static void on_pause_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    App *app = (App *)user_data;
    if (!app->has_media) {
        update_status(app, "No media loaded. Click Open first.");
        return;
    }
    app->is_paused = TRUE;
    set_pipeline_state(app, GST_STATE_PAUSED, "Paused");
    show_state_icon(app, "media-playback-pause-symbolic", FALSE);
}

static void on_stop_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    App *app = (App *)user_data;
    if (!app->has_media) {
        update_status(app, "No media loaded. Click Open first.");
        return;
    }
    app->is_paused = FALSE;
    gst_element_set_state(app->play_pipeline, GST_STATE_READY);
    gtk_range_set_value(GTK_RANGE(app->progress_scale), 0.0);
    set_time_label(app, 0, 0);
    update_status(app, "Stopped");
    gtk_widget_hide(app->state_icon);
}

static gboolean on_video_click(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
    (void)widget;
    App *app = (App *)user_data;

    if (event->type != GDK_BUTTON_PRESS || event->button != 1) {
        return FALSE;
    }
    if (!app->has_media) {
        update_status(app, "No media loaded. Click Open first.");
        return TRUE;
    }

    if (app->is_paused) {
        app->is_paused = FALSE;
        set_pipeline_state(app, GST_STATE_PLAYING, "Playing (clicked)");
        show_state_icon(app, "media-playback-start-symbolic", TRUE);
    } else {
        app->is_paused = TRUE;
        set_pipeline_state(app, GST_STATE_PAUSED, "Paused (clicked)");
        show_state_icon(app, "media-playback-pause-symbolic", FALSE);
    }

    return TRUE;
}

static void seek_to_scale_position(App *app) {
    gdouble pos_sec = gtk_range_get_value(GTK_RANGE(app->progress_scale));
    gint64 pos_ns = (gint64)(pos_sec * GST_SECOND);
    gst_element_seek_simple(
        app->play_pipeline,
        GST_FORMAT_TIME,
        GST_SEEK_FLAG_FLUSH | GST_SEEK_FLAG_KEY_UNIT,
        pos_ns);
}

static gboolean on_progress_button_press(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
    (void)widget;
    (void)event;
    App *app = (App *)user_data;
    app->is_seeking = TRUE;
    return FALSE;
}

static gboolean on_progress_button_release(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
    (void)widget;
    (void)event;
    App *app = (App *)user_data;
    if (app->has_media) {
        seek_to_scale_position(app);
    }
    app->is_seeking = FALSE;
    return FALSE;
}

static void on_progress_value_changed(GtkRange *range, gpointer user_data) {
    (void)range;
    App *app = (App *)user_data;
    if (app->is_seeking && app->has_media) {
        seek_to_scale_position(app);
        gint64 dur = GST_CLOCK_TIME_NONE;
        if (gst_element_query_duration(app->play_pipeline, GST_FORMAT_TIME, &dur) && dur > 0) {
            gint64 pos = (gint64)(gtk_range_get_value(GTK_RANGE(app->progress_scale)) * GST_SECOND);
            set_time_label(app, pos, dur);
        }
    }
}

static void on_open_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    App *app = (App *)user_data;
    char *video_file_path = pick_video_file_from_dialog(GTK_WINDOW(app->window));
    if (!video_file_path) {
        return;
    }

    if (!gtk_player_open_file(app, video_file_path)) {
        update_status(app, "Failed to open selected media");
        g_free(video_file_path);
        return;
    }

    update_status(app, "Opened file");
    g_free(video_file_path);
}

static GtkWidget *create_icon_button(const char *icon_name, const char *tooltip) {
    GtkWidget *button = gtk_button_new();
    GtkWidget *image = gtk_image_new_from_icon_name(icon_name, GTK_ICON_SIZE_LARGE_TOOLBAR);
    gtk_button_set_image(GTK_BUTTON(button), image);
    gtk_button_set_always_show_image(GTK_BUTTON(button), TRUE);
    gtk_widget_set_tooltip_text(button, tooltip);
    gtk_widget_set_size_request(button, 44, 36);
    return button;
}

static gboolean bus_cb(GstBus *bus, GstMessage *msg, gpointer user_data) {
    (void)bus;
    App *app = (App *)user_data;

    switch (GST_MESSAGE_TYPE(msg)) {
    case GST_MESSAGE_EOS:
        gst_element_set_state(app->play_pipeline, GST_STATE_READY);
        gtk_range_set_value(GTK_RANGE(app->progress_scale), 0.0);
        set_time_label(app, 0, 0);
        update_status(app, "End of stream");
        gtk_widget_hide(app->state_icon);
        break;
    case GST_MESSAGE_ERROR: {
        GError *err = NULL;
        gchar *dbg = NULL;
        gst_message_parse_error(msg, &err, &dbg);
        gchar *status = g_strdup_printf("Error: %s", err ? err->message : "Unknown");
        update_status(app, status);
        g_free(status);
        g_clear_error(&err);
        g_free(dbg);
        break;
    }
    default:
        break;
    }
    return TRUE;
}

gboolean gtk_player_init(App *app) {
    app->play_pipeline = gst_element_factory_make("playbin", "player");
    app->video_sink = gst_element_factory_make("gtksink", "video_sink");
    if (!app->play_pipeline || !app->video_sink) {
        return FALSE;
    }

    g_object_set(app->play_pipeline, "video-sink", app->video_sink, NULL);
    app->has_media = FALSE;
    app->is_paused = FALSE;
    app->is_seeking = FALSE;

    return TRUE;
}

gboolean gtk_player_open_file(App *app, const char *video_file_path) {
    gchar *uri = gst_filename_to_uri(video_file_path, NULL);
    if (!uri) {
        return FALSE;
    }

    gst_element_set_state(app->play_pipeline, GST_STATE_READY);
    g_object_set(app->play_pipeline, "uri", uri, NULL);
    g_free(uri);

    gst_element_set_state(app->play_pipeline, GST_STATE_PLAYING);
    app->has_media = TRUE;
    app->is_paused = FALSE;
    gtk_widget_set_sensitive(app->progress_scale, TRUE);
    gtk_range_set_value(GTK_RANGE(app->progress_scale), 0.0);
    g_free(app->current_media_path);
    app->current_media_path = g_strdup(video_file_path);
    if (app->on_media_opened &&
        !app->on_media_opened(video_file_path, app->on_media_opened_user_data)) {
        gst_element_set_state(app->play_pipeline, GST_STATE_READY);
        app->has_media = FALSE;
        return FALSE;
    }
    if (rtsp_server_is_running(app)) {
        append_rtsp_log(app, "[RTSP] Source updated to opened file.");
    }
    show_state_icon(app, "media-playback-start-symbolic", TRUE);
    return TRUE;
}

void gtk_player_build_ui(App *app) {
    app->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(app->window), "GTK RTSP Video Player");
    gtk_window_set_default_size(GTK_WINDOW(app->window), 960, 640);
    g_signal_connect(app->window, "destroy", G_CALLBACK(gtk_main_quit), NULL);

    GtkWidget *root = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_container_add(GTK_CONTAINER(app->window), root);
    gtk_widget_set_margin_start(root, 12);
    gtk_widget_set_margin_end(root, 12);
    gtk_widget_set_margin_top(root, 12);
    gtk_widget_set_margin_bottom(root, 12);

    g_object_get(app->video_sink, "widget", &app->video_area, NULL);
    gtk_widget_set_hexpand(app->video_area, TRUE);
    gtk_widget_set_vexpand(app->video_area, TRUE);

    app->video_overlay = gtk_overlay_new();
    gtk_widget_set_hexpand(app->video_overlay, TRUE);
    gtk_widget_set_vexpand(app->video_overlay, TRUE);
    gtk_container_add(GTK_CONTAINER(app->video_overlay), app->video_area);
    gtk_box_pack_start(GTK_BOX(root), app->video_overlay, TRUE, TRUE, 0);
    gtk_widget_add_events(app->video_overlay, GDK_BUTTON_PRESS_MASK);
    g_signal_connect(app->video_overlay, "button-press-event", G_CALLBACK(on_video_click), app);

    app->state_icon = gtk_image_new_from_icon_name("media-playback-start-symbolic", GTK_ICON_SIZE_DIALOG);
    gtk_widget_set_halign(app->state_icon, GTK_ALIGN_CENTER);
    gtk_widget_set_valign(app->state_icon, GTK_ALIGN_CENTER);
    gtk_overlay_add_overlay(GTK_OVERLAY(app->video_overlay), app->state_icon);
    gtk_widget_set_opacity(app->state_icon, 0.9);
    gtk_widget_hide(app->state_icon);

    GtkWidget *controls_outer = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
    gtk_box_pack_start(GTK_BOX(root), controls_outer, FALSE, FALSE, 0);

    GtkWidget *left_spacer = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
    GtkWidget *right_spacer = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
    gtk_box_pack_start(GTK_BOX(controls_outer), left_spacer, TRUE, TRUE, 0);

    GtkWidget *controls = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 12);
    gtk_box_pack_start(GTK_BOX(controls_outer), controls, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(controls_outer), right_spacer, TRUE, TRUE, 0);

    app->open_button = create_icon_button("document-open-symbolic", "Open");
    app->play_button = create_icon_button("media-playback-start-symbolic", "Play");
    app->pause_button = create_icon_button("media-playback-pause-symbolic", "Pause");
    app->stop_button = create_icon_button("media-playback-stop-symbolic", "Stop");
    gtk_box_pack_start(GTK_BOX(controls), app->open_button, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(controls), app->play_button, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(controls), app->pause_button, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(controls), app->stop_button, FALSE, FALSE, 0);

    g_signal_connect(app->open_button, "clicked", G_CALLBACK(on_open_clicked), app);
    g_signal_connect(app->play_button, "clicked", G_CALLBACK(on_play_clicked), app);
    g_signal_connect(app->pause_button, "clicked", G_CALLBACK(on_pause_clicked), app);
    g_signal_connect(app->stop_button, "clicked", G_CALLBACK(on_stop_clicked), app);

    app->progress_scale = gtk_scale_new_with_range(GTK_ORIENTATION_HORIZONTAL, 0.0, 100.0, 0.1);
    gtk_scale_set_draw_value(GTK_SCALE(app->progress_scale), FALSE);
    gtk_widget_set_sensitive(app->progress_scale, FALSE);
    gtk_widget_add_events(app->progress_scale, GDK_BUTTON_PRESS_MASK | GDK_BUTTON_RELEASE_MASK);
    g_signal_connect(app->progress_scale, "button-press-event", G_CALLBACK(on_progress_button_press), app);
    g_signal_connect(app->progress_scale, "button-release-event", G_CALLBACK(on_progress_button_release), app);
    g_signal_connect(app->progress_scale, "value-changed", G_CALLBACK(on_progress_value_changed), app);
    gtk_box_pack_start(GTK_BOX(root), app->progress_scale, FALSE, FALSE, 0);
    gtk_widget_set_margin_top(app->progress_scale, 2);

    app->time_label = gtk_label_new("00:00 / 00:00");
    gtk_widget_set_halign(app->time_label, GTK_ALIGN_END);
    gtk_box_pack_start(GTK_BOX(root), app->time_label, FALSE, FALSE, 0);

    app->status_label = gtk_label_new("Ready - click Open to load a video");
    gtk_box_pack_start(GTK_BOX(root), app->status_label, FALSE, FALSE, 0);
    gtk_widget_set_halign(app->status_label, GTK_ALIGN_START);
    gtk_widget_set_margin_start(app->status_label, 8);

    GtkWidget *rtsp_frame = gtk_frame_new("RTSP Server");
    gtk_box_pack_start(GTK_BOX(root), rtsp_frame, FALSE, FALSE, 0);
    gtk_widget_set_margin_top(rtsp_frame, 4);
    gtk_widget_set_margin_start(rtsp_frame, 4);
    gtk_widget_set_margin_end(rtsp_frame, 4);
    gtk_widget_set_margin_bottom(rtsp_frame, 4);

    GtkWidget *rtsp_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 6);
    gtk_container_add(GTK_CONTAINER(rtsp_frame), rtsp_box);
    gtk_widget_set_margin_start(rtsp_box, 10);
    gtk_widget_set_margin_end(rtsp_box, 10);
    gtk_widget_set_margin_top(rtsp_box, 8);
    gtk_widget_set_margin_bottom(rtsp_box, 10);

    GtkWidget *rtsp_config_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_pack_start(GTK_BOX(rtsp_box), rtsp_config_row, FALSE, FALSE, 0);
    gtk_widget_set_margin_start(rtsp_config_row, 8);
    gtk_widget_set_margin_end(rtsp_config_row, 8);

    gtk_box_pack_start(GTK_BOX(rtsp_config_row), gtk_label_new("Port"), FALSE, FALSE, 0);
    app->rtsp_port_entry = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(app->rtsp_port_entry), "8554");
    gtk_widget_set_size_request(app->rtsp_port_entry, 90, -1);
    gtk_box_pack_start(GTK_BOX(rtsp_config_row), app->rtsp_port_entry, FALSE, FALSE, 0);

    gtk_box_pack_start(GTK_BOX(rtsp_config_row), gtk_label_new("Mount"), FALSE, FALSE, 0);
    app->rtsp_mount_entry = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(app->rtsp_mount_entry), "/stream");
    gtk_widget_set_size_request(app->rtsp_mount_entry, 160, -1);
    gtk_box_pack_start(GTK_BOX(rtsp_config_row), app->rtsp_mount_entry, FALSE, FALSE, 0);

    app->rtsp_start_button = gtk_button_new_with_label("Start Server");
    app->rtsp_stop_button = gtk_button_new_with_label("Stop Server");
    gtk_box_pack_start(GTK_BOX(rtsp_config_row), app->rtsp_start_button, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(rtsp_config_row), app->rtsp_stop_button, FALSE, FALSE, 0);

    app->rtsp_url_label = gtk_label_new("RTSP URL: rtsp://127.0.0.1:8554/stream");
    gtk_widget_set_halign(app->rtsp_url_label, GTK_ALIGN_START);
    gtk_box_pack_start(GTK_BOX(rtsp_box), app->rtsp_url_label, FALSE, FALSE, 0);
    gtk_widget_set_margin_start(app->rtsp_url_label, 8);
    gtk_widget_set_margin_end(app->rtsp_url_label, 8);

    GtkWidget *scrolled = gtk_scrolled_window_new(NULL, NULL);
    gtk_widget_set_size_request(scrolled, -1, 120);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scrolled), GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_box_pack_start(GTK_BOX(rtsp_box), scrolled, TRUE, TRUE, 0);
    gtk_widget_set_margin_start(scrolled, 0);
    gtk_widget_set_margin_end(scrolled, 0);
    gtk_widget_set_margin_top(scrolled, 2);

    app->rtsp_log_view = gtk_text_view_new();
    gtk_text_view_set_editable(GTK_TEXT_VIEW(app->rtsp_log_view), FALSE);
    gtk_text_view_set_cursor_visible(GTK_TEXT_VIEW(app->rtsp_log_view), FALSE);
    gtk_widget_set_margin_start(app->rtsp_log_view, 0);
    app->rtsp_log_buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(app->rtsp_log_view));
    gtk_container_add(GTK_CONTAINER(scrolled), app->rtsp_log_view);

    g_signal_connect(app->rtsp_port_entry, "changed", G_CALLBACK(on_rtsp_config_changed), app);
    g_signal_connect(app->rtsp_mount_entry, "changed", G_CALLBACK(on_rtsp_config_changed), app);
    g_signal_connect(app->rtsp_start_button, "clicked", G_CALLBACK(on_rtsp_start_clicked), app);
    g_signal_connect(app->rtsp_stop_button, "clicked", G_CALLBACK(on_rtsp_stop_clicked), app);
    append_rtsp_log(app, "[RTSP] Ready. Configure address and click Start Server.");
    refresh_rtsp_url_label(app);
    update_rtsp_button_state(app);

    GstBus *bus = gst_element_get_bus(app->play_pipeline);
    gst_bus_add_watch(bus, bus_cb, app);
    g_object_unref(bus);

    g_timeout_add(250, refresh_progress, app);
    gtk_widget_show_all(app->window);
}

void gtk_player_start(App *app) {
    if (!app->has_media) {
        update_status(app, "Ready - click Open to load a video");
        return;
    }
    gst_element_set_state(app->play_pipeline, GST_STATE_PLAYING);
    app->is_paused = FALSE;
    show_state_icon(app, "media-playback-start-symbolic", TRUE);
}

void gtk_player_cleanup(App *app) {
    if (app->hide_play_icon_timeout_id != 0) {
        g_source_remove(app->hide_play_icon_timeout_id);
        app->hide_play_icon_timeout_id = 0;
    }
    if (!app->play_pipeline) {
        g_free(app->current_media_path);
        app->current_media_path = NULL;
        return;
    }
    gst_element_set_state(app->play_pipeline, GST_STATE_NULL);
    gst_object_unref(app->play_pipeline);
    app->play_pipeline = NULL;
    g_free(app->current_media_path);
    app->current_media_path = NULL;
}
