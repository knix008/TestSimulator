#include "capture_gstreamer.h"

#include <gst/app/gstappsink.h>
#include <gst/gst.h>
#include <gst/video/video.h>

#include <gio/gio.h>
#include <unistd.h>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <random>
#include <string>

namespace {

enum class Backend { None, PortalPipeWire };

Backend g_backend = Backend::None;
CaptureStatusFn g_on_status;
GstElement* g_pipeline = nullptr;
GstElement* g_appsink = nullptr;
int g_width = 0;
int g_height = 0;
bool g_gst_initialized = false;
int g_portal_pw_fd = -1;
std::string g_portal_parent_window;

constexpr const char* kPortalBus = "org.freedesktop.portal.Desktop";
constexpr const char* kPortalPath = "/org/freedesktop/portal/desktop";
constexpr const char* kScreenCast = "org.freedesktop.portal.ScreenCast";
constexpr int kPortalTimeoutMs = 120000;

void notify(const std::string& msg) {
    if (g_on_status) {
        g_on_status(msg);
    }
}

std::string make_portal_token() {
    static std::mt19937 rng(static_cast<unsigned>(
        std::chrono::steady_clock::now().time_since_epoch().count()));
    std::uniform_int_distribution<int> dist(0, 15);
    std::string token = "vnc";
    for (int i = 0; i < 8; ++i) {
        token.push_back("0123456789abcdef"[dist(rng)]);
    }
    return token;
}

struct PortalWaiter {
    GMainLoop* loop = nullptr;
    GVariant* results = nullptr;
    guint subscription = 0;
    guint32 response_code = 1;
};

void on_portal_response(GDBusConnection* /*conn*/, const char* /*sender*/, const char* /*path*/,
                        const char* /*iface*/, const char* /*signal*/, GVariant* parameters,
                        gpointer user_data) {
    auto* waiter = static_cast<PortalWaiter*>(user_data);
    GVariant* results = nullptr;
    g_variant_get(parameters, "(u@a{sv})", &waiter->response_code, &results);
    if (waiter->response_code == 0 && results) {
        waiter->results = g_variant_ref(results);
    }
    if (results) {
        g_variant_unref(results);
    }
    if (waiter->loop) {
        g_main_loop_quit(waiter->loop);
    }
}

gboolean on_portal_timeout(gpointer user_data) {
    g_main_loop_quit(static_cast<GMainLoop*>(user_data));
    return G_SOURCE_REMOVE;
}

GVariant* portal_wait_request(GDBusConnection* bus, const char* request_path, int timeout_ms) {
    PortalWaiter waiter{};
    GMainContext* ctx = g_main_context_new();
    g_main_context_push_thread_default(ctx);
    waiter.loop = g_main_loop_new(ctx, FALSE);

    waiter.subscription = g_dbus_connection_signal_subscribe(
        bus, nullptr, "org.freedesktop.portal.Request", "Response", request_path, nullptr,
        G_DBUS_SIGNAL_FLAGS_NO_MATCH_RULE, on_portal_response, &waiter, nullptr);

    GSource* timeout = g_timeout_source_new(timeout_ms);
    g_source_set_callback(timeout, on_portal_timeout, waiter.loop, nullptr);
    g_source_attach(timeout, ctx);

    g_main_loop_run(waiter.loop);

    g_source_destroy(timeout);
    g_dbus_connection_signal_unsubscribe(bus, waiter.subscription);
    g_main_loop_unref(waiter.loop);
    g_main_context_pop_thread_default(ctx);
    g_main_context_unref(ctx);

    if (waiter.response_code != 0) {
        notify("Portal request failed (code " + std::to_string(waiter.response_code) +
               ", screen share denied?)");
        if (waiter.results) {
            g_variant_unref(waiter.results);
        }
        return nullptr;
    }

    return waiter.results;
}

GVariant* portal_call_request(GDBusConnection* bus, const char* method, GVariant* params) {
    GError* error = nullptr;
    GVariant* request_path_var = g_dbus_connection_call_sync(
        bus, kPortalBus, kPortalPath, kScreenCast, method, params, G_VARIANT_TYPE("(o)"),
        G_DBUS_CALL_FLAGS_NONE, kPortalTimeoutMs, nullptr, &error);
    if (!request_path_var) {
        if (error) {
            notify(std::string("Portal ") + method + ": " + error->message);
            g_error_free(error);
        }
        return nullptr;
    }

    const char* request_path_borrowed = nullptr;
    g_variant_get(request_path_var, "(o)", &request_path_borrowed);
    gchar* request_path =
        request_path_borrowed ? g_strdup(request_path_borrowed) : nullptr;
    g_variant_unref(request_path_var);
    if (!request_path) {
        return nullptr;
    }

    GVariant* results = portal_wait_request(bus, request_path, kPortalTimeoutMs);
    g_free(request_path);
    return results;
}

gchar* portal_variant_string_dup(GVariant* value) {
    if (!value) {
        return nullptr;
    }
    if (g_variant_is_of_type(value, G_VARIANT_TYPE_OBJECT_PATH) ||
        g_variant_is_of_type(value, G_VARIANT_TYPE_STRING)) {
        return g_variant_dup_string(value, nullptr);
    }
    return nullptr;
}

gchar* portal_dict_get_string_value(GVariant* dict, const char* key) {
    if (!dict || !key) {
        return nullptr;
    }

    GVariant* value = g_variant_lookup_value(dict, key, G_VARIANT_TYPE_VARIANT);
    if (value) {
        GVariant* inner = g_variant_get_variant(value);
        g_variant_unref(value);
        value = inner;
    }
    if (!value) {
        value = g_variant_lookup_value(dict, key, G_VARIANT_TYPE_OBJECT_PATH);
    }
    if (!value) {
        value = g_variant_lookup_value(dict, key, G_VARIANT_TYPE_STRING);
    }
    if (!value) {
        return nullptr;
    }

    gchar* out = portal_variant_string_dup(value);
    g_variant_unref(value);
    return out;
}

gchar* portal_normalize_session_handle(const char* handle_or_token) {
    if (!handle_or_token || handle_or_token[0] == '\0') {
        return nullptr;
    }

    if (g_variant_is_object_path(handle_or_token)) {
        return g_strdup(handle_or_token);
    }

    if (std::strchr(handle_or_token, '/') != nullptr) {
        return nullptr;
    }

    gchar* path =
        g_strdup_printf("/org/freedesktop/portal/desktop/session/%s", handle_or_token);
    if (!path || !g_variant_is_object_path(path)) {
        g_free(path);
        return nullptr;
    }
    return path;
}

gchar* portal_dict_get_session_handle(GVariant* dict) {
    gchar* raw = portal_dict_get_string_value(dict, "session_handle");
    if (!raw) {
        return nullptr;
    }

    gchar* normalized = portal_normalize_session_handle(raw);
    g_free(raw);
    return normalized;
}

GVariant* portal_variant_session_opts(const char* session_handle, GVariantBuilder* opts) {
    if (!session_handle || !g_variant_is_object_path(session_handle)) {
        return nullptr;
    }
    return g_variant_new("(oa{sv})", session_handle, opts);
}

GVariant* portal_variant_start_opts(const char* session_handle, const char* parent_window,
                                    GVariantBuilder* opts) {
    if (!session_handle || !g_variant_is_object_path(session_handle)) {
        return nullptr;
    }
    const char* parent = (parent_window && parent_window[0]) ? parent_window : "";
    return g_variant_new("(osa{sv})", session_handle, parent, opts);
}

bool portal_parse_streams(GVariant* results, uint32_t* out_node_id) {
    *out_node_id = 0;
    if (!results) {
        return false;
    }

    GVariant* streams =
        g_variant_lookup_value(results, "streams", G_VARIANT_TYPE("a(ua{sv})"));
    if (!streams) {
        return false;
    }

    GVariantIter iter;
    g_variant_iter_init(&iter, streams);

    guint node_id = 0;
    GVariant* stream_props = nullptr;
    if (g_variant_iter_next(&iter, "(u@a{sv})", &node_id, &stream_props)) {
        *out_node_id = node_id;
        if (stream_props) {
            g_variant_unref(stream_props);
        }
    }

    g_variant_unref(streams);
    return *out_node_id != 0;
}

bool copy_sample_to_framebuffer(GstSample* sample, char* framebuffer, int width, int height) {
    if (!sample || !framebuffer) {
        return false;
    }

    GstBuffer* buffer = gst_sample_get_buffer(sample);
    GstCaps* caps = gst_sample_get_caps(sample);
    if (!buffer || !caps) {
        return false;
    }

    GstVideoInfo info;
    if (!gst_video_info_from_caps(&info, caps)) {
        return false;
    }

    GstVideoFrame frame;
    if (!gst_video_frame_map(&frame, &info, buffer, GST_MAP_READ)) {
        return false;
    }

    const int src_w = GST_VIDEO_FRAME_WIDTH(&frame);
    const int src_h = GST_VIDEO_FRAME_HEIGHT(&frame);
    const int copy_w = std::min(width, src_w);
    const int copy_h = std::min(height, src_h);
    const int dst_stride = width * 4;
    const int src_stride = GST_VIDEO_FRAME_PLANE_STRIDE(&frame, 0);
    const auto* src = GST_VIDEO_FRAME_PLANE_DATA(&frame, 0);

    std::memset(framebuffer, 0, static_cast<size_t>(height) * static_cast<size_t>(dst_stride));

    for (int y = 0; y < copy_h; ++y) {
        std::memcpy(framebuffer + y * dst_stride,
                    static_cast<const char*>(src) + y * src_stride,
                    static_cast<size_t>(copy_w) * 4U);
    }

    gst_video_frame_unmap(&frame);
    return true;
}

bool pipeline_start(const std::string& pipeline_desc) {
    GError* error = nullptr;
    g_pipeline = gst_parse_launch(pipeline_desc.c_str(), &error);
    if (!g_pipeline) {
        if (error) {
            notify("GStreamer pipeline: " + std::string(error->message));
            g_error_free(error);
        }
        return false;
    }

    g_appsink = gst_bin_get_by_name(GST_BIN(g_pipeline), "sink");
    if (!g_appsink) {
        notify("GStreamer pipeline: missing appsink named 'sink'");
        gst_object_unref(g_pipeline);
        g_pipeline = nullptr;
        return false;
    }

    gst_app_sink_set_emit_signals(GST_APP_SINK(g_appsink), FALSE);
    gst_app_sink_set_drop(GST_APP_SINK(g_appsink), TRUE);
    gst_app_sink_set_max_buffers(GST_APP_SINK(g_appsink), 1);

    const GstStateChangeReturn ret = gst_element_set_state(g_pipeline, GST_STATE_PLAYING);
    if (ret == GST_STATE_CHANGE_FAILURE) {
        notify("GStreamer pipeline: failed to start PLAYING");
        gst_object_unref(g_appsink);
        g_appsink = nullptr;
        gst_object_unref(g_pipeline);
        g_pipeline = nullptr;
        return false;
    }

    return true;
}

bool portal_run_select_sources(GDBusConnection* bus, const char* session_handle, bool interactive) {
    GVariantBuilder opts;
    g_variant_builder_init(&opts, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&opts, "{sv}", "types", g_variant_new_uint32(1));
    g_variant_builder_add(&opts, "{sv}", "multiple", g_variant_new_boolean(FALSE));
    g_variant_builder_add(&opts, "{sv}", "cursor_mode", g_variant_new_uint32(2));
    g_variant_builder_add(&opts, "{sv}", "persist_mode", g_variant_new_uint32(2));
    g_variant_builder_add(&opts, "{sv}", "interactive", g_variant_new_boolean(interactive));

    GVariant* select_params = portal_variant_session_opts(session_handle, &opts);
    if (!select_params) {
        return false;
    }
    GVariant* select_results = portal_call_request(bus, "SelectSources", select_params);
    g_variant_unref(select_params);
    if (!select_results) {
        return false;
    }
    g_variant_unref(select_results);
    return true;
}

bool portal_acquire_pipewire(int* out_fd, uint32_t* out_node_id) {
    *out_fd = -1;
    *out_node_id = 0;

    GError* error = nullptr;
    GDBusConnection* bus = g_bus_get_sync(G_BUS_TYPE_SESSION, nullptr, &error);
    if (!bus) {
        if (error) {
            notify("Portal: " + std::string(error->message));
            g_error_free(error);
        }
        return false;
    }

    const std::string token = make_portal_token();

    GVariantBuilder opts;
    g_variant_builder_init(&opts, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&opts, "{sv}", "session_handle_token",
                          g_variant_new_string(token.c_str()));
    g_variant_builder_add(&opts, "{sv}", "handle_token", g_variant_new_string(token.c_str()));

    GVariant* create_results =
        portal_call_request(bus, "CreateSession", g_variant_new("(a{sv})", &opts));
    if (!create_results) {
        g_object_unref(bus);
        return false;
    }

    gchar* session_handle = portal_dict_get_session_handle(create_results);
    g_variant_unref(create_results);
    if (!session_handle) {
        notify("Portal: missing or invalid session_handle");
        g_object_unref(bus);
        return false;
    }

    if (!portal_run_select_sources(bus, session_handle, false) &&
        !portal_run_select_sources(bus, session_handle, true)) {
        notify("화면 공유 권한이 필요합니다. 설정 → 개인 정보 보호 → 화면 공유에서 허용하세요.");
        g_free(session_handle);
        g_object_unref(bus);
        return false;
    }

    g_variant_builder_init(&opts, G_VARIANT_TYPE_VARDICT);
    const char* parent = g_portal_parent_window.empty() ? "" : g_portal_parent_window.c_str();

    GVariant* start_params = portal_variant_start_opts(session_handle, parent, &opts);
    if (!start_params) {
        notify("Portal Start: invalid session handle");
        g_free(session_handle);
        g_object_unref(bus);
        return false;
    }
    GVariant* start_results = portal_call_request(bus, "Start", start_params);
    g_variant_unref(start_params);
    if (!start_results) {
        g_free(session_handle);
        g_object_unref(bus);
        return false;
    }

    if (!portal_parse_streams(start_results, out_node_id)) {
        notify("Portal: no stream in Start response");
        g_variant_unref(start_results);
        g_free(session_handle);
        g_object_unref(bus);
        return false;
    }
    g_variant_unref(start_results);

    g_variant_builder_init(&opts, G_VARIANT_TYPE_VARDICT);
    error = nullptr;
    GUnixFDList* fd_list = nullptr;
    GVariant* fd_params = portal_variant_session_opts(session_handle, &opts);
    if (!fd_params) {
        notify("Portal OpenPipeWireRemote: invalid session handle");
        g_free(session_handle);
        g_object_unref(bus);
        return false;
    }
    GVariant* fd_result = g_dbus_connection_call_with_unix_fd_list_sync(
        bus, kPortalBus, kPortalPath, kScreenCast, "OpenPipeWireRemote", fd_params,
        G_VARIANT_TYPE("(h)"), G_DBUS_CALL_FLAGS_NONE, kPortalTimeoutMs, nullptr, &fd_list,
        nullptr, &error);
    g_variant_unref(fd_params);
    g_free(session_handle);

    if (!fd_result || !fd_list) {
        if (error) {
            notify("Portal OpenPipeWireRemote: " + std::string(error->message));
            g_error_free(error);
        }
        if (fd_list) {
            g_object_unref(fd_list);
        }
        g_object_unref(bus);
        return false;
    }

    gint32 fd_index = 0;
    g_variant_get(fd_result, "(h)", &fd_index);
    g_variant_unref(fd_result);

    *out_fd = g_unix_fd_list_get(fd_list, fd_index, &error);
    g_object_unref(fd_list);
    g_object_unref(bus);

    if (*out_fd < 0) {
        if (error) {
            notify("Portal fd: " + std::string(error->message));
            g_error_free(error);
        }
        return false;
    }

    return true;
}

bool init_portal_pipeline() {
    uint32_t node_id = 0;
    int pw_fd = -1;
    if (!portal_acquire_pipewire(&pw_fd, &node_id)) {
        return false;
    }

    g_portal_pw_fd = dup(pw_fd);
    close(pw_fd);
    if (g_portal_pw_fd < 0) {
        return false;
    }

    char pipeline[1024];
    std::snprintf(pipeline, sizeof(pipeline),
                  "pipewiresrc fd=%d target-object=%u do-timestamp=true ! "
                  "videoconvert ! videoscale ! "
                  "video/x-raw,width=%d,height=%d,format=BGRx ! "
                  "appsink name=sink sync=false max-buffers=1 drop=true",
                  g_portal_pw_fd, node_id, g_width, g_height);

    if (!pipeline_start(pipeline)) {
        close(g_portal_pw_fd);
        g_portal_pw_fd = -1;
        return false;
    }

    g_backend = Backend::PortalPipeWire;
    notify("Screen capture: portal PipeWire (full desktop, node " + std::to_string(node_id) +
           ")");
    return true;
}

double sample_nonzero_ratio(GstSample* sample) {
    if (!sample) {
        return 0.0;
    }
    std::vector<char> tmp(static_cast<size_t>(g_width) * static_cast<size_t>(g_height) * 4U);
    if (!copy_sample_to_framebuffer(sample, tmp.data(), g_width, g_height)) {
        return 0.0;
    }
    int samples = 0;
    int nonzero = 0;
    for (int y = 0; y < g_height; y += 37) {
        for (int x = 0; x < g_width; x += 53) {
            const auto* p =
                reinterpret_cast<const unsigned char*>(tmp.data() + (y * g_width + x) * 4);
            if (p[0] > 8 || p[1] > 8 || p[2] > 8) {
                ++nonzero;
            }
            ++samples;
        }
    }
    return samples > 0 ? static_cast<double>(nonzero) / static_cast<double>(samples) : 0.0;
}

}  // namespace

void capture_gstreamer_set_parent_window(const char* parent_window) {
    g_portal_parent_window = parent_window ? parent_window : "";
}

bool capture_gstreamer_init_desktop(int width, int height, CaptureStatusFn on_status) {
    g_on_status = std::move(on_status);
    g_width = width;
    g_height = height;

    if (!g_gst_initialized) {
        gst_init(nullptr, nullptr);
        g_gst_initialized = true;
    }

    if (init_portal_pipeline()) {
        GstSample* probe = gst_app_sink_try_pull_sample(GST_APP_SINK(g_appsink), 8 * GST_SECOND);
        if (probe && sample_nonzero_ratio(probe) >= 0.05) {
            gst_sample_unref(probe);
            return true;
        }
        if (probe) {
            gst_sample_unref(probe);
        }
        capture_gstreamer_shutdown();
        notify("Portal capture empty — will use X11 fallback");
    }

    return false;
}

void capture_gstreamer_shutdown() {
    if (g_pipeline) {
        gst_element_set_state(g_pipeline, GST_STATE_NULL);
        if (g_appsink) {
            gst_object_unref(g_appsink);
            g_appsink = nullptr;
        }
        gst_object_unref(g_pipeline);
        g_pipeline = nullptr;
    }
    if (g_portal_pw_fd >= 0) {
        close(g_portal_pw_fd);
        g_portal_pw_fd = -1;
    }
    g_backend = Backend::None;
}

bool capture_gstreamer_frame(char* framebuffer, int width, int height) {
    if (!g_pipeline || !g_appsink || !framebuffer || width != g_width || height != g_height) {
        return false;
    }

    GstSample* sample = gst_app_sink_try_pull_sample(GST_APP_SINK(g_appsink), GST_SECOND);
    if (!sample) {
        return false;
    }

    const bool ok = copy_sample_to_framebuffer(sample, framebuffer, width, height);
    gst_sample_unref(sample);
    return ok;
}

const char* capture_gstreamer_backend_name() {
    switch (g_backend) {
        case Backend::PortalPipeWire:
            return "portal-pipewire";
        default:
            return "none";
    }
}

bool capture_gstreamer_is_active() {
    return g_backend != Backend::None;
}
