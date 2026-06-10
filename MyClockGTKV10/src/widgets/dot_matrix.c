#include <string.h>
#include "dot_matrix.h"

/* 5×7 bitmap font for digits 0-9, colon, space, dash */
static const unsigned char FONT_5X7[][7] = {
    /* 0 */ { 0x0E,0x11,0x13,0x15,0x19,0x11,0x0E },
    /* 1 */ { 0x04,0x0C,0x04,0x04,0x04,0x04,0x0E },
    /* 2 */ { 0x0E,0x11,0x01,0x02,0x04,0x08,0x1F },
    /* 3 */ { 0x1F,0x02,0x04,0x02,0x01,0x11,0x0E },
    /* 4 */ { 0x02,0x06,0x0A,0x12,0x1F,0x02,0x02 },
    /* 5 */ { 0x1F,0x10,0x1E,0x01,0x01,0x11,0x0E },
    /* 6 */ { 0x06,0x08,0x10,0x1E,0x11,0x11,0x0E },
    /* 7 */ { 0x1F,0x01,0x02,0x04,0x08,0x08,0x08 },
    /* 8 */ { 0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E },
    /* 9 */ { 0x0E,0x11,0x11,0x0F,0x01,0x02,0x0C },
    /* : */ { 0x00,0x04,0x04,0x00,0x04,0x04,0x00 },
    /* space */ { 0x00,0x00,0x00,0x00,0x00,0x00,0x00 },
    /* - */ { 0x00,0x00,0x00,0x1F,0x00,0x00,0x00 },
};

static const unsigned char *get_glyph(char ch)
{
    if (ch >= '0' && ch <= '9') return FONT_5X7[ch - '0'];
    if (ch == ':')              return FONT_5X7[10];
    if (ch == ' ')              return FONT_5X7[11];
    if (ch == '-')              return FONT_5X7[12];
    return FONT_5X7[11]; /* fallback: space */
}

/* Returns width of glyph in columns */
static int glyph_cols(char ch)
{
    return (ch == ':') ? 2 : 5;
}

double dot_matrix_draw(cairo_t *cr,
                       const char *text,
                       double ox, double oy,
                       double dot_size,
                       double gap,
                       double r, double g, double b,
                       double dim_a)
{
    double cell = dot_size + gap;
    double x    = ox;

    for (const char *p = text; *p; p++) {
        const unsigned char *glyph = get_glyph(*p);
        int cols = glyph_cols(*p);

        for (int row = 0; row < 7; row++) {
            unsigned char bits = glyph[row];
            /* Bits are in columns 0..cols-1, MSB = leftmost */
            int shift_start = (cols == 2) ? 1 : 4;
            for (int col = 0; col < cols; col++) {
                gboolean on = (bits >> (shift_start - col)) & 1;
                double dx = x + col * cell;
                double dy = oy + row * cell;

                if (on)
                    cairo_set_source_rgb(cr, r, g, b);
                else
                    cairo_set_source_rgba(cr, r, g, b, dim_a);

                cairo_rectangle(cr, dx, dy, dot_size, dot_size);
                cairo_fill(cr);
            }
        }

        x += cols * cell + gap; /* inter-character gap */
    }

    return x - ox;
}
