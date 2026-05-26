#ifndef ASSETS_H
#define ASSETS_H

#include <gdk-pixbuf/gdk-pixbuf.h>

/* 프로젝트 assets/icons/ (형식별·폴더 아이콘 PNG) */
const char *assets_icons_dir(void);

/* assets/icons/<filename> 로드 후 필요 시 스케일. 없으면 NULL. */
GdkPixbuf *assets_load_icon(const char *filename, int size);

/* 파일 경로에 맞는 아이콘 파일명 (예: "file-png.png"). */
const char *assets_icon_file_for_path(const char *path);

GdkPixbuf *assets_load_icon_for_path(const char *path, int size);

GdkPixbuf *assets_load_folder_icon(gboolean open, int size);

#endif
