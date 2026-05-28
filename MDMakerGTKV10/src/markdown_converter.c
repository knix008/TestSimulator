#include "markdown_converter.h"

#include <cmark.h>
#include <string.h>
#include <stdio.h>

/* ── heading numbering ─────────────────────────────────────────────── */
char *markdown_apply_heading_numbering(const char *markdown)
{
    if (!markdown) return g_strdup("");

    int counters[6] = {0};
    GString *sb = g_string_new(NULL);
    char **lines = g_strsplit(markdown, "\n", -1);

    for (int l = 0; lines[l] != NULL; l++) {
        const char *line = lines[l];
        int level = 0;
        while (line[level] == '#' && level < 6) level++;
        if (level > 0 && (line[level] == ' ' || line[level] == '\t')) {
            counters[level - 1]++;
            for (int i = level; i < 6; i++) counters[i] = 0;

            int start = 0;
            while (start < level - 1 && counters[start] == 0) start++;

            GString *prefix = g_string_new(NULL);
            for (int i = start; i < level; i++) {
                if (i > start) g_string_append_c(prefix, '.');
                g_string_append_printf(prefix, "%d", counters[i]);
            }

            /* hashes */
            for (int i = 0; i < level; i++) g_string_append_c(sb, '#');
            g_string_append_printf(sb, " %s %s\n", prefix->str, line + level + 1);
            g_string_free(prefix, TRUE);
        } else {
            g_string_append(sb, line);
            g_string_append_c(sb, '\n');
        }
    }
    g_strfreev(lines);
    return g_string_free(sb, FALSE);
}

/* ── cmark helpers ─────────────────────────────────────────────────── */
static char *md_to_html_body(const char *markdown)
{
    int opts = CMARK_OPT_DEFAULT | CMARK_OPT_UNSAFE;
    char *html = cmark_markdown_to_html(markdown, strlen(markdown), opts);
    char *dup  = g_strdup(html);
    free(html);
    return dup;
}

/* Add id="h-N" anchors to all heading tags in an HTML string. */
static char *inject_anchors(const char *html)
{
    GString *out = g_string_new(NULL);
    const char *p = html;
    int idx = 0;

    while (*p) {
        /* look for <h1>…<h6> opening tag */
        if (*p == '<' && (p[1] == 'h' || p[1] == 'H')
            && p[2] >= '1' && p[2] <= '6'
            && (p[3] == '>' || p[3] == ' ')) {
            char level = p[2];
            /* advance past '<hN' */
            p += 3;
            g_string_append_printf(out, "<h%c id=\"h-%d\"", level, idx++);
        } else {
            g_string_append_c(out, *p++);
        }
    }
    return g_string_free(out, FALSE);
}

/* Apply hierarchical numbering to HTML heading tags. */
static char *apply_heading_numbering_html(const char *html)
{
    int counters[6] = {0};
    GString *out = g_string_new(NULL);
    const char *p = html;

    while (*p) {
        /* detect <hN> or <hN ...> */
        if (*p == '<' && (p[1] == 'h' || p[1] == 'H')
            && p[2] >= '1' && p[2] <= '6') {
            int level = p[2] - '0';
            /* find end of opening tag */
            const char *close = strchr(p, '>');
            if (!close) { g_string_append_c(out, *p++); continue; }

            counters[level - 1]++;
            for (int i = level; i < 6; i++) counters[i] = 0;

            int start = 0;
            while (start < level - 1 && counters[start] == 0) start++;

            GString *prefix = g_string_new(NULL);
            for (int i = start; i < level; i++) {
                if (i > start) g_string_append_c(prefix, '.');
                g_string_append_printf(prefix, "%d", counters[i]);
            }

            /* emit opening tag */
            g_string_append_len(out, p, (gssize)(close - p + 1));
            g_string_append_printf(out, "%s ", prefix->str);
            g_string_free(prefix, TRUE);
            p = close + 1;
        } else {
            g_string_append_c(out, *p++);
        }
    }
    return g_string_free(out, FALSE);
}

/* ── HTML document wrappers ────────────────────────────────────────── */
static const char *PREVIEW_STYLE =
    "html{background:#fff;color:#1a1a1a;scroll-padding-top:0}"
    "body{font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;"
    "max-width:860px;margin:40px auto;padding:0 24px;line-height:1.7;"
    "color:#1a1a1a;background:#fff}"
    "h1,h2,h3,h4,h5,h6{margin-top:1.5em;margin-bottom:.4em;color:#111;font-weight:600;"
    "scroll-margin-top:0}"
    "h1{font-size:2em;border-bottom:2px solid #e0e0e0;padding-bottom:.3em}"
    "h2{font-size:1.5em;border-bottom:1px solid #e0e0e0;padding-bottom:.2em}"
    "h3{font-size:1.2em}"
    "code{background:#f0f0f0;padding:.15em .4em;border-radius:3px;"
    "font-family:'Courier New',monospace;font-size:.88em}"
    "pre{background:#f5f5f5;padding:1em 1.2em;border-radius:6px;"
    "overflow-x:auto;border:1px solid #e0e0e0}"
    "pre code{background:none;padding:0}"
    "blockquote{border-left:4px solid #ccc;margin:0 0 1em;"
    "padding:.5em 1em;color:#555;background:#fafafa}"
    "table{border-collapse:collapse;width:100%;margin:1em 0}"
    "th,td{border:1px solid #ddd;padding:.6em 1em;text-align:left}"
    "th{background:#f0f0f0;font-weight:600}"
    "tr:nth-child(even){background:#fafafa}"
    "hr{border:none;border-top:2px solid #e0e0e0;margin:2em 0}"
    "a{color:#0078d4;text-decoration:none}"
    "img{max-width:100%}"
    "ul,ol{padding-left:2em}"
    "li{margin:.2em 0}";

static char *make_html_doc(const char *body, const char *style)
{
    return g_strdup_printf(
        "<!DOCTYPE html>\n<html><head>\n"
        "<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
        "<style>%s</style>\n"
        "</head><body>\n%s\n</body></html>\n",
        style, body);
}

static char *make_html_doc_settings(const char *body,
                                    const AppSettings *s,
                                    gboolean for_print)
{
    const char *layout = for_print
        ? "margin:0;padding:0"
        : "max-width:860px;margin:40px auto;padding:0 24px";
    const char *hbreak = for_print ? "page-break-after:avoid;" : "";
    const char *bbreak = for_print ? "page-break-inside:avoid;" : "";

    char *style = g_strdup_printf(
        "html{background:#fff;color:#1a1a1a}"
        "body{font-family:%s;font-size:%.2gpt;line-height:%.2g;%s;color:#1a1a1a;background:#fff}"
        "p{margin-top:0;margin-bottom:%.2gem}"
        "h1,h2,h3,h4,h5,h6{margin-top:1.0em;margin-bottom:.25em;color:#111;font-weight:600;%s}"
        "h1{font-size:1.8em;border-bottom:2px solid #e0e0e0;padding-bottom:.2em}"
        "h2{font-size:1.4em;border-bottom:1px solid #e0e0e0;padding-bottom:.15em}"
        "h3{font-size:1.15em}"
        "h4,h5,h6{font-size:1em}"
        "code{background:#f0f0f0;padding:.1em .35em;border-radius:3px;"
        "font-family:'Courier New',monospace;font-size:.88em}"
        "pre{background:#f5f5f5;padding:.7em 1em;border-radius:4px;"
        "overflow-x:auto;border:1px solid #e0e0e0;%s}"
        "pre code{background:none;padding:0}"
        "blockquote{border-left:4px solid #ccc;margin:0 0 %.2gem;"
        "padding:.4em .8em;color:#555;background:#fafafa}"
        "table{border-collapse:collapse;width:100%%;margin:%.2gem 0;%s}"
        "th,td{border:1px solid #ddd;padding:.35em .7em;text-align:left}"
        "th{background:#f0f0f0;font-weight:600}"
        "tr:nth-child(even){background:#fafafa}"
        "hr{border:none;border-top:2px solid #e0e0e0;margin:1em 0}"
        "a{color:#0078d4;text-decoration:none}"
        "img{max-width:100%%}"
        "ul,ol{padding-left:1.8em;margin:0 0 %.2gem}"
        "li{margin:.1em 0}",
        s->font_family ? s->font_family : "sans-serif",
        s->font_size_pt, s->line_height, layout,
        s->paragraph_spacing_em, hbreak,
        bbreak,
        s->paragraph_spacing_em, s->paragraph_spacing_em,
        bbreak, s->paragraph_spacing_em);

    char *doc = make_html_doc(body, style);
    g_free(style);
    return doc;
}

/* ── public API ────────────────────────────────────────────────────── */
char *markdown_to_html(const char *markdown, const AppSettings *settings)
{
    char *body    = md_to_html_body(markdown);
    char *numbered = apply_heading_numbering_html(body);
    g_free(body);
    char *doc;
    if (settings)
        doc = make_html_doc_settings(numbered, settings, FALSE);
    else
        doc = make_html_doc(numbered, PREVIEW_STYLE);
    g_free(numbered);
    return doc;
}

char *markdown_to_html_for_pdf(const char *markdown, const AppSettings *settings)
{
    char *body    = md_to_html_body(markdown);
    char *numbered = apply_heading_numbering_html(body);
    g_free(body);
    char *anchored = inject_anchors(numbered);
    g_free(numbered);
    char *doc;
    if (settings)
        doc = make_html_doc_settings(anchored, settings, TRUE);
    else
        doc = make_html_doc(anchored, PREVIEW_STYLE);
    g_free(anchored);
    return doc;
}

char *markdown_to_html_with_anchors(const char *markdown)
{
    char *body    = md_to_html_body(markdown);
    char *anchored = inject_anchors(body);
    g_free(body);
    char *doc = make_html_doc(anchored, PREVIEW_STYLE);
    g_free(anchored);
    return doc;
}

/* ── outline extraction (cmark AST — matches preview heading ids) ───── */
static void free_outline_item(gpointer p)
{
    OutlineItem *item = p;
    g_free(item->text);
    g_free(item);
}

static void collect_heading_text(cmark_node *node, GString *text)
{
    cmark_node_type t = cmark_node_get_type(node);
    if (t == CMARK_NODE_TEXT) {
        const char *lit = cmark_node_get_literal(node);
        if (lit) g_string_append(text, lit);
        return;
    }
    for (cmark_node *c = cmark_node_first_child(node); c; c = cmark_node_next(c))
        collect_heading_text(c, text);
}

static void outline_walk(cmark_node *node, GPtrArray *result, int *idx)
{
    if (cmark_node_get_type(node) == CMARK_NODE_HEADING) {
        GString *text = g_string_new(NULL);
        collect_heading_text(node, text);

        OutlineItem *item = g_new0(OutlineItem, 1);
        item->level = cmark_node_get_heading_level(node);
        item->text  = g_strstrip(g_string_free(text, FALSE));
        {
            int sl = cmark_node_get_start_line(node);
            item->line = sl > 0 ? sl - 1 : 0; /* GtkTextBuffer lines are 0-based */
        }
        item->index = (*idx)++;
        g_ptr_array_add(result, item);
    }

    for (cmark_node *c = cmark_node_first_child(node); c; c = cmark_node_next(c))
        outline_walk(c, result, idx);
}

GPtrArray *markdown_get_outline(const char *markdown)
{
    GPtrArray *result = g_ptr_array_new_with_free_func(free_outline_item);
    if (!markdown || !*markdown) return result;

    int opts = CMARK_OPT_DEFAULT | CMARK_OPT_UNSAFE | CMARK_OPT_SOURCEPOS;
    cmark_node *doc = cmark_parse_document(markdown, strlen(markdown), opts);
    if (!doc) return result;

    int idx = 0;
    outline_walk(doc, result, &idx);
    cmark_node_free(doc);
    return result;
}
