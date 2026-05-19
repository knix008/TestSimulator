#include "vnc_core.h"

#include <rfb/rfb.h>

#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/XShm.h>
#include <X11/extensions/XTest.h>

#include <sys/ipc.h>
#include <sys/shm.h>

#include <atomic>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>

namespace {

std::mutex g_mutex;
std::thread g_worker;
std::atomic<bool> g_running{false};
std::atomic<int> g_client_count{0};

VncStatusCallback g_on_status;
VncClientCountCallback g_on_clients;

Display* g_display = nullptr;
rfbScreenInfoPtr g_screen = nullptr;
char* g_password_list[2] = {nullptr, nullptr};
std::string g_plain_password;
bool g_allow_input = true;

struct X11CaptureState {
    Window root = 0;
    int screen = 0;
    int width = 0;
    int height = 0;
    int depth = 0;
    int bpp = 32;
    Visual* visual = nullptr;
    unsigned long red_mask = 0;
    unsigned long green_mask = 0;
    unsigned long blue_mask = 0;
    int red_max = 0;
    int green_max = 0;
    int blue_max = 0;
    bool use_shm = false;
    XImage* shm_image = nullptr;
    XShmSegmentInfo shm_info{};
    Pixmap pixmap = 0;
    GC gc = nullptr;
};

X11CaptureState g_x11;
std::string g_last_x_error;

int mask_to_shift(unsigned long mask) {
    int shift = 0;
    while (mask != 0 && (mask & 1UL) == 0) {
        mask >>= 1;
        ++shift;
    }
    return shift;
}

int mask_to_max(unsigned long mask) {
    if (mask == 0) {
        return 0;
    }
    return static_cast<int>(mask >> mask_to_shift(mask));
}

int x11_error_handler(Display* /*dpy*/, XErrorEvent* event) {
    char text[256] = {};
    XGetErrorText(g_display, event->error_code, text, sizeof(text) - 1);
    char detail[384];
    std::snprintf(detail, sizeof(detail), "X11 error %d (%s), request %d",
                  event->error_code, text, event->request_code);
    g_last_x_error = detail;
    return 0;
}

void notify_status(const std::string& msg) {
    if (g_on_status) {
        g_on_status(msg);
    }
}

void notify_clients(int count) {
    g_client_count.store(count, std::memory_order_relaxed);
    if (g_on_clients) {
        g_on_clients(count);
    }
}

void gone_client_hook(rfbClientPtr cl);

rfbNewClientAction new_client_hook(rfbClientPtr cl) {
    cl->clientGoneHook = gone_client_hook;
    const int count = ++g_client_count;
    notify_clients(count);
    notify_status(std::string("Client connected: ") + cl->host);
    return RFB_CLIENT_ACCEPT;
}

void gone_client_hook(rfbClientPtr cl) {
    const int count = --g_client_count;
    if (count < 0) {
        g_client_count.store(0, std::memory_order_relaxed);
        notify_clients(0);
    } else {
        notify_clients(count);
    }
    notify_status(std::string("Client disconnected: ") + cl->host);
}

void ptr_add_event(int buttonMask, int x, int y, rfbClientPtr /*cl*/) {
    if (!g_allow_input || !g_display) {
        return;
    }
    XTestFakeMotionEvent(g_display, g_x11.screen, x, y, CurrentTime);
    if (buttonMask & rfbButton1Mask) {
        XTestFakeButtonEvent(g_display, 1, True, CurrentTime);
    } else {
        XTestFakeButtonEvent(g_display, 1, False, CurrentTime);
    }
}

void kbd_add_event(rfbBool down, rfbKeySym key, rfbClientPtr /*cl*/) {
    if (!g_allow_input || !g_display) {
        return;
    }
    KeyCode code = XKeysymToKeycode(g_display, key);
    if (code == 0) {
        return;
    }
    XTestFakeKeyEvent(g_display, code, down ? True : False, CurrentTime);
    XFlush(g_display);
}

unsigned char scale_channel(unsigned long pixel, unsigned long mask, int max_val) {
    if (max_val <= 0) {
        return 0;
    }
    const int shift = mask_to_shift(mask);
    const unsigned long value = (pixel & mask) >> shift;
    return static_cast<unsigned char>((value * 255) / max_val);
}

void convert_ximage_to_framebuffer(XImage* image, char* framebuffer) {
    if (!image || !framebuffer || !g_screen) {
        return;
    }

    const int width = g_screen->width;
    const int height = g_screen->height;

    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            const unsigned long pixel = XGetPixel(image, x, y);
            const unsigned char r = scale_channel(pixel, g_x11.red_mask, g_x11.red_max);
            const unsigned char g = scale_channel(pixel, g_x11.green_mask, g_x11.green_max);
            const unsigned char b = scale_channel(pixel, g_x11.blue_mask, g_x11.blue_max);
            const int offset = (y * width + x) * 4;
            framebuffer[offset + 0] = static_cast<char>(b);
            framebuffer[offset + 1] = static_cast<char>(g);
            framebuffer[offset + 2] = static_cast<char>(r);
            framebuffer[offset + 3] = 0;
        }
    }
}

void release_shm() {
    if (!g_display || !g_x11.use_shm) {
        return;
    }
    if (g_x11.shm_image) {
        XShmDetach(g_display, &g_x11.shm_info);
        XDestroyImage(g_x11.shm_image);
        g_x11.shm_image = nullptr;
    }
    if (g_x11.shm_info.shmaddr != reinterpret_cast<char*>(-1) && g_x11.shm_info.shmid >= 0) {
        shmdt(g_x11.shm_info.shmaddr);
        shmctl(g_x11.shm_info.shmid, IPC_RMID, nullptr);
    }
    g_x11.shm_info = {};
    g_x11.use_shm = false;
}

void release_pixmap() {
    if (!g_display) {
        return;
    }
    if (g_x11.gc) {
        XFreeGC(g_display, g_x11.gc);
        g_x11.gc = nullptr;
    }
    if (g_x11.pixmap) {
        XFreePixmap(g_display, g_x11.pixmap);
        g_x11.pixmap = 0;
    }
}

bool init_shm_capture() {
    if (!XShmQueryExtension(g_display)) {
        return false;
    }

    g_x11.shm_image = XShmCreateImage(g_display, g_x11.visual, g_x11.depth, ZPixmap, nullptr,
                                      &g_x11.shm_info, g_x11.width, g_x11.height);
    if (!g_x11.shm_image) {
        return false;
    }

    g_x11.shm_info.shmid =
        shmget(IPC_PRIVATE, static_cast<size_t>(g_x11.shm_image->bytes_per_line) *
                                  static_cast<size_t>(g_x11.shm_image->height),
               IPC_CREAT | 0600);
    if (g_x11.shm_info.shmid < 0) {
        XDestroyImage(g_x11.shm_image);
        g_x11.shm_image = nullptr;
        return false;
    }

    g_x11.shm_info.shmaddr = static_cast<char*>(shmat(g_x11.shm_info.shmid, nullptr, 0));
    if (g_x11.shm_info.shmaddr == reinterpret_cast<char*>(-1)) {
        shmctl(g_x11.shm_info.shmid, IPC_RMID, nullptr);
        XDestroyImage(g_x11.shm_image);
        g_x11.shm_image = nullptr;
        return false;
    }

    g_x11.shm_image->data = g_x11.shm_info.shmaddr;
    if (!XShmAttach(g_display, &g_x11.shm_info)) {
        release_shm();
        return false;
    }

    g_x11.use_shm = true;
    return true;
}

bool init_pixmap_capture() {
    g_x11.pixmap = XCreatePixmap(g_display, g_x11.root, g_x11.width, g_x11.height, g_x11.depth);
    if (!g_x11.pixmap) {
        return false;
    }
    g_x11.gc = XCreateGC(g_display, g_x11.pixmap, 0, nullptr);
    if (!g_x11.gc) {
        release_pixmap();
        return false;
    }
    return true;
}

bool probe_capture_once() {
    g_last_x_error.clear();
    XSync(g_display, False);

    if (g_x11.use_shm) {
        if (XShmGetImage(g_display, g_x11.root, g_x11.shm_image, 0, 0, AllPlanes)) {
            return true;
        }
    }

    if (g_x11.pixmap && g_x11.gc) {
        XCopyArea(g_display, g_x11.root, g_x11.pixmap, g_x11.gc, 0, 0, g_x11.width,
                  g_x11.height, 0, 0);
        XImage* image = XGetImage(g_display, g_x11.pixmap, 0, 0, g_x11.width, g_x11.height,
                                  AllPlanes, ZPixmap);
        if (image) {
            convert_ximage_to_framebuffer(image, g_screen->frameBuffer);
            XDestroyImage(image);
            return true;
        }
    }

    return false;
}

bool init_x11_display_info() {
    g_x11.screen = DefaultScreen(g_display);
    g_x11.root = RootWindow(g_display, g_x11.screen);
    g_x11.width = DisplayWidth(g_display, g_x11.screen);
    g_x11.height = DisplayHeight(g_display, g_x11.screen);
    g_x11.visual = DefaultVisual(g_display, g_x11.screen);

    XWindowAttributes attrs{};
    if (XGetWindowAttributes(g_display, g_x11.root, &attrs) == 0) {
        notify_status("Failed to read root window attributes");
        return false;
    }

    g_x11.depth = attrs.depth;
    g_x11.red_mask = g_x11.visual->red_mask;
    g_x11.green_mask = g_x11.visual->green_mask;
    g_x11.blue_mask = g_x11.visual->blue_mask;
    g_x11.red_max = mask_to_max(g_x11.red_mask);
    g_x11.green_max = mask_to_max(g_x11.green_mask);
    g_x11.blue_max = mask_to_max(g_x11.blue_mask);
    g_x11.bpp = 32;
    return true;
}

bool init_x11_capture_backends() {
    if (!init_pixmap_capture()) {
        notify_status("Failed to create X11 capture pixmap");
        return false;
    }
    if (!init_shm_capture()) {
        notify_status("XShm unavailable — using pixmap capture");
    }
    return true;
}

bool verify_screen_capture() {
    if (!probe_capture_once()) {
        if (!g_last_x_error.empty()) {
            notify_status("Screen capture failed: " + g_last_x_error);
        } else {
            notify_status("Screen capture failed (XGetImage BadMatch?)");
        }
        return false;
    }
    notify_status("Screen capture ready (depth " + std::to_string(g_x11.depth) + ", " +
                  std::to_string(g_x11.bpp) + " bpp)");
    return true;
}

bool capture_root_window() {
    if (!g_display || !g_screen || !g_screen->frameBuffer) {
        return false;
    }

    g_last_x_error.clear();
    XSync(g_display, False);

    if (g_x11.use_shm && g_x11.shm_image) {
        if (XShmGetImage(g_display, g_x11.root, g_x11.shm_image, 0, 0, AllPlanes)) {
            convert_ximage_to_framebuffer(g_x11.shm_image, g_screen->frameBuffer);
            return true;
        }
    }

    if (g_x11.pixmap && g_x11.gc) {
        XCopyArea(g_display, g_x11.root, g_x11.pixmap, g_x11.gc, 0, 0, g_x11.width,
                  g_x11.height, 0, 0);
        XImage* image = XGetImage(g_display, g_x11.pixmap, 0, 0, g_x11.width, g_x11.height,
                                  AllPlanes, ZPixmap);
        if (image) {
            convert_ximage_to_framebuffer(image, g_screen->frameBuffer);
            XDestroyImage(image);
            return true;
        }
    }

    if (!g_last_x_error.empty()) {
        notify_status(g_last_x_error);
    }
    return false;
}

void cleanup_x11_capture() {
    release_shm();
    release_pixmap();
    g_x11 = {};
}

void server_thread_main(VncServerOptions options) {
    XSetErrorHandler(x11_error_handler);

    g_display = XOpenDisplay(nullptr);
    if (!g_display) {
        notify_status("Failed to open X11 display (DISPLAY unset?)");
        g_running.store(false);
        return;
    }

    if (!init_x11_display_info()) {
        cleanup_x11_capture();
        XCloseDisplay(g_display);
        g_display = nullptr;
        g_running.store(false);
        return;
    }

    const int width = g_x11.width;
    const int height = g_x11.height;
    const int bpp = g_x11.bpp;

    int argc = 1;
    char arg0[] = "vncserver";
    char* argv[] = {arg0, nullptr};

    g_screen = rfbGetScreen(&argc, argv, width, height, 8, 3, bpp);
    if (!g_screen) {
        notify_status("rfbGetScreen failed");
        cleanup_x11_capture();
        XCloseDisplay(g_display);
        g_display = nullptr;
        g_running.store(false);
        return;
    }

    g_screen->desktopName = const_cast<char*>("VNCServerLinuxGTK");
    g_screen->port = options.port;
    g_screen->ipv6port = options.port;
    g_screen->alwaysShared = TRUE;
    g_screen->newClientHook = new_client_hook;
    g_screen->kbdAddEvent = kbd_add_event;
    g_screen->ptrAddEvent = ptr_add_event;

    g_plain_password = options.password;
    g_allow_input = options.allow_input;

    if (!g_plain_password.empty()) {
        g_password_list[0] = strdup(g_plain_password.c_str());
        g_password_list[1] = nullptr;
        g_screen->authPasswdData = g_password_list;
        g_screen->passwordCheck = rfbCheckPasswordByList;
    } else {
        g_screen->authPasswdData = nullptr;
        g_screen->passwordCheck = nullptr;
    }

    const size_t fb_size =
        static_cast<size_t>(width) * static_cast<size_t>(height) * static_cast<size_t>(bpp / 8);
    g_screen->frameBuffer = static_cast<char*>(malloc(fb_size));
    if (!g_screen->frameBuffer) {
        notify_status("Failed to allocate framebuffer");
        rfbScreenCleanup(g_screen);
        g_screen = nullptr;
        cleanup_x11_capture();
        XCloseDisplay(g_display);
        g_display = nullptr;
        g_running.store(false);
        return;
    }

    if (!init_x11_capture_backends() || !verify_screen_capture()) {
        rfbScreenCleanup(g_screen);
        g_screen = nullptr;
        cleanup_x11_capture();
        XCloseDisplay(g_display);
        g_display = nullptr;
        g_running.store(false);
        return;
    }

    rfbInitServer(g_screen);

    notify_status("VNC server listening on port " + std::to_string(options.port));

    while (g_running.load(std::memory_order_relaxed)) {
        if (capture_root_window()) {
            rfbMarkRectAsModified(g_screen, 0, 0, width, height);
        }
        rfbProcessEvents(g_screen, 40 * 1000);
    }

    rfbShutdownServer(g_screen, TRUE);
    rfbScreenCleanup(g_screen);
    g_screen = nullptr;

    cleanup_x11_capture();
    XCloseDisplay(g_display);
    g_display = nullptr;
    if (g_password_list[0]) {
        free(g_password_list[0]);
        g_password_list[0] = nullptr;
    }
    g_plain_password.clear();

    notify_clients(0);
    notify_status("VNC server stopped");
    g_running.store(false);
}

}  // namespace

bool vnc_server_start(const VncServerOptions& options,
                      VncStatusCallback on_status,
                      VncClientCountCallback on_clients) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_running.load()) {
        return false;
    }

    g_on_status = std::move(on_status);
    g_on_clients = std::move(on_clients);
    g_client_count.store(0);
    g_running.store(true);

    g_worker = std::thread(server_thread_main, options);
    return true;
}

void vnc_server_stop() {
    std::thread worker;
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (!g_running.load()) {
            return;
        }
        g_running.store(false);
        worker = std::move(g_worker);
    }
    if (worker.joinable()) {
        worker.join();
    }
}

bool vnc_server_is_running() {
    return g_running.load(std::memory_order_relaxed);
}

int vnc_server_client_count() {
    return g_client_count.load(std::memory_order_relaxed);
}
