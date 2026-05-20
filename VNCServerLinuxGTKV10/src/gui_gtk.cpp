#include "gui_gtk.h"

#include "capture_gstreamer.h"
#include "vnc_core.h"
#include "window_picker.h"

#include <gtk/gtk.h>

#ifdef GDK_WINDOWING_X11
#include <gdk/gdkx.h>
#endif

#include <atomic>
#include <cstdint>
#include <string>

namespace {

struct AppWidgets {
    GtkWidget* window = nullptr;
    GtkWidget* spin_port = nullptr;
    GtkWidget* entry_password = nullptr;
    GtkWidget* chk_input = nullptr;
    GtkWidget* combo_capture = nullptr;
    GtkWidget* btn_pick_window = nullptr;
    GtkWidget* lbl_selected_window = nullptr;
    GtkWidget* btn_toggle = nullptr;
    GtkWidget* status_led = nullptr;
    GtkWidget* lbl_status_text = nullptr;
    bool status_running = false;
    GtkWidget* lbl_port_value = nullptr;
    GtkWidget* lbl_clients_value = nullptr;
    GtkTextBuffer* log_buffer = nullptr;
};

AppWidgets g_ui;
std::atomic<bool> g_shutting_down{false};
std::uint64_t g_selected_window_xid = 0;
std::string g_selected_window_title;

void shutdown_application();

constexpr const char* kCss = R"(
  * {
    color: #e0e0e0;
  }

  window {
    background-color: #121212;
  }

  frame {
    background-color: #1e1e1e;
    border: 1px solid #3a3a3a;
    border-radius: 6px;
    padding: 4px;
  }

  frame > label {
    font-weight: bold;
    color: #9e9e9e;
  }

  label {
    color: #e0e0e0;
  }

  entry {
    background-color: #2b2b2b;
    color: #f5f5f5;
    border: 1px solid #4a4a4a;
    padding: 5px 8px;
  }

  entry:focus {
    border-color: #5c9fd4;
    box-shadow: none;
  }

  spinbutton {
    background-color: #2b2b2b;
    border: 1px solid #4a4a4a;
  }

  spinbutton entry {
    background-color: #2b2b2b;
    color: #f5f5f5;
    border: none;
  }

  spinbutton button {
    background-color: #383838;
    color: #e0e0e0;
    border: none;
  }

  spinbutton button:hover {
    background-color: #454545;
  }

  checkbutton label {
    color: #e0e0e0;
  }

  button {
    background-color: #383838;
    color: #e0e0e0;
    border: 1px solid #4a4a4a;
    padding: 4px 10px;
  }

  button:hover {
    background-color: #454545;
  }

  scrolledwindow {
    background-color: #181818;
    border: 1px solid #3a3a3a;
  }

  textview {
    background-color: #181818;
    color: #d4d4d4;
  }

  textview text {
    background-color: #181818;
    color: #d4d4d4;
  }

  textview selection,
  textview text selection {
    background-color: #264f78;
    color: #ffffff;
  }

  .value-label { color: #f5f5f5; }

  label.status-text {
    font-weight: bold;
    font-size: 110%;
  }

  label.status-text.stopped {
    color: #ef9a9a;
  }

  label.status-text.running {
    color: #81c784;
  }
  .hint-label { color: #888888; font-size: 90%; }

  .btn-server {
    min-height: 36px;
    min-width: 160px;
    font-weight: bold;
    border: none;
  }

  .btn-server.start {
    background-color: #1565c0;
    color: #ffffff;
  }

  .btn-server.start:hover {
    background-color: #1976d2;
  }

  .btn-server.stop {
    background-color: #b71c1c;
    color: #ffffff;
  }

  .btn-server.stop:hover {
    background-color: #c62828;
  }

  .form-grid { margin: 4px 8px 8px 8px; }

  .log-view,
  .log-view text {
    background-color: #181818;
    color: #d4d4d4;
  }
)";

void apply_dark_theme() {
    GtkSettings* settings = gtk_settings_get_default();
    g_object_set(settings, "gtk-application-prefer-dark-theme", TRUE, nullptr);
}

void apply_css() {
    apply_dark_theme();

    GtkCssProvider* provider = gtk_css_provider_new();
    gtk_css_provider_load_from_data(provider, kCss, -1, nullptr);
    gtk_style_context_add_provider_for_screen(
        gdk_screen_get_default(),
        GTK_STYLE_PROVIDER(provider),
        GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    g_object_unref(provider);
}

GtkWidget* make_frame(const char* title, GtkWidget* child) {
    GtkWidget* frame = gtk_frame_new(title);
    gtk_frame_set_shadow_type(GTK_FRAME(frame), GTK_SHADOW_ETCHED_IN);
    gtk_container_add(GTK_CONTAINER(frame), child);
    gtk_widget_set_margin_bottom(frame, 4);
    return frame;
}

GtkWidget* attach_form_row(GtkGrid* grid, int row, const char* label_text, GtkWidget* field) {
    GtkWidget* lbl = gtk_label_new(label_text);
    gtk_label_set_xalign(GTK_LABEL(lbl), 1.0f);
    gtk_widget_set_margin_end(lbl, 10);
    gtk_grid_attach(grid, lbl, 0, row, 1, 1);

    if (field) {
        gtk_widget_set_hexpand(field, TRUE);
        gtk_grid_attach(grid, field, 1, row, 1, 1);
    }
    return lbl;
}

void append_log(const std::string& line) {
    if (g_shutting_down.load() || !g_ui.log_buffer) {
        return;
    }
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(g_ui.log_buffer, &end);
    gtk_text_buffer_insert(g_ui.log_buffer, &end, (line + "\n").c_str(), -1);
}

gboolean on_status_led_draw(GtkWidget* /*widget*/, cairo_t* cr, gpointer /*user*/) {
    if (g_shutting_down.load()) {
        return FALSE;
    }
    const int size = 18;
    const double cx = size / 2.0;
    const double cy = size / 2.0;
    const double outer_r = 7.0;
    const double inner_r = 5.5;

    cairo_set_antialias(cr, CAIRO_ANTIALIAS_BEST);

    cairo_set_source_rgb(cr, 0.35, 0.35, 0.35);
    cairo_arc(cr, cx, cy, outer_r, 0, 2.0 * G_PI);
    cairo_fill(cr);

    if (g_ui.status_running) {
        cairo_set_source_rgb(cr, 0.30, 0.85, 0.35);
    } else {
        cairo_set_source_rgb(cr, 0.90, 0.25, 0.25);
    }
    cairo_arc(cr, cx, cy, inner_r, 0, 2.0 * G_PI);
    cairo_fill(cr);

    cairo_set_source_rgb(cr, g_ui.status_running ? 0.55 : 0.55, g_ui.status_running ? 0.95 : 0.45,
                         g_ui.status_running ? 0.60 : 0.45);
    cairo_set_line_width(cr, 1.0);
    cairo_arc(cr, cx, cy, inner_r, 0, 2.0 * G_PI);
    cairo_stroke(cr);

    return FALSE;
}

void set_status_running(bool running) {
    if (!g_ui.status_led || !g_ui.lbl_status_text) {
        return;
    }

    g_ui.status_running = running;
    gtk_widget_queue_draw(g_ui.status_led);

    gtk_label_set_text(GTK_LABEL(g_ui.lbl_status_text), running ? "Running" : "Stopped");

    GtkStyleContext* text_ctx = gtk_widget_get_style_context(g_ui.lbl_status_text);
    gtk_style_context_add_class(text_ctx, "status-text");
    gtk_style_context_remove_class(text_ctx, "stopped");
    gtk_style_context_remove_class(text_ctx, "running");
    gtk_style_context_add_class(text_ctx, running ? "running" : "stopped");
}

void set_port_display(int port) {
    if (g_ui.lbl_port_value) {
        gtk_label_set_text(GTK_LABEL(g_ui.lbl_port_value),
                           ("Port " + std::to_string(port)).c_str());
    }
}

void set_client_display(int count) {
    if (!g_ui.lbl_clients_value) {
        return;
    }
    std::string text;
    if (count == 0) {
        text = "No clients connected";
    } else if (count == 1) {
        text = "1 client connected";
    } else {
        text = std::to_string(count) + " clients connected";
    }
    gtk_label_set_text(GTK_LABEL(g_ui.lbl_clients_value), text.c_str());
}

void set_toggle_button_running(bool running) {
    if (!g_ui.btn_toggle) {
        return;
    }
    GtkStyleContext* ctx = gtk_widget_get_style_context(g_ui.btn_toggle);
    gtk_style_context_remove_class(ctx, "start");
    gtk_style_context_remove_class(ctx, "stop");
    if (running) {
        gtk_button_set_label(GTK_BUTTON(g_ui.btn_toggle), "Stop server");
        gtk_style_context_add_class(ctx, "stop");
    } else {
        gtk_button_set_label(GTK_BUTTON(g_ui.btn_toggle), "Start server");
        gtk_style_context_add_class(ctx, "start");
    }
    set_status_running(running);
}

gboolean on_status_idle(gpointer user) {
    auto* msg = static_cast<std::string*>(user);
    if (!g_shutting_down.load()) {
        append_log(*msg);
    }
    delete msg;
    return G_SOURCE_REMOVE;
}

gboolean on_clients_idle(gpointer user) {
    if (!g_shutting_down.load()) {
        set_client_display(GPOINTER_TO_INT(user));
    }
    return G_SOURCE_REMOVE;
}

gboolean dispatch_status_idle(gpointer user) {
    on_status_idle(user);
    return G_SOURCE_REMOVE;
}

gboolean dispatch_clients_idle(gpointer user) {
    on_clients_idle(user);
    return G_SOURCE_REMOVE;
}

void post_status(const std::string& msg) {
    g_main_context_invoke(nullptr, dispatch_status_idle, new std::string(msg));
}

void post_clients(int count) {
    g_main_context_invoke(nullptr, dispatch_clients_idle, GINT_TO_POINTER(count));
}

std::uint64_t own_app_window_xid() {
#ifdef GDK_WINDOWING_X11
    if (!g_ui.window) {
        return 0;
    }
    GdkWindow* gdk_window = gtk_widget_get_window(g_ui.window);
    if (gdk_window && GDK_IS_X11_WINDOW(gdk_window)) {
        return gdk_x11_window_get_xid(gdk_window);
    }
#endif
    return 0;
}

bool capture_mode_is_single_window() {
    if (!GTK_IS_COMBO_BOX(g_ui.combo_capture)) {
        return false;
    }
    return gtk_combo_box_get_active(GTK_COMBO_BOX(g_ui.combo_capture)) == 1;
}

void update_window_picker_sensitivity() {
    const bool single = capture_mode_is_single_window();
    if (g_ui.btn_pick_window) {
        gtk_widget_set_sensitive(g_ui.btn_pick_window, single);
    }
    if (g_ui.lbl_selected_window) {
        if (single) {
            if (g_selected_window_xid != 0) {
                gtk_label_set_text(GTK_LABEL(g_ui.lbl_selected_window),
                                   g_selected_window_title.c_str());
            } else {
                gtk_label_set_text(GTK_LABEL(g_ui.lbl_selected_window), "(창을 선택하세요)");
            }
        } else {
            gtk_label_set_text(GTK_LABEL(g_ui.lbl_selected_window),
                               "전체 화면이 기본으로 공유됩니다");
        }
    }
}

void on_capture_mode_changed(GtkComboBox* /*combo*/, gpointer /*data*/) {
    update_window_picker_sensitivity();
}

void on_pick_window_clicked(GtkWidget* /*btn*/, gpointer /*data*/) {
    std::uint64_t xid = 0;
    std::string title;
    if (!window_picker_dialog_run(GTK_WINDOW(g_ui.window), own_app_window_xid(), &xid, &title)) {
        return;
    }
    g_selected_window_xid = xid;
    g_selected_window_title = title;
    update_window_picker_sensitivity();
}

VncServerOptions read_options_from_ui() {
    VncServerOptions opt;
    opt.port = gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(g_ui.spin_port));
    if (const char* pw = gtk_entry_get_text(GTK_ENTRY(g_ui.entry_password))) {
        opt.password = pw;
    }
    opt.allow_input = gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(g_ui.chk_input));
    if (capture_mode_is_single_window()) {
        opt.capture_mode = VncCaptureMode::SingleWindow;
        opt.target_window = g_selected_window_xid;
    } else {
        opt.capture_mode = VncCaptureMode::FullDesktop;
    }
    return opt;
}

void on_show_password_toggled(GtkToggleButton* btn, gpointer entry) {
    gtk_entry_set_visibility(GTK_ENTRY(entry), gtk_toggle_button_get_active(btn));
}

void on_port_changed(GtkSpinButton* spin, gpointer /*data*/) {
    if (!vnc_server_is_running()) {
        set_port_display(gtk_spin_button_get_value_as_int(spin));
    }
}

// Returns screen dimensions from GDK (Wayland-aware).
static bool get_screen_size(int* out_w, int* out_h) {
    GdkDisplay* dpy = gdk_display_get_default();
    if (dpy) {
        GdkMonitor* mon = gdk_display_get_primary_monitor(dpy);
        if (mon) {
            GdkRectangle geom{};
            gdk_monitor_get_geometry(mon, &geom);
            if (geom.width > 0 && geom.height > 0) {
                *out_w = geom.width;
                *out_h = geom.height;
                return true;
            }
        }
    }
    G_GNUC_BEGIN_IGNORE_DEPRECATIONS
    GdkScreen* scr = gdk_screen_get_default();
    if (scr) {
        *out_w = gdk_screen_get_width(scr);
        *out_h = gdk_screen_get_height(scr);
        return *out_w > 0 && *out_h > 0;
    }
    G_GNUC_END_IGNORE_DEPRECATIONS
    return false;
}

// Returns a Portal-compatible parent-window hint string.
// On X11 uses the XID; on Wayland returns empty (accepted by Portal).
static std::string portal_parent_handle() {
#ifdef GDK_WINDOWING_X11
    if (g_ui.window) {
        GdkWindow* gdk_win = gtk_widget_get_window(g_ui.window);
        if (gdk_win && GDK_IS_X11_WINDOW(gdk_win)) {
            return "x11:0x" + std::to_string(gdk_x11_window_get_xid(gdk_win));
        }
    }
#endif
    return {};
}

void on_toggle_clicked(GtkWidget* /*btn*/, gpointer /*data*/) {
    if (g_shutting_down.load() || !GTK_IS_SPIN_BUTTON(g_ui.spin_port)) {
        return;
    }

    if (vnc_server_is_running()) {
        vnc_server_stop();
        capture_gstreamer_shutdown();
        set_toggle_button_running(false);
        gtk_widget_set_sensitive(g_ui.spin_port, TRUE);
        gtk_widget_set_sensitive(g_ui.entry_password, TRUE);
        gtk_widget_set_sensitive(g_ui.chk_input, TRUE);
        gtk_widget_set_sensitive(g_ui.combo_capture, TRUE);
        update_window_picker_sensitivity();
        set_port_display(gtk_spin_button_get_value_as_int(GTK_SPIN_BUTTON(g_ui.spin_port)));
        return;
    }

    const VncServerOptions opt = read_options_from_ui();

    if (opt.capture_mode == VncCaptureMode::SingleWindow && opt.target_window == 0) {
        post_status("공유할 창을 먼저 선택하세요.");
        return;
    }

    // For full-desktop mode on Wayland (XWayland), X11 screen capture only
    // sees XWayland windows. Use the XDG Desktop Portal + PipeWire path which
    // captures the real Wayland compositor output.
    if (opt.capture_mode == VncCaptureMode::FullDesktop) {
        int w = 0, h = 0;
        if (get_screen_size(&w, &h)) {
            capture_gstreamer_set_parent_window(portal_parent_handle().c_str());
            post_status("화면 공유 권한을 요청 중입니다 (Portal)...");
            if (!capture_gstreamer_init_desktop(w, h, [](const std::string& m) { post_status(m); })) {
                post_status("Portal 캡처 불가 — X11 폴백 사용 (전체 화면이 보이지 않을 수 있음)");
            }
        }
    }

    const bool started = vnc_server_start(
        opt,
        [](const std::string& msg) { post_status(msg); },
        [](int count) { post_clients(count); });

    if (!started) {
        post_status("Could not start server (already running?)");
        return;
    }

    set_toggle_button_running(true);
    set_port_display(opt.port);
    gtk_widget_set_sensitive(g_ui.spin_port, FALSE);
    gtk_widget_set_sensitive(g_ui.entry_password, FALSE);
    gtk_widget_set_sensitive(g_ui.chk_input, FALSE);
    gtk_widget_set_sensitive(g_ui.combo_capture, FALSE);
    gtk_widget_set_sensitive(g_ui.btn_pick_window, FALSE);
    post_status("Starting VNC server on port " + std::to_string(opt.port) + "...");
}

void shutdown_application() {
    if (g_shutting_down.exchange(true)) {
        return;
    }
    vnc_server_stop();
    capture_gstreamer_shutdown();
}

void on_window_destroy(GtkWidget* /*w*/, gpointer /*data*/) {
    // Null out widget pointers before destruction so any queued idle callbacks
    // see NULL and bail out safely instead of accessing freed GObjects.
    g_ui = AppWidgets{};
    shutdown_application();
}

void on_app_shutdown(GtkApplication* /*app*/, gpointer /*data*/) {
    shutdown_application();
}

GtkWidget* build_status_section() {
    GtkWidget* grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 10);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 12);
    gtk_widget_set_margin_top(grid, 6);
    gtk_widget_set_margin_bottom(grid, 6);
    gtk_widget_set_margin_start(grid, 10);
    gtk_widget_set_margin_end(grid, 10);
    gtk_widget_set_halign(grid, GTK_ALIGN_FILL);

    GtkWidget* status_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 10);
    gtk_widget_set_halign(status_box, GTK_ALIGN_START);
    gtk_widget_set_valign(status_box, GTK_ALIGN_CENTER);

    g_ui.status_led = gtk_drawing_area_new();
    gtk_widget_set_size_request(g_ui.status_led, 18, 18);
    gtk_widget_set_valign(g_ui.status_led, GTK_ALIGN_CENTER);
    g_signal_connect(g_ui.status_led, "draw", G_CALLBACK(on_status_led_draw), nullptr);

    g_ui.lbl_status_text = gtk_label_new("Stopped");
    gtk_label_set_xalign(GTK_LABEL(g_ui.lbl_status_text), 0.0f);
    gtk_widget_set_valign(g_ui.lbl_status_text, GTK_ALIGN_CENTER);

    gtk_box_pack_start(GTK_BOX(status_box), g_ui.status_led, FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(status_box), g_ui.lbl_status_text, FALSE, FALSE, 0);
    attach_form_row(GTK_GRID(grid), 0, "Status", status_box);
    set_status_running(false);

    g_ui.lbl_port_value = gtk_label_new("Port 5900");
    gtk_label_set_xalign(GTK_LABEL(g_ui.lbl_port_value), 0.0f);
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.lbl_port_value), "value-label");
    attach_form_row(GTK_GRID(grid), 1, "Listen", g_ui.lbl_port_value);

    g_ui.lbl_clients_value = gtk_label_new("No clients connected");
    gtk_label_set_xalign(GTK_LABEL(g_ui.lbl_clients_value), 0.0f);
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.lbl_clients_value),
                                "value-label");
    attach_form_row(GTK_GRID(grid), 2, "Clients", g_ui.lbl_clients_value);

    return make_frame("Status", grid);
}

GtkWidget* build_settings_section() {
    GtkWidget* grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 10);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 12);
    gtk_widget_set_margin_top(grid, 6);
    gtk_widget_set_margin_bottom(grid, 6);
    gtk_widget_set_margin_start(grid, 10);
    gtk_widget_set_margin_end(grid, 10);
    gtk_style_context_add_class(gtk_widget_get_style_context(grid), "form-grid");

    g_ui.spin_port = gtk_spin_button_new_with_range(1024, 65535, 1);
    gtk_spin_button_set_value(GTK_SPIN_BUTTON(g_ui.spin_port), 5900);
    gtk_spin_button_set_numeric(GTK_SPIN_BUTTON(g_ui.spin_port), TRUE);
    gtk_widget_set_halign(g_ui.spin_port, GTK_ALIGN_START);
    g_signal_connect(g_ui.spin_port, "value-changed", G_CALLBACK(on_port_changed), nullptr);
    attach_form_row(GTK_GRID(grid), 0, "Port", g_ui.spin_port);

    GtkWidget* pw_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    g_ui.entry_password = gtk_entry_new();
    gtk_entry_set_visibility(GTK_ENTRY(g_ui.entry_password), FALSE);
    gtk_entry_set_placeholder_text(GTK_ENTRY(g_ui.entry_password), "Leave empty for no password");
    gtk_widget_set_hexpand(g_ui.entry_password, TRUE);
    gtk_box_pack_start(GTK_BOX(pw_box), g_ui.entry_password, TRUE, TRUE, 0);

    GtkWidget* btn_show_pw = gtk_toggle_button_new_with_label("Show");
    gtk_widget_set_valign(btn_show_pw, GTK_ALIGN_CENTER);
    g_signal_connect(btn_show_pw, "toggled", G_CALLBACK(on_show_password_toggled),
                     g_ui.entry_password);
    gtk_box_pack_start(GTK_BOX(pw_box), btn_show_pw, FALSE, FALSE, 0);
    attach_form_row(GTK_GRID(grid), 1, "Password", pw_box);

    g_ui.chk_input = gtk_check_button_new_with_label("Allow remote mouse and keyboard");
    gtk_toggle_button_set_active(GTK_TOGGLE_BUTTON(g_ui.chk_input), TRUE);
    gtk_widget_set_margin_top(g_ui.chk_input, 4);
    gtk_grid_attach(GTK_GRID(grid), g_ui.chk_input, 0, 2, 2, 1);

    g_ui.combo_capture = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(g_ui.combo_capture),
                                   "전체 화면 (기본)");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(g_ui.combo_capture), "특정 창만");
    gtk_combo_box_set_active(GTK_COMBO_BOX(g_ui.combo_capture), 0);
    gtk_widget_set_halign(g_ui.combo_capture, GTK_ALIGN_START);
    g_signal_connect(g_ui.combo_capture, "changed", G_CALLBACK(on_capture_mode_changed), nullptr);
    attach_form_row(GTK_GRID(grid), 3, "공유 범위", g_ui.combo_capture);

    GtkWidget* pick_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    g_ui.btn_pick_window = gtk_button_new_with_label("창 선택…");
    gtk_widget_set_sensitive(g_ui.btn_pick_window, FALSE);
    g_signal_connect(g_ui.btn_pick_window, "clicked", G_CALLBACK(on_pick_window_clicked), nullptr);
    gtk_box_pack_start(GTK_BOX(pick_box), g_ui.btn_pick_window, FALSE, FALSE, 0);

    g_ui.lbl_selected_window = gtk_label_new("전체 화면이 기본으로 공유됩니다");
    gtk_label_set_xalign(GTK_LABEL(g_ui.lbl_selected_window), 0.0f);
    gtk_label_set_line_wrap(GTK_LABEL(g_ui.lbl_selected_window), TRUE);
    gtk_box_pack_start(GTK_BOX(pick_box), g_ui.lbl_selected_window, TRUE, TRUE, 0);
    attach_form_row(GTK_GRID(grid), 4, "대상 창", pick_box);

    GtkWidget* hint = gtk_label_new("VNC viewers connect with  host:port  (e.g.  localhost:5900)");
    gtk_label_set_xalign(GTK_LABEL(hint), 0.0f);
    gtk_style_context_add_class(gtk_widget_get_style_context(hint), "hint-label");
    gtk_widget_set_margin_top(hint, 4);
    gtk_grid_attach(GTK_GRID(grid), hint, 1, 5, 1, 1);

    return make_frame("Settings", grid);
}

GtkWidget* build_control_section() {
    GtkWidget* box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 8);
    gtk_widget_set_margin_top(box, 10);
    gtk_widget_set_margin_bottom(box, 10);

    g_ui.btn_toggle = gtk_button_new_with_label("Start server");
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.btn_toggle), "btn-server");
    gtk_style_context_add_class(gtk_widget_get_style_context(g_ui.btn_toggle), "start");
    gtk_widget_set_halign(g_ui.btn_toggle, GTK_ALIGN_CENTER);
    g_signal_connect(g_ui.btn_toggle, "clicked", G_CALLBACK(on_toggle_clicked), nullptr);
    gtk_box_pack_start(GTK_BOX(box), g_ui.btn_toggle, FALSE, FALSE, 0);

    return make_frame("Control", box);
}

GtkWidget* build_log_section() {
    GtkWidget* scrolled = gtk_scrolled_window_new(nullptr, nullptr);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scrolled), GTK_POLICY_AUTOMATIC,
                                   GTK_POLICY_AUTOMATIC);
    gtk_scrolled_window_set_shadow_type(GTK_SCROLLED_WINDOW(scrolled), GTK_SHADOW_IN);
    gtk_widget_set_size_request(scrolled, -1, 140);

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

    return make_frame("Log", outer);
}

void build_ui(GtkApplication* app) {
    apply_css();

    g_ui.window = gtk_application_window_new(app);
    gtk_window_set_title(GTK_WINDOW(g_ui.window), "VNC Server");
    gtk_window_set_default_size(GTK_WINDOW(g_ui.window), 680, 560);
    gtk_window_set_resizable(GTK_WINDOW(g_ui.window), TRUE);
    gtk_window_set_position(GTK_WINDOW(g_ui.window), GTK_WIN_POS_CENTER);
    g_signal_connect(g_ui.window, "destroy", G_CALLBACK(on_window_destroy), nullptr);

    GtkWidget* main_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_container_set_border_width(GTK_CONTAINER(main_box), 14);
    gtk_container_add(GTK_CONTAINER(g_ui.window), main_box);

    gtk_box_pack_start(GTK_BOX(main_box), build_status_section(), FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(main_box), build_settings_section(), FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(main_box), build_control_section(), FALSE, FALSE, 0);
    gtk_box_pack_start(GTK_BOX(main_box), build_log_section(), TRUE, TRUE, 0);

    gtk_widget_show_all(g_ui.window);
    set_toggle_button_running(false);
    set_client_display(0);
    append_log("Ready. Start the server, then connect with a VNC viewer.");
}

void on_activate(GtkApplication* app, gpointer /*user*/) {
    g_shutting_down.store(false);
    build_ui(app);
}

}  // namespace

int gui_gtk_run(int argc, char** argv) {
    GtkApplication* app =
        gtk_application_new("com.testsimulator.vncservergtk", G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(app, "activate", G_CALLBACK(on_activate), nullptr);
    g_signal_connect(app, "shutdown", G_CALLBACK(on_app_shutdown), nullptr);
    const int status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
