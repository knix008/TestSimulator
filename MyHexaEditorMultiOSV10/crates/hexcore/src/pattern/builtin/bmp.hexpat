// BMP (Windows bitmap), little-endian.
struct BITMAPFILEHEADER {
    char bfType[2];
    u32 bfSize;
    u16 bfReserved1;
    u16 bfReserved2;
    u32 bfOffBits [[comment("where the pixels start")]];
} [[color("#e5484d")]];

struct BITMAPINFOHEADER {
    u32 biSize;
    s32 biWidth;
    s32 biHeight [[comment("negative: top-down")]];
    u16 biPlanes;
    u16 biBitCount;
    u32 biCompression [[comment("0 BI_RGB, 1 RLE8, 2 RLE4, 3 BITFIELDS")]];
    u32 biSizeImage;
    s32 biXPelsPerMeter;
    s32 biYPelsPerMeter;
    u32 biClrUsed;
    u32 biClrImportant;
} [[color("#3b82f6")]];

struct RGBQUAD { u8 blue; u8 green; u8 red; u8 reserved; };

BITMAPFILEHEADER fileHeader;
BITMAPINFOHEADER infoHeader;
if (infoHeader.biSize > 40) u8 extraHeader[infoHeader.biSize - 40];
let colors = infoHeader.biClrUsed;
if (colors == 0 && infoHeader.biBitCount <= 8) colors = 1 << infoHeader.biBitCount;
if (colors > 0 && $ + colors * 4 <= fileHeader.bfOffBits) RGBQUAD palette[colors] [[color("#eab308")]];
if (fileHeader.bfOffBits < size()) {
    seek(fileHeader.bfOffBits);
    u8 pixels[size() - fileHeader.bfOffBits] [[color("#30a46c")]];
}
