#pragma once

#include "XManTypes.h"
#include <Windows.h>
#include <map>
#include <memory>

namespace XMan
{

    class DirectXRenderer;

    struct XWindowInfo
    {
        Window xid;
        HWND hwnd;
        int x, y;
        int width, height;
        bool mapped;
        Window parent;
    };

    class WindowManager
    {
    public:
        WindowManager();
        ~WindowManager();

        bool Initialize(HINSTANCE hInstance);
        void Shutdown();

        // X Window 생성/제거
        Window CreateXWindow(Window parent, int x, int y, int width, int height);
        bool DestroyXWindow(Window xid);

        // Window 매핑
        bool MapWindow(Window xid);
        bool UnmapWindow(Window xid);

        // Window 속성
        bool ConfigureWindow(Window xid, int x, int y, int width, int height);
        XWindowInfo *GetWindowInfo(Window xid);

        // 렌더러 접근
        void SetRenderer(std::shared_ptr<DirectXRenderer> renderer);

        // 메시지 처리
        void ProcessMessages();

    private:
        static LRESULT CALLBACK WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
        HWND CreateWin32Window(int x, int y, int width, int height);

        HINSTANCE m_hInstance = nullptr;
        std::map<Window, XWindowInfo> m_windows;
        std::map<HWND, Window> m_hwndToXid;
        std::shared_ptr<DirectXRenderer> m_renderer;
        Window m_nextXid = 1;
        ATOM m_windowClass = 0;
    };

} // namespace XMan
