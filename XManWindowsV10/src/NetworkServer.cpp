#include "NetworkServer.h"
#include "X11Protocol.h"
#include <ws2tcpip.h>
#include <iostream>

#pragma comment(lib, "ws2_32.lib")

namespace XMan
{

    // ===== NetworkServer =====

    NetworkServer::NetworkServer()
    {
        // Winsock 초기화
        WSADATA wsaData;
        int result = WSAStartup(MAKEWORD(2, 2), &wsaData);
        if (result != 0)
        {
            std::cerr << "WSAStartup failed: " << result << std::endl;
        }
    }

    NetworkServer::~NetworkServer()
    {
        Stop();
        WSACleanup();
    }

    bool NetworkServer::Start(int displayNumber)
    {
        if (m_running)
            return true;

        m_port = DEFAULT_X_PORT + displayNumber;

        // 소켓 생성
        m_serverSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (m_serverSocket == INVALID_SOCKET)
        {
            std::cerr << "Socket creation failed: " << WSAGetLastError() << std::endl;
            return false;
        }

        // 주소 바인딩
        sockaddr_in serverAddr{};
        serverAddr.sin_family = AF_INET;
        serverAddr.sin_addr.s_addr = INADDR_ANY;
        serverAddr.sin_port = htons(m_port);

        if (bind(m_serverSocket, (sockaddr *)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR)
        {
            std::cerr << "Bind failed: " << WSAGetLastError() << std::endl;
            closesocket(m_serverSocket);
            m_serverSocket = INVALID_SOCKET;
            return false;
        }

        // 리스닝 시작
        if (listen(m_serverSocket, SOMAXCONN) == SOCKET_ERROR)
        {
            std::cerr << "Listen failed: " << WSAGetLastError() << std::endl;
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
        if (!m_running)
            return;

        m_running = false;

        // 소켓 닫기
        if (m_serverSocket != INVALID_SOCKET)
        {
            closesocket(m_serverSocket);
            m_serverSocket = INVALID_SOCKET;
        }

        // 스레드 대기
        if (m_acceptThread.joinable())
        {
            m_acceptThread.join();
        }

        // 클라이언트 정리
        m_clients.clear();
    }

    void NetworkServer::AcceptLoop()
    {
        while (m_running)
        {
            sockaddr_in clientAddr{};
            int clientAddrLen = sizeof(clientAddr);

            SOCKET clientSocket = accept(m_serverSocket, (sockaddr *)&clientAddr, &clientAddrLen);

            if (clientSocket == INVALID_SOCKET)
            {
                if (m_running)
                {
                    std::cerr << "Accept failed: " << WSAGetLastError() << std::endl;
                }
                continue;
            }

            char clientIP[INET_ADDRSTRLEN];
            inet_ntop(AF_INET, &clientAddr.sin_addr, clientIP, INET_ADDRSTRLEN);
            std::cout << "New client connected from " << clientIP << std::endl;

            // 새 클라이언트 처리
            auto client = std::make_unique<NetworkClient>(clientSocket);
            client->Run();
            m_clients.push_back(std::move(client));
        }
    }

    void NetworkServer::HandleClient(SOCKET clientSocket)
    {
        // 각 클라이언트는 별도 스레드에서 처리됨
    }

    // ===== NetworkClient =====

    NetworkClient::NetworkClient(SOCKET socket)
        : m_socket(socket), m_protocol(std::make_unique<X11Protocol>())
    {
    }

    NetworkClient::~NetworkClient()
    {
        Stop();
    }

    void NetworkClient::Run()
    {
        if (m_running)
            return;

        m_running = true;
        m_receiveThread = std::thread(&NetworkClient::ReceiveLoop, this);
    }

    void NetworkClient::Stop()
    {
        if (!m_running)
            return;

        m_running = false;

        if (m_socket != INVALID_SOCKET)
        {
            closesocket(m_socket);
            m_socket = INVALID_SOCKET;
        }

        if (m_receiveThread.joinable())
        {
            m_receiveThread.join();
        }
    }

    void NetworkClient::ReceiveLoop()
    {
        std::vector<uint8_t> buffer;
        bool connectionSetup = false;

        while (m_running)
        {
            if (!ReceiveData(buffer))
            {
                break;
            }

            if (!connectionSetup)
            {
                // 첫 번째 메시지는 연결 설정
                if (m_protocol->ProcessConnectionSetup(buffer))
                {
                    auto response = m_protocol->GenerateConnectionSetupResponse();
                    SendData(response);
                    connectionSetup = true;
                }
            }
            else
            {
                // 일반 X11 요청 처리
                m_protocol->ProcessRequest(buffer);
            }

            buffer.clear();
        }

        std::cout << "Client disconnected" << std::endl;
    }

    bool NetworkClient::ReceiveData(std::vector<uint8_t> &buffer)
    {
        uint8_t tempBuffer[4096];

        int bytesReceived = recv(m_socket, (char *)tempBuffer, sizeof(tempBuffer), 0);

        if (bytesReceived > 0)
        {
            buffer.insert(buffer.end(), tempBuffer, tempBuffer + bytesReceived);
            return true;
        }
        else if (bytesReceived == 0)
        {
            // 연결 종료
            return false;
        }
        else
        {
            // 오류
            std::cerr << "recv failed: " << WSAGetLastError() << std::endl;
            return false;
        }
    }

    bool NetworkClient::SendData(const std::vector<uint8_t> &data)
    {
        int bytesSent = send(m_socket, (const char *)data.data(), data.size(), 0);

        if (bytesSent == SOCKET_ERROR)
        {
            std::cerr << "send failed: " << WSAGetLastError() << std::endl;
            return false;
        }

        return true;
    }

} // namespace XMan
