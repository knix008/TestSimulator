#include "main_window.h"
#include "vnc_client.h"
#include "vnc_display.h"
#include "connection_dialog.h"
#include "profile.h"
#include <string.h>
#include <stdarg.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <sys/wait.h>
#include <unistd.h>
#include <glib/gstdio.h>

struct _VncMainWindow {
    GtkApplicationWindow parent;

    VncClient  *client;
    VncDisplay *display;

    GtkWidget  *scrolled;
    GtkWidget  *statusbar;
    guint       statusbar_ctx;

    /* Toolbar – quick-connect fields */
    GtkWidget  *combo_profile;
    GtkWidget  *entry_host;
    GtkWidget  *spin_port;
    GtkWidget  *entry_password;
    GtkWidget  *btn_save_profile;
    GtkWidget  *btn_connect;
    GtkWidget  *btn_disconnect;

    /* Toolbar – view controls */
    GtkWidget  *btn_fullscreen;
    GtkWidget  *combo_scale;
    GtkWidget  *lbl_desktop;
    GtkWidget  *btn_record;

    gboolean    fullscreen;
    gboolean    loading_profile;
    gboolean    recording;
    GList      *toolbar_profiles;

    guint       fb_update_count;
    guint64     fb_update_pixels;
    gint64      last_fb_update_us;
    guint       no_update_timeout_id;
    guint       refresh_timer_id;

    GPid        ffmpeg_pid;
    guint       ffmpeg_watch_id;
    gint        ffmpeg_stdin_fd;
    guint       record_timer_id;
    gint        record_width;
    gint        record_height;
    gchar      *record_output_path;
};

G_DEFINE_TYPE(VncMainWindow, vnc_main_window, GTK_TYPE_APPLICATION_WINDOW)

/* ------------------------------------------------------------------ dialogs */

static void show_error_dialog(VncMainWindow *self,
                              const gchar   *primary,
                              const gchar   *secondary) {
    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(self),
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        GTK_MESSAGE_ERROR,
        GTK_BUTTONS_CLOSE,
        "%s",
        primary ? primary : "VNC error");

    if (secondary && secondary[0] != '\0')
        gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg),
                                                 "%s", secondary);

    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

static void show_info_dialog(VncMainWindow *self,
                             const gchar   *primary,
                             const gchar   *secondary) {
    GtkWidget *dlg = gtk_message_dialog_new(
        GTK_WINDOW(self),
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        GTK_MESSAGE_INFO,
        GTK_BUTTONS_CLOSE,
        "%s",
        primary ? primary : "Information");

    if (secondary && secondary[0] != '\0')
        gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg),
                                                 "%s", secondary);

    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}

static gboolean is_user_disconnect_reason(const gchar *reason) {
    return reason && g_strcmp0(reason, "disconnected") == 0;
}

/* ------------------------------------------------------------------ status */

static void set_status(VncMainWindow *self, const gchar *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    gchar *msg = g_strdup_vprintf(fmt, ap);
    va_end(ap);
    gtk_statusbar_pop (GTK_STATUSBAR(self->statusbar), self->statusbar_ctx);
    gtk_statusbar_push(GTK_STATUSBAR(self->statusbar), self->statusbar_ctx, msg);
    g_free(msg);
}

static void clear_no_update_watch(VncMainWindow *self) {
    if (self->no_update_timeout_id != 0) {
        g_source_remove(self->no_update_timeout_id);
        self->no_update_timeout_id = 0;
    }
}

static void clear_refresh_timer(VncMainWindow *self) {
    if (self->refresh_timer_id != 0) {
        g_source_remove(self->refresh_timer_id);
        self->refresh_timer_id = 0;
    }
}

static void clear_update_watch(VncMainWindow *self) {
    clear_no_update_watch(self);
    clear_refresh_timer(self);
}

static void update_recording_indicator(VncMainWindow *self) {
    if (!self->btn_record)
        return;

    if (self->recording) {
        gtk_tool_button_set_label(GTK_TOOL_BUTTON(self->btn_record), "🟢 Stop");
        gtk_widget_set_tooltip_text(self->btn_record, "Stop recording");
    } else {
        gtk_tool_button_set_label(GTK_TOOL_BUTTON(self->btn_record), "🔴 Record");
        gtk_widget_set_tooltip_text(self->btn_record, "Start recording (H.264, HQ)");
    }
}

static void stop_recording(VncMainWindow *self);

static gboolean write_all(gint fd, const guint8 *buf, gsize len) {
    while (len > 0) {
        ssize_t n = write(fd, buf, len);
        if (n < 0) {
            if (errno == EINTR)
                continue;
            return FALSE;
        }
        buf += (gsize)n;
        len -= (gsize)n;
    }
    return TRUE;
}

static gboolean on_record_timer(gpointer ud) {
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);
    if (!self->recording || self->ffmpeg_stdin_fd < 0 || !vnc_client_is_connected(self->client)) {
        self->record_timer_id = 0;
        return G_SOURCE_REMOVE;
    }

    const uint32_t *fb = vnc_client_lock_fb(self->client);
    if (!fb)
        return G_SOURCE_CONTINUE;

    gsize frame_bytes = (gsize)self->record_width * (gsize)self->record_height * 4u;
    gboolean ok = write_all(self->ffmpeg_stdin_fd, (const guint8 *)fb, frame_bytes);
    vnc_client_unlock_fb(self->client);

    if (!ok) {
        stop_recording(self);
        set_status(self, "Recording stopped: failed to write frames to encoder.");
        return G_SOURCE_REMOVE;
    }

    return G_SOURCE_CONTINUE;
}

static void on_ffmpeg_child_exit(GPid pid, gint status, gpointer ud) {
    (void)pid;
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);
    gboolean was_recording = self->recording;

    if (self->record_timer_id != 0) {
        g_source_remove(self->record_timer_id);
        self->record_timer_id = 0;
    }
    if (self->ffmpeg_stdin_fd >= 0) {
        close(self->ffmpeg_stdin_fd);
        self->ffmpeg_stdin_fd = -1;
    }
    if (self->ffmpeg_pid != 0) {
        g_spawn_close_pid(self->ffmpeg_pid);
        self->ffmpeg_pid = 0;
    }
    self->ffmpeg_watch_id = 0;
    self->recording = FALSE;
    update_recording_indicator(self);

    if (self->record_output_path && was_recording &&
        WIFEXITED(status) && WEXITSTATUS(status) == 0) {
        set_status(self, "Recording saved: %s", self->record_output_path);
        show_info_dialog(self, "Recording saved", self->record_output_path);
    } else if (was_recording && !WIFEXITED(status)) {
        set_status(self, "Recording stopped unexpectedly.");
    } else if (was_recording && WIFEXITED(status) && WEXITSTATUS(status) != 0) {
        set_status(self, "Recording stopped unexpectedly (ffmpeg exit code %d).",
                   WEXITSTATUS(status));
    }
}

static gboolean start_recording(VncMainWindow *self, GError **error) {
    if (self->recording)
        return TRUE;
    if (!vnc_client_is_connected(self->client)) {
        g_set_error_literal(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                            "Connect to a server before recording.");
        return FALSE;
    }

    gint width = vnc_client_get_width(self->client);
    gint height = vnc_client_get_height(self->client);
    if (width <= 0 || height <= 0) {
        g_set_error_literal(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                            "Framebuffer size is not available yet.");
        return FALSE;
    }

    g_clear_pointer(&self->record_output_path, g_free);
    GDateTime *now = g_date_time_new_now_local();
    gchar *stamp = g_date_time_format(now, "%Y%m%d-%H%M%S");
    const gchar *videos_dir = g_get_user_special_dir(G_USER_DIRECTORY_VIDEOS);
    if (!videos_dir || videos_dir[0] == '\0')
        videos_dir = g_get_home_dir();
    if (!videos_dir || videos_dir[0] == '\0')
        videos_dir = "/tmp";
    if (g_mkdir_with_parents(videos_dir, 0755) != 0) {
        videos_dir = g_get_home_dir();
        if (!videos_dir || videos_dir[0] == '\0')
            videos_dir = "/tmp";
        g_mkdir_with_parents(videos_dir, 0755);
    }
    self->record_output_path = g_strdup_printf("%s/vnc-recording-%s.mp4", videos_dir, stamp);
    g_free(stamp);
    g_date_time_unref(now);

    gchar *video_size = g_strdup_printf("%dx%d", width, height);
    gchar *pulse_native = g_build_filename(g_get_user_runtime_dir(), "pulse", "native", NULL);
    gboolean has_pulse = g_file_test(pulse_native, G_FILE_TEST_EXISTS);
    g_free(pulse_native);

    gchar *argv_with_audio[] = {
        "ffmpeg",
        "-y",
        "-loglevel", "error",
        "-f", "rawvideo",
        "-pix_fmt", "bgr0",
        "-s:v", video_size,
        "-r", "10",
        "-i", "-",
        "-f", "pulse",
        "-thread_queue_size", "1024",
        "-i", "default",
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        self->record_output_path,
        NULL
    };
    gchar *argv_video_only[] = {
        "ffmpeg",
        "-y",
        "-loglevel", "error",
        "-f", "rawvideo",
        "-pix_fmt", "bgr0",
        "-s:v", video_size,
        "-r", "10",
        "-i", "-",
        "-map", "0:v:0",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        self->record_output_path,
        NULL
    };
    gchar **argv = has_pulse ? argv_with_audio : argv_video_only;

    gint stdin_fd = -1;
    gboolean spawned = g_spawn_async_with_pipes(
        NULL, argv, NULL,
        G_SPAWN_SEARCH_PATH | G_SPAWN_DO_NOT_REAP_CHILD,
        NULL, NULL,
        &self->ffmpeg_pid,
        &stdin_fd,
        NULL,
        NULL,
        error);
    g_free(video_size);

    if (!spawned) {
        g_clear_pointer(&self->record_output_path, g_free);
        self->ffmpeg_pid = 0;
        return FALSE;
    }

    self->ffmpeg_stdin_fd = stdin_fd;
    self->record_width = width;
    self->record_height = height;
    self->recording = TRUE;
    update_recording_indicator(self);

    self->ffmpeg_watch_id = g_child_watch_add(self->ffmpeg_pid, on_ffmpeg_child_exit, self);
    self->record_timer_id = g_timeout_add(500, on_record_timer, self);
    return TRUE;
}

static void stop_recording(VncMainWindow *self) {
    if (!self->recording && self->ffmpeg_pid == 0)
        return;

    if (self->record_timer_id != 0) {
        g_source_remove(self->record_timer_id);
        self->record_timer_id = 0;
    }
    self->recording = FALSE;
    update_recording_indicator(self);

    if (self->ffmpeg_stdin_fd >= 0) {
        close(self->ffmpeg_stdin_fd);
        self->ffmpeg_stdin_fd = -1;
    }
    if (self->ffmpeg_pid != 0) {
        /* Ask ffmpeg to finalize container immediately on stop. */
        kill(self->ffmpeg_pid, SIGINT);
    }
}

static gboolean on_refresh_timer(gpointer ud) {
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);

    if (!vnc_client_is_connected(self->client)) {
        self->refresh_timer_id = 0;
        return G_SOURCE_REMOVE;
    }

    vnc_client_request_refresh(self->client);
    return G_SOURCE_CONTINUE;
}

static gboolean on_no_update_timeout(gpointer ud) {
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);
    self->no_update_timeout_id = 0;

    if (vnc_client_is_connected(self->client) && self->fb_update_count == 0)
        set_status(self, "Connected, waiting for framebuffer update from server...");

    return G_SOURCE_REMOVE;
}

static void reset_update_stats(VncMainWindow *self) {
    clear_update_watch(self);
    self->fb_update_count = 0;
    self->fb_update_pixels = 0;
    self->last_fb_update_us = 0;
}

/* ------------------------------------------------------------------ profiles */

static VncProfile *get_active_toolbar_profile(VncMainWindow *self) {
    if (!self->combo_profile) return NULL;

    gint active = gtk_combo_box_get_active(GTK_COMBO_BOX(self->combo_profile));
    if (active <= 0) return NULL;

    return g_list_nth_data(self->toolbar_profiles, active - 1);
}

static void apply_profile_to_toolbar(VncMainWindow *self, const VncProfile *p) {
    if (!p) return;

    self->loading_profile = TRUE;
    gtk_entry_set_text(GTK_ENTRY(self->entry_host), p->host);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(self->spin_port), (gdouble)p->port);
    gtk_entry_set_text(GTK_ENTRY(self->entry_password), p->password);
    gtk_combo_box_set_active(GTK_COMBO_BOX(self->combo_scale), (gint)p->scale_mode);
    vnc_display_set_scale_mode(self->display, p->scale_mode);
    self->loading_profile = FALSE;

    set_status(self, "Profile loaded: %s", p->name);
}

static void reload_toolbar_profiles(VncMainWindow *self) {
    if (!self->combo_profile) return;

    self->loading_profile = TRUE;
    gtk_combo_box_text_remove_all(GTK_COMBO_BOX_TEXT(self->combo_profile));
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(self->combo_profile), "Select profile");

    g_list_free_full(self->toolbar_profiles, (GDestroyNotify)profile_free);
    self->toolbar_profiles = profile_load_all();

    for (GList *l = self->toolbar_profiles; l; l = l->next) {
        VncProfile *p = l->data;
        gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(self->combo_profile), p->name);
    }

    gtk_combo_box_set_active(GTK_COMBO_BOX(self->combo_profile), 0);
    gtk_widget_set_tooltip_text(self->combo_profile,
        self->toolbar_profiles ? "Load a saved profile" : "No saved profiles");
    self->loading_profile = FALSE;
}

static void select_toolbar_profile_by_name(VncMainWindow *self, const gchar *name) {
    if (!name || !self->combo_profile) return;

    gint index = 1;
    for (GList *l = self->toolbar_profiles; l; l = l->next, index++) {
        VncProfile *p = l->data;
        if (g_strcmp0(p->name, name) == 0) {
            self->loading_profile = TRUE;
            gtk_combo_box_set_active(GTK_COMBO_BOX(self->combo_profile), index);
            self->loading_profile = FALSE;
            return;
        }
    }
}

static void fill_profile_from_toolbar(VncMainWindow *self, VncProfile *p) {
    const gchar *host = gtk_entry_get_text(GTK_ENTRY(self->entry_host));
    const gchar *pass = gtk_entry_get_text(GTK_ENTRY(self->entry_password));

    g_strlcpy(p->host, host ? host : "", PROFILE_MAX_HOST);
    g_strlcpy(p->password, pass ? pass : "", PROFILE_MAX_PASS);
    p->port = (gint)gtk_spin_button_get_value(GTK_SPIN_BUTTON(self->spin_port));
    p->save_password = p->password[0] != '\0';
    p->shared = TRUE;
    p->view_only = FALSE;
    p->scale_mode = (VncScaleMode)gtk_combo_box_get_active(GTK_COMBO_BOX(self->combo_scale));
}

static gboolean toolbar_host_has_value(VncMainWindow *self) {
    const gchar *host = gtk_entry_get_text(GTK_ENTRY(self->entry_host));
    if (!host) return FALSE;
    while (g_ascii_isspace(*host)) host++;
    return *host != '\0';
}

static void save_toolbar_profile(VncMainWindow *self) {
    if (!toolbar_host_has_value(self)) {
        set_status(self, "Profile not saved: host is empty.");
        show_error_dialog(self, "Cannot save profile", "Please enter a host address first.");
        return;
    }

    VncProfile *active = get_active_toolbar_profile(self);
    gchar saved_name[PROFILE_MAX_NAME];

    if (active) {
        g_strlcpy(saved_name, active->name, sizeof(saved_name));
        fill_profile_from_toolbar(self, active);
    } else {
        const gchar *host = gtk_entry_get_text(GTK_ENTRY(self->entry_host));
        gint port = (gint)gtk_spin_button_get_value(GTK_SPIN_BUTTON(self->spin_port));
        g_snprintf(saved_name, sizeof(saved_name), "%s:%d", host, port);

        VncProfile *existing = profile_find(self->toolbar_profiles, saved_name);
        if (existing) {
            active = existing;
        } else {
            active = profile_new(saved_name);
            self->toolbar_profiles = g_list_append(self->toolbar_profiles, active);
        }
        fill_profile_from_toolbar(self, active);
    }

    profile_save_all(self->toolbar_profiles);
    reload_toolbar_profiles(self);
    select_toolbar_profile_by_name(self, saved_name);
    set_status(self, "Profile saved: %s", saved_name);
}

/* ------------------------------------------------------------------ connect helpers */

static void do_connect_with_options(VncMainWindow *self,
                                    gboolean       shared,
                                    gboolean       view_only) {
    const gchar *host = gtk_entry_get_text(GTK_ENTRY(self->entry_host));
    if (!host || host[0] == '\0') {
        set_status(self, "Please enter a host address.");
        return;
    }
    gint        port  = (gint)gtk_spin_button_get_value(GTK_SPIN_BUTTON(self->spin_port));
    const gchar *pass = gtk_entry_get_text(GTK_ENTRY(self->entry_password));

    if (vnc_client_is_connected(self->client))
        vnc_client_disconnect(self->client);

    GError *err = NULL;
    if (!vnc_client_connect(self->client, host, port, pass,
                            shared, view_only, &err)) {
        const gchar *msg = err ? err->message : "unknown error";
        set_status(self, "Error: %s", msg);
        show_error_dialog(self, "Connection failed", msg);
        g_clear_error(&err);
        return;
    }

    /* Disable inputs while connecting */
    gtk_widget_set_sensitive(self->combo_profile,   FALSE);
    gtk_widget_set_sensitive(self->entry_host,     FALSE);
    gtk_widget_set_sensitive(self->spin_port,      FALSE);
    gtk_widget_set_sensitive(self->entry_password, FALSE);
    gtk_widget_set_sensitive(self->btn_save_profile, FALSE);
    gtk_widget_set_sensitive(self->btn_connect,    FALSE);
    gtk_widget_set_sensitive(self->btn_disconnect, TRUE);

    set_status(self, "Connecting to %s:%d …", host, port);
}

static void do_connect(VncMainWindow *self) {
    VncProfile *p = get_active_toolbar_profile(self);
    do_connect_with_options(self, p ? p->shared : TRUE, p ? p->view_only : FALSE);
}

static void do_disconnect(VncMainWindow *self) {
    if (self->recording)
        stop_recording(self);
    vnc_client_disconnect(self->client);
}

/* ------------------------------------------------------------------ VNC callbacks */

static void on_vnc_connected(VncClient *client, gpointer ud) {
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);
    gint w = vnc_client_get_width(client);
    gint h = vnc_client_get_height(client);
    const gchar *name = vnc_client_get_desktop_name(client);

    reset_update_stats(self);
    self->no_update_timeout_id = g_timeout_add_seconds(3, on_no_update_timeout, self);
    self->refresh_timer_id = g_timeout_add(500, on_refresh_timer, self);

    gtk_label_set_text(GTK_LABEL(self->lbl_desktop), name ? name : "");
    vnc_display_on_resize(self->display, w, h);
    gtk_widget_set_sensitive(self->btn_record, TRUE);

    set_status(self, "Connected: %s  (%d × %d), requesting framebuffer...",
               name ? name : "", w, h);
}

static void on_vnc_disconnected(VncClient *client, const gchar *reason, gpointer ud) {
    (void)client;
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);
    if (self->recording)
        stop_recording(self);

    clear_update_watch(self);
    gtk_label_set_text(GTK_LABEL(self->lbl_desktop), "");
    gtk_widget_queue_draw(GTK_WIDGET(self->display));

    /* Re-enable quick-connect fields */
    gtk_widget_set_sensitive(self->combo_profile,   TRUE);
    gtk_widget_set_sensitive(self->entry_host,     TRUE);
    gtk_widget_set_sensitive(self->spin_port,      TRUE);
    gtk_widget_set_sensitive(self->entry_password, TRUE);
    gtk_widget_set_sensitive(self->btn_save_profile, TRUE);
    gtk_widget_set_sensitive(self->btn_connect,    TRUE);
    gtk_widget_set_sensitive(self->btn_disconnect, FALSE);
    gtk_widget_set_sensitive(self->btn_record,     FALSE);

    set_status(self, "Disconnected: %s", reason ? reason : "");
    if (!is_user_disconnect_reason(reason))
        show_error_dialog(self, "VNC connection error",
                          reason ? reason : "The connection was closed unexpectedly.");
}

static void on_vnc_update(VncClient *client, gint x, gint y, gint w, gint h, gpointer ud) {
    (void)client;
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);

    clear_no_update_watch(self);
    self->fb_update_count++;
    self->fb_update_pixels += (guint64)MAX(w, 0) * (guint64)MAX(h, 0);
    self->last_fb_update_us = g_get_monotonic_time();

    vnc_display_refresh(self->display, x, y, w, h);

    gdouble content = vnc_client_get_nonblack_ratio(client) * 100.0;
    set_status(self,
        "Receiving framebuffer: update #%u, rect %d,%d %dx%d, content %.1f%%, total %.1f MP",
        self->fb_update_count, x, y, w, h,
        content,
        (gdouble)self->fb_update_pixels / 1000000.0);
}

static void on_vnc_resized(VncClient *client, gint width, gint height, gpointer ud) {
    (void)client;
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);
    vnc_display_on_resize(self->display, width, height);
    if (self->recording) {
        stop_recording(self);
        set_status(self, "Desktop resized to %d × %d. Recording stopped; start again to keep correct size.",
                   width, height);
        return;
    }
    set_status(self, "Desktop resized to %d × %d", width, height);
}

static void on_vnc_bell(VncClient *client, gpointer ud) {
    (void)client; (void)ud;
    gdk_display_beep(gdk_display_get_default());
}

static void on_vnc_cut_text(VncClient *client, const gchar *text, gpointer ud) {
    (void)client; (void)ud;
    gtk_clipboard_set_text(gtk_clipboard_get(GDK_SELECTION_CLIPBOARD), text, -1);
}

/* ------------------------------------------------------------------ toolbar signal callbacks */

static void on_connect_clicked(GtkButton *btn, gpointer ud) {
    (void)btn;
    do_connect(VNC_MAIN_WINDOW(ud));
}

static void on_disconnect_clicked(GtkButton *btn, gpointer ud) {
    (void)btn;
    do_disconnect(VNC_MAIN_WINDOW(ud));
}

static void on_save_profile_clicked(GtkButton *btn, gpointer ud) {
    (void)btn;
    save_toolbar_profile(VNC_MAIN_WINDOW(ud));
}

static void on_profile_changed(GtkComboBox *combo, gpointer ud) {
    (void)combo;
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);
    if (self->loading_profile) return;

    VncProfile *p = get_active_toolbar_profile(self);
    if (p) apply_profile_to_toolbar(self, p);
}

/* Pressing Enter in any quick-connect field triggers connect */
static void on_entry_activate(GtkEntry *e, gpointer ud) {
    (void)e;
    do_connect(VNC_MAIN_WINDOW(ud));
}

static void on_fullscreen_toggled(GtkToggleToolButton *btn, gpointer ud) {
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);
    self->fullscreen = gtk_toggle_tool_button_get_active(btn);
    if (self->fullscreen) gtk_window_fullscreen(GTK_WINDOW(self));
    else                  gtk_window_unfullscreen(GTK_WINDOW(self));
}

static void on_scale_changed(GtkComboBox *combo, gpointer ud) {
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);
    if (!self->display || !self->scrolled) return;

    VncScaleMode mode = (VncScaleMode)gtk_combo_box_get_active(combo);
    vnc_display_set_scale_mode(self->display, mode);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(self->scrolled),
        mode == VNC_SCALE_NONE ? GTK_POLICY_AUTOMATIC : GTK_POLICY_NEVER,
        mode == VNC_SCALE_NONE ? GTK_POLICY_AUTOMATIC : GTK_POLICY_NEVER);
}

static void on_record_toggled(GtkToolButton *btn, gpointer ud) {
    (void)btn;
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);

    if (self->recording) {
        stop_recording(self);
        set_status(self, "Recording stopping...");
        return;
    }

    GError *err = NULL;
    if (!start_recording(self, &err)) {
        const gchar *msg = err ? err->message : "unknown error";
        set_status(self, "Recording start failed: %s", msg);
        show_error_dialog(self, "Failed to start recording", msg);
        g_clear_error(&err);
        return;
    }

    set_status(self, "Recording started (H.264 HQ): %s", self->record_output_path);
}

static void on_send_ctrl_alt_del(GtkMenuItem *item, gpointer ud) {
    (void)item;
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);
    vnc_client_send_key_event(self->client, GDK_KEY_Control_L, TRUE);
    vnc_client_send_key_event(self->client, GDK_KEY_Alt_L,     TRUE);
    vnc_client_send_key_event(self->client, GDK_KEY_Delete,    TRUE);
    vnc_client_send_key_event(self->client, GDK_KEY_Delete,    FALSE);
    vnc_client_send_key_event(self->client, GDK_KEY_Alt_L,     FALSE);
    vnc_client_send_key_event(self->client, GDK_KEY_Control_L, FALSE);
}

static gboolean on_window_key_press(GtkWidget *w, GdkEventKey *ev, gpointer ud) {
    (void)ud;
    VncMainWindow *self = VNC_MAIN_WINDOW(w);
    if (ev->keyval == GDK_KEY_F11) {
        gtk_toggle_tool_button_set_active(GTK_TOGGLE_TOOL_BUTTON(self->btn_fullscreen),
            !self->fullscreen);
        return TRUE;
    }
    return FALSE;
}

/* ------------------------------------------------------------------ profile dialog (from menu) */

static void on_profiles_open(GtkMenuItem *item, gpointer ud) {
    (void)item;
    VncMainWindow *self = VNC_MAIN_WINDOW(ud);

    GtkWidget  *dlg = vnc_connection_dialog_new(GTK_WINDOW(self));
    VncProfile *p   = vnc_connection_dialog_run(VNC_CONNECTION_DIALOG(dlg));
    gtk_widget_destroy(dlg);
    reload_toolbar_profiles(self);
    if (!p) return;

    /* Fill toolbar fields from selected profile */
    gtk_entry_set_text(GTK_ENTRY(self->entry_host), p->host);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(self->spin_port), (gdouble)p->port);
    gtk_entry_set_text(GTK_ENTRY(self->entry_password), p->password);
    vnc_display_set_scale_mode(self->display, p->scale_mode);
    gtk_combo_box_set_active(GTK_COMBO_BOX(self->combo_scale), (gint)p->scale_mode);

    for (GList *l = self->toolbar_profiles; l; l = l->next) {
        VncProfile *saved = l->data;
        if (g_strcmp0(saved->name, p->name) == 0) {
            gtk_combo_box_set_active(GTK_COMBO_BOX(self->combo_profile),
                                     (gint)g_list_position(self->toolbar_profiles, l) + 1);
            break;
        }
    }

    /* Then connect immediately */
    do_connect_with_options(self, p->shared, p->view_only);

    profile_free(p);
}

/* ------------------------------------------------------------------ menu */

static GtkWidget *build_menubar(VncMainWindow *self) {
    GtkWidget *bar = gtk_menu_bar_new();

    /* File */
    GtkWidget *file_menu   = gtk_menu_new();
    GtkWidget *file_item   = gtk_menu_item_new_with_mnemonic("_File");
    GtkWidget *mi_profiles = gtk_menu_item_new_with_mnemonic("_Profiles…");
    GtkWidget *mi_disc     = gtk_menu_item_new_with_mnemonic("_Disconnect");
    GtkWidget *mi_quit     = gtk_menu_item_new_with_mnemonic("_Quit");
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), mi_profiles);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), mi_disc);
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), gtk_separator_menu_item_new());
    gtk_menu_shell_append(GTK_MENU_SHELL(file_menu), mi_quit);
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(file_item), file_menu);
    gtk_menu_shell_append(GTK_MENU_SHELL(bar), file_item);

    g_signal_connect(mi_profiles, "activate", G_CALLBACK(on_profiles_open),     self);
    g_signal_connect_swapped(mi_disc, "activate", G_CALLBACK(do_disconnect),    self);
    g_signal_connect_swapped(mi_quit, "activate", G_CALLBACK(gtk_widget_destroy), self);

    /* Actions */
    GtkWidget *act_menu = gtk_menu_new();
    GtkWidget *act_item = gtk_menu_item_new_with_mnemonic("_Actions");
    GtkWidget *mi_cad   = gtk_menu_item_new_with_mnemonic("Send _Ctrl+Alt+Del");
    gtk_menu_shell_append(GTK_MENU_SHELL(act_menu), mi_cad);
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(act_item), act_menu);
    gtk_menu_shell_append(GTK_MENU_SHELL(bar), act_item);
    g_signal_connect(mi_cad, "activate", G_CALLBACK(on_send_ctrl_alt_del), self);

    /* View */
    GtkWidget *view_menu = gtk_menu_new();
    GtkWidget *view_item = gtk_menu_item_new_with_mnemonic("_View");
    GtkWidget *mi_fs     = gtk_check_menu_item_new_with_mnemonic("_Fullscreen  (F11)");
    gtk_menu_shell_append(GTK_MENU_SHELL(view_menu), mi_fs);
    gtk_menu_item_set_submenu(GTK_MENU_ITEM(view_item), view_menu);
    gtk_menu_shell_append(GTK_MENU_SHELL(bar), view_item);
    g_signal_connect_swapped(mi_fs, "toggled", G_CALLBACK(gtk_window_fullscreen), self);

    return bar;
}

/* ------------------------------------------------------------------ toolbar helper */

/* Wrap any widget in a GtkToolItem with an optional left label. */
static GtkToolItem *make_tool_widget(const gchar *label_text, GtkWidget *widget) {
    GtkToolItem *item = gtk_tool_item_new();
    if (label_text) {
        GtkWidget *box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 4);
        GtkWidget *lbl = gtk_label_new(label_text);
        gtk_widget_set_halign(lbl, GTK_ALIGN_END);
        gtk_box_pack_start(GTK_BOX(box), lbl,    FALSE, FALSE, 2);
        gtk_box_pack_start(GTK_BOX(box), widget, FALSE, FALSE, 0);
        gtk_container_add(GTK_CONTAINER(item), box);
    } else {
        gtk_container_add(GTK_CONTAINER(item), widget);
    }
    return item;
}

/* ------------------------------------------------------------------ toolbar */

static GtkWidget *build_toolbar(VncMainWindow *self) {
    GtkWidget *bar = gtk_toolbar_new();
    gtk_toolbar_set_style(GTK_TOOLBAR(bar), GTK_TOOLBAR_ICONS);

    /* ── quick-connect fields (order: Profile · Address · Port · Password · Connect) ── */

    /* Profile */
    self->combo_profile = gtk_combo_box_text_new();
    gtk_widget_set_size_request(self->combo_profile, 150, -1);
    gtk_toolbar_insert(GTK_TOOLBAR(bar),
        make_tool_widget("Profile:", self->combo_profile), -1);
    reload_toolbar_profiles(self);

    /* Address */
    self->entry_host = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(self->entry_host), "Host / IP");
    gtk_entry_set_width_chars(GTK_ENTRY(self->entry_host), 20);
    gtk_toolbar_insert(GTK_TOOLBAR(bar),
        make_tool_widget("Address:", self->entry_host), -1);

    /* Port */
    self->spin_port = gtk_spin_button_new_with_range(1, 65535, 1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(self->spin_port), VNC_DEFAULT_PORT);
    gtk_widget_set_size_request(self->spin_port, 70, -1);
    gtk_toolbar_insert(GTK_TOOLBAR(bar),
        make_tool_widget("Port:", self->spin_port), -1);

    /* Password */
    self->entry_password = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(self->entry_password), "Password");
    gtk_entry_set_visibility(GTK_ENTRY(self->entry_password), FALSE);
    gtk_entry_set_width_chars(GTK_ENTRY(self->entry_password), 12);
    gtk_toolbar_insert(GTK_TOOLBAR(bar),
        make_tool_widget("Password:", self->entry_password), -1);

    /* Save profile button */
    self->btn_save_profile = GTK_WIDGET(gtk_tool_button_new(
        gtk_image_new_from_icon_name("document-save-symbolic", GTK_ICON_SIZE_SMALL_TOOLBAR),
        "Save Profile"));
    gtk_widget_set_tooltip_text(self->btn_save_profile, "Save current connection as profile");
    gtk_toolbar_insert(GTK_TOOLBAR(bar), GTK_TOOL_ITEM(self->btn_save_profile), -1);

    /* Connect button */
    self->btn_connect = GTK_WIDGET(gtk_tool_button_new(
        gtk_image_new_from_icon_name("network-wired-symbolic", GTK_ICON_SIZE_SMALL_TOOLBAR),
        "Connect"));
    gtk_widget_set_tooltip_text(self->btn_connect, "Connect (Enter)");
    gtk_toolbar_insert(GTK_TOOLBAR(bar), GTK_TOOL_ITEM(self->btn_connect), -1);

    gtk_toolbar_insert(GTK_TOOLBAR(bar), gtk_separator_tool_item_new(), -1);

    /* Disconnect button */
    self->btn_disconnect = GTK_WIDGET(gtk_tool_button_new(
        gtk_image_new_from_icon_name("network-offline-symbolic", GTK_ICON_SIZE_SMALL_TOOLBAR),
        "Disconnect"));
    gtk_widget_set_tooltip_text(self->btn_disconnect, "Disconnect");
    gtk_widget_set_sensitive(self->btn_disconnect, FALSE);
    gtk_toolbar_insert(GTK_TOOLBAR(bar), GTK_TOOL_ITEM(self->btn_disconnect), -1);

    /* Record button + status indicator */
    self->btn_record = GTK_WIDGET(gtk_tool_button_new(
        NULL,
        "Record"));
    gtk_widget_set_sensitive(self->btn_record, FALSE);
    gtk_toolbar_insert(GTK_TOOLBAR(bar), GTK_TOOL_ITEM(self->btn_record), -1);
    update_recording_indicator(self);

    gtk_toolbar_insert(GTK_TOOLBAR(bar), gtk_separator_tool_item_new(), -1);

    /* ── view controls ── */

    /* Fullscreen toggle */
    self->btn_fullscreen = GTK_WIDGET(gtk_toggle_tool_button_new());
    gtk_tool_button_set_label(GTK_TOOL_BUTTON(self->btn_fullscreen), "Fullscreen");
    gtk_tool_button_set_icon_widget(GTK_TOOL_BUTTON(self->btn_fullscreen),
        gtk_image_new_from_icon_name("view-fullscreen-symbolic",
                                     GTK_ICON_SIZE_SMALL_TOOLBAR));
    gtk_widget_set_tooltip_text(self->btn_fullscreen, "Fullscreen (F11)");
    gtk_toolbar_insert(GTK_TOOLBAR(bar), GTK_TOOL_ITEM(self->btn_fullscreen), -1);

    /* Scale combo */
    self->combo_scale = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(self->combo_scale), "None");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(self->combo_scale), "Fit");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(self->combo_scale), "Fill");
    gtk_combo_box_set_active(GTK_COMBO_BOX(self->combo_scale), 1);
    gtk_toolbar_insert(GTK_TOOLBAR(bar),
        make_tool_widget("Scale:", self->combo_scale), -1);

    /* Expanding spacer + desktop name */
    GtkToolItem *spacer = gtk_tool_item_new();
    gtk_tool_item_set_expand(spacer, TRUE);
    self->lbl_desktop = gtk_label_new("");
    gtk_widget_set_halign(self->lbl_desktop, GTK_ALIGN_START);
    gtk_container_add(GTK_CONTAINER(spacer), self->lbl_desktop);
    gtk_toolbar_insert(GTK_TOOLBAR(bar), spacer, -1);

    /* ── signals ── */
    g_signal_connect(self->combo_profile,  "changed",  G_CALLBACK(on_profile_changed),  self);
    g_signal_connect(self->entry_host,     "activate", G_CALLBACK(on_entry_activate),    self);
    g_signal_connect(self->entry_password, "activate", G_CALLBACK(on_entry_activate),    self);
    g_signal_connect(self->btn_save_profile, "clicked", G_CALLBACK(on_save_profile_clicked), self);
    g_signal_connect(self->btn_connect,    "clicked",  G_CALLBACK(on_connect_clicked),   self);
    g_signal_connect(self->btn_disconnect, "clicked",  G_CALLBACK(on_disconnect_clicked),self);
    g_signal_connect(self->btn_record,     "clicked",  G_CALLBACK(on_record_toggled),    self);
    g_signal_connect(self->btn_fullscreen, "toggled",  G_CALLBACK(on_fullscreen_toggled),self);
    g_signal_connect(self->combo_scale,    "changed",  G_CALLBACK(on_scale_changed),     self);

    return bar;
}

/* ------------------------------------------------------------------ GObject */

static void vnc_main_window_dispose(GObject *obj) {
    VncMainWindow *self = VNC_MAIN_WINDOW(obj);
    stop_recording(self);
    if (self->ffmpeg_watch_id != 0) {
        g_source_remove(self->ffmpeg_watch_id);
        self->ffmpeg_watch_id = 0;
    }
    if (self->client) {
        clear_update_watch(self);
        if (self->display)
            vnc_display_set_client(self->display, NULL);
        vnc_client_disconnect(self->client);
        vnc_client_free(self->client);
        self->client = NULL;
    }
    if (self->ffmpeg_pid != 0) {
        kill(self->ffmpeg_pid, SIGTERM);
        g_spawn_close_pid(self->ffmpeg_pid);
        self->ffmpeg_pid = 0;
    }
    g_clear_pointer(&self->record_output_path, g_free);
    g_list_free_full(self->toolbar_profiles, (GDestroyNotify)profile_free);
    self->toolbar_profiles = NULL;
    G_OBJECT_CLASS(vnc_main_window_parent_class)->dispose(obj);
}

static void vnc_main_window_class_init(VncMainWindowClass *klass) {
    G_OBJECT_CLASS(klass)->dispose = vnc_main_window_dispose;
}

static void vnc_main_window_init(VncMainWindow *self) {
    gtk_window_set_title(GTK_WINDOW(self), "VNC Client");
    gtk_window_set_default_size(GTK_WINDOW(self), 1280, 900);
    self->ffmpeg_stdin_fd = -1;
    self->ffmpeg_watch_id = 0;
    self->record_timer_id = 0;

    /* VNC client */
    self->client = vnc_client_new();
    vnc_client_set_connected_cb   (self->client, on_vnc_connected,    self);
    vnc_client_set_disconnected_cb(self->client, on_vnc_disconnected, self);
    vnc_client_set_update_cb      (self->client, on_vnc_update,       self);
    vnc_client_set_resized_cb     (self->client, on_vnc_resized,      self);
    vnc_client_set_bell_cb        (self->client, on_vnc_bell,         self);
    vnc_client_set_cut_text_cb    (self->client, on_vnc_cut_text,     self);

    /* Layout */
    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_container_add(GTK_CONTAINER(self), vbox);
    gtk_box_pack_start(GTK_BOX(vbox), build_menubar(self), FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vbox), build_toolbar(self), FALSE, FALSE, 0);

    /* VNC display area */
    self->display = VNC_DISPLAY(vnc_display_new());
    vnc_display_set_client(self->display, self->client);
    vnc_display_set_scale_mode(self->display, VNC_SCALE_FIT);

    self->scrolled = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(self->scrolled),
        GTK_POLICY_NEVER, GTK_POLICY_NEVER);
    gtk_container_add(GTK_CONTAINER(self->scrolled), GTK_WIDGET(self->display));
    gtk_box_pack_start(GTK_BOX(vbox), self->scrolled, TRUE, TRUE, 0);

    /* Status bar */
    self->statusbar     = gtk_statusbar_new();
    self->statusbar_ctx = gtk_statusbar_get_context_id(
        GTK_STATUSBAR(self->statusbar), "main");
    gtk_box_pack_end(GTK_BOX(vbox), self->statusbar, FALSE, FALSE, 0);
    set_status(self, "Ready – enter host address and click Connect");

    g_signal_connect(self, "key-press-event", G_CALLBACK(on_window_key_press), NULL);
}

/* ------------------------------------------------------------------ public */

GtkWidget *vnc_main_window_new(GtkApplication *app) {
    return GTK_WIDGET(g_object_new(VNC_TYPE_MAIN_WINDOW,
        "application", app, NULL));
}
