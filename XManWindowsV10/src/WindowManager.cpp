#include "WindowManager.h"
#include "DirectXRenderer.h"
#include <iostream>
#include <windowsx.h>

// Windows.h CreateWindow/MapWindow 매크로 충돌 방지
#ifdef CreateWindow
#undef CreateWindow
#endif
#ifdef MapWindow
#undef MapWindow
#endif

namespace XMan
{

// ─── X11 이벤트 마스크 비트 ────────────────────────────────────────────────
static constexpr uint32_t KeyPressMask      = 0x00000001;
static constexpr uint32_t KeyReleaseMask    = 0x00000002;
static constexpr uint32_t ButtonPressMask   = 0x00000004;
static constexpr uint32_t ButtonReleaseMask = 0x00000008;
static constexpr uint32_t PointerMotionMask = 0x00000040;
static constexpr uint32_t ExposureMask      = 0x00008000;
static constexpr uint32_t StructureNotifyMask = 0x00020000;

// ─── VK → X11 keysym 변환 ───────────────────────────────────────────────────
static uint32_t vkToKeysym(UINT vk, bool shift)
{
    if (vk >= 'A' && vk <= 'Z')
        return shift ? (uint32_t)vk : (uint32_t)(vk + 0x20);
    if (vk >= '0' && vk <= '9')
    {
        if (!shift) return (uint32_t)vk;
        static const char shiftMap[] = ")!@#$%^&*(";
        return (uint32_t)(unsigned char)shiftMap[vk - '0'];
    }
    switch (vk)
    {
    case VK_SPACE:   return 0x0020;
    case VK_RETURN:  return 0xff0d;
    case VK_ESCAPE:  return 0xff1b;
    case VK_BACK:    return 0xff08;
    case VK_TAB:     return 0xff09;
    case VK_DELETE:  return 0xffff;
    case VK_INSERT:  return 0xff63;
    case VK_HOME:    return 0xff50;
    case VK_END:     return 0xff57;
    case VK_PRIOR:   return 0xff55;
    case VK_NEXT:    return 0xff56;
    case VK_LEFT:    return 0xff51;
    case VK_UP:      return 0xff52;
    case VK_RIGHT:   return 0xff53;
    case VK_DOWN:    return 0xff54;
    case VK_F1:      return 0xffbe; case VK_F2:  return 0xffbf;
    case VK_F3:      return 0xffc0; case VK_F4:  return 0xffc1;
    case VK_F5:      return 0xffc2; case VK_F6:  return 0xffc3;
    case VK_F7:      return 0xffc4; case VK_F8:  return 0xffc5;
    case VK_F9:      return 0xffc6; case VK_F10: return 0xffc7;
    case VK_F11:     return 0xffc8; case VK_F12: return 0xffc9;
    case VK_LSHIFT: case VK_SHIFT:    return 0xffe1;
    case VK_RSHIFT:                   return 0xffe2;
    case VK_LCONTROL: case VK_CONTROL: return 0xffe3;
    case VK_RCONTROL:                 return 0xffe4;
    case VK_LMENU: case VK_MENU:      return 0xffe9;
    case VK_RMENU:                    return 0xffea;
    case VK_OEM_MINUS:  return shift ? 0x5f : 0x2d;
    case VK_OEM_PLUS:   return shift ? 0x3d : 0x2b;
    case VK_OEM_4:      return shift ? 0x7b : 0x5b;
    case VK_OEM_6:      return shift ? 0x7d : 0x5d;
    case VK_OEM_5:      return shift ? 0x7c : 0x5c;
    case VK_OEM_1:      return shift ? 0x3a : 0x3b;
    case VK_OEM_7:      return shift ? 0x22 : 0x27;
    case VK_OEM_COMMA:  return shift ? 0x3c : 0x2c;
    case VK_OEM_PERIOD: return shift ? 0x3e : 0x2e;
    case VK_OEM_2:      return shift ? 0x3f : 0x2f;
    case VK_OEM_3:      return shift ? 0x7e : 0x60;
    }
    return 0;
}

static uint16_t GetModifierState()
{
    uint16_t state = 0;
    if (GetAsyncKeyState(VK_SHIFT)   & 0x8000) state |= 0x0001; // ShiftMask
    if (GetAsyncKeyState(VK_CAPITAL) & 0x0001) state |= 0x0002; // LockMask
    if (GetAsyncKeyState(VK_CONTROL) & 0x8000) state |= 0x0004; // ControlMask
    if (GetAsyncKeyState(VK_MENU)    & 0x8000) state |= 0x0008; // Mod1Mask (Alt)
    if (GetAsyncKeyState(VK_LBUTTON) & 0x8000) state |= 0x0100; // Button1Mask
    if (GetAsyncKeyState(VK_MBUTTON) & 0x8000) state |= 0x0200; // Button2Mask
    if (GetAsyncKeyState(VK_RBUTTON) & 0x8000) state |= 0x0400; // Button3Mask
    return state;
}

// ─── 이벤트 빌더 헬퍼 ──────────────────────────────────────────────────────
static void PutU16(std::vector<uint8_t>& v, size_t off, uint16_t val)
{
    v[off]   = val & 0xFF;
    v[off+1] = (val >> 8) & 0xFF;
}
static void PutU32(std::vector<uint8_t>& v, size_t off, uint32_t val)
{
    v[off]   = val & 0xFF;
    v[off+1] = (val >> 8) & 0xFF;
    v[off+2] = (val >> 16) & 0xFF;
    v[off+3] = (val >> 24) & 0xFF;
}

// ─── WindowManager ─────────────────────────────────────────────────────────
WindowManager::WindowManager()
    : m_startTime(std::chrono::steady_clock::now())
{
}

WindowManager::~WindowManager()
{
    Shutdown();
}

bool WindowManager::Initialize(HINSTANCE hInstance)
{
    m_hInstance = hInstance;

    WNDCLASSEXW wc{};
    wc.cbSize        = sizeof(WNDCLASSEXW);
    wc.style         = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc   = WindowProc;
    wc.hInstance     = hInstance;
    wc.hCursor       = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = L"XManWindow";

    m_windowClass = RegisterClassExW(&wc);
    if (!m_windowClass)
    {
        std::cerr << "Failed to register window class" << std::endl;
        return false;
    }

    std::cout << "WindowManager initialized" << std::endl;
    return true;
}

void WindowManager::Shutdown()
{
    std::unique_lock<std::mutex> lk(m_drawableMutex);

    for (auto &pair : m_windows)
    {
        lk.unlock();
        DestroyBackingStore(pair.first);
        lk.lock();
        if (pair.second.hwnd)
            DestroyWindow(pair.second.hwnd);
    }
    m_windows.clear();
    m_hwndToXid.clear();

    for (auto &pair : m_pixmaps)
    {
        if (pair.second.dc)     DeleteDC(pair.second.dc);
        if (pair.second.bitmap) DeleteObject(pair.second.bitmap);
    }
    m_pixmaps.clear();

    if (m_windowClass && m_hInstance)
    {
        UnregisterClassW(L"XManWindow", m_hInstance);
        m_windowClass = 0;
    }
}

uint32_t WindowManager::GetTimestamp() const
{
    auto now = std::chrono::steady_clock::now();
    return static_cast<uint32_t>(
        std::chrono::duration_cast<std::chrono::milliseconds>(now - m_startTime).count());
}

// ─── 창 생성/매핑 (수신 스레드 → 메인 스레드로 위임) ─────────────────────

Window WindowManager::CreateXWindow(Window wid, Window parent,
                                    int x, int y, int width, int height,
                                    std::shared_ptr<EventQueue> clientEvents)
{
    // HWND를 수신 스레드에서 직접 생성 (postSync 제거 → 빠르고 데드락 없음)
    HWND hwnd = CreateWin32Window(x, y, width, height);

    {
        std::lock_guard<std::mutex> lk(m_drawableMutex);
        XWindowInfo info{};
        info.xid          = wid;
        info.hwnd         = hwnd;
        info.x            = x; info.y = y;
        info.width        = width; info.height = height;
        info.parent       = parent;
        info.mapped       = false;
        info.clientEvents = clientEvents;
        m_windows[wid]    = info;
        if (hwnd)
        {
            m_hwndToXid[hwnd] = wid;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));
        }
    }

    std::cout << "CreateXWindow: wid=" << wid
              << " " << width << "x" << height
              << " at (" << x << "," << y << ")" << std::endl;
    return wid;
}


bool WindowManager::MapWindow(Window xid)
{
    // 수신 스레드에서 직접 실행 (postSync 불필요)
    ExecuteMapWindow(xid);
    return true;
}

void WindowManager::ExecuteMapWindow(Window xid)
{
    std::unique_lock<std::mutex> lk(m_drawableMutex);
    auto it = m_windows.find(xid);
    if (it == m_windows.end())
        return;

    it->second.mapped = true;

    HWND hwnd = it->second.hwnd;
    int  w    = it->second.width;
    int  h    = it->second.height;
    auto eq   = it->second.clientEvents;
    lk.unlock();

    if (hwnd)
    {
        CreateBackingStore(xid);
        ShowWindow(hwnd, SW_SHOW);
        UpdateWindow(hwnd);
    }
    // Expose는 X11Protocol::ProcessMapWindow에서 m_pendingResponse로 전송
}

bool WindowManager::UnmapWindow(Window xid)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    auto it = m_windows.find(xid);
    if (it == m_windows.end())
        return false;
    it->second.mapped = false;
    if (it->second.hwnd)
        ShowWindow(it->second.hwnd, SW_HIDE);
    return true;
}

std::vector<Window> WindowManager::GetMappedChildren(Window parent)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    std::vector<Window> result;
    for (auto &pair : m_windows)
        if (pair.second.parent == parent && pair.second.mapped)
            result.push_back(pair.first);
    return result;
}

void WindowManager::MapSubwindows(Window parent)
{
    auto children = GetUnmappedChildren(parent);
    for (Window child : children)
        MapWindow(child);
}

std::vector<Window> WindowManager::GetUnmappedChildren(Window parent)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    std::vector<Window> result;
    for (auto &pair : m_windows)
        if (pair.second.parent == parent && !pair.second.mapped)
            result.push_back(pair.first);
    return result;
}

bool WindowManager::DestroyXWindow(Window xid)
{
    DestroyBackingStore(xid);
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    auto it = m_windows.find(xid);
    if (it == m_windows.end())
        return false;
    if (it->second.hwnd)
    {
        m_hwndToXid.erase(it->second.hwnd);
        DestroyWindow(it->second.hwnd);
    }
    m_windows.erase(it);
    return true;
}

bool WindowManager::ConfigureWindow(Window xid, int x, int y, int width, int height)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    auto it = m_windows.find(xid);
    if (it == m_windows.end())
        return false;
    it->second.x = x; it->second.y = y;
    it->second.width = width; it->second.height = height;
    if (it->second.hwnd)
        SetWindowPos(it->second.hwnd, nullptr, x, y, width, height,
                     SWP_NOZORDER | SWP_NOACTIVATE);
    return true;
}

// ─── 픽스맵 ────────────────────────────────────────────────────────────────

bool WindowManager::CreatePixmap(Drawable xid, int width, int height, int depth)
{
    HDC screenDC = GetDC(nullptr);
    HDC dc       = CreateCompatibleDC(screenDC);
    HBITMAP bmp  = CreateCompatibleBitmap(screenDC, width, height);
    ReleaseDC(nullptr, screenDC);

    if (!dc || !bmp)
    {
        if (dc)  DeleteDC(dc);
        if (bmp) DeleteObject(bmp);
        return false;
    }
    SelectObject(dc, bmp);

    // 흰색으로 초기화
    RECT r = {0, 0, width, height};
    FillRect(dc, &r, (HBRUSH)GetStockObject(WHITE_BRUSH));

    std::lock_guard<std::mutex> lk(m_drawableMutex);
    PixmapInfo info{xid, width, height, depth, dc, bmp};
    m_pixmaps[xid] = info;
    return true;
}

bool WindowManager::FreePixmap(Drawable xid)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    auto it = m_pixmaps.find(xid);
    if (it == m_pixmaps.end())
        return false;
    if (it->second.dc)     DeleteDC(it->second.dc);
    if (it->second.bitmap) DeleteObject(it->second.bitmap);
    m_pixmaps.erase(it);
    return true;
}

// ─── 공통 Drawable 헬퍼 ───────────────────────────────────────────────────

HDC WindowManager::GetDrawableDC(Drawable d)
{
    bool isWindow = false;
    bool needBacking = false;
    {
        std::lock_guard<std::mutex> lk(m_drawableMutex);
        auto wIt = m_windows.find(d);
        if (wIt != m_windows.end())
        {
            isWindow = true;
            if (wIt->second.backingDC)
                return wIt->second.backingDC;
            needBacking = true;
        }
    }

    if (isWindow && needBacking)
    {
        CreateBackingStore(d); // 내부에서 mutex 사용
        std::lock_guard<std::mutex> lk(m_drawableMutex);
        auto wIt = m_windows.find(d);
        if (wIt != m_windows.end())
            return wIt->second.backingDC;
        return nullptr;
    }

    auto pIt = m_pixmaps.find(d);
    if (pIt != m_pixmaps.end())
        return pIt->second.dc;

    return nullptr;
}

bool WindowManager::GetDrawableSize(Drawable d, int &w, int &h)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);

    auto wIt = m_windows.find(d);
    if (wIt != m_windows.end())
    {
        w = wIt->second.width; h = wIt->second.height;
        return true;
    }

    auto pIt = m_pixmaps.find(d);
    if (pIt != m_pixmaps.end())
    {
        w = pIt->second.width; h = pIt->second.height;
        return true;
    }

    return false;
}

void WindowManager::FlushToScreen(Window xid)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    auto it = m_windows.find(xid);
    if (it != m_windows.end() && it->second.hwnd)
    {
        InvalidateRect(it->second.hwnd, nullptr, FALSE);
        UpdateWindow(it->second.hwnd);
    }
}

void WindowManager::CopyArea(Drawable src, Drawable dst,
                              int srcX, int srcY, int w, int h,
                              int dstX, int dstY)
{
    HDC srcDC = GetDrawableDC(src);
    HDC dstDC = GetDrawableDC(dst);
    if (!srcDC || !dstDC)
        return;

    BitBlt(dstDC, dstX, dstY, w, h, srcDC, srcX, srcY, SRCCOPY);

    // dst가 창이면 화면 갱신
    {
        std::lock_guard<std::mutex> lk(m_drawableMutex);
        auto it = m_windows.find(dst);
        if (it != m_windows.end() && it->second.hwnd)
        {
            InvalidateRect(it->second.hwnd, nullptr, FALSE);
            UpdateWindow(it->second.hwnd);
        }
    }
}

// ─── 이벤트 ────────────────────────────────────────────────────────────────

void WindowManager::UpdateEventMask(Window xid, uint32_t mask)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    auto it = m_windows.find(xid);
    if (it != m_windows.end())
        it->second.eventMask = mask;
}

void WindowManager::SendEventToWindow(Window xid, std::vector<uint8_t> event)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    auto it = m_windows.find(xid);
    if (it != m_windows.end() && it->second.clientEvents)
        it->second.clientEvents->push(std::move(event));
}

XWindowInfo *WindowManager::GetWindowInfo(Window xid)
{
    // NOTE: 호출자가 m_drawableMutex를 직접 잡지 않음 — 단기 조회용
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    auto it = m_windows.find(xid);
    return it != m_windows.end() ? &it->second : nullptr;
}

void WindowManager::SetRenderer(std::shared_ptr<DirectXRenderer> renderer)
{
    m_renderer = renderer;
}

// ─── GDI 그리기 ────────────────────────────────────────────────────────────

void WindowManager::GDIDrawOnDC(HDC dc, bool fill, COLORREF color,
                                 const RECT *rects, int count, bool ellipse)
{
    if (!dc || count <= 0)
        return;

    HPEN   pen   = fill ? CreatePen(PS_NULL, 0, 0) : CreatePen(PS_SOLID, 1, color);
    HBRUSH brush = fill ? CreateSolidBrush(color) : (HBRUSH)GetStockObject(NULL_BRUSH);
    HPEN   oldPen   = (HPEN)SelectObject(dc, pen);
    HBRUSH oldBrush = (HBRUSH)SelectObject(dc, brush);

    for (int i = 0; i < count; i++)
    {
        if (ellipse)
            Ellipse(dc, rects[i].left, rects[i].top, rects[i].right, rects[i].bottom);
        else
            Rectangle(dc, rects[i].left, rects[i].top, rects[i].right, rects[i].bottom);
    }

    SelectObject(dc, oldBrush);
    SelectObject(dc, oldPen);
    DeleteObject(pen);
    if (fill) DeleteObject(brush);
}

void WindowManager::GDIFillEllipses(Drawable d, COLORREF color, const RECT *rects, int count)
{
    HDC dc = GetDrawableDC(d);
    GDIDrawOnDC(dc, true, color, rects, count, true);
    FlushToScreen(static_cast<Window>(d));
}

void WindowManager::GDIDrawEllipses(Drawable d, COLORREF color, const RECT *rects, int count)
{
    HDC dc = GetDrawableDC(d);
    GDIDrawOnDC(dc, false, color, rects, count, true);
    FlushToScreen(static_cast<Window>(d));
}

void WindowManager::GDIFillRects(Drawable d, COLORREF color, const RECT *rects, int count)
{
    HDC dc = GetDrawableDC(d);
    if (!dc) return;
    HBRUSH brush = CreateSolidBrush(color);
    for (int i = 0; i < count; i++)
    {
        RECT r = rects[i];
        FillRect(dc, &r, brush);
    }
    DeleteObject(brush);
    FlushToScreen(static_cast<Window>(d));
}

void WindowManager::GDIDrawLines(Drawable d, COLORREF color,
                                  const POINT *points, int count)
{
    if (count < 2) return;
    HDC dc = GetDrawableDC(d);
    if (!dc) return;
    HPEN pen = CreatePen(PS_SOLID, 1, color);
    HPEN old = (HPEN)SelectObject(dc, pen);
    MoveToEx(dc, points[0].x, points[0].y, nullptr);
    for (int i = 1; i < count; i++)
        LineTo(dc, points[i].x, points[i].y);
    SelectObject(dc, old);
    DeleteObject(pen);
    FlushToScreen(static_cast<Window>(d));
}

void WindowManager::GDIClearArea(Window xid, int x, int y, int w, int h)
{
    HDC dc = GetDrawableDC(xid);
    if (!dc) return;
    RECT r = {x, y, x + w, y + h};
    FillRect(dc, &r, (HBRUSH)GetStockObject(WHITE_BRUSH));
    FlushToScreen(xid);
}

void WindowManager::GDIPutImage(Drawable d, int x, int y, int w, int h,
                                 int depth, int format, const uint8_t *data, size_t dataLen)
{
    HDC dc = GetDrawableDC(d);
    if (!dc) return;
    (void)depth; (void)format; (void)dataLen;

    // ZPixmap (format=2): data는 width*height*bytesPerPixel 배열
    BITMAPINFO bmi{};
    bmi.bmiHeader.biSize        = sizeof(BITMAPINFOHEADER);
    bmi.bmiHeader.biWidth       = w;
    bmi.bmiHeader.biHeight      = -h; // top-down
    bmi.bmiHeader.biPlanes      = 1;
    bmi.bmiHeader.biBitCount    = 32;
    bmi.bmiHeader.biCompression = BI_RGB;

    SetDIBitsToDevice(dc, x, y, w, h, 0, 0, 0, h, data, &bmi, DIB_RGB_COLORS);
    FlushToScreen(static_cast<Window>(d));
}

// ─── 이벤트 빌더 ──────────────────────────────────────────────────────────

std::vector<uint8_t> WindowManager::BuildExposeEvent(Window xid, int x, int y, int w, int h)
{
    std::vector<uint8_t> ev(32, 0);
    ev[0] = 12; // Expose
    PutU32(ev, 4, xid);
    PutU16(ev, 8,  (uint16_t)x);
    PutU16(ev, 10, (uint16_t)y);
    PutU16(ev, 12, (uint16_t)w);
    PutU16(ev, 14, (uint16_t)h);
    return ev;
}

std::vector<uint8_t> WindowManager::BuildKeyEvent(Window xid, uint8_t code,
                                                    WPARAM vk, bool shift,
                                                    bool /*ctrl*/, bool /*alt*/)
{
    std::vector<uint8_t> ev(32, 0);
    ev[0] = code; // 2=KeyPress, 3=KeyRelease
    ev[1] = static_cast<uint8_t>(vk); // keycode = VK code
    PutU32(ev, 4,  GetTimestamp());
    PutU32(ev, 8,  1); // root window
    PutU32(ev, 12, xid); // event window
    PutU16(ev, 24, GetModifierState());
    ev[30] = 1; // same-screen
    (void)shift;
    return ev;
}

std::vector<uint8_t> WindowManager::BuildButtonEvent(Window xid, uint8_t code,
                                                       uint8_t button, int x, int y,
                                                       uint16_t state)
{
    std::vector<uint8_t> ev(32, 0);
    ev[0] = code; // 4=ButtonPress, 5=ButtonRelease
    ev[1] = button;
    PutU32(ev, 4,  GetTimestamp());
    PutU32(ev, 8,  1); // root
    PutU32(ev, 12, xid);
    PutU16(ev, 20, (uint16_t)x);
    PutU16(ev, 22, (uint16_t)y);
    PutU16(ev, 24, state);
    ev[30] = 1;
    return ev;
}

std::vector<uint8_t> WindowManager::BuildMotionEvent(Window xid, int x, int y, uint16_t state)
{
    std::vector<uint8_t> ev(32, 0);
    ev[0] = 6; // MotionNotify
    PutU32(ev, 4,  GetTimestamp());
    PutU32(ev, 8,  1); // root
    PutU32(ev, 12, xid);
    PutU16(ev, 20, (uint16_t)x);
    PutU16(ev, 22, (uint16_t)y);
    PutU16(ev, 24, state);
    ev[30] = 1;
    return ev;
}

std::vector<uint8_t> WindowManager::BuildConfigureNotify(Window xid)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    auto it = m_windows.find(xid);
    if (it == m_windows.end())
        return {};

    std::vector<uint8_t> ev(32, 0);
    ev[0] = 22; // ConfigureNotify
    PutU32(ev, 4,  xid);
    PutU32(ev, 8,  xid);
    PutU16(ev, 12, (uint16_t)it->second.x);
    PutU16(ev, 14, (uint16_t)it->second.y);
    PutU16(ev, 16, (uint16_t)it->second.width);
    PutU16(ev, 18, (uint16_t)it->second.height);
    return ev;
}

// ─── 백킹 스토어 ──────────────────────────────────────────────────────────

bool WindowManager::CreateBackingStore(Window xid)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    auto it = m_windows.find(xid);
    if (it == m_windows.end() || !it->second.hwnd)
        return false;
    if (it->second.backingDC)
        return true;

    XWindowInfo &info = it->second;
    HDC screenDC  = GetDC(info.hwnd);
    info.backingDC     = CreateCompatibleDC(screenDC);
    info.backingBitmap = CreateCompatibleBitmap(screenDC, info.width, info.height);
    SelectObject(info.backingDC, info.backingBitmap);
    ReleaseDC(info.hwnd, screenDC);

    RECT r = {0, 0, info.width, info.height};
    FillRect(info.backingDC, &r, (HBRUSH)GetStockObject(WHITE_BRUSH));
    return true;
}

void WindowManager::DestroyBackingStore(Window xid)
{
    std::lock_guard<std::mutex> lk(m_drawableMutex);
    auto it = m_windows.find(xid);
    if (it == m_windows.end())
        return;
    if (it->second.backingDC)   { DeleteDC(it->second.backingDC);           it->second.backingDC = nullptr; }
    if (it->second.backingBitmap){ DeleteObject(it->second.backingBitmap);   it->second.backingBitmap = nullptr; }
}

// ─── ProcessMessages (메인 스레드) ─────────────────────────────────────────

void WindowManager::ProcessMessages()
{
    // CommandQueue만 드레인. Win32 메시지는 main()의 GetMessage 루프가 처리.
    m_commandQueue.drain();
}

// ─── Win32 창 생성 ────────────────────────────────────────────────────────

HWND WindowManager::CreateWin32Window(int x, int y, int width, int height)
{
    // X11 width/height = 클라이언트 영역 크기 → Win32 전체 창 크기로 변환
    DWORD style = WS_OVERLAPPEDWINDOW;
    RECT r = {0, 0, width, height};
    AdjustWindowRect(&r, style, FALSE);
    int totalW = r.right  - r.left;
    int totalH = r.bottom - r.top;

    return CreateWindowExW(
        0, L"XManWindow", L"X Window",
        style,
        x, y, totalW, totalH,
        nullptr, nullptr, m_hInstance, nullptr);
}

// ─── WindowProc ────────────────────────────────────────────────────────────

LRESULT CALLBACK WindowManager::WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    WindowManager *mgr = reinterpret_cast<WindowManager *>(
        GetWindowLongPtrW(hwnd, GWLP_USERDATA));

    auto getXid = [&]() -> Window {
        if (!mgr) return 0;
        std::lock_guard<std::mutex> lk(mgr->m_drawableMutex);
        auto it = mgr->m_hwndToXid.find(hwnd);
        return it != mgr->m_hwndToXid.end() ? it->second : 0;
    };

    switch (msg)
    {
    case WM_PAINT:
    {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hwnd, &ps);
        if (mgr)
        {
            Window xid = getXid();
            if (xid)
            {
                std::lock_guard<std::mutex> lk(mgr->m_drawableMutex);
                auto it = mgr->m_windows.find(xid);
                if (it != mgr->m_windows.end() && it->second.backingDC)
                    BitBlt(hdc, 0, 0, it->second.width, it->second.height,
                           it->second.backingDC, 0, 0, SRCCOPY);
            }
        }
        EndPaint(hwnd, &ps);
        return 0;
    }

    case WM_SIZE:
    {
        // WM_SIZE는 백킹 스토어 재생성만 처리
        // X11 이벤트(ConfigureNotify/Expose)는 보내지 않음
        // (ShowWindow 시 잘못된 크기로 이벤트가 전송되면 클라이언트 혼란)
        if (!mgr) break;
        Window xid = getXid();
        if (!xid) break;
        int newW = LOWORD(lParam), newH = HIWORD(lParam);
        if (newW <= 0 || newH <= 0) break;

        mgr->DestroyBackingStore(xid);
        // X11 논리 크기는 변경하지 않음 (X11 클라이언트가 ConfigureWindow로 변경)
        mgr->CreateBackingStore(xid);
        return 0;
    }

    case WM_SETFOCUS:
        if (mgr) mgr->m_focusedWindow = getXid();
        break;

    case WM_KILLFOCUS:
        if (mgr && mgr->m_focusedWindow == getXid())
            mgr->m_focusedWindow = 0;
        break;

    case WM_KEYDOWN:
    case WM_SYSKEYDOWN:
    {
        if (!mgr) break;
        Window xid = mgr->m_focusedWindow ? mgr->m_focusedWindow : getXid();
        if (!xid) break;
        uint32_t mask;
        {
            std::lock_guard<std::mutex> lk(mgr->m_drawableMutex);
            auto it = mgr->m_windows.find(xid);
            if (it == mgr->m_windows.end()) break;
            mask = it->second.eventMask;
        }
        if (mask & KeyPressMask)
        {
            bool shift = (GetAsyncKeyState(VK_SHIFT)   & 0x8000) != 0;
            bool ctrl  = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
            bool alt   = (GetAsyncKeyState(VK_MENU)    & 0x8000) != 0;
            auto ev = mgr->BuildKeyEvent(xid, 2, wParam, shift, ctrl, alt);
            mgr->SendEventToWindow(xid, ev);
        }
        break;
    }

    case WM_KEYUP:
    case WM_SYSKEYUP:
    {
        if (!mgr) break;
        Window xid = mgr->m_focusedWindow ? mgr->m_focusedWindow : getXid();
        if (!xid) break;
        uint32_t mask;
        {
            std::lock_guard<std::mutex> lk(mgr->m_drawableMutex);
            auto it = mgr->m_windows.find(xid);
            if (it == mgr->m_windows.end()) break;
            mask = it->second.eventMask;
        }
        if (mask & KeyReleaseMask)
        {
            bool shift = (GetAsyncKeyState(VK_SHIFT)   & 0x8000) != 0;
            bool ctrl  = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
            bool alt   = (GetAsyncKeyState(VK_MENU)    & 0x8000) != 0;
            auto ev = mgr->BuildKeyEvent(xid, 3, wParam, shift, ctrl, alt);
            mgr->SendEventToWindow(xid, ev);
        }
        break;
    }

    case WM_LBUTTONDOWN: case WM_MBUTTONDOWN: case WM_RBUTTONDOWN:
    {
        if (!mgr) break;
        Window xid = getXid();
        if (!xid) break;
        uint32_t mask;
        {
            std::lock_guard<std::mutex> lk(mgr->m_drawableMutex);
            auto it = mgr->m_windows.find(xid);
            if (it == mgr->m_windows.end()) break;
            mask = it->second.eventMask;
        }
        if (mask & ButtonPressMask)
        {
            uint8_t btn = (msg == WM_LBUTTONDOWN) ? 1 :
                          (msg == WM_MBUTTONDOWN)  ? 2 : 3;
            SetCapture(hwnd);
            auto ev = mgr->BuildButtonEvent(xid, 4, btn,
                                            GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam),
                                            GetModifierState());
            mgr->SendEventToWindow(xid, ev);
        }
        break;
    }

    case WM_LBUTTONUP: case WM_MBUTTONUP: case WM_RBUTTONUP:
    {
        if (!mgr) break;
        Window xid = getXid();
        if (!xid) break;
        uint32_t mask;
        {
            std::lock_guard<std::mutex> lk(mgr->m_drawableMutex);
            auto it = mgr->m_windows.find(xid);
            if (it == mgr->m_windows.end()) break;
            mask = it->second.eventMask;
        }
        if (mask & ButtonReleaseMask)
        {
            uint8_t btn = (msg == WM_LBUTTONUP) ? 1 :
                          (msg == WM_MBUTTONUP)  ? 2 : 3;
            ReleaseCapture();
            auto ev = mgr->BuildButtonEvent(xid, 5, btn,
                                            GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam),
                                            GetModifierState());
            mgr->SendEventToWindow(xid, ev);
        }
        break;
    }

    case WM_MOUSEMOVE:
    {
        if (!mgr) break;
        Window xid = getXid();
        if (!xid) break;
        uint32_t mask;
        {
            std::lock_guard<std::mutex> lk(mgr->m_drawableMutex);
            auto it = mgr->m_windows.find(xid);
            if (it == mgr->m_windows.end()) break;
            mask = it->second.eventMask;
        }
        if (mask & PointerMotionMask)
        {
            auto ev = mgr->BuildMotionEvent(xid,
                                            GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam),
                                            GetModifierState());
            mgr->SendEventToWindow(xid, ev);
        }
        break;
    }

    case WM_CLOSE:
        // WM_DELETE_WINDOW 이벤트를 클라이언트에 전달 (미구현 - 단순히 숨김)
        ShowWindow(hwnd, SW_HIDE);
        return 0;

    case WM_DESTROY:
        return 0;

    default:
        break;
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

} // namespace XMan
