#ifndef SELECTION_GEOM_H
#define SELECTION_GEOM_H

#include "layer.h"

#define SELECTION_HANDLE_SIZE 8
#define SELECTION_ROTATE_HANDLE_DIST 24

void selection_get_center(const SelectionRect *sel, double *cx, double *cy);
void selection_set_center(SelectionRect *sel, double cx, double cy);
void selection_canvas_to_local(const SelectionRect *sel, double px, double py,
                               double *lx, double *ly);
void selection_local_to_canvas(const SelectionRect *sel, double lx, double ly,
                               double *px, double *py);

gboolean selection_hit_inside(const SelectionRect *sel, int px, int py);
gboolean selection_hit_rotate_handle(const SelectionRect *sel, int px, int py);

/* 1=TL 2=TR 3=BL 4=BR, 0=none */
int selection_hit_resize_handle(const SelectionRect *sel, int px, int py);

#endif
