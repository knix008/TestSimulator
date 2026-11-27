// Windows PE (EXE, DLL): DOS header, PE signature, COFF header, optional header, section table, little-endian.
enum MachineType : u16 {
    UNKNOWN = 0, I386 = 0x14C, R4000 = 0x166, ARM = 0x1C0, THUMB = 0x1C2, ARMNT = 0x1C4, IA64 = 0x200, EBC = 0xEBC,
    AMD64 = 0x8664, ARM64 = 0xAA64, RISCV64 = 0x5064
};
enum Subsystem : u16 { UNKNOWN = 0, NATIVE = 1, WINDOWS_GUI = 2, WINDOWS_CUI = 3, POSIX_CUI = 7, EFI_APPLICATION = 10, EFI_BOOT_SERVICE_DRIVER = 11, EFI_RUNTIME_DRIVER = 12 };

struct DOSHeader {
    char e_magic[2] [[color("#e5484d")]];
    u16 e_cblp; u16 e_cp; u16 e_crlc; u16 e_cparhdr; u16 e_minalloc; u16 e_maxalloc; u16 e_ss; u16 e_sp; u16 e_csum;
    u16 e_ip; u16 e_cs; u16 e_lfarlc; u16 e_ovno; u16 e_res[4]; u16 e_oemid; u16 e_oeminfo; u16 e_res2[10];
    u32 e_lfanew [[color("#f97316"), comment("offset of the PE header")]];
} [[color("#3b82f6")]];

struct COFFHeader {
    MachineType machine;
    u16 numberOfSections;
    u32 timeDateStamp;
    u32 pointerToSymbolTable;
    u32 numberOfSymbols;
    u16 sizeOfOptionalHeader;
    u16 characteristics;
} [[color("#8b5cf6")]];

struct DataDirectory { u32 virtualAddress; u32 size; };

struct OptionalHeader {
    u16 magic [[comment("0x10B PE32, 0x20B PE32+")]];
    u8 majorLinkerVersion; u8 minorLinkerVersion;
    u32 sizeOfCode; u32 sizeOfInitializedData; u32 sizeOfUninitializedData;
    u32 addressOfEntryPoint [[color("#e5484d")]];
    u32 baseOfCode;
    if (magic == 0x10B) { u32 baseOfData; u32 imageBase; } else { u64 imageBase; }
    u32 sectionAlignment; u32 fileAlignment;
    u16 majorOperatingSystemVersion; u16 minorOperatingSystemVersion; u16 majorImageVersion; u16 minorImageVersion;
    u16 majorSubsystemVersion; u16 minorSubsystemVersion;
    u32 win32VersionValue; u32 sizeOfImage; u32 sizeOfHeaders; u32 checkSum;
    Subsystem subsystem;
    u16 dllCharacteristics;
    if (magic == 0x10B) { u32 sizeOfStackReserve; u32 sizeOfStackCommit; u32 sizeOfHeapReserve; u32 sizeOfHeapCommit; }
    else { u64 sizeOfStackReserve; u64 sizeOfStackCommit; u64 sizeOfHeapReserve; u64 sizeOfHeapCommit; }
    u32 loaderFlags;
    u32 numberOfRvaAndSizes;
    DataDirectory dataDirectories[numberOfRvaAndSizes < 16 ? numberOfRvaAndSizes : 16];
} [[color("#30a46c")]];

struct SectionHeader {
    char name[8] [[color("#f97316")]];
    u32 virtualSize; u32 virtualAddress; u32 sizeOfRawData; u32 pointerToRawData;
    u32 pointerToRelocations; u32 pointerToLinenumbers; u16 numberOfRelocations; u16 numberOfLinenumbers;
    u32 characteristics;
} [[color("#eab308")]];

DOSHeader dosHeader;
if (dosHeader.e_lfanew > $ && dosHeader.e_lfanew < size()) u8 dosStub[dosHeader.e_lfanew - $];
seek(dosHeader.e_lfanew);
char signature[4] [[color("#e5484d"), comment("PE 00 00")]];
COFFHeader coffHeader;
let optionalStart = $;
if (coffHeader.sizeOfOptionalHeader > 0) OptionalHeader optionalHeader;
seek(optionalStart + coffHeader.sizeOfOptionalHeader);
SectionHeader sectionHeaders[coffHeader.numberOfSections];
for (let i = 0; i < coffHeader.numberOfSections; i++) {
    let s = sectionHeaders[i];
    if (s.sizeOfRawData > 0 && s.pointerToRawData + s.sizeOfRawData <= size())
        u8 sectionData[s.sizeOfRawData] @ s.pointerToRawData [[name(s.name), color("#06b6d4")]];
}
