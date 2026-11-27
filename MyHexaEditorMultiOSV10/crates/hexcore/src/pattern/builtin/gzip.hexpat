// GZIP (RFC 1952), little-endian.
u8 id1 [[color("#e5484d")]];
u8 id2 [[color("#e5484d")]];
u8 compression [[comment("8 = deflate")]];
u8 flags [[comment("1 text, 2 header CRC, 4 extra, 8 name, 16 comment")]];
u32 modificationTime;
u8 extraFlags;
u8 os;
if (flags & 4) { u16 extraLength; u8 extra[extraLength]; }
if (flags & 8) char fileName[] [[color("#f97316")]];
if (flags & 16) char comment[];
if (flags & 2) u16 headerCrc16;
if (size() - $ >= 8) {
    u8 compressedData[size() - $ - 8] [[color("#30a46c")]];
    u32 crc32 [[color("#888888")]];
    u32 uncompressedSize;
}
