// TAR (POSIX ustar): 512-byte headers with octal text numbers, contents padded to 512 bytes.
struct Header {
    char name[100] [[color("#f97316")]];
    char mode[8]; char uid[8]; char gid[8];
    char size[12] [[comment("octal")]];
    char mtime[12];
    char checksum[8];
    char typeflag [[comment("0 file, 5 directory, 2 symlink")]];
    char linkname[100];
    char magic[6] [[color("#e5484d")]];
    char version[2];
    char uname[32]; char gname[32]; char devmajor[8]; char devminor[8];
    char prefix[155];
    u8 padding[12];
} [[color("#3b82f6")]];

struct Entry {
    Header header;
    let n = ParseInt(header.size, 8);
    if (n > 0) u8 data[n] [[color("#30a46c")]];
    if (n % 512 != 0) u8 padding[512 - n % 512];
};

Entry entries[while(size() - $ >= 512 && ReadU8($) != 0)];
if (size() - $ > 0) u8 endOfArchive[size() - $] [[color("#888888")]];
