#include "selection_geom.h"

#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static double deg_to_rad(double deg) {
    return deg * M_PI / 180.0;
}

void selection_get_center(const SelectionRect *sel, double *cx, double *cy) {
    *cx = sel->place_x + sel->place_w / 2.0;
    *cy = sel->place_y + sel->place_h / 2.0;
}

void selection_set_center(SelectionRect *sel, double cx, double cy) {
    sel->place_x = (int)(cx - sel->place_w / 2.0);
    sel->place_y = (int)(cy - sel->place_h / 2.0);
}

void selection_canvas_to_local(const SelectionRect *sel, double px, double py,
                               double *lx, double *ly) {
    double cx, cy;
    selection_get_center(sel, &cx, &cy);
    double dx = px - cx;
    double dy = py - cy;
    double rad = -deg_to_rad(sel->place_angle);
    double c = cos(rad);
    double s = sin(rad);
    *lx = dx * c - dy * s;
    *ly = dx * s + dy * c;
}

void selection_local_to_canvas(const SelectionRect *sel, double lx, double ly,
                               double *px, double *py) {
    double cx, cy;
    selection_get_center(sel, &cx, &cy);
    double rad = deg_to_rad(sel->place_angle);
    double c = cos(rad);
    double s = sin(rad);
    *px = cx + lx * c - ly * s;
    *py = cy + lx * s + ly * c;
}

gboolean selection_hit_inside(const SelectionRect *sel, int px, int py) {
    double lx, ly;
    selection_canvas_to_local(sel, px, py, &lx, &ly);
    double hw = sel->place_w / 2.0;
    double hh = sel->place_h / 2.0;
    return lx >= -hw && lx < hw && ly >= -hh && ly < hh;
}

static gboolean hit_point(int px, int py, double hx, double hy, int size) {
    int hs = size / 2;
    return px >= (int)hx - hs && px < (int)hx + hs && py >= (int)hy - hs && py < (int)hy + hs;
}

gboolean selection_hit_rotate_handle(const SelectionRect *sel, int px, int py) {
    double rx, ry;
    selection_local_to_canvas(sel, 0, -sel->place_h / 2.0 - SELECTION_ROTATE_HANDLE_DIST, &rx, &ry);
    return hit_point(px, py, rx, ry, SELECTION_HANDLE_SIZE + 2);
}

int selection_hit_resize_handle(const SelectionRect *sel, int px, int py) {
    double lx, ly;
    selection_canvas_to_local(sel, px, py, &lx, &ly);
    double hw = sel->place_w / 2.0;
    double hh = sel->place_h / 2.0;
    int hs = SELECTION_HANDLE_SIZE;
    double tol = hs;

    if (fabs(lx + hw) < tol && fabs(ly + hh) < tol)
        return 1;
    if (fabs(lx - hw) < tol && fabs(ly + hh) < tol)
        return 2;
    if (fabs(lx + hw) < tol && fabs(ly - hh) < tol)
        return 3;
    if (fabs(lx - hw) < tol && fabs(ly - hh) < tol)
        return 4;
    return 0;
}
