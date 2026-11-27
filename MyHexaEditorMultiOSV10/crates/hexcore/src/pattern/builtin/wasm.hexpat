// WebAssembly binary module: magic, version, then sections (id, LEB128 size, contents).
enum SectionId : u8 { custom = 0, type, import, function, table, memory, global, export, start, element, code, data, dataCount, tag };

struct Section {
    SectionId id [[color("#f97316")]];
    uleb128 size;
    if (id == 0) {
        let start = $;
        uleb128 nameLength;
        char name[nameLength];
        u8 content[size - ($ - start)];
    } else {
        u8 content[size] [[color("#30a46c")]];
    }
} [[color("#3b82f6")]];

char magic[4] [[color("#e5484d"), comment("00 61 73 6D")]];
u32 version;
Section sections[while(!eof())];
