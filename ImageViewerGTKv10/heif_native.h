#ifndef HEIF_NATIVE_H
#define HEIF_NATIVE_H

#include <stdbool.h>

bool heif_native_is_available(void);

/* libheif 디코드 + PQ/HLG → sRGB 8-bit JPEG (외부 ffmpeg/heif-convert 미사용) */
bool heif_native_heif_to_jpeg(const char *heif_path, const char *jpg_path);

#endif
