#include "util/app_settings.h"
#include <json-glib/json-glib.h>
#include <string.h>

static char *settings_path(void) {
    return g_build_filename(g_get_user_config_dir(), "OCRLinuxGTKV10", "settings.json", NULL);
}

void app_settings_init_defaults(AppSettings *settings) {
    memset(settings, 0, sizeof(*settings));
    settings->preprocess_mode = 0;
    settings->ocr_provider_id = g_strdup("paddle-korean");
    settings->outer_splitter_pos = 520;
    settings->window_width = 1200;
    settings->window_height = 720;
    settings->window_x = -1;
    settings->window_y = -1;
    settings->window_maximized = FALSE;
}

void app_settings_clear(AppSettings *settings) {
    if (!settings) return;
    g_free(settings->last_directory);
    g_free(settings->ocr_provider_id);
    memset(settings, 0, sizeof(*settings));
}

static void set_string(char **dst, JsonObject *obj, const char *key) {
    if (!json_object_has_member(obj, key)) return;
    g_free(*dst);
    *dst = g_strdup(json_object_get_string_member(obj, key));
}

static void set_int(int *dst, JsonObject *obj, const char *key) {
    if (json_object_has_member(obj, key))
        *dst = json_object_get_int_member(obj, key);
}

gboolean app_settings_load(AppSettings *settings, GError **error) {
    app_settings_clear(settings);
    app_settings_init_defaults(settings);

    char *path = settings_path();
    if (!g_file_test(path, G_FILE_TEST_EXISTS)) {
        g_free(path);
        return TRUE;
    }

    JsonParser *parser = json_parser_new();
    if (!json_parser_load_from_file(parser, path, error)) {
        g_object_unref(parser);
        g_free(path);
        return FALSE;
    }
    g_free(path);

    JsonNode *root = json_parser_get_root(parser);
    if (!JSON_NODE_HOLDS_OBJECT(root)) {
        g_object_unref(parser);
        return TRUE;
    }

    JsonObject *obj = json_node_get_object(root);
    set_string(&settings->last_directory, obj, "last_directory");
    set_string(&settings->ocr_provider_id, obj, "ocr_provider_id");
    set_int(&settings->preprocess_mode, obj, "preprocess_mode");
    set_int(&settings->outer_splitter_pos, obj, "outer_splitter_pos");
    set_int(&settings->inner_splitter_pos, obj, "inner_splitter_pos");
    set_int(&settings->window_width, obj, "window_width");
    set_int(&settings->window_height, obj, "window_height");
    set_int(&settings->window_x, obj, "window_x");
    set_int(&settings->window_y, obj, "window_y");
    if (json_object_has_member(obj, "window_maximized"))
        settings->window_maximized = json_object_get_boolean_member(obj, "window_maximized");

    g_object_unref(parser);
    return TRUE;
}

gboolean app_settings_save(const AppSettings *settings, GError **error) {
    JsonBuilder *builder = json_builder_new();
    json_builder_begin_object(builder);

    if (settings->last_directory)
        json_builder_set_member_name(builder, "last_directory");
    json_builder_add_string_value(builder, settings->last_directory ? settings->last_directory : "");

    json_builder_set_member_name(builder, "ocr_provider_id");
    json_builder_add_string_value(builder, settings->ocr_provider_id ? settings->ocr_provider_id : "paddle-korean");

    json_builder_set_member_name(builder, "preprocess_mode");
    json_builder_add_int_value(builder, settings->preprocess_mode);

    json_builder_set_member_name(builder, "outer_splitter_pos");
    json_builder_add_int_value(builder, settings->outer_splitter_pos);

    json_builder_set_member_name(builder, "inner_splitter_pos");
    json_builder_add_int_value(builder, settings->inner_splitter_pos);

    json_builder_set_member_name(builder, "window_width");
    json_builder_add_int_value(builder, settings->window_width);

    json_builder_set_member_name(builder, "window_height");
    json_builder_add_int_value(builder, settings->window_height);

    json_builder_set_member_name(builder, "window_x");
    json_builder_add_int_value(builder, settings->window_x);

    json_builder_set_member_name(builder, "window_y");
    json_builder_add_int_value(builder, settings->window_y);

    json_builder_set_member_name(builder, "window_maximized");
    json_builder_add_boolean_value(builder, settings->window_maximized);

    json_builder_end_object(builder);

    JsonNode *root = json_builder_get_root(builder);
    JsonGenerator *gen = json_generator_new();
    json_generator_set_root(gen, root);
    json_generator_set_pretty(gen, TRUE);

    char *path = settings_path();
    char *dir = g_path_get_dirname(path);
    g_mkdir_with_parents(dir, 0755);
    g_free(dir);

    gboolean ok = json_generator_to_file(gen, path, error);
    g_free(path);
    g_object_unref(gen);
    json_node_unref(root);
    g_object_unref(builder);
    return ok;
}
