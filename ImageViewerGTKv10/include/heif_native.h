#ifndef HEIF_NATIVE_H
#define HEIF_NATIVE_H

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <glib.h>
#include <stdbool.h>

/*
 * HEIF/HEIC/HIF → GdkPixbuf (순수 C, libheif C API).
 * https://github.com/strukturag/libheif 공식 디코드 흐름 + convert_hdr_to_8bit.
 * 빌드: libheif-dev (pkg-config libheif). 런타임: libheif1.
 */
bool heif_native_is_available(void);

/* libheif 디코드 + 색공간 변환 후 GdkPixbuf 반환 (호출자가 g_object_unref). */
GdkPixbuf *heif_native_load_pixbuf(const char *heif_path, GError **err);

#endif
