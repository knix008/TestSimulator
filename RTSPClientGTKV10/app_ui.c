#include "app_ui.h"
#include "youtube_service.h"

#include <gtk/gtk.h>
#include <gst/gst.h>

#include <stdarg.h>
#include <sys/wait.h>

struct AppUi {
    GtkWidget *window;
    GtkWidget *url_entry;
    GtkWidget *video_widget;
    GtkWidget *video_overlay;
    GtkWidget *overlay_icon;
    GtkWidget *download_btn;
    GtkWidget *volume_scale;
    GtkWidget *volume_value_label;
    GtkWidget *seek_scale;
    GtkWidget *time_label;
    GtkWidget *log_view;
    GtkTextBuffer *log_buffer;

    MediaCore *media;

    gboolean is_seeking;
    gint64 last_duration_ns;
    guint overlay_timeout_id;
    guint position_timer_id;
};

typedef struct {
    AppUi *ui;
    gchar *source;
    gchar *output_path;
} DownloadTask;

typedef struct {
    AppUi *ui;
    gchar *source;
} YoutubePlayTask;

typedef struct {
    AppUi *ui;
    gchar *uri;
    gchar *error_msg;
} YoutubePlayResult;

static gboolean is_youtube_url_text(const gchar *src) {
    return src && (g_strrstr(src, "youtube.com") != NULL || g_strrstr(src, "youtu.be") != NULL);
}

static gboolean is_rtsp_url_text(const gchar *src) {
    return src && g_str_has_prefix(src, "rtsp://");
}

static void app_ui_log(AppUi *ui, const char *fmt, ...) {
    va_list args;
    gchar *msg = NULL;
    gchar ts[16];
    GDateTime *now = g_date_time_new_now_local();
    g_snprintf(ts, sizeof(ts), "%02d:%02d:%02d",
               g_date_time_get_hour(now),
               g_date_time_get_minute(now),
               g_date_time_get_second(now));
    g_date_time_unref(now);

    va_start(args, fmt);
    msg = g_strdup_vprintf(fmt, args);
    va_end(args);

    gchar *line = g_strdup_printf("[%s] %s\n", ts, msg);
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(ui->log_buffer, &end);
    gtk_text_buffer_insert(ui->log_buffer, &end, line, -1);
    GtkTextMark *mark = gtk_text_buffer_create_mark(ui->log_buffer, NULL, &end, FALSE);
    gtk_text_view_scroll_to_mark(GTK_TEXT_VIEW(ui->log_view), mark, 0.0, TRUE, 0.0, 1.0);

    g_free(line);
    g_free(msg);
}

static void media_log_bridge(void *userdata, const char *fmt, ...) {
    AppUi *ui = userdata;
    va_list args;
    gchar *msg = NULL;

    va_start(args, fmt);
    msg = g_strdup_vprintf(fmt, args);
    va_end(args);
    app_ui_log(ui, "%s", msg);
    g_free(msg);
}

static gboolean hide_overlay_icon_cb(gpointer user_data) {
    AppUi *ui = user_data;
    gtk_widget_hide(ui->overlay_icon);
    ui->overlay_timeout_id = 0;
    return G_SOURCE_REMOVE;
}

static void show_overlay_icon(AppUi *ui, const char *icon_name, gboolean keep_visible) {
    if (ui->overlay_timeout_id != 0) {
        g_source_remove(ui->overlay_timeout_id);
        ui->overlay_timeout_id = 0;
    }
    gtk_image_set_from_icon_name(GTK_IMAGE(ui->overlay_icon), icon_name, GTK_ICON_SIZE_DIALOG);
    gtk_widget_show(ui->overlay_icon);
    if (!keep_visible) {
        ui->overlay_timeout_id = g_timeout_add(900, hide_overlay_icon_cb, ui);
    }
}

static void update_download_button(AppUi *ui) {
    const gchar *src = gtk_entry_get_text(GTK_ENTRY(ui->url_entry));
    gboolean is_youtube = is_youtube_url_text(src) && media_core_is_youtube_supported();
    gboolean is_rtsp = is_rtsp_url_text(src);
    gtk_widget_set_sensitive(ui->download_btn, is_youtube || is_rtsp);
}

static void set_player_state(AppUi *ui, GstState state, const char *reason) {
    media_core_set_state(ui->media, state);
    if (reason) {
        app_ui_log(ui, "%s", reason);
    }
    if (state == GST_STATE_PAUSED) {
        show_overlay_icon(ui, "media-playback-pause-symbolic", TRUE);
    } else if (state == GST_STATE_PLAYING) {
        show_overlay_icon(ui, "media-playback-start-symbolic", FALSE);
    } else if (state == GST_STATE_NULL) {
        gtk_widget_hide(ui->overlay_icon);
    }
}

/* YouTube: 백그라운드에서 yt-dlp로 임시 파일 받은 뒤 메인 스레드에서 file:// 재생 */
static gboolean youtube_play_on_main(gpointer data) {
    YoutubePlayResult *res = data;
    AppUi *ui = res->ui;
    if (res->uri) {
        media_core_play_uri(ui->media, res->uri);
        app_ui_log(ui, "YouTube 재생 시작");
        show_overlay_icon(ui, "media-playback-start-symbolic", FALSE);
    } else {
        app_ui_log(ui, "오류: %s", res->error_msg ? res->error_msg : "YouTube URL 추출 실패");
    }
    g_free(res->uri);
    g_free(res->error_msg);
    g_free(res);
    return G_SOURCE_REMOVE;
}

static gpointer youtube_play_worker(gpointer data) {
    YoutubePlayTask *task = data;
    gchar *error_out = NULL;
    gchar *uri = youtube_service_resolve_playback_url(task->source, &error_out);

    YoutubePlayResult *res = g_new0(YoutubePlayResult, 1);
    res->ui = task->ui;
    res->uri = uri;
    res->error_msg = error_out;

    g_idle_add(youtube_play_on_main, res);
    g_free(task->source);
    g_free(task);
    return NULL;
}

static void on_open_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    AppUi *ui = user_data;
    gchar *trimmed = g_strdup(gtk_entry_get_text(GTK_ENTRY(ui->url_entry)));
    g_strstrip(trimmed);

    if (trimmed[0] == '\0') {
        app_ui_log(ui, "오류: URL 또는 파일 경로를 입력하세요.");
        g_free(trimmed);
        return;
    }

    if (is_youtube_url_text(trimmed)) {
        if (!media_core_is_youtube_supported()) {
            app_ui_log(ui, "오류: yt-dlp가 설치되지 않았습니다. (make deps-install-youtube)");
            g_free(trimmed);
            return;
        }
        app_ui_log(ui, "YouTube 임시 다운로드 중(재생 준비)...: %s", trimmed);
        YoutubePlayTask *task = g_new0(YoutubePlayTask, 1);
        task->ui = ui;
        task->source = trimmed;
        g_thread_new("yt-play", youtube_play_worker, task);
        return;
    }

    gchar *err = NULL;
    if (!media_core_load_and_play(ui->media, trimmed, &err)) {
        app_ui_log(ui, "%s", err ? err : "알 수 없는 오류");
        g_free(err);
        g_free(trimmed);
        return;
    }
    app_ui_log(ui, "재생 시작: %s", trimmed);
    show_overlay_icon(ui, "media-playback-start-symbolic", FALSE);
    g_free(trimmed);
}

static void on_choose_file(GtkButton *button, gpointer user_data) {
    (void)button;
    AppUi *ui = user_data;
    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "동영상 파일 선택",
        GTK_WINDOW(ui->window),
        GTK_FILE_CHOOSER_ACTION_OPEN,
        "_Cancel", GTK_RESPONSE_CANCEL,
        "_Open", GTK_RESPONSE_ACCEPT,
        NULL);

    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        GtkFileChooser *chooser = GTK_FILE_CHOOSER(dialog);
        gchar *filename = gtk_file_chooser_get_filename(chooser);
        if (filename) {
            gtk_entry_set_text(GTK_ENTRY(ui->url_entry), filename);
            gchar *err = NULL;
            if (!media_core_load_and_play(ui->media, filename, &err)) {
                app_ui_log(ui, "%s", err ? err : "알 수 없는 오류");
                g_free(err);
            } else {
                app_ui_log(ui, "재생 시작: %s", filename);
                show_overlay_icon(ui, "media-playback-start-symbolic", FALSE);
            }
            g_free(filename);
        }
    }
    gtk_widget_destroy(dialog);
}

static void on_play_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    AppUi *ui = user_data;
    set_player_state(ui, GST_STATE_PLAYING, "상태 변경: playing");
}

static void on_pause_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    AppUi *ui = user_data;
    set_player_state(ui, GST_STATE_PAUSED, "상태 변경: paused");
}

static void on_stop_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    AppUi *ui = user_data;
    media_core_stop(ui->media);
    gtk_range_set_value(GTK_RANGE(ui->seek_scale), 0.0);
    gtk_label_set_text(GTK_LABEL(ui->time_label), "00:00 / 00:00");
    gtk_widget_hide(ui->overlay_icon);
    app_ui_log(ui, "정지");
}

static gboolean on_video_click(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
    (void)widget;
    (void)event;
    AppUi *ui = user_data;
    GstState state = GST_STATE_NULL;
    gst_element_get_state(ui->media->playbin, &state, NULL, 0);
    if (state == GST_STATE_NULL) {
        app_ui_log(ui, "동영상 클릭: 재생 중인 미디어가 없습니다.");
        return TRUE;
    }
    media_core_toggle_play_pause(ui->media);
    if (state == GST_STATE_PLAYING) {
        app_ui_log(ui, "동영상 클릭: 일시정지");
        show_overlay_icon(ui, "media-playback-pause-symbolic", TRUE);
    } else {
        app_ui_log(ui, "동영상 클릭: 재생");
        show_overlay_icon(ui, "media-playback-start-symbolic", FALSE);
    }
    return TRUE;
}

static void on_volume_changed(GtkRange *range, gpointer user_data) {
    AppUi *ui = user_data;
    gdouble value = gtk_range_get_value(range);
    media_core_set_volume(ui->media, value / 100.0);
    gchar *text = g_strdup_printf("%d%%", (gint)value);
    gtk_label_set_text(GTK_LABEL(ui->volume_value_label), text);
    g_free(text);
}

static void on_url_changed(GtkEditable *editable, gpointer user_data) {
    (void)editable;
    AppUi *ui = user_data;
    update_download_button(ui);
}

static void on_download_process_exit(GPid pid, gint status, gpointer data) {
    DownloadTask *t = data;
    AppUi *u = t->ui;
    gboolean success = WIFEXITED(status) && WEXITSTATUS(status) == 0;

    if (success) {
        app_ui_log(u, "다운로드 완료: %s", t->output_path);
        GtkWidget *msg = gtk_message_dialog_new(
            GTK_WINDOW(u->window),
            GTK_DIALOG_MODAL,
            GTK_MESSAGE_INFO,
            GTK_BUTTONS_OK,
            "다운로드가 완료되었습니다.\n%s",
            t->output_path);
        gtk_dialog_run(GTK_DIALOG(msg));
        gtk_widget_destroy(msg);
    } else {
        app_ui_log(u, "다운로드 실패: %s", t->source);
        GtkWidget *msg = gtk_message_dialog_new(
            GTK_WINDOW(u->window),
            GTK_DIALOG_MODAL,
            GTK_MESSAGE_ERROR,
            GTK_BUTTONS_OK,
            "다운로드에 실패했습니다.\n소스: %s",
            t->source);
        gtk_dialog_run(GTK_DIALOG(msg));
        gtk_widget_destroy(msg);
    }

    g_spawn_close_pid(pid);
    update_download_button(u);
    g_free(t->source);
    g_free(t->output_path);
    g_free(t);
}

static void on_download_clicked(GtkButton *button, gpointer user_data) {
    (void)button;
    AppUi *ui = user_data;
    const gchar *src = gtk_entry_get_text(GTK_ENTRY(ui->url_entry));
    if (!is_youtube_url_text(src) && !is_rtsp_url_text(src)) {
        app_ui_log(ui, "다운로드는 YouTube 또는 RTSP 링크에서만 가능합니다.");
        return;
    }

    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "저장 위치 선택",
        GTK_WINDOW(ui->window),
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_Cancel", GTK_RESPONSE_CANCEL,
        "_Save", GTK_RESPONSE_ACCEPT,
        NULL);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dialog), TRUE);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dialog), "download.mp4");

    if (gtk_dialog_run(GTK_DIALOG(dialog)) != GTK_RESPONSE_ACCEPT) {
        gtk_widget_destroy(dialog);
        return;
    }

    gchar *save_path = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
    gtk_widget_destroy(dialog);
    if (!save_path) {
        app_ui_log(ui, "다운로드 취소됨");
        return;
    }

    GPid child_pid = 0;
    GError *gerr = NULL;
    gboolean ok = FALSE;

    gtk_widget_set_sensitive(ui->download_btn, FALSE);

    if (is_youtube_url_text(src)) {
        /* web 클라이언트 + node JS 런타임으로 PO Token 자동 생성, mp4로 병합 출력 */
        gchar *argv[] = {
            "yt-dlp",
            "--ignore-config",
            "--no-playlist",
            "--merge-output-format", "mp4",
            "-f", "bestvideo+bestaudio/best",
            "-o", save_path,
            (gchar *)src,
            NULL
        };
        ok = g_spawn_async(
            NULL, argv, NULL,
            G_SPAWN_SEARCH_PATH | G_SPAWN_DO_NOT_REAP_CHILD,
            NULL, NULL, &child_pid, &gerr);
    } else {
        gchar *location_arg = g_strdup_printf("location=%s", src);
        gchar *output_arg = g_strdup_printf("location=%s", save_path);
        gchar *argv[] = {
            "gst-launch-1.0",
            "-e",
            "rtspsrc", location_arg, "latency=200",
            "!", "rtph264depay",
            "!", "h264parse",
            "!", "mp4mux",
            "!", "filesink", output_arg,
            NULL
        };
        ok = g_spawn_async(
            NULL, argv, NULL,
            G_SPAWN_SEARCH_PATH | G_SPAWN_DO_NOT_REAP_CHILD,
            NULL, NULL, &child_pid, &gerr);
        g_free(location_arg);
        g_free(output_arg);
    }

    if (!ok) {
        app_ui_log(ui, "다운로드 시작 실패: %s", gerr ? gerr->message : "unknown");
        if (gerr) g_error_free(gerr);
        g_free(save_path);
        update_download_button(ui);
        return;
    }

    DownloadTask *task = g_new0(DownloadTask, 1);
    task->ui = ui;
    task->source = g_strdup(src);
    task->output_path = save_path;

    g_child_watch_add(child_pid, on_download_process_exit, task);
    app_ui_log(ui, "다운로드 시작: %s -> %s", src, save_path);
}

static gboolean on_seek_press(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
    (void)widget;
    (void)event;
    AppUi *ui = user_data;
    ui->is_seeking = TRUE;
    return FALSE;
}

static gboolean on_seek_release(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
    (void)widget;
    (void)event;
    AppUi *ui = user_data;
    if (ui->last_duration_ns > 0) {
        gdouble value = gtk_range_get_value(GTK_RANGE(ui->seek_scale));
        gint64 target = (gint64)((value / 100.0) * ui->last_duration_ns);
        gboolean ok = media_core_seek_percent(ui->media, value, ui->last_duration_ns);
        if (ok) {
            gchar *t = media_core_format_ns(target);
            app_ui_log(ui, "시킹: %s", t);
            g_free(t);
        } else {
            app_ui_log(ui, "시킹 실패");
        }
    }
    ui->is_seeking = FALSE;
    return FALSE;
}

static void on_seek_changed(GtkRange *range, gpointer user_data) {
    AppUi *ui = user_data;
    if (!ui->is_seeking || ui->last_duration_ns <= 0) {
        return;
    }
    gdouble value = gtk_range_get_value(range);
    gint64 pos = (gint64)((value / 100.0) * ui->last_duration_ns);
    gchar *pos_s = media_core_format_ns(pos);
    gchar *dur_s = media_core_format_ns(ui->last_duration_ns);
    gchar *label = g_strdup_printf("%s / %s", pos_s, dur_s);
    gtk_label_set_text(GTK_LABEL(ui->time_label), label);
    g_free(label);
    g_free(pos_s);
    g_free(dur_s);
}

static gboolean update_position_ui(gpointer user_data) {
    AppUi *ui = user_data;
    if (ui->is_seeking) {
        return G_SOURCE_CONTINUE;
    }

    gint64 pos = 0, dur = 0;
    if (!media_core_query_position(ui->media, &pos, &dur)) {
        return G_SOURCE_CONTINUE;
    }

    ui->last_duration_ns = dur;
    if (pos >= 0) {
        gdouble p = ((gdouble)pos / (gdouble)dur) * 100.0;
        gtk_range_set_value(GTK_RANGE(ui->seek_scale), CLAMP(p, 0.0, 100.0));
    }

    gchar *pos_s = media_core_format_ns(pos);
    gchar *dur_s = media_core_format_ns(dur);
    gchar *label = g_strdup_printf("%s / %s", pos_s, dur_s);
    gtk_label_set_text(GTK_LABEL(ui->time_label), label);
    g_free(label);
    g_free(pos_s);
    g_free(dur_s);
    return G_SOURCE_CONTINUE;
}

static void on_window_destroy(GtkWidget *widget, gpointer user_data) {
    (void)widget;
    AppUi *ui = user_data;
    if (ui->overlay_timeout_id != 0) {
        g_source_remove(ui->overlay_timeout_id);
        ui->overlay_timeout_id = 0;
    }
    if (ui->position_timer_id != 0) {
        g_source_remove(ui->position_timer_id);
        ui->position_timer_id = 0;
    }
    gtk_main_quit();
}

AppUi *app_ui_create(MediaCore *media) {
    AppUi *ui = g_new0(AppUi, 1);
    ui->media = media;

    ui->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(ui->window), "GTK Video Player (C / File / YouTube / RTSP)");
    gtk_window_set_default_size(GTK_WINDOW(ui->window), 1100, 700);
    g_signal_connect(ui->window, "destroy", G_CALLBACK(on_window_destroy), ui);

    GtkWidget *root = gtk_box_new(GTK_ORIENTATION_VERTICAL, 8);
    gtk_container_set_border_width(GTK_CONTAINER(root), 8);
    gtk_container_add(GTK_CONTAINER(ui->window), root);

    GtkWidget *input_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_pack_start(GTK_BOX(root), input_row, FALSE, FALSE, 0);

    GtkWidget *open_btn = gtk_button_new_with_label("링크 열기");
    g_signal_connect(open_btn, "clicked", G_CALLBACK(on_open_clicked), ui);
    gtk_box_pack_start(GTK_BOX(input_row), open_btn, FALSE, FALSE, 0);

    GtkWidget *file_btn = gtk_button_new_with_label("파일 선택");
    g_signal_connect(file_btn, "clicked", G_CALLBACK(on_choose_file), ui);
    gtk_box_pack_start(GTK_BOX(input_row), file_btn, FALSE, FALSE, 0);

    ui->url_entry = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(ui->url_entry),
                                   "동영상 파일 경로, YouTube 링크, RTSP 링크를 입력하세요");
    g_signal_connect(ui->url_entry, "changed", G_CALLBACK(on_url_changed), ui);
    gtk_box_pack_start(GTK_BOX(input_row), ui->url_entry, TRUE, TRUE, 0);

    ui->video_overlay = gtk_overlay_new();
    gtk_box_pack_start(GTK_BOX(root), ui->video_overlay, TRUE, TRUE, 0);

    if (ui->media->video_sink) {
        g_object_get(ui->media->video_sink, "widget", &ui->video_widget, NULL);
    } else {
        ui->video_widget = gtk_drawing_area_new();
    }
    gtk_widget_set_size_request(ui->video_widget, -1, 420);
    gtk_widget_add_events(ui->video_widget, GDK_BUTTON_PRESS_MASK);
    g_signal_connect(ui->video_widget, "button-press-event", G_CALLBACK(on_video_click), ui);
    gtk_container_add(GTK_CONTAINER(ui->video_overlay), ui->video_widget);

    ui->overlay_icon = gtk_image_new_from_icon_name("media-playback-pause-symbolic", GTK_ICON_SIZE_DIALOG);
    gtk_widget_set_halign(ui->overlay_icon, GTK_ALIGN_CENTER);
    gtk_widget_set_valign(ui->overlay_icon, GTK_ALIGN_CENTER);
    gtk_overlay_add_overlay(GTK_OVERLAY(ui->video_overlay), ui->overlay_icon);
    gtk_widget_set_no_show_all(ui->overlay_icon, TRUE);
    gtk_widget_hide(ui->overlay_icon);

    GtkWidget *control_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_pack_start(GTK_BOX(root), control_row, FALSE, FALSE, 0);

    GtkWidget *play_btn = gtk_button_new();
    GtkWidget *pause_btn = gtk_button_new();
    GtkWidget *stop_btn = gtk_button_new();
    gtk_button_set_image(GTK_BUTTON(play_btn),
                         gtk_image_new_from_icon_name("media-playback-start-symbolic", GTK_ICON_SIZE_BUTTON));
    gtk_button_set_image(GTK_BUTTON(pause_btn),
                         gtk_image_new_from_icon_name("media-playback-pause-symbolic", GTK_ICON_SIZE_BUTTON));
    gtk_button_set_image(GTK_BUTTON(stop_btn),
                         gtk_image_new_from_icon_name("media-playback-stop-symbolic", GTK_ICON_SIZE_BUTTON));
    gtk_widget_set_tooltip_text(play_btn, "Play");
    gtk_widget_set_tooltip_text(pause_btn, "Pause");
    gtk_widget_set_tooltip_text(stop_btn, "Stop");
    g_signal_connect(play_btn, "clicked", G_CALLBACK(on_play_clicked), ui);
    g_signal_connect(pause_btn, "clicked", G_CALLBACK(on_pause_clicked), ui);
    g_signal_connect(stop_btn, "clicked", G_CALLBACK(on_stop_clicked), ui);
    gtk_box_pack_start(GTK_BOX(control_row), play_btn, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(control_row), pause_btn, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(control_row), stop_btn, FALSE, FALSE, 0);

    ui->download_btn = gtk_button_new_with_label("Download");
    gtk_widget_set_sensitive(ui->download_btn, FALSE);
    g_signal_connect(ui->download_btn, "clicked", G_CALLBACK(on_download_clicked), ui);
    gtk_box_pack_start(GTK_BOX(control_row), ui->download_btn, FALSE, FALSE, 0);

    GtkWidget *volume_icon = gtk_image_new_from_icon_name("audio-volume-high-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_box_pack_end(GTK_BOX(control_row), volume_icon, FALSE, FALSE, 0);

    ui->volume_scale = gtk_scale_new_with_range(GTK_ORIENTATION_HORIZONTAL, 0.0, 100.0, 1.0);
    gtk_widget_set_size_request(ui->volume_scale, 140, -1);
    gtk_scale_set_draw_value(GTK_SCALE(ui->volume_scale), FALSE);
    gdouble init_volume = media_core_get_volume(ui->media) * 100.0;
    gtk_range_set_value(GTK_RANGE(ui->volume_scale), init_volume);
    g_signal_connect(ui->volume_scale, "value-changed", G_CALLBACK(on_volume_changed), ui);
    gtk_box_pack_end(GTK_BOX(control_row), ui->volume_scale, FALSE, FALSE, 0);

    ui->volume_value_label = gtk_label_new(NULL);
    gchar *volume_text = g_strdup_printf("%d%%", (gint)init_volume);
    gtk_label_set_text(GTK_LABEL(ui->volume_value_label), volume_text);
    g_free(volume_text);
    gtk_box_pack_end(GTK_BOX(control_row), ui->volume_value_label, FALSE, FALSE, 0);

    ui->time_label = gtk_label_new("00:00 / 00:00");
    gtk_box_pack_end(GTK_BOX(control_row), ui->time_label, FALSE, FALSE, 0);

    ui->seek_scale = gtk_scale_new_with_range(GTK_ORIENTATION_HORIZONTAL, 0.0, 100.0, 1.0);
    gtk_scale_set_draw_value(GTK_SCALE(ui->seek_scale), FALSE);
    g_signal_connect(ui->seek_scale, "button-press-event", G_CALLBACK(on_seek_press), ui);
    g_signal_connect(ui->seek_scale, "button-release-event", G_CALLBACK(on_seek_release), ui);
    g_signal_connect(ui->seek_scale, "value-changed", G_CALLBACK(on_seek_changed), ui);
    gtk_box_pack_start(GTK_BOX(root), ui->seek_scale, FALSE, FALSE, 0);

    GtkWidget *log_frame = gtk_frame_new("Log");
    gtk_box_pack_start(GTK_BOX(root), log_frame, FALSE, FALSE, 0);

    GtkWidget *log_scroll = gtk_scrolled_window_new(NULL, NULL);
    gtk_widget_set_size_request(log_scroll, -1, 160);
    gtk_container_add(GTK_CONTAINER(log_frame), log_scroll);

    ui->log_view = gtk_text_view_new();
    gtk_text_view_set_editable(GTK_TEXT_VIEW(ui->log_view), FALSE);
    gtk_text_view_set_cursor_visible(GTK_TEXT_VIEW(ui->log_view), FALSE);
    ui->log_buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(ui->log_view));
    gtk_container_add(GTK_CONTAINER(log_scroll), ui->log_view);

    ui->media->logger = (MediaLogFunc)media_log_bridge;
    ui->media->logger_userdata = ui;
    update_download_button(ui);

    ui->position_timer_id = g_timeout_add(300, update_position_ui, ui);
    return ui;
}

void app_ui_run(AppUi *ui) {
    gtk_widget_show_all(ui->window);
    gtk_main();
}

void app_ui_destroy(AppUi *ui) {
    if (!ui) {
        return;
    }
    g_free(ui);
}
