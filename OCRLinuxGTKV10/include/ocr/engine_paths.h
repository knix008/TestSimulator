#ifndef ENGINE_PATHS_H
#define ENGINE_PATHS_H

#include <glib.h>

char *engine_paths_app_dir(void);
char *engine_paths_engines_root(void);

/* ONNX-based engines */
char *engine_paths_rapidocr_dir(void);
char *engine_paths_rapidocr_model(const char *filename);
char *engine_paths_paddle_onnx_dir(void);
char *engine_paths_paddle_onnx_model(const char *filename);

/* Tesseract */
char *engine_paths_tessdata_dir(void);

/* EasyOCR (Python) */
char *engine_paths_easyocr_models_dir(void);
char *engine_paths_easyocr_ready_marker(void);
char *engine_paths_script(const char *script_name);
char *engine_paths_python_exe(void);
char *engine_paths_pip_exe(void);

#endif
