/**
 * EasyMD GTK
 * editor.h - Markdown insertion helpers for a GtkTextBuffer.
 *
 * Each helper is mouse/menu-driven: it wraps the current selection or, when
 * there is none, inserts a placeholder so the user can keep typing.
 */
#ifndef EASYMD_EDITOR_H
#define EASYMD_EDITOR_H

#include <gtk/gtk.h>

/* Inline wrapping (e.g. **bold**, *italic*, `code`). */
void editor_wrap_inline(GtkTextBuffer *buf,
                        const char    *prefix,
                        const char    *suffix,
                        const char    *placeholder);

/* Add a prefix to every line touched by the selection (or current line). */
void editor_prefix_lines(GtkTextBuffer *buf, const char *prefix);

/* Convert the touched lines to a numbered list (1. 2. 3. ...). */
void editor_numbered_list(GtkTextBuffer *buf);

/* Insert a heading of the given level (1..6) at start of current line. */
void editor_set_heading(GtkTextBuffer *buf, int level);

/* Insert a multi-line block at the cursor, ensuring blank lines around it. */
void editor_insert_block(GtkTextBuffer *buf, const char *block);

/* Insert a fenced code block ```\n...\n``` */
void editor_insert_code_fence(GtkTextBuffer *buf);

/* Insert a horizontal rule (---) on its own line. */
void editor_insert_hr(GtkTextBuffer *buf);

/* Insert a link or image reference using the current selection as link text. */
void editor_insert_link(GtkTextBuffer *buf, gboolean is_image);

/* Insert a table skeleton with `rows` data rows and `cols` columns. */
void editor_insert_table(GtkTextBuffer *buf, int rows, int cols);

/* Move the cursor to the given line (1-based) and scroll the view. */
void editor_goto_line(GtkTextView *view, int line_1based);

#endif /* EASYMD_EDITOR_H */
