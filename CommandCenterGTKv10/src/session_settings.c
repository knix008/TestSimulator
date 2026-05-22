#include "session_settings.h"
#include "json_util.h"

struct SessionSettings {
    gchar *config_dir;
    gchar *file_path;
    gchar *left_path;
    gchar *right_path;
    gint splitter_distance;
};

static gchar *config_directory(void) {
    const char *xdg = g_getenv("XDG_CONFIG_HOME");
    if (xdg && *xdg)
        return g_build_filename(xdg, "CommandCenterGTKv10", NULL);
    return g_build_filename(g_get_home_dir(), ".config", "CommandCenterGTKv10", NULL);
}

SessionSettings *session_settings_new(void) {
    SessionSettings *s = g_new0(SessionSettings, 1);
    s->config_dir = config_directory();
    s->file_path = g_build_filename(s->config_dir, "session.json", NULL);
    s->splitter_distance = 640;
    g_mkdir_with_parents(s->config_dir, 0755);
    return s;
}

void session_settings_free(SessionSettings *settings) {
    if (!settings) return;
    g_free(settings->config_dir);
    g_free(settings->file_path);
    g_free(settings->left_path);
    g_free(settings->right_path);
    g_free(settings);
}

void session_settings_load(SessionSettings *settings) {
    gchar *left = NULL, *right = NULL;
    gint split = settings->splitter_distance;
    if (!json_load_session(settings->file_path, &left, &right, &split)) return;

    if (left && g_file_test(left, G_FILE_TEST_IS_DIR)) {
        g_free(settings->left_path);
        settings->left_path = left;
        left = NULL;
    }
    g_free(left);

    if (right && g_file_test(right, G_FILE_TEST_IS_DIR)) {
        g_free(settings->right_path);
        settings->right_path = right;
        right = NULL;
    }
    g_free(right);
    settings->splitter_distance = split;
}

void session_settings_save(SessionSettings *settings,
                           const char *left_path,
                           const char *right_path,
                           gint splitter_distance) {
    g_free(settings->left_path);
    g_free(settings->right_path);
    settings->left_path = g_strdup(left_path);
    settings->right_path = g_strdup(right_path);
    settings->splitter_distance = splitter_distance;
    json_save_session(settings->file_path, left_path, right_path, splitter_distance);
}

const char *session_settings_get_left_path(SessionSettings *settings) {
    return settings->left_path;
}

const char *session_settings_get_right_path(SessionSettings *settings) {
    return settings->right_path;
}

gint session_settings_get_splitter_distance(SessionSettings *settings) {
    return settings->splitter_distance;
}
