#include "gui_gtk.h"
#include "gui_utils.h"
#include "audio.h"
#include "capture.h"
#include "recorder.h"
#include "window_picker.h"

#include <gdk/gdkkeysyms.h>
#include <gio/gio.h>
#include <gtk/gtk.h>

#ifdef GDK_WINDOWING_X11
#include <gdk/gdkx.h>
#endif

#include <atomic>
#include <cstdint>
#include <ctime>
#include <string>

namespace {

// ── Widget state ─────────────────────────────────────────────────────────────

struct AppWidgets {
    GtkWidget*     window           = nullptr;
    // Video settings
    GtkWidget*     entry_output     = nullptr;
    GtkWidget*     combo_format     = nullptr;
    GtkWidget*     combo_codec      = nullptr;
    GtkAdjustment* fps_adj          = nullptr;
    GtkWidget*     scale_fps        = nullptr;
    GtkWidget*     spin_fps         = nullptr;
    GtkAdjustment* res_adj          = nullptr;
    GtkWidget*     scale_res        = nullptr;
    GtkWidget*     spin_res         = nullptr;
    GtkWidget*     lbl_res_hint     = nullptr;
    GtkWidget*     spin_bitrate     = nullptr;
    GtkWidget*     chk_cursor       = nullptr;
    GtkWidget*     combo_source     = nullptr;
    GtkWidget*     btn_pick_window  = nullptr;
    GtkWidget*     lbl_window       = nullptr;
    // Audio settings
    GtkWidget*     chk_audio        = nullptr;
    GtkWidget*     combo_audio_dev  = nullptr;
    GtkWidget*     btn_audio_refresh= nullptr;
    GtkAdjustment* vol_adj          = nullptr;
    GtkWidget*     scale_vol        = nullptr;
    GtkWidget*     spin_vol         = nullptr;
    // Status
    GtkWidget*     btn_record       = nullptr;
    GtkWidget*     status_led       = nullptr;
    GtkWidget*     lbl_status_text  = nullptr;
    GtkWidget*     lbl_elapsed      = nullptr;
    // Log
    GtkWidget*     log_view         = nullptr;
    GtkTextBuffer* log_buffer       = nullptr;
    // State
    bool           status_recording = false;
};

AppWidgets        g_ui;
GtkApplication*   g_app              = nullptr;
GtkStatusIcon*    g_tray_icon          = nullptr;
bool              g_window_hidden_rec  = false;
bool              g_hidden_for_recording = false;
bool              g_recording_ui_begun   = false;
bool              g_app_hold_active      = false;
std::atomic<bool> g_shutting_down{false};
guint             g_elapsed_timer = 0;
guint             g_portal_pump_timer = 0;
std::uint64_t     g_selected_xid  = 0;
std::string       g_selected_title;
std::string       g_last_output_path;
// Audio device list: parallel to combo_audio_dev items (index 0 = default)
std::vector<AudioSource> g_audio_sources;

// ── Utilities ─────────────────────────────────────────────────────────────────

std::uint64_t own_window_xid() {
#ifdef GDK_WINDOWING_X11
    if (g_ui.window) {
        GdkWindow* gdk_win = gtk_widget_get_window(g_ui.window);
        if (gdk_win && GDK_IS_X11_WINDOW(gdk_win))
            return gdk_x11_window_get_xid(gdk_win);
    }
#endif
    return 0;
}

std::string portal_parent_handle() {
#ifdef GDK_WINDOWING_X11
    if (g_ui.window) {
        GdkWindow* gdk_win = gtk_widget_get_window(g_ui.window);
        if (gdk_win && GDK_IS_X11_WINDOW(gdk_win))
            return "x11:0x" + std::to_string(gdk_x11_window_get_xid(gdk_win));
    }
#endif
    return {};
}

bool source_is_window() {
    return GTK_IS_COMBO_BOX(g_ui.combo_source) &&
           gtk_combo_box_get_active(GTK_COMBO_BOX(g_ui.combo_source)) == 1;
}

void append_log(const std::string& line) {
    if (g_shutting_down.load() || !g_ui.log_buffer) return;
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(g_ui.log_buffer, &end);
    gtk_text_buffer_insert(g_ui.log_buffer, &end, (line + "\n").c_str(), -1);
}

std::string log_text(bool prefer_selection) {
    if (!g_ui.log_buffer) return {};
    GtkTextIter start, end;
    if (prefer_selection && gtk_text_buffer_get_selection_bounds(g_ui.log_buffer, &start, &end)) {
        gchar* raw = gtk_text_buffer_get_text(g_ui.log_buffer, &start, &end, FALSE);
        std::string out = raw ? raw : "";
        g_free(raw);
        return out;
    }
    gtk_text_buffer_get_bounds(g_ui.log_buffer, &start, &end);
    gchar* raw = gtk_text_buffer_get_text(g_ui.log_buffer, &start, &end, FALSE);
    std::string out = raw ? raw : "";
    g_free(raw);
    return out;
}

void copy_log_to_clipboard(bool prefer_selection) {
    if (!g_ui.log_view) return;
    const std::string text = log_text(prefer_selection);
    if (text.empty()) return;
    GtkClipboard* cb = gtk_widget_get_clipboard(g_ui.log_view, GDK_SELECTION_CLIPBOARD);
    gtk_clipboard_set_text(cb, text.c_str(), static_cast<gint>(text.size()));
}

void on_copy_log_clicked(GtkButton*, gpointer) {
    copy_log_to_clipboard(true);
}

void on_clear_log_clicked(GtkButton*, gpointer) {
    if (!g_ui.log_buffer) return;
    gtk_text_buffer_set_text(g_ui.log_buffer, "", 0);
}

gboolean on_log_key_press(GtkWidget*, GdkEventKey* event, gpointer) {
    if ((event->state & GDK_CONTROL_MASK) != 0 && event->keyval == GDK_KEY_c) {
        copy_log_to_clipboard(true);
        return TRUE;
    }
    return FALSE;
}

std::string format_elapsed(std::uint64_t secs) {
    char buf[16];
    std::snprintf(buf, sizeof(buf), "%02u:%02u:%02u",
                  static_cast<unsigned>(secs / 3600),
                  static_cast<unsigned>((secs % 3600) / 60),
                  static_cast<unsigned>(secs % 60));
    return buf;
}

std::string default_output_path(const char* ext) {
    time_t t = std::time(nullptr);
    struct tm* ti = std::localtime(&t);
    char ts[32];
    std::strftime(ts, sizeof(ts), "%Y-%m-%d_%H-%M-%S", ti);
    const char* videos = g_get_user_special_dir(G_USER_DIRECTORY_VIDEOS);
    const std::string dir = videos
        ? std::string(videos) + "/"
        : std::string(g_get_home_dir()) + "/";
    return dir + "recording_" + ts + "." + ext;
}

// Return screen W and H for the primary monitor (used to compute output resolution).
void get_screen_size(int* w, int* h) {
    *w = 1920; *h = 1080;  // safe defaults
#if GTK_CHECK_VERSION(3, 22, 0)
    GdkDisplay*  dpy = gdk_display_get_default();
    GdkMonitor* mon = dpy ? gdk_display_get_primary_monitor(dpy) : nullptr;
    if (mon) {
        GdkRectangle r{};
        gdk_monitor_get_geometry(mon, &r);
        if (r.width > 0)  *w = r.width;
        if (r.height > 0) *h = r.height;
    }
#else
    GdkScreen* scr = gdk_screen_get_default();
    if (scr) {
        *w = gdk_screen_get_width(scr);
        *h = gdk_screen_get_height(scr);
    }
#endif
}

void update_res_hint_label() {
    if (!g_ui.lbl_res_hint || !g_ui.res_adj) return;
    const int pct = static_cast<int>(gtk_adjustment_get_value(g_ui.res_adj));
    int sw = 0, sh = 0;
    get_screen_size(&sw, &sh);
    const int ow = (sw * pct / 100) & ~1;
    const int oh = (sh * pct / 100) & ~1;
    char buf[64];
    if (pct == 100) {
        std::snprintf(buf, sizeof(buf), "→ Native (%d×%d)", sw, sh);
    } else {
        std::snprintf(buf, sizeof(buf), "→ %d×%d  (%d%% of %d×%d)", ow, oh, pct, sw, sh);
    }
    gtk_label_set_text(GTK_LABEL(g_ui.lbl_res_hint), buf);
}

void update_window_picker_ui() {
    const bool win_mode = source_is_window();
    if (g_ui.btn_pick_window)
        gtk_widget_set_sensitive(g_ui.btn_pick_window, win_mode);
    if (g_ui.lbl_window) {
        if (win_mode) {
            gtk_label_set_text(GTK_LABEL(g_ui.lbl_window),
                               g_selected_xid
                               ? g_selected_title.c_str()
                               : "(창을 선택하세요)");
        } else {
            gtk_label_set_text(GTK_LABEL(g_ui.lbl_window),
                               capture_is_wayland()
                               ? "Wayland: Portal 대화상자에서 화면 또는 창 선택"
                               : "X11: 전체 화면 캡처");
        }
    }
}

// Helper: enable/disable the audio device + volume controls (not the checkbox).
void set_audio_device_controls_sensitive(bool sensitive) {
    const bool audio_on = g_ui.chk_audio &&
                          gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(g_ui.chk_audio));
    const bool ok = sensitive && audio_on;
    if (g_ui.combo_audio_dev)   gtk_widget_set_sensitive(g_ui.combo_audio_dev,   ok);
    if (g_ui.btn_audio_refresh) gtk_widget_set_sensitive(g_ui.btn_audio_refresh, ok);
    if (g_ui.scale_vol)         gtk_widget_set_sensitive(g_ui.scale_vol,         ok);
    if (g_ui.spin_vol)          gtk_widget_set_sensitive(g_ui.spin_vol,          ok);
}

// Disable only the recording settings; log/status/stop button remain interactive.
void set_settings_sensitive(bool sensitive) {
    struct { GtkWidget** w; } widgets[] = {
        { &g_ui.entry_output }, { &g_ui.combo_format }, { &g_ui.combo_codec },
        { &g_ui.scale_fps },    { &g_ui.spin_fps },
        { &g_ui.scale_res },    { &g_ui.spin_res },
        { &g_ui.spin_bitrate }, { &g_ui.chk_cursor },
        { &g_ui.combo_source }, { &g_ui.chk_audio }
    };
    for (auto& item : widgets)
        if (*item.w) gtk_widget_set_sensitive(*item.w, sensitive);
    if (g_ui.btn_pick_window)
        gtk_widget_set_sensitive(g_ui.btn_pick_window, sensitive && source_is_window());
    set_audio_device_controls_sensitive(sensitive);
}

// ── Status LED ────────────────────────────────────────────────────────────────

gboolean on_led_draw(GtkWidget*, cairo_t* cr, gpointer) {
    if (g_shutting_down.load()) return FALSE;
    constexpr int sz = 18;
    const double cx = sz / 2.0, cy = sz / 2.0;
    cairo_set_antialias(cr, CAIRO_ANTIALIAS_BEST);
    cairo_set_source_rgb(cr, 0.25, 0.25, 0.25);
    cairo_arc(cr, cx, cy, 7.0, 0, 2.0 * G_PI);
    cairo_fill(cr);
    if (g_ui.status_recording) {
        cairo_set_source_rgb(cr, 0.95, 0.15, 0.15);
    } else {
        cairo_set_source_rgb(cr, 0.35, 0.35, 0.35);
    }
    cairo_arc(cr, cx, cy, 5.5, 0, 2.0 * G_PI);
    cairo_fill(cr);
    return FALSE;
}

void set_status_recording(bool recording) {
    if (!g_ui.status_led || !g_ui.lbl_status_text) return;
    g_ui.status_recording = recording;
    gtk_widget_queue_draw(g_ui.status_led);
    gtk_label_set_text(GTK_LABEL(g_ui.lbl_status_text), recording ? "녹화 중" : "대기 중");
    GtkStyleContext* ctx = gtk_widget_get_style_context(g_ui.lbl_status_text);
    gtk_style_context_add_class(ctx, "status-text");
    gtk_style_context_remove_class(ctx, "stopped");
    gtk_style_context_remove_class(ctx, "recording");
    gtk_style_context_add_class(ctx, recording ? "recording" : "stopped");
}

void set_record_button(bool recording) {
    if (!g_ui.btn_record) return;
    GtkStyleContext* ctx = gtk_widget_get_style_context(g_ui.btn_record);
    gtk_style_context_remove_class(ctx, "start");
    gtk_style_context_remove_class(ctx, "stop");
    if (recording) {
        gtk_button_set_label(GTK_BUTTON(g_ui.btn_record), "녹화 중지");
        gtk_style_context_add_class(ctx, "stop");
    } else {
        gtk_button_set_label(GTK_BUTTON(g_ui.btn_record), "녹화 시작");
        gtk_style_context_add_class(ctx, "start");
    }
    set_status_recording(recording);
}

// ── Elapsed timer ─────────────────────────────────────────────────────────────

gboolean on_elapsed_tick(gpointer) {
    if (g_shutting_down.load()) return G_SOURCE_REMOVE;
    if (!recorder_is_recording()) {
        if (g_ui.lbl_elapsed)
            gtk_label_set_text(GTK_LABEL(g_ui.lbl_elapsed), "00:00:00");
        g_elapsed_timer = 0;
        return G_SOURCE_REMOVE;
    }
    if (g_ui.lbl_elapsed)
        gtk_label_set_text(GTK_LABEL(g_ui.lbl_elapsed),
                           format_elapsed(recorder_elapsed_seconds()).c_str());
    return G_SOURCE_CONTINUE;
}

// ── Recording window hide / stop controls ─────────────────────────────────────

void flush_gtk_events();
void show_main_window();
void hide_main_window();
void release_hold_and_show_window();
void present_settings_window();
void request_stop_recording();
void stop_portal_pump();
void start_portal_pump();
void restore_after_failed_start();
void begin_recording_ui();
void end_recording_ui();

// ── Recording state callbacks (run on GTK main thread) ────────────────────────

void on_recording_started() {
    if (g_shutting_down.load()) return;
    set_record_button(true);
    set_settings_sensitive(false);
    gtk_widget_set_sensitive(g_ui.btn_record, TRUE);
    append_log("── 녹화 시작 ──");
    if (g_elapsed_timer == 0)
        g_elapsed_timer = g_timeout_add(500, on_elapsed_tick, nullptr);
    begin_recording_ui();
}

struct StopDialogData {
    bool        success;
    std::string message;
};

gboolean on_show_stop_result_idle(gpointer user_data) {
    auto* data = static_cast<StopDialogData*>(user_data);
    release_hold_and_show_window();
    show_main_window();
    GtkWindow* parent = GTK_IS_WINDOW(g_ui.window) ? GTK_WINDOW(g_ui.window) : nullptr;
    if (data->success) {
        gui_show_result_dialog(parent,
                               "녹화 완료",
                               "동영상 파일이 저장되었습니다.",
                               data->message,
                               false);
    } else {
        gui_show_result_dialog(parent,
                               "녹화 오류",
                               "녹화 중 오류가 발생했습니다.",
                               data->message,
                               true);
    }
    delete data;
    return G_SOURCE_REMOVE;
}

void on_recording_stopped(bool success, const std::string& message) {
    if (g_shutting_down.load()) return;
    stop_portal_pump();
    if (g_recording_ui_begun)
        end_recording_ui();
    else
        restore_after_failed_start();
    set_record_button(false);
    set_settings_sensitive(true);
    update_window_picker_ui();
    if (g_ui.lbl_elapsed)
        gtk_label_set_text(GTK_LABEL(g_ui.lbl_elapsed), "00:00:00");
    if (g_ui.btn_record)
        gtk_widget_set_sensitive(g_ui.btn_record, TRUE);
    append_log("── 녹화 종료 ──");

    release_hold_and_show_window();
    show_main_window();

    // Present the settings window before the modal result dialog (Wayland/GNOME).
    auto* dlg_data = new StopDialogData{success, message};
    g_idle_add(on_show_stop_result_idle, dlg_data);
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

void populate_audio_combo(const std::vector<AudioSource>& sources) {
    if (!g_ui.combo_audio_dev) return;

    // Remove all existing items
    GtkComboBoxText* combo = GTK_COMBO_BOX_TEXT(g_ui.combo_audio_dev);
    gtk_combo_box_text_remove_all(combo);

    for (const auto& s : sources)
        gtk_combo_box_text_append_text(combo, s.display_name.c_str());

    gtk_combo_box_set_active(GTK_COMBO_BOX(combo), 0);
}

void refresh_audio_sources() {
    g_audio_sources = audio_enumerate_sources();
    populate_audio_combo(g_audio_sources);
    append_log("오디오 장치 목록 갱신: " + std::to_string(g_audio_sources.size() - 1) + "개 발견");
}

// ── Signal callbacks ──────────────────────────────────────────────────────────

void on_source_changed(GtkComboBox*, gpointer) {
    update_window_picker_ui();
}

void on_audio_toggled(GtkToggleButton*, gpointer) {
    set_audio_device_controls_sensitive(true);
}

void on_audio_refresh_clicked(GtkWidget*, gpointer) {
    refresh_audio_sources();
}

void on_format_changed(GtkComboBox* combo, gpointer) {
    if (!g_ui.entry_output) return;
    const char* cur = gtk_entry_get_text(GTK_ENTRY(g_ui.entry_output));
    const bool mkv  = (gtk_combo_box_get_active(combo) == 0);  // 0=MKV, 1=MP4
    std::string path = cur ? cur : "";
    const std::string new_ext = mkv ? ".mkv" : ".mp4";
    const std::string old_ext = mkv ? ".mp4" : ".mkv";
    if (path.size() > old_ext.size() &&
        path.substr(path.size() - old_ext.size()) == old_ext) {
        path.replace(path.size() - old_ext.size(), old_ext.size(), new_ext);
        gtk_entry_set_text(GTK_ENTRY(g_ui.entry_output), path.c_str());
    }
}

void on_res_changed(GtkAdjustment*, gpointer) {
    update_res_hint_label();
}

void on_browse_clicked(GtkWidget*, gpointer) {
    const bool mkv = g_ui.combo_format &&
                     gtk_combo_box_get_active(GTK_COMBO_BOX(g_ui.combo_format)) == 0;  // 0=MKV
    const char* ext = mkv ? "mkv" : "mp4";

    GtkWidget* dlg = gtk_file_chooser_dialog_new(
        "저장 위치 선택", GTK_WINDOW(g_ui.window),
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL,
        "_저장", GTK_RESPONSE_ACCEPT, nullptr);
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dlg), TRUE);

    const char* cur = gtk_entry_get_text(GTK_ENTRY(g_ui.entry_output));
    if (cur && *cur) {
        gtk_file_chooser_set_filename(GTK_FILE_CHOOSER(dlg), cur);
    } else {
        gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dlg),
                                          (std::string("recording.") + ext).c_str());
    }

    GtkFileFilter* filter = gtk_file_filter_new();
    if (mkv) {
        gtk_file_filter_set_name(filter, "Matroska 동영상 (*.mkv)");
        gtk_file_filter_add_pattern(filter, "*.mkv");
    } else {
        gtk_file_filter_set_name(filter, "MPEG-4 동영상 (*.mp4)");
        gtk_file_filter_add_pattern(filter, "*.mp4");
    }
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dlg), filter);

    if (gtk_dialog_run(GTK_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
        char* filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dlg));
        if (filename) {
            gtk_entry_set_text(GTK_ENTRY(g_ui.entry_output), filename);
            g_free(filename);
        }
    }
    gtk_widget_destroy(dlg);
}

void on_pick_window_clicked(GtkWidget*, gpointer) {
    std::uint64_t xid = 0;
    std::string title;
    if (!window_picker_dialog_run(GTK_WINDOW(g_ui.window), own_window_xid(), &xid, &title))
        return;
    g_selected_xid   = xid;
    g_selected_title = title;
    update_window_picker_ui();
}

void release_hold_and_show_window() {
    if (g_app && g_app_hold_active) {
        g_application_release(G_APPLICATION(g_app));
        g_app_hold_active = false;
    }
}

void present_settings_window() {
    // Showing the app window during Portal capture revokes the PipeWire stream (GNOME).
    if (recorder_is_recording() && capture_is_wayland()) {
        append_log("녹화 중에는 설정 창을 표시할 수 없습니다 (PipeWire 스트림이 끊깁니다).");
        append_log("  → 트레이·알림의 [녹화 중지]로 중지하세요.");
        return;
    }
    release_hold_and_show_window();
    show_main_window();
}

void show_main_window() {
    if (!g_ui.window) return;
    if (!gtk_widget_get_realized(g_ui.window))
        gtk_widget_realize(g_ui.window);
    gtk_widget_set_visible(g_ui.window, TRUE);
    gtk_widget_show(g_ui.window);
    gtk_widget_show_all(g_ui.window);
    if (GTK_IS_WINDOW(g_ui.window)) {
        GtkWindow* win = GTK_WINDOW(g_ui.window);
        gtk_window_deiconify(win);
        gtk_window_set_skip_taskbar_hint(win, FALSE);
        gtk_window_set_keep_above(win, FALSE);
        gtk_window_present_with_time(win, GDK_CURRENT_TIME);
    }
    GdkWindow* gdk_win = gtk_widget_get_window(g_ui.window);
    if (gdk_win) {
        gdk_window_raise(gdk_win);
        gdk_window_focus(gdk_win, GDK_CURRENT_TIME);
    }
    flush_gtk_events();
    g_window_hidden_rec = false;
}

void hide_main_window() {
    if (!g_ui.window) return;
    gtk_widget_hide(g_ui.window);
    g_window_hidden_rec = true;
}

void flush_gtk_events() {
    while (gtk_events_pending()) gtk_main_iteration();
    GdkDisplay* display = gdk_display_get_default();
    if (display) gdk_display_flush(display);
}

void stop_portal_pump() {
    if (g_portal_pump_timer) {
        g_source_remove(g_portal_pump_timer);
        g_portal_pump_timer = 0;
    }
}

gboolean on_portal_pump_tick(gpointer) {
    if (!recorder_portal_setup_active()) {
        g_portal_pump_timer = 0;
        return G_SOURCE_REMOVE;
    }
    flush_gtk_events();
    return G_SOURCE_CONTINUE;
}

void start_portal_pump() {
    stop_portal_pump();
    if (capture_is_wayland())
        g_portal_pump_timer = g_timeout_add(50, on_portal_pump_tick, nullptr);
}

void restore_after_failed_start() {
    if (g_recording_ui_begun) return;
    if (!g_hidden_for_recording) return;
    show_main_window();
    if (g_ui.btn_record) gtk_widget_set_sensitive(g_ui.btn_record, TRUE);
    g_hidden_for_recording = false;
}

void request_stop_recording() {
    if (g_shutting_down.load()) return;
    if (recorder_is_recording()) {
        // Do not show the settings window here — it revokes the Portal/PipeWire target.
        recorder_stop();
        if (g_ui.btn_record) gtk_widget_set_sensitive(g_ui.btn_record, FALSE);
        append_log("녹화 중지 요청 — 파일 마무리 중 (완료 후 설정 창 표시)...");
        return;
    }
    // Pipeline already ended but UI may still be hidden.
    if (g_hidden_for_recording || g_window_hidden_rec) {
        end_recording_ui();
        set_record_button(false);
        set_settings_sensitive(true);
        if (g_ui.btn_record) gtk_widget_set_sensitive(g_ui.btn_record, TRUE);
        show_main_window();
        append_log("녹화가 이미 종료됨 — 설정 창을 복구했습니다.");
    }
}

void withdraw_recording_notification() {
    if (!g_app) return;
    g_application_withdraw_notification(G_APPLICATION(g_app), "recording");
}

void show_recording_notification() {
    if (!g_app) return;
    GNotification* n = g_notification_new("recording");
    g_notification_set_title(n, "Screen Recorder");
    g_notification_set_body(n,
        "녹화 중입니다. [녹화 중지] · Ctrl+Shift+S · 트레이 우클릭 메뉴.");
    g_notification_set_priority(n, G_NOTIFICATION_PRIORITY_URGENT);
    g_notification_set_default_action(n, "app.record-show");
    g_notification_add_button(n, "녹화 중지", "app.record-stop");
    g_notification_add_button(n, "설정 창 보이기", "app.record-show");
    g_application_send_notification(G_APPLICATION(g_app), "recording", n);
    g_object_unref(n);
}

#if GTK_CHECK_VERSION(3, 13, 0)

void on_tray_stop_clicked(GtkMenuItem*, gpointer) { request_stop_recording(); }
void on_tray_show_clicked(GtkMenuItem*, gpointer) {
    present_settings_window();
    append_log("트레이 메뉴: 설정 창 표시");
}

void on_tray_icon_popup(GtkStatusIcon* icon, guint button, guint32 time, gpointer) {
    GtkWidget* menu = gtk_menu_new();
    GtkWidget* item_show = gtk_menu_item_new_with_label("설정 창 보이기");
    GtkWidget* item_stop = gtk_menu_item_new_with_label("녹화 중지");
    g_signal_connect(item_show, "activate", G_CALLBACK(on_tray_show_clicked), nullptr);
    g_signal_connect(item_stop, "activate", G_CALLBACK(on_tray_stop_clicked), nullptr);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), item_show);
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), item_stop);
    gtk_widget_show_all(menu);
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"
    gtk_menu_popup(GTK_MENU(menu), nullptr, nullptr,
                   gtk_status_icon_position_menu, icon, button, time);
#pragma GCC diagnostic pop
}

// Left click during recording: open menu (do not show window — breaks PipeWire).
void on_tray_icon_activate(GtkStatusIcon* icon, gpointer) {
    if (recorder_is_recording()) {
        on_tray_icon_popup(icon, 1, gtk_get_current_event_time(), nullptr);
        return;
    }
    present_settings_window();
}

void create_tray_icon() {
    if (g_tray_icon) return;
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"
    g_tray_icon = gtk_status_icon_new_from_icon_name("media-record");
    gtk_status_icon_set_tooltip_text(g_tray_icon,
        "Screen Recorder — 녹화 중 (클릭/우클릭: 메뉴 → 녹화 중지)");
    gtk_status_icon_set_visible(g_tray_icon, TRUE);
    g_signal_connect(g_tray_icon, "activate", G_CALLBACK(on_tray_icon_activate), nullptr);
    g_signal_connect(g_tray_icon, "popup-menu", G_CALLBACK(on_tray_icon_popup), nullptr);
#pragma GCC diagnostic pop
}

void destroy_tray_icon() {
    if (!g_tray_icon) return;
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"
    gtk_status_icon_set_visible(g_tray_icon, FALSE);
#pragma GCC diagnostic pop
    g_object_unref(g_tray_icon);
    g_tray_icon = nullptr;
}
#else
void create_tray_icon() {}
void destroy_tray_icon() {}
#endif

void begin_recording_ui() {
    g_recording_ui_begun = true;
    if (g_app && !g_app_hold_active) {
        g_application_hold(G_APPLICATION(g_app));
        g_app_hold_active = true;
    }
    create_tray_icon();
    show_recording_notification();
    hide_main_window();
    flush_gtk_events();
    // Do not auto-open control window — it would appear in the capture. Use tray/notification.
    append_log("녹화 중: 창을 숨겼습니다.");
    append_log("  중지: 알림 · 트레이 [녹화 중지] · Ctrl+Shift+S (녹화 중 설정 창 표시 불가)");
}

void end_recording_ui() {
    destroy_tray_icon();
    withdraw_recording_notification();
    release_hold_and_show_window();
    show_main_window();
    g_recording_ui_begun   = false;
    g_hidden_for_recording = false;
}

void record_stop_action(GSimpleAction*, GVariant*, gpointer) {
    request_stop_recording();
}

void record_show_action(GSimpleAction*, GVariant*, gpointer) {
    present_settings_window();
    append_log("알림: 설정 창 표시");
}

gboolean on_window_delete_event(GtkWidget* widget, GdkEvent*, gpointer) {
    if (recorder_is_recording()) {
        gtk_widget_hide(widget);
        g_window_hidden_rec = true;
        if (g_app && !g_app_hold_active) {
            g_application_hold(G_APPLICATION(g_app));
            g_app_hold_active = true;
        }
        return TRUE;
    }
    return FALSE;
}

void on_record_clicked(GtkWidget*, gpointer) {
    if (g_shutting_down.load()) return;

    if (recorder_is_recording()) {
        request_stop_recording();
        return;
    }

    const char* out_path = gtk_entry_get_text(GTK_ENTRY(g_ui.entry_output));
    if (!out_path || *out_path == '\0') {
        gui_show_result_dialog(GTK_WINDOW(g_ui.window), "설정 오류",
                               "저장 경로를 입력하거나 [찾아보기]로 선택하세요.",
                               "", true);
        return;
    }
    // Wayland: window is chosen in the Portal dialog, not the X11 picker.
    if (source_is_window() && g_selected_xid == 0 && !capture_is_wayland()) {
        gui_show_result_dialog(GTK_WINDOW(g_ui.window), "설정 오류",
                               "녹화할 창을 먼저 선택하세요.",
                               "", true);
        return;
    }

    RecorderOptions opts;
    opts.output_path     = out_path;
    opts.fps             = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(g_ui.spin_fps));
    opts.bitrate_kbps    = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(g_ui.spin_bitrate));
    opts.show_cursor     = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(g_ui.chk_cursor));
    opts.source          = source_is_window() ? CaptureSource::Window : CaptureSource::FullDesktop;
    opts.window_xid      = g_selected_xid;
    opts.format          = (gtk_combo_box_get_active(GTK_COMBO_BOX(g_ui.combo_format)) == 0)
                           ? OutputFormat::MKV : OutputFormat::MP4;  // 0=MKV, 1=MP4
    opts.codec           = (gtk_combo_box_get_active(GTK_COMBO_BOX(g_ui.combo_codec)) == 0)
                           ? VideoCodec::H265 : VideoCodec::H264;
    // Wayland: do not pass X11 parent — mapping the app window can revoke the cast.
    opts.portal_parent_window = capture_is_wayland() ? "" : portal_parent_handle();

    // Compute output resolution from scale percentage + screen size.
    const int pct = g_ui.res_adj
                    ? static_cast<int>(gtk_adjustment_get_value(g_ui.res_adj))
                    : 100;
    if (pct < 100) {
        int sw = 0, sh = 0;
        get_screen_size(&sw, &sh);
        opts.output_width  = (sw * pct / 100) & ~1;  // must be even for encoders
        opts.output_height = (sh * pct / 100) & ~1;
    }

    // ── Audio options ───────────────────────────────────────────────────────
    if (g_ui.chk_audio &&
        gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(g_ui.chk_audio))) {
        opts.enable_audio = true;
        const int dev_idx = g_ui.combo_audio_dev
                            ? gtk_combo_box_get_active(GTK_COMBO_BOX(g_ui.combo_audio_dev))
                            : 0;
        if (dev_idx >= 0 && dev_idx < static_cast<int>(g_audio_sources.size()))
            opts.audio_device = g_audio_sources[static_cast<std::size_t>(dev_idx)].device_id;
        opts.audio_volume = g_ui.vol_adj
                            ? gtk_adjustment_get_value(g_ui.vol_adj) / 100.0
                            : 1.0;
    }

    g_last_output_path = opts.output_path;

    append_log("화면 공유 대화상자에서 녹화 대상을 선택하세요.");
    if (g_ui.window && GTK_IS_WINDOW(g_ui.window)) {
        gtk_window_present(GTK_WINDOW(g_ui.window));
        flush_gtk_events();
    }
    if (g_ui.btn_record) gtk_widget_set_sensitive(g_ui.btn_record, FALSE);

    const bool ok = recorder_start(
        std::move(opts),
        [](const std::string& msg) { append_log(msg); },
        on_recording_started,
        on_recording_stopped);

    if (!ok) {
        if (g_ui.btn_record) gtk_widget_set_sensitive(g_ui.btn_record, TRUE);
        append_log("오류: 이미 녹화 중이거나 시작할 수 없습니다.");
    } else {
        start_portal_pump();
    }
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

void shutdown_app() {
    if (g_shutting_down.exchange(true)) return;
    if (recorder_is_recording()) recorder_stop();
    end_recording_ui();
}

void on_window_destroy(GtkWidget*, gpointer) {
    g_ui = AppWidgets{};
    destroy_tray_icon();
    withdraw_recording_notification();
    if (g_app) {
        g_object_unref(g_app);
        g_app = nullptr;
    }
    shutdown_app();
}

void on_app_shutdown(GtkApplication*, gpointer) {
    shutdown_app();
}

// ── UI section builders ───────────────────────────────────────────────────────

GtkWidget* build_settings_section() {
    GtkWidget* grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 10);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 12);
    gtk_widget_set_margin_top(grid, 6);
    gtk_widget_set_margin_bottom(grid, 6);
    gtk_widget_set_margin_start(grid, 10);
    gtk_widget_set_margin_end(grid, 10);
    gtk_style_context_add_class(gtk_widget_get_style_context(grid), "form-grid");

    int row = 0;

    // Row: output path
    GtkWidget* out_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    g_ui.entry_output  = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(g_ui.entry_output), "저장 경로를 입력하거나 찾아보기…");
    gtk_widget_set_hexpand(g_ui.entry_output, TRUE);
    gtk_entry_set_text(GTK_ENTRY(g_ui.entry_output), default_output_path("mkv").c_str());
    gtk_box_pack_start(GTK_BOX(out_box), g_ui.entry_output, TRUE, TRUE, 0);
    GtkWidget* btn_browse = gtk_button_new_with_label("찾아보기…");
    g_signal_connect(btn_browse, "clicked", G_CALLBACK(on_browse_clicked), nullptr);
    gtk_box_pack_start(GTK_BOX(out_box), btn_browse, FALSE, FALSE, 0);
    gui_attach_row(GTK_GRID(grid), row++, "저장 경로", out_box);

    // Row: format + codec (side by side)
    GtkWidget* fmt_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 12);
    g_ui.combo_format  = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(g_ui.combo_format), "MKV");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(g_ui.combo_format), "MP4");
    gtk_combo_box_set_active(GTK_COMBO_BOX(g_ui.combo_format), 0);
    g_signal_connect(g_ui.combo_format, "changed", G_CALLBACK(on_format_changed), nullptr);

    g_ui.combo_codec = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(g_ui.combo_codec),
                                   "H.265 / HEVC  (압축 효율 높음)");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(g_ui.combo_codec),
                                   "H.264 / AVC  (호환성 높음)");
    gtk_combo_box_set_active(GTK_COMBO_BOX(g_ui.combo_codec), 0);

    GtkWidget* lbl_fmt   = gtk_label_new("형식");
    GtkWidget* lbl_codec = gtk_label_new("코덱");
    gtk_box_pack_start(GTK_BOX(fmt_box), lbl_fmt,         FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(fmt_box), g_ui.combo_format, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(fmt_box), lbl_codec,       FALSE, FALSE, 8);
    gtk_box_pack_start(GTK_BOX(fmt_box), g_ui.combo_codec, TRUE,  TRUE,  0);
    gui_attach_row(GTK_GRID(grid), row++, "저장 형식", fmt_box);

    // Row: FPS slider + spin
    g_ui.fps_adj  = gtk_adjustment_new(30.0, 5.0, 30.0, 1.0, 5.0, 0.0);
    g_ui.scale_fps = gtk_scale_new(GTK_ORIENTATION_HORIZONTAL, g_ui.fps_adj);
    gtk_scale_set_digits(GTK_SCALE(g_ui.scale_fps), 0);
    gtk_scale_set_draw_value(GTK_SCALE(g_ui.scale_fps), FALSE);
    gtk_scale_set_has_origin(GTK_SCALE(g_ui.scale_fps), TRUE);
    gtk_widget_set_hexpand(g_ui.scale_fps, TRUE);
    gtk_widget_set_size_request(g_ui.scale_fps, 380, 48);

    // FPS marks every 5 fps. Zero-pad single digit so all labels are 2 chars wide.
    static const double kFpsMarks[] = { 5, 10, 15, 20, 25, 30 };
    static const char* kFpsLabels[] = { "05", "10", "15", "20", "25", "30" };
    gui_add_scale_marks(GTK_SCALE(g_ui.scale_fps), kFpsMarks, kFpsLabels, 6);

    g_ui.spin_fps = gtk_spin_button_new(g_ui.fps_adj, 1.0, 0);
    gtk_spin_button_set_numeric(GTK_SPIN_BUTTON(g_ui.spin_fps), TRUE);
    gtk_widget_set_size_request(g_ui.spin_fps, 72, -1);

    // GtkSizeGroup ensures "fps" and "%" labels take the same width → both sliders
    // have identical track length regardless of label text width difference.
    GtkSizeGroup* unit_sg = gtk_size_group_new(GTK_SIZE_GROUP_HORIZONTAL);

    GtkWidget* fps_box  = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    GtkWidget* lbl_fpsu = gtk_label_new("fps");
    gtk_label_set_xalign(GTK_LABEL(lbl_fpsu), 0.0f);
    gtk_size_group_add_widget(unit_sg, lbl_fpsu);
    gtk_box_pack_start(GTK_BOX(fps_box), g_ui.scale_fps, TRUE,  TRUE,  0);
    gtk_box_pack_start(GTK_BOX(fps_box), g_ui.spin_fps,  FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(fps_box), lbl_fpsu,       FALSE, FALSE, 0);
    gui_attach_row(GTK_GRID(grid), row++, "프레임 레이트", fps_box);

    // Row: Resolution scale % slider + spin + hint label
    g_ui.res_adj  = gtk_adjustment_new(100.0, 10.0, 100.0, 1.0, 10.0, 0.0);
    g_ui.scale_res = gtk_scale_new(GTK_ORIENTATION_HORIZONTAL, g_ui.res_adj);
    gtk_scale_set_digits(GTK_SCALE(g_ui.scale_res), 0);
    gtk_scale_set_draw_value(GTK_SCALE(g_ui.scale_res), FALSE);
    gtk_scale_set_has_origin(GTK_SCALE(g_ui.scale_res), TRUE);
    gtk_widget_set_hexpand(g_ui.scale_res, TRUE);
    gtk_widget_set_size_request(g_ui.scale_res, 380, 48);

    // Resolution marks every 10%. Space-pad 2-digit values so "100" is widest.
    static const double kResMarks[] = { 10, 20, 30, 40, 50, 60, 70, 80, 90, 100 };
    static const char* kResLabels[] = {
        " 10", " 20", " 30", " 40", " 50", " 60", " 70", " 80", " 90", "100"
    };
    gui_add_scale_marks(GTK_SCALE(g_ui.scale_res), kResMarks, kResLabels, 10);

    g_ui.spin_res = gtk_spin_button_new(g_ui.res_adj, 1.0, 0);
    gtk_spin_button_set_numeric(GTK_SPIN_BUTTON(g_ui.spin_res), TRUE);
    gtk_widget_set_size_request(g_ui.spin_res, 72, -1);
    g_signal_connect(g_ui.res_adj, "value-changed", G_CALLBACK(on_res_changed), nullptr);

    g_ui.lbl_res_hint = gtk_label_new("");
    gtk_label_set_xalign(GTK_LABEL(g_ui.lbl_res_hint), 0.0f);
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.lbl_res_hint), "hint-label");

    GtkWidget* res_box  = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    GtkWidget* lbl_resu = gtk_label_new("%");
    gtk_label_set_xalign(GTK_LABEL(lbl_resu), 0.0f);
    gtk_size_group_add_widget(unit_sg, lbl_resu);
    g_object_unref(unit_sg);   // widgets now hold the reference

    gtk_box_pack_start(GTK_BOX(res_box), g_ui.scale_res, TRUE,  TRUE,  0);
    gtk_box_pack_start(GTK_BOX(res_box), g_ui.spin_res,  FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(res_box), lbl_resu,       FALSE, FALSE, 0);
    gui_attach_row(GTK_GRID(grid), row++, "해상도 비율", res_box);
    // hint label spans both columns
    gtk_widget_set_margin_start(g_ui.lbl_res_hint, 2);
    gtk_grid_attach(GTK_GRID(grid), g_ui.lbl_res_hint, 1, row++, 1, 1);

    // Row: bitrate
    GtkWidget* br_box  = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    g_ui.spin_bitrate  = gtk_spin_button_new_with_range(200, 20000, 100);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(g_ui.spin_bitrate), 4000);
    gtk_spin_button_set_numeric(GTK_SPIN_BUTTON(g_ui.spin_bitrate), TRUE);
    gtk_widget_set_size_request(g_ui.spin_bitrate, 100, -1);
    GtkWidget* lbl_bru = gtk_label_new("kbps");
    gtk_box_pack_start(GTK_BOX(br_box), g_ui.spin_bitrate, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(br_box), lbl_bru,           FALSE, FALSE, 0);
    gui_attach_row(GTK_GRID(grid), row++, "비트레이트", br_box);

    // Row: show cursor
    g_ui.chk_cursor = gtk_check_button_new_with_label("마우스 커서 포함");
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(g_ui.chk_cursor), TRUE);
    gtk_grid_attach(GTK_GRID(grid), g_ui.chk_cursor, 0, row++, 2, 1);

    // Row: capture source
    g_ui.combo_source = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(g_ui.combo_source), "전체 화면");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(g_ui.combo_source),
                                   "특정 창  (X11 전용)");
    gtk_combo_box_set_active(GTK_COMBO_BOX(g_ui.combo_source), 0);
    gtk_widget_set_halign(g_ui.combo_source, GTK_ALIGN_START);
    g_signal_connect(g_ui.combo_source, "changed", G_CALLBACK(on_source_changed), nullptr);
    gui_attach_row(GTK_GRID(grid), row++, "캡처 범위", g_ui.combo_source);

    // Row: window picker
    GtkWidget* pick_box    = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    g_ui.btn_pick_window   = gtk_button_new_with_label("창 선택…");
    gtk_widget_set_sensitive(g_ui.btn_pick_window, FALSE);
    g_signal_connect(g_ui.btn_pick_window, "clicked", G_CALLBACK(on_pick_window_clicked), nullptr);
    g_ui.lbl_window = gtk_label_new(
        capture_is_wayland()
        ? "Wayland: Portal 대화상자에서 화면 또는 창 선택"
        : "X11: 전체 화면 캡처");
    gtk_label_set_xalign(GTK_LABEL(g_ui.lbl_window), 0.0f);
    gtk_label_set_line_wrap(GTK_LABEL(g_ui.lbl_window), TRUE);
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.lbl_window), "hint-label");
    gtk_box_pack_start(GTK_BOX(pick_box), g_ui.btn_pick_window, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(pick_box), g_ui.lbl_window,      TRUE,  TRUE,  0);
    gui_attach_row(GTK_GRID(grid), row++, "대상 창", pick_box);

    return gui_make_frame("녹화 설정", grid);
}

GtkWidget* build_control_section() {
    GtkWidget* grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 10);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 12);
    gtk_widget_set_margin_top(grid, 6);
    gtk_widget_set_margin_bottom(grid, 6);
    gtk_widget_set_margin_start(grid, 10);
    gtk_widget_set_margin_end(grid, 10);
    gtk_style_context_add_class(gtk_widget_get_style_context(grid), "form-grid");

    int row = 0;

    GtkWidget* rec_row = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 12);
    gtk_widget_set_valign(rec_row, GTK_ALIGN_CENTER);

    g_ui.status_led = gtk_drawing_area_new();
    gtk_widget_set_size_request(g_ui.status_led, 18, 18);
    gtk_widget_set_valign(g_ui.status_led, GTK_ALIGN_CENTER);
    g_signal_connect(g_ui.status_led, "draw", G_CALLBACK(on_led_draw), nullptr);
    gtk_box_pack_start(GTK_BOX(rec_row), g_ui.status_led, FALSE, FALSE, 0);

    g_ui.lbl_status_text = gtk_label_new("대기 중");
    gtk_label_set_xalign(GTK_LABEL(g_ui.lbl_status_text), 0.0f);
    gtk_widget_set_valign(g_ui.lbl_status_text, GTK_ALIGN_CENTER);
    gtk_box_pack_start(GTK_BOX(rec_row), g_ui.lbl_status_text, FALSE, FALSE, 0);
    set_status_recording(false);

    g_ui.lbl_elapsed = gtk_label_new("00:00:00");
    gtk_label_set_xalign(GTK_LABEL(g_ui.lbl_elapsed), 0.0f);
    gtk_widget_set_valign(g_ui.lbl_elapsed, GTK_ALIGN_CENTER);
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.lbl_elapsed), "elapsed-label");
    gtk_box_pack_start(GTK_BOX(rec_row), g_ui.lbl_elapsed, FALSE, FALSE, 0);

    GtkWidget* spacer = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
    gtk_widget_set_hexpand(spacer, TRUE);
    gtk_box_pack_start(GTK_BOX(rec_row), spacer, TRUE, TRUE, 0);

    g_ui.btn_record = gtk_button_new_with_label("녹화 시작");
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.btn_record), "btn-record");
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.btn_record), "start");
    gtk_widget_set_valign(g_ui.btn_record, GTK_ALIGN_CENTER);
    g_signal_connect(g_ui.btn_record, "clicked", G_CALLBACK(on_record_clicked), nullptr);
    gtk_box_pack_start(GTK_BOX(rec_row), g_ui.btn_record, FALSE, FALSE, 0);

    gui_attach_row(GTK_GRID(grid), row++, "녹화", rec_row);

    GtkWidget* hint = gtk_label_new(
        "시작 시 설정 창이 숨겨집니다. 트레이 클릭으로 다시 열 수 있습니다. "
        "중지: 알림 · 트레이 · Ctrl+Shift+S.");
    gtk_label_set_xalign(GTK_LABEL(hint), 0.0f);
    gtk_label_set_line_wrap(GTK_LABEL(hint), TRUE);
    gtk_style_context_add_class(gtk_widget_get_style_context(hint), "hint-label");
    gui_attach_row(GTK_GRID(grid), row++, "안내", hint);

    return gui_make_frame("녹화", grid);
}

GtkWidget* build_log_section() {
    GtkWidget* toolbar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_widget_set_margin_bottom(toolbar, 4);

    GtkWidget* btn_copy = gtk_button_new_with_label("로그 복사");
    gtk_widget_set_tooltip_text(btn_copy,
        "선택한 텍스트가 있으면 선택 영역만, 없으면 전체 로그를 클립보드에 복사합니다.");
    g_signal_connect(btn_copy, "clicked", G_CALLBACK(on_copy_log_clicked), nullptr);
    gtk_box_pack_start(GTK_BOX(toolbar), btn_copy, FALSE, FALSE, 0);

    GtkWidget* btn_clear = gtk_button_new_with_label("지우기");
    gtk_widget_set_tooltip_text(btn_clear, "로그 내용을 모두 지웁니다.");
    g_signal_connect(btn_clear, "clicked", G_CALLBACK(on_clear_log_clicked), nullptr);
    gtk_box_pack_start(GTK_BOX(toolbar), btn_clear, FALSE, FALSE, 0);

    GtkWidget* hint = gtk_label_new("드래그 선택 · Ctrl+C · [로그 복사]");
    gtk_label_set_xalign(GTK_LABEL(hint), 0.0f);
    gtk_style_context_add_class(gtk_widget_get_style_context(hint), "hint-label");
    gtk_widget_set_hexpand(hint, TRUE);
    gtk_box_pack_start(GTK_BOX(toolbar), hint, TRUE, TRUE, 0);

    GtkWidget* scrolled = gtk_scrolled_window_new(nullptr, nullptr);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scrolled),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_scrolled_window_set_shadow_type(GTK_SCROLLED_WINDOW(scrolled), GTK_SHADOW_IN);
    gtk_widget_set_size_request(scrolled, -1, 120);

    g_ui.log_view = gtk_text_view_new();
    gtk_text_view_set_editable(GTK_TEXT_VIEW(g_ui.log_view), FALSE);
    gtk_text_view_set_cursor_visible(GTK_TEXT_VIEW(g_ui.log_view), TRUE);
    gtk_text_view_set_monospace(GTK_TEXT_VIEW(g_ui.log_view), TRUE);
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(g_ui.log_view), GTK_WRAP_WORD_CHAR);
    gtk_text_view_set_left_margin(GTK_TEXT_VIEW(g_ui.log_view), 8);
    gtk_text_view_set_right_margin(GTK_TEXT_VIEW(g_ui.log_view), 8);
    gtk_text_view_set_top_margin(GTK_TEXT_VIEW(g_ui.log_view), 6);
    gtk_text_view_set_bottom_margin(GTK_TEXT_VIEW(g_ui.log_view), 6);
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.log_view), "log-view");
    g_ui.log_buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(g_ui.log_view));
    g_signal_connect(g_ui.log_view, "key-press-event", G_CALLBACK(on_log_key_press), nullptr);
    gtk_container_add(GTK_CONTAINER(scrolled), g_ui.log_view);

    GtkWidget* outer = gtk_box_new(GTK_ORIENTATION_VERTICAL, 4);
    gtk_widget_set_margin_top(outer, 4);
    gtk_widget_set_margin_bottom(outer, 6);
    gtk_widget_set_margin_start(outer, 8);
    gtk_widget_set_margin_end(outer, 8);
    gtk_box_pack_start(GTK_BOX(outer), toolbar, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(outer), scrolled, TRUE, TRUE, 0);

    return gui_make_frame("로그", outer);
}

GtkWidget* build_audio_section() {
    GtkWidget* grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 10);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 12);
    gtk_widget_set_margin_top(grid, 6);
    gtk_widget_set_margin_bottom(grid, 6);
    gtk_widget_set_margin_start(grid, 10);
    gtk_widget_set_margin_end(grid, 10);
    gtk_style_context_add_class(gtk_widget_get_style_context(grid), "form-grid");

    int row = 0;

    // Row: enable audio checkbox
    g_ui.chk_audio = gtk_check_button_new_with_label("오디오 녹음 사용 (마이크)");
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(g_ui.chk_audio), FALSE);
    g_signal_connect(g_ui.chk_audio, "toggled", G_CALLBACK(on_audio_toggled), nullptr);
    gtk_grid_attach(GTK_GRID(grid), g_ui.chk_audio, 0, row++, 2, 1);

    // Row: device selection + refresh button
    GtkWidget* dev_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    g_ui.combo_audio_dev = gtk_combo_box_text_new();
    gtk_widget_set_hexpand(g_ui.combo_audio_dev, TRUE);
    gtk_box_pack_start(GTK_BOX(dev_box), g_ui.combo_audio_dev, TRUE,  TRUE,  0);

    g_ui.btn_audio_refresh = gtk_button_new_with_label("새로 고침");
    g_signal_connect(g_ui.btn_audio_refresh, "clicked", G_CALLBACK(on_audio_refresh_clicked), nullptr);
    gtk_box_pack_start(GTK_BOX(dev_box), g_ui.btn_audio_refresh, FALSE, FALSE, 0);
    gui_attach_row(GTK_GRID(grid), row++, "입력 장치", dev_box);

    // Row: volume slider + spin
    g_ui.vol_adj  = gtk_adjustment_new(100.0, 0.0, 200.0, 1.0, 10.0, 0.0);
    g_ui.scale_vol = gtk_scale_new(GTK_ORIENTATION_HORIZONTAL, g_ui.vol_adj);
    gtk_scale_set_digits(GTK_SCALE(g_ui.scale_vol), 0);
    gtk_scale_set_draw_value(GTK_SCALE(g_ui.scale_vol), FALSE);
    gtk_scale_set_has_origin(GTK_SCALE(g_ui.scale_vol), TRUE);
    gtk_widget_set_hexpand(g_ui.scale_vol, TRUE);
    gtk_widget_set_size_request(g_ui.scale_vol, 380, 48);

    static const double kVolMarks[]  = { 0, 50, 100, 150, 200 };
    static const char* kVolLabels[]  = { "0%", "50%", "100%", "150%", "200%" };
    gui_add_scale_marks(GTK_SCALE(g_ui.scale_vol), kVolMarks, kVolLabels, 5);

    g_ui.spin_vol = gtk_spin_button_new(g_ui.vol_adj, 1.0, 0);
    gtk_spin_button_set_numeric(GTK_SPIN_BUTTON(g_ui.spin_vol), TRUE);
    gtk_widget_set_size_request(g_ui.spin_vol, 72, -1);

    GtkWidget* vol_box  = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    GtkWidget* lbl_volu = gtk_label_new("%");
    gtk_box_pack_start(GTK_BOX(vol_box), g_ui.scale_vol, TRUE,  TRUE,  0);
    gtk_box_pack_start(GTK_BOX(vol_box), g_ui.spin_vol,  FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(vol_box), lbl_volu,       FALSE, FALSE, 0);
    gui_attach_row(GTK_GRID(grid), row++, "입력 음량", vol_box);

    // Initially insensitive (audio disabled by default)
    gtk_widget_set_sensitive(g_ui.combo_audio_dev,   FALSE);
    gtk_widget_set_sensitive(g_ui.btn_audio_refresh, FALSE);
    gtk_widget_set_sensitive(g_ui.scale_vol,         FALSE);
    gtk_widget_set_sensitive(g_ui.spin_vol,          FALSE);

    return gui_make_frame("오디오 설정", grid);
}

void register_app_actions(GtkApplication* app) {
    const GActionEntry entries[] = {
        {"record-stop", record_stop_action, nullptr, nullptr, nullptr, {0}},
        {"record-show", record_show_action, nullptr, nullptr, nullptr, {0}},
    };
    g_action_map_add_action_entries(G_ACTION_MAP(app), entries, G_N_ELEMENTS(entries), nullptr);
    const char* stop_accels[] = {"<Ctrl><Shift>S", nullptr};
    gtk_application_set_accels_for_action(app, "app.record-stop", stop_accels);
}

void build_ui(GtkApplication* app) {
    gui_apply_css();
    g_app = GTK_APPLICATION(g_object_ref(app));
    register_app_actions(app);

    // Enumerate audio sources before the window is shown
    g_audio_sources = audio_enumerate_sources();

    g_ui.window = gtk_application_window_new(app);
    gtk_window_set_title(GTK_WINDOW(g_ui.window), "Screen Recorder");
    gtk_window_set_default_size(GTK_WINDOW(g_ui.window), 860, 720);
    gtk_widget_set_size_request(GTK_WIDGET(g_ui.window), 720, -1);
    gtk_window_set_resizable(GTK_WINDOW(g_ui.window), TRUE);
    gtk_window_set_position(GTK_WINDOW(g_ui.window), GTK_WIN_POS_CENTER);
    g_signal_connect(g_ui.window, "destroy", G_CALLBACK(on_window_destroy), nullptr);
    g_signal_connect(g_ui.window, "delete-event", G_CALLBACK(on_window_delete_event), nullptr);

    GtkWidget* main_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_container_set_border_width(GTK_CONTAINER(main_box), 14);
    gtk_container_add(GTK_CONTAINER(g_ui.window), main_box);

    gtk_box_pack_start(GTK_BOX(main_box), build_settings_section(), FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(main_box), build_audio_section(),    FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(main_box), build_control_section(),  FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(main_box), build_log_section(),      TRUE,  TRUE,  0);

    gtk_widget_show_all(g_ui.window);

    // Populate audio device combo after the widget is realised
    populate_audio_combo(g_audio_sources);

    set_record_button(false);
    update_res_hint_label();
    append_log("준비. 설정 후 [녹화 시작]을 클릭하세요.");
    append_log(capture_is_wayland()
               ? "환경: Wayland — Portal PipeWire 사용"
               : "환경: X11 — ximagesrc 사용");
    append_log("오디오 입력 장치: " + std::to_string(g_audio_sources.size() - 1) + "개 발견");
}

void on_activate(GtkApplication* app, gpointer) {
    g_shutting_down.store(false);
    recorder_set_prepare_capture([]() {
        hide_main_window();
        flush_gtk_events();
        g_hidden_for_recording = true;
    });
    build_ui(app);
}

}  // namespace

int gui_gtk_run(int argc, char** argv) {
    GtkApplication* app =
        gtk_application_new("com.testsimulator.screenrecorder",
                            G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(app, "activate", G_CALLBACK(on_activate), nullptr);
    g_signal_connect(app, "shutdown", G_CALLBACK(on_app_shutdown), nullptr);
    const int status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
