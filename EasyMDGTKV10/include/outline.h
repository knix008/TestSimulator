/**
 * EasyMD GTK
 * outline.h - Document structure (heading) tree for the left pane.
 */
#ifndef EASYMD_OUTLINE_H
#define EASYMD_OUTLINE_H

#include <gtk/gtk.h>

/* Columns exposed on the outline model.
 * OUTLINE_COL_ICON is the icon-name (string) used by the pixbuf cell renderer
 * sitting next to the title; it is computed from the heading level. */
enum {
    OUTLINE_COL_TITLE = 0, /* string                              */
    OUTLINE_COL_LINE,      /* int (1-based line in the source)    */
    OUTLINE_COL_LEVEL,     /* int (1..6)                          */
    OUTLINE_COL_ICON,      /* string: absolute path to resources/hN.svg */
    OUTLINE_N_COLS
};

/* Initialise the tree-view (creates model + columns). */
void outline_init(GtkTreeView *tv);

/* Re-parse `markdown` and rebuild the tree. */
void outline_update(GtkTreeView *tv, const char *markdown);

/* Convenience: read the line number stored in `iter`. Returns -1 on error. */
int  outline_get_line_at(GtkTreeView *tv, GtkTreeIter *iter);

#endif /* EASYMD_OUTLINE_H */
