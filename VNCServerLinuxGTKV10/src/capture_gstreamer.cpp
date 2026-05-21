#include "capture_gstreamer.h"

#include <gst/app/gstappsink.h>
#include <gst/gst.h>
#include <gst/video/video.h>

#include <gio/gio.h>
#include <unistd.h>

#include <algorithm>
#include <chrono>
#include <cinttypes>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <random>
#include <string>
#include <vector>

namespace {

enum class Backend { None, PortalPipeWire, X11Src };

Backend g_backend = Backend::None;
CaptureStatusFn g_on_status;
GstElement* g_pipeline = nullptr;
GstElement* g_appsink = nullptr;
int g_width = 0;
int g_height = 0;
bool g_gst_initialized = false;
int g_portal_pw_fd = -1;
gchar* g_portal_session_handle = nullptr;
std::string g_portal_parent_window;

struct PortalStreamInfo {
    uint32_t node_id = 0;
    uint64_t pw_serial = 0;
    bool has_pw_serial = false;
};

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

void portal_close_session() {
    if (!g_portal_session_handle) {
        return;
    }

    GError* error = nullptr;
    GDBusConnection* bus = g_bus_get_sync(G_BUS_TYPE_SESSION, nullptr, &error);
    if (bus) {
        g_dbus_connection_call_sync(
            bus, kPortalBus, g_portal_session_handle, "org.freedesktop.portal.Session",
            "Close", nullptr, nullptr, G_DBUS_CALL_FLAGS_NONE, 5000, nullptr, &error);
        if (error) {
            g_error_free(error);
        }
        g_object_unref(bus);
    } else if (error) {
        g_error_free(error);
    }

    g_free(g_portal_session_handle);
    g_portal_session_handle = nullptr;
}

bool portal_parse_streams(GVariant* results, PortalStreamInfo* out) {
    if (!out) {
        return false;
    }
    *out = PortalStreamInfo{};

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
        out->node_id = node_id;

        if (stream_props) {
            GVariant* serial =
                g_variant_lookup_value(stream_props, "pipewire-serial", G_VARIANT_TYPE("t"));
            if (!serial) {
                serial = g_variant_lookup_value(stream_props, "pipewire-serial",
                                               G_VARIANT_TYPE_UINT64);
            }
            if (serial) {
                out->pw_serial = g_variant_get_uint64(serial);
                out->has_pw_serial = out->pw_serial != 0;
                g_variant_unref(serial);
            }

            GVariant* source_type =
                g_variant_lookup_value(stream_props, "source_type", G_VARIANT_TYPE_UINT32);
            if (source_type) {
                const guint32 st = g_variant_get_uint32(source_type);
                if (st == 2) {
                    notify("경고: Portal이 창(WINDOW) 소스를 반환했습니다. 대화상자에서 모니터를 선택하세요.");
                }
                g_variant_unref(source_type);
            }

            g_variant_unref(stream_props);
        }
    }

    g_variant_unref(streams);
    return out->node_id != 0;
}

void copy_row_bgrx_to_framebuffer(const unsigned char* src_row, int src_w, unsigned char* dst_row,
                                  int dst_w) {
    for (int dx = 0; dx < dst_w; ++dx) {
        const int sx = (dx * src_w) / dst_w;
        const unsigned char* s = src_row + sx * 4;
        dst_row[dx * 4 + 0] = s[0];
        dst_row[dx * 4 + 1] = s[1];
        dst_row[dx * 4 + 2] = s[2];
        dst_row[dx * 4 + 3] = 0;
    }
}

void copy_row_rgbx_to_framebuffer(const unsigned char* src_row, int src_w, unsigned char* dst_row,
                                  int dst_w) {
    for (int dx = 0; dx < dst_w; ++dx) {
        const int sx = (dx * src_w) / dst_w;
        const unsigned char* s = src_row + sx * 4;
        dst_row[dx * 4 + 0] = s[2];
        dst_row[dx * 4 + 1] = s[1];
        dst_row[dx * 4 + 2] = s[0];
        dst_row[dx * 4 + 3] = 0;
    }
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
    if (src_w <= 0 || src_h <= 0 || width <= 0 || height <= 0) {
        gst_video_frame_unmap(&frame);
        return false;
    }

    const int dst_stride = width * 4;
    const int src_stride = GST_VIDEO_FRAME_PLANE_STRIDE(&frame, 0);
    const auto* src = GST_VIDEO_FRAME_PLANE_DATA(&frame, 0);
    const GstVideoFormat fmt = GST_VIDEO_FRAME_FORMAT(&frame);

    // Do not clear the framebuffer — failed or dark frames must not wipe the last good image.

    // Scale portal/X11 frames to the VNC framebuffer (client may resize independently).
    for (int dy = 0; dy < height; ++dy) {
        const int sy = (dy * src_h) / height;
        const auto* src_row = static_cast<const unsigned char*>(src) + sy * src_stride;
        auto* dst_row = reinterpret_cast<unsigned char*>(framebuffer) + dy * dst_stride;
        if (fmt == GST_VIDEO_FORMAT_RGBx || fmt == GST_VIDEO_FORMAT_RGBA ||
            fmt == GST_VIDEO_FORMAT_RGB || fmt == GST_VIDEO_FORMAT_RGB16) {
            copy_row_rgbx_to_framebuffer(src_row, src_w, dst_row, width);
        } else {
            copy_row_bgrx_to_framebuffer(src_row, src_w, dst_row, width);
        }
    }

    gst_video_frame_unmap(&frame);
    return true;
}

bool wait_for_first_frame(int timeout_ms) {
    if (!g_pipeline || !g_appsink || g_width <= 0 || g_height <= 0) {
        return false;
    }

    std::vector<char> tmp(static_cast<size_t>(g_width) * static_cast<size_t>(g_height) * 4U);
    const auto deadline =
        std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);

    while (std::chrono::steady_clock::now() < deadline) {
        GstSample* sample = gst_app_sink_try_pull_sample(
            GST_APP_SINK(g_appsink), 100 * GST_MSECOND);
        if (sample) {
            const bool ok =
                copy_sample_to_framebuffer(sample, tmp.data(), g_width, g_height);
            gst_sample_unref(sample);
            if (ok) {
                int samples = 0;
                int nonzero = 0;
                for (int y = 0; y < g_height; y += 37) {
                    for (int x = 0; x < g_width; x += 53) {
                        const auto* p = reinterpret_cast<const unsigned char*>(
                            tmp.data() + (static_cast<size_t>(y) * static_cast<size_t>(g_width) +
                                          static_cast<size_t>(x)) *
                                             4U);
                        if (p[0] > 8 || p[1] > 8 || p[2] > 8) {
                            ++nonzero;
                        }
                        ++samples;
                    }
                }
                if (samples > 0 &&
                    static_cast<double>(nonzero) / static_cast<double>(samples) >= 0.02) {
                    return true;
                }
            }
        }
        usleep(50 * 1000);
    }
    return false;
}

void pipeline_stop() {
    if (g_pipeline) {
        gst_element_set_state(g_pipeline, GST_STATE_NULL);
        if (g_appsink) {
            gst_object_unref(g_appsink);
            g_appsink = nullptr;
        }
        gst_object_unref(g_pipeline);
        g_pipeline = nullptr;
    }
    g_backend = Backend::None;
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
        gst_element_set_state(g_pipeline, GST_STATE_NULL);
        gst_object_unref(g_pipeline);
        g_pipeline = nullptr;
        return false;
    }

    gst_app_sink_set_emit_signals(GST_APP_SINK(g_appsink), FALSE);
    gst_app_sink_set_drop(GST_APP_SINK(g_appsink), TRUE);
    gst_app_sink_set_max_buffers(GST_APP_SINK(g_appsink), 1);

    const GstStateChangeReturn ret = gst_element_set_state(g_pipeline, GST_STATE_PLAYING);
    // ASYNC and NO_PREROLL are both normal for live sources like pipewiresrc.
    if (ret == GST_STATE_CHANGE_SUCCESS || ret == GST_STATE_CHANGE_ASYNC ||
        ret == GST_STATE_CHANGE_NO_PREROLL) {
        return true;
    }
    {
        // Read the bus error to give a specific failure reason.
        GstBus* bus_obj = gst_element_get_bus(g_pipeline);
        if (bus_obj) {
            GstMessage* msg = gst_bus_timed_pop_filtered(bus_obj, 0,
                static_cast<GstMessageType>(GST_MESSAGE_ERROR | GST_MESSAGE_WARNING));
            if (msg) {
                GError* gerr = nullptr;
                gchar* dbg = nullptr;
                if (GST_MESSAGE_TYPE(msg) == GST_MESSAGE_ERROR) {
                    gst_message_parse_error(msg, &gerr, &dbg);
                } else {
                    gst_message_parse_warning(msg, &gerr, &dbg);
                }
                if (gerr) {
                    notify("GStreamer pipeline error: " + std::string(gerr->message) +
                           (dbg ? (" [" + std::string(dbg) + "]") : ""));
                    g_error_free(gerr);
                }
                g_free(dbg);
                gst_message_unref(msg);
            } else {
                notify("GStreamer pipeline: failed to start PLAYING");
            }
            gst_object_unref(bus_obj);
        } else {
            notify("GStreamer pipeline: failed to start PLAYING");
        }
        gst_element_set_state(g_pipeline, GST_STATE_NULL);
        gst_object_unref(g_appsink);
        g_appsink = nullptr;
        gst_object_unref(g_pipeline);
        g_pipeline = nullptr;
        return false;
    }
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
    // select_params is a floating GVariant; g_dbus_connection_call_sync (called
    // inside portal_call_request) sinks and frees it — do not unref here.
    GVariant* select_results = portal_call_request(bus, "SelectSources", select_params);
    if (!select_results) {
        return false;
    }
    g_variant_unref(select_results);
    return true;
}

bool portal_acquire_pipewire(int* out_fd, PortalStreamInfo* out_stream) {
    *out_fd = -1;
    if (!out_stream) {
        return false;
    }
    *out_stream = PortalStreamInfo{};

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

    notify("화면 공유 대화상자에서 **전체 화면(모니터)** 을 선택하세요.");
    if (!portal_run_select_sources(bus, session_handle, true) &&
        !portal_run_select_sources(bus, session_handle, false)) {
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
    // Floating GVariant — consumed by g_dbus inside portal_call_request.
    GVariant* start_results = portal_call_request(bus, "Start", start_params);
    if (!start_results) {
        g_free(session_handle);
        g_object_unref(bus);
        return false;
    }

    if (!portal_parse_streams(start_results, out_stream)) {
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
    // Floating GVariant — consumed by g_dbus_connection_call_with_unix_fd_list_sync.
    GVariant* fd_result = g_dbus_connection_call_with_unix_fd_list_sync(
        bus, kPortalBus, kPortalPath, kScreenCast, "OpenPipeWireRemote", fd_params,
        G_VARIANT_TYPE("(h)"), G_DBUS_CALL_FLAGS_NONE, kPortalTimeoutMs, nullptr, &fd_list,
        nullptr, &error);
    if (!fd_result || !fd_list) {
        g_free(session_handle);
        if (error) {
            notify("Portal OpenPipeWireRemote: " + std::string(error->message));
            g_error_free(error);
        }
        if (fd_list) {
            g_object_unref(fd_list);
        }
        g_object_unref(bus);
        g_free(session_handle);
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
        g_free(session_handle);
        return false;
    }

    g_portal_session_handle = session_handle;
    return true;
}

bool try_portal_pipewire_pipeline(int pw_fd, const PortalStreamInfo& stream) {
    const char* suffix =
        "videoconvert ! video/x-raw,format=BGRx ! "
        "appsink name=sink sync=false max-buffers=2 drop=false";

    std::vector<std::string> candidates;
    candidates.emplace_back("pipewiresrc fd=" + std::to_string(pw_fd) + " path=" +
                            std::to_string(stream.node_id) + " autoconnect=true ! " + suffix);
    candidates.emplace_back("pipewiresrc fd=" + std::to_string(pw_fd) + " path=" +
                            std::to_string(stream.node_id) + " autoconnect=false ! " + suffix);
    candidates.emplace_back("pipewiresrc fd=" + std::to_string(pw_fd) + " autoconnect=true ! " +
                            suffix);
    if (stream.has_pw_serial) {
        candidates.emplace_back("pipewiresrc fd=" + std::to_string(pw_fd) + " target-object=" +
                                std::to_string(stream.pw_serial) + " autoconnect=true ! " +
                                suffix);
    }

    for (const std::string& pipeline_desc : candidates) {
        pipeline_stop();
        notify("GStreamer try: " + pipeline_desc);
        if (!pipeline_start(pipeline_desc)) {
            continue;
        }
        if (wait_for_first_frame(8000)) {
            notify("GStreamer pipeline OK");
            return true;
        }
    }
    pipeline_stop();
    return false;
}

bool init_portal_pipeline() {
    PortalStreamInfo stream{};
    int pw_fd = -1;
    if (!portal_acquire_pipewire(&pw_fd, &stream)) {
        return false;
    }

    g_portal_pw_fd = dup(pw_fd);
    close(pw_fd);
    if (g_portal_pw_fd < 0) {
        portal_close_session();
        return false;
    }

    notify("Portal stream: node=" + std::to_string(stream.node_id) +
           (stream.has_pw_serial ? (" serial=" + std::to_string(stream.pw_serial)) : ""));

    if (!try_portal_pipewire_pipeline(g_portal_pw_fd, stream)) {
        notify("Portal: PipeWire에 화면 데이터가 없습니다 (모니터를 선택했는지 확인)");
        close(g_portal_pw_fd);
        g_portal_pw_fd = -1;
        portal_close_session();
        return false;
    }

    g_backend = Backend::PortalPipeWire;
    notify("Screen capture: portal PipeWire (monitor stream)");
    return true;
}

bool init_x11_pipeline() {
    const char* pipeline =
        "ximagesrc use-damage=false show-pointer=false ! "
        "videoconvert ! video/x-raw,format=BGRx ! "
        "appsink name=sink sync=false max-buffers=2 drop=false";

    if (!pipeline_start(pipeline)) {
        return false;
    }

    g_backend = Backend::X11Src;
    notify("Screen capture: GStreamer ximagesrc (X11 root)");
    wait_for_first_frame(3000);
    return true;
}

[[maybe_unused]] double sample_nonzero_ratio(GstSample* sample) {
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
    capture_gstreamer_shutdown();

    g_on_status = std::move(on_status);
    g_width = width;
    g_height = height;

    if (!g_gst_initialized) {
        gst_init(nullptr, nullptr);
        g_gst_initialized = true;
    }

    // Don't block waiting for the first frame: pipewiresrc negotiates with the
    // PipeWire daemon asynchronously and the first sample may arrive later.
    // capture_gstreamer_frame() will return false until frames flow; the caller
    // falls back to X11 for those frames and switches to PipeWire automatically.
    if (init_portal_pipeline()) {
        return true;
    }

    // On native X11 (no Wayland), capture the root window when portal is unavailable.
    if (!std::getenv("WAYLAND_DISPLAY") && init_x11_pipeline()) {
        return true;
    }

    return false;
}

void capture_gstreamer_shutdown() {
    pipeline_stop();
    if (g_portal_pw_fd >= 0) {
        close(g_portal_pw_fd);
        g_portal_pw_fd = -1;
    }
    portal_close_session();
    g_backend = Backend::None;
}

double sample_content_ratio(GstSample* sample) {
    if (!sample) {
        return 0.0;
    }

    GstBuffer* buffer = gst_sample_get_buffer(sample);
    GstCaps* caps = gst_sample_get_caps(sample);
    if (!buffer || !caps) {
        return 0.0;
    }

    GstVideoInfo info;
    if (!gst_video_info_from_caps(&info, caps)) {
        return 0.0;
    }

    GstVideoFrame frame;
    if (!gst_video_frame_map(&frame, &info, buffer, GST_MAP_READ)) {
        return 0.0;
    }

    const int src_w = GST_VIDEO_FRAME_WIDTH(&frame);
    const int src_h = GST_VIDEO_FRAME_HEIGHT(&frame);
    const int src_stride = GST_VIDEO_FRAME_PLANE_STRIDE(&frame, 0);
    const auto* src = GST_VIDEO_FRAME_PLANE_DATA(&frame, 0);
    const GstVideoFormat fmt = GST_VIDEO_FRAME_FORMAT(&frame);

    int samples = 0;
    int nonzero = 0;
    for (int y = 0; y < src_h; y += 37) {
        for (int x = 0; x < src_w; x += 53) {
            const auto* p = static_cast<const unsigned char*>(src) + y * src_stride + x * 4;
            unsigned char b = p[0];
            unsigned char g = p[1];
            unsigned char r = p[2];
            if (fmt == GST_VIDEO_FORMAT_RGBx || fmt == GST_VIDEO_FORMAT_RGBA ||
                fmt == GST_VIDEO_FORMAT_RGB) {
                std::swap(r, b);
            }
            if (r > 8 || g > 8 || b > 8) {
                ++nonzero;
            }
            ++samples;
        }
    }

    gst_video_frame_unmap(&frame);
    return samples > 0 ? static_cast<double>(nonzero) / static_cast<double>(samples) : 0.0;
}

bool capture_gstreamer_frame(char* framebuffer, int width, int height) {
    if (!g_pipeline || !g_appsink || !framebuffer || width <= 0 || height <= 0) {
        return false;
    }

    GstSample* sample = gst_app_sink_try_pull_sample(GST_APP_SINK(g_appsink), GST_SECOND);
    if (!sample) {
        return false;
    }

    constexpr double kMinFrameContent = 0.01;
    if (sample_content_ratio(sample) < kMinFrameContent) {
        gst_sample_unref(sample);
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
        case Backend::X11Src:
            return "gstreamer-x11";
        default:
            return "none";
    }
}

bool capture_gstreamer_is_active() {
    return g_backend != Backend::None;
}

bool capture_gstreamer_is_portal() {
    return g_backend == Backend::PortalPipeWire;
}
