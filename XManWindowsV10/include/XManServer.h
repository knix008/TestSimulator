#pragma once

#include <memory>

namespace XMan
{

    class NetworkServer;
    class WindowManager;
    class DirectXRenderer;

    class XManServer
    {
    public:
        XManServer();
        ~XManServer();

        // 서버 시작/중지
        bool Start(int displayNumber = 0);
        void Stop();

        // 메인 루프
        void Run();

        bool IsRunning() const;

    private:
        bool Initialize();
        void Cleanup();

        std::unique_ptr<NetworkServer> m_networkServer;
        std::unique_ptr<WindowManager> m_windowManager;
        std::shared_ptr<DirectXRenderer> m_renderer;
        bool m_running = false;
        int m_displayNumber = 0;
    };

} // namespace XMan
