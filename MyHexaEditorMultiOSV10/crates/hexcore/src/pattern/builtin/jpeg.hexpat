// JPEG / JFIF: markers FF xx; most segments carry a big-endian length.
#pragma endian big

enum Marker : u8 {
    TEM = 0x01, SOF0 = 0xC0, SOF1, SOF2, SOF3, DHT = 0xC4, SOF5, SOF6, SOF7, JPG, SOF9, SOF10, SOF11, DAC, SOF13, SOF14, SOF15,
    RST0 = 0xD0, RST1, RST2, RST3, RST4, RST5, RST6, RST7, SOI = 0xD8, EOI = 0xD9, SOS = 0xDA, DQT = 0xDB, DNL, DRI, DHP, EXP,
    APP0 = 0xE0, APP1, APP2, APP3, APP4, APP5, APP6, APP7, APP8, APP9, APP10, APP11, APP12, APP13, APP14, APP15, COM = 0xFE
};

struct Segment {
    u8 prefix [[color("#e5484d")]];
    Marker type [[color("#e5484d")]];
    if (type == 0xD8 || type == 0xD9 || type == 0x01 || (type >= 0xD0 && type <= 0xD7)) {
    } else {
        u16 length [[color("#8b5cf6")]];
        if (type == 0xE0 && length >= 16 && ReadString($, 4) == "JFIF") {
            char identifier[5];
            u8 versionMajor; u8 versionMinor; u8 densityUnits; u16 xDensity; u16 yDensity; u8 thumbnailWidth; u8 thumbnailHeight;
            if (length > 16) u8 thumbnail[length - 16];
        } else if (type >= 0xC0 && type <= 0xC3 && length >= 8) {
            u8 precision; u16 height; u16 width; u8 components;
            u8 componentData[length - 8];
        } else if (type == 0xFE) {
            char comment[length - 2];
        } else if (length > 2) {
            u8 data[length - 2] [[color("#3b82f6")]];
        }
    }
};

while (!eof()) {
    if (ReadU8($) != 0xFF) { u8 trailing[size() - $]; break; }
    Segment segment [[name(segment.type)]];
    if (segment.type == 0xD9) break;
    if (segment.type == 0xDA) {
        let e = find($, "FF D9");
        if (e < 0) e = size();
        u8 scanData[e - $] [[color("#30a46c"), comment("entropy-coded image data")]];
    }
}
