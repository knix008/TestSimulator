#pragma once
#include <cstdint>
#include <functional>
#include <string>

using RecorderLogFn = std::function<void(const std::string&)>;

enum class CaptureSource { FullDesktop, Window };
enum class OutputFormat  { MP4, MKV };
enum class VideoCodec    { H264, H265 };

struct RecorderOptions {
    // ── Video ────────────────────────────────────────────────────────────────
    std::string   output_path;
    int           fps              = 30;
    int           bitrate_kbps    = 4000;
    bool          show_cursor     = true;
    CaptureSource source          = CaptureSource::FullDesktop;
    std::uint64_t window_xid      = 0;
    OutputFormat  format          = OutputFormat::MKV;
    VideoCodec    codec           = VideoCodec::H265;
    int           output_width    = 0;   // 0 = native source resolution
    int           output_height   = 0;   // 0 = native source resolution
    std::string   portal_parent_window;

    // ── Audio ────────────────────────────────────────────────────────────────
    bool          enable_audio    = false;
    std::string   audio_device;          // PulseAudio source name; empty = default
    double        audio_volume    = 1.0; // 0.0 = mute, 1.0 = unity, 2.0 = +6 dB
};

// Start recording asynchronously. Returns false if already recording.
// on_started / on_stopped are invoked on the GTK main thread.
// on_stopped: success=true + message=file path on normal EOS,
//             success=false + message=error detail on pipeline failure.
bool recorder_start(RecorderOptions opts,
                    RecorderLogFn on_log,
                    std::function<void()> on_started,
                    std::function<void(bool success, const std::string& message)> on_stopped);

// Send EOS so the muxer writes its footer and finalises the file cleanly.
void recorder_stop();

bool          recorder_is_recording();
std::uint64_t recorder_elapsed_seconds();
