#pragma once

#include <cstdint>
#include <string>

namespace XMan
{

    // X11 프로토콜 상수
    constexpr uint16_t X11_PROTOCOL_MAJOR_VERSION = 11;
    constexpr uint16_t X11_PROTOCOL_MINOR_VERSION = 0;
    constexpr uint16_t DEFAULT_X_PORT = 6000;

    // 메시지 타입
    enum class X11Opcode : uint8_t
    {
        CreateWindow = 1,
        ChangeWindowAttributes = 2,
        GetWindowAttributes = 3,
        DestroyWindow = 4,
        DestroySubwindows = 5,
        MapWindow = 8,
        UnmapWindow = 10,
        ConfigureWindow = 12,
        CreateGC = 55,
        ChangeGC = 56,
        CopyArea = 62,
        PolyFillRectangle = 70,
        ImageText8 = 76,
        // ... 더 많은 opcode 추가 필요
    };

    // X11 기본 타입
    using XID = uint32_t;
    using Window = XID;
    using Drawable = XID;
    using GContext = XID;
    using Colormap = XID;

} // namespace XMan
