#include <math.h>
#include <string.h>
#include "seven_segment.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/* Design constants (will be multiplied by scale) */
#define DW  52.0   /* digit width  */
#define DH  96.0   /* digit height */
#define ST  10.0   /* segment thickness */
#define GAP  3.0   /* gap from digit edge */
#define CG  12.0   /* character spacing */
#define CW  24.0   /* colon width */

/*
 * Segment encoding: [a, b, c, d, e, f, g]
 *   a = top bar
 *   b = top-right vertical
 *   c = bottom-right vertical
 *   d = bottom bar
 *   e = bottom-left vertical
 *   f = top-left vertical
 *   g = middle bar
 */
typedef struct { unsigned char segs; } SegMap;

static unsigned char get_segs(char ch)
{
    /* bits: 0=a 1=b 2=c 3=d 4=e 5=f 6=g */
    switch (ch) {
    case '0': return 0b0111111;
    case '1': return 0b0000110;
    case '2': return 0b1011011;
    case '3': return 0b1001111;
    case '4': return 0b1100110;
    case '5': return 0b1101101;
    case '6': return 0b1111101;
    case '7': return 0b0000111;
    case '8': return 0b1111111;
    case '9': return 0b1101111;
    case ' ': return 0b0000000;
    case '-': return 0b1000000;
    default:  return 0b0000000;
    }
}

/* Hexagonal horizontal segment */
static void make_h(cairo_t *cr, double x, double y, double w, double h,
                   gboolean on,
                   double sr, double sg, double sb,
                   double dr, double dg, double db, double dim_a)
{
    double c = h / 2.0;
    cairo_move_to(cr, x + c,     y);
    cairo_line_to(cr, x + w - c, y);
    cairo_line_to(cr, x + w,     y + c);
    cairo_line_to(cr, x + w - c, y + h);
    cairo_line_to(cr, x + c,     y + h);
    cairo_line_to(cr, x,         y + c);
    cairo_close_path(cr);
    if (on)
        cairo_set_source_rgb(cr, sr, sg, sb);
    else
        cairo_set_source_rgba(cr, dr, dg, db, dim_a);
    cairo_fill(cr);
}

/* Hexagonal vertical segment */
static void make_v(cairo_t *cr, double x, double y, double w, double h,
                   gboolean on,
                   double sr, double sg, double sb,
                   double dr, double dg, double db, double dim_a)
{
    double c = w / 2.0;
    cairo_move_to(cr, x + c, y);
    cairo_line_to(cr, x + w, y + c);
    cairo_line_to(cr, x + w, y + h - c);
    cairo_line_to(cr, x + c, y + h);
    cairo_line_to(cr, x,     y + h - c);
    cairo_line_to(cr, x,     y + c);
    cairo_close_path(cr);
    if (on)
        cairo_set_source_rgb(cr, sr, sg, sb);
    else
        cairo_set_source_rgba(cr, dr, dg, db, dim_a);
    cairo_fill(cr);
}

static void draw_digit(cairo_t *cr, double x, double y, unsigned char segs,
                       double scale,
                       double sr, double sg, double sb,
                       double dim_a)
{
    double dw = DW * scale, dh = DH * scale;
    double st = ST * scale, gap = GAP * scale;

    double dr = sr * 0.3, dg = sg * 0.3, db = sb * 0.3;

    /* a – top */
    make_h(cr, x + gap, y,           dw - 2*gap, st,        (segs>>0)&1,
           sr,sg,sb, dr,dg,db, dim_a);
    /* b – top-right */
    make_v(cr, x + dw - st, y + gap, st,  dh/2 - 2*gap,    (segs>>1)&1,
           sr,sg,sb, dr,dg,db, dim_a);
    /* c – bottom-right */
    make_v(cr, x + dw - st, y + dh/2 + gap, st, dh/2 - 2*gap, (segs>>2)&1,
           sr,sg,sb, dr,dg,db, dim_a);
    /* d – bottom */
    make_h(cr, x + gap, y + dh - st, dw - 2*gap, st,        (segs>>3)&1,
           sr,sg,sb, dr,dg,db, dim_a);
    /* e – bottom-left */
    make_v(cr, x,       y + dh/2 + gap, st, dh/2 - 2*gap,  (segs>>4)&1,
           sr,sg,sb, dr,dg,db, dim_a);
    /* f – top-left */
    make_v(cr, x,       y + gap,    st,  dh/2 - 2*gap,      (segs>>5)&1,
           sr,sg,sb, dr,dg,db, dim_a);
    /* g – middle */
    make_h(cr, x + gap, y + (dh-st)/2, dw - 2*gap, st,      (segs>>6)&1,
           sr,sg,sb, dr,dg,db, dim_a);
}

static void draw_colon(cairo_t *cr, double x, double y,
                       double scale,
                       double sr, double sg, double sb)
{
    double dh = DH * scale, st = ST * scale, cw = CW * scale;
    double r  = st * 0.7;
    double cx = x + cw / 2.0 - r / 2.0;
    cairo_set_source_rgb(cr, sr, sg, sb);
    cairo_arc(cr, cx, y + dh / 3.0,       r, 0, 2 * M_PI); cairo_fill(cr);
    cairo_arc(cr, cx, y + 2.0 * dh / 3.0, r, 0, 2 * M_PI); cairo_fill(cr);
}

double seven_segment_draw(cairo_t *cr,
                          const char *text,
                          double ox, double oy,
                          double scale,
                          double seg_r, double seg_g, double seg_b,
                          double dim_a)
{
    double x = ox;
    for (const char *p = text; *p; p++) {
        if (*p == ':') {
            draw_colon(cr, x, oy, scale, seg_r, seg_g, seg_b);
            x += CW * scale;
        } else {
            unsigned char segs = get_segs(*p);
            draw_digit(cr, x, oy, segs, scale, seg_r, seg_g, seg_b, dim_a);
            x += (DW + CG) * scale;
        }
    }
    return x - ox;
}
