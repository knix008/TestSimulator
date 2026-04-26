#include <gtk/gtk.h>
#include <glib.h>
#include <glib/gstdio.h>
#include <string.h>
#include "gst_helper.h"
#include <signal.h>

typedef struct {
    GtkWidget *window;
    GtkWidget *url_entry;
    GtkWidget *status_label;
    GtkWidget *play_button;
    GtkWidget *pause_button;
    GtkWidget *stop_button;
    GtkWidget *download_button;
    GtkWidget *video_widget;
    gboolean is_playing;
    gboolean is_paused;
} AppWidgets;

static void set_status(AppWidgets *app, const gchar *text);
static void update_playback_buttons(AppWidgets *app, gboolean playing, gboolean paused);

typedef struct {
    AppWidgets *app;
    gchar *url;
} DownloadTask;

typedef struct {
    DownloadTask *task;
    gboolean success;
    gchar *message;
} DownloadResult;

static const gchar *entry_get_text_compat(GtkWidget *entry) {
#if GTK_MAJOR_VERSION >= 4
    return gtk_editable_get_text(GTK_EDITABLE(entry));
#else
    return gtk_entry_get_text(GTK_ENTRY(entry));
#endif
}

static void box_append_compat(GtkWidget *box, GtkWidget *child) {
#if GTK_MAJOR_VERSION >= 4
    gtk_box_append(GTK_BOX(box), child);
#else
    gtk_box_pack_start(GTK_BOX(box), child, FALSE, FALSE, 0);
#endif
}

static void box_append_expand_compat(GtkWidget *box, GtkWidget *child) {
#if GTK_MAJOR_VERSION >= 4
    gtk_widget_set_vexpand(child, TRUE);
    gtk_box_append(GTK_BOX(box), child);
#else
    gtk_box_pack_start(GTK_BOX(box), child, TRUE, TRUE, 0);
#endif
}

static void window_set_child_compat(GtkWidget *window, GtkWidget *child) {
#if GTK_MAJOR_VERSION >= 4
    gtk_window_set_child(GTK_WINDOW(window), child);
#else
    gtk_container_add(GTK_CONTAINER(window), child);
#endif
}

static void window_present_compat(GtkWidget *window) {
#if GTK_MAJOR_VERSION >= 4
    gtk_window_present(GTK_WINDOW(window));
#else
    gtk_widget_show_all(window);
    gtk_window_present(GTK_WINDOW(window));
#endif
}

static void set_status(AppWidgets *app, const gchar *text) {
    gtk_label_set_text(GTK_LABEL(app->status_label), text);
}

static void update_playback_buttons(AppWidgets *app, gboolean playing, gboolean paused) {
    gtk_widget_set_sensitive(app->play_button, !playing);
    gtk_widget_set_sensitive(app->pause_button, playing);
    gtk_widget_set_sensitive(app->stop_button, playing || paused);
}

static gboolean is_youtube_url(const gchar *url) {
    if (url == NULL || *url == '\0') {
        return FALSE;
    }
    return (g_strrstr(url, "youtube.com/watch") != NULL) ||
           (g_strrstr(url, "youtu.be/") != NULL);
}

static gboolean command_exists(const gchar *command) {
    return g_find_program_in_path(command) != NULL;
}

static gchar *build_download_dir(void) {
    gchar *cwd = g_get_current_dir();
    gchar *dir = g_build_filename(cwd, "downloads", NULL);
    g_free(cwd);
    g_mkdir_with_parents(dir, 0755);
    return dir;
}

static void on_play_clicked(GtkButton *button, gpointer user_data) {
    AppWidgets *app = (AppWidgets *)user_data;
    const gchar *url = entry_get_text_compat(app->url_entry);
    (void)button;

    if (!is_youtube_url(url)) {
        set_status(app, "오류: 올바른 YouTube 링크를 입력하세요.");
        return;
    }

    if (!command_exists("yt-dlp")) {
        set_status(app, "오류: yt-dlp가 설치되어 있지 않습니다.");
        return;
    }

    set_status(app, "재생 준비 중... (스트림 URL 추출 중)");
    gst_play_youtube_url(app->video_widget, url, app->status_label);
    app->is_playing = TRUE;
    app->is_paused = FALSE;
    update_playback_buttons(app, TRUE, FALSE);
}

static void on_pause_clicked(GtkButton *button, gpointer user_data) {
    AppWidgets *app = (AppWidgets *)user_data;
    (void)button;
    if (!app->is_playing) {
        set_status(app, "재생 중인 영상이 없습니다.");
        return;
    }
    gst_pause_playback();
    app->is_paused = !app->is_paused;
}

static void on_stop_clicked(GtkButton *button, gpointer user_data) {
    AppWidgets *app = (AppWidgets *)user_data;
    (void)button;
    if (!app->is_playing) {
        set_status(app, "재생 중인 영상이 없습니다.");
        return;
    }
    gst_stop_playback();
    app->is_playing = FALSE;
    app->is_paused = FALSE;
    update_playback_buttons(app, FALSE, FALSE);
    set_status(app, "재생 정지.");
}

static gboolean on_download_finished_ui(gpointer user_data) {
    DownloadResult *result = (DownloadResult *)user_data;
    DownloadTask *task = result->task;
    AppWidgets *app = task->app;

    set_status(app, result->message);
    gtk_widget_set_sensitive(app->play_button, TRUE);
    gtk_widget_set_sensitive(app->download_button, TRUE);

    g_free(result->message);
    g_free(result);
    g_free(task->url);
    g_free(task);
    return G_SOURCE_REMOVE;
}

static gpointer download_worker(gpointer user_data) {
    DownloadTask *task = (DownloadTask *)user_data;
    gchar *download_dir = build_download_dir();
    gchar *output_template = g_build_filename(download_dir, "%(title)s.%(ext)s", NULL);
    gchar *quoted_url = g_shell_quote(task->url);
    gchar *quoted_output = g_shell_quote(output_template);
    gchar *cmd = g_strdup_printf(
        "yt-dlp --no-playlist -o %s %s",
        quoted_output, quoted_url);

    gchar *stdout_str = NULL;
    gchar *stderr_str = NULL;
    GError *error = NULL;
    gint exit_status = 0;

    DownloadResult *result = g_new0(DownloadResult, 1);
    result->task = task;

    gboolean spawned = g_spawn_command_line_sync(cmd, &stdout_str, &stderr_str, &exit_status, &error);

    if (!spawned || exit_status != 0) {
        result->success = FALSE;
        if ((stderr_str && (g_strrstr(stderr_str, "HTTP Error 403") ||
                            g_strrstr(stderr_str, "Sign in"))) ||
            (stdout_str && (g_strrstr(stdout_str, "Precondition check failed") ||
                            g_strrstr(stdout_str, "nsig extraction failed") ||
                            g_strrstr(stdout_str, "HTTP Error 403")))) {
            result->message = g_strdup("다운로드 실패: yt-dlp 업데이트가 필요할 수 있습니다.");
        } else {
            result->message = g_strdup("다운로드 실패. 터미널 로그를 확인하세요.");
        }
        g_printerr("yt-dlp failed.\n");
        if (error) {
            g_printerr("spawn error: %s\n", error->message);
            g_error_free(error);
        }
        if (stderr_str && *stderr_str) {
            g_printerr("%s\n", stderr_str);
        }
        if (stdout_str && *stdout_str) {
            g_printerr("%s\n", stdout_str);
        }
    } else {
        result->success = TRUE;
        result->message = g_strdup_printf("다운로드 완료: %s", download_dir);
    }
    g_idle_add(on_download_finished_ui, result);

    g_free(stdout_str);
    g_free(stderr_str);
    g_free(cmd);
    g_free(quoted_url);
    g_free(quoted_output);
    g_free(output_template);
    g_free(download_dir);
    return NULL;
}

static void on_download_clicked(GtkButton *button, gpointer user_data) {
    AppWidgets *app = (AppWidgets *)user_data;
    const gchar *url = entry_get_text_compat(app->url_entry);
    DownloadTask *task;
    (void)button;

    if (!is_youtube_url(url)) {
        set_status(app, "오류: 올바른 YouTube 링크를 입력하세요.");
        return;
    }

    if (!command_exists("yt-dlp")) {
        set_status(app, "오류: yt-dlp가 설치되어 있지 않습니다.");
        return;
    }

    gtk_widget_set_sensitive(app->play_button, FALSE);
    gtk_widget_set_sensitive(app->download_button, FALSE);
    set_status(app, "다운로드 중...");

    task = g_new0(DownloadTask, 1);
    task->app = app;
    task->url = g_strdup(url);

    g_thread_new("download-worker", download_worker, task);
}

static void activate(GtkApplication *application, gpointer user_data) {
    AppWidgets *app = (AppWidgets *)user_data;
    GtkWidget *root;
    GtkWidget *title;
    GtkWidget *hint;
    GtkWidget *buttons;
    gchar *download_dir_msg;
    gchar *download_dir;

    app->window = gtk_application_window_new(application);
    gtk_window_set_title(GTK_WINDOW(app->window), "YouTube GTK Player Downloader (C)");
    gtk_window_set_default_size(GTK_WINDOW(app->window), 800, 650);

    root = gtk_box_new(GTK_ORIENTATION_VERTICAL, 8);
    gtk_widget_set_margin_top(root, 12);
    gtk_widget_set_margin_bottom(root, 12);
    gtk_widget_set_margin_start(root, 12);
    gtk_widget_set_margin_end(root, 12);
    window_set_child_compat(app->window, root);

    title = gtk_label_new("YouTube 링크 재생/다운로드 (C + GTK)");
    gtk_label_set_xalign(GTK_LABEL(title), 0.0f);
    box_append_compat(root, title);

    hint = gtk_label_new("링크를 입력한 후 재생 또는 다운로드를 선택하세요.");
    gtk_label_set_xalign(GTK_LABEL(hint), 0.0f);
    box_append_compat(root, hint);

    app->url_entry = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(app->url_entry), "https://www.youtube.com/watch?v=...");
    box_append_compat(root, app->url_entry);

    buttons = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    box_append_compat(root, buttons);

    app->play_button = gtk_button_new_with_label("재생");
    g_signal_connect(app->play_button, "clicked", G_CALLBACK(on_play_clicked), app);
    box_append_compat(buttons, app->play_button);

    app->pause_button = gtk_button_new_with_label("잠시 멈춤");
    g_signal_connect(app->pause_button, "clicked", G_CALLBACK(on_pause_clicked), app);
    box_append_compat(buttons, app->pause_button);

    app->stop_button = gtk_button_new_with_label("멈춤");
    g_signal_connect(app->stop_button, "clicked", G_CALLBACK(on_stop_clicked), app);
    box_append_compat(buttons, app->stop_button);

    app->download_button = gtk_button_new_with_label("다운로드");
    g_signal_connect(app->download_button, "clicked", G_CALLBACK(on_download_clicked), app);
    box_append_compat(buttons, app->download_button);

    /* Video display area */
    app->video_widget = create_gst_video_widget();
    box_append_expand_compat(root, app->video_widget);

    app->status_label = gtk_label_new("대기 중");
    gtk_label_set_xalign(GTK_LABEL(app->status_label), 0.0f);
    box_append_compat(root, app->status_label);

    download_dir = build_download_dir();
    download_dir_msg = g_strdup_printf("다운로드 위치: %s", download_dir);
    hint = gtk_label_new(download_dir_msg);
    gtk_label_set_xalign(GTK_LABEL(hint), 0.0f);
    box_append_compat(root, hint);
    g_free(download_dir_msg);
    g_free(download_dir);

    app->is_playing = FALSE;
    app->is_paused = FALSE;
    update_playback_buttons(app, FALSE, FALSE);

    window_present_compat(app->window);
}

int main(int argc, char **argv) {
    GtkApplication *app;
    AppWidgets widgets = {0};
    int status;

    gst_init(&argc, &argv);

    app = gtk_application_new("com.example.YouTubeGtkC", G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(app, "activate", G_CALLBACK(activate), &widgets);
    status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
