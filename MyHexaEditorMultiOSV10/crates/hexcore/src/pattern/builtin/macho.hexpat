// Mach-O (macOS, iOS): header and load commands. Byte order follows the magic number.
enum LoadCommandType : u32 {
    SEGMENT = 0x1, SYMTAB = 0x2, THREAD = 0x4, UNIXTHREAD = 0x5, DYSYMTAB = 0xB, LOAD_DYLIB = 0xC, ID_DYLIB = 0xD, LOAD_DYLINKER = 0xE,
    SEGMENT_64 = 0x19, UUID = 0x1B, CODE_SIGNATURE = 0x1D, FUNCTION_STARTS = 0x26, DATA_IN_CODE = 0x29, SOURCE_VERSION = 0x2A,
    BUILD_VERSION = 0x32, DYLD_INFO_ONLY = 0x80000022, MAIN = 0x80000028, LOAD_WEAK_DYLIB = 0x80000018, RPATH = 0x8000001C
};

struct Section64 {
    char sectname[16] [[color("#f97316")]];
    char segname[16];
    u64 addr; u64 size; u32 offset; u32 align; u32 reloff; u32 nreloc; u32 flags; u32 reserved1; u32 reserved2; u32 reserved3;
};

struct LoadCommand {
    LoadCommandType cmd [[color("#f97316")]];
    u32 cmdsize;
    if (cmd == 0x19) {
        char segname[16];
        u64 vmaddr; u64 vmsize; u64 fileoff; u64 filesize; u32 maxprot; u32 initprot; u32 nsects; u32 flags;
        Section64 sections[nsects];
    } else if (cmd == 0x1) {
        char segname[16];
        u32 vmaddr; u32 vmsize; u32 fileoff; u32 filesize; u32 maxprot; u32 initprot; u32 nsects; u32 flags;
    }
    let used = $ - addressof(cmd);
    if (cmdsize > used) u8 data[cmdsize - used];
} [[color("#8b5cf6")]];

let m = ReadU32(0);
if (m == 0xCEFAEDFE || m == 0xCFFAEDFE) endian big;
u32 magic [[color("#e5484d"), comment("FEEDFACE 32-bit, FEEDFACF 64-bit")]];
u32 cputype [[comment("7 x86, 0x1000007 x86_64, 12 ARM, 0x100000C ARM64")]];
u32 cpusubtype;
u32 filetype [[comment("1 object, 2 executable, 6 dylib, 8 bundle")]];
u32 ncmds;
u32 sizeofcmds;
u32 flags;
if (magic == 0xFEEDFACF) u32 reserved;
LoadCommand commands[ncmds];
