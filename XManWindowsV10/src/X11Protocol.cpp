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

        // Calculate sizes first
        const char *vendor = "XManWindowsV10";
        uint16_t vendorLength = static_cast<uint16_t>(strlen(vendor));
        uint16_t vendorPad = (4 - (vendorLength % 4)) % 4; // Pad to 4-byte boundary

        uint8_t numFormats = 1;  // One pixmap format
        uint8_t numScreens = 1;  // One screen
        uint8_t numDepths = 1;   // One depth
        uint16_t numVisuals = 1; // One visual per depth

        // Calculate additional data length in 4-byte units
        // 32 bytes (fixed part) + vendor + padding + formats(8*numFormats) +
        // screen(40 base) + depth(8) + visuals(24*numVisuals)
        uint16_t additionalBytes = 32 + vendorLength + vendorPad + (8 * numFormats) + 40 + 8 + (24 * numVisuals);
        uint16_t additionalLength = (additionalBytes + 3) / 4; // Round up to 4-byte units

        // === 8-byte Header ===
        response.push_back(1); // Success
        response.push_back(0); // unused

        // Protocol version
        uint16_t major = X11_PROTOCOL_MAJOR_VERSION;
        uint16_t minor = X11_PROTOCOL_MINOR_VERSION;
        response.push_back(major & 0xFF);
        response.push_back((major >> 8) & 0xFF);
        response.push_back(minor & 0xFF);
        response.push_back((minor >> 8) & 0xFF);

        response.push_back(additionalLength & 0xFF);
        response.push_back((additionalLength >> 8) & 0xFF);

        // === Additional Data (32 bytes fixed part) ===

        // Release number (4 bytes)
        uint32_t releaseNumber = 11000000;
        response.push_back(releaseNumber & 0xFF);
        response.push_back((releaseNumber >> 8) & 0xFF);
        response.push_back((releaseNumber >> 16) & 0xFF);
        response.push_back((releaseNumber >> 24) & 0xFF);

        // Resource ID base and mask (8 bytes)
        uint32_t resourceIdBase = 0x00400000;
        uint32_t resourceIdMask = 0x003FFFFF;
        response.push_back(resourceIdBase & 0xFF);
        response.push_back((resourceIdBase >> 8) & 0xFF);
        response.push_back((resourceIdBase >> 16) & 0xFF);
        response.push_back((resourceIdBase >> 24) & 0xFF);
        response.push_back(resourceIdMask & 0xFF);
        response.push_back((resourceIdMask >> 8) & 0xFF);
        response.push_back((resourceIdMask >> 16) & 0xFF);
        response.push_back((resourceIdMask >> 24) & 0xFF);

        // Motion buffer size (4 bytes)
        uint32_t motionBufferSize = 256;
        response.push_back(motionBufferSize & 0xFF);
        response.push_back((motionBufferSize >> 8) & 0xFF);
        response.push_back((motionBufferSize >> 16) & 0xFF);
        response.push_back((motionBufferSize >> 24) & 0xFF);

        // Vendor length (2 bytes)
        response.push_back(vendorLength & 0xFF);
        response.push_back((vendorLength >> 8) & 0xFF);

        // Maximum request length (2 bytes) - in 4-byte units
        uint16_t maxRequestLength = 65535;
        response.push_back(maxRequestLength & 0xFF);
        response.push_back((maxRequestLength >> 8) & 0xFF);

        // Number of screens and formats (2 bytes)
        response.push_back(numScreens);
        response.push_back(numFormats);

        // Image byte order (1 byte) - 0 = LSBFirst
        response.push_back(0);

        // Bitmap format (3 bytes)
        response.push_back(0);  // bitmap-bit-order: 0 = LeastSignificant
        response.push_back(32); // bitmap-scanline-unit
        response.push_back(32); // bitmap-scanline-pad

        // Keycode range (2 bytes)
        response.push_back(8);   // min-keycode
        response.push_back(255); // max-keycode

        // Unused (4 bytes)
        response.push_back(0);
        response.push_back(0);
        response.push_back(0);
        response.push_back(0);

        // === Vendor string ===
        for (uint16_t i = 0; i < vendorLength; i++)
        {
            response.push_back(vendor[i]);
        }

        // Padding
        for (uint16_t i = 0; i < vendorPad; i++)
        {
            response.push_back(0);
        }

        // === Pixmap formats (8 bytes each) ===
        response.push_back(24); // depth
        response.push_back(32); // bits-per-pixel
        response.push_back(8);  // scanline-pad
        response.push_back(0);  // unused
        response.push_back(0);  // unused
        response.push_back(0);  // unused
        response.push_back(0);  // unused
        response.push_back(0);  // unused

        // === Screen info (40+ bytes) ===

        // Root window ID (4 bytes)
        uint32_t rootWindow = 0x00000001;
        response.push_back(rootWindow & 0xFF);
        response.push_back((rootWindow >> 8) & 0xFF);
        response.push_back((rootWindow >> 16) & 0xFF);
        response.push_back((rootWindow >> 24) & 0xFF);

        // Default colormap (4 bytes)
        uint32_t defaultColormap = 0x00000020;
        response.push_back(defaultColormap & 0xFF);
        response.push_back((defaultColormap >> 8) & 0xFF);
        response.push_back((defaultColormap >> 16) & 0xFF);
        response.push_back((defaultColormap >> 24) & 0xFF);

        // White and black pixels (8 bytes)
        uint32_t whitePixel = 0x00FFFFFF;
        uint32_t blackPixel = 0x00000000;
        response.push_back(whitePixel & 0xFF);
        response.push_back((whitePixel >> 8) & 0xFF);
        response.push_back((whitePixel >> 16) & 0xFF);
        response.push_back((whitePixel >> 24) & 0xFF);
        response.push_back(blackPixel & 0xFF);
        response.push_back((blackPixel >> 8) & 0xFF);
        response.push_back((blackPixel >> 16) & 0xFF);
        response.push_back((blackPixel >> 24) & 0xFF);

        // Current input masks (4 bytes)
        uint32_t currentInputMasks = 0;
        response.push_back(currentInputMasks & 0xFF);
        response.push_back((currentInputMasks >> 8) & 0xFF);
        response.push_back((currentInputMasks >> 16) & 0xFF);
        response.push_back((currentInputMasks >> 24) & 0xFF);

        // Width and height in pixels (4 bytes)
        uint16_t widthPixels = 1920;
        uint16_t heightPixels = 1080;
        response.push_back(widthPixels & 0xFF);
        response.push_back((widthPixels >> 8) & 0xFF);
        response.push_back(heightPixels & 0xFF);
        response.push_back((heightPixels >> 8) & 0xFF);

        // Width and height in millimeters (4 bytes)
        uint16_t widthMM = 508;
        uint16_t heightMM = 285;
        response.push_back(widthMM & 0xFF);
        response.push_back((widthMM >> 8) & 0xFF);
        response.push_back(heightMM & 0xFF);
        response.push_back((heightMM >> 8) & 0xFF);

        // Min and max installed maps (4 bytes)
        uint16_t minInstalledMaps = 1;
        uint16_t maxInstalledMaps = 1;
        response.push_back(minInstalledMaps & 0xFF);
        response.push_back((minInstalledMaps >> 8) & 0xFF);
        response.push_back(maxInstalledMaps & 0xFF);
        response.push_back((maxInstalledMaps >> 8) & 0xFF);

        // Root visual ID (4 bytes)
        uint32_t rootVisual = 0x00000021;
        response.push_back(rootVisual & 0xFF);
        response.push_back((rootVisual >> 8) & 0xFF);
        response.push_back((rootVisual >> 16) & 0xFF);
        response.push_back((rootVisual >> 24) & 0xFF);

        // Backing stores (1 byte)
        response.push_back(0); // 0 = Never

        // Save unders (1 byte)
        response.push_back(0); // False

        // Root depth (1 byte)
        response.push_back(24);

        // Number of depths (1 byte) - we'll add one depth
        response.push_back(numDepths);

        // === Depth info (8+ bytes each) ===
        response.push_back(24); // depth
        response.push_back(0);  // unused

        // Number of visuals for this depth (2 bytes)
        response.push_back(numVisuals & 0xFF);
        response.push_back((numVisuals >> 8) & 0xFF);

        // Unused (4 bytes)
        response.push_back(0);
        response.push_back(0);
        response.push_back(0);
        response.push_back(0);

        // === Visual info (24 bytes) ===
        // Visual ID (4 bytes)
        response.push_back(rootVisual & 0xFF);
        response.push_back((rootVisual >> 8) & 0xFF);
        response.push_back((rootVisual >> 16) & 0xFF);
        response.push_back((rootVisual >> 24) & 0xFF);

        // Class (1 byte) - 4 = TrueColor
        response.push_back(4);

        // Bits per RGB value (1 byte)
        response.push_back(8);

        // Colormap entries (2 bytes)
        uint16_t colormapEntries = 256;
        response.push_back(colormapEntries & 0xFF);
        response.push_back((colormapEntries >> 8) & 0xFF);

        // Red, green, blue masks (12 bytes)
        uint32_t redMask = 0x00FF0000;
        uint32_t greenMask = 0x0000FF00;
        uint32_t blueMask = 0x000000FF;
        response.push_back(redMask & 0xFF);
        response.push_back((redMask >> 8) & 0xFF);
        response.push_back((redMask >> 16) & 0xFF);
        response.push_back((redMask >> 24) & 0xFF);
        response.push_back(greenMask & 0xFF);
        response.push_back((greenMask >> 8) & 0xFF);
        response.push_back((greenMask >> 16) & 0xFF);
        response.push_back((greenMask >> 24) & 0xFF);
        response.push_back(blueMask & 0xFF);
        response.push_back((blueMask >> 8) & 0xFF);
        response.push_back((blueMask >> 16) & 0xFF);
        response.push_back((blueMask >> 24) & 0xFF);

        // Unused (4 bytes)
        response.push_back(0);
        response.push_back(0);
        response.push_back(0);
        response.push_back(0);

        std::cout << "Sending connection setup response (" << response.size() << " bytes)" << std::endl;

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

        // Clear previous response
        m_pendingResponse.clear();

        // opcode에 따라 처리
        switch (opcode)
        {
        case X11Opcode::CreateWindow:
            ProcessCreateWindow(data.data(), data.size());
            break;

        case X11Opcode::MapWindow:
            ProcessMapWindow(data.data(), data.size());
            break;

        case X11Opcode::CreateGC:
            ProcessCreateGC(data.data(), data.size());
            break;

        default:
            // Handle other opcodes by number
            if (header->opcode == 98) // QueryExtension
            {
                ProcessQueryExtension(data.data(), data.size());
            }
            else if (header->opcode == 16) // InternAtom
            {
                ProcessInternAtom(data.data(), data.size());
            }
            else if (header->opcode == 20) // GetProperty
            {
                ProcessGetProperty(data.data(), data.size());
            }
            else
            {
                std::cout << "Unhandled opcode: " << (int)header->opcode << std::endl;
            }
            break;
        }

        m_sequenceNumber++;
        return true;
    }

    std::vector<uint8_t> X11Protocol::GetPendingResponse()
    {
        std::vector<uint8_t> response = std::move(m_pendingResponse);
        m_pendingResponse.clear();
        return response;
    }

    void X11Protocol::SendEvent(const std::vector<uint8_t> &event)
    {
        (void)event;
        // Send event to client
        // Actual implementation requires network layer connection
    }

    bool X11Protocol::ProcessCreateWindow(const uint8_t *data, size_t length)
    {
        if (length < 32)
        {
            return false;
        }

        // Parse CreateWindow request
        // uint8_t depth = data[1]; // Unused for now
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

    void X11Protocol::ProcessQueryExtension(const uint8_t *data, size_t length)
    {
        if (length < 8)
        {
            return;
        }

        uint16_t nameLength = *(uint16_t *)&data[4];
        std::string extensionName;
        if (length >= 8 + nameLength)
        {
            extensionName = std::string((const char *)&data[8], nameLength);
        }

        std::cout << "QueryExtension: " << extensionName << std::endl;

        // Generate reply: extension not present
        m_pendingResponse.resize(32);
        m_pendingResponse[0] = 1; // Reply
        m_pendingResponse[1] = 0; // unused

        // Sequence number
        m_pendingResponse[2] = m_sequenceNumber & 0xFF;
        m_pendingResponse[3] = (m_sequenceNumber >> 8) & 0xFF;

        // Length (0 for this reply)
        m_pendingResponse[4] = 0;
        m_pendingResponse[5] = 0;
        m_pendingResponse[6] = 0;
        m_pendingResponse[7] = 0;

        // Present flag (byte 8) - 0 = extension not present
        m_pendingResponse[8] = 0;

        // major-opcode (byte 9) - unused if not present
        m_pendingResponse[9] = 0;

        // first-event (byte 10) - unused if not present
        m_pendingResponse[10] = 0;

        // first-error (byte 11) - unused if not present
        m_pendingResponse[11] = 0;

        // Rest (bytes 12-31) is padding (already zeroed by resize)
        std::cout << "  -> Sending QueryExtension reply (32 bytes)" << std::endl;
    }

    void X11Protocol::ProcessInternAtom(const uint8_t *data, size_t length)
    {
        if (length < 8)
        {
            return;
        }

        uint8_t onlyIfExists = data[1];
        uint16_t nameLength = *(uint16_t *)&data[4];
        std::string atomName;
        if (length >= 8 + nameLength)
        {
            atomName = std::string((const char *)&data[8], nameLength);
        }

        std::cout << "InternAtom: " << atomName << " (only_if_exists=" << (int)onlyIfExists << ")" << std::endl;

        // Generate reply: return a dummy atom ID
        static uint32_t nextAtom = 1000;
        uint32_t atom = nextAtom++;

        m_pendingResponse.resize(32);
        m_pendingResponse[0] = 1; // Reply
        m_pendingResponse[1] = 0; // unused

        // Sequence number
        m_pendingResponse[2] = m_sequenceNumber & 0xFF;
        m_pendingResponse[3] = (m_sequenceNumber >> 8) & 0xFF;

        // Length (0 for this reply)
        m_pendingResponse[4] = 0;
        m_pendingResponse[5] = 0;
        m_pendingResponse[6] = 0;
        m_pendingResponse[7] = 0;

        // Atom ID (4 bytes at offset 8)
        m_pendingResponse[8] = atom & 0xFF;
        m_pendingResponse[9] = (atom >> 8) & 0xFF;
        m_pendingResponse[10] = (atom >> 16) & 0xFF;
        m_pendingResponse[11] = (atom >> 24) & 0xFF;
    }

    void X11Protocol::ProcessGetProperty(const uint8_t *data, size_t length)
    {
        if (length < 24)
        {
            return;
        }

        uint8_t deleteFlag = data[1];
        Window window = *(Window *)&data[4];
        uint32_t property = *(uint32_t *)&data[8];
        uint32_t type = *(uint32_t *)&data[12];

        (void)deleteFlag;
        (void)window;
        (void)property;
        (void)type;

        std::cout << "GetProperty: window=" << window << ", property=" << property << std::endl;

        // Generate reply: no property found
        m_pendingResponse.resize(32);
        m_pendingResponse[0] = 1; // Reply
        m_pendingResponse[1] = 0; // format (0 = no property)

        // Sequence number
        m_pendingResponse[2] = m_sequenceNumber & 0xFF;
        m_pendingResponse[3] = (m_sequenceNumber >> 8) & 0xFF;

        // Length (0 - no data)
        m_pendingResponse[4] = 0;
        m_pendingResponse[5] = 0;
        m_pendingResponse[6] = 0;
        m_pendingResponse[7] = 0;

        // Type (NONE = 0)
        m_pendingResponse[8] = 0;
        m_pendingResponse[9] = 0;
        m_pendingResponse[10] = 0;
        m_pendingResponse[11] = 0;

        // bytes-after (0)
        m_pendingResponse[12] = 0;
        m_pendingResponse[13] = 0;
        m_pendingResponse[14] = 0;
        m_pendingResponse[15] = 0;

        // value-length (0)
        m_pendingResponse[16] = 0;
        m_pendingResponse[17] = 0;
        m_pendingResponse[18] = 0;
        m_pendingResponse[19] = 0;
    }

} // namespace XMan
