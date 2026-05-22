#pragma once
#include <cstdint>
#include <functional>
#include <string>

using CaptureStatusFn = std::function<void(const std::string&)>;

struct PortalStream {
    int pw_fd = -1;
    std::uint32_t node_id = 0;
    std::uint64_t pw_serial = 0;
    bool has_pw_serial = false;
};

// Acquire a PipeWire FD via XDG Desktop Portal ScreenCast.
// Blocks until the user completes the Portal dialog — call from a worker thread.
// Returns true on success; out->pw_fd is owned by the caller (must close it).
bool capture_portal_acquire(const std::string& parent_window_hint,
                            CaptureStatusFn on_status, PortalStream* out);

// Close the active Portal session (call after recording stops).
void capture_portal_close_session();

bool capture_is_wayland();
