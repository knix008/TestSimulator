#include "XManServer.h"
#include "NetworkServer.h"
#include "WindowManager.h"
#include "DirectXRenderer.h"
#include <iostream>

namespace XMan
{

    XManServer::XManServer() = default;

    XManServer::~XManServer()
    {
        Stop();
    }

    bool XManServer::Start(int displayNumber)
    {
        m_displayNumber = displayNumber;

        if (!Initialize())
        {
            Cleanup();
            return false;
        }

        m_running = true;
        std::cout << "XMan Server started on display :" << displayNumber << std::endl;
        std::cout << "Listening on port " << (6000 + displayNumber) << std::endl;

        return true;
    }

    void XManServer::Stop()
    {
        if (!m_running)
            return;

        m_running = false;
        Cleanup();

        std::cout << "XMan Server stopped" << std::endl;
    }

    void XManServer::Run()
    {
        // CommandQueue 드레인 (주로 비어있음, 창 생성/맵핑은 수신 스레드 직접 처리)
        if (m_windowManager)
            m_windowManager->ProcessMessages();
    }

    bool XManServer::IsRunning() const
    {
        return m_running;
    }

    bool XManServer::Initialize()
    {
        // WindowManager 초기화
        m_windowManager = std::make_unique<WindowManager>();
        if (!m_windowManager->Initialize(GetModuleHandle(nullptr)))
        {
            std::cerr << "Failed to initialize WindowManager" << std::endl;
            return false;
        }

        // DirectX Renderer 초기화 (나중에 실제 윈도우가 생성되면 초기화)
        m_renderer = std::make_shared<DirectXRenderer>();
        m_windowManager->SetRenderer(m_renderer);

        // Network Server 초기화
        m_networkServer = std::make_unique<NetworkServer>();
        if (!m_networkServer->Start(m_displayNumber, m_windowManager.get()))
        {
            std::cerr << "Failed to start NetworkServer" << std::endl;
            return false;
        }

        return true;
    }

    void XManServer::Cleanup()
    {
        if (m_networkServer)
        {
            m_networkServer->Stop();
            m_networkServer.reset();
        }

        if (m_windowManager)
        {
            m_windowManager->Shutdown();
            m_windowManager.reset();
        }

        m_renderer.reset();
    }

} // namespace XMan
