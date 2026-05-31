#include "ocr/result_json.h"
#include <json-glib/json-glib.h>
#include <string.h>

static char *get_string(JsonObject *obj, const char *key) {
    if (!json_object_has_member(obj, key)) return NULL;
    return g_strdup(json_object_get_string_member(obj, key));
}

static OcrRect rect_from_object(JsonObject *obj) {
    OcrRect r = {0};
    if (json_object_has_member(obj, "x")) r.x = (float)json_object_get_double_member(obj, "x");
    if (json_object_has_member(obj, "y")) r.y = (float)json_object_get_double_member(obj, "y");
    if (json_object_has_member(obj, "w")) r.w = (float)json_object_get_double_member(obj, "w");
    if (json_object_has_member(obj, "h")) r.h = (float)json_object_get_double_member(obj, "h");
    return r;
}

static char *extract_json_payload(const char *json_text) {
    if (!json_text || !*json_text)
        return NULL;

    gchar **lines = g_strsplit(json_text, "\n", -1);
    char *result = NULL;
    for (int i = (int)g_strv_length(lines) - 1; i >= 0; i--) {
        g_strstrip(lines[i]);
        if (lines[i][0] == '{') {
            result = g_strdup(lines[i]);
            break;
        }
    }
    g_strfreev(lines);
    return result ? result : g_strdup(json_text);
}

gboolean ocr_result_from_json(const char *json_text, OcrResult *result, GError **error) {
    ocr_result_clear(result);

    char *payload = extract_json_payload(json_text);
    JsonParser *parser = json_parser_new();
    if (!json_parser_load_from_data(parser, payload ? payload : json_text, -1, error)) {
        g_free(payload);
        g_object_unref(parser);
        return FALSE;
    }
    g_free(payload);

    JsonNode *root = json_parser_get_root(parser);
    if (!JSON_NODE_HOLDS_OBJECT(root)) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "JSON root is not an object");
        g_object_unref(parser);
        return FALSE;
    }

    JsonObject *obj = json_node_get_object(root);
    if (json_object_has_member(obj, "error")) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "%s",
                    json_object_get_string_member(obj, "error"));
        g_object_unref(parser);
        return FALSE;
    }

    result->text = get_string(obj, "text");
    if (!json_object_has_member(obj, "lines")) {
        g_object_unref(parser);
        return TRUE;
    }

    JsonArray *lines = json_object_get_array_member(obj, "lines");
    guint line_count = json_array_get_length(lines);
    result->line_count = line_count;
    result->lines = g_new0(OcrLine, line_count);

    for (guint i = 0; i < line_count; i++) {
        JsonObject *line_obj = json_array_get_object_element(lines, i);
        OcrLine *line = &result->lines[i];
        line->text = get_string(line_obj, "text");

        if (!json_object_has_member(line_obj, "words")) continue;
        JsonArray *words = json_object_get_array_member(line_obj, "words");
        guint word_count = json_array_get_length(words);
        line->word_count = word_count;
        line->words = g_new0(OcrWord, word_count);

        for (guint j = 0; j < word_count; j++) {
            JsonObject *word_obj = json_array_get_object_element(words, j);
            line->words[j].text = get_string(word_obj, "text");
            line->words[j].bounds = rect_from_object(word_obj);
        }
    }

    g_object_unref(parser);
    return TRUE;
}
