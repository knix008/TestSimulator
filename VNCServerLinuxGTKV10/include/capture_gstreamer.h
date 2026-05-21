#pragma once

#include <functional>
#include <string>

using CaptureStatusFn = std::function<void(const std::string& message)>;

void capture_gstreamer_set_parent_window(const char* parent_window);
bool capture_gstreamer_init_desktop(int width, int height, CaptureStatusFn on_status);
void capture_gstreamer_shutdown();
bool capture_gstreamer_frame(char* framebuffer, int width, int height);
const char* capture_gstreamer_backend_name();
bool capture_gstreamer_is_active();
bool capture_gstreamer_is_portal();
