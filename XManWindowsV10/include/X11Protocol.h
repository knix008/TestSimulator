#pragma once

#include "XManTypes.h"
#include <memory>
#include <vector>

namespace XMan
{

    // X11 요청 헤더
    struct X11RequestHeader
    {
        uint8_t opcode;
        uint8_t data;
        uint16_t length; // 4바이트 단위
    };

    // X11 응답 헤더
    struct X11ReplyHeader
    {
        uint8_t type; // 1 = Reply
        uint8_t data;
        uint16_t sequence;
        uint32_t length; // 4바이트 단위
    };

    class X11Protocol
    {
    public:
        X11Protocol();
        ~X11Protocol();

        // 연결 초기화
        bool ProcessConnectionSetup(const std::vector<uint8_t> &data);
        std::vector<uint8_t> GenerateConnectionSetupResponse();

        // 요청 처리
        bool ProcessRequest(const std::vector<uint8_t> &data);

        // 이벤트 전송
        void SendEvent(const std::vector<uint8_t> &event);

    private:
        bool ProcessCreateWindow(const uint8_t *data, size_t length);
        bool ProcessMapWindow(const uint8_t *data, size_t length);
        bool ProcessCreateGC(const uint8_t *data, size_t length);

        uint16_t m_sequenceNumber = 0;
    };

} // namespace XMan
