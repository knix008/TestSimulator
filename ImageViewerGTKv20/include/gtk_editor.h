#ifndef GTK_EDITOR_H
#define GTK_EDITOR_H

#include "gtk_app.h"

/* 이미지 편집기를 연다. 저장 시 saved_path_out 에 경로 복사(호출자 g_free).
 * 취소/실패 시 FALSE. */
gboolean gtk_editor_open(App *app, const char *image_path, char **saved_path_out);

#endif
