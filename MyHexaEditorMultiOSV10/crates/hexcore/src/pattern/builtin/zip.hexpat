// ZIP archive (also JAR, DOCX/XLSX/PPTX, APK, ODF), little-endian.
struct LocalFileHeader {
    u32 signature [[color("#e5484d")]];
    u16 versionNeeded;
    u16 flags;
    u16 compression [[comment("0 stored, 8 deflate")]];
    u16 modTime;
    u16 modDate;
    u32 crc32;
    u32 compressedSize;
    u32 uncompressedSize;
    u16 fileNameLength;
    u16 extraLength;
    char fileName[fileNameLength] [[color("#f97316")]];
    u8 extra[extraLength];
    u8 data[compressedSize] [[color("#30a46c")]];
} [[color("#3b82f6")]];

struct DataDescriptor { u32 signature; u32 crc32; u32 compressedSize; u32 uncompressedSize; };

struct CentralDirectoryEntry {
    u32 signature [[color("#e5484d")]];
    u16 versionMadeBy;
    u16 versionNeeded;
    u16 flags;
    u16 compression;
    u16 modTime;
    u16 modDate;
    u32 crc32;
    u32 compressedSize;
    u32 uncompressedSize;
    u16 fileNameLength;
    u16 extraLength;
    u16 commentLength;
    u16 diskNumberStart;
    u16 internalAttributes;
    u32 externalAttributes;
    u32 localHeaderOffset;
    char fileName[fileNameLength] [[color("#f97316")]];
    u8 extra[extraLength];
    char comment[commentLength];
} [[color("#8b5cf6")]];

struct EndOfCentralDirectory {
    u32 signature [[color("#e5484d")]];
    u16 diskNumber;
    u16 centralDirectoryDisk;
    u16 entriesOnDisk;
    u16 totalEntries;
    u32 centralDirectorySize;
    u32 centralDirectoryOffset;
    u16 commentLength;
    char comment[commentLength];
} [[color("#eab308")]];

while (!eof()) {
    if (size() - $ < 4) { u8 tail[size() - $]; break; }
    let s = ReadU32($);
    if (s == 0x04034B50) LocalFileHeader file [[name(file.fileName)]];
    else if (s == 0x08074B50) DataDescriptor descriptor;
    else if (s == 0x02014B50) CentralDirectoryEntry centralDirectory [[name(centralDirectory.fileName)]];
    else if (s == 0x06054B50) { EndOfCentralDirectory endOfCentralDirectory; break; }
    else { u8 unknown[size() - $]; break; }
}
