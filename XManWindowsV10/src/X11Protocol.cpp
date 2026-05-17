#include "X11Protocol.h"
#include "EventQueue.h"
#include "WindowManager.h"
#include <cstring>
#include <iostream>

// Windows.h 매크로 충돌 방지
#ifdef CreateWindow
#undef CreateWindow
#endif
#ifdef MapWindow
#undef MapWindow
#endif

namespace XMan
{

// ─── 인라인 파싱 헬퍼 ────────────────────────────────────────────────────
static inline uint16_t R16(const uint8_t *d, size_t o) { return *(uint16_t *)(d + o); }
static inline uint32_t R32(const uint8_t *d, size_t o) { return *(uint32_t *)(d + o); }
static inline int16_t  S16(const uint8_t *d, size_t o) { return *(int16_t *)(d + o);  }

// VK → keysym (WindowManager.cpp와 동일 로직, 독립 복사)
static uint32_t vkToKeysym(UINT vk, bool shift)
{
    if (vk >= 'A' && vk <= 'Z') return shift ? (uint32_t)vk : (uint32_t)(vk + 0x20);
    if (vk >= '0' && vk <= '9')
    {
        if (!shift) return (uint32_t)vk;
        static const char m[] = ")!@#$%^&*(";
        return (uint32_t)(unsigned char)m[vk - '0'];
    }
    switch (vk)
    {
    case VK_SPACE:   return 0x0020; case VK_RETURN:  return 0xff0d;
    case VK_ESCAPE:  return 0xff1b; case VK_BACK:    return 0xff08;
    case VK_TAB:     return 0xff09; case VK_DELETE:  return 0xffff;
    case VK_INSERT:  return 0xff63; case VK_HOME:    return 0xff50;
    case VK_END:     return 0xff57; case VK_PRIOR:   return 0xff55;
    case VK_NEXT:    return 0xff56; case VK_LEFT:    return 0xff51;
    case VK_UP:      return 0xff52; case VK_RIGHT:   return 0xff53;
    case VK_DOWN:    return 0xff54;
    case VK_F1:  return 0xffbe; case VK_F2:  return 0xffbf;
    case VK_F3:  return 0xffc0; case VK_F4:  return 0xffc1;
    case VK_F5:  return 0xffc2; case VK_F6:  return 0xffc3;
    case VK_F7:  return 0xffc4; case VK_F8:  return 0xffc5;
    case VK_F9:  return 0xffc6; case VK_F10: return 0xffc7;
    case VK_F11: return 0xffc8; case VK_F12: return 0xffc9;
    case VK_LSHIFT: case VK_SHIFT:     return 0xffe1;
    case VK_RSHIFT:                    return 0xffe2;
    case VK_LCONTROL: case VK_CONTROL: return 0xffe3;
    case VK_RCONTROL:                  return 0xffe4;
    case VK_LMENU: case VK_MENU:       return 0xffe9;
    case VK_RMENU:                     return 0xffea;
    case VK_OEM_MINUS:  return shift ? 0x5f : 0x2d;
    case VK_OEM_PLUS:   return shift ? 0x3d : 0x2b;
    case VK_OEM_4:      return shift ? 0x7b : 0x5b;
    case VK_OEM_6:      return shift ? 0x7d : 0x5d;
    case VK_OEM_5:      return shift ? 0x7c : 0x5c;
    case VK_OEM_1:      return shift ? 0x3a : 0x3b;
    case VK_OEM_7:      return shift ? 0x22 : 0x27;
    case VK_OEM_COMMA:  return shift ? 0x3c : 0x2c;
    case VK_OEM_PERIOD: return shift ? 0x3e : 0x2e;
    case VK_OEM_2:      return shift ? 0x3f : 0x2f;
    case VK_OEM_3:      return shift ? 0x7e : 0x60;
    }
    return 0;
}

// pixel(0x00RRGGBB) → COLORREF(0x00BBGGRR)
static COLORREF pixelToColorref(uint32_t px)
{
    return RGB((px >> 16) & 0xFF, (px >> 8) & 0xFF, px & 0xFF);
}

// ─── 생성/소멸 ─────────────────────────────────────────────────────────────
X11Protocol::X11Protocol()  = default;
X11Protocol::~X11Protocol() = default;

// ─── 응답 헬퍼 ─────────────────────────────────────────────────────────────
void X11Protocol::Reply32(uint8_t detail)
{
    m_pendingResponse.assign(32, 0);
    m_pendingResponse[0] = 1;      // Reply
    m_pendingResponse[1] = detail;
    ReplyPutU16(2, m_sequenceNumber);
}
void X11Protocol::ReplyPutU16(size_t o, uint16_t v)
{
    m_pendingResponse[o]   = v & 0xFF;
    m_pendingResponse[o+1] = (v >> 8) & 0xFF;
}
void X11Protocol::ReplyPutU32(size_t o, uint32_t v)
{
    m_pendingResponse[o]   = v & 0xFF;
    m_pendingResponse[o+1] = (v >> 8) & 0xFF;
    m_pendingResponse[o+2] = (v >> 16) & 0xFF;
    m_pendingResponse[o+3] = (v >> 24) & 0xFF;
}

uint32_t X11Protocol::GCForeground(GContext gc) const
{
    auto it = m_gcTable.find(gc);
    return it != m_gcTable.end() ? it->second.foreground : 0;
}
uint32_t X11Protocol::GCBackground(GContext gc) const
{
    auto it = m_gcTable.find(gc);
    return it != m_gcTable.end() ? it->second.background : 0x00FFFFFF;
}

// ─── 연결 설정 ─────────────────────────────────────────────────────────────
bool X11Protocol::ProcessConnectionSetup(const std::vector<uint8_t> &data)
{
    if (data.size() < 12) return false;
    uint8_t  byteOrder     = data[0];
    uint16_t protocolMajor = R16(data.data(), 2);
    uint16_t protocolMinor = R16(data.data(), 4);
    std::cout << "Connection setup: byte-order=" << (char)byteOrder
              << " protocol=" << protocolMajor << "." << protocolMinor << std::endl;
    return protocolMajor == X11_PROTOCOL_MAJOR_VERSION;
}

std::vector<uint8_t> X11Protocol::GenerateConnectionSetupResponse()
{
    const char *vendor    = "XManWindowsV10";
    uint16_t vendorLen    = (uint16_t)strlen(vendor);
    uint16_t vendorPad    = (4 - (vendorLen % 4)) % 4;
    uint8_t  numFormats   = 1;
    uint8_t  numScreens   = 1;
    uint8_t  numDepths    = 1;
    uint16_t numVisuals   = 1;

    // additional data: 32(fixed) + vendor + formats + screen + depth + visual
    uint16_t addBytes = 32 + vendorLen + vendorPad
                      + 8 * numFormats
                      + 40 + 8 + 24 * numVisuals;
    uint16_t addLen = (addBytes + 3) / 4;

    std::vector<uint8_t> r;
    auto put1 = [&](uint8_t v)  { r.push_back(v); };
    auto put2 = [&](uint16_t v) { r.push_back(v & 0xFF); r.push_back(v >> 8); };
    auto put4 = [&](uint32_t v) { put2(v & 0xFFFF); put2(v >> 16); };

    // 8-byte header
    put1(1); put1(0);
    put2(X11_PROTOCOL_MAJOR_VERSION); put2(X11_PROTOCOL_MINOR_VERSION);
    put2(addLen);

    // Fixed 32 bytes
    put4(11000000);         // release-number
    put4(0x00400000);       // resource-id-base
    put4(0x003FFFFF);       // resource-id-mask
    put4(256);              // motion-buffer-size
    put2(vendorLen);
    put2(65535);            // max-request-length
    put1(numScreens);
    put1(numFormats);
    put1(0);                // image-byte-order: LSBFirst
    put1(0);                // bitmap-bit-order: LeastSignificant
    put1(32);               // bitmap-scanline-unit
    put1(32);               // bitmap-scanline-pad
    put1(8);                // min-keycode
    put1(255);              // max-keycode
    put4(0);                // unused

    // Vendor string + padding
    for (uint16_t i = 0; i < vendorLen; i++) put1((uint8_t)vendor[i]);
    for (uint16_t i = 0; i < vendorPad; i++) put1(0);

    // Pixmap format (8 bytes): depth=24, bpp=32, scanline-pad=32
    put1(24); put1(32); put1(32); put1(0); put4(0);

    // Screen (40 bytes)
    put4(0x00000001);       // root window
    put4(0x00000020);       // default-colormap
    put4(0x00FFFFFF);       // white-pixel
    put4(0x00000000);       // black-pixel
    put4(0);                // current-input-masks
    put2(1920); put2(1080);
    put2(508);  put2(285);
    put2(1);    put2(1);    // min/max installed maps
    put4(0x00000021);       // root-visual
    put1(0);                // backing-stores: Never
    put1(0);                // save-unders: False
    put1(24);               // root-depth
    put1(numDepths);

    // Depth (8 bytes)
    put1(24); put1(0); put2(numVisuals); put4(0);

    // Visual (24 bytes)
    put4(0x00000021);       // visual-id
    put1(4);                // TrueColor
    put1(8);                // bits-per-rgb
    put2(256);
    put4(0x00FF0000);       // red-mask
    put4(0x0000FF00);       // green-mask
    put4(0x000000FF);       // blue-mask
    put4(0);

    return r;
}

// ─── 요청 디스패치 ────────────────────────────────────────────────────────
bool X11Protocol::ProcessRequest(const std::vector<uint8_t> &data)
{
    if (data.size() < 4) return false;
    m_sequenceNumber++;
    m_pendingResponse.clear();

    uint8_t op = data[0];
    switch (op)
    {
    // 창/리소스 관리
    case 1:  ProcessCreateWindow(data.data(), data.size()); break;
    case 2:  ProcessChangeWindowAttributes(data.data(), data.size()); break;
    case 4:  if (m_windowManager) m_windowManager->DestroyXWindow(R32(data.data(),4)); break;
    case 8:  ProcessMapWindow(data.data(), data.size()); break;
    case 9:  ProcessMapSubwindows(data.data(), data.size()); break;
    case 10: if (m_windowManager) m_windowManager->UnmapWindow(R32(data.data(),4)); break;
    case 12: ProcessConfigureWindow(data.data(), data.size()); break;
    case 55: ProcessCreateGC(data.data(), data.size()); break;
    case 56: ProcessChangeGC(data.data(), data.size()); break;
    case 60: ProcessFreeGC(data.data(), data.size()); break;
    case 53: ProcessCreatePixmap(data.data(), data.size()); break;
    case 54: ProcessFreePixmap(data.data(), data.size()); break;
    case 62: ProcessCopyArea(data.data(), data.size()); break;

    // 쿼리
    case 3:  ProcessGetWindowAttributes(data.data(), data.size()); break;
    case 14: ProcessGetGeometry(data.data(), data.size()); break;
    case 16: ProcessInternAtom(data.data(), data.size()); break;
    case 17: ProcessGetAtomName(data.data(), data.size()); break;
    case 18: break; // ChangeProperty — no reply
    case 19: break; // DeleteProperty — no reply
    case 20: ProcessGetProperty(data.data(), data.size()); break;
    case 38: ProcessQueryPointer(data.data(), data.size()); break;
    case 43: ProcessGetInputFocus(data.data(), data.size()); break;
    case 84: ProcessAllocColor(data.data(), data.size()); break;
    case 91: ProcessQueryColors(data.data(), data.size()); break;
    case 97: ProcessQueryBestSize(data.data(), data.size()); break;
    case 98: ProcessQueryExtension(data.data(), data.size()); break;
    case 99: ProcessListExtensions(data.data(), data.size()); break;
    case 101: ProcessGetKeyboardMapping(data.data(), data.size()); break;
    case 103: ProcessGetKeyboardControl(data.data(), data.size()); break;
    case 108: ProcessGetScreenSaver(data.data(), data.size()); break;
    case 117: ProcessGetPointerMapping(data.data(), data.size()); break;
    case 119: ProcessGetModifierMapping(data.data(), data.size()); break;

    // 그리기
    case 61: ProcessClearArea(data.data(), data.size()); break;
    case 65: ProcessPolyLine(data.data(), data.size()); break;
    case 66: ProcessPolySegment(data.data(), data.size()); break;
    case 67: ProcessPolyRectangle(data.data(), data.size()); break;
    case 68: ProcessPolyArc(data.data(), data.size()); break;
    case 69: ProcessFillPoly(data.data(), data.size()); break;
    case 70: ProcessPolyFillRectangle(data.data(), data.size()); break;
    case 71: ProcessPolyFillArc(data.data(), data.size()); break;
    case 72: ProcessPutImage(data.data(), data.size()); break;
    case 76: ProcessImageText8(data.data(), data.size()); break;
    case 77: ProcessImageText8(data.data(), data.size()); break; // ImageText16 — 단순화

    // 무시 (응답 불필요)
    case 6: case 7: case 11: case 13:      // Reparent, ChangeSave, UnmapSubs, Circulate
    case 22: case 23: case 24: case 25:    // Selection
    case 26: case 27: case 28: case 29:    // Grab
    case 30: case 31: case 32: case 33: case 34: case 35:
    case 36: case 37: case 39: case 40: case 41: case 42:
    case 45: case 46: case 47: case 48: case 49: case 50: case 51:
    case 57: case 58: case 59:
    case 63: case 64:
    case 73: case 74: case 75:
    case 78: case 79: case 80: case 81: case 82:
    case 83: case 85: case 86: case 87: case 88: case 89: case 90:
    case 92: case 93: case 94: case 95: case 96:
    case 100: case 102: case 104: case 105: case 106:
    case 107: case 109: case 110: case 111: case 112: case 113:
    case 114: case 115: case 116: case 118: case 127:
        break;

    default:
        std::cout << "Unhandled opcode: " << (int)op << std::endl;
        break;
    }
    return true;
}

std::vector<uint8_t> X11Protocol::GetPendingResponse()
{
    std::vector<uint8_t> r = std::move(m_pendingResponse);
    m_pendingResponse.clear();
    return r;
}

void X11Protocol::AppendExposeEvent(Window wid, int x, int y, int width, int height)
{
    std::vector<uint8_t> ev(32, 0);
    ev[0] = 12; // Expose event code
    // bytes 2-3: sequence number of last processed request
    ev[2] = m_sequenceNumber & 0xFF;
    ev[3] = (m_sequenceNumber >> 8) & 0xFF;
    // bytes 4-7: window
    ev[4] = wid & 0xFF;
    ev[5] = (wid >> 8) & 0xFF;
    ev[6] = (wid >> 16) & 0xFF;
    ev[7] = (wid >> 24) & 0xFF;
    // bytes 8-15: x, y, width, height
    ev[8]  = x & 0xFF;          ev[9]  = (x >> 8) & 0xFF;
    ev[10] = y & 0xFF;          ev[11] = (y >> 8) & 0xFF;
    ev[12] = width & 0xFF;      ev[13] = (width >> 8) & 0xFF;
    ev[14] = height & 0xFF;     ev[15] = (height >> 8) & 0xFF;
    // bytes 16-17: count = 0 (last Expose)
    m_pendingResponse.insert(m_pendingResponse.end(), ev.begin(), ev.end());
}

// ─── 창/리소스 관리 ───────────────────────────────────────────────────────

bool X11Protocol::ProcessCreateWindow(const uint8_t *d, size_t n)
{
    if (n < 32) return false;
    Window   wid    = R32(d, 4);
    Window   parent = R32(d, 8);
    int16_t  x      = S16(d, 12), y = S16(d, 14);
    uint16_t w      = R16(d, 16), h = R16(d, 18);

    if (m_windowManager)
        m_windowManager->CreateXWindow(wid, parent, x, y, w, h, m_eventQueue);

    // 이벤트 마스크도 파싱
    uint32_t valueMask = R32(d, 28);
    if (valueMask & 0x0800) // CWEventMask
    {
        // 값 목록에서 CWEventMask 위치 찾기
        size_t off = 32;
        for (int bit = 0; bit < 15; bit++)
        {
            if (!(valueMask & (1u << bit))) continue;
            if (bit == 11 && off + 4 <= n) // CWEventMask
            {
                if (m_windowManager)
                    m_windowManager->UpdateEventMask(wid, R32(d, off));
            }
            off += 4;
        }
    }
    std::cout << "CreateWindow: wid=" << wid << " " << w << "x" << h
              << " parent=" << parent << std::endl;
    return true;
}

bool X11Protocol::ProcessChangeWindowAttributes(const uint8_t *d, size_t n)
{
    if (n < 12) return false;
    Window   xid      = R32(d, 4);
    uint32_t valueMask = R32(d, 8);

    if (!(valueMask & 0x0800)) return true; // CWEventMask not set

    size_t off = 12;
    for (int bit = 0; bit < 15; bit++)
    {
        if (!(valueMask & (1u << bit))) continue;
        if (bit == 11 && off + 4 <= n)
        {
            if (m_windowManager)
                m_windowManager->UpdateEventMask(xid, R32(d, off));
        }
        off += 4;
    }
    return true;
}

bool X11Protocol::ProcessMapWindow(const uint8_t *d, size_t n)
{
    if (n < 8) return false;
    Window wid = R32(d, 4);
    std::cout << "MapWindow: " << wid << std::endl;

    if (!m_windowManager) return true;
    m_windowManager->MapWindow(wid); // postSync: 메인 스레드에서 창 표시 후 반환

    // 이 창에 대한 Expose 전송
    XWindowInfo *info = m_windowManager->GetWindowInfo(wid);
    if (info)
        AppendExposeEvent(wid, 0, 0, info->width, info->height);

    return true;
}

bool X11Protocol::ProcessMapSubwindows(const uint8_t *d, size_t n)
{
    if (n < 8) return false;
    Window wid = R32(d, 4);
    std::cout << "MapSubwindows: " << wid << std::endl;
    if (!m_windowManager) return true;

    // 자식들을 조용히 맵핑 (Expose 없음)
    // Expose는 이후 MapWindow(parent)가 처리할 때 자식 포함해서 전송
    m_windowManager->MapSubwindows(wid);
    return true;
}

void X11Protocol::ProcessConfigureWindow(const uint8_t *d, size_t n)
{
    if (n < 12) return;
    Window   xid  = R32(d, 4);
    uint16_t mask = R16(d, 8);

    int x = 0, y = 0, w = 0, h = 0;
    size_t off = 12;

    XWindowInfo *info = m_windowManager ? m_windowManager->GetWindowInfo(xid) : nullptr;
    if (info) { x = info->x; y = info->y; w = info->width; h = info->height; }

    auto readVal = [&]() -> int16_t {
        if (off + 4 > n) return 0;
        int16_t v = (int16_t)R32(d, off); off += 4; return v;
    };

    if (mask & 0x01) x = readVal(); // CWX
    if (mask & 0x02) y = readVal(); // CWY
    if (mask & 0x04) w = readVal(); // CWWidth
    if (mask & 0x08) h = readVal(); // CWHeight
    // other bits ignored

    if (m_windowManager) m_windowManager->ConfigureWindow(xid, x, y, w, h);
}

bool X11Protocol::ProcessCreateGC(const uint8_t *d, size_t n)
{
    if (n < 16) return false;
    GContext cid      = R32(d, 4);
    uint32_t valueMask = R32(d, 12);

    GCInfo gc;
    size_t off = 16;
    for (int bit = 0; bit < 23 && off + 4 <= n; bit++)
    {
        if (!(valueMask & (1u << bit))) continue;
        uint32_t val = R32(d, off); off += 4;
        if (bit == 2)  gc.foreground = val;
        if (bit == 3)  gc.background = val;
        if (bit == 4)  gc.lineWidth  = (uint16_t)val;
        if (bit == 5)  gc.lineStyle  = (uint8_t)val;
        if (bit == 8)  gc.fillStyle  = (uint8_t)val;
        if (bit == 21) gc.function   = (uint8_t)val;
    }
    m_gcTable[cid] = gc;
    return true;
}

void X11Protocol::ProcessChangeGC(const uint8_t *d, size_t n)
{
    if (n < 12) return;
    GContext cid      = R32(d, 4);
    uint32_t valueMask = R32(d, 8);

    auto &gc = m_gcTable[cid];
    size_t off = 12;
    for (int bit = 0; bit < 23 && off + 4 <= n; bit++)
    {
        if (!(valueMask & (1u << bit))) continue;
        uint32_t val = R32(d, off); off += 4;
        if (bit == 2)  gc.foreground = val;
        if (bit == 3)  gc.background = val;
        if (bit == 4)  gc.lineWidth  = (uint16_t)val;
        if (bit == 5)  gc.lineStyle  = (uint8_t)val;
        if (bit == 8)  gc.fillStyle  = (uint8_t)val;
        if (bit == 21) gc.function   = (uint8_t)val;
    }
}

void X11Protocol::ProcessFreeGC(const uint8_t *d, size_t n)
{
    if (n < 8) return;
    m_gcTable.erase(R32(d, 4));
}

void X11Protocol::ProcessCreatePixmap(const uint8_t *d, size_t n)
{
    if (n < 16) return;
    uint8_t  depth  = d[1];
    Drawable xid    = R32(d, 4);
    uint16_t width  = R16(d, 12);
    uint16_t height = R16(d, 14);

    if (m_windowManager)
        m_windowManager->CreatePixmap(xid, width, height, depth);
}

void X11Protocol::ProcessFreePixmap(const uint8_t *d, size_t n)
{
    if (n < 8) return;
    if (m_windowManager) m_windowManager->FreePixmap(R32(d, 4));
}

void X11Protocol::ProcessCopyArea(const uint8_t *d, size_t n)
{
    if (n < 28) return;
    Drawable src = R32(d, 4);
    Drawable dst = R32(d, 8);
    // gc    = R32(d, 12); // 사용 안 함 (단순 BitBlt)
    int16_t  srcX = S16(d, 16), srcY = S16(d, 18);
    int16_t  dstX = S16(d, 20), dstY = S16(d, 22);
    uint16_t w    = R16(d, 24), h    = R16(d, 26);

    if (m_windowManager)
        m_windowManager->CopyArea(src, dst, srcX, srcY, w, h, dstX, dstY);
}

// ─── 쿼리 ─────────────────────────────────────────────────────────────────

void X11Protocol::ProcessGetGeometry(const uint8_t *d, size_t n)
{
    if (n < 8) return;
    Drawable xid = R32(d, 4);

    int w = 0, h = 0;
    if (m_windowManager) m_windowManager->GetDrawableSize(xid, w, h);

    Reply32(24); // depth=24
    ReplyPutU32(4, 0);  // length
    ReplyPutU32(8, 1);  // root window
    ReplyPutU16(12, 0); // x
    ReplyPutU16(14, 0); // y
    ReplyPutU16(16, (uint16_t)w);
    ReplyPutU16(18, (uint16_t)h);
    ReplyPutU16(20, 0); // border-width
}

void X11Protocol::ProcessGetWindowAttributes(const uint8_t *d, size_t n)
{
    (void)d; (void)n;
    m_pendingResponse.assign(44, 0);
    m_pendingResponse[0] = 1;
    m_pendingResponse[1] = 0; // backing-store=NotUseful
    ReplyPutU16(2, m_sequenceNumber);
    ReplyPutU32(4, 3); // length=3
    ReplyPutU32(8,  0x00000021); // visual
    ReplyPutU16(12, 1); // class=InputOutput
    m_pendingResponse[15] = 1; // win-gravity=NorthWest
    m_pendingResponse[26] = 2; // map-state=IsViewable
    ReplyPutU32(28, 0x00000020); // colormap
}

void X11Protocol::ProcessGetInputFocus(const uint8_t *d, size_t n)
{
    (void)d; (void)n;
    Reply32(0);
    // focus=None(0), revert=None(0) — already zeroed
}

void X11Protocol::ProcessInternAtom(const uint8_t *d, size_t n)
{
    if (n < 8) return;
    (void)d[1]; // only_if_exists
    uint16_t nameLen = R16(d, 4);
    std::string name;
    if (n >= 8 + nameLen) name = std::string((const char*)d + 8, nameLen);

    // 기존 atom 검색
    uint32_t atom = 0;
    for (auto &kv : m_atomNames)
        if (kv.second == name) { atom = kv.first; break; }
    if (!atom) { atom = m_nextAtom++; m_atomNames[atom] = name; }

    Reply32(0);
    ReplyPutU32(8, atom);
}

void X11Protocol::ProcessGetAtomName(const uint8_t *d, size_t n)
{
    if (n < 8) return;
    uint32_t atom = R32(d, 4);
    auto it = m_atomNames.find(atom);
    std::string name = (it != m_atomNames.end()) ? it->second : "";

    uint16_t nameLen = (uint16_t)name.size();
    uint16_t namePad = (4 - (nameLen % 4)) % 4;
    uint32_t addLen  = (nameLen + namePad) / 4;

    m_pendingResponse.assign(32 + nameLen + namePad, 0);
    m_pendingResponse[0] = 1;
    ReplyPutU16(2, m_sequenceNumber);
    ReplyPutU32(4, addLen);
    ReplyPutU16(8, nameLen);
    for (uint16_t i = 0; i < nameLen; i++) m_pendingResponse[32 + i] = name[i];
}

void X11Protocol::ProcessGetProperty(const uint8_t *d, size_t n)
{
    (void)d; (void)n;
    Reply32(0);
    // type=NONE(0), bytes-after=0, length=0 — already zeroed
}

void X11Protocol::ProcessQueryExtension(const uint8_t *d, size_t n)
{
    (void)d; (void)n;
    Reply32(0); // present=0
}

void X11Protocol::ProcessListExtensions(const uint8_t *d, size_t n)
{
    (void)d; (void)n;
    Reply32(0); // number-of-names=0
}

void X11Protocol::ProcessQueryPointer(const uint8_t *d, size_t n)
{
    (void)d; (void)n;
    Reply32(1); // same-screen=True
    ReplyPutU32(8, 1); // root
}

void X11Protocol::ProcessQueryBestSize(const uint8_t *d, size_t n)
{
    if (n < 12) return;
    uint16_t w = R16(d, 8), h = R16(d, 10);
    Reply32(0);
    ReplyPutU16(8, w); ReplyPutU16(10, h);
}

void X11Protocol::ProcessGetKeyboardMapping(const uint8_t *d, size_t n)
{
    if (n < 8) return;
    uint8_t firstKey = d[4];
    uint8_t count    = d[5];
    uint8_t kpk      = 2; // keysyms-per-keycode

    uint32_t addLen = (uint32_t)kpk * count;
    m_pendingResponse.assign(32 + addLen * 4, 0);
    m_pendingResponse[0] = 1;
    m_pendingResponse[1] = kpk;
    ReplyPutU16(2, m_sequenceNumber);
    ReplyPutU32(4, addLen);

    for (uint8_t i = 0; i < count; i++)
    {
        UINT vk = firstKey + i;
        uint32_t sym0 = vkToKeysym(vk, false);
        uint32_t sym1 = vkToKeysym(vk, true);
        size_t base = 32 + i * kpk * 4;
        m_pendingResponse[base+0] = sym0 & 0xFF;
        m_pendingResponse[base+1] = (sym0 >> 8) & 0xFF;
        m_pendingResponse[base+2] = (sym0 >> 16) & 0xFF;
        m_pendingResponse[base+3] = (sym0 >> 24) & 0xFF;
        m_pendingResponse[base+4] = sym1 & 0xFF;
        m_pendingResponse[base+5] = (sym1 >> 8) & 0xFF;
        m_pendingResponse[base+6] = (sym1 >> 16) & 0xFF;
        m_pendingResponse[base+7] = (sym1 >> 24) & 0xFF;
    }
}

void X11Protocol::ProcessGetModifierMapping(const uint8_t *d, size_t n)
{
    (void)d; (void)n;
    Reply32(0); // keycodes-per-modifier=0
}

void X11Protocol::ProcessGetPointerMapping(const uint8_t *d, size_t n)
{
    (void)d; (void)n;
    uint8_t numBtn = 5;
    uint8_t pad    = (4 - (numBtn % 4)) % 4;
    uint32_t addLen = (numBtn + pad) / 4;
    m_pendingResponse.assign(32 + addLen * 4, 0);
    m_pendingResponse[0] = 1;
    m_pendingResponse[1] = numBtn;
    ReplyPutU16(2, m_sequenceNumber);
    ReplyPutU32(4, addLen);
    for (uint8_t i = 0; i < numBtn; i++) m_pendingResponse[32 + i] = i + 1;
}

void X11Protocol::ProcessGetKeyboardControl(const uint8_t *d, size_t n)
{
    (void)d; (void)n;
    m_pendingResponse.assign(64, 0);
    m_pendingResponse[0] = 1;
    m_pendingResponse[1] = 1; // global-auto-repeat=On
    ReplyPutU16(2, m_sequenceNumber);
    ReplyPutU32(4, 8); // length=8 (32 extra bytes)
}

void X11Protocol::ProcessGetScreenSaver(const uint8_t *d, size_t n)
{
    (void)d; (void)n;
    Reply32(0);
}

void X11Protocol::ProcessAllocColor(const uint8_t *d, size_t n)
{
    if (n < 16) return;
    uint16_t r = R16(d, 8), g = R16(d, 10), b = R16(d, 12);
    uint32_t pixel = ((uint32_t)(r >> 8) << 16) |
                     ((uint32_t)(g >> 8) <<  8) |
                     ((uint32_t)(b >> 8));
    Reply32(0);
    ReplyPutU16(8, r); ReplyPutU16(10, g); ReplyPutU16(12, b);
    ReplyPutU32(16, pixel);
}

void X11Protocol::ProcessQueryColors(const uint8_t *d, size_t n)
{
    if (n < 12) return;
    uint32_t cnt = (uint32_t)(n - 8) / 4;
    m_pendingResponse.assign(32 + 8 * cnt, 0);
    m_pendingResponse[0] = 1;
    ReplyPutU16(2, m_sequenceNumber);
    ReplyPutU32(4, 2 * cnt);
    ReplyPutU16(8, (uint16_t)cnt);
    for (uint32_t i = 0; i < cnt; i++)
    {
        uint32_t px = R32(d, 8 + i * 4);
        uint16_t rv = (uint16_t)(((px >> 16) & 0xFF) * 257);
        uint16_t gv = (uint16_t)(((px >>  8) & 0xFF) * 257);
        uint16_t bv = (uint16_t)(((px      ) & 0xFF) * 257);
        size_t base = 32 + i * 8;
        ReplyPutU16(base,   rv);
        ReplyPutU16(base+2, gv);
        ReplyPutU16(base+4, bv);
    }
}

// ─── 그리기 ────────────────────────────────────────────────────────────────

void X11Protocol::ProcessPolyFillArc(const uint8_t *d, size_t n)
{
    if (n < 12 || !m_windowManager) return;
    Drawable dst = R32(d, 4);
    GContext gc  = R32(d, 8);
    COLORREF col = pixelToColorref(GCForeground(gc));

    int cnt = (int)(n - 12) / 12;
    std::vector<RECT> rects;
    for (int i = 0; i < cnt; i++)
    {
        int16_t  x = S16(d, 12+i*12+0), y = S16(d, 12+i*12+2);
        uint16_t w = R16(d, 12+i*12+4), h = R16(d, 12+i*12+6);
        rects.push_back({x, y, x+(LONG)w, y+(LONG)h});
    }
    m_windowManager->GDIFillEllipses(dst, col, rects.data(), (int)rects.size());
}

void X11Protocol::ProcessPolyArc(const uint8_t *d, size_t n)
{
    if (n < 12 || !m_windowManager) return;
    Drawable dst = R32(d, 4);
    GContext gc  = R32(d, 8);
    COLORREF col = pixelToColorref(GCForeground(gc));

    int cnt = (int)(n - 12) / 12;
    std::vector<RECT> rects;
    for (int i = 0; i < cnt; i++)
    {
        int16_t  x = S16(d, 12+i*12+0), y = S16(d, 12+i*12+2);
        uint16_t w = R16(d, 12+i*12+4), h = R16(d, 12+i*12+6);
        rects.push_back({x, y, x+(LONG)w, y+(LONG)h});
    }
    m_windowManager->GDIDrawEllipses(dst, col, rects.data(), (int)rects.size());
}

void X11Protocol::ProcessPolyFillRectangle(const uint8_t *d, size_t n)
{
    if (n < 12 || !m_windowManager) return;
    Drawable dst = R32(d, 4);
    GContext gc  = R32(d, 8);
    COLORREF col = pixelToColorref(GCForeground(gc));

    int cnt = (int)(n - 12) / 8;
    std::vector<RECT> rects;
    for (int i = 0; i < cnt; i++)
    {
        int16_t  x = S16(d, 12+i*8+0), y = S16(d, 12+i*8+2);
        uint16_t w = R16(d, 12+i*8+4), h = R16(d, 12+i*8+6);
        rects.push_back({x, y, x+(LONG)w, y+(LONG)h});
    }
    m_windowManager->GDIFillRects(dst, col, rects.data(), (int)rects.size());
}

void X11Protocol::ProcessPolyRectangle(const uint8_t *d, size_t n)
{
    if (n < 12 || !m_windowManager) return;
    Drawable dst = R32(d, 4);
    GContext gc  = R32(d, 8);
    COLORREF col = pixelToColorref(GCForeground(gc));

    int cnt = (int)(n - 12) / 8;
    std::vector<RECT> rects;
    for (int i = 0; i < cnt; i++)
    {
        int16_t  x = S16(d, 12+i*8+0), y = S16(d, 12+i*8+2);
        uint16_t w = R16(d, 12+i*8+4), h = R16(d, 12+i*8+6);
        rects.push_back({x, y, x+(LONG)w, y+(LONG)h});
    }
    // PolyRectangle: draw outlines
    HDC dc = m_windowManager->GetDrawableDC(dst);
    if (!dc) return;
    HPEN pen = CreatePen(PS_SOLID, 1, col);
    HBRUSH oldBrush = (HBRUSH)SelectObject(dc, GetStockObject(NULL_BRUSH));
    HPEN   oldPen   = (HPEN)SelectObject(dc, pen);
    for (auto &r : rects)
        Rectangle(dc, r.left, r.top, r.right, r.bottom);
    SelectObject(dc, oldPen); SelectObject(dc, oldBrush);
    DeleteObject(pen);
    m_windowManager->FlushToScreen(static_cast<Window>(dst));
}

void X11Protocol::ProcessPolyLine(const uint8_t *d, size_t n)
{
    if (n < 12 || !m_windowManager) return;
    Drawable dst = R32(d, 4);
    GContext gc  = R32(d, 8);
    COLORREF col = pixelToColorref(GCForeground(gc));
    uint8_t  coordMode = d[1]; // 0=Origin, 1=Previous

    int cnt = (int)(n - 12) / 4;
    if (cnt < 2) return;

    std::vector<POINT> pts;
    int16_t ax = 0, ay = 0;
    for (int i = 0; i < cnt; i++)
    {
        int16_t px = S16(d, 12+i*4+0), py = S16(d, 12+i*4+2);
        if (coordMode == 1 && i > 0) { ax += px; ay += py; }
        else { ax = px; ay = py; }
        pts.push_back({ax, ay});
    }
    m_windowManager->GDIDrawLines(dst, col, pts.data(), (int)pts.size());
}

void X11Protocol::ProcessPolySegment(const uint8_t *d, size_t n)
{
    if (n < 12 || !m_windowManager) return;
    Drawable dst = R32(d, 4);
    GContext gc  = R32(d, 8);
    COLORREF col = pixelToColorref(GCForeground(gc));

    HDC dc = m_windowManager->GetDrawableDC(dst);
    if (!dc) return;
    HPEN pen = CreatePen(PS_SOLID, 1, col);
    HPEN old = (HPEN)SelectObject(dc, pen);

    int cnt = (int)(n - 12) / 8;
    for (int i = 0; i < cnt; i++)
    {
        int16_t x1 = S16(d, 12+i*8+0), y1 = S16(d, 12+i*8+2);
        int16_t x2 = S16(d, 12+i*8+4), y2 = S16(d, 12+i*8+6);
        MoveToEx(dc, x1, y1, nullptr);
        LineTo(dc, x2, y2);
    }
    SelectObject(dc, old); DeleteObject(pen);
    m_windowManager->FlushToScreen(static_cast<Window>(dst));
}

void X11Protocol::ProcessFillPoly(const uint8_t *d, size_t n)
{
    if (n < 16 || !m_windowManager) return;
    Drawable dst = R32(d, 4);
    GContext gc  = R32(d, 8);
    COLORREF col = pixelToColorref(GCForeground(gc));
    uint8_t  coordMode = d[9]; // 0=Origin, 1=Previous

    int cnt = (int)(n - 16) / 4;
    if (cnt < 3) return;

    std::vector<POINT> pts;
    int16_t ax = 0, ay = 0;
    for (int i = 0; i < cnt; i++)
    {
        int16_t px = S16(d, 16+i*4+0), py = S16(d, 16+i*4+2);
        if (coordMode == 1 && i > 0) { ax += px; ay += py; }
        else { ax = px; ay = py; }
        pts.push_back({ax, ay});
    }

    HDC dc = m_windowManager->GetDrawableDC(dst);
    if (!dc) return;
    HBRUSH brush = CreateSolidBrush(col);
    HPEN   pen   = CreatePen(PS_NULL, 0, 0);
    HBRUSH ob = (HBRUSH)SelectObject(dc, brush);
    HPEN   op = (HPEN)SelectObject(dc, pen);
    Polygon(dc, pts.data(), (int)pts.size());
    SelectObject(dc, ob); SelectObject(dc, op);
    DeleteObject(brush); DeleteObject(pen);
    m_windowManager->FlushToScreen(static_cast<Window>(dst));
}

void X11Protocol::ProcessClearArea(const uint8_t *d, size_t n)
{
    if (n < 16 || !m_windowManager) return;
    Window   xid = R32(d, 4);
    int16_t  x   = S16(d, 8), y = S16(d, 10);
    uint16_t w   = R16(d, 12), h = R16(d, 14);

    if (w == 0 || h == 0)
    {
        XWindowInfo *info = m_windowManager->GetWindowInfo(xid);
        if (info) { w = w ? w : (uint16_t)info->width; h = h ? h : (uint16_t)info->height; }
    }
    m_windowManager->GDIClearArea(xid, x, y, w, h);
}

void X11Protocol::ProcessImageText8(const uint8_t *d, size_t n)
{
    if (n < 16 || !m_windowManager) return;
    uint8_t  strlen_ = d[1];
    Drawable dst  = R32(d, 4);
    GContext gc   = R32(d, 8);
    int16_t  x    = S16(d, 12), y = S16(d, 14);
    COLORREF col  = pixelToColorref(GCForeground(gc));

    if (n < 16 + strlen_) return;
    std::string text((const char*)d + 16, strlen_);

    HDC dc = m_windowManager->GetDrawableDC(dst);
    if (!dc) return;
    SetTextColor(dc, col);
    SetBkMode(dc, TRANSPARENT);
    TextOutA(dc, x, y - 12, text.c_str(), (int)text.size()); // y offset: approx font height
    m_windowManager->FlushToScreen(static_cast<Window>(dst));
}

void X11Protocol::ProcessPutImage(const uint8_t *d, size_t n)
{
    if (n < 24 || !m_windowManager) return;
    uint8_t  format = d[1];
    Drawable dst    = R32(d, 4);
    // gc           = R32(d, 8);
    uint16_t w      = R16(d, 12), h = R16(d, 14);
    int16_t  x      = S16(d, 16), y = S16(d, 18);
    uint8_t  depth  = d[21];

    const uint8_t *data = d + 24;
    size_t   dataLen    = n - 24;

    m_windowManager->GDIPutImage(dst, x, y, w, h, depth, format, data, dataLen);
}

} // namespace XMan
