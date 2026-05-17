#include "XManServer.h"
#include <iostream>
#include <csignal>

static bool g_running = true;

void SignalHandler(int signal)
{
    if (signal == SIGINT || signal == SIGTERM)
    {
        std::cout << "\nShutting down..." << std::endl;
        g_running = false;
    }
}

int main(int argc, char *argv[])
{
    std::cout << "XManWindowsV10 - X Window Server for Windows" << std::endl;
    std::cout << "=============================================" << std::endl;

    // 시그널 핸들러 등록
    signal(SIGINT, SignalHandler);
    signal(SIGTERM, SignalHandler);

    // 디스플레이 번호 (기본값: 0)
    int displayNumber = 0;

    if (argc > 1)
    {
        displayNumber = atoi(argv[1]);
    }

    // XMan 서버 생성 및 시작
    XMan::XManServer server;

    if (!server.Start(displayNumber))
    {
        std::cerr << "Failed to start XMan server" << std::endl;
        return 1;
    }

    std::cout << "\nServer is running. Press Ctrl+C to stop." << std::endl;
    std::cout << "\nTo connect from a remote machine, set the DISPLAY variable:" << std::endl;
    std::cout << "  export DISPLAY=<this-machine-ip>:" << displayNumber << std::endl;
    std::cout << "\nThen run any X application, for example:" << std::endl;
    std::cout << "  xterm" << std::endl;
    std::cout << "  xclock" << std::endl;
    std::cout << "  xeyes" << std::endl;
    std::cout << std::endl;

    // 메인 루프
    while (g_running && server.IsRunning())
    {
        server.Run();
    }

    // 서버 중지
    server.Stop();

    std::cout << "XMan server stopped. Goodbye!" << std::endl;

    return 0;
}
