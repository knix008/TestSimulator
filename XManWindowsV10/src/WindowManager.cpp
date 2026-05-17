#include "WindowManager.h"
#include "DirectXRenderer.h"
#include <iostream>

namespace XMan
{

    WindowManager::WindowManager() = default;

    WindowManager::~WindowManager()
    {
        Shutdown();
    }

    bool WindowManager::Initialize(HINSTANCE hInstance)
    {
        m_hInstance = hInstance;

        // 윈도우 클래스 등록
        WNDCLASSEXW wc{};
        wc.cbSize = sizeof(WNDCLASSEXW);
        wc.style = CS_HREDRAW | CS_VREDRAW;
        wc.lpfnWndProc = WindowProc;
        wc.hInstance = hInstance;
        wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
        wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
        wc.lpszClassName = L"XManWindow";

        m_windowClass = RegisterClassExW(&wc);
        if (m_windowClass == 0)
        {
            std::cerr << "Failed to register window class" << std::endl;
            return false;
        }

        std::cout << "WindowManager initialized" << std::endl;

        return true;
    }

    void WindowManager::Shutdown()
    {
        // 모든 윈도우 제거
        for (auto &pair : m_windows)
        {
            if (pair.second.hwnd)
            {
                DestroyWindow(pair.second.hwnd);
            }
        }
        m_windows.clear();
        m_hwndToXid.clear();

        // 윈도우 클래스 등록 해제
        if (m_windowClass != 0 && m_hInstance)
        {
            UnregisterClassW(L"XManWindow", m_hInstance);
            m_windowClass = 0;
        }
    }

    Window WindowManager::CreateXWindow(Window parent, int x, int y, int width, int height)
    {
        Window xid = m_nextXid++;

        // Win32 윈도우 생성
        HWND hwnd = CreateWin32Window(x, y, width, height);
        if (!hwnd)
        {
            std::cerr << "Failed to create Win32 window" << std::endl;
            return 0;
        }

        // XWindowInfo 저장
        XWindowInfo info{};
        info.xid = xid;
        info.hwnd = hwnd;
        info.x = x;
        info.y = y;
        info.width = width;
        info.height = height;
        info.mapped = false;
        info.parent = parent;

        m_windows[xid] = info;
        m_hwndToXid[hwnd] = xid;

        // 윈도우에 this 포인터 저장
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));

        std::cout << "Created X Window " << xid << " (HWND: " << hwnd << ")" << std::endl;

        return xid;
    }

    bool WindowManager::DestroyXWindow(Window xid)
    {
        auto it = m_windows.find(xid);
        if (it == m_windows.end())
        {
            return false;
        }

        HWND hwnd = it->second.hwnd;

        if (hwnd)
        {
            m_hwndToXid.erase(hwnd);
            DestroyWindow(hwnd);
        }

        m_windows.erase(it);

        std::cout << "Destroyed X Window " << xid << std::endl;

        return true;
    }

    bool WindowManager::MapWindow(Window xid)
    {
        auto it = m_windows.find(xid);
        if (it == m_windows.end())
        {
            return false;
        }

        it->second.mapped = true;

        if (it->second.hwnd)
        {
            ShowWindow(it->second.hwnd, SW_SHOW);
            UpdateWindow(it->second.hwnd);
        }

        std::cout << "Mapped X Window " << xid << std::endl;

        return true;
    }

    bool WindowManager::UnmapWindow(Window xid)
    {
        auto it = m_windows.find(xid);
        if (it == m_windows.end())
        {
            return false;
        }

        it->second.mapped = false;

        if (it->second.hwnd)
        {
            ShowWindow(it->second.hwnd, SW_HIDE);
        }

        std::cout << "Unmapped X Window " << xid << std::endl;

        return true;
    }

    bool WindowManager::ConfigureWindow(Window xid, int x, int y, int width, int height)
    {
        auto it = m_windows.find(xid);
        if (it == m_windows.end())
        {
            return false;
        }

        it->second.x = x;
        it->second.y = y;
        it->second.width = width;
        it->second.height = height;

        if (it->second.hwnd)
        {
            SetWindowPos(it->second.hwnd, nullptr, x, y, width, height,
                         SWP_NOZORDER | SWP_NOACTIVATE);
        }

        return true;
    }

    XWindowInfo *WindowManager::GetWindowInfo(Window xid)
    {
        auto it = m_windows.find(xid);
        if (it == m_windows.end())
        {
            return nullptr;
        }
        return &it->second;
    }

    void WindowManager::SetRenderer(std::shared_ptr<DirectXRenderer> renderer)
    {
        m_renderer = renderer;
    }

    void WindowManager::ProcessMessages()
    {
        MSG msg;
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE))
        {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    LRESULT CALLBACK WindowManager::WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
    {
        WindowManager *manager = reinterpret_cast<WindowManager *>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));

        switch (msg)
        {
        case WM_PAINT:
        {
            PAINTSTRUCT ps;
            HDC hdc = BeginPaint(hwnd, &ps);

            // TODO: DirectX 렌더링

            EndPaint(hwnd, &ps);
            return 0;
        }

        case WM_SIZE:
        {
            int width = LOWORD(lParam);
            int height = HIWORD(lParam);

            if (manager && manager->m_renderer)
            {
                manager->m_renderer->Resize(width, height);
            }
            return 0;
        }

        case WM_DESTROY:
        {
            // 윈도우가 파괴될 때
            return 0;
        }

        case WM_CLOSE:
        {
            // X 클라이언트에 이벤트 전송
            return 0;
        }

        default:
            return DefWindowProcW(hwnd, msg, wParam, lParam);
        }
    }

    HWND WindowManager::CreateWin32Window(int x, int y, int width, int height)
    {
        HWND hwnd = CreateWindowExW(
            0,
            L"XManWindow",
            L"X Window",
            WS_OVERLAPPEDWINDOW,
            x, y, width, height,
            nullptr,
            nullptr,
            m_hInstance,
            nullptr);

        return hwnd;
    }

} // namespace XMan
