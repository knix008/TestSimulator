/* assets/icons/ — 파일 형식·폴더 아이콘 PNG 생성 */
#include <cairo/cairo.h>
#include <glib.h>
#include <stdio.h>
#include <string.h>

static void save_surface(cairo_surface_t *surface, const char *path) {
    cairo_surface_write_to_png(surface, path);
}

static void render_folder(cairo_t *cr, gboolean open) {
    double top_r = 252 / 255.0, top_g = 191 / 255.0, top_b = 73 / 255.0;
    double body_r = open ? 246 / 255.0 : 240 / 255.0;
    double body_g = open ? 174 / 255.0 : 162 / 255.0;
    double body_b = open ? 45 / 255.0 : 2 / 255.0;

    cairo_set_source_rgb(cr, 0.08, 0.09, 0.11);
    cairo_paint(cr);
    cairo_set_source_rgb(cr, top_r, top_g, top_b);
    cairo_rectangle(cr, 2, 3, 6, 3);
    cairo_fill(cr);
    cairo_set_source_rgb(cr, body_r, body_g, body_b);
    cairo_rectangle(cr, 1, 5, 14, 9);
    cairo_fill(cr);
    cairo_set_source_rgb(cr, 179 / 255.0, 98 / 255.0, 0);
    cairo_set_line_width(cr, 1.0);
    cairo_rectangle(cr, 1.5, 5.5, 13, 8);
    cairo_stroke(cr);
}

static void render_file(cairo_t *cr, const char *label, double ar, double ag, double ab) {
    cairo_set_source_rgb(cr, 0.08, 0.09, 0.11);
    cairo_paint(cr);
    cairo_set_source_rgb(cr, 245 / 255.0, 245 / 255.0, 245 / 255.0);
    cairo_rectangle(cr, 2, 1, 11, 14);
    cairo_fill(cr);
    cairo_set_source_rgb(cr, 210 / 255.0, 210 / 255.0, 210 / 255.0);
    cairo_move_to(cr, 13, 1);
    cairo_line_to(cr, 13, 5);
    cairo_line_to(cr, 9, 5);
    cairo_close_path(cr);
    cairo_fill(cr);
    cairo_set_source_rgb(cr, 170 / 255.0, 170 / 255.0, 170 / 255.0);
    cairo_set_line_width(cr, 1.0);
    cairo_rectangle(cr, 2.5, 1.5, 10, 13);
    cairo_stroke(cr);
    cairo_set_source_rgb(cr, ar, ag, ab);
    cairo_rectangle(cr, 2, 9, 11, 6);
    cairo_fill(cr);
    cairo_select_font_face(cr, "Sans", CAIRO_FONT_SLANT_NORMAL, CAIRO_FONT_WEIGHT_BOLD);
    cairo_set_font_size(cr, 5.2);
    cairo_text_extents_t ext;
    cairo_text_extents(cr, label, &ext);
    cairo_set_source_rgb(cr, 1, 1, 1);
    cairo_move_to(cr, 2 + (11 - ext.width) / 2.0 - ext.x_bearing,
                  9.2 + (6 - ext.height) / 2.0 - ext.y_bearing);
    cairo_show_text(cr, label);
}

static void write_png(const char *dir, const char *name, int size,
                      void (*draw)(cairo_t *), gboolean folder_open) {
    char *path = g_build_filename(dir, name, NULL);
    cairo_surface_t *surface =
        cairo_image_surface_create(CAIRO_FORMAT_ARGB32, size, size);
    cairo_t *cr = cairo_create(surface);
    double scale = size / 16.0;
    cairo_scale(cr, scale, scale);
    if (draw) {
        draw(cr);
    } else {
        render_folder(cr, folder_open);
    }
    cairo_destroy(cr);
    save_surface(surface, path);
    cairo_surface_destroy(surface);
    g_free(path);
}

typedef struct {
    const char *base;
    const char *label;
    double r, g, b;
} FileSpec;

int main(int argc, char **argv) {
    const char *out = argc > 1 ? argv[1] : "assets/icons";
    g_mkdir_with_parents(out, 0755);

    write_png(out, "folder-closed.png", 16, NULL, FALSE);
    write_png(out, "folder-open.png", 16, NULL, TRUE);
    write_png(out, "folder-closed-128.png", 128, NULL, FALSE);
    write_png(out, "folder-open-128.png", 128, NULL, TRUE);

    static FileSpec specs[] = {
        {"file-image", "IMG", 42, 157, 143},
        {"file-video", "VID", 231, 111, 81},
        {"file-png", "PNG", 76, 201, 240},
        {"file-jpg", "JPG", 67, 170, 139},
        {"file-gif", "GIF", 131, 56, 236},
        {"file-bmp", "BMP", 87, 117, 144},
        {"file-tiff", "TIF", 249, 132, 74},
        {"file-ico", "ICO", 56, 163, 165},
        {"file-webp", "WEB", 144, 190, 109},
        {"file-heif", "HIF", 66, 171, 140},
        {"file-avif", "AVF", 90, 140, 200},
    };

    for (guint i = 0; i < G_N_ELEMENTS(specs); i++) {
        FileSpec *sp = &specs[i];
        char *name16 = g_strdup_printf("%s.png", sp->base);
        char *name128 = g_strdup_printf("%s-128.png", sp->base);

        cairo_surface_t *s16 =
            cairo_image_surface_create(CAIRO_FORMAT_ARGB32, 16, 16);
        cairo_t *c16 = cairo_create(s16);
        render_file(c16, sp->label, sp->r / 255.0, sp->g / 255.0, sp->b / 255.0);
        cairo_destroy(c16);
        save_surface(s16, g_build_filename(out, name16, NULL));
        cairo_surface_destroy(s16);

        cairo_surface_t *s128 =
            cairo_image_surface_create(CAIRO_FORMAT_ARGB32, 128, 128);
        cairo_t *c128 = cairo_create(s128);
        cairo_scale(c128, 8, 8);
        render_file(c128, sp->label, sp->r / 255.0, sp->g / 255.0, sp->b / 255.0);
        cairo_destroy(c128);
        save_surface(s128, g_build_filename(out, name128, NULL));
        cairo_surface_destroy(s128);

        g_free(name16);
        g_free(name128);
    }

    printf("Wrote icons to %s\n", out);
    return 0;
}
