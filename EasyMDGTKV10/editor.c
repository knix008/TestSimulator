/**
 * EasyMD GTK
 * editor.c - GTK adapter that splices markdown snippets (built by mdcore)
 *            into a GtkTextBuffer.
 *
 * This file owns ONLY the GTK-specific bits:
 *   - inspecting the current selection / cursor / line
 *   - rewriting buffer regions inside a single user-action group
 * All actual markdown text generation lives in mdcore.c.
 */
#include "editor.h"

#include <string.h>

#include "mdcore.h"
#include "utils.h"

/* Get current selection bounds; if no selection, both iters point to cursor. */
static gboolean get_selection_or_cursor(GtkTextBuffer *buf,
                                        GtkTextIter   *start,
                                        GtkTextIter   *end,
                                        gboolean      *had_selection) {
    *had_selection = gtk_text_buffer_get_selection_bounds(buf, start, end);
    if (!*had_selection) {
        gtk_text_buffer_get_iter_at_mark(buf, start,
                                         gtk_text_buffer_get_insert(buf));
        *end = *start;
    }
    return TRUE;
}

/* Replace [s,e) with `replacement` atomically (one undoable user action). */
static void replace_range(GtkTextBuffer *buf,
                          GtkTextIter   *s,
                          GtkTextIter   *e,
                          const gchar   *replacement) {
    gtk_text_buffer_begin_user_action(buf);
    gtk_text_buffer_delete(buf, s, e);
    gtk_text_buffer_insert(buf, s, replacement, -1);
    gtk_text_buffer_end_user_action(buf);
}

/* ------------------------------------------------------------------ */
/*  Inline wrapping (bold, italic, code, strike)                      */
/* ------------------------------------------------------------------ */

void editor_wrap_inline(GtkTextBuffer *buf,
                        const char    *prefix,
                        const char    *suffix,
                        const char    *placeholder) {
    g_return_if_fail(buf && prefix && suffix);

    GtkTextIter s, e;
    gboolean    had_sel;
    get_selection_or_cursor(buf, &s, &e, &had_sel);

    gchar *selected = gtk_text_buffer_get_text(buf, &s, &e, FALSE);
    gchar *snippet  = mdcore_wrap_inline(prefix, selected, suffix, placeholder);

    replace_range(buf, &s, &e, snippet);

    g_free(snippet);
    g_free(selected);
}

/* ------------------------------------------------------------------ */
/*  Per-line prefixing (lists, blockquotes)                           */
/* ------------------------------------------------------------------ */

static void line_range_for_selection(GtkTextBuffer *buf,
                                     int *line_start,
                                     int *line_end) {
    GtkTextIter s, e;
    gboolean    had_sel;
    get_selection_or_cursor(buf, &s, &e, &had_sel);

    gtk_text_iter_set_line_offset(&s, 0);
    /* If selection ends at column 0 of a line, don't include that line. */
    if (gtk_text_iter_starts_line(&e) && gtk_text_iter_compare(&s, &e) < 0) {
        gtk_text_iter_backward_char(&e);
    }
    *line_start = gtk_text_iter_get_line(&s);
    *line_end   = gtk_text_iter_get_line(&e);
}

void editor_prefix_lines(GtkTextBuffer *buf, const char *prefix) {
    g_return_if_fail(buf && prefix);

    int ls, le;
    line_range_for_selection(buf, &ls, &le);

    gtk_text_buffer_begin_user_action(buf);
    for (int line = ls; line <= le; line++) {
        GtkTextIter li;
        gtk_text_buffer_get_iter_at_line(buf, &li, line);
        gtk_text_buffer_insert(buf, &li, prefix, -1);
    }
    gtk_text_buffer_end_user_action(buf);
}

void editor_numbered_list(GtkTextBuffer *buf) {
    g_return_if_fail(buf);

    int ls, le;
    line_range_for_selection(buf, &ls, &le);

    gtk_text_buffer_begin_user_action(buf);
    int n = 1;
    for (int line = ls; line <= le; line++) {
        GtkTextIter li;
        gtk_text_buffer_get_iter_at_line(buf, &li, line);
        gchar *prefix = g_strdup_printf("%d. ", n++);
        gtk_text_buffer_insert(buf, &li, prefix, -1);
        g_free(prefix);
    }
    gtk_text_buffer_end_user_action(buf);
}

/* ------------------------------------------------------------------ */
/*  Heading replacement                                               */
/* ------------------------------------------------------------------ */

void editor_set_heading(GtkTextBuffer *buf, int level) {
    g_return_if_fail(buf);

    GtkTextIter cur;
    gtk_text_buffer_get_iter_at_mark(buf, &cur,
                                     gtk_text_buffer_get_insert(buf));

    GtkTextIter ls = cur, le = cur;
    gtk_text_iter_set_line_offset(&ls, 0);
    gtk_text_iter_forward_to_line_end(&le);

    gchar *line = gtk_text_buffer_get_text(buf, &ls, &le, FALSE);
    gchar *replaced = mdcore_set_heading(line, level);

    replace_range(buf, &ls, &le, replaced);

    g_free(replaced);
    g_free(line);
}

/* ------------------------------------------------------------------ */
/*  Block insertion                                                   */
/* ------------------------------------------------------------------ */

/* Insert a multi-line block, ensuring it sits on its own with blank lines
 * separating it from neighbouring text. */
void editor_insert_block(GtkTextBuffer *buf, const char *block) {
    g_return_if_fail(buf && block);

    GtkTextIter cur;
    gtk_text_buffer_get_iter_at_mark(buf, &cur,
                                     gtk_text_buffer_get_insert(buf));

    GString *s = g_string_new(NULL);
    if (!gtk_text_iter_starts_line(&cur)) {
        g_string_append_c(s, '\n');
    }
    /* Add a blank separator line if the previous line is non-empty. */
    if (gtk_text_iter_get_line(&cur) > 0 && gtk_text_iter_starts_line(&cur)) {
        GtkTextIter prev;
        gtk_text_buffer_get_iter_at_line(buf, &prev,
                                         gtk_text_iter_get_line(&cur) - 1);
        GtkTextIter prev_end = prev;
        gtk_text_iter_forward_to_line_end(&prev_end);
        gchar *prev_line = gtk_text_buffer_get_text(buf, &prev, &prev_end, FALSE);
        if (prev_line && *prev_line) g_string_append_c(s, '\n');
        g_free(prev_line);
    }
    g_string_append(s, block);
    g_string_append(s, "\n\n");

    gtk_text_buffer_begin_user_action(buf);
    gtk_text_buffer_insert(buf, &cur, s->str, -1);
    gtk_text_buffer_end_user_action(buf);

    g_string_free(s, TRUE);
}

void editor_insert_code_fence(GtkTextBuffer *buf) {
    editor_insert_block(buf, mdcore_code_fence_block());
}

void editor_insert_hr(GtkTextBuffer *buf) {
    editor_insert_block(buf, mdcore_hr_block());
}

void editor_insert_link(GtkTextBuffer *buf, gboolean is_image) {
    g_return_if_fail(buf);

    GtkTextIter s, e;
    gboolean    had_sel;
    get_selection_or_cursor(buf, &s, &e, &had_sel);

    gchar *selected = gtk_text_buffer_get_text(buf, &s, &e, FALSE);
    gchar *snippet  = mdcore_link_snippet(
        (selected && *selected) ? selected : NULL,
        NULL, /* mdcore picks the default URL */
        is_image);

    replace_range(buf, &s, &e, snippet);

    g_free(snippet);
    g_free(selected);
}

void editor_insert_table(GtkTextBuffer *buf, int rows, int cols) {
    g_return_if_fail(buf);
    gchar *table = mdcore_table_block(rows, cols);
    editor_insert_block(buf, table);
    g_free(table);
}

/* ------------------------------------------------------------------ */
/*  Cursor navigation                                                 */
/* ------------------------------------------------------------------ */

void editor_goto_line(GtkTextView *view, int line_1based) {
    g_return_if_fail(view);
    GtkTextBuffer *buf = gtk_text_view_get_buffer(view);
    int total = gtk_text_buffer_get_line_count(buf);
    int line  = line_1based - 1;
    if (line < 0)      line = 0;
    if (line >= total) line = total - 1;

    GtkTextIter iter;
    gtk_text_buffer_get_iter_at_line(buf, &iter, line);
    gtk_text_buffer_place_cursor(buf, &iter);
    gtk_text_view_scroll_to_iter(view, &iter, 0.1, TRUE, 0.0, 0.2);
    gtk_widget_grab_focus(GTK_WIDGET(view));
}
