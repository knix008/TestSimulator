#pragma once

#include "XManTypes.h"
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace XMan
{

struct X11RequestHeader
{
    uint8_t  opcode;
    uint8_t  data;
    uint16_t length; // 4바이트 단위
};

class WindowManager;
class EventQueue;

class X11Protocol
{
public:
    X11Protocol();
    ~X11Protocol();

    void SetWindowManager(WindowManager *wm) { m_windowManager = wm; }
    void SetEventQueue(std::shared_ptr<EventQueue> eq) { m_eventQueue = eq; }

    bool ProcessConnectionSetup(const std::vector<uint8_t> &data);
    std::vector<uint8_t> GenerateConnectionSetupResponse();

    bool ProcessRequest(const std::vector<uint8_t> &data);

    std::vector<uint8_t> GetPendingResponse();
    bool HasPendingResponse() const { return !m_pendingResponse.empty(); }

private:
    // 창/리소스 관리
    bool ProcessCreateWindow(const uint8_t *d, size_t n);
    bool ProcessChangeWindowAttributes(const uint8_t *d, size_t n);
    bool ProcessMapWindow(const uint8_t *d, size_t n);
    bool ProcessMapSubwindows(const uint8_t *d, size_t n);
    bool ProcessCreateGC(const uint8_t *d, size_t n);
    void ProcessChangeGC(const uint8_t *d, size_t n);
    void ProcessFreeGC(const uint8_t *d, size_t n);
    void ProcessCreatePixmap(const uint8_t *d, size_t n);
    void ProcessFreePixmap(const uint8_t *d, size_t n);
    void ProcessCopyArea(const uint8_t *d, size_t n);
    void ProcessConfigureWindow(const uint8_t *d, size_t n);

    // 쿼리 / 응답 필요
    void ProcessGetGeometry(const uint8_t *d, size_t n);
    void ProcessGetWindowAttributes(const uint8_t *d, size_t n);
    void ProcessGetInputFocus(const uint8_t *d, size_t n);
    void ProcessGetKeyboardMapping(const uint8_t *d, size_t n);
    void ProcessGetModifierMapping(const uint8_t *d, size_t n);
    void ProcessGetPointerMapping(const uint8_t *d, size_t n);
    void ProcessQueryBestSize(const uint8_t *d, size_t n);
    void ProcessQueryExtension(const uint8_t *d, size_t n);
    void ProcessListExtensions(const uint8_t *d, size_t n);
    void ProcessInternAtom(const uint8_t *d, size_t n);
    void ProcessGetAtomName(const uint8_t *d, size_t n);
    void ProcessGetProperty(const uint8_t *d, size_t n);
    void ProcessGetKeyboardControl(const uint8_t *d, size_t n);
    void ProcessGetScreenSaver(const uint8_t *d, size_t n);
    void ProcessAllocColor(const uint8_t *d, size_t n);
    void ProcessQueryColors(const uint8_t *d, size_t n);
    void ProcessQueryPointer(const uint8_t *d, size_t n);

    // 그리기
    void ProcessPolyFillArc(const uint8_t *d, size_t n);
    void ProcessPolyArc(const uint8_t *d, size_t n);
    void ProcessPolyFillRectangle(const uint8_t *d, size_t n);
    void ProcessPolyRectangle(const uint8_t *d, size_t n);
    void ProcessPolyLine(const uint8_t *d, size_t n);
    void ProcessPolySegment(const uint8_t *d, size_t n);
    void ProcessFillPoly(const uint8_t *d, size_t n);
    void ProcessClearArea(const uint8_t *d, size_t n);
    void ProcessImageText8(const uint8_t *d, size_t n);
    void ProcessPutImage(const uint8_t *d, size_t n);

    // 헬퍼
    void AppendExposeEvent(Window wid, int x, int y, int width, int height);
    uint32_t GCForeground(GContext gc) const;
    uint32_t GCBackground(GContext gc) const;
    void Reply32(uint8_t detail = 0); // 32바이트 기본 응답 초기화
    void ReplyPutU16(size_t off, uint16_t v);
    void ReplyPutU32(size_t off, uint32_t v);

    struct GCInfo
    {
        uint32_t foreground  = 0x00000000;
        uint32_t background  = 0x00FFFFFF;
        uint8_t  fillStyle   = 0; // FillSolid
        uint8_t  lineStyle   = 0; // LineSolid
        uint16_t lineWidth   = 0;
        uint8_t  function    = 3; // GXcopy
    };

    uint16_t m_sequenceNumber = 0;
    std::vector<uint8_t>  m_pendingResponse;
    WindowManager        *m_windowManager = nullptr;
    std::shared_ptr<EventQueue> m_eventQueue;
    std::map<GContext, GCInfo>  m_gcTable;
    std::map<uint32_t, std::string> m_atomNames; // atom id → name
    uint32_t m_nextAtom = 1000;
};

} // namespace XMan
