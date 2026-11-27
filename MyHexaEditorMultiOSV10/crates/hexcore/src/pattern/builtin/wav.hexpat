// WAVE (RIFF), little-endian.
struct Chunk {
    char id[4] [[color("#f97316")]];
    u32 size;
    if (id == "fmt ") {
        u16 audioFormat [[comment("1 PCM, 3 float, 0xFFFE extensible")]];
        u16 channels;
        u32 sampleRate;
        u32 byteRate;
        u16 blockAlign;
        u16 bitsPerSample;
        if (size > 16) u8 extra[size - 16];
    } else if (id == "data") {
        u8 samples[size] [[color("#30a46c")]];
    } else {
        u8 data[size];
    }
    if (size & 1) u8 padding;
} [[color("#3b82f6")]];

char riff[4] [[color("#e5484d")]];
u32 riffSize;
char wave[4] [[color("#e5484d")]];
Chunk chunks[while(size() - $ >= 8)];
