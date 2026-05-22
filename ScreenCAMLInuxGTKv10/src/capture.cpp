#include "capture.h"

#include <gio/gio.h>
#include <gio/gunixfdlist.h>
#include <unistd.h>

#include <chrono>
#include <cstdlib>
#include <cstring>
#include <random>
#include <string>

namespace {

constexpr const char* kPortalBus  = "org.freedesktop.portal.Desktop";
constexpr const char* kPortalPath = "/org/freedesktop/portal/desktop";
constexpr const char* kScreenCast = "org.freedesktop.portal.ScreenCast";
constexpr int kTimeoutMs = 120000;

gchar* g_session_handle = nullptr;
CaptureStatusFn g_on_status;

void notify(const std::string& msg) {
    if (g_on_status) g_on_status(msg);
}

std::string make_token() {
    static std::mt19937 rng(static_cast<unsigned>(
        std::chrono::steady_clock::now().time_since_epoch().count()));
    std::uniform_int_distribution<int> dist(0, 15);
    std::string t = "screenrec";
    for (int i = 0; i < 8; ++i)
        t.push_back("0123456789abcdef"[dist(rng)]);
    return t;
}

// --- Portal request helpers (same pattern as VNCServerLinuxGTKV10) ---

struct PortalWaiter {
    GMainLoop* loop         = nullptr;
    GVariant*  results      = nullptr;
    guint      subscription = 0;
    guint32    response     = 1;
};

void on_portal_response(GDBusConnection*, const char*, const char*, const char*, const char*,
                        GVariant* params, gpointer user_data) {
    auto* w = static_cast<PortalWaiter*>(user_data);
    GVariant* res = nullptr;
    g_variant_get(params, "(u@a{sv})", &w->response, &res);
    if (w->response == 0 && res) w->results = g_variant_ref(res);
    if (res) g_variant_unref(res);
    if (w->loop) g_main_loop_quit(w->loop);
}

gboolean on_portal_timeout(gpointer p) {
    g_main_loop_quit(static_cast<GMainLoop*>(p));
    return G_SOURCE_REMOVE;
}

GVariant* portal_wait_request(GDBusConnection* bus, const char* req_path, int timeout_ms) {
    PortalWaiter w{};
    GMainContext* ctx = g_main_context_new();
    g_main_context_push_thread_default(ctx);
    w.loop = g_main_loop_new(ctx, FALSE);

    w.subscription = g_dbus_connection_signal_subscribe(
        bus, nullptr, "org.freedesktop.portal.Request", "Response", req_path,
        nullptr, G_DBUS_SIGNAL_FLAGS_NO_MATCH_RULE, on_portal_response, &w, nullptr);

    GSource* src = g_timeout_source_new(timeout_ms);
    g_source_set_callback(src, on_portal_timeout, w.loop, nullptr);
    g_source_attach(src, ctx);

    g_main_loop_run(w.loop);

    g_source_destroy(src);
    g_dbus_connection_signal_unsubscribe(bus, w.subscription);
    g_main_loop_unref(w.loop);
    g_main_context_pop_thread_default(ctx);
    g_main_context_unref(ctx);

    if (w.response != 0) {
        notify("Portal 요청 실패 (응답 코드 " + std::to_string(w.response) +
               " — 화면 공유 거부?)");
        if (w.results) g_variant_unref(w.results);
        return nullptr;
    }
    return w.results;
}

GVariant* portal_call_request(GDBusConnection* bus, const char* method, GVariant* params) {
    GError* err = nullptr;
    GVariant* path_var = g_dbus_connection_call_sync(
        bus, kPortalBus, kPortalPath, kScreenCast, method, params,
        G_VARIANT_TYPE("(o)"), G_DBUS_CALL_FLAGS_NONE, kTimeoutMs, nullptr, &err);
    if (!path_var) {
        if (err) { notify(std::string("Portal ") + method + ": " + err->message); g_error_free(err); }
        return nullptr;
    }
    const char* rp = nullptr;
    g_variant_get(path_var, "(o)", &rp);
    gchar* req_path = rp ? g_strdup(rp) : nullptr;
    g_variant_unref(path_var);
    if (!req_path) return nullptr;
    GVariant* results = portal_wait_request(bus, req_path, kTimeoutMs);
    g_free(req_path);
    return results;
}

// Extract session_handle string from a{sv} result dict.
gchar* extract_session_handle(GVariant* dict) {
    if (!dict) return nullptr;

    GVariant* v = g_variant_lookup_value(dict, "session_handle", G_VARIANT_TYPE_VARIANT);
    if (v) {
        GVariant* inner = g_variant_get_variant(v);
        g_variant_unref(v);
        v = inner;
    }
    if (!v) v = g_variant_lookup_value(dict, "session_handle", G_VARIANT_TYPE_OBJECT_PATH);
    if (!v) v = g_variant_lookup_value(dict, "session_handle", G_VARIANT_TYPE_STRING);
    if (!v) return nullptr;

    gchar* raw = nullptr;
    if (g_variant_is_of_type(v, G_VARIANT_TYPE_OBJECT_PATH) ||
        g_variant_is_of_type(v, G_VARIANT_TYPE_STRING))
        raw = g_variant_dup_string(v, nullptr);
    g_variant_unref(v);
    if (!raw) return nullptr;

    if (g_variant_is_object_path(raw)) return raw;

    if (std::strchr(raw, '/') != nullptr) { g_free(raw); return nullptr; }

    gchar* path = g_strdup_printf("/org/freedesktop/portal/desktop/session/%s", raw);
    g_free(raw);
    if (!g_variant_is_object_path(path)) { g_free(path); return nullptr; }
    return path;
}

bool parse_portal_streams(GVariant* results, PortalStream* out) {
    if (!results || !out) return false;
    *out = PortalStream{};

    GVariant* streams = g_variant_lookup_value(results, "streams", G_VARIANT_TYPE("a(ua{sv})"));
    if (!streams) return false;

    GVariantIter iter;
    g_variant_iter_init(&iter, streams);
    guint node_id = 0;
    GVariant* props = nullptr;
    if (g_variant_iter_next(&iter, "(u@a{sv})", &node_id, &props)) {
        out->node_id = node_id;
        if (props) {
            GVariant* serial = g_variant_lookup_value(props, "pipewire-serial", G_VARIANT_TYPE("t"));
            if (!serial)
                serial = g_variant_lookup_value(props, "pipewire-serial", G_VARIANT_TYPE_UINT64);
            if (!serial)
                serial = g_variant_lookup_value(props, "serial", G_VARIANT_TYPE("t"));
            if (!serial)
                serial = g_variant_lookup_value(props, "serial", G_VARIANT_TYPE_UINT64);
            if (serial) {
                out->pw_serial     = g_variant_get_uint64(serial);
                out->has_pw_serial = out->pw_serial != 0;
                g_variant_unref(serial);
            }
            g_variant_unref(props);
        }
    }
    g_variant_unref(streams);
    return out->node_id != 0;
}

void close_session_internal() {
    if (!g_session_handle) return;
    GError* err = nullptr;
    GDBusConnection* bus = g_bus_get_sync(G_BUS_TYPE_SESSION, nullptr, &err);
    if (bus) {
        g_dbus_connection_call_sync(
            bus, kPortalBus, g_session_handle,
            "org.freedesktop.portal.Session", "Close",
            nullptr, nullptr, G_DBUS_CALL_FLAGS_NONE, 5000, nullptr, &err);
        if (err) g_error_free(err);
        g_object_unref(bus);
    } else if (err) {
        g_error_free(err);
    }
    g_free(g_session_handle);
    g_session_handle = nullptr;
}

}  // namespace

bool capture_portal_acquire(const std::string& parent_window_hint,
                            CaptureStatusFn on_status, PortalStream* out) {
    if (!out) return false;
    *out = PortalStream{};
    g_on_status = on_status;

    close_session_internal();

    GError* err = nullptr;
    GDBusConnection* bus = g_bus_get_sync(G_BUS_TYPE_SESSION, nullptr, &err);
    if (!bus) {
        if (err) { notify("D-Bus 연결 실패: " + std::string(err->message)); g_error_free(err); }
        return false;
    }

    const std::string token = make_token();

    // CreateSession
    GVariantBuilder opts;
    g_variant_builder_init(&opts, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&opts, "{sv}", "session_handle_token",
                          g_variant_new_string(token.c_str()));
    g_variant_builder_add(&opts, "{sv}", "handle_token",
                          g_variant_new_string(token.c_str()));

    GVariant* create_res = portal_call_request(bus, "CreateSession",
                                               g_variant_new("(a{sv})", &opts));
    if (!create_res) { g_object_unref(bus); return false; }

    gchar* session = extract_session_handle(create_res);
    g_variant_unref(create_res);
    if (!session) {
        notify("Portal: 세션 핸들 없음");
        g_object_unref(bus);
        return false;
    }

    // SelectSources — types=3 allows both MONITOR(1) and WINDOW(2) selection.
    // The user picks which one in the Portal dialog itself.
    // cursor_mode=2 → embed cursor in the stream.
    g_variant_builder_init(&opts, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&opts, "{sv}", "types",        g_variant_new_uint32(3));  // MONITOR|WINDOW
    g_variant_builder_add(&opts, "{sv}", "multiple",     g_variant_new_boolean(FALSE));
    g_variant_builder_add(&opts, "{sv}", "cursor_mode",  g_variant_new_uint32(2));
    g_variant_builder_add(&opts, "{sv}", "persist_mode", g_variant_new_uint32(2));

    notify("화면 공유 대화상자에서 녹화할 화면 또는 창을 선택하세요.");
    GVariant* sel_res = portal_call_request(bus, "SelectSources",
                                            g_variant_new("(oa{sv})", session, &opts));
    if (!sel_res) {
        g_free(session);
        g_object_unref(bus);
        return false;
    }
    g_variant_unref(sel_res);

    // Start
    g_variant_builder_init(&opts, G_VARIANT_TYPE_VARDICT);
    const char* parent = parent_window_hint.empty() ? "" : parent_window_hint.c_str();
    GVariant* start_res = portal_call_request(bus, "Start",
                                              g_variant_new("(osa{sv})", session, parent, &opts));
    if (!start_res) {
        g_free(session);
        g_object_unref(bus);
        return false;
    }

    if (!parse_portal_streams(start_res, out)) {
        notify("Portal: 스트림 응답 없음");
        g_variant_unref(start_res);
        g_free(session);
        g_object_unref(bus);
        return false;
    }
    g_variant_unref(start_res);

    // OpenPipeWireRemote
    g_variant_builder_init(&opts, G_VARIANT_TYPE_VARDICT);
    GUnixFDList* fd_list = nullptr;
    err = nullptr;
    GVariant* fd_res = g_dbus_connection_call_with_unix_fd_list_sync(
        bus, kPortalBus, kPortalPath, kScreenCast, "OpenPipeWireRemote",
        g_variant_new("(oa{sv})", session, &opts),
        G_VARIANT_TYPE("(h)"), G_DBUS_CALL_FLAGS_NONE, kTimeoutMs,
        nullptr, &fd_list, nullptr, &err);

    if (!fd_res || !fd_list) {
        if (err) { notify("Portal OpenPipeWireRemote: " + std::string(err->message)); g_error_free(err); }
        if (fd_list) g_object_unref(fd_list);
        g_free(session);
        g_object_unref(bus);
        return false;
    }

    gint32 fd_idx = 0;
    g_variant_get(fd_res, "(h)", &fd_idx);
    g_variant_unref(fd_res);

    out->pw_fd = g_unix_fd_list_get(fd_list, fd_idx, &err);
    g_object_unref(fd_list);
    g_object_unref(bus);

    if (out->pw_fd < 0) {
        if (err) { notify("Portal FD 획득 실패: " + std::string(err->message)); g_error_free(err); }
        g_free(session);
        return false;
    }

    g_session_handle = session;
    std::string msg = "Portal 스트림 획득: node=" + std::to_string(out->node_id);
    if (out->has_pw_serial)
        msg += ", serial=" + std::to_string(out->pw_serial);
    notify(msg);
    return true;
}

void capture_portal_close_session() {
    close_session_internal();
}

bool capture_is_wayland() {
    return std::getenv("WAYLAND_DISPLAY") != nullptr;
}
