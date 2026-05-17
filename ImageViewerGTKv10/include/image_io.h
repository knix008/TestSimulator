#ifndef IMAGE_IO_H
#define IMAGE_IO_H

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <stdbool.h>

bool utils_is_heif_path(const char *path);

/* HEIF/HIF → JPG (C 변환기: heif_native.c + gdk-pixbuf JPEG 저장).
 * 이미 .jpg 있으면 그 경로만 반환. preview_commit_heif_file 에서만 호출. */
char *image_io_heif_jpg_path(const char *path);

/* JPG가 이미 있으면 경로 반환, 없으면 NULL (변환하지 않음). */
char *image_io_heif_existing_jpg_path(const char *path);

/* 원본 HEIF 파일을 같은 폴더의 hif/ 하위로 이동. 성공 시 true. */
bool image_io_move_heif_to_subdir(const char *path);

/* pixbuf 로드. HEIF/HIF 는 C 변환기(heif_native)로 메모리 디코드. */
GdkPixbuf *image_io_load_pixbuf(const char *path, GError **err);

/* JPEG quality 100, ICC 프로필 보존 (회전/대칭 후). */
bool image_io_save_jpeg(GdkPixbuf *pixbuf, const char *path, GError **err);

typedef enum {
    IMAGE_TRANSFORM_ROTATE_CCW = 0,
    IMAGE_TRANSFORM_ROTATE_CW,
    IMAGE_TRANSFORM_FLIP_HORIZONTAL
} ImageTransform;

/* 편집 대상 파일에 변환 적용 후 저장하고 새 pixbuf 반환. 실패 시 NULL. */
GdkPixbuf *image_io_apply_transform_file(const char *edit_path,
                                         ImageTransform op,
                                         GError **err);

/* ── 포맷 변환 ─────────────────────────────────────────────────── */

typedef enum {
    IMAGE_FORMAT_JPEG = 0,
    IMAGE_FORMAT_PNG,
    IMAGE_FORMAT_WEBP,
    IMAGE_FORMAT_BMP,
    IMAGE_FORMAT_TIFF,
    IMAGE_FORMAT_COUNT
} ImageFormat;

typedef struct {
    const char *label;       /* UI 표시 문자열 */
    const char *ext;         /* 파일 확장자 (예: ".jpg") */
    const char *pixbuf_type; /* gdk_pixbuf_save() type 인자 */
    gboolean    has_quality; /* TRUE: JPEG/WebP — 품질 슬라이더 */
} ImageFormatInfo;

/* IMAGE_FORMAT_COUNT 크기의 정적 배열 반환. */
const ImageFormatInfo *image_io_format_info_all(void);

/* gdk-pixbuf 빌드가 해당 포맷 쓰기를 지원하는지 확인. */
gboolean image_io_format_is_writable(ImageFormat fmt);

/* 경로의 확장자를 new_ext 로 교체한 새 문자열 반환 (호출자 g_free). */
char *image_io_path_with_ext(const char *path, const char *new_ext);

typedef struct {
    char        *src_path;
    char        *dest_path;
    ImageFormat  format;
    int          quality;  /* 1–100; has_quality == FALSE 이면 무시 */
} ImageConvertParams;

void image_convert_params_free(ImageConvertParams *p);

/* 단일 파일 변환 (백그라운드 스레드에서 호출 가능). 성공 TRUE. */
gboolean image_io_convert_file(const ImageConvertParams *params, GError **err);

#endif
