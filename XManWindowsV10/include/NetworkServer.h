#pragma once

#include "EventQueue.h"
#include "XManTypes.h"
#include <winsock2.h>
#include <atomic>
#include <memory>
#include <thread>
#include <vector>

namespace XMan
{

class X11Protocol;
class NetworkClient;
class WindowManager;

class NetworkServer
{
public:
    NetworkServer();
    ~NetworkServer();

    bool Start(int displayNumber, WindowManager *windowManager);
    void Stop();

    bool IsRunning() const { return m_running; }

private:
    void AcceptLoop();

    SOCKET   m_serverSocket  = INVALID_SOCKET;
    std::atomic<bool> m_running{false};
    std::thread m_acceptThread;
    std::vector<std::unique_ptr<NetworkClient>> m_clients;
    int      m_port          = 0;
    WindowManager *m_windowManager = nullptr;
};

class NetworkClient
{
public:
    NetworkClient(SOCKET socket, WindowManager *windowManager);
    ~NetworkClient();

    void Run();
    void Stop();

    SOCKET GetSocket() const { return m_socket; }

private:
    void ReceiveLoop();
    bool SendData(const std::vector<uint8_t> &data);

    SOCKET m_socket;
    std::atomic<bool> m_running{false};
    std::thread m_receiveThread;
    std::unique_ptr<X11Protocol> m_protocol;
    std::shared_ptr<EventQueue>  m_eventQueue;
};

} // namespace XMan
