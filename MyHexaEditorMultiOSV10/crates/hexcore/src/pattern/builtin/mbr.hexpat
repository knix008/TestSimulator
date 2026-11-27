// Master boot record (sector 0 of a disk), with the GPT header when the disk is GPT.
enum PartitionType : u8 {
    EMPTY = 0x00, FAT12 = 0x01, FAT16_SMALL = 0x04, EXTENDED = 0x05, FAT16 = 0x06, NTFS_EXFAT = 0x07, FAT32_CHS = 0x0B,
    FAT32_LBA = 0x0C, FAT16_LBA = 0x0E, EXTENDED_LBA = 0x0F, HIDDEN_NTFS = 0x17, WINDOWS_RECOVERY = 0x27, LINUX_SWAP = 0x82,
    LINUX = 0x83, LINUX_EXTENDED = 0x85, LINUX_LVM = 0x8E, FREEBSD = 0xA5, OPENBSD = 0xA6, APPLE_HFS = 0xAF, GPT_PROTECTIVE = 0xEE,
    EFI_SYSTEM = 0xEF, LINUX_RAID = 0xFD
};

struct PartitionEntry {
    u8 status [[comment("0x80 = bootable")]];
    u8 chsFirst[3];
    PartitionType type [[color("#f97316")]];
    u8 chsLast[3];
    u32 firstLba;
    u32 sectorCount;
} [[color("#3b82f6")]];

struct GptHeader {
    char signature[8] [[color("#e5484d")]];
    u32 revision; u32 headerSize; u32 headerCrc32; u32 reserved;
    u64 currentLba; u64 backupLba; u64 firstUsableLba; u64 lastUsableLba;
    u8 diskGuid[16];
    u64 partitionEntriesLba; u32 numberOfPartitionEntries; u32 sizeOfPartitionEntry; u32 partitionEntriesCrc32;
} [[color("#8b5cf6")]];

u8 bootCode[446] [[color("#888888")]];
PartitionEntry partitions[4];
u16 bootSignature [[color("#e5484d"), comment("55 AA")]];
if (partitions[0].type == 0xEE && size() >= 1024 && ReadString(512, 8) == "EFI PART") GptHeader gptHeader @ 512;
