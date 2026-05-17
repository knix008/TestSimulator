#include "ServerGUI.h"
#include "XManServer.h"
#include <commctrl.h>
#include <sstream>
#include <iomanip>
#include <iostream>

#pragma comment(lib, "comctl32.lib")

namespace XMan
{

// ─── 컨트롤 ID ──────────────────────────────────────────────────────────────
static constexpr WORD  ID_START     = 101;
static constexpr WORD  ID_STOP      = 102;
static constexpr WORD  ID_CLEAR     = 103;
static constexpr UINT  IDT_SERVER   = 1;
static constexpr UINT  WM_APPENDLOG = WM_APP + 1;

// ─── 색상/폰트 상수 ─────────────────────────────────────────────────────────
static constexpr COLORREF CLR_BG      = RGB(30,  30,  30);
static constexpr COLORREF CLR_PANEL   = RGB(45,  45,  48);
static constexpr COLORREF CLR_ACCENT  = RGB(0,  120, 215);
static constexpr COLORREF CLR_TEXT    = RGB(240, 240, 240);
static constexpr COLORREF CLR_GREEN   = RGB(100, 200, 100);
static constexpr COLORREF CLR_RED     = RGB(220, 80,  80);

// ─── ServerGUI ──────────────────────────────────────────────────────────────

ServerGUI::ServerGUI() = default;

ServerGUI::~ServerGUI()
{
    if (m_server) m_server->Stop();
    if (m_hFont)     DeleteObject(m_hFont);
    if (m_hFontMono) DeleteObject(m_hFontMono);
    if (m_hBkBrush)  DeleteObject(m_hBkBrush);
}

bool ServerGUI::Create(HINSTANCE hInst, int displayNumber)
{
    m_displayNumber = displayNumber;

    // 공통 컨트롤 초기화
    INITCOMMONCONTROLSEX icc{sizeof(icc), ICC_WIN95_CLASSES | ICC_STANDARD_CLASSES};
    InitCommonControlsEx(&icc);

    // 폰트 생성
    m_hFont = CreateFontW(-14, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                          DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                          CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
    m_hFontMono = CreateFontW(-13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
                               DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                               CLEARTYPE_QUALITY, FIXED_PITCH | FF_MODERN, L"Consolas");
    m_hBkBrush = CreateSolidBrush(CLR_BG);

    // 윈도우 클래스 등록
    WNDCLASSEXW wc{};
    wc.cbSize        = sizeof(wc);
    wc.style         = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc   = WndProc;
    wc.hInstance     = hInst;
    wc.hIcon         = LoadIcon(nullptr, IDI_APPLICATION);
    wc.hCursor       = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = m_hBkBrush;
    wc.lpszClassName = L"XManGUI";

    if (!RegisterClassExW(&wc))
        return false;

    m_hwnd = CreateWindowExW(0, L"XManGUI", L"XMan X Server",
                              WS_OVERLAPPEDWINDOW,
                              CW_USEDEFAULT, CW_USEDEFAULT, 820, 560,
                              nullptr, nullptr, hInst, this);
    if (!m_hwnd) return false;

    ShowWindow(m_hwnd, SW_SHOW);
    UpdateWindow(m_hwnd);

    // 자동 시작
    StartServer();
    return true;
}

// ─── 서버 제어 ───────────────────────────────────────────────────────────────

void ServerGUI::StartServer()
{
    if (m_server && m_server->IsRunning()) return;

    m_server = std::make_unique<XManServer>();
    if (!m_server->Start(m_displayNumber))
    {
        Log("ERROR: Failed to start server");
        m_server.reset();
        UpdateStatus();
        return;
    }

    Log("Server started on display :" + std::to_string(m_displayNumber)
        + "  (port " + std::to_string(6000 + m_displayNumber) + ")");
    UpdateStatus();

    // 서버 처리 타이머 (16ms)
    SetTimer(m_hwnd, IDT_SERVER, 16, nullptr);

    if (m_hBtnStart) EnableWindow(m_hBtnStart, FALSE);
    if (m_hBtnStop)  EnableWindow(m_hBtnStop,  TRUE);
}

void ServerGUI::StopServer()
{
    KillTimer(m_hwnd, IDT_SERVER);

    if (m_server)
    {
        m_server->Stop();
        m_server.reset();
        Log("Server stopped.");
    }

    UpdateStatus();
    if (m_hBtnStart) EnableWindow(m_hBtnStart, TRUE);
    if (m_hBtnStop)  EnableWindow(m_hBtnStop,  FALSE);
}

// ─── 로그 ────────────────────────────────────────────────────────────────────

void ServerGUI::Log(const std::string &msg)
{
    // 임의 스레드에서 안전하게 호출 가능
    auto *copy = new std::string(msg);
    PostMessageW(m_hwnd, WM_APPENDLOG, 0, reinterpret_cast<LPARAM>(copy));
}

void ServerGUI::AppendLog(const std::string &text)
{
    if (!m_hLog) return;

    SYSTEMTIME st;
    GetLocalTime(&st);
    char ts[32];
    snprintf(ts, sizeof(ts), "[%02d:%02d:%02d] ", st.wHour, st.wMinute, st.wSecond);

    std::string line = ts + text;
    if (line.empty() || line.back() != '\n') line += "\r\n";
    else { line.pop_back(); line += "\r\n"; }

    int wlen = MultiByteToWideChar(CP_UTF8, 0, line.c_str(), -1, nullptr, 0);
    std::wstring wline(wlen, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, line.c_str(), -1, &wline[0], wlen);

    // 최대 10000줄 유지
    int lines = (int)SendMessageW(m_hLog, EM_GETLINECOUNT, 0, 0);
    if (lines > 10000)
    {
        int endFirst = (int)SendMessageW(m_hLog, EM_LINEINDEX, 500, 0);
        SendMessageW(m_hLog, EM_SETSEL, 0, endFirst);
        SendMessageW(m_hLog, EM_REPLACESEL, FALSE, (LPARAM)L"");
    }

    int len = GetWindowTextLengthW(m_hLog);
    SendMessageW(m_hLog, EM_SETSEL, len, len);
    SendMessageW(m_hLog, EM_REPLACESEL, FALSE, (LPARAM)wline.c_str());
    SendMessageW(m_hLog, WM_VSCROLL, SB_BOTTOM, 0);
}

void ServerGUI::UpdateStatus()
{
    if (!m_hwnd) return;

    bool running = m_server && m_server->IsRunning();

    // 상태바 업데이트
    if (m_hStatus)
    {
        wchar_t buf[256];
        if (running)
            swprintf_s(buf, L"  ●  Running   Port: %d   Display: :%d",
                       6000 + m_displayNumber, m_displayNumber);
        else
            swprintf_s(buf, L"  ○  Stopped");
        SetWindowTextW(m_hStatus, buf);
    }

    // 창 제목 업데이트
    if (m_hwnd)
    {
        wchar_t title[128];
        swprintf_s(title, L"XMan X Server  —  %s",
                   running ? L"Running" : L"Stopped");
        SetWindowTextW(m_hwnd, title);
    }
}

// ─── 레이아웃 ────────────────────────────────────────────────────────────────

void ServerGUI::LayoutControls(int w, int h)
{
    constexpr int MARGIN  = 12;
    constexpr int TOOLBAR = 44;  // 상단 툴바 높이
    constexpr int STATBAR = 28;  // 상태바 높이
    constexpr int BTNW    = 90;
    constexpr int BTNH    = 28;
    constexpr int GAP     = 8;

    // 상태바 (맨 위)
    if (m_hStatus)
        SetWindowPos(m_hStatus, nullptr,
                     0, 0, w, TOOLBAR,
                     SWP_NOZORDER | SWP_NOACTIVATE);

    // 버튼들 (상태바 안에)
    int bx = w - MARGIN - (BTNW + GAP) * 3;
    int by = (TOOLBAR - BTNH) / 2;

    if (m_hBtnStart) SetWindowPos(m_hBtnStart, nullptr, bx, by, BTNW, BTNH, SWP_NOZORDER);
    bx += BTNW + GAP;
    if (m_hBtnStop)  SetWindowPos(m_hBtnStop,  nullptr, bx, by, BTNW, BTNH, SWP_NOZORDER);
    bx += BTNW + GAP;
    if (m_hBtnClear) SetWindowPos(m_hBtnClear, nullptr, bx, by, BTNW, BTNH, SWP_NOZORDER);

    // 로그 영역 (나머지 전체)
    if (m_hLog)
        SetWindowPos(m_hLog, nullptr,
                     0, TOOLBAR, w, h - TOOLBAR - STATBAR,
                     SWP_NOZORDER | SWP_NOACTIVATE);

    // 하단 상태바
    if (m_hLblStatus)
        SetWindowPos(m_hLblStatus, nullptr,
                     0, h - STATBAR, w, STATBAR,
                     SWP_NOZORDER | SWP_NOACTIVATE);
}

// ─── WndProc ─────────────────────────────────────────────────────────────────

LRESULT CALLBACK ServerGUI::WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    ServerGUI *self = nullptr;

    if (msg == WM_CREATE)
    {
        auto *cs = reinterpret_cast<CREATESTRUCTW *>(lParam);
        self = reinterpret_cast<ServerGUI *>(cs->lpCreateParams);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
        self->OnCreate(hwnd);
        return 0;
    }

    self = reinterpret_cast<ServerGUI *>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    if (!self) return DefWindowProcW(hwnd, msg, wParam, lParam);

    switch (msg)
    {
    case WM_SIZE:
        self->OnSize(LOWORD(lParam), HIWORD(lParam));
        return 0;

    case WM_TIMER:
        if (wParam == IDT_SERVER) self->OnTimer();
        return 0;

    case WM_COMMAND:
        self->OnCommand(LOWORD(wParam));
        return 0;

    case WM_APPENDLOG:
    {
        auto *s = reinterpret_cast<std::string *>(lParam);
        if (s) { self->OnLog(*s); delete s; }
        return 0;
    }

    case WM_CTLCOLOREDIT:
    case WM_CTLCOLORSTATIC:
    {
        HDC hdc = reinterpret_cast<HDC>(wParam);
        SetTextColor(hdc, CLR_TEXT);
        SetBkColor(hdc, CLR_PANEL);
        return reinterpret_cast<LRESULT>(self->m_hBkBrush);
    }

    case WM_ERASEBKGND:
    {
        HDC hdc = reinterpret_cast<HDC>(wParam);
        RECT rc;
        GetClientRect(hwnd, &rc);
        FillRect(hdc, &rc, self->m_hBkBrush);
        return 1;
    }

    case WM_DESTROY:
        self->StopServer();
        PostQuitMessage(0);
        return 0;

    default:
        break;
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

void ServerGUI::OnCreate(HWND hwnd)
{
    m_hwnd = hwnd;
    HINSTANCE hInst = GetModuleHandleW(nullptr);

    // ── 상단 패널 (상태 + 버튼) ──────────────────────────────────────────────
    m_hStatus = CreateWindowExW(
        0, L"STATIC", L"  ○  Stopped",
        WS_CHILD | WS_VISIBLE | SS_LEFT | SS_CENTERIMAGE,
        0, 0, 0, 0, hwnd, nullptr, hInst, nullptr);

    // 버튼 스타일
    auto makeBtn = [&](LPCWSTR label, WORD id) -> HWND {
        return CreateWindowExW(0, L"BUTTON", label,
                               WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON,
                               0, 0, 0, 0, hwnd, reinterpret_cast<HMENU>((UINT_PTR)id),
                               hInst, nullptr);
    };

    m_hBtnStart = makeBtn(L"▶  Start", ID_START);
    m_hBtnStop  = makeBtn(L"■  Stop",  ID_STOP);
    m_hBtnClear = makeBtn(L"Clear Log", ID_CLEAR);

    // ── 로그 (EDIT) ──────────────────────────────────────────────────────────
    m_hLog = CreateWindowExW(
        WS_EX_CLIENTEDGE,
        L"EDIT", nullptr,
        WS_CHILD | WS_VISIBLE | WS_VSCROLL | WS_HSCROLL |
        ES_MULTILINE | ES_READONLY | ES_AUTOVSCROLL,
        0, 0, 0, 0, hwnd, nullptr, hInst, nullptr);

    // ── 하단 상태바 ──────────────────────────────────────────────────────────
    m_hLblStatus = CreateWindowExW(
        0, L"STATIC", L"  Ready",
        WS_CHILD | WS_VISIBLE | SS_LEFT | SS_CENTERIMAGE,
        0, 0, 0, 0, hwnd, nullptr, hInst, nullptr);

    // 폰트 적용
    auto applyFont = [&](HWND h, HFONT f) {
        SendMessageW(h, WM_SETFONT, reinterpret_cast<WPARAM>(f), TRUE);
    };
    applyFont(m_hStatus,    m_hFont);
    applyFont(m_hBtnStart,  m_hFont);
    applyFont(m_hBtnStop,   m_hFont);
    applyFont(m_hBtnClear,  m_hFont);
    applyFont(m_hLog,       m_hFontMono);
    applyFont(m_hLblStatus, m_hFont);

    // 초기 상태
    EnableWindow(m_hBtnStop, FALSE);

    // 초기 레이아웃
    RECT rc;
    GetClientRect(hwnd, &rc);
    LayoutControls(rc.right, rc.bottom);

    UpdateStatus();
}

void ServerGUI::OnSize(int w, int h)
{
    LayoutControls(w, h);
}

void ServerGUI::OnTimer()
{
    if (m_server)
    {
        m_server->Run(); // CommandQueue drain + 메시지 처리
    }
}

void ServerGUI::OnCommand(WORD id)
{
    switch (id)
    {
    case ID_START: StartServer(); break;
    case ID_STOP:  StopServer();  break;
    case ID_CLEAR:
        if (m_hLog) SetWindowTextW(m_hLog, L"");
        break;
    }
}

void ServerGUI::OnLog(const std::string &msg)
{
    AppendLog(msg);

    // 하단 상태바에 마지막 메시지 표시
    if (m_hLblStatus && !msg.empty())
    {
        int wlen = MultiByteToWideChar(CP_UTF8, 0, msg.c_str(), -1, nullptr, 0);
        std::wstring wmsg(wlen, L'\0');
        MultiByteToWideChar(CP_UTF8, 0, msg.c_str(), -1, &wmsg[0], wlen);
        // 줄바꿈 제거
        if (!wmsg.empty() && wmsg.back() == L'\0') wmsg.pop_back();
        auto pos = wmsg.find(L'\n');
        if (pos != std::wstring::npos) wmsg = wmsg.substr(0, pos);
        SetWindowTextW(m_hLblStatus, (L"  " + wmsg).c_str());
    }
}

// ─── GUILogBuf ───────────────────────────────────────────────────────────────

int GUILogBuf::overflow(int c)
{
    if (c != EOF)
    {
        m_buf += (char)c;
        if (c == '\n') flush();
    }
    return c;
}

std::streamsize GUILogBuf::xsputn(const char *s, std::streamsize n)
{
    m_buf.append(s, (size_t)n);
    size_t pos = m_buf.find('\n');
    while (pos != std::string::npos)
    {
        std::string line = m_buf.substr(0, pos);
        m_buf = m_buf.substr(pos + 1);
        if (m_gui) m_gui->Log(line);
        pos = m_buf.find('\n');
    }
    return n;
}

void GUILogBuf::flush()
{
    if (!m_buf.empty())
    {
        if (m_gui) m_gui->Log(m_buf);
        m_buf.clear();
    }
}

} // namespace XMan
