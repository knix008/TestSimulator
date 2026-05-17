#pragma once

#include "XManTypes.h"
#include <winsock2.h>
#include <memory>
#include <thread>
#include <atomic>
#include <vector>

namespace XMan
{

    class X11Protocol;
    class NetworkClient;

    class NetworkServer
    {
    public:
        NetworkServer();
        ~NetworkServer();

        // 서버 시작/중지
        bool Start(int displayNumber = 0);
        void Stop();

        bool IsRunning() const { return m_running; }

    private:
        void AcceptLoop();
        void HandleClient(SOCKET clientSocket);

        SOCKET m_serverSocket = INVALID_SOCKET;
        std::atomic<bool> m_running{false};
        std::thread m_acceptThread;
        std::vector<std::unique_ptr<NetworkClient>> m_clients;
        int m_port = 0;
    };

    class NetworkClient
    {
    public:
        NetworkClient(SOCKET socket);
        ~NetworkClient();

        void Run();
        void Stop();

        SOCKET GetSocket() const { return m_socket; }

    private:
        void ReceiveLoop();
        bool ReceiveData(std::vector<uint8_t> &buffer);
        bool SendData(const std::vector<uint8_t> &data);

        SOCKET m_socket;
        std::atomic<bool> m_running{false};
        std::thread m_receiveThread;
        std::unique_ptr<X11Protocol> m_protocol;
    };

} // namespace XMan
