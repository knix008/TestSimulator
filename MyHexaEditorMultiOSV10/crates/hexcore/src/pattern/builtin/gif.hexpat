// GIF87a / GIF89a, little-endian.
struct LogicalScreen {
    u16 width;
    u16 height;
    u8 flags [[comment("bit 7: global colour table, bits 0-2: its size")]];
    u8 backgroundColorIndex;
    u8 aspectRatio;
} [[color("#3b82f6")]];

struct SubBlock { u8 size; if (size > 0) u8 data[size]; };

struct Extension {
    u8 introducer;
    u8 label [[comment("F9 graphic control, FE comment, FF application, 01 text")]];
    SubBlock blocks[while(ReadU8($) != 0)];
    u8 terminator;
} [[color("#8b5cf6")]];

struct ImageDescriptor {
    u8 separator;
    u16 left;
    u16 top;
    u16 width;
    u16 height;
    u8 flags;
    if (flags & 0x80) u8 localColorTable[3 * (1 << ((flags & 7) + 1))];
    u8 lzwMinimumCodeSize;
    SubBlock blocks[while(ReadU8($) != 0)];
    u8 terminator;
} [[color("#30a46c")]];

char signature[3] [[color("#e5484d")]];
char version[3] [[color("#e5484d")]];
LogicalScreen screen;
if (screen.flags & 0x80) u8 globalColorTable[3 * (1 << ((screen.flags & 7) + 1))] [[color("#eab308")]];
while (!eof()) {
    let b = ReadU8($);
    if (b == 0x21) Extension extension;
    else if (b == 0x2C) ImageDescriptor image;
    else if (b == 0x3B) { u8 trailer [[color("#e5484d")]]; break; }
    else { u8 unknown[size() - $]; break; }
}
