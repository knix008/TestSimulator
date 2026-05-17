#pragma once

#include <Windows.h>
#include <commctrl.h>
#include <memory>
#include <streambuf>
#include <string>

namespace XMan
{

class XManServer;

class ServerGUI
{
public:
    ServerGUI();
    ~ServerGUI();

    bool Create(HINSTANCE hInst, int displayNumber = 0);

    // 임의 스레드에서 호출 가능한 thread-safe 로그
    void Log(const std::string &msg);

    HWND GetHwnd() const { return m_hwnd; }

private:
    static LRESULT CALLBACK WndProc(HWND, UINT, WPARAM, LPARAM);

    void OnCreate(HWND hwnd);
    void OnSize(int w, int h);
    void OnTimer();
    void OnCommand(WORD id);
    void OnLog(const std::string &msg);

    void StartServer();
    void StopServer();
    void AppendLog(const std::string &text);
    void UpdateStatus();
    void LayoutControls(int w, int h);

    HWND m_hwnd         = nullptr;
    HWND m_hLog         = nullptr;
    HWND m_hStatus      = nullptr; // StatusBar
    HWND m_hBtnStart    = nullptr;
    HWND m_hBtnStop     = nullptr;
    HWND m_hBtnClear    = nullptr;
    HWND m_hLblStatus   = nullptr;
    HWND m_hLblPort     = nullptr;
    HWND m_hLblClients  = nullptr;
    HWND m_hEditDisplay = nullptr;
    HWND m_hLblDisplay  = nullptr;

    std::unique_ptr<XManServer> m_server;
    int m_displayNumber = 0;

    static constexpr UINT  IDT_SERVER   = 1;
    static constexpr WORD  ID_START     = 101;
    static constexpr WORD  ID_STOP      = 102;
    static constexpr WORD  ID_CLEAR     = 103;
    static constexpr UINT  WM_APPENDLOG = WM_APP + 1;

    HFONT m_hFont      = nullptr;
    HFONT m_hFontMono  = nullptr;
    HBRUSH m_hBkBrush  = nullptr;
};

// std::cout / std::cerr → ServerGUI::Log 리디렉터
class GUILogBuf : public std::streambuf
{
public:
    explicit GUILogBuf(ServerGUI *gui) : m_gui(gui) {}
    ~GUILogBuf() override = default;

protected:
    int overflow(int c) override;
    std::streamsize xsputn(const char *s, std::streamsize n) override;

private:
    void flush();
    ServerGUI   *m_gui;
    std::string  m_buf;
};

} // namespace XMan
