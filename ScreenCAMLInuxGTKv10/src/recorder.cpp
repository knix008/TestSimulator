#include "recorder.h"
#include "capture.h"

#include <gst/gst.h>
#include <unistd.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

std::atomic<bool> g_recording{false};
std::mutex        g_pipeline_mtx;
GstElement*       g_pipeline = nullptr;
std::chrono::steady_clock::time_point g_start_time;
RecorderLogFn     g_on_log;
bool              g_gst_inited = false;

// ── Utilities ────────────────────────────────────────────────────────────────

void gst_init_once() {
    if (!g_gst_inited) {
        gst_init(nullptr, nullptr);
        g_gst_inited = true;
    }
}

void post_to_main(std::function<void()> fn) {
    auto* heap = new std::function<void()>(std::move(fn));
    g_main_context_invoke(nullptr, [](gpointer p) -> gboolean {
        auto* f = static_cast<std::function<void()>*>(p);
        (*f)();
        delete f;
        return G_SOURCE_REMOVE;
    }, heap);
}

void post_log(const std::string& msg) {
    if (!g_on_log) return;
    post_to_main([msg]() { if (g_on_log) g_on_log(msg); });
}

std::string escape_path(const std::string& path) {
    std::string out;
    out.reserve(path.size());
    for (char c : path) {
        if (c == '"') out += "\\\"";
        else          out += c;
    }
    return out;
}

// ── Pipeline candidate builder ────────────────────────────────────────────────

// Shared tail: encode → mux → filesink
std::string encode_mux_sink(const RecorderOptions& opts) {
    const std::string enc = (opts.codec == VideoCodec::H265)
        ? "x265enc speed-preset=ultrafast tune=zerolatency bitrate=" + std::to_string(opts.bitrate_kbps)
        : "x264enc speed-preset=ultrafast tune=zerolatency bitrate=" + std::to_string(opts.bitrate_kbps);
    const std::string mux = (opts.format == OutputFormat::MKV) ? "matroskamux" : "mp4mux";
    return " ! " + enc + " ! " + mux + " ! filesink location=\"" + escape_path(opts.output_path) + "\"";
}

// Rate + optional scale tail  (placed AFTER the format capsfilter)
std::string rate_scale_caps(const RecorderOptions& opts, bool with_fps) {
    std::string caps = "video/x-raw,format=I420";
    if (with_fps)
        caps += ",framerate=" + std::to_string(opts.fps) + "/1";
    if (opts.output_width > 0 && opts.output_height > 0)
        caps += ",width="  + std::to_string(opts.output_width) +
                ",height=" + std::to_string(opts.output_height) +
                ",pixel-aspect-ratio=1/1";
    return " ! videorate ! videoscale ! " + caps;
}

// Audio chain (pulsesrc → encoder → ready for ! mux.)
std::string audio_chain(const RecorderOptions& opts) {
    const std::string audio_enc  = (opts.format == OutputFormat::MKV) ? "opusenc" : "voaacenc";
    const std::string audio_rate = (opts.format == OutputFormat::MKV) ? "48000" : "44100";
    char vol[32];
    std::snprintf(vol, sizeof(vol), "%.3f", opts.audio_volume);
    const std::string src = opts.audio_device.empty()
        ? "pulsesrc"
        : "pulsesrc device=\"" + opts.audio_device + "\"";
    return src
        + " ! audioconvert ! audioresample"
        + " ! audio/x-raw,rate=" + audio_rate + ",channels=2"
        + " ! volume volume=" + vol
        + " ! " + audio_enc + " ! queue";
}

// Build the ordered list of pipeline strings to try for Portal/PipeWire.
// Ordered from most capable to most minimal.
std::vector<std::string> portal_candidates(
        const RecorderOptions& opts,
        int pw_fd, std::uint32_t node_id,
        std::uint64_t pw_serial, bool has_pw_serial) {

    const std::string fd   = std::to_string(pw_fd);
    const std::string path = std::to_string(node_id);
    const std::string ems  = encode_mux_sink(opts);
    const std::string rsc  = rate_scale_caps(opts, /*with_fps=*/true);
    const std::string rsc_nofps = rate_scale_caps(opts, /*with_fps=*/false);

    // Post-source chains to try (most specific → most lenient)
    // BGRx as the intermediate format is confirmed working by VNCServer.
    const std::vector<std::string> video_chains = {
        // 1. BGRx intermediate → I420 downstream (VNCServer-proven format path)
        " ! videoconvert ! video/x-raw,format=BGRx ! queue max-size-buffers=8" + rsc + ems,
        // 2. Direct I420, with explicit fps constraint
        " ! videoconvert ! video/x-raw,format=I420 ! queue max-size-buffers=8" + rsc + ems,
        // 3. No intermediate capsfilter (let GStreamer negotiate freely)
        " ! videoconvert ! queue max-size-buffers=8" + rsc + ems,
        // 4. Minimal: skip rate/scale entirely (native fps from Portal)
        " ! videoconvert ! video/x-raw,format=I420 ! queue max-size-buffers=8" + rsc_nofps + ems,
        // 5. Ultra-minimal: videoconvert → encoder (no rate/scale/caps)
        " ! videoconvert ! queue max-size-buffers=8" + ems,
    };

    // pipewiresrc prefixes to try
    const std::vector<std::string> srcs = {
        "pipewiresrc fd=" + fd + " path=" + path + " autoconnect=true",
        "pipewiresrc fd=" + fd + " path=" + path + " autoconnect=false",
        "pipewiresrc fd=" + fd + " autoconnect=true",
        has_pw_serial
            ? "pipewiresrc fd=" + fd + " target-object=" + std::to_string(pw_serial) + " autoconnect=true"
            : "",
    };

    std::vector<std::string> candidates;
    // Combine: first source × first chain, then first source × second chain, etc.
    // (Vary chains faster than sources so we find a working chain quickly.)
    for (const auto& chain : video_chains) {
        for (const auto& src : srcs) {
            if (src.empty()) continue;
            if (opts.enable_audio) {
                const std::string mux_elem = (opts.format == OutputFormat::MKV) ? "matroskamux" : "mp4mux";
                const std::string file_sink = "filesink location=\"" + escape_path(opts.output_path) + "\"";
                // Rebuild video branch without the trailing ems, then attach to named mux
                // (chain ends with encoder + queue; we need to strip ems and add ! mux.)
                // For simplicity, we only try audio with the first two chains.
                if (&chain == &video_chains[0] || &chain == &video_chains[1]) {
                    const std::string vchain_for_mux = [&]() -> std::string {
                        // Rebuild video branch for mux-first syntax
                        const std::string rsc_local = rate_scale_caps(opts, /*with_fps=*/true);
                        const std::string enc = (opts.codec == VideoCodec::H265)
                            ? " ! x265enc speed-preset=ultrafast tune=zerolatency bitrate=" + std::to_string(opts.bitrate_kbps)
                            : " ! x264enc speed-preset=ultrafast tune=zerolatency bitrate=" + std::to_string(opts.bitrate_kbps);
                        const std::string intermediate = (&chain == &video_chains[0])
                            ? " ! videoconvert ! video/x-raw,format=BGRx ! queue max-size-buffers=8"
                            : " ! videoconvert ! video/x-raw,format=I420 ! queue max-size-buffers=8";
                        return src + intermediate + rsc_local + enc + " ! queue";
                    }();
                    candidates.push_back(mux_elem + " name=mux ! " + file_sink
                                         + "  " + vchain_for_mux + " ! mux."
                                         + "  " + audio_chain(opts)  + " ! mux.");
                }
            } else {
                candidates.push_back(src + chain);
            }
        }
    }
    return candidates;
}

// X11 candidates (ximagesrc always produces system memory — single candidate).
std::string x11_pipeline(const RecorderOptions& opts) {
    const std::string src = (opts.source == CaptureSource::Window && opts.window_xid != 0)
        ? "ximagesrc xid=" + std::to_string(opts.window_xid) +
          " use-damage=false show-pointer=" + (opts.show_cursor ? "true" : "false")
        : std::string("ximagesrc use-damage=false show-pointer=") + (opts.show_cursor ? "true" : "false");

    const std::string ems = encode_mux_sink(opts);
    const std::string rsc = rate_scale_caps(opts, /*with_fps=*/true);

    if (!opts.enable_audio)
        return src + " ! videoconvert ! video/x-raw,format=I420 ! queue max-size-buffers=8" + rsc + ems;

    // Audio + video for X11
    const std::string mux_elem  = (opts.format == OutputFormat::MKV) ? "matroskamux" : "mp4mux";
    const std::string file_sink = "filesink location=\"" + escape_path(opts.output_path) + "\"";
    const std::string enc = (opts.codec == VideoCodec::H265)
        ? " ! x265enc speed-preset=ultrafast tune=zerolatency bitrate=" + std::to_string(opts.bitrate_kbps)
        : " ! x264enc speed-preset=ultrafast tune=zerolatency bitrate=" + std::to_string(opts.bitrate_kbps);
    const std::string video_branch = src
        + " ! videoconvert ! video/x-raw,format=I420 ! queue max-size-buffers=8"
        + rsc + enc + " ! queue";
    return mux_elem + " name=mux ! " + file_sink
         + "  " + video_branch      + " ! mux."
         + "  " + audio_chain(opts) + " ! mux.";
}

// ── Pipeline trial ────────────────────────────────────────────────────────────

// Attempt to start a single pipeline.
// Returns {pipeline, bus} on success (both with new refs, caller must unref).
// On failure returns {nullptr, nullptr} and cleans up internally.
struct Trial { GstElement* pipeline; GstBus* bus; };

Trial try_pipeline(const std::string& desc) {
    post_log("시도: " + desc);

    GError* err = nullptr;
    GstElement* pl = gst_parse_launch(desc.c_str(), &err);
    if (!pl) {
        const std::string msg = err ? err->message : "파싱 오류";
        if (err) g_error_free(err);
        post_log("  → 파싱 실패: " + msg);
        return {nullptr, nullptr};
    }

    const GstStateChangeReturn ret = gst_element_set_state(pl, GST_STATE_PLAYING);
    if (ret == GST_STATE_CHANGE_FAILURE) {
        post_log("  → PLAYING 전환 실패");
        gst_element_set_state(pl, GST_STATE_NULL);
        gst_object_unref(pl);
        return {nullptr, nullptr};
    }

    GstBus* bus = gst_element_get_bus(pl);

    // Wait for the async state change to complete (live sources are always async).
    if (ret == GST_STATE_CHANGE_ASYNC) {
        GstMessage* m = gst_bus_timed_pop_filtered(bus, 8 * GST_SECOND,
            static_cast<GstMessageType>(GST_MESSAGE_ERROR | GST_MESSAGE_ASYNC_DONE));
        if (!m) {
            post_log("  → 상태 전환 타임아웃");
            gst_object_unref(bus);
            gst_element_set_state(pl, GST_STATE_NULL);
            gst_object_unref(pl);
            return {nullptr, nullptr};
        }
        if (GST_MESSAGE_TYPE(m) == GST_MESSAGE_ERROR) {
            GError* gerr = nullptr;
            gst_message_parse_error(m, &gerr, nullptr);
            std::string emsg = gerr ? gerr->message : "알 수 없음";
            if (gerr) g_error_free(gerr);
            gst_message_unref(m);
            post_log("  → 시작 오류: " + emsg);
            gst_object_unref(bus);
            gst_element_set_state(pl, GST_STATE_NULL);
            gst_object_unref(pl);
            return {nullptr, nullptr};
        }
        gst_message_unref(m);  // ASYNC_DONE
    }

    // Check for immediate streaming errors (e.g., "not-linked").
    // These appear within milliseconds; 1 second is more than enough.
    GstMessage* early = gst_bus_timed_pop_filtered(bus, GST_SECOND,
        static_cast<GstMessageType>(GST_MESSAGE_ERROR));
    if (early) {
        GError* gerr = nullptr;
        gst_message_parse_error(early, &gerr, nullptr);
        std::string emsg = gerr ? gerr->message : "알 수 없음";
        if (gerr) g_error_free(gerr);
        gst_message_unref(early);
        post_log("  → 스트리밍 오류: " + emsg);
        gst_object_unref(bus);
        gst_element_set_state(pl, GST_STATE_NULL);
        gst_object_unref(pl);
        return {nullptr, nullptr};
    }

    post_log("  → 파이프라인 정상 시작");
    return {pl, bus};
}

// ── Worker thread ─────────────────────────────────────────────────────────────

void worker_fn(RecorderOptions opts,
               std::function<void()> on_started,
               std::function<void(bool, const std::string&)> on_stopped) {
    gst_init_once();

    int pw_fd = -1;
    std::uint32_t node_id = 0;
    std::uint64_t pw_serial = 0;
    bool has_pw_serial = false;
    bool use_portal = false;

    if (opts.source == CaptureSource::FullDesktop && capture_is_wayland()) {
        PortalStream stream{};
        post_log("Wayland 감지 — Portal 화면 공유 대화상자 표시 중...");
        if (capture_portal_acquire(opts.portal_parent_window,
                                   [](const std::string& m) { post_log(m); },
                                   &stream)) {
            pw_fd       = stream.pw_fd;
            node_id     = stream.node_id;
            pw_serial   = stream.pw_serial;
            has_pw_serial = stream.has_pw_serial;
            use_portal  = true;
        } else {
            post_log("Portal 획득 실패 — X11 ximagesrc 로 fallback 합니다.");
        }
    }

    // Build ordered candidate list
    std::vector<std::string> candidates;
    if (use_portal) {
        candidates = portal_candidates(opts, pw_fd, node_id, pw_serial, has_pw_serial);
    } else {
        candidates.push_back(x11_pipeline(opts));
    }

    // Try candidates in order until one works
    Trial t = {nullptr, nullptr};
    for (const auto& desc : candidates) {
        t = try_pipeline(desc);
        if (t.pipeline) break;
    }

    if (!t.pipeline) {
        const std::string msg = "모든 파이프라인 후보 시도 실패.\n"
                                "make deps 로 필요한 패키지를 설치했는지 확인하세요.";
        post_log(msg);
        if (pw_fd >= 0) close(pw_fd);
        capture_portal_close_session();
        post_to_main([on_stopped, msg]() { on_stopped(false, msg); });
        return;
    }

    GstElement* pipeline = t.pipeline;
    GstBus*     bus      = t.bus;

    {
        std::lock_guard<std::mutex> lk(g_pipeline_mtx);
        g_pipeline = pipeline;
    }

    g_start_time = std::chrono::steady_clock::now();
    g_recording.store(true);
    post_log("녹화 시작: " + opts.output_path);
    post_to_main(std::move(on_started));

    // Monitor bus until EOS or error.  recorder_stop() sends EOS to unblock.
    std::string bus_error_msg;
    bool success = true;

    while (true) {
        GstMessage* msg = gst_bus_timed_pop_filtered(
            bus, GST_CLOCK_TIME_NONE,
            static_cast<GstMessageType>(GST_MESSAGE_EOS | GST_MESSAGE_ERROR));
        if (!msg) continue;

        if (GST_MESSAGE_TYPE(msg) == GST_MESSAGE_EOS) {
            post_log("EOS 수신 — 파일 마무리 중...");
            gst_message_unref(msg);
            break;
        }
        if (GST_MESSAGE_TYPE(msg) == GST_MESSAGE_ERROR) {
            GError* gerr = nullptr;
            gchar*  dbg  = nullptr;
            gst_message_parse_error(msg, &gerr, &dbg);
            if (gerr) {
                bus_error_msg = gerr->message;
                if (dbg) bus_error_msg += "\n[debug] " + std::string(dbg);
                post_log("파이프라인 오류: " + bus_error_msg);
                g_error_free(gerr);
            }
            g_free(dbg);
            gst_message_unref(msg);
            success = false;
            break;
        }
        gst_message_unref(msg);
    }

    gst_object_unref(bus);
    gst_element_set_state(pipeline, GST_STATE_NULL);
    {
        std::lock_guard<std::mutex> lk(g_pipeline_mtx);
        gst_object_unref(pipeline);
        g_pipeline = nullptr;
    }
    g_recording.store(false);

    if (pw_fd >= 0) close(pw_fd);
    capture_portal_close_session();

    const std::string result = success ? opts.output_path : bus_error_msg;
    post_to_main([on_stopped, success, result]() {
        on_stopped(success, result);
    });
}

}  // namespace

// ── Public API ────────────────────────────────────────────────────────────────

bool recorder_start(RecorderOptions opts,
                    RecorderLogFn on_log,
                    std::function<void()> on_started,
                    std::function<void(bool, const std::string&)> on_stopped) {
    if (g_recording.load()) return false;
    g_on_log = std::move(on_log);

    std::thread([opts       = std::move(opts),
                 on_started = std::move(on_started),
                 on_stopped = std::move(on_stopped)]() mutable {
        worker_fn(std::move(opts), std::move(on_started), std::move(on_stopped));
    }).detach();

    return true;
}

void recorder_stop() {
    GstElement* p = nullptr;
    {
        std::lock_guard<std::mutex> lk(g_pipeline_mtx);
        p = g_pipeline;
    }
    if (p) gst_element_send_event(p, gst_event_new_eos());
}

bool recorder_is_recording() { return g_recording.load(); }

std::uint64_t recorder_elapsed_seconds() {
    if (!g_recording.load()) return 0;
    return static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::steady_clock::now() - g_start_time).count());
}
