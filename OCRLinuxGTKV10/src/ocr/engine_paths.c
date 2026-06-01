#include "ocr/engine_paths.h"
#include <limits.h>
#include <stdlib.h>
#include <unistd.h>
#ifdef __APPLE__
#include <mach-o/dyld.h>
#endif

char *engine_paths_app_dir(void) {
    char exe_path[PATH_MAX];
#ifdef __APPLE__
    uint32_t size = sizeof(exe_path);
    if (_NSGetExecutablePath(exe_path, &size) != 0)
        return g_strdup(".");
    char *real = realpath(exe_path, NULL);
    if (!real) return g_strdup(".");
    char *dir = g_path_get_dirname(real);
    free(real);
    return dir;
#else
    ssize_t len = readlink("/proc/self/exe", exe_path, sizeof(exe_path) - 1);
    if (len <= 0) return g_strdup(".");
    exe_path[len] = '\0';
    return g_path_get_dirname(exe_path);
#endif
}

char *engine_paths_engines_root(void) {
    const char *xdg = g_get_user_data_dir();
    return g_build_filename(xdg, "OCRLinuxGTKV10", "engines", NULL);
}

/*
 * Return the model directory for a given provider subdirectory name.
 * Priority: <app_dir>/models/<subdir>  →  <user_data>/engines/<subdir>
 * This allows models pre-downloaded by `make models` (next to the binary)
 * to be used without a runtime install dialog.
 */
static char *model_dir_for(const char *subdir) {
    char *app   = engine_paths_app_dir();
    char *local = g_build_filename(app, "models", subdir, NULL);
    g_free(app);

    /* If the local directory contains at least one file, use it */
    if (g_file_test(local, G_FILE_TEST_IS_DIR)) {
        GDir *d = g_dir_open(local, 0, NULL);
        if (d) {
            gboolean has_files = (g_dir_read_name(d) != NULL);
            g_dir_close(d);
            if (has_files) return local;
        }
    }
    g_free(local);

    char *root = engine_paths_engines_root();
    char *dir  = g_build_filename(root, subdir, NULL);
    g_free(root);
    return dir;
}

char *engine_paths_rapidocr_dir(void) {
    return model_dir_for("rapidocr");
}

char *engine_paths_rapidocr_model(const char *filename) {
    char *dir  = engine_paths_rapidocr_dir();
    char *path = g_build_filename(dir, filename, NULL);
    g_free(dir);
    return path;
}

char *engine_paths_paddle_onnx_dir(void) {
    return model_dir_for("paddle_onnx");
}

char *engine_paths_paddle_onnx_model(const char *filename) {
    char *dir  = engine_paths_paddle_onnx_dir();
    char *path = g_build_filename(dir, filename, NULL);
    g_free(dir);
    return path;
}

char *engine_paths_easyocr_models_dir(void) {
    char *root = engine_paths_engines_root();
    char *dir  = g_build_filename(root, "easyocr", "models", NULL);
    g_free(root);
    return dir;
}

char *engine_paths_script(const char *script_name) {
    char *app_dir = engine_paths_app_dir();
    char *script  = g_build_filename(app_dir, "scripts", script_name, NULL);
    g_free(app_dir);
    if (g_file_test(script, G_FILE_TEST_IS_REGULAR))
        return script;
    g_free(script);
    return g_build_filename("scripts", script_name, NULL);
}

char *engine_paths_python_exe(void) {
    char *root    = engine_paths_engines_root();
    char *venv_py = g_build_filename(root, "venv", "bin", "python3", NULL);
    g_free(root);
    if (g_file_test(venv_py, G_FILE_TEST_IS_EXECUTABLE))
        return venv_py;
    g_free(venv_py);
    return g_strdup("python3");
}

char *engine_paths_pip_exe(void) {
    char *root     = engine_paths_engines_root();
    char *venv_pip = g_build_filename(root, "venv", "bin", "pip", NULL);
    g_free(root);
    if (g_file_test(venv_pip, G_FILE_TEST_IS_EXECUTABLE))
        return venv_pip;
    g_free(venv_pip);
    return g_strdup("pip3");
}

char *engine_paths_tessdata_dir(void) {
    char *cache_root = engine_paths_engines_root();
    char *cache = g_build_filename(cache_root, "tesseract", "tessdata", NULL);
    g_free(cache_root);

    char *kor = g_build_filename(cache, "kor.traineddata", NULL);
    if (g_file_test(kor, G_FILE_TEST_EXISTS)) {
        g_free(kor);
        return cache;
    }
    g_free(kor);

    const char *candidates[] = {
        "/usr/share/tesseract-ocr/5/tessdata",
        "/usr/share/tesseract-ocr/4.00/tessdata",
        "/usr/share/tesseract-ocr/tessdata",
        "/usr/local/share/tessdata",
        "/opt/homebrew/share/tessdata",
        NULL
    };
    for (int i = 0; candidates[i]; i++) {
        char *sys_kor = g_build_filename(candidates[i], "kor.traineddata", NULL);
        if (g_file_test(sys_kor, G_FILE_TEST_EXISTS)) {
            g_free(sys_kor);
            g_free(cache);
            return g_strdup(candidates[i]);
        }
        g_free(sys_kor);
    }
    return cache;
}
