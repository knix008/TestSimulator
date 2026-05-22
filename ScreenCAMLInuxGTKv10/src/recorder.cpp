#include "recorder.h"
#include "capture.h"

#include <gst/gst.h>
#include <fcntl.h>
#include <sys/stat.h>
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

// Encoder input: x264/x265 need YUV (I420); BGRx from Portal cannot link directly.
std::string encoder_chain(const RecorderOptions& opts) {
    const std::string enc = (opts.codec == VideoCodec::H265)
        ? "x265enc speed-preset=ultrafast tune=zerolatency bitrate=" + std::to_string(opts.bitrate_kbps)
        : "x264enc speed-preset=ultrafast tune=zerolatency bitrate=" + std::to_string(opts.bitrate_kbps);
    const std::string parse = (opts.codec == VideoCodec::H265)
        ? "h265parse config-interval=1"
        : "h264parse config-interval=1";
    return " ! videoconvert ! video/x-raw,format=I420 ! " + enc + " ! " + parse;
}

// Shared tail: encode → mux → filesink (live / streamable for PipeWire).
std::string encode_mux_sink(const RecorderOptions& opts) {
    const std::string mux = (opts.format == OutputFormat::MKV)
        ? "matroskamux streamable=true"
        : "mp4mux streamable=true";
    return encoder_chain(opts) + " ! " + mux
         + " ! filesink location=\"" + escape_path(opts.output_path)
         + "\" sync=false async=false";
}

// PipeWire portal source — automatic-eos=false keeps recording until recorder_stop().
std::string pipewire_src(const std::string& props) {
    return "pipewiresrc automatic-eos=false do-timestamp=true always-copy=true " + props;
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

// Substitute the PipeWire FD into a template produced by portal_candidate_templates().
std::string with_pw_fd(const std::string& templ, int pw_fd) {
    std::string out = templ;
    const std::string token = "__PW_FD__";
    for (std::size_t pos = 0; (pos = out.find(token, pos)) != std::string::npos; ) {
        out.replace(pos, token.size(), std::to_string(pw_fd));
        pos += std::to_string(pw_fd).size();
    }
    return out;
}

// Build pipeline templates for Portal/PipeWire (FD placeholder __PW_FD__).
// Video-only candidates are tried first; audio mux variants come last.
std::vector<std::string> portal_candidate_templates(
        const RecorderOptions& opts,
        std::uint32_t node_id,
        std::uint64_t pw_serial, bool has_pw_serial) {

    const std::string path = std::to_string(node_id);
    const std::string ems  = encode_mux_sink(opts);
    const std::string rsc  = rate_scale_caps(opts, /*with_fps=*/true);
    const std::string rsc_nofps = rate_scale_caps(opts, /*with_fps=*/false);

    // Post-source chains (lenient → strict). Portal streams often reject forced fps.
    const std::vector<std::string> video_chains = {
        // 1. I420 native rate (best match for x264/x265)
        " ! videoconvert ! video/x-raw,format=I420 ! queue max-size-buffers=8" + ems,
        // 2. BGRx from Portal → encoder_chain converts to I420
        " ! videoconvert ! video/x-raw,format=BGRx ! queue max-size-buffers=8" + ems,
        // 3. BGRx + optional scale/fps
        " ! videoconvert ! video/x-raw,format=BGRx ! queue max-size-buffers=8" + rsc + ems,
        // 4. Negotiated format + fps
        " ! videoconvert ! queue max-size-buffers=8" + rsc + ems,
        // 5. I420 + forced fps
        " ! videoconvert ! video/x-raw,format=I420 ! queue max-size-buffers=8" + rsc + ems,
    };

    // Prefer PipeWire serial (target-object) over node id (path) — node ids can be reused.
    std::vector<std::string> srcs;
    if (has_pw_serial) {
        srcs.push_back(pipewire_src("fd=__PW_FD__ target-object=" + std::to_string(pw_serial)
                                   + " autoconnect=true"));
        srcs.push_back(pipewire_src("fd=__PW_FD__ target-object=" + std::to_string(pw_serial)
                                   + " autoconnect=false"));
    }
    srcs.push_back(pipewire_src("fd=__PW_FD__ path=" + path + " autoconnect=true"));
    srcs.push_back(pipewire_src("fd=__PW_FD__ path=" + path + " autoconnect=false"));
    srcs.push_back(pipewire_src("fd=__PW_FD__ autoconnect=true"));

    std::vector<std::string> candidates;
    for (const auto& chain : video_chains) {
        for (const auto& src : srcs) {
            if (src.empty()) continue;
            candidates.push_back(src + chain);
        }
    }

    if (opts.enable_audio) {
        const std::string mux_elem = (opts.format == OutputFormat::MKV)
            ? "matroskamux streamable=true" : "mp4mux streamable=true";
        const std::string file_sink = "filesink location=\"" + escape_path(opts.output_path)
                                    + "\" sync=false async=false";
        const std::string rsc_local = rate_scale_caps(opts, /*with_fps=*/true);
        const std::string enc = encoder_chain(opts);

        const std::vector<std::string> mux_intermediates = {
            " ! videoconvert ! video/x-raw,format=I420 ! queue max-size-buffers=8",
            " ! videoconvert ! video/x-raw,format=BGRx ! queue max-size-buffers=8",
            " ! videoconvert ! video/x-raw,format=BGRx ! queue max-size-buffers=8" + rsc_nofps,
        };

        for (const auto& intermediate : mux_intermediates) {
            for (const auto& src : srcs) {
                if (src.empty()) continue;
                const std::string vbranch = src + intermediate + enc + " ! queue";
                candidates.push_back(mux_elem + " name=mux ! " + file_sink
                                     + "  " + vbranch + " ! mux."
                                     + "  " + audio_chain(opts) + " ! mux.");
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
    const std::string mux_elem  = (opts.format == OutputFormat::MKV)
        ? "matroskamux streamable=true" : "mp4mux streamable=true";
    const std::string file_sink = "filesink location=\"" + escape_path(opts.output_path)
                                  + "\" sync=false async=false";
    const std::string enc = encoder_chain(opts);
    const std::string video_branch = src
        + " ! videoconvert ! video/x-raw,format=I420 ! queue max-size-buffers=8"
        + rsc + enc + " ! queue";
    return mux_elem + " name=mux ! " + file_sink
         + "  " + video_branch      + " ! mux."
         + "  " + audio_chain(opts) + " ! mux.";
}

// ── Pipeline trial ────────────────────────────────────────────────────────────

struct FirstBufferProbe {
    bool           seen     = false;
    gulong         probe_id = 0;
    GstPad*        pad      = nullptr;
};

GstPadProbeReturn on_first_buffer_probe(GstPad*, GstPadProbeInfo* info, gpointer user) {
    auto* state = static_cast<FirstBufferProbe*>(user);
    if (GST_PAD_PROBE_INFO_TYPE(info) & GST_PAD_PROBE_TYPE_BUFFER) {
        state->seen = true;
        state->probe_id = 0;  // GST_PAD_PROBE_REMOVE already detached the probe
        return GST_PAD_PROBE_REMOVE;
    }
    return GST_PAD_PROBE_OK;
}

void clear_first_buffer_probe(FirstBufferProbe* state) {
    if (!state || !state->pad) return;
    if (state->probe_id != 0)
        gst_pad_remove_probe(state->pad, state->probe_id);
    gst_object_unref(state->pad);
    state->pad = nullptr;
    state->probe_id = 0;
}

bool attach_first_buffer_probe(GstElement* pipeline, FirstBufferProbe* state) {
    if (!pipeline || !state) return false;
    GstIterator* it = gst_bin_iterate_sources(GST_BIN(pipeline));
    if (!it) return false;

    bool attached = false;
    GValue item = G_VALUE_INIT;
    while (gst_iterator_next(it, &item) == GST_ITERATOR_OK) {
        auto* el = GST_ELEMENT(g_value_get_object(&item));
        GstPad* pad = gst_element_get_static_pad(el, "src");
        g_value_unset(&item);
        if (!pad) continue;
        state->pad = pad;
        state->probe_id = gst_pad_add_probe(pad, GST_PAD_PROBE_TYPE_BUFFER,
                                            on_first_buffer_probe, state, nullptr);
        attached = true;
        break;
    }
    gst_iterator_free(it);
    return attached;
}

// Wait until video flows or timeout. Fails on bus ERROR/EOS during wait.
bool wait_for_first_buffer(GstElement* pipeline, GstBus* bus, int timeout_ms) {
    FirstBufferProbe probe{};
    if (!attach_first_buffer_probe(pipeline, &probe)) {
        post_log("  → 첫 프레임 대기: 소스 패드 없음");
        return false;
    }

    const auto deadline = std::chrono::steady_clock::now()
                        + std::chrono::milliseconds(timeout_ms);
    bool ok = false;

    while (!probe.seen && std::chrono::steady_clock::now() < deadline) {
        GstMessage* m = gst_bus_timed_pop_filtered(
            bus, 200 * GST_MSECOND,
            static_cast<GstMessageType>(GST_MESSAGE_ERROR | GST_MESSAGE_EOS));
        if (!m) continue;

        if (GST_MESSAGE_TYPE(m) == GST_MESSAGE_EOS) {
            post_log("  → 조기 EOS (화면 데이터 없음 — automatic-eos 또는 스트림 종료)");
            gst_message_unref(m);
            clear_first_buffer_probe(&probe);
            return false;
        }
        GError* gerr = nullptr;
        gchar* dbg = nullptr;
        gst_message_parse_error(m, &gerr, &dbg);
        std::string emsg = gerr ? gerr->message : "알 수 없음";
        if (dbg) emsg += " [" + std::string(dbg) + "]";
        if (gerr) g_error_free(gerr);
        g_free(dbg);
        gst_message_unref(m);
        post_log("  → 첫 프레임 대기 중 오류: " + emsg);
        clear_first_buffer_probe(&probe);
        return false;
    }

    ok = probe.seen;
    clear_first_buffer_probe(&probe);
    if (!ok) post_log("  → 첫 프레임 타임아웃 (PipeWire 스트림에 데이터 없음)");
    return ok;
}

// Attempt to start a single pipeline.
// Returns {pipeline, bus} on success (both with new refs, caller must unref).
// On failure returns {nullptr, nullptr} and cleans up internally.
struct Trial { GstElement* pipeline; GstBus* bus; };

Trial try_pipeline(const std::string& desc, bool require_video_flow) {
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
        GstBus* err_bus = gst_element_get_bus(pl);
        if (err_bus) {
            GstMessage* m = gst_bus_timed_pop_filtered(err_bus, 0,
                static_cast<GstMessageType>(GST_MESSAGE_ERROR));
            if (m) {
                GError* gerr = nullptr;
                gchar* dbg = nullptr;
                gst_message_parse_error(m, &gerr, &dbg);
                std::string emsg = gerr ? gerr->message : "알 수 없음";
                if (dbg) emsg += " [" + std::string(dbg) + "]";
                if (gerr) g_error_free(gerr);
                g_free(dbg);
                gst_message_unref(m);
                post_log("  → PLAYING 전환 실패: " + emsg);
            } else {
                post_log("  → PLAYING 전환 실패");
            }
            gst_object_unref(err_bus);
        } else {
            post_log("  → PLAYING 전환 실패");
        }
        gst_element_set_state(pl, GST_STATE_NULL);
        gst_object_unref(pl);
        return {nullptr, nullptr};
    }

    GstBus* bus = gst_element_get_bus(pl);

    // Live Portal/PipeWire sources are ASYNC or NO_PREROLL (see VNCServer capture).
    if (ret == GST_STATE_CHANGE_ASYNC || ret == GST_STATE_CHANGE_NO_PREROLL) {
        GstMessage* m = gst_bus_timed_pop_filtered(bus, 12 * GST_SECOND,
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
            gchar* dbg = nullptr;
            gst_message_parse_error(m, &gerr, &dbg);
            std::string emsg = gerr ? gerr->message : "알 수 없음";
            if (dbg) emsg += " [" + std::string(dbg) + "]";
            if (gerr) g_error_free(gerr);
            g_free(dbg);
            gst_message_unref(m);
            post_log("  → 시작 오류: " + emsg);
            gst_object_unref(bus);
            gst_element_set_state(pl, GST_STATE_NULL);
            gst_object_unref(pl);
            return {nullptr, nullptr};
        }
        gst_message_unref(m);  // ASYNC_DONE
    }

    // Check for immediate streaming errors (e.g., pipewire negotiation failure).
    GstMessage* early = gst_bus_timed_pop_filtered(bus, 2 * GST_SECOND,
        static_cast<GstMessageType>(GST_MESSAGE_ERROR));
    if (early) {
        GError* gerr = nullptr;
        gchar* dbg = nullptr;
        gst_message_parse_error(early, &gerr, &dbg);
        std::string emsg = gerr ? gerr->message : "알 수 없음";
        if (dbg) emsg += " [" + std::string(dbg) + "]";
        if (gerr) g_error_free(gerr);
        g_free(dbg);
        gst_message_unref(early);
        post_log("  → 스트리밍 오류: " + emsg);
        gst_object_unref(bus);
        gst_element_set_state(pl, GST_STATE_NULL);
        gst_object_unref(pl);
        return {nullptr, nullptr};
    }

    if (require_video_flow && !wait_for_first_buffer(pl, bus, 10000)) {
        gst_object_unref(bus);
        gst_element_set_state(pl, GST_STATE_NULL);
        gst_object_unref(pl);
        return {nullptr, nullptr};
    }

    post_log("  → 파이프라인 정상 시작"
             + std::string(require_video_flow ? " (화면 데이터 수신 확인)" : ""));
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
            // Dup like VNCServer: each pipeline attempt gets its own FD copy.
            pw_fd = dup(stream.pw_fd);
            close(stream.pw_fd);
            if (pw_fd < 0) {
                post_log("Portal FD dup 실패");
                capture_portal_close_session();
                post_to_main([on_stopped]() {
                    on_stopped(false, "Portal PipeWire FD 복제 실패");
                });
                return;
            }
            node_id     = stream.node_id;
            pw_serial   = stream.pw_serial;
            has_pw_serial = stream.has_pw_serial;
            use_portal  = true;
            // Let the compositor apply hidden windows and the stream settle.
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
        } else {
            post_log("Portal 획득 실패 — X11 ximagesrc 로 fallback 합니다.");
        }
    }

    // Build ordered candidate list
    std::vector<std::string> candidate_templates;
    if (use_portal) {
        candidate_templates = portal_candidate_templates(opts, node_id, pw_serial, has_pw_serial);
    } else {
        candidate_templates.push_back(x11_pipeline(opts));
    }

    // Try candidates in order until one works (fresh dup'd FD per Portal attempt).
    Trial t = {nullptr, nullptr};
    int active_pw_fd = -1;
    for (const auto& templ : candidate_templates) {
        int trial_fd = pw_fd;
        if (use_portal) {
            trial_fd = dup(pw_fd);
            if (trial_fd < 0) {
                post_log("  → FD dup 실패, 다음 후보 시도");
                continue;
            }
        }
        const std::string desc = use_portal ? with_pw_fd(templ, trial_fd) : templ;
        t = try_pipeline(desc, use_portal);
        if (t.pipeline) {
            active_pw_fd = trial_fd;
            break;
        }
        if (use_portal && trial_fd >= 0) close(trial_fd);
    }
    if (pw_fd >= 0 && active_pw_fd != pw_fd) close(pw_fd);
    pw_fd = active_pw_fd;

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

    if (success) {
        struct stat st {};
        if (stat(opts.output_path.c_str(), &st) != 0 || st.st_size == 0) {
            success = false;
            bus_error_msg = "녹화 파일이 비어 있습니다 (0 바이트).\n"
                            "화면 공유 시 모니터를 선택했는지, 로그의 '(화면 데이터 수신 확인)' "
                            "메시지가 있었는지 확인하세요.";
            post_log(bus_error_msg);
        }
    }

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
