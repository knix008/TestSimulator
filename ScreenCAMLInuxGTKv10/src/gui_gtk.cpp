#include "gui_gtk.h"
#include "gui_utils.h"
#include "audio.h"
#include "capture.h"
#include "recorder.h"
#include "window_picker.h"

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
    GtkTextBuffer* log_buffer       = nullptr;
    // State
    bool           status_recording = false;
};

AppWidgets        g_ui;
std::atomic<bool> g_shutting_down{false};
guint             g_elapsed_timer = 0;
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

// ── Recording state callbacks (run on GTK main thread) ────────────────────────

void on_recording_started() {
    if (g_shutting_down.load()) return;
    set_record_button(true);
    set_settings_sensitive(false);
    // The record button stays active so the user can stop recording.
    gtk_widget_set_sensitive(g_ui.btn_record, TRUE);
    append_log("── 녹화 시작 ──");
    if (g_elapsed_timer == 0)
        g_elapsed_timer = g_timeout_add(500, on_elapsed_tick, nullptr);
}

void on_recording_stopped(bool success, const std::string& message) {
    if (g_shutting_down.load()) return;
    set_record_button(false);
    set_settings_sensitive(true);
    update_window_picker_ui();
    if (g_ui.lbl_elapsed)
        gtk_label_set_text(GTK_LABEL(g_ui.lbl_elapsed), "00:00:00");
    if (g_ui.btn_record)
        gtk_widget_set_sensitive(g_ui.btn_record, TRUE);
    append_log("── 녹화 종료 ──");

    // Show result popup.
    if (success) {
        gui_show_result_dialog(GTK_WINDOW(g_ui.window),
                               "녹화 완료",
                               "동영상 파일이 저장되었습니다.",
                               message,
                               false);
    } else {
        gui_show_result_dialog(GTK_WINDOW(g_ui.window),
                               "녹화 오류",
                               "녹화 중 오류가 발생했습니다.",
                               message,
                               true);
    }
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

void on_record_clicked(GtkWidget*, gpointer) {
    if (g_shutting_down.load()) return;

    if (recorder_is_recording()) {
        recorder_stop();
        gtk_widget_set_sensitive(g_ui.btn_record, FALSE);
        append_log("녹화 중지 요청 — 파일 마무리 중...");
        return;
    }

    const char* out_path = gtk_entry_get_text(GTK_ENTRY(g_ui.entry_output));
    if (!out_path || *out_path == '\0') {
        gui_show_result_dialog(GTK_WINDOW(g_ui.window), "설정 오류",
                               "저장 경로를 입력하거나 [찾아보기]로 선택하세요.",
                               "", true);
        return;
    }
    if (source_is_window() && g_selected_xid == 0) {
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
    opts.portal_parent_window = portal_parent_handle();

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

    const bool ok = recorder_start(
        std::move(opts),
        [](const std::string& msg) { append_log(msg); },
        on_recording_started,
        on_recording_stopped);

    if (!ok) {
        append_log("오류: 이미 녹화 중이거나 시작할 수 없습니다.");
    }
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

void shutdown_app() {
    if (g_shutting_down.exchange(true)) return;
    if (recorder_is_recording()) recorder_stop();
}

void on_window_destroy(GtkWidget*, gpointer) {
    g_ui = AppWidgets{};
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

GtkWidget* build_status_section() {
    GtkWidget* grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 10);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 12);
    gtk_widget_set_margin_top(grid, 6);
    gtk_widget_set_margin_bottom(grid, 6);
    gtk_widget_set_margin_start(grid, 10);
    gtk_widget_set_margin_end(grid, 10);

    // Status LED + text
    GtkWidget* st_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 10);
    gtk_widget_set_halign(st_box, GTK_ALIGN_START);
    g_ui.status_led = gtk_drawing_area_new();
    gtk_widget_set_size_request(g_ui.status_led, 18, 18);
    gtk_widget_set_valign(g_ui.status_led, GTK_ALIGN_CENTER);
    g_signal_connect(g_ui.status_led, "draw", G_CALLBACK(on_led_draw), nullptr);
    g_ui.lbl_status_text = gtk_label_new("대기 중");
    gtk_label_set_xalign(GTK_LABEL(g_ui.lbl_status_text), 0.0f);
    gtk_widget_set_valign(g_ui.lbl_status_text, GTK_ALIGN_CENTER);
    gtk_box_pack_start(GTK_BOX(st_box), g_ui.status_led,      FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(st_box), g_ui.lbl_status_text, FALSE, FALSE, 0);
    gui_attach_row(GTK_GRID(grid), 0, "상태", st_box);
    set_status_recording(false);

    // Elapsed time
    g_ui.lbl_elapsed = gtk_label_new("00:00:00");
    gtk_label_set_xalign(GTK_LABEL(g_ui.lbl_elapsed), 0.0f);
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.lbl_elapsed), "elapsed-label");
    gui_attach_row(GTK_GRID(grid), 1, "경과 시간", g_ui.lbl_elapsed);

    return gui_make_frame("상태", grid);
}

GtkWidget* build_control_section() {
    GtkWidget* box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 8);
    gtk_widget_set_margin_top(box, 10);
    gtk_widget_set_margin_bottom(box, 10);

    g_ui.btn_record = gtk_button_new_with_label("녹화 시작");
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.btn_record), "btn-record");
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.btn_record), "start");
    gtk_widget_set_halign(g_ui.btn_record, GTK_ALIGN_CENTER);
    g_signal_connect(g_ui.btn_record, "clicked", G_CALLBACK(on_record_clicked), nullptr);
    gtk_box_pack_start(GTK_BOX(box), g_ui.btn_record, FALSE, FALSE, 0);

    GtkWidget* hint = gtk_label_new(
        "녹화 중에도 로그·상태·설정 창은 자유롭게 사용할 수 있습니다. "
        "중지 시 EOS 전송으로 파일이 정상 마무리됩니다.");
    gtk_label_set_xalign(GTK_LABEL(hint), 0.5f);
    gtk_label_set_line_wrap(GTK_LABEL(hint), TRUE);
    gtk_style_context_add_class(gtk_widget_get_style_context(hint), "hint-label");
    gtk_box_pack_start(GTK_BOX(box), hint, FALSE, FALSE, 0);

    return gui_make_frame("제어", box);
}

GtkWidget* build_log_section() {
    GtkWidget* scrolled = gtk_scrolled_window_new(nullptr, nullptr);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scrolled),
                                   GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
    gtk_scrolled_window_set_shadow_type(GTK_SCROLLED_WINDOW(scrolled), GTK_SHADOW_IN);
    gtk_widget_set_size_request(scrolled, -1, 120);

    GtkWidget* log_view = gtk_text_view_new();
    gtk_text_view_set_editable(GTK_TEXT_VIEW(log_view), FALSE);
    gtk_text_view_set_monospace(GTK_TEXT_VIEW(log_view), TRUE);
    gtk_text_view_set_left_margin(GTK_TEXT_VIEW(log_view), 8);
    gtk_text_view_set_right_margin(GTK_TEXT_VIEW(log_view), 8);
    gtk_text_view_set_top_margin(GTK_TEXT_VIEW(log_view), 6);
    gtk_text_view_set_bottom_margin(GTK_TEXT_VIEW(log_view), 6);
    gtk_style_context_add_class(gtk_widget_get_style_context(log_view), "log-view");
    g_ui.log_buffer = gtk_text_view_get_buffer(GTK_TEXT_VIEW(log_view));
    gtk_container_add(GTK_CONTAINER(scrolled), log_view);

    GtkWidget* outer = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_widget_set_margin_top(outer, 4);
    gtk_widget_set_margin_bottom(outer, 6);
    gtk_widget_set_margin_start(outer, 8);
    gtk_widget_set_margin_end(outer, 8);
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

void build_ui(GtkApplication* app) {
    gui_apply_css();

    // Enumerate audio sources before the window is shown
    g_audio_sources = audio_enumerate_sources();

    g_ui.window = gtk_application_window_new(app);
    gtk_window_set_title(GTK_WINDOW(g_ui.window), "Screen Recorder");
    gtk_window_set_default_size(GTK_WINDOW(g_ui.window), 860, 720);
    gtk_widget_set_size_request(GTK_WIDGET(g_ui.window), 720, -1);
    gtk_window_set_resizable(GTK_WINDOW(g_ui.window), TRUE);
    gtk_window_set_position(GTK_WINDOW(g_ui.window), GTK_WIN_POS_CENTER);
    g_signal_connect(g_ui.window, "destroy", G_CALLBACK(on_window_destroy), nullptr);

    GtkWidget* main_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_container_set_border_width(GTK_CONTAINER(main_box), 14);
    gtk_container_add(GTK_CONTAINER(g_ui.window), main_box);

    gtk_box_pack_start(GTK_BOX(main_box), build_settings_section(), FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(main_box), build_audio_section(),    FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(main_box), build_status_section(),   FALSE, FALSE, 0);
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
