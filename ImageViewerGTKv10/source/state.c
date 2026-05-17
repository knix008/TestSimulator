#include "state.h"

#include <glib.h>
#include <stdio.h>
#include <string.h>

static char *state_file_path(void) {
    char *dir = g_build_filename(g_get_user_config_dir(), "ImageViewerGTKv10", NULL);
    g_mkdir_with_parents(dir, 0755);
    char *path = g_build_filename(dir, "appstate.json", NULL);
    g_free(dir);
    return path;
}

char *state_load_last_folder(void) {
    char *path = state_file_path();
    gchar *contents = NULL;
    gsize len = 0;
    GError *err = NULL;

    if (!g_file_get_contents(path, &contents, &len, &err)) {
        g_free(path);
        g_clear_error(&err);
        return NULL;
    }
    g_free(path);

    /* Minimal JSON: {"LastFolder":"/path"} */
    const char *key = "\"LastFolder\"";
    char *p = strstr(contents, key);
    if (!p) {
        g_free(contents);
        return NULL;
    }
    p = strchr(p + strlen(key), '"');
    if (!p) {
        g_free(contents);
        return NULL;
    }
    p++;
    char *end = strchr(p, '"');
    if (!end) {
        g_free(contents);
        return NULL;
    }
    *end = '\0';
    char *folder = g_strdup(p);
    g_free(contents);

    if (!g_file_test(folder, G_FILE_TEST_IS_DIR)) {
        g_free(folder);
        return NULL;
    }
    return folder;
}

void state_save_last_folder(const char *folder) {
    if (!folder || !*folder) {
        return;
    }
    char *path = state_file_path();
    FILE *f = fopen(path, "w");
    if (f) {
        fprintf(f, "{\"LastFolder\":\"%s\"}\n", folder);
        fclose(f);
    }
    g_free(path);
}
