// MP3: ID3v2 tag (big-endian, "syncsafe" sizes), MPEG audio, ID3v1 tag at the end.
#pragma endian big

struct Id3v2Frame {
    char id[4] [[color("#f97316")]];
    let n = 0;
    if (tagVersion == 4) { u8 sizeBytes[4]; n = (sizeBytes[0] << 21) | (sizeBytes[1] << 14) | (sizeBytes[2] << 7) | sizeBytes[3]; }
    else { u32 frameSize; n = frameSize; }
    u16 flags;
    if (ReadU8(addressof(id)) == 'T' && n > 0) { u8 encoding [[comment("0 Latin-1, 1 UTF-16, 3 UTF-8")]]; char text[n - 1]; }
    else u8 data[n];
} [[color("#3b82f6")]];

struct Id3v1 {
    char tag[3] [[color("#e5484d")]];
    char title[30]; char artist[30]; char album[30]; char year[4]; char comment[30]; u8 genre;
} [[color("#8b5cf6")]];

let audioEnd = size();
if (size() >= 128 && ReadString(size() - 128, 3) == "TAG") audioEnd = size() - 128;
if (size() >= 10 && ReadString(0, 3) == "ID3") {
    char id3[3] [[color("#e5484d")]];
    u8 tagVersion;
    u8 tagRevision;
    u8 tagFlags;
    u8 tagSizeBytes[4] [[comment("syncsafe: 7 bits per byte")]];
    let tagEnd = 10 + ((tagSizeBytes[0] << 21) | (tagSizeBytes[1] << 14) | (tagSizeBytes[2] << 7) | tagSizeBytes[3]);
    while ($ + 10 <= tagEnd && ReadU8($) != 0) Id3v2Frame frame [[name(frame.id)]];
    if ($ < tagEnd && tagEnd <= audioEnd) u8 padding[tagEnd - $];
}
if ($ < audioEnd) u8 audioData[audioEnd - $] [[color("#30a46c")]];
if (audioEnd < size()) Id3v1 id3v1 @ audioEnd;
