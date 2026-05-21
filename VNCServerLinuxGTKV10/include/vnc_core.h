#pragma once

#include <cstdint>
#include <functional>
#include <string>

enum class VncCaptureMode {
    FullDesktop,
    SingleWindow,
};

struct VncServerOptions {
    int port = 5900;
    std::string password;
    bool allow_input = true;
    VncCaptureMode capture_mode = VncCaptureMode::FullDesktop;
    std::uint64_t target_window = 0;
    // VNC framebuffer size as % of native capture size (10–100).
    int capture_scale_percent = 100;
};

using VncStatusCallback = std::function<void(const std::string& message)>;
using VncClientCountCallback = std::function<void(int count)>;

bool vnc_server_start(const VncServerOptions& options,
                      VncStatusCallback on_status,
                      VncClientCountCallback on_clients);

void vnc_server_stop();
bool vnc_server_is_running();
int vnc_server_client_count();
