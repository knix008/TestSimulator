#pragma once

#include <glib.h>
#include "app_settings.h"

typedef struct {
    int   level;
    char *text;
    int   line;
    int   index;
} OutlineItem;

/* Apply hierarchical numbering to headings in markdown source (1, 1.1, …).
   Returns a newly-allocated string; g_free() when done. */
char      *markdown_apply_heading_numbering(const char *markdown);

/* Convert markdown to a full HTML document string; g_free() when done. */
char      *markdown_to_html(const char *markdown, const AppSettings *settings);

/* Same but optimised for print / PDF (no max-width, page-break hints). */
char      *markdown_to_html_for_pdf(const char *markdown, const AppSettings *settings);

/* Convert markdown to HTML with id="h-N" anchors on headings; g_free() when done. */
char      *markdown_to_html_with_anchors(const char *markdown);

/* Extract heading outline; returns GPtrArray of OutlineItem*; free with
   g_ptr_array_unref() (items are freed automatically). */
GPtrArray *markdown_get_outline(const char *markdown);
