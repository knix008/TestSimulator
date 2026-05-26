#ifndef REMBG_ONNX_H
#define REMBG_ONNX_H

#include <gdk-pixbuf/gdk-pixbuf.h>
#include <glib.h>

typedef enum {
    REMBG_MODEL_U2NET = 0,
    REMBG_MODEL_BRIA_RMBG2 = 1,
    REMBG_MODEL_COUNT
} RembgModelId;

typedef void (*RembgProgressFn)(int percent, const char *message, gpointer user_data);

/* 빌드 시 HAVE_ONNXRUNTIME 이 정의되었는지 */
gboolean rembg_onnx_is_supported(void);

/* u2net 또는 bria 모델 파일이 로컬에 있는지 */
gboolean rembg_onnx_model_installed(RembgModelId model);

/* ~/.local/share/ImageViewerGTK/models */
const char *rembg_onnx_models_directory(void);

const char *rembg_onnx_model_display_name(RembgModelId model);

/* 없으면 GitHub에서 다운로드 (libsoup 또는 curl). */
gboolean rembg_onnx_ensure_model(RembgModelId model,
                                 RembgProgressFn progress,
                                 gpointer user_data,
                                 GError **err);

/* GdkPixbuf 에 알파 마스크 적용 (원본 크기 유지). */
GdkPixbuf *rembg_onnx_remove_background(GdkPixbuf *source,
                                        RembgModelId model,
                                        RembgProgressFn progress,
                                        gpointer user_data,
                                        GError **err);

void rembg_onnx_invalidate_session(void);

#endif
