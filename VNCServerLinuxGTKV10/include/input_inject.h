#pragma once

#include <X11/Xlib.h>
#include <cstdint>
#include <string>

// Virtual mouse/keyboard via /dev/uinput (works on Wayland and X11).
bool input_inject_init(Display* display, int screen_width, int screen_height,
                       std::string* backend_name_out);
void input_inject_shutdown();
bool input_inject_is_active();

void input_inject_pointer_root(int root_x, int root_y, int button_mask);
void input_inject_key(uint32_t keysym, bool down);
