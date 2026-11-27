// SQLite 3 database: the 100-byte header and the first page's B-tree header, big-endian.
#pragma endian big

struct DatabaseHeader {
    char magic[16] [[color("#e5484d")]];
    u16 pageSize [[comment("1 means 65536")]];
    u8 writeVersion; u8 readVersion; u8 reservedSpace;
    u8 maxPayloadFraction; u8 minPayloadFraction; u8 leafPayloadFraction;
    u32 fileChangeCounter;
    u32 databaseSizeInPages;
    u32 firstFreelistTrunkPage; u32 freelistPageCount;
    u32 schemaCookie; u32 schemaFormat; u32 defaultPageCacheSize; u32 largestRootPage;
    u32 textEncoding [[comment("1 UTF-8, 2 UTF-16le, 3 UTF-16be")]];
    u32 userVersion; u32 incrementalVacuum; u32 applicationId;
    u8 reserved[20];
    u32 versionValidFor;
    u32 sqliteVersion;
} [[color("#3b82f6")]];

struct BTreePageHeader {
    u8 pageType [[comment("2 interior index, 5 interior table, 10 leaf index, 13 leaf table")]];
    u16 firstFreeblock;
    u16 cellCount;
    u16 cellContentStart;
    u8 fragmentedFreeBytes;
    if (pageType == 2 || pageType == 5) u32 rightMostPointer;
    u16 cellPointers[cellCount];
} [[color("#30a46c")]];

DatabaseHeader header;
if (size() > 108) BTreePageHeader firstPage;
