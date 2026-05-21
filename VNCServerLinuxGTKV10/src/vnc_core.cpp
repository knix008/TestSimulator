#include "vnc_core.h"

#include "capture_gstreamer.h"
#include "input_inject.h"

#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wparentheses"
#include <rfb/rfb.h>
#pragma GCC diagnostic pop

#ifdef LIBVNCSERVER_HAVE_LIBZ
#include <zlib.h>
extern "C" void rfbFreeZrleData(rfbClientPtr cl);
#ifdef LIBVNCSERVER_HAVE_LIBJPEG
extern "C" void rfbFreeTightData(rfbClientPtr cl);
#endif
#endif

#include <X11/Xatom.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/Xcomposite.h>
#include <X11/extensions/Xdamage.h>
#include <X11/extensions/XShm.h>
#include <X11/extensions/XTest.h>

#include <sys/ipc.h>
#include <sys/shm.h>
#include <unistd.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

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
    int bytes_per_pixel = 4;  // framebuffer bytes per pixel (always 4 for RGBx)
    Visual* visual = nullptr;
    unsigned long red_mask = 0;
    unsigned long green_mask = 0;
    unsigned long blue_mask = 0;
    int red_max = 0;
    int green_max = 0;
    int blue_max = 0;
    bool use_pixmap_shm = false;
    XImage* pixmap_shm_image = nullptr;
    XShmSegmentInfo pixmap_shm_info{};
    bool native_bgrx = false;
    bool use_xcomposite = false;
    // XDamage — notifies which screen regions changed (TigerVNC x0vncserver approach)
    int damage_event_base = 0;
    Damage damage_handle = 0;
    bool use_xdamage = false;
};

struct StackedWindowEntry {
    Window id = 0;
    int x = 0;
    int y = 0;
    int w = 0;
    int h = 0;
    int area = 0;
    bool is_desktop = false;
};

X11CaptureState g_x11;
VncCaptureMode g_capture_mode = VncCaptureMode::FullDesktop;
Window g_target_window = 0;
std::string g_last_x_error;

struct CaptureStats {
    uint64_t frames_ok = 0;
    uint64_t frames_failed = 0;
    uint64_t frames_unchanged = 0;
    uint64_t root_black_fallbacks = 0;
    std::chrono::steady_clock::time_point last_report{};
};

CaptureStats g_capture_stats;
std::vector<char> g_prev_framebuffer;
// Framebuffers collected during resize hooks and freed after rfbProcessEvents
// returns. Multiple resize requests can arrive within a single rfbProcessEvents
// call; freeing immediately would invalidate buffers libvncserver is still using.
std::vector<char*> g_deferred_fbs;
bool g_pending_encoder_reset = false;
// After resize, send one Raw framebuffer update so TightVNC resyncs zlib state.
bool g_force_raw_after_resize = false;
// Set when portal/x11 GStreamer setup finishes (success or failure).
std::atomic<bool> g_portal_setup_complete{false};
std::vector<StackedWindowEntry> g_stacked_windows;
std::chrono::steady_clock::time_point g_stacked_list_time{};

constexpr int kCaptureIntervalMs = 66;
constexpr int kTileSize = 64;
constexpr int kMinWindowSize = 32;
constexpr int kStackedListRefreshSec = 2;
constexpr double kRootContentThreshold = 0.02;
constexpr int kMinCaptureScalePercent = 10;
constexpr int kMaxCaptureScalePercent = 100;
std::chrono::steady_clock::time_point g_last_capture_time{};
int g_capture_scale_percent = 100;

int clamp_capture_scale_percent(int percent) {
    return std::clamp(percent, kMinCaptureScalePercent, kMaxCaptureScalePercent);
}

int scaled_vnc_dimension(int native, int percent) {
    if (native <= 0) {
        return 0;
    }
    const int p = clamp_capture_scale_percent(percent);
    int scaled = (native * p) / 100;
    scaled = (scaled + 3) & ~3;
    return std::max(64, scaled);
}

int framebuffer_stride_bytes() {
    if (!g_screen) {
        return 0;
    }
    if (g_screen->paddedWidthInBytes > 0) {
        return g_screen->paddedWidthInBytes;
    }
    return g_screen->width * (g_screen->bitsPerPixel / 8);
}

size_t framebuffer_bytes() {
    if (!g_screen) {
        return 0;
    }
    const int stride = framebuffer_stride_bytes();
    return static_cast<size_t>(g_screen->height) * static_cast<size_t>(stride);
}

void update_all_clients_framebuffer() {
    if (!g_screen) {
        return;
    }
    rfbClientIteratorPtr it = rfbGetClientIterator(g_screen);
    rfbClientPtr cl = nullptr;
    while ((cl = rfbClientIteratorNext(it)) != nullptr) {
        rfbUpdateClient(cl);
    }
    rfbReleaseClientIterator(it);
}
std::mutex g_client_hosts_mutex;
std::unordered_map<rfbClientPtr, std::string> g_client_hosts;

std::string client_host_string(rfbClientPtr cl) {
    if (cl && cl->host) {
        return cl->host;
    }
    return "unknown";
}

void remember_client_host(rfbClientPtr cl) {
    std::lock_guard<std::mutex> lock(g_client_hosts_mutex);
    g_client_hosts[cl] = client_host_string(cl);
}

std::string forget_client_host(rfbClientPtr cl) {
    std::lock_guard<std::mutex> lock(g_client_hosts_mutex);
    const auto it = g_client_hosts.find(cl);
    if (it == g_client_hosts.end()) {
        return "unknown";
    }
    const std::string host = it->second;
    g_client_hosts.erase(it);
    return host;
}

void clear_client_hosts() {
    std::lock_guard<std::mutex> lock(g_client_hosts_mutex);
    g_client_hosts.clear();
}

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
bool capture_via_pixmap(char* framebuffer);
bool capture_root_window();
bool overlay_windows_on_framebuffer();
bool capture_full_desktop();
bool capture_single_window();
double framebuffer_nonzero_ratio();
bool capture_via_xcomposite_window(Window window, char* framebuffer);
bool mark_framebuffer_changes();
void configure_vnc_server_performance();
bool window_root_position(Window window, int* out_x, int* out_y);
bool window_is_desktop(Window window);
void blit_ximage_to_framebuffer_opaque(XImage* image, int dst_x, int dst_y);
void push_framebuffer_updates_to_all_clients();

// Reset Tight encoder state only. Do not touch ZRLE here — clearing zrleData before
// the client receives a full Raw frame causes "ZlibInStream: inflate failed".
void reset_client_tight_state_after_resize() {
    if (!g_screen) {
        return;
    }

    rfbClientIteratorPtr it = rfbGetClientIterator(g_screen);
    rfbClientPtr cl = nullptr;
    while ((cl = rfbClientIteratorNext(it)) != nullptr) {
#ifdef LIBVNCSERVER_HAVE_LIBJPEG
        for (int i = 0; i < 4; ++i) {
            if (cl->zsActive[i]) {
                deflateEnd(&cl->zsStruct[i]);
                cl->zsActive[i] = FALSE;
            }
        }
        rfbFreeTightData(cl);
#endif
        free(cl->beforeEncBuf);
        cl->beforeEncBuf = nullptr;
        cl->beforeEncBufSize = 0;
        free(cl->afterEncBuf);
        cl->afterEncBuf = nullptr;
        cl->afterEncBufSize = 0;
        cl->afterEncBufLen = 0;
        cl->progressiveSliceY = 0;
        if (g_screen->setTranslateFunction) {
            g_screen->setTranslateFunction(cl);
        }
    }
    rfbReleaseClientIterator(it);
}

void reset_client_zrle_after_resize() {
    if (!g_screen) {
        return;
    }
#ifdef LIBVNCSERVER_HAVE_LIBZ
    rfbClientIteratorPtr it = rfbGetClientIterator(g_screen);
    rfbClientPtr cl = nullptr;
    while ((cl = rfbClientIteratorNext(it)) != nullptr) {
        rfbFreeZrleData(cl);
    }
    rfbReleaseClientIterator(it);
#endif
}

// Called by libvncserver when a VNC client requests a desktop resize.
// Accepts the new size and reallocates the framebuffer so the VNC viewer
// window fits without scroll bars.
int desktop_resize_hook(int width, int height, int /*numScreens*/,
                        rfbExtDesktopScreen* /*screens*/, rfbClientPtr /*cl*/) {
    if (!g_screen) {
        return rfbExtDesktopSize_OutOfResources;
    }
    // libvncserver and many encoders assume width is a multiple of 4 (32-bit RGBx).
    // Round up so the framebuffer is not smaller than the viewer window.
    width = (width + 3) & ~3;
    if (width < 64 || height < 64 || width > 7680 || height > 4320) {
        return rfbExtDesktopSize_OutOfResources;
    }
    if (width == g_screen->width && height == g_screen->height) {
        return rfbExtDesktopSize_Success;
    }

    const int bpp = g_screen->bitsPerPixel / 8;
    const size_t new_size = static_cast<size_t>(width) * static_cast<size_t>(height) *
                            static_cast<size_t>(bpp);
    char* new_fb = static_cast<char*>(malloc(new_size));
    if (!new_fb) {
        return rfbExtDesktopSize_OutOfResources;
    }
    std::memset(new_fb, 0, new_size);

    char* const old_fb = g_screen->frameBuffer;
    // Notify libvncserver (client regions, NewFBSize / ExtDesktopSize, mutexes).
    rfbNewFramebuffer(g_screen, new_fb, width, height, 8, 3, bpp);
    // Defer Tight state reset until ExtDesktopSize is sent; then send one Raw frame.
    g_pending_encoder_reset = true;
    g_force_raw_after_resize = true;

    // Defer free until after rfbProcessEvents — rapid SetDesktopSize bursts and
    // in-flight encoders may still reference the previous buffer briefly.
    if (old_fb) {
        g_deferred_fbs.push_back(old_fb);
    }

    g_prev_framebuffer.clear();

    // Fill the new buffer before the client reads a full-screen Raw update.
    if (g_capture_mode == VncCaptureMode::FullDesktop) {
        (void)capture_full_desktop();
    } else if (g_capture_mode == VncCaptureMode::SingleWindow) {
        (void)capture_single_window();
    }

    return rfbExtDesktopSize_Success;
}

void vnc_display_hook(rfbClientPtr cl) {
    if (!cl) {
        return;
    }
    if (g_force_raw_after_resize) {
        cl->preferredEncoding = rfbEncodingRaw;
        return;
    }
    if (cl->preferredEncoding == rfbEncodingTight) {
#ifdef LIBVNCSERVER_HAVE_LIBZ
        cl->preferredEncoding = rfbEncodingZRLE;
#else
        cl->preferredEncoding = rfbEncodingRaw;
#endif
    }
}

void vnc_display_finished_hook(rfbClientPtr /*cl*/, int result) {
    if (!result || !g_force_raw_after_resize) {
        return;
    }
    g_force_raw_after_resize = false;
    reset_client_zrle_after_resize();
}

bool window_is_desktop(Window window) {
    if (!g_display) {
        return false;
    }

    const Atom wm_type_atom = XInternAtom(g_display, "_NET_WM_WINDOW_TYPE", False);
    const Atom desktop_atom = XInternAtom(g_display, "_NET_WM_WINDOW_TYPE_DESKTOP", False);
    if (wm_type_atom == None || desktop_atom == None) {
        return false;
    }

    Atom actual_type = None;
    int actual_format = 0;
    unsigned long nitems = 0;
    unsigned long bytes_after = 0;
    unsigned char* data = nullptr;

    const int status = XGetWindowProperty(g_display, window, wm_type_atom, 0, 16, False, XA_ATOM,
                                          &actual_type, &actual_format, &nitems, &bytes_after,
                                          &data);
    if (status != Success || !data || actual_type != XA_ATOM || nitems == 0) {
        if (data) {
            XFree(data);
        }
        return false;
    }

    auto* types = reinterpret_cast<Atom*>(data);
    bool is_desktop = false;
    for (unsigned long i = 0; i < nitems; ++i) {
        if (types[i] == desktop_atom) {
            is_desktop = true;
            break;
        }
    }
    XFree(data);
    return is_desktop;
}

bool window_root_position(Window window, int* out_x, int* out_y) {
    if (!g_display || !out_x || !out_y) {
        return false;
    }

    // Translate the window's own origin (0,0) to root coordinates.
    // This gives the exact pixel position of the client content area in the root
    // window, which is where we must blit the captured XImage.
    Window child = 0;
    int root_x = 0;
    int root_y = 0;
    if (!XTranslateCoordinates(g_display, window, g_x11.root, 0, 0, &root_x, &root_y, &child)) {
        return false;
    }
    *out_x = root_x;
    *out_y = root_y;
    return true;
}


void push_framebuffer_updates_to_all_clients() {
    if (!g_screen || !g_screen->frameBuffer) {
        return;
    }

    if (!capture_root_window()) {
        return;
    }

    if (g_capture_mode == VncCaptureMode::FullDesktop &&
        framebuffer_nonzero_ratio() < kRootContentThreshold) {
        return;
    }

    g_prev_framebuffer.clear();
    g_force_raw_after_resize = true;

    mark_framebuffer_changes();
    update_all_clients_framebuffer();
}

rfbNewClientAction new_client_hook(rfbClientPtr cl) {
    cl->clientGoneHook = gone_client_hook;
    remember_client_host(cl);

    const int count = ++g_client_count;
    notify_clients(count);
    notify_status("Client connected: " + client_host_string(cl) +
                  " (total " + std::to_string(count) + ")");

    if (g_capture_mode == VncCaptureMode::FullDesktop &&
        !g_portal_setup_complete.load(std::memory_order_acquire)) {
        notify_status("화면 공유 대화상자를 완료하면 화면이 표시됩니다.");
        return RFB_CLIENT_ACCEPT;
    }

    g_prev_framebuffer.clear();
    if (g_screen && capture_root_window() && mark_framebuffer_changes()) {
        rfbUpdateClient(cl);
    }
    return RFB_CLIENT_ACCEPT;
}

void gone_client_hook(rfbClientPtr cl) {
    const std::string host = forget_client_host(cl);

    int count = g_client_count.load(std::memory_order_relaxed) - 1;
    if (count < 0) {
        count = 0;
    }
    g_client_count.store(count, std::memory_order_relaxed);
    notify_clients(count);

    std::string msg = "Client disconnected: " + host;
    if (count == 0) {
        msg += " (no clients remaining)";
    } else {
        msg += " (" + std::to_string(count) + " remaining)";
    }
    notify_status(msg);
}

bool is_usable_input_window(Window window) {
    if (!g_display || window == None || window == g_x11.root) {
        return false;
    }

    XWindowAttributes attr{};
    if (XGetWindowAttributes(g_display, window, &attr) != 1) {
        return false;
    }
    if (attr.map_state != IsViewable || attr.width < kMinWindowSize || attr.height < kMinWindowSize) {
        return false;
    }
    return !window_is_desktop(window);
}

Window toplevel_window(Window window) {
    if (!g_display || window == None || window == g_x11.root) {
        return window;
    }

    Window cur = window;
    for (;;) {
        Window root = None;
        Window parent = None;
        Window* children = nullptr;
        unsigned int nchildren = 0;
        if (XQueryTree(g_display, cur, &root, &parent, &children, &nchildren) == 0) {
            break;
        }
        if (children) {
            XFree(children);
        }
        if (parent == None || parent == g_x11.root) {
            return cur;
        }
        cur = parent;
    }
    return window;
}

Window window_at_root_point(int root_x, int root_y) {
    if (!g_display) {
        return None;
    }

    Window child = None;
    int win_x = 0;
    int win_y = 0;
    if (XTranslateCoordinates(g_display, g_x11.root, g_x11.root, root_x, root_y, &win_x, &win_y,
                              &child) == 0 ||
        child == None) {
        return g_x11.root;
    }

    Window cur = child;
    for (;;) {
        Window sub = None;
        int sub_x = 0;
        int sub_y = 0;
        if (XTranslateCoordinates(g_display, cur, cur, win_x, win_y, &sub_x, &sub_y, &sub) == 0 ||
            sub == None || sub == cur) {
            break;
        }
        cur = sub;
        win_x = sub_x;
        win_y = sub_y;
    }
    return cur;
}

void activate_window(Window window) {
    if (!g_display || !is_usable_input_window(window)) {
        return;
    }

    const Window top = toplevel_window(window);

    XRaiseWindow(g_display, top);
    XSetInputFocus(g_display, top, RevertToParent, CurrentTime);

    const Atom net_active = XInternAtom(g_display, "_NET_ACTIVE_WINDOW", False);
    if (net_active != None) {
        XEvent ev{};
        ev.xclient.type = ClientMessage;
        ev.xclient.window = top;
        ev.xclient.message_type = net_active;
        ev.xclient.format = 32;
        ev.xclient.data.l[0] = 1;
        ev.xclient.data.l[1] = CurrentTime;
        ev.xclient.data.l[2] = 0;
        XSendEvent(g_display, g_x11.root, False,
                   SubstructureRedirectMask | SubstructureNotifyMask, &ev);
    }
}

bool send_button_event_to_window(Window target, int root_x, int root_y, unsigned int button,
                                 bool down) {
    if (!g_display || target == None || target == g_x11.root) {
        return false;
    }

    int win_x = 0;
    int win_y = 0;
    Window sub = None;
    if (XTranslateCoordinates(g_display, g_x11.root, target, root_x, root_y, &win_x, &win_y,
                              &sub) == 0) {
        return false;
    }

    XButtonEvent ev{};
    ev.type = down ? ButtonPress : ButtonRelease;
    ev.display = g_display;
    ev.window = target;
    ev.root = g_x11.root;
    ev.subwindow = sub;
    ev.time = CurrentTime;
    ev.x = win_x;
    ev.y = win_y;
    ev.x_root = root_x;
    ev.y_root = root_y;
    ev.button = button;
    ev.same_screen = True;

    const unsigned long mask = down ? ButtonPressMask : ButtonReleaseMask;
    return XSendEvent(g_display, target, True, mask, reinterpret_cast<XEvent*>(&ev)) != 0;
}

void map_vnc_coords_to_root(int vnc_x, int vnc_y, int* out_x, int* out_y) {
    if (!g_screen || !out_x || !out_y) {
        return;
    }

    int target_w = g_x11.width;
    int target_h = g_x11.height;
    int origin_x = 0;
    int origin_y = 0;

    if (g_capture_mode == VncCaptureMode::SingleWindow && g_target_window && g_display) {
        XWindowAttributes attr{};
        if (XGetWindowAttributes(g_display, g_target_window, &attr) == 1 && attr.width > 0 &&
            attr.height > 0) {
            target_w = attr.width;
            target_h = attr.height;
            window_root_position(g_target_window, &origin_x, &origin_y);
        }
    }

    int rx = vnc_x;
    int ry = vnc_y;
    if (g_screen->width > 0 && g_screen->height > 0) {
        rx = (vnc_x * target_w) / g_screen->width;
        ry = (vnc_y * target_h) / g_screen->height;
    }

    rx = std::clamp(rx, 0, std::max(0, target_w - 1));
    ry = std::clamp(ry, 0, std::max(0, target_h - 1));
    *out_x = origin_x + rx;
    *out_y = origin_y + ry;
}

void ptr_add_event(int buttonMask, int x, int y, rfbClientPtr /*cl*/) {
    if (!g_allow_input || !g_display || !g_screen) {
        return;
    }

    int rx = 0;
    int ry = 0;
    map_vnc_coords_to_root(x, y, &rx, &ry);

    if (input_inject_is_active()) {
        input_inject_pointer_root(rx, ry, buttonMask);
        return;
    }

    XTestFakeMotionEvent(g_display, g_x11.screen, rx, ry, CurrentTime);
    XSync(g_display, False);

    static int g_last_ptr_button_mask = 0;
    const int press_edge =
        (buttonMask & ~g_last_ptr_button_mask) & (rfbButton1Mask | rfbButton2Mask | rfbButton3Mask);

    Window target = window_at_root_point(rx, ry);
    if (press_edge != 0 && is_usable_input_window(target)) {
        activate_window(target);
        XSync(g_display, False);
    }

    static const struct {
        int rfb_mask;
        unsigned int x_button;
    } kButtons[] = {
        {rfbButton1Mask, 1},
        {rfbButton2Mask, 2},
        {rfbButton3Mask, 3},
        {rfbButton4Mask, 4},
        {rfbButton5Mask, 5},
    };

    const bool use_window_events = is_usable_input_window(target);
    for (const auto& btn : kButtons) {
        const bool down = (buttonMask & btn.rfb_mask) != 0;
        if (use_window_events && btn.x_button <= 3) {
            send_button_event_to_window(toplevel_window(target), rx, ry, btn.x_button, down);
        } else {
            XTestFakeButtonEvent(g_display, btn.x_button, down ? True : False, CurrentTime);
        }
    }

    g_last_ptr_button_mask = buttonMask;
    XFlush(g_display);
}

void kbd_add_event(rfbBool down, rfbKeySym key, rfbClientPtr /*cl*/) {
    if (!g_allow_input || !g_display) {
        return;
    }

    if (input_inject_is_active()) {
        input_inject_key(static_cast<uint32_t>(key), down != 0);
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

bool image_is_native_bgrx(const XImage* image) {
    return image && g_x11.native_bgrx && image->bits_per_pixel == 32 &&
           image->byte_order == LSBFirst;
}

bool copy_native_bgrx_to_framebuffer(const XImage* image, char* framebuffer, int dst_x,
                                     int dst_y) {
    if (!image_is_native_bgrx(image) || !framebuffer || !g_screen) {
        return false;
    }

    // Clip source origin when the window is partially off-screen (dst < 0).
    const int src_x0 = (dst_x < 0) ? -dst_x : 0;
    const int src_y0 = (dst_y < 0) ? -dst_y : 0;
    const int clip_dst_x = std::max(0, dst_x);
    const int clip_dst_y = std::max(0, dst_y);

    const int copy_w = std::min(image->width  - src_x0, g_screen->width  - clip_dst_x);
    const int copy_h = std::min(image->height - src_y0, g_screen->height - clip_dst_y);
    if (copy_w <= 0 || copy_h <= 0) {
        return false;
    }

    const int dst_stride = framebuffer_stride_bytes();
    const int row_bytes = copy_w * 4;

    for (int y = 0; y < copy_h; ++y) {
        const auto* src = reinterpret_cast<const unsigned char*>(
            image->data + (src_y0 + y) * image->bytes_per_line + src_x0 * 4);
        auto* dst = reinterpret_cast<unsigned char*>(
            framebuffer + (clip_dst_y + y) * dst_stride + clip_dst_x * 4);
        std::memcpy(dst, src, static_cast<size_t>(row_bytes));
    }
    return true;
}

void write_pixel_to_framebuffer(char* framebuffer, int x, int y, unsigned long pixel) {
    if (!framebuffer || !g_screen || x < 0 || y < 0 || x >= g_screen->width || y >= g_screen->height) {
        return;
    }
    const unsigned char r = scale_channel(pixel, g_x11.red_mask, g_x11.red_max);
    const unsigned char g = scale_channel(pixel, g_x11.green_mask, g_x11.green_max);
    const unsigned char b = scale_channel(pixel, g_x11.blue_mask, g_x11.blue_max);
    const int offset = y * framebuffer_stride_bytes() + x * 4;
    framebuffer[offset + 0] = static_cast<char>(b);
    framebuffer[offset + 1] = static_cast<char>(g);
    framebuffer[offset + 2] = static_cast<char>(r);
    framebuffer[offset + 3] = 0;
}

void convert_ximage_to_framebuffer(XImage* image, char* framebuffer) {
    if (!image || !framebuffer || !g_screen) {
        return;
    }

    const int dst_w = g_screen->width;
    const int dst_h = g_screen->height;
    const int src_w = image->width;
    const int src_h = image->height;
    if (dst_w <= 0 || dst_h <= 0 || src_w <= 0 || src_h <= 0) {
        return;
    }

    if (src_w == dst_w && src_h == dst_h && copy_native_bgrx_to_framebuffer(image, framebuffer, 0, 0)) {
        return;
    }

    const int dst_stride = framebuffer_stride_bytes();

    if (image_is_native_bgrx(image)) {
        for (int dy = 0; dy < dst_h; ++dy) {
            const int sy = (dy * src_h) / dst_h;
            const auto* src_row = reinterpret_cast<const unsigned char*>(
                image->data + sy * image->bytes_per_line);
            auto* dst_row = reinterpret_cast<unsigned char*>(framebuffer) + dy * dst_stride;
            for (int dx = 0; dx < dst_w; ++dx) {
                const int sx = (dx * src_w) / dst_w;
                std::memcpy(dst_row + dx * 4, src_row + sx * 4, 4);
            }
        }
        return;
    }

    for (int dy = 0; dy < dst_h; ++dy) {
        const int sy = (dy * src_h) / dst_h;
        for (int dx = 0; dx < dst_w; ++dx) {
            const int sx = (dx * src_w) / dst_w;
            write_pixel_to_framebuffer(framebuffer, dx, dy, XGetPixel(image, sx, sy));
        }
    }
}


void blit_ximage_to_framebuffer_opaque(XImage* image, int dst_x, int dst_y) {
    if (!image || !g_screen || !g_screen->frameBuffer) {
        return;
    }

    if (copy_native_bgrx_to_framebuffer(image, g_screen->frameBuffer, dst_x, dst_y)) {
        return;
    }

    const int x0 = std::max(0, dst_x);
    const int y0 = std::max(0, dst_y);
    const int x1 = std::min(g_screen->width, dst_x + image->width);
    const int y1 = std::min(g_screen->height, dst_y + image->height);

    for (int y = y0; y < y1; ++y) {
        for (int x = x0; x < x1; ++x) {
            const int src_x = x - dst_x;
            const int src_y = y - dst_y;
            write_pixel_to_framebuffer(g_screen->frameBuffer, x, y, XGetPixel(image, src_x, src_y));
        }
    }
}

double framebuffer_nonzero_ratio() {
    if (!g_screen || !g_screen->frameBuffer) {
        return 0.0;
    }

    const int width = g_screen->width;
    const int height = g_screen->height;
    const int stride = framebuffer_stride_bytes();
    int samples = 0;
    int nonzero = 0;

    for (int y = 0; y < height; y += 37) {
        for (int x = 0; x < width; x += 53) {
            const int offset = y * stride + x * 4;
            const unsigned char* p =
                reinterpret_cast<unsigned char*>(g_screen->frameBuffer + offset);
            if (p[0] > 8 || p[1] > 8 || p[2] > 8) {
                ++nonzero;
            }
            ++samples;
        }
    }

    return samples > 0 ? static_cast<double>(nonzero) / static_cast<double>(samples) : 0.0;
}

bool capture_window_to_image(Window window, XImage** out_image, int* out_w, int* out_h) {
    if (!g_display || !out_image) {
        return false;
    }

    XWindowAttributes attr{};
    if (XGetWindowAttributes(g_display, window, &attr) != 1 ||
        attr.map_state != IsViewable || attr.width <= 0 || attr.height <= 0) {
        return false;
    }

    Pixmap pixmap = XCreatePixmap(g_display, g_x11.root, attr.width, attr.height, attr.depth);
    if (!pixmap) {
        return false;
    }

    GC gc = XCreateGC(g_display, pixmap, 0, nullptr);
    if (!gc) {
        XFreePixmap(g_display, pixmap);
        return false;
    }

    XCopyArea(g_display, window, pixmap, gc, 0, 0, attr.width, attr.height, 0, 0);
    XImage* image =
        XGetImage(g_display, pixmap, 0, 0, attr.width, attr.height, AllPlanes, ZPixmap);

    XFreeGC(g_display, gc);
    XFreePixmap(g_display, pixmap);

    if (!image) {
        return false;
    }

    *out_image = image;
    if (out_w) {
        *out_w = attr.width;
    }
    if (out_h) {
        *out_h = attr.height;
    }
    return true;
}

bool refresh_stacked_window_list() {
    g_stacked_windows.clear();

    const Atom client_list_atom =
        XInternAtom(g_display, "_NET_CLIENT_LIST_STACKING", False);
    if (client_list_atom == None) {
        return false;
    }

    Atom actual_type = None;
    int actual_format = 0;
    unsigned long nitems = 0;
    unsigned long bytes_after = 0;
    unsigned char* data = nullptr;

    const int status = XGetWindowProperty(g_display, g_x11.root, client_list_atom, 0, 1024,
                                          False, XA_WINDOW, &actual_type, &actual_format,
                                          &nitems, &bytes_after, &data);
    if (status != Success || !data || actual_type != XA_WINDOW || nitems == 0) {
        if (data) {
            XFree(data);
        }
        return false;
    }

    std::vector<StackedWindowEntry> desktop_entries;
    std::vector<StackedWindowEntry> window_entries;

    auto* windows = reinterpret_cast<Window*>(data);
    for (unsigned long i = 0; i < nitems; ++i) {
        const bool is_desktop = window_is_desktop(windows[i]);
        const int min_size = is_desktop ? 1 : kMinWindowSize;

        XWindowAttributes attr{};
        if (XGetWindowAttributes(g_display, windows[i], &attr) != 1 ||
            attr.map_state != IsViewable || attr.width < min_size || attr.height < min_size) {
            continue;
        }

        StackedWindowEntry entry{};
        entry.id = windows[i];
        entry.is_desktop = is_desktop;
        if (!window_root_position(windows[i], &entry.x, &entry.y)) {
            entry.x = attr.x;
            entry.y = attr.y;
        }
        entry.w = attr.width;
        entry.h = attr.height;
        entry.area = attr.width * attr.height;

        if (is_desktop) {
            desktop_entries.push_back(entry);
        } else {
            window_entries.push_back(entry);
        }
    }
    XFree(data);

    g_stacked_windows.reserve(desktop_entries.size() + window_entries.size());
    g_stacked_windows.insert(g_stacked_windows.end(), desktop_entries.begin(),
                             desktop_entries.end());
    g_stacked_windows.insert(g_stacked_windows.end(), window_entries.begin(),
                             window_entries.end());

    g_stacked_list_time = std::chrono::steady_clock::now();
    return !g_stacked_windows.empty();
}

bool overlay_windows_on_framebuffer() {
    if (!g_display || !g_screen || !g_screen->frameBuffer) {
        return false;
    }

    const auto now = std::chrono::steady_clock::now();
    if (g_stacked_windows.empty() ||
        std::chrono::duration_cast<std::chrono::seconds>(now - g_stacked_list_time).count() >=
            kStackedListRefreshSec) {
        if (!refresh_stacked_window_list()) {
            return false;
        }
    }

    bool any = false;
    for (const StackedWindowEntry& entry : g_stacked_windows) {
        XImage* image = nullptr;

        // Prefer XComposite — gives the compositor's backing pixmap for the window.
        // XSync ensures GPU rendering is flushed to the CPU-accessible pixmap first.
        if (g_x11.use_xcomposite) {
            const Pixmap cp = XCompositeNameWindowPixmap(g_display, entry.id);
            if (cp) {
                XWindowAttributes attr{};
                if (XGetWindowAttributes(g_display, entry.id, &attr) == 1 &&
                    attr.width > 0 && attr.height > 0) {
                    XSync(g_display, False);
                    image = XGetImage(g_display, cp, 0, 0, attr.width, attr.height,
                                      AllPlanes, ZPixmap);
                }
                XFreePixmap(g_display, cp);
            }
        }

        // Fallback: XCopyArea capture (works for unredirected/non-composited windows)
        if (!image) {
            capture_window_to_image(entry.id, &image, nullptr, nullptr);
        }
        if (!image) {
            continue;
        }

        // Skip windows whose content is entirely black — compositor couldn't provide
        // CPU-accessible pixel data (pure GPU compositing / DRI3 unredirection).
        bool has_content = false;
        const int step_x = std::max(1, image->width / 8);
        const int step_y = std::max(1, image->height / 8);
        for (int sy = 0; sy < image->height && !has_content; sy += step_y) {
            for (int sx = 0; sx < image->width && !has_content; sx += step_x) {
                if (XGetPixel(image, sx, sy) != 0) {
                    has_content = true;
                }
            }
        }

        if (has_content) {
            // Re-read position fresh every frame so a moved window doesn't
            // create a ghost copy at its old cached position.
            int blit_x = entry.x;
            int blit_y = entry.y;
            window_root_position(entry.id, &blit_x, &blit_y);
            blit_ximage_to_framebuffer_opaque(image, blit_x, blit_y);
            any = true;
        }
        XDestroyImage(image);
    }

    return any;
}

bool capture_via_xcomposite_window(Window window, char* framebuffer) {
    if (!g_display || !framebuffer || !g_x11.use_xcomposite || !window) {
        return false;
    }

    g_last_x_error.clear();
    const Pixmap composite_pixmap = XCompositeNameWindowPixmap(g_display, window);
    if (!composite_pixmap) {
        return false;
    }

    XWindowAttributes attr{};
    if (XGetWindowAttributes(g_display, window, &attr) != 1) {
        XFreePixmap(g_display, composite_pixmap);
        return false;
    }

    XImage* image = XGetImage(g_display, composite_pixmap, 0, 0, attr.width, attr.height, AllPlanes,
                              ZPixmap);
    XFreePixmap(g_display, composite_pixmap);
    if (!image) {
        return false;
    }

    convert_ximage_to_framebuffer(image, framebuffer);
    XDestroyImage(image);
    return true;
}


bool capture_single_window() {
    if (!g_display || !g_screen || !g_screen->frameBuffer || !g_target_window) {
        return false;
    }

    if (g_x11.use_xcomposite &&
        capture_via_xcomposite_window(g_target_window, g_screen->frameBuffer)) {
        return true;
    }

    XImage* image = nullptr;
    if (!capture_window_to_image(g_target_window, &image, nullptr, nullptr)) {
        return false;
    }

    std::memset(g_screen->frameBuffer, 0,
                static_cast<size_t>(g_screen->width) * static_cast<size_t>(g_screen->height) * 4U);
    convert_ximage_to_framebuffer(image, g_screen->frameBuffer);
    XDestroyImage(image);
    return true;
}

bool capture_full_desktop() {
    if (!g_screen || !g_screen->frameBuffer) {
        return false;
    }

    if (g_capture_mode == VncCaptureMode::SingleWindow) {
        return capture_single_window();
    }

    if (capture_gstreamer_is_active()) {
        // Portal/ximagesrc may not have a frame ready yet (async negotiation).
        if (capture_gstreamer_frame(g_screen->frameBuffer, g_screen->width, g_screen->height) &&
            framebuffer_nonzero_ratio() >= kRootContentThreshold) {
            return true;
        }
        // Portal on Wayland: X11 root is empty and overlay only composites XWayland
        // windows (often just the focused app). Wait for PipeWire, do not overlay.
        if (capture_gstreamer_is_portal()) {
            return false;
        }
    }

    if (!g_display) {
        return false;
    }

    // Native X11 fallback when GStreamer portal is unavailable.
    XSync(g_display, False);
    bool captured = capture_via_pixmap(g_screen->frameBuffer);

    // On Wayland/XWayland the X11 root is empty; compositing individual windows
    // would send one app, not the full desktop — skip overlay there.
    if ((!captured || framebuffer_nonzero_ratio() < 0.10) && !std::getenv("WAYLAND_DISPLAY")) {
        overlay_windows_on_framebuffer();
        captured = framebuffer_nonzero_ratio() >= kRootContentThreshold;
    }

    if (captured && framebuffer_nonzero_ratio() < kRootContentThreshold) {
        captured = false;
    }

    return captured;
}

void configure_vnc_server_performance() {
    if (!g_screen) {
        return;
    }
    g_screen->deferUpdateTime = 10;
    g_screen->maxRectsPerUpdate = 256;
}

bool mark_framebuffer_changes() {
    if (!g_screen || !g_screen->frameBuffer) {
        return false;
    }

    if (g_capture_mode == VncCaptureMode::FullDesktop &&
        framebuffer_nonzero_ratio() < kRootContentThreshold) {
        return false;
    }

    const int width = g_screen->width;
    const int height = g_screen->height;
    const int stride = framebuffer_stride_bytes();
    const size_t fb_bytes = framebuffer_bytes();
    char* const cur = g_screen->frameBuffer;

    if (g_prev_framebuffer.size() != fb_bytes) {
        g_prev_framebuffer.assign(cur, cur + fb_bytes);
        rfbMarkRectAsModified(g_screen, 0, 0, width, height);
        return true;
    }

    char* const prev = g_prev_framebuffer.data();
    bool any = false;

    for (int ty = 0; ty < height; ty += kTileSize) {
        const int th = std::min(kTileSize, height - ty);
        for (int tx = 0; tx < width; tx += kTileSize) {
            const int tw = std::min(kTileSize, width - tx);
            bool diff = false;

            for (int y = 0; y < th && !diff; ++y) {
                const size_t row =
                    static_cast<size_t>(ty + y) * static_cast<size_t>(stride) +
                    static_cast<size_t>(tx) * 4U;
                const size_t row_bytes = static_cast<size_t>(tw) * 4U;
                if (std::memcmp(cur + row, prev + row, row_bytes) != 0) {
                    diff = true;
                }
            }

            if (!diff) {
                continue;
            }

            rfbMarkRectAsModified(g_screen, tx, ty, tx + tw, ty + th);
            for (int y = 0; y < th; ++y) {
                const size_t row =
                    static_cast<size_t>(ty + y) * static_cast<size_t>(stride) +
                    static_cast<size_t>(tx) * 4U;
                const size_t row_bytes = static_cast<size_t>(tw) * 4U;
                std::memcpy(prev + row, cur + row, row_bytes);
            }
            any = true;
        }
    }

    if (!any) {
        ++g_capture_stats.frames_unchanged;
    }
    return any;
}

void maybe_report_capture_stats() {
    const auto now = std::chrono::steady_clock::now();
    if (g_capture_stats.last_report.time_since_epoch().count() != 0) {
        const auto elapsed =
            std::chrono::duration_cast<std::chrono::seconds>(now - g_capture_stats.last_report);
        if (elapsed.count() < 10) {
            return;
        }
    }
    g_capture_stats.last_report = now;

    if (g_client_count.load(std::memory_order_relaxed) <= 0) {
        return;
    }

    const double nz = framebuffer_nonzero_ratio();
    const char* mode =
        g_capture_mode == VncCaptureMode::SingleWindow ? "window" : "desktop";
    const char* backend = capture_gstreamer_is_active() ? capture_gstreamer_backend_name()
                                                        : "x11";
    notify_status(std::string("Screen TX [") + mode + "/" + backend + "]: ok=" +
                  std::to_string(g_capture_stats.frames_ok) + ", unchanged=" +
                  std::to_string(g_capture_stats.frames_unchanged) + ", fail=" +
                  std::to_string(g_capture_stats.frames_failed) + ", content=" +
                  std::to_string(static_cast<int>(nz * 100.0)) + "%");
}

void release_pixmap_shm() {
    if (!g_display || !g_x11.use_pixmap_shm) {
        return;
    }
    if (g_x11.pixmap_shm_image) {
        XShmDetach(g_display, &g_x11.pixmap_shm_info);
        XDestroyImage(g_x11.pixmap_shm_image);
        g_x11.pixmap_shm_image = nullptr;
    }
    if (g_x11.pixmap_shm_info.shmaddr != reinterpret_cast<char*>(-1) &&
        g_x11.pixmap_shm_info.shmid >= 0) {
        shmdt(g_x11.pixmap_shm_info.shmaddr);
        shmctl(g_x11.pixmap_shm_info.shmid, IPC_RMID, nullptr);
    }
    g_x11.pixmap_shm_info = {};
    g_x11.use_pixmap_shm = false;
}

void release_pixmap() {
    release_pixmap_shm();
}

bool init_pixmap_shm_capture() {
    if (!XShmQueryExtension(g_display)) {
        return false;
    }

    g_x11.pixmap_shm_image =
        XShmCreateImage(g_display, g_x11.visual, g_x11.depth, ZPixmap, nullptr,
                        &g_x11.pixmap_shm_info, g_x11.width, g_x11.height);
    if (!g_x11.pixmap_shm_image) {
        return false;
    }

    g_x11.pixmap_shm_info.shmid =
        shmget(IPC_PRIVATE,
               static_cast<size_t>(g_x11.pixmap_shm_image->bytes_per_line) *
                   static_cast<size_t>(g_x11.pixmap_shm_image->height),
               IPC_CREAT | 0600);
    if (g_x11.pixmap_shm_info.shmid < 0) {
        XDestroyImage(g_x11.pixmap_shm_image);
        g_x11.pixmap_shm_image = nullptr;
        return false;
    }

    g_x11.pixmap_shm_info.shmaddr =
        static_cast<char*>(shmat(g_x11.pixmap_shm_info.shmid, nullptr, 0));
    if (g_x11.pixmap_shm_info.shmaddr == reinterpret_cast<char*>(-1)) {
        shmctl(g_x11.pixmap_shm_info.shmid, IPC_RMID, nullptr);
        XDestroyImage(g_x11.pixmap_shm_image);
        g_x11.pixmap_shm_image = nullptr;
        return false;
    }

    g_x11.pixmap_shm_image->data = g_x11.pixmap_shm_info.shmaddr;
    if (!XShmAttach(g_display, &g_x11.pixmap_shm_info)) {
        release_pixmap_shm();
        return false;
    }

    g_x11.use_pixmap_shm = true;
    return true;
}

bool capture_via_pixmap(char* framebuffer) {
    if (!g_display || !framebuffer) {
        return false;
    }

    if (g_x11.use_pixmap_shm && g_x11.pixmap_shm_image) {
        if (XShmGetImage(g_display, g_x11.root, g_x11.pixmap_shm_image, 0, 0, AllPlanes)) {
            // Verify stride match: if bytes_per_line != width*4 there is padding
            // that would cause image tiling. Fall through to XGetImage if mismatched.
            const int expected_stride = g_x11.width * 4;
            if (g_x11.pixmap_shm_image->bytes_per_line == expected_stride) {
                convert_ximage_to_framebuffer(g_x11.pixmap_shm_image, framebuffer);
                return true;
            }
            notify_status("XShm stride mismatch: bytes_per_line=" +
                          std::to_string(g_x11.pixmap_shm_image->bytes_per_line) +
                          " expected=" + std::to_string(expected_stride) +
                          " — falling back to XGetImage");
        }
    }

    XImage* image = XGetImage(g_display, g_x11.root, 0, 0, g_x11.width, g_x11.height, AllPlanes,
                              ZPixmap);
    if (!image) {
        return false;
    }

    convert_ximage_to_framebuffer(image, framebuffer);
    XDestroyImage(image);
    return true;
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
    g_x11.bytes_per_pixel = 4;
    g_x11.native_bgrx =
        (g_x11.red_mask == 0xff0000UL && g_x11.green_mask == 0xff00UL && g_x11.blue_mask == 0xffUL);
    return true;
}

bool init_x11_capture_backends() {
    int composite_event = 0, composite_error = 0;
    if (XCompositeQueryExtension(g_display, &composite_event, &composite_error)) {
        g_x11.use_xcomposite = true;
    }

    int damage_error = 0;
    if (XDamageQueryExtension(g_display, &g_x11.damage_event_base, &damage_error)) {
        g_x11.damage_handle = XDamageCreate(g_display, g_x11.root, XDamageReportRawRectangles);
        g_x11.use_xdamage = true;
    }

    if (!init_pixmap_shm_capture()) {
        notify_status("XShm unavailable — using slower XGetImage readback");
    }
    return true;
}

bool verify_screen_capture() {
    if (!capture_full_desktop()) {
        if (!g_last_x_error.empty()) {
            notify_status("Screen capture failed: " + g_last_x_error);
        } else {
            notify_status("Screen capture failed");
        }
        return false;
    }

    const double content = framebuffer_nonzero_ratio();
    if (g_capture_mode == VncCaptureMode::SingleWindow) {
        if (content < kRootContentThreshold) {
            notify_status("Warning: selected window capture looks empty.");
        } else {
            notify_status("Screen capture ready (single window, X11)");
        }
        return true;
    }

    if (content < kRootContentThreshold) {
        notify_status("Warning: desktop capture looks empty on this display.");
    } else {
        notify_status("Screen capture ready (full desktop, " +
                      std::string(g_x11.use_xcomposite ? "XComposite" : "root pixmap") + " + " +
                      std::to_string(g_stacked_windows.size()) + " windows)");
    }
    return true;
}

bool capture_root_window() {
    if (!g_display || !g_screen || !g_screen->frameBuffer) {
        return false;
    }

    g_last_x_error.clear();

    const bool captured = capture_full_desktop();
    if (!captured && g_capture_stats.frames_ok < 2) {
        ++g_capture_stats.root_black_fallbacks;
    }

    if (captured) {
        ++g_capture_stats.frames_ok;
        maybe_report_capture_stats();
    } else {
        ++g_capture_stats.frames_failed;
        if (!g_last_x_error.empty()) {
            notify_status(g_last_x_error);
        }
        maybe_report_capture_stats();
    }

    return captured;
}

void cleanup_x11_capture() {
    if (g_x11.use_xdamage && g_x11.damage_handle) {
        XDamageDestroy(g_display, g_x11.damage_handle);
    }
    capture_gstreamer_shutdown();
    release_pixmap();
    g_x11 = {};
    g_capture_mode = VncCaptureMode::FullDesktop;
    g_target_window = 0;
    g_stacked_windows.clear();
    g_prev_framebuffer.clear();
}

void server_thread_main(VncServerOptions options) {
    // Save GTK's X11 error handler and install ours only for the server lifetime.
    // XSetErrorHandler is process-global; replacing it permanently would break GTK's
    // X11 error recovery on the main thread and corrupt widget state.
    const XErrorHandler prev_x11_handler = XSetErrorHandler(x11_error_handler);

    g_display = XOpenDisplay(nullptr);
    if (!g_display) {
        notify_status("Failed to open X11 display (DISPLAY unset?)");
        g_running.store(false);
        return;
    }

    g_capture_mode = options.capture_mode;
    g_target_window = static_cast<Window>(options.target_window);

    if (!init_x11_display_info()) {
        cleanup_x11_capture();
        XCloseDisplay(g_display);
        g_display = nullptr;
        g_running.store(false);
        return;
    }

    if (g_capture_mode == VncCaptureMode::SingleWindow) {
        if (!g_target_window) {
            notify_status("No window selected for single-window sharing");
            cleanup_x11_capture();
            XCloseDisplay(g_display);
            g_display = nullptr;
            g_running.store(false);
            return;
        }

        XWindowAttributes target_attr{};
        if (XGetWindowAttributes(g_display, g_target_window, &target_attr) != 1 ||
            target_attr.map_state != IsViewable || target_attr.width < kMinWindowSize ||
            target_attr.height < kMinWindowSize) {
            notify_status("Selected window is not available");
            cleanup_x11_capture();
            XCloseDisplay(g_display);
            g_display = nullptr;
            g_running.store(false);
            return;
        }
        g_x11.width = target_attr.width;
        g_x11.height = target_attr.height;
    }

    const int native_w = g_x11.width;
    const int native_h = g_x11.height;
    g_capture_scale_percent = clamp_capture_scale_percent(options.capture_scale_percent);
    const int width = scaled_vnc_dimension(native_w, g_capture_scale_percent);
    const int height = scaled_vnc_dimension(native_h, g_capture_scale_percent);
    const int bytes_per_pixel = g_x11.bytes_per_pixel;

    notify_status("Native capture " + std::to_string(native_w) + "x" + std::to_string(native_h) +
                  " → VNC " + std::to_string(width) + "x" + std::to_string(height) + " (" +
                  std::to_string(g_capture_scale_percent) + "%)");

    int argc = 1;
    char arg0[] = "vncserver";
    char* argv[] = {arg0, nullptr};

    g_screen = rfbGetScreen(&argc, argv, width, height, 8, 3, bytes_per_pixel);
    if (!g_screen) {
        notify_status("rfbGetScreen failed");
        cleanup_x11_capture();
        XCloseDisplay(g_display);
        g_display = nullptr;
        g_running.store(false);
        return;
    }

    g_screen->desktopName = const_cast<char*>("VNCServerLinuxGTK");
    // Framebuffer bytes are BGRx (B,G,R,0) — match libvncserver's default shifts.
    g_screen->serverFormat.bitsPerPixel = 32;
    g_screen->serverFormat.depth = 24;
    g_screen->serverFormat.bigEndian = FALSE;
    g_screen->serverFormat.trueColour = TRUE;
    g_screen->serverFormat.redMax = 255;
    g_screen->serverFormat.greenMax = 255;
    g_screen->serverFormat.blueMax = 255;
    g_screen->serverFormat.redShift = 16;
    g_screen->serverFormat.greenShift = 8;
    g_screen->serverFormat.blueShift = 0;
    g_screen->port = options.port;
    g_screen->ipv6port = options.port;
    g_screen->alwaysShared = TRUE;
    g_screen->displayHook = vnc_display_hook;
    g_screen->displayFinishedHook = vnc_display_finished_hook;
    g_screen->newClientHook = new_client_hook;
    g_screen->kbdAddEvent = kbd_add_event;
    g_screen->ptrAddEvent = ptr_add_event;
    g_screen->setDesktopSizeHook = desktop_resize_hook;

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

    const size_t fb_size = static_cast<size_t>(width) * static_cast<size_t>(height) *
                           static_cast<size_t>(bytes_per_pixel);
    if (g_screen->frameBuffer) {
        free(g_screen->frameBuffer);
    }
    g_screen->frameBuffer = static_cast<char*>(malloc(fb_size));
    if (g_screen->frameBuffer) {
        std::memset(g_screen->frameBuffer, 0, fb_size);
    }
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

    if (!init_x11_capture_backends()) {
        rfbScreenCleanup(g_screen);
        g_screen = nullptr;
        cleanup_x11_capture();
        XCloseDisplay(g_display);
        g_display = nullptr;
        g_running.store(false);
        return;
    }

    configure_vnc_server_performance();
    rfbInitServer(g_screen);

    if (g_allow_input) {
        const int screen_w = DisplayWidth(g_display, g_x11.screen);
        const int screen_h = DisplayHeight(g_display, g_x11.screen);
        std::string input_backend;
        if (input_inject_init(g_display, screen_w, screen_h, &input_backend)) {
            notify_status("입력: uinput (가상 마우스/키보드) — Wayland·X11 공통");
        } else if (std::getenv("WAYLAND_DISPLAY")) {
            notify_status(
                "입력: XTest(X11) 폴백 — Wayland 네이티브 앱에는 입력이 제한될 수 있습니다. "
                "/dev/uinput 권한(input 그룹)을 확인하세요.");
        } else {
            notify_status("입력: XTest(X11) — uinput 초기화 실패 (/dev/uinput 권한 확인)");
        }
    }

    if (g_capture_mode == VncCaptureMode::SingleWindow) {
        notify_status("VNC server listening on port " + std::to_string(options.port) +
                      " (single window, " + std::to_string(g_capture_scale_percent) +
                      "%, ~15 fps)");
    } else {
        notify_status("VNC server listening on port " + std::to_string(options.port) +
                      " (full desktop, " + std::to_string(g_capture_scale_percent) + "%, ~15 fps)");
    }

    // Portal dialog can block for minutes; run it on a helper thread and keep
    // calling rfbProcessEvents so the listen socket accepts vncviewer connections.
    g_portal_setup_complete.store(false, std::memory_order_release);

    if (g_capture_mode == VncCaptureMode::FullDesktop) {
        notify_status("화면 공유 권한을 요청 중입니다 (Portal)...");
        std::atomic<bool> portal_finished{false};
        bool portal_ok = false;
        const int capture_w = g_x11.width;
        const int capture_h = g_x11.height;
        std::thread portal_worker([&]() {
            portal_ok = capture_gstreamer_init_desktop(capture_w, capture_h, notify_status);
            portal_finished.store(true, std::memory_order_release);
        });

        while (!portal_finished.load(std::memory_order_acquire) &&
               g_running.load(std::memory_order_relaxed)) {
            rfbProcessEvents(g_screen, 200 * 1000);
        }

        if (portal_worker.joinable()) {
            portal_worker.join();
        }

        g_portal_setup_complete.store(true, std::memory_order_release);

        if (portal_ok) {
            notify_status(std::string("캡처 백엔드: ") + capture_gstreamer_backend_name());
            for (int attempt = 0; attempt < 30; ++attempt) {
                if (capture_root_window() &&
                    framebuffer_nonzero_ratio() >= kRootContentThreshold) {
                    push_framebuffer_updates_to_all_clients();
                    break;
                }
                rfbProcessEvents(g_screen, 100 * 1000);
                usleep(100 * 1000);
            }
        } else if (std::getenv("WAYLAND_DISPLAY")) {
            notify_status("Wayland: 화면 공유(Portal)가 필요합니다. 대화상자에서 모니터(전체 화면)를 선택하세요.");
        } else {
            notify_status("Portal 캡처 불가 — X11 root 폴백 사용");
            if (capture_root_window()) {
                push_framebuffer_updates_to_all_clients();
            }
        }
    } else {
        g_portal_setup_complete.store(true, std::memory_order_release);
    }

    if (!verify_screen_capture()) {
        notify_status("Warning: initial screen capture check failed; retrying in loop");
    }

    g_last_capture_time = std::chrono::steady_clock::now();

    while (g_running.load(std::memory_order_relaxed)) {
        rfbProcessEvents(g_screen, 5 * 1000);

        if (g_pending_encoder_reset) {
            reset_client_tight_state_after_resize();
            g_pending_encoder_reset = false;
        }

        // Free framebuffers replaced during the resize hook above.
        for (char* old_fb : g_deferred_fbs) {
            free(old_fb);
        }
        g_deferred_fbs.clear();

        // Drain X11 events — XDamage notifications accumulate and must be
        // acknowledged with XDamageSubtract, otherwise they flood the queue.
        while (XPending(g_display)) {
            XEvent ev;
            XNextEvent(g_display, &ev);
            if (g_x11.use_xdamage && ev.type == g_x11.damage_event_base + XDamageNotify) {
                XDamageSubtract(g_display, g_x11.damage_handle, None, None);
            }
        }

        if (g_client_count.load(std::memory_order_relaxed) <= 0) {
            continue;
        }

        const auto now = std::chrono::steady_clock::now();
        const auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            now - g_last_capture_time);
        if (elapsed_ms.count() < kCaptureIntervalMs) {
            continue;
        }
        g_last_capture_time = now;

        if (capture_root_window()) {
            mark_framebuffer_changes();
        }
    }

    rfbShutdownServer(g_screen, TRUE);
    rfbScreenCleanup(g_screen);
    g_screen = nullptr;

    input_inject_shutdown();
    cleanup_x11_capture();
    XCloseDisplay(g_display);
    g_display = nullptr;
    if (g_password_list[0]) {
        free(g_password_list[0]);
        g_password_list[0] = nullptr;
    }
    g_plain_password.clear();
    g_capture_stats = {};
    g_stacked_windows.clear();
    g_prev_framebuffer.clear();
    g_pending_encoder_reset = false;
    g_force_raw_after_resize = false;
    g_portal_setup_complete.store(false, std::memory_order_release);
    for (char* old_fb : g_deferred_fbs) {
        free(old_fb);
    }
    g_deferred_fbs.clear();

    XSetErrorHandler(prev_x11_handler);

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
        g_on_status = nullptr;
        g_on_clients = nullptr;
        worker = std::move(g_worker);
    }
    if (worker.joinable()) {
        worker.join();
    }
    clear_client_hosts();
    g_client_count.store(0, std::memory_order_relaxed);
}

bool vnc_server_is_running() {
    return g_running.load(std::memory_order_relaxed);
}

int vnc_server_client_count() {
    return g_client_count.load(std::memory_order_relaxed);
}
