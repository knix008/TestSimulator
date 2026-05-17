#pragma once

#include "CommandQueue.h"
#include "EventQueue.h"
#include "XManTypes.h"
#include <Windows.h>
#include <chrono>
#include <map>
#include <memory>
#include <mutex>
#include <vector>

namespace XMan
{

class DirectXRenderer;

struct XWindowInfo
{
    Window  xid            = 0;
    HWND    hwnd           = nullptr;
    int     x = 0, y = 0, width = 0, height = 0;
    bool    mapped         = false;
    Window  parent         = 0;
    HDC     backingDC      = nullptr;
    HBITMAP backingBitmap  = nullptr;
    uint32_t eventMask     = 0;
    std::shared_ptr<EventQueue> clientEvents;
};

struct PixmapInfo
{
    Drawable xid    = 0;
    int width = 0, height = 0, depth = 0;
    HDC     dc      = nullptr;
    HBITMAP bitmap  = nullptr;
};

class WindowManager
{
public:
    WindowManager();
    ~WindowManager();

    bool Initialize(HINSTANCE hInstance);
    void Shutdown();

    // 수신 스레드에서 호출 → 내부적으로 메인 스레드에서 실행
    Window CreateXWindow(Window wid, Window parent, int x, int y, int width, int height,
                         std::shared_ptr<EventQueue> clientEvents);
    bool   MapWindow(Window xid);
    bool   UnmapWindow(Window xid);
    void   MapSubwindows(Window parent);
    std::vector<Window> GetUnmappedChildren(Window parent);
    std::vector<Window> GetMappedChildren(Window parent);
    bool   DestroyXWindow(Window xid);
    bool   ConfigureWindow(Window xid, int x, int y, int width, int height);

    // 픽스맵 관리 (어느 스레드에서든 호출 가능, GDI는 스레드 안전)
    bool   CreatePixmap(Drawable xid, int width, int height, int depth);
    bool   FreePixmap(Drawable xid);

    // 그리기 (backing store 또는 pixmap DC에 직접)
    HDC  GetDrawableDC(Drawable d);
    bool GetDrawableSize(Drawable d, int &w, int &h);
    void FlushToScreen(Window xid);
    void CopyArea(Drawable src, Drawable dst,
                  int srcX, int srcY, int w, int h,
                  int dstX, int dstY);

    void GDIFillEllipses(Drawable d, COLORREF color, const RECT *rects, int count);
    void GDIDrawEllipses(Drawable d, COLORREF color, const RECT *rects, int count);
    void GDIFillRects(Drawable d, COLORREF color, const RECT *rects, int count);
    void GDIDrawLines(Drawable d, COLORREF color, const POINT *points, int count);
    void GDIClearArea(Window xid, int x, int y, int w, int h);
    void GDIPutImage(Drawable d, int x, int y, int w, int h,
                     int depth, int format, const uint8_t *data, size_t dataLen);

    // 이벤트
    void UpdateEventMask(Window xid, uint32_t mask);
    void SendEventToWindow(Window xid, std::vector<uint8_t> event);

    // 창 정보 조회
    XWindowInfo *GetWindowInfo(Window xid);

    // 렌더러 (미래 DirectX 확장용)
    void SetRenderer(std::shared_ptr<DirectXRenderer> renderer);

    // 메인 스레드에서 호출
    void ProcessMessages();

    // 타임스탬프 (X11 이벤트용, ms)
    uint32_t GetTimestamp() const;

    CommandQueue &GetCommandQueue() { return m_commandQueue; }

private:
    // 메인 스레드에서만 실행
    void ExecuteCreateWindow(Window wid, Window parent, int x, int y, int w, int h,
                             std::shared_ptr<EventQueue> clientEvents);
    void ExecuteMapWindow(Window xid);
    bool CreateBackingStore(Window xid);
    void DestroyBackingStore(Window xid);

    static LRESULT CALLBACK WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
    HWND CreateWin32Window(int x, int y, int width, int height);

    // 이벤트 빌더 (메인 스레드의 WndProc에서 호출)
    std::vector<uint8_t> BuildKeyEvent(Window xid, uint8_t code,
                                       WPARAM vk, bool shift, bool ctrl, bool alt);
    std::vector<uint8_t> BuildButtonEvent(Window xid, uint8_t code,
                                          uint8_t button, int x, int y,
                                          uint16_t state);
    std::vector<uint8_t> BuildMotionEvent(Window xid, int x, int y, uint16_t state);
    std::vector<uint8_t> BuildExposeEvent(Window xid, int x, int y, int w, int h);
    std::vector<uint8_t> BuildConfigureNotify(Window xid);

    // 내부 그리기 헬퍼
    void GDIDrawOnDC(HDC dc, bool fill, COLORREF color,
                     const RECT *rects, int count, bool ellipse);

    HINSTANCE  m_hInstance   = nullptr;
    ATOM       m_windowClass = 0;

    mutable std::mutex m_drawableMutex;
    std::map<Window,   XWindowInfo> m_windows;
    std::map<HWND,     Window>      m_hwndToXid;
    std::map<Drawable, PixmapInfo>  m_pixmaps;

    std::shared_ptr<DirectXRenderer> m_renderer;
    CommandQueue m_commandQueue;
    Window  m_focusedWindow = 0;
    uint16_t m_buttonState  = 0; // current button mask

    std::chrono::steady_clock::time_point m_startTime;
};

} // namespace XMan
