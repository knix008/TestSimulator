#include "ServerGUI.h"
#include "XManServer.h"
#include <Windows.h>
#include <csignal>
#include <iostream>

using namespace XMan;

static ServerGUI *g_gui = nullptr;

// Ctrl+C → 서버 중지
void SignalHandler(int sig)
{
    if ((sig == SIGINT || sig == SIGTERM) && g_gui)
        PostMessageW(g_gui->GetHwnd(), WM_CLOSE, 0, 0);
}

int main(int argc, char *argv[])
{
    int displayNumber = (argc > 1) ? atoi(argv[1]) : 0;

    signal(SIGINT,  SignalHandler);
    signal(SIGTERM, SignalHandler);

    // 콘솔 창 숨기기 (GUI 모드)
    if (HWND con = GetConsoleWindow())
        ShowWindow(con, SW_HIDE);

    // GUI 생성
    ServerGUI gui;
    g_gui = &gui;

    // std::cout / std::cerr → GUI 로그로 리디렉트
    GUILogBuf coutBuf(&gui);
    GUILogBuf cerrBuf(&gui);
    std::streambuf *oldCout = std::cout.rdbuf(&coutBuf);
    std::streambuf *oldCerr = std::cerr.rdbuf(&cerrBuf);

    if (!gui.Create(GetModuleHandleW(nullptr), displayNumber))
    {
        std::cout.rdbuf(oldCout);
        std::cerr.rdbuf(oldCerr);
        return 1;
    }

    // 메시지 루프 (GetMessage가 WM_TIMER + X11창 메시지 + GUI 메시지 모두 처리)
    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0) > 0)
    {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    // 리디렉트 복원
    std::cout.rdbuf(oldCout);
    std::cerr.rdbuf(oldCerr);

    g_gui = nullptr;
    return 0;
}
