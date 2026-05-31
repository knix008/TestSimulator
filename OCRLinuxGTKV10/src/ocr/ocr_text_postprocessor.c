#include "ocr/ocr_text_postprocessor.h"
#include <glib.h>
#include <string.h>

static char *normalize_text(const char *text) {
    if (!text || !*text) return g_strdup("");
    char *normalized = g_utf8_normalize(text, -1, G_NORMALIZE_NFC);
    if (!normalized) return g_strdup("");

    GString *out = g_string_new(NULL);
    const char *p = normalized;
    gboolean last_space = TRUE;
    while (*p) {
        gunichar c = g_utf8_get_char(p);
        if (c == 0x00A0) c = ' ';
        if (g_unichar_isspace(c)) {
            if (!last_space) {
                g_string_append_c(out, ' ');
                last_space = TRUE;
            }
        } else {
            char buf[8];
            int n = g_unichar_to_utf8(c, buf);
            g_string_append_len(out, buf, n);
            last_space = FALSE;
        }
        p = g_utf8_next_char(p);
    }
    g_strstrip(out->str);
    g_free(normalized);
    return g_string_free(out, FALSE);
}

void ocr_text_postprocess(OcrResult *result) {
    if (!result) return;

    for (size_t i = 0; i < result->line_count; i++) {
        OcrLine *line = &result->lines[i];
        char *old = line->text;
        line->text = normalize_text(old);
        g_free(old);
        for (size_t j = 0; j < line->word_count; j++) {
            old = line->words[j].text;
            line->words[j].text = normalize_text(old);
            g_free(old);
        }
    }

    GString *full = g_string_new(NULL);
    for (size_t i = 0; i < result->line_count; i++) {
        if (!result->lines[i].text || !result->lines[i].text[0]) continue;
        if (full->len > 0) g_string_append_c(full, '\n');
        g_string_append(full, result->lines[i].text);
    }
    g_free(result->text);
    result->text = g_string_free(full, FALSE);
}
