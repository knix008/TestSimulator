/**
 * EasyMD GTK
 * mdcore.h - Pure markdown logic with NO GTK dependency.
 *
 * This module is the toolkit-agnostic core. It can be unit-tested or reused
 * outside GTK because it only depends on:
 *
 *   - glib (g_strconcat, g_string_*, g_strdup, g_free, gboolean, ...)
 *   - libcmark (CommonMark parser/renderer)
 *   - C standard library
 *
 * It exposes three groups of helpers:
 *
 *   1. Snippet builders   - return malloc'd markdown text fragments that the
 *                           GTK editor adapter can splice into a buffer.
 *   2. HTML rendering     - convert markdown to a styled HTML document.
 *   3. Outline parsing    - extract the heading hierarchy from a document.
 */
#ifndef EASYMD_MDCORE_H
#define EASYMD_MDCORE_H

#include <glib.h>

/* =====================================================================
 * 1. Snippet builders
 * =================================================================== */

/* Wrap `body` with `prefix`/`suffix`. If body is NULL/empty, `placeholder` is
 * used instead (so callers without a selection still get usable output).
 * Returned string is owned by caller, free with g_free(). */
gchar *mdcore_wrap_inline(const char *prefix,
                          const char *body,
                          const char *suffix,
                          const char *placeholder);

/* Build a heading line at `level` (clamped to 1..6) from the given existing
 * `line` text. Any pre-existing leading "#"+space sequence is stripped first.
 * Returned string is owned by caller, free with g_free(). */
gchar *mdcore_set_heading(const char *line, int level);

/* Build a markdown link or image snippet. Either argument may be NULL, in
 * which case sensible defaults are used. Returned string owned by caller. */
gchar *mdcore_link_snippet(const char *text,
                           const char *url,
                           gboolean    is_image);

/* Default placeholder text/url used when caller passes NULL/empty. The
 * pointers are static and must not be freed. */
const char *mdcore_default_link_text(gboolean is_image);
const char *mdcore_default_link_url (gboolean is_image);

/* Build a markdown table skeleton with `rows` data rows and `cols` columns.
 * The trailing newline is omitted so the GTK adapter can manage spacing.
 * Returned string is owned by caller, free with g_free(). */
gchar *mdcore_table_block(int rows, int cols);

/* Static blocks for fenced code / horizontal rule. Do not free. */
const char *mdcore_code_fence_block(void); /* "```\ncode\n```"   */
const char *mdcore_hr_block(void);         /* "---"              */

/* =====================================================================
 * 2. HTML rendering
 * =================================================================== */

/* Render markdown to an HTML body via libcmark. Returns a heap buffer
 * allocated by cmark; caller frees with free(). NULL on allocation failure. */
char *mdcore_to_html(const char *markdown);

/* Wrap `body_html` with EasyMD's preview HTML document (doctype + CSS).
 * Returns g_malloc'd string; free with g_free(). */
gchar *mdcore_html_document(const char *body_html);

/* =====================================================================
 * 3. Outline parsing
 * =================================================================== */

typedef struct {
    int    level;  /* 1..6                          */
    int    line;   /* 1-based line in source        */
    gchar *title;  /* owned by the heading record   */
} MDHeading;

/* Parse ATX headings (`#`..`######`) from `markdown`, skipping fenced code
 * blocks. Sets *out_count to the number of headings found.
 * Returns NULL when there are zero headings (count is set to 0).
 * Free the returned array with mdcore_free_outline(). */
MDHeading *mdcore_parse_outline(const char *markdown, int *out_count);

void       mdcore_free_outline(MDHeading *headings, int count);

#endif /* EASYMD_MDCORE_H */
