#include "util/result_save.h"
#include <string.h>

gboolean result_save_text_file(const char *path, const char *text, GError **error) {
    if (!g_file_set_contents(path, text ? text : "", -1, error))
        return FALSE;
    return TRUE;
}

gboolean result_save_pix_file(const char *path, PIX *pix, GError **error) {
    if (!pix) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL, "No image to save");
        return FALSE;
    }
    if (pixWriteAutoFormat(path, pix) != 0) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Cannot save image: %s", path);
        return FALSE;
    }
    return TRUE;
}

PIX *result_save_render_boxes(PIX *source, const OcrResult *result) {
    if (!source) return NULL;
    PIX *out = pixConvertTo32(source);
    if (!out || !result) return out;

    for (size_t i = 0; i < result->line_count; i++) {
        const OcrLine *line = &result->lines[i];
        for (size_t j = 0; j < line->word_count; j++) {
            const OcrRect *b = &line->words[j].bounds;
            int x = (int)b->x;
            int y = (int)b->y;
            int w = (int)b->w;
            int h = (int)b->h;
            if (w < 1 || h < 1) continue;
            BOX *box = boxCreate(x, y, w, h);
            pixRenderBoxArb(out, box, 2, 51, 255, 51);
            boxDestroy(&box);
        }
    }
    return out;
}

char *result_save_boxes_extension(const char *source_path) {
    if (!source_path || !*source_path) return g_strdup(".png");
    const char *ext = strrchr(source_path, '.');
    if (!ext) return g_strdup(".png");
    if (g_ascii_strcasecmp(ext, ".pdf") == 0) return g_strdup(".png");
    if (g_ascii_strcasecmp(ext, ".png") == 0) return g_strdup(".png");
    if (g_ascii_strcasecmp(ext, ".jpg") == 0 || g_ascii_strcasecmp(ext, ".jpeg") == 0)
        return g_strdup(".jpg");
    if (g_ascii_strcasecmp(ext, ".bmp") == 0) return g_strdup(".bmp");
    if (g_ascii_strcasecmp(ext, ".tif") == 0 || g_ascii_strcasecmp(ext, ".tiff") == 0)
        return g_strdup(".tiff");
    return g_strdup(".png");
}

char *result_save_build_boxes_filename(const char *base_name, const char *source_path) {
    char *ext = result_save_boxes_extension(source_path);
    char *name = g_strdup_printf("%s_boxes%s", base_name ? base_name : "ocr_result", ext);
    g_free(ext);
    return name;
}
