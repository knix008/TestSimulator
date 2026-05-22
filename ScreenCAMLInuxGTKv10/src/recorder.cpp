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
#include <condition_variable>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

std::atomic<bool> g_recording{false};
std::atomic<bool> g_portal_setup_active{false};
std::mutex        g_pipeline_mtx;
GstElement*       g_pipeline = nullptr;
std::chrono::steady_clock::time_point g_start_time;
RecorderLogFn     g_on_log;
std::function<void()> g_prepare_capture;
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

void run_on_main_sync(std::function<void()> fn) {
    if (g_main_context_is_owner(g_main_context_default())) {
        fn();
        return;
    }
    struct SyncState {
        std::mutex              mtx;
        std::condition_variable cv;
        bool                    done = false;
    };
    auto state = std::make_shared<SyncState>();
    post_to_main([state, fn = std::move(fn)]() {
        fn();
        std::lock_guard<std::mutex> lk(state->mtx);
        state->done = true;
        state->cv.notify_one();
    });
    std::unique_lock<std::mutex> lk(state->mtx);
    state->cv.wait(lk, [&] { return state->done; });
}

bool is_portal_stream_revoked_error(const std::string& msg) {
    return msg.find("target not found") != std::string::npos ||
           msg.find("target-not-found") != std::string::npos;
}

bool recording_file_has_data(const std::string& path) {
    struct stat st {};
    return stat(path.c_str(), &st) == 0 && st.st_size > 0;
}

bool is_fatal_pipewire_error(const std::string& msg) {
    return msg.find("target") != std::string::npos ||
           msg.find("not found") != std::string::npos ||
           msg.find("not-linked") != std::string::npos ||
           msg.find("Failed to connect") != std::string::npos ||
           msg.find("streaming stopped") != std::string::npos ||
           msg.find("Internal data stream error") != std::string::npos;
}

thread_local std::string g_last_try_error;

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
// Frequent keyframes (key-int-max ≈ fps) so the muxer can flush clusters while recording.
std::string encoder_chain(const RecorderOptions& opts) {
    const int gop = std::max(1, opts.fps);
    const std::string keyint = " key-int-max=" + std::to_string(gop);
    const std::string enc = (opts.codec == VideoCodec::H265)
        ? "x265enc speed-preset=ultrafast tune=zerolatency bitrate=" + std::to_string(opts.bitrate_kbps)
          + keyint
        : "x264enc speed-preset=ultrafast tune=zerolatency bitrate=" + std::to_string(opts.bitrate_kbps)
          + keyint + " bframes=0";
    const std::string parse = (opts.codec == VideoCodec::H265)
        ? "h265parse config-interval=1"
        : "h264parse config-interval=1";
    return " ! videoconvert ! video/x-raw,format=I420 ! " + enc + " ! " + parse;
}

// Muxer tuned for live capture (write during recording, not only at EOS).
std::string mux_element(const RecorderOptions& opts) {
    if (opts.format == OutputFormat::MKV)
        return "matroskamux streamable=true";
    // Fragmented MP4 (~1s moof) while recording.
    return "mp4mux fragment-duration=1000";
}

std::string file_sink_element(const RecorderOptions& opts) {
    return "filesink location=\"" + escape_path(opts.output_path)
         + "\" sync=false async=false";
}

// Shared tail: encode → mux → filesink
std::string encode_mux_sink(const RecorderOptions& opts) {
    return encoder_chain(opts) + " ! " + mux_element(opts) + " ! " + file_sink_element(opts);
}

// PipeWire portal source — automatic-eos=false keeps recording until recorder_stop().
std::string pipewire_src(const std::string& props) {
    return "pipewiresrc automatic-eos=false do-timestamp=true always-copy=true "
           "keepalive-time=2000 " + props;
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
    // videorate can stall on live PipeWire timestamps — use capsfilter only.
    return " ! videoscale ! capsfilter caps=\"" + caps + "\"";
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

    const std::string queue = " ! videoconvert ! video/x-raw,format=I420"
                              " ! queue max-size-buffers=16 leaky=downstream";
    const std::string queue_bgrx = " ! videoconvert ! video/x-raw,format=BGRx"
                                   " ! queue max-size-buffers=16 leaky=downstream";

    // VNCServer order: path+autoconnect=true first; one FD — reconnect kills the stream.
    std::vector<std::string> srcs;
    srcs.push_back(pipewire_src("fd=__PW_FD__ path=" + path + " autoconnect=true"));
    srcs.push_back(pipewire_src("fd=__PW_FD__ path=" + path + " autoconnect=false"));
    if (has_pw_serial) {
        srcs.push_back(pipewire_src("fd=__PW_FD__ target-object=" + std::to_string(pw_serial)
                                   + " autoconnect=true"));
        srcs.push_back(pipewire_src("fd=__PW_FD__ target-object=" + std::to_string(pw_serial)
                                   + " autoconnect=false"));
    }

    std::vector<std::string> chains = {queue + ems, queue_bgrx + ems};
    if (opts.output_width > 0 && opts.output_height > 0)
        chains.push_back(queue + rsc_nofps + ems);

    std::vector<std::string> candidates;
    for (const auto& src : srcs) {
        for (const auto& chain : chains)
            candidates.push_back(src + chain);
    }

    if (opts.enable_audio) {
        const std::string mux_elem  = mux_element(opts);
        const std::string file_sink = file_sink_element(opts);
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
    const std::string mux_elem  = mux_element(opts);
    const std::string file_sink = file_sink_element(opts);
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
        g_last_try_error = emsg;
        post_log("  → 첫 프레임 대기 중 오류: " + emsg);
        clear_first_buffer_probe(&probe);
        return false;
    }

    ok = probe.seen;
    clear_first_buffer_probe(&probe);
    if (!ok) {
        g_last_try_error = "첫 프레임 타임아웃";
        post_log("  → 첫 프레임 타임아웃 (PipeWire 스트림에 데이터 없음)");
    }
    return ok;
}

// Attempt to start a single pipeline.
// Returns {pipeline, bus} on success (both with new refs, caller must unref).
// On failure returns {nullptr, nullptr} and cleans up internally.
struct Trial { GstElement* pipeline; GstBus* bus; };

Trial try_pipeline(const std::string& desc, bool require_video_flow) {
    g_last_try_error.clear();
    post_log("시도: " + desc);

    GError* err = nullptr;
    GstElement* pl = gst_parse_launch(desc.c_str(), &err);
    if (!pl) {
        const std::string msg = err ? err->message : "파싱 오류";
        if (err) g_error_free(err);
        g_last_try_error = msg;
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
                g_last_try_error = emsg;
                post_log("  → PLAYING 전환 실패: " + emsg);
            } else {
                g_last_try_error = "PLAYING 전환 실패";
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
            g_last_try_error = emsg;
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
        g_last_try_error = emsg;
        post_log("  → 스트리밍 오류: " + emsg);
        gst_object_unref(bus);
        gst_element_set_state(pl, GST_STATE_NULL);
        gst_object_unref(pl);
        return {nullptr, nullptr};
    }

    if (require_video_flow && !wait_for_first_buffer(pl, bus, 5000)) {
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

    if (capture_is_wayland()) {
        PortalStream stream{};
        post_log("Wayland — Portal 화면 공유 대화상자를 표시합니다 (설정 창은 보이는 상태).");
        const bool monitor_only = (opts.source != CaptureSource::Window);
        g_portal_setup_active.store(true, std::memory_order_release);
        const bool portal_ok = capture_portal_acquire(
                opts.portal_parent_window,
                [](const std::string& m) { post_log(m); },
                &stream, monitor_only);
        g_portal_setup_active.store(false, std::memory_order_release);
        if (portal_ok) {
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

    // Portal: reuse one FD for all attempts (closing FDs between tries breaks the stream).
    Trial t = {nullptr, nullptr};
    int connect_fd = pw_fd;
    if (use_portal && pw_fd >= 0) {
        connect_fd = dup(pw_fd);
        if (connect_fd < 0) {
            post_log("Portal FD dup 실패");
            close(pw_fd);
            capture_portal_close_session();
            post_to_main([on_stopped]() {
                on_stopped(false, "Portal PipeWire FD 복제 실패");
            });
            return;
        }
    }
    if (use_portal) {
        post_log("화면 공유 선택 완료 — 설정 창을 숨기고 PipeWire에 연결합니다...");
        run_on_main_sync([]() {
            if (g_prepare_capture) g_prepare_capture();
        });
        std::this_thread::sleep_for(std::chrono::milliseconds(400));
    }

    constexpr std::size_t kMaxPortalTrials = 8;
    const std::size_t n_try = use_portal
        ? std::min(candidate_templates.size(), kMaxPortalTrials)
        : candidate_templates.size();
    for (std::size_t i = 0; i < n_try; ++i) {
        const auto& templ = candidate_templates[i];
        if (use_portal)
            post_log("파이프라인 연결 " + std::to_string(i + 1) + "/" + std::to_string(n_try));
        const std::string desc = use_portal ? with_pw_fd(templ, connect_fd) : templ;
        t = try_pipeline(desc, use_portal);
        if (t.pipeline) break;
        if (use_portal && is_fatal_pipewire_error(g_last_try_error)) {
            post_log("  → PipeWire 스트림 오류 — 남은 후보 생략");
            break;
        }
    }
    if (pw_fd >= 0) close(pw_fd);
    pw_fd = (t.pipeline && connect_fd >= 0) ? connect_fd : -1;
    if (!t.pipeline && connect_fd >= 0) close(connect_fd);

    if (!t.pipeline) {
        std::string msg = "모든 파이프라인 후보 시도 실패.";
        if (!g_last_try_error.empty())
            msg += "\n마지막 오류: " + g_last_try_error;
        msg += "\n\n확인: make deps · 코덱 H.264로 변경 · 로그의 \"시도:\" 줄";
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
    post_log("  파일에 주기적으로 기록 중 (MKV: cluster / MP4: fragment, 중지 시 마무리)");
    post_to_main(std::move(on_started));

    // Monitor bus until EOS or error.  recorder_stop() sends EOS to unblock.
    std::string bus_error_msg;
    bool success = true;
    auto last_size_log = std::chrono::steady_clock::now();

    while (true) {
        GstMessage* msg = gst_bus_timed_pop_filtered(
            bus, 500 * GST_MSECOND,
            static_cast<GstMessageType>(GST_MESSAGE_EOS | GST_MESSAGE_ERROR));

        if (msg) {
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
                    g_error_free(gerr);
                }
                g_free(dbg);
                gst_message_unref(msg);
                // Portal ends the cast when the app window is shown; file may still be valid.
                if (is_portal_stream_revoked_error(bus_error_msg) &&
                    recording_file_has_data(opts.output_path)) {
                    post_log("화면 공유 스트림 종료 (target not found) — 기록된 파일 사용");
                    success = true;
                    break;
                }
                post_log("파이프라인 오류: " + bus_error_msg);
                success = false;
                break;
            }
            gst_message_unref(msg);
        }

        const auto now = std::chrono::steady_clock::now();
        if (now - last_size_log >= std::chrono::seconds(3)) {
            last_size_log = now;
            struct stat st {};
            if (stat(opts.output_path.c_str(), &st) == 0) {
                post_log("파일 크기: " + std::to_string(st.st_size) + " 바이트");
                if (st.st_size == 0 &&
                    std::chrono::steady_clock::now() - g_start_time >= std::chrono::seconds(5)) {
                    post_log("  → 경고: 5초 이상 0 바이트 — PipeWire 스트림/인코더를 확인하세요.");
                }
            }
        }
    }

    gst_object_unref(bus);
    gst_element_set_state(pipeline, GST_STATE_PAUSED);
    gst_element_get_state(pipeline, nullptr, nullptr, 3 * GST_SECOND);
    gst_element_set_state(pipeline, GST_STATE_NULL);
    gst_element_get_state(pipeline, nullptr, nullptr, 3 * GST_SECOND);
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

void recorder_set_prepare_capture(std::function<void()> fn) {
    g_prepare_capture = std::move(fn);
}

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

bool recorder_portal_setup_active() {
    return g_portal_setup_active.load(std::memory_order_acquire);
}

std::uint64_t recorder_elapsed_seconds() {
    if (!g_recording.load()) return 0;
    return static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::steady_clock::now() - g_start_time).count());
}
