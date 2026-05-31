#ifndef ENGINE_PATHS_H
#define ENGINE_PATHS_H

#include <glib.h>

char *engine_paths_app_dir(void);
char *engine_paths_engines_root(void);
char *engine_paths_bundled_models_root(void);
char *engine_paths_paddle_model(const char *folder_name);
char *engine_paths_tessdata_dir(void);
char *engine_paths_easyocr_models_dir(void);
char *engine_paths_script(const char *script_name);
char *engine_paths_python_exe(void);
char *engine_paths_pip_exe(void);

#endif
