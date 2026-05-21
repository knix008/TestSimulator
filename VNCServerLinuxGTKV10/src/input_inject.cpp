#include "input_inject.h"

#include <X11/keysym.h>

#include <linux/input.h>
#include <linux/uinput.h>

#include <algorithm>
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <string>
#include <unistd.h>

#include <sys/ioctl.h>
#include <sys/time.h>

namespace {

int g_mouse_fd = -1;
int g_kbd_fd = -1;
Display* g_display = nullptr;
int g_screen_w = 0;
int g_screen_h = 0;
int g_last_button_mask = 0;

bool emit_event(int fd, int type, int code, int value) {
    if (fd < 0) {
        return false;
    }
    input_event ev{};
    gettimeofday(&ev.time, nullptr);
    ev.type = static_cast<__u16>(type);
    ev.code = static_cast<__u16>(code);
    ev.value = value;
    return write(fd, &ev, sizeof(ev)) == static_cast<ssize_t>(sizeof(ev));
}

void emit_sync(int fd) {
    emit_event(fd, EV_SYN, SYN_REPORT, 0);
}

bool setup_abs_axis(int fd, int code, int min_val, int max_val) {
    if (fd < 0) {
        return false;
    }
    if (ioctl(fd, UI_SET_EVBIT, EV_ABS) < 0) {
        return false;
    }
    if (ioctl(fd, UI_SET_ABSBIT, code) < 0) {
        return false;
    }
    uinput_abs_setup setup{};
    setup.code = static_cast<__u16>(code);
    setup.absinfo.minimum = min_val;
    setup.absinfo.maximum = max_val;
    setup.absinfo.fuzz = 0;
    setup.absinfo.flat = 0;
    setup.absinfo.resolution = 0;
    return ioctl(fd, UI_ABS_SETUP, &setup) >= 0;
}

bool enable_key(int fd, int code) {
    if (ioctl(fd, UI_SET_EVBIT, EV_KEY) < 0) {
        return false;
    }
    return ioctl(fd, UI_SET_KEYBIT, code) >= 0;
}

bool enable_rel(int fd, int code) {
    if (ioctl(fd, UI_SET_EVBIT, EV_REL) < 0) {
        return false;
    }
    return ioctl(fd, UI_SET_RELBIT, code) >= 0;
}

bool create_device(int fd, const char* name) {
    uinput_setup setup{};
    std::snprintf(setup.name, UINPUT_MAX_NAME_SIZE, "%s", name);
    setup.id.bustype = BUS_USB;
    setup.id.vendor = 0x1234;
    setup.id.product = 0x5678;
    setup.id.version = 1;
    if (ioctl(fd, UI_DEV_SETUP, &setup) < 0) {
        return false;
    }
    return ioctl(fd, UI_DEV_CREATE) >= 0;
}

bool open_mouse_device() {
    g_mouse_fd = open("/dev/uinput", O_WRONLY | O_CLOEXEC);
    if (g_mouse_fd < 0) {
        return false;
    }

    const int buttons[] = {BTN_LEFT, BTN_RIGHT, BTN_MIDDLE, BTN_SIDE, BTN_EXTRA};
    for (int btn : buttons) {
        if (!enable_key(g_mouse_fd, btn)) {
            return false;
        }
    }
    if (!setup_abs_axis(g_mouse_fd, ABS_X, 0, std::max(0, g_screen_w - 1))) {
        return false;
    }
    if (!setup_abs_axis(g_mouse_fd, ABS_Y, 0, std::max(0, g_screen_h - 1))) {
        return false;
    }
    if (!enable_rel(g_mouse_fd, REL_WHEEL)) {
        return false;
    }

    return create_device(g_mouse_fd, "VNC Server virtual pointer");
}

bool open_keyboard_device() {
    g_kbd_fd = open("/dev/uinput", O_WRONLY | O_CLOEXEC);
    if (g_kbd_fd < 0) {
        return false;
    }

    if (ioctl(g_kbd_fd, UI_SET_EVBIT, EV_KEY) < 0) {
        return false;
    }
    for (int code = 0; code < KEY_MAX; ++code) {
        ioctl(g_kbd_fd, UI_SET_KEYBIT, code);
    }

    return create_device(g_kbd_fd, "VNC Server virtual keyboard");
}

void close_fd(int& fd) {
    if (fd >= 0) {
        ioctl(fd, UI_DEV_DESTROY);
        close(fd);
        fd = -1;
    }
}

int keysym_to_evdev(uint32_t keysym) {
    if (!g_display) {
        return -1;
    }
    const KeyCode xcode = XKeysymToKeycode(g_display, static_cast<KeySym>(keysym));
    if (xcode == 0) {
        return -1;
    }
    const int evdev = static_cast<int>(xcode) - 8;
    if (evdev < 0 || evdev >= KEY_MAX) {
        return -1;
    }
    return evdev;
}

}  // namespace

bool input_inject_init(Display* display, int screen_width, int screen_height,
                       std::string* backend_name_out) {
    input_inject_shutdown();

    if (!display || screen_width <= 0 || screen_height <= 0) {
        return false;
    }

    g_display = display;
    g_screen_w = screen_width;
    g_screen_h = screen_height;
    g_last_button_mask = 0;

    if (!open_mouse_device()) {
        input_inject_shutdown();
        return false;
    }

    if (!open_keyboard_device()) {
        input_inject_shutdown();
        return false;
    }

    if (backend_name_out) {
        *backend_name_out = "uinput";
    }
    return true;
}

void input_inject_shutdown() {
    close_fd(g_mouse_fd);
    close_fd(g_kbd_fd);
    g_display = nullptr;
    g_screen_w = 0;
    g_screen_h = 0;
    g_last_button_mask = 0;
}

bool input_inject_is_active() {
    return g_mouse_fd >= 0 && g_kbd_fd >= 0;
}

void input_inject_pointer_root(int root_x, int root_y, int button_mask) {
    if (g_mouse_fd < 0) {
        return;
    }

    const int x = std::clamp(root_x, 0, std::max(0, g_screen_w - 1));
    const int y = std::clamp(root_y, 0, std::max(0, g_screen_h - 1));

    emit_event(g_mouse_fd, EV_ABS, ABS_X, x);
    emit_event(g_mouse_fd, EV_ABS, ABS_Y, y);

    struct BtnMap {
        int rfb_mask;
        int evdev_btn;
    };
    static const BtnMap kBtns[] = {
        {1, BTN_LEFT},
        {2, BTN_MIDDLE},
        {4, BTN_RIGHT},
    };

    for (const BtnMap& btn : kBtns) {
        const bool down = (button_mask & btn.rfb_mask) != 0;
        const bool was = (g_last_button_mask & btn.rfb_mask) != 0;
        if (down != was) {
            emit_event(g_mouse_fd, EV_KEY, btn.evdev_btn, down ? 1 : 0);
        }
    }

    const int scroll_press = (button_mask & ~g_last_button_mask) & (8 | 16);
    if (scroll_press & 8) {
        emit_event(g_mouse_fd, EV_REL, REL_WHEEL, 1);
    }
    if (scroll_press & 16) {
        emit_event(g_mouse_fd, EV_REL, REL_WHEEL, -1);
    }

    g_last_button_mask = button_mask;
    emit_sync(g_mouse_fd);
}

void input_inject_key(uint32_t keysym, bool down) {
    if (g_kbd_fd < 0) {
        return;
    }

    const int code = keysym_to_evdev(keysym);
    if (code < 0) {
        return;
    }

    emit_event(g_kbd_fd, EV_KEY, code, down ? 1 : 0);
    emit_sync(g_kbd_fd);
}
