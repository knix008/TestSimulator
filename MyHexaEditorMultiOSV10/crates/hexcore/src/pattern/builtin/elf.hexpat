// ELF: e_ident decides 32/64-bit and the byte order of everything after it.
enum ElfType : u16 { NONE = 0, REL = 1, EXEC = 2, DYN = 3, CORE = 4 };
enum Machine : u16 {
    NONE = 0, SPARC = 2, X86 = 3, M68K = 4, MIPS = 8, PPC = 20, PPC64 = 21, S390 = 22, ARM = 40, SUPERH = 42, IA64 = 50,
    X86_64 = 62, AVR = 83, AARCH64 = 183, RISCV = 243, LOONGARCH = 258
};

struct Ident {
    u8 magic[4] [[color("#e5484d"), comment("7F 45 4C 46")]];
    u8 class [[comment("1 = 32-bit, 2 = 64-bit")]];
    u8 data [[comment("1 = little-endian, 2 = big-endian")]];
    u8 version;
    u8 osAbi;
    u8 abiVersion;
    u8 padding[7];
};

struct ProgramHeader {
    u32 p_type;
    if (e_ident.class == 2) {
        u32 p_flags; u64 p_offset; u64 p_vaddr; u64 p_paddr; u64 p_filesz; u64 p_memsz; u64 p_align;
    } else {
        u32 p_offset; u32 p_vaddr; u32 p_paddr; u32 p_filesz; u32 p_memsz; u32 p_flags; u32 p_align;
    }
} [[color("#8b5cf6")]];

struct SectionHeader {
    u32 sh_name;
    u32 sh_type;
    if (e_ident.class == 2) {
        u64 sh_flags; u64 sh_addr; u64 sh_offset; u64 sh_size; u32 sh_link; u32 sh_info; u64 sh_addralign; u64 sh_entsize;
    } else {
        u32 sh_flags; u32 sh_addr; u32 sh_offset; u32 sh_size; u32 sh_link; u32 sh_info; u32 sh_addralign; u32 sh_entsize;
    }
} [[color("#30a46c")]];

Ident e_ident;
if (e_ident.data == 2) endian big;
ElfType e_type [[color("#3b82f6")]];
Machine e_machine [[color("#3b82f6")]];
u32 e_version;
if (e_ident.class == 2) { u64 e_entry; u64 e_phoff; u64 e_shoff; } else { u32 e_entry; u32 e_phoff; u32 e_shoff; }
u32 e_flags;
u16 e_ehsize;
u16 e_phentsize;
u16 e_phnum;
u16 e_shentsize;
u16 e_shnum;
u16 e_shstrndx;
if (e_phnum > 0 && e_phoff > 0 && e_phoff < size()) ProgramHeader programHeaders[e_phnum] @ e_phoff;
if (e_shnum > 0 && e_shoff > 0 && e_shoff < size()) SectionHeader sectionHeaders[e_shnum] @ e_shoff;
