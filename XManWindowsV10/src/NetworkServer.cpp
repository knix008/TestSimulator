#include "NetworkServer.h"
#include "X11Protocol.h"
#include "WindowManager.h"
#include <ws2tcpip.h>
#include <iostream>

#pragma comment(lib, "ws2_32.lib")

namespace XMan
{

// ─── NetworkServer ─────────────────────────────────────────────────────────

NetworkServer::NetworkServer()
{
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0)
        std::cerr << "WSAStartup failed" << std::endl;
}

NetworkServer::~NetworkServer()
{
    Stop();
    WSACleanup();
}

bool NetworkServer::Start(int displayNumber, WindowManager *windowManager)
{
    if (m_running) return true;

    m_windowManager = windowManager;
    m_port = DEFAULT_X_PORT + displayNumber;

    m_serverSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (m_serverSocket == INVALID_SOCKET)
    {
        std::cerr << "Socket creation failed: " << WSAGetLastError() << std::endl;
        return false;
    }

    int reuse = 1;
    setsockopt(m_serverSocket, SOL_SOCKET, SO_REUSEADDR, (const char *)&reuse, sizeof(reuse));

    sockaddr_in addr{};
    addr.sin_family      = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port        = htons((u_short)m_port);

    if (bind(m_serverSocket, (sockaddr *)&addr, sizeof(addr)) == SOCKET_ERROR ||
        listen(m_serverSocket, SOMAXCONN) == SOCKET_ERROR)
    {
        std::cerr << "Bind/listen failed: " << WSAGetLastError() << std::endl;
        closesocket(m_serverSocket);
        m_serverSocket = INVALID_SOCKET;
        return false;
    }

    m_running = true;
    m_acceptThread = std::thread(&NetworkServer::AcceptLoop, this);

    std::cout << "Network server listening on port " << m_port << std::endl;
    return true;
}

void NetworkServer::Stop()
{
    if (!m_running) return;
    m_running = false;
    if (m_serverSocket != INVALID_SOCKET)
    {
        closesocket(m_serverSocket);
        m_serverSocket = INVALID_SOCKET;
    }
    if (m_acceptThread.joinable()) m_acceptThread.join();
    m_clients.clear();
}

void NetworkServer::AcceptLoop()
{
    while (m_running)
    {
        sockaddr_in clientAddr{};
        int len = sizeof(clientAddr);
        SOCKET cs = accept(m_serverSocket, (sockaddr *)&clientAddr, &len);
        if (cs == INVALID_SOCKET)
        {
            if (m_running) std::cerr << "Accept failed: " << WSAGetLastError() << std::endl;
            continue;
        }
        char ip[INET_ADDRSTRLEN];
        inet_ntop(AF_INET, &clientAddr.sin_addr, ip, sizeof(ip));
        std::cout << "New client connected from " << ip << std::endl;

        auto client = std::make_unique<NetworkClient>(cs, m_windowManager);
        client->Run();
        m_clients.push_back(std::move(client));
    }
}

// ─── NetworkClient ─────────────────────────────────────────────────────────

NetworkClient::NetworkClient(SOCKET socket, WindowManager *windowManager)
    : m_socket(socket)
    , m_protocol(std::make_unique<X11Protocol>())
    , m_eventQueue(std::make_shared<EventQueue>())
{
    m_protocol->SetWindowManager(windowManager);
    m_protocol->SetEventQueue(m_eventQueue);
}

NetworkClient::~NetworkClient() { Stop(); }

void NetworkClient::Run()
{
    if (m_running) return;
    m_running = true;
    m_receiveThread = std::thread(&NetworkClient::ReceiveLoop, this);
}

void NetworkClient::Stop()
{
    if (!m_running) return;
    m_running = false;
    if (m_socket != INVALID_SOCKET) { closesocket(m_socket); m_socket = INVALID_SOCKET; }
    if (m_receiveThread.joinable()) m_receiveThread.join();
}

void NetworkClient::ReceiveLoop()
{
    // 짧은 recv 타임아웃: 주기적으로 이벤트 큐 확인 + Win32 메시지 펌프
    DWORD timeout = 16;
    setsockopt(m_socket, SOL_SOCKET, SO_RCVTIMEO, (const char *)&timeout, sizeof(timeout));

    std::vector<uint8_t> recvBuf;
    bool connectionSetup = false;

    auto pumpEvents = [&]() {
        // EventQueue → 클라이언트 전송
        std::vector<uint8_t> ev;
        while (m_eventQueue->pop(ev))
        {
            if (!SendData(ev)) return;
        }
        // 수신 스레드 소유 창(X11 app 창)의 Win32 메시지 처리
        // (창이 이 스레드에서 생성되므로 이 스레드에서 펌핑해야 함)
        MSG msg;
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE))
        {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    };
    // 최초 한 번 메시지 펌프 (CreateWindow 직후 쌓인 메시지 처리)
    pumpEvents();

    while (m_running)
    {
        uint8_t tempBuf[4096];
        int n = recv(m_socket, (char *)tempBuf, sizeof(tempBuf), 0);

        if (n > 0)
        {
            recvBuf.insert(recvBuf.end(), tempBuf, tempBuf + n);
        }
        else if (n == 0)
        {
            std::cout << "Client disconnected" << std::endl;
            break;
        }
        else
        {
            int err = WSAGetLastError();
            if (err == WSAETIMEDOUT || err == WSAEWOULDBLOCK)
            {
                pumpEvents();
                continue;
            }
            std::cerr << "recv failed: " << err << std::endl;
            break;
        }

        // ── 연결 설정 처리 ──────────────────────────────────────────────
        if (!connectionSetup)
        {
            if (recvBuf.size() < 12) continue;
            uint16_t authProtoLen = *(uint16_t *)&recvBuf[6];
            uint16_t authDataLen  = *(uint16_t *)&recvBuf[8];
            size_t pad1 = (4 - (authProtoLen % 4)) % 4;
            size_t pad2 = (4 - (authDataLen  % 4)) % 4;
            size_t setupSize = 12 + authProtoLen + pad1 + authDataLen + pad2;
            if (recvBuf.size() < setupSize) continue;

            if (m_protocol->ProcessConnectionSetup(recvBuf))
            {
                SendData(m_protocol->GenerateConnectionSetupResponse());
                connectionSetup = true;
            }
            else
            {
                std::cerr << "Connection setup failed" << std::endl;
                break;
            }
            recvBuf.erase(recvBuf.begin(), recvBuf.begin() + setupSize);
            continue;
        }

        // ── X11 요청 스트림 처리 ────────────────────────────────────────
        while (recvBuf.size() >= 4)
        {
            uint16_t lenField = *(uint16_t *)&recvBuf[2];
            size_t reqSize = (size_t)lenField * 4;
            if (reqSize < 4)
            {
                std::cerr << "Invalid request length" << std::endl;
                recvBuf.clear();
                break;
            }
            if (recvBuf.size() < reqSize) break;

            std::vector<uint8_t> req(recvBuf.begin(), recvBuf.begin() + reqSize);
            m_protocol->ProcessRequest(req);

            if (m_protocol->HasPendingResponse())
                SendData(m_protocol->GetPendingResponse());

            recvBuf.erase(recvBuf.begin(), recvBuf.begin() + reqSize);
        }

        // 요청 처리 후 이벤트 전송
        pumpEvents();
    }
}

bool NetworkClient::SendData(const std::vector<uint8_t> &data)
{
    if (data.empty()) return true;
    size_t sent = 0;
    while (sent < data.size())
    {
        int r = send(m_socket, (const char *)data.data() + sent,
                     (int)(data.size() - sent), 0);
        if (r == SOCKET_ERROR) return false;
        sent += r;
    }
    return true;
}

} // namespace XMan
