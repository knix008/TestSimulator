// PNG: an 8-byte signature, then chunks (length, type, data, CRC-32), all big-endian.
#pragma endian big

struct Chunk {
    u32 length [[color("#8b5cf6")]];
    char type[4] [[color("#f97316")]];
    if (type == "IHDR") {
        u32 width;
        u32 height;
        u8 bitDepth;
        u8 colorType [[comment("0 grey, 2 RGB, 3 palette, 4 grey+alpha, 6 RGBA")]];
        u8 compression;
        u8 filter;
        u8 interlace;
    } else if (type == "tEXt" || type == "iTXt") {
        char text[length];
    } else if (type == "gAMA") {
        u32 gamma;
    } else if (type == "pHYs") {
        u32 pixelsPerUnitX;
        u32 pixelsPerUnitY;
        u8 unit;
    } else if (type == "tIME") {
        u16 year; u8 month; u8 day; u8 hour; u8 minute; u8 second;
    } else {
        u8 data[length] [[color("#30a46c")]];
    }
    seek(addressof(type) + 4 + length);
    u32 crc [[color("#888888"), comment("CRC-32 of type and data")]];
} [[color("#3b82f6")]];

u8 signature[8] [[color("#e5484d"), comment("89 50 4E 47 0D 0A 1A 0A")]];
Chunk chunks[while(!eof())];
