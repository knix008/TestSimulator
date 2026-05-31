#include "ocr/engine_paths.h"
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static char *join_path(const char *a, const char *b) {
    return g_build_filename(a, b, NULL);
}

char *engine_paths_app_dir(void) {
    char exe_path[PATH_MAX];
    ssize_t len = readlink("/proc/self/exe", exe_path, sizeof(exe_path) - 1);
    if (len <= 0)
        return g_strdup(".");
    exe_path[len] = '\0';
    return g_path_get_dirname(exe_path);
}

char *engine_paths_engines_root(void) {
    const char *xdg = g_get_user_data_dir();
    return g_build_filename(xdg, "OCRLinuxGTKV10", "engines", NULL);
}

char *engine_paths_bundled_models_root(void) {
    char *app_dir = engine_paths_app_dir();
    char *models = g_build_filename(app_dir, "models", "paddle", NULL);
    g_free(app_dir);
    return models;
}

char *engine_paths_paddle_model(const char *folder_name) {
    char *bundled = engine_paths_bundled_models_root();
    char *bundled_dir = join_path(bundled, folder_name);
    g_free(bundled);

    if (g_file_test(bundled_dir, G_FILE_TEST_IS_DIR)) {
        char *json = join_path(bundled_dir, "inference.json");
        char *params = join_path(bundled_dir, "inference.pdiparams");
        gboolean ok = g_file_test(json, G_FILE_TEST_EXISTS) && g_file_test(params, G_FILE_TEST_EXISTS);
        g_free(json);
        g_free(params);
        if (ok) return bundled_dir;
    }
    g_free(bundled_dir);

    char *cache_root = engine_paths_engines_root();
    char *cache_dir = g_build_filename(cache_root, "paddle", folder_name, NULL);
    g_free(cache_root);
    return cache_dir;
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

char *engine_paths_easyocr_models_dir(void) {
    char *cache_root = engine_paths_engines_root();
    char *dir = g_build_filename(cache_root, "easyocr", "models", NULL);
    g_free(cache_root);
    return dir;
}

char *engine_paths_script(const char *script_name) {
    char *app_dir = engine_paths_app_dir();
    char *script = g_build_filename(app_dir, "scripts", script_name, NULL);
    g_free(app_dir);
    if (g_file_test(script, G_FILE_TEST_IS_REGULAR))
        return script;

    g_free(script);
    return g_build_filename("scripts", script_name, NULL);
}

char *engine_paths_python_exe(void) {
    char *root = engine_paths_engines_root();
    char *venv_py = g_build_filename(root, "venv", "bin", "python3", NULL);
    g_free(root);
    if (g_file_test(venv_py, G_FILE_TEST_IS_EXECUTABLE))
        return venv_py;
    g_free(venv_py);
    return g_strdup("python3");
}

char *engine_paths_pip_exe(void) {
    char *root = engine_paths_engines_root();
    char *venv_pip = g_build_filename(root, "venv", "bin", "pip", NULL);
    g_free(root);
    if (g_file_test(venv_pip, G_FILE_TEST_IS_EXECUTABLE))
        return venv_pip;
    g_free(venv_pip);
    return g_strdup("pip3");
}
