// Windows icon / cursor, little-endian.
struct IconDirEntry {
    u8 width [[comment("0 = 256")]];
    u8 height;
    u8 colorCount;
    u8 reserved;
    u16 planes;
    u16 bitCount;
    u32 bytesInRes;
    u32 imageOffset;
} [[color("#3b82f6")]];

u16 reserved;
u16 type [[comment("1 icon, 2 cursor")]];
u16 count;
IconDirEntry entries[count];
for (let i = 0; i < count; i++) {
    if (entries[i].imageOffset + entries[i].bytesInRes <= size())
        u8 image[entries[i].bytesInRes] @ entries[i].imageOffset [[color("#30a46c")]];
}
