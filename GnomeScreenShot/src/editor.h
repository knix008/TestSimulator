#ifndef EDITOR_H
#define EDITOR_H

#include <gtk/gtk.h>

typedef enum {
    TOOL_NONE,
    TOOL_RECTANGLE,
    TOOL_ARROW,
    TOOL_TEXT,
    TOOL_CROP
} EditorTool;

typedef struct {
    EditorTool current_tool;
    GdkRGBA draw_color;
    int line_width;
} EditorState;

void open_editor_window(GdkPixbuf *pixbuf, GtkWindow *parent);

#endif /* EDITOR_H */
