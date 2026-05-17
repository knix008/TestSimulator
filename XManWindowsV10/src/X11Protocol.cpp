#include "X11Protocol.h"
#include <iostream>
#include <cstring>

namespace XMan
{

    X11Protocol::X11Protocol() = default;

    X11Protocol::~X11Protocol() = default;

    bool X11Protocol::ProcessConnectionSetup(const std::vector<uint8_t> &data)
    {
        // X11 연결 설정 처리
        // 최소 12바이트 필요 (헤더)
        if (data.size() < 12)
        {
            return false;
        }

        uint8_t byteOrder = data[0]; // 'l' = LSB first, 'B' = MSB first
        uint16_t protocolMajor = *(uint16_t *)&data[2];
        uint16_t protocolMinor = *(uint16_t *)&data[4];

        std::cout << "Connection setup request:" << std::endl;
        std::cout << "  Byte order: " << (char)byteOrder << std::endl;
        std::cout << "  Protocol: " << protocolMajor << "." << protocolMinor << std::endl;

        // X11 프로토콜 버전 확인
        if (protocolMajor != X11_PROTOCOL_MAJOR_VERSION)
        {
            std::cerr << "Unsupported X11 protocol version" << std::endl;
            return false;
        }

        return true;
    }

    std::vector<uint8_t> X11Protocol::GenerateConnectionSetupResponse()
    {
        std::vector<uint8_t> response;

        // 성공 응답 (1 = Success)
        response.push_back(1);
        response.push_back(0); // unused

        // 프로토콜 버전
        uint16_t major = X11_PROTOCOL_MAJOR_VERSION;
        uint16_t minor = X11_PROTOCOL_MINOR_VERSION;
        response.push_back(major & 0xFF);
        response.push_back((major >> 8) & 0xFF);
        response.push_back(minor & 0xFF);
        response.push_back((minor >> 8) & 0xFF);

        // 추가 데이터 길이 (4바이트 단위) - 간단한 구현
        uint16_t additionalLength = 0;
        response.push_back(additionalLength & 0xFF);
        response.push_back((additionalLength >> 8) & 0xFF);

        // 실제 구현에서는 더 많은 정보 필요:
        // - vendor 정보
        // - 루트 윈도우 정보
        // - 화면 정보 등

        std::cout << "Sending connection setup response" << std::endl;

        return response;
    }

    bool X11Protocol::ProcessRequest(const std::vector<uint8_t> &data)
    {
        if (data.size() < sizeof(X11RequestHeader))
        {
            return false;
        }

        const X11RequestHeader *header = (const X11RequestHeader *)data.data();
        X11Opcode opcode = static_cast<X11Opcode>(header->opcode);

        std::cout << "Processing X11 request: opcode=" << (int)header->opcode
                  << ", length=" << header->length << std::endl;

        // opcode에 따라 처리
        switch (opcode)
        {
        case X11Opcode::CreateWindow:
            return ProcessCreateWindow(data.data(), data.size());

        case X11Opcode::MapWindow:
            return ProcessMapWindow(data.data(), data.size());

        case X11Opcode::CreateGC:
            return ProcessCreateGC(data.data(), data.size());

            // TODO: 더 많은 opcode 처리 추가

        default:
            std::cout << "Unhandled opcode: " << (int)header->opcode << std::endl;
            break;
        }

        m_sequenceNumber++;
        return true;
    }

    void X11Protocol::SendEvent(const std::vector<uint8_t> &event)
    {
        // 이벤트를 클라이언트에 전송
        // 실제 구현에서는 네트워크 계층과 연결 필요
    }

    bool X11Protocol::ProcessCreateWindow(const uint8_t *data, size_t length)
    {
        if (length < 32)
        {
            return false;
        }

        // CreateWindow 요청 파싱
        uint8_t depth = data[1];
        Window wid = *(Window *)&data[4];
        Window parent = *(Window *)&data[8];
        int16_t x = *(int16_t *)&data[12];
        int16_t y = *(int16_t *)&data[14];
        uint16_t width = *(uint16_t *)&data[16];
        uint16_t height = *(uint16_t *)&data[18];

        std::cout << "CreateWindow: wid=" << wid
                  << ", parent=" << parent
                  << ", x=" << x << ", y=" << y
                  << ", width=" << width << ", height=" << height << std::endl;

        // TODO: WindowManager와 연동하여 실제 윈도우 생성

        return true;
    }

    bool X11Protocol::ProcessMapWindow(const uint8_t *data, size_t length)
    {
        if (length < 8)
        {
            return false;
        }

        Window wid = *(Window *)&data[4];

        std::cout << "MapWindow: wid=" << wid << std::endl;

        // TODO: WindowManager와 연동하여 윈도우 표시

        return true;
    }

    bool X11Protocol::ProcessCreateGC(const uint8_t *data, size_t length)
    {
        if (length < 16)
        {
            return false;
        }

        GContext cid = *(GContext *)&data[4];
        Drawable drawable = *(Drawable *)&data[8];

        std::cout << "CreateGC: cid=" << cid << ", drawable=" << drawable << std::endl;

        // TODO: GC (Graphics Context) 관리

        return true;
    }

} // namespace XMan
