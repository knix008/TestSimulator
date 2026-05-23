/**
 * EasyMD GTK
 * mdcore.c - Pure markdown logic. No GTK includes here.
 */
#include "mdcore.h"

#include <cmark.h>
#include <stdlib.h>
#include <string.h>

/* ===================================================================
 * 1. Snippet builders
 * ================================================================= */

gchar *mdcore_wrap_inline(const char *prefix,
                          const char *body,
                          const char *suffix,
                          const char *placeholder) {
    g_return_val_if_fail(prefix && suffix, NULL);
    const char *content = (body && *body) ? body
                        : (placeholder ? placeholder : "");
    return g_strconcat(prefix, content, suffix, NULL);
}

gchar *mdcore_set_heading(const char *line, int level) {
    if (level < 1) level = 1;
    if (level > 6) level = 6;
    if (!line) line = "";

    /* Strip an existing "#... " sequence at the start (up to 6 hashes). */
    const char *p = line;
    int  pre = 0;
    while (*p == '#' && pre < 6) { p++; pre++; }
    if (pre > 0 && *p == ' ') p++;

    char hashes[8];
    for (int i = 0; i < level; i++) hashes[i] = '#';
    hashes[level] = '\0';

    return g_strconcat(hashes, " ", p, NULL);
}

const char *mdcore_default_link_text(gboolean is_image) {
    return is_image ? "이미지 설명" : "링크 텍스트";
}

const char *mdcore_default_link_url(gboolean is_image) {
    return is_image ? "https://example.com/image.png"
                    : "https://example.com";
}

gchar *mdcore_link_snippet(const char *text,
                           const char *url,
                           gboolean    is_image) {
    if (!text || !*text) text = mdcore_default_link_text(is_image);
    if (!url  || !*url ) url  = mdcore_default_link_url(is_image);
    return g_strdup_printf("%s[%s](%s)", is_image ? "!" : "", text, url);
}

gchar *mdcore_table_block(int rows, int cols) {
    if (rows < 1) rows = 2;
    if (cols < 1) cols = 2;

    GString *s = g_string_new(NULL);

    /* Header */
    for (int c = 0; c < cols; c++) g_string_append_printf(s, "| 열 %d ", c + 1);
    g_string_append(s, "|\n");

    /* Separator */
    for (int c = 0; c < cols; c++) g_string_append(s, "|------");
    g_string_append(s, "|\n");

    /* Data rows */
    for (int r = 0; r < rows; r++) {
        for (int c = 0; c < cols; c++) g_string_append(s, "|      ");
        g_string_append(s, "|\n");
    }

    /* Drop trailing newline so the editor adapter manages spacing. */
    if (s->len > 0 && s->str[s->len - 1] == '\n') {
        g_string_truncate(s, s->len - 1);
    }
    return g_string_free(s, FALSE);
}

const char *mdcore_code_fence_block(void) { return "```\ncode\n```"; }
const char *mdcore_hr_block(void)         { return "---"; }

/* ===================================================================
 * 2. HTML rendering
 * ================================================================= */

/* Minimal stylesheet for a clean, GitHub-ish look. */
static const char *PREVIEW_CSS =
    "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',"
    "'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;"
    "color:#24292f;background:#ffffff;margin:0;padding:24px;max-width:860px;}"
    "h1,h2,h3,h4,h5,h6{margin:1.4em 0 0.6em;font-weight:600;line-height:1.25;}"
    "h1{font-size:2em;border-bottom:1px solid #d0d7de;padding-bottom:.3em;}"
    "h2{font-size:1.5em;border-bottom:1px solid #d0d7de;padding-bottom:.3em;}"
    "h3{font-size:1.25em;}h4{font-size:1em;}h5{font-size:.9em;}"
    "h6{font-size:.85em;color:#57606a;}"
    "p,ul,ol,blockquote,pre,table{margin:.6em 0;}"
    "a{color:#0969da;text-decoration:none;}a:hover{text-decoration:underline;}"
    "code{font-family:'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,"
    "Consolas,'Liberation Mono',monospace;background:#eaeef2;padding:.15em .35em;"
    "border-radius:4px;font-size:90%;}"
    "pre{background:#f6f8fa;padding:14px;border-radius:6px;overflow:auto;}"
    "pre code{background:transparent;padding:0;font-size:100%;}"
    "blockquote{padding:0 1em;color:#57606a;border-left:.25em solid #d0d7de;}"
    "table{border-collapse:collapse;}"
    "table th,table td{border:1px solid #d0d7de;padding:6px 12px;}"
    "table th{background:#f6f8fa;}"
    "img{max-width:100%;}"
    "hr{border:0;border-top:1px solid #d0d7de;margin:1.4em 0;}"
    "ul,ol{padding-left:2em;}"
    "::selection{background:#0969da33;}";

char *mdcore_to_html(const char *markdown) {
    if (!markdown) markdown = "";
    int opts = CMARK_OPT_DEFAULT
             | CMARK_OPT_UNSAFE
             | CMARK_OPT_HARDBREAKS;
    return cmark_markdown_to_html(markdown, strlen(markdown), opts);
}

gchar *mdcore_html_document(const char *body_html) {
    return g_strdup_printf(
        "<!DOCTYPE html><html lang=\"ko\"><head>"
        "<meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<style>%s</style></head><body>%s</body></html>",
        PREVIEW_CSS, body_html ? body_html : "");
}

/* ===================================================================
 * 3. Outline parsing
 * ================================================================= */

/* Trim trailing spaces / tabs / closing '#' sequence from a heading title. */
static void trim_heading_title(gchar *t) {
    if (!t) return;
    size_t n = strlen(t);
    while (n > 0 && (t[n-1] == ' ' || t[n-1] == '\t' || t[n-1] == '\r')) {
        t[--n] = '\0';
    }
    while (n > 0 && t[n-1] == '#') t[--n] = '\0';
    while (n > 0 && (t[n-1] == ' ' || t[n-1] == '\t')) t[--n] = '\0';
}

/* If `line` (already left-trimmed) is an ATX heading return malloc'd title and
 * set *out_level to 1..6. Otherwise return NULL with *out_level = 0. */
static gchar *parse_heading_line(const char *line, int *out_level) {
    int level = 0;
    while (*line == '#' && level < 6) { line++; level++; }
    if (level == 0 || (*line != ' ' && *line != '\t' && *line != '\0')) {
        *out_level = 0;
        return NULL;
    }
    while (*line == ' ' || *line == '\t') line++;

    gchar *title = g_strdup(line);
    trim_heading_title(title);
    *out_level = level;
    return title;
}

MDHeading *mdcore_parse_outline(const char *markdown, int *out_count) {
    if (out_count) *out_count = 0;
    if (!markdown || !*markdown) return NULL;

    GArray *acc = g_array_new(FALSE, FALSE, sizeof(MDHeading));

    gboolean in_fence = FALSE;
    int      line_no = 0;

    const char *p = markdown;
    while (p && *p) {
        line_no++;
        const char *eol = strchr(p, '\n');
        size_t len = eol ? (size_t)(eol - p) : strlen(p);

        gchar *line = g_strndup(p, len);

        const char *trim = line;
        while (*trim == ' ' || *trim == '\t') trim++;

        if (strncmp(trim, "```", 3) == 0 || strncmp(trim, "~~~", 3) == 0) {
            in_fence = !in_fence;
        } else if (!in_fence && trim[0] == '#') {
            int level = 0;
            gchar *title = parse_heading_line(trim, &level);
            if (title && level >= 1 && level <= 6) {
                MDHeading h = { .level = level,
                                .line  = line_no,
                                .title = title };
                g_array_append_val(acc, h);
            } else {
                g_free(title);
            }
        }

        g_free(line);
        if (!eol) break;
        p = eol + 1;
    }

    int count = (int)acc->len;
    if (out_count) *out_count = count;
    if (count == 0) {
        g_array_free(acc, TRUE);
        return NULL;
    }
    /* Hand over the underlying array. */
    return (MDHeading *)g_array_free(acc, FALSE);
}

void mdcore_free_outline(MDHeading *headings, int count) {
    if (!headings) return;
    for (int i = 0; i < count; i++) g_free(headings[i].title);
    g_free(headings);
}
