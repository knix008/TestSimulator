#ifndef IMAGE_IO_H
#define IMAGE_IO_H

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <stdbool.h>

bool utils_is_heif_path(const char *path);

/* HEIF/HIF → JPG 파일로 변환 (이미 있으면 재변환 안 함). 선택된 파일만 호출. */
char *image_io_heif_jpg_path(const char *path);

/* JPG가 이미 있으면 경로 반환, 없으면 NULL (변환하지 않음). */
char *image_io_heif_existing_jpg_path(const char *path);

/* 원본 HEIF 파일을 같은 폴더의 hif/ 하위로 이동. 성공 시 true. */
bool image_io_move_heif_to_subdir(const char *path);

/* 디스크에 저장하지 않고 pixbuf만 로드 (썸네일용). HEIF 자동 변환 없음. */
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

#endif
