/**
 * EasyMD GTK
 * preview.c - WebKit2 adapter. All markdown -> HTML logic lives in mdcore.
 *
 * This file is intentionally tiny: it forwards content from mdcore into the
 * WebKitWebView and configures display-time settings (JS off, font size, etc.).
 */
#include "preview.h"

#include "mdcore.h"
#include "utils.h"

/* Return TRUE if `trimmed` is an ATX heading line (#..###### + space-or-EOL). */
static gboolean is_atx_heading_line(const char *trimmed) {
    int level = 0;
    while (*trimmed == '#' && level < 6) {
        trimmed++;
        level++;
    }
    if (level == 0) return FALSE;
    return (*trimmed == ' ' || *trimmed == '\t' || *trimmed == '\0');
}

/* Inject stable anchors before heading lines so outline navigation can scroll
 * the preview to the exact document section. */
static gchar *inject_heading_anchors(const char *markdown) {
    if (!markdown || !*markdown) return g_strdup("");

    GString *out = g_string_new(NULL);
    gboolean in_fence = FALSE;
    int line_no = 0;

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
        } else if (!in_fence && is_atx_heading_line(trim)) {
            g_string_append_printf(out, "<a id=\"easymd-line-%d\"></a>\n", line_no);
        }

        g_string_append_len(out, line, (gssize)len);
        if (eol) g_string_append_c(out, '\n');

        g_free(line);
        if (!eol) break;
        p = eol + 1;
    }
    return g_string_free(out, FALSE);
}

void preview_init(WebKitWebView *view) {
    g_return_if_fail(view);
    WebKitSettings *s = webkit_web_view_get_settings(view);
    /* Needed for programmatic scroll-to-anchor on outline navigation. */
    webkit_settings_set_enable_javascript(s, TRUE);
    webkit_settings_set_enable_developer_extras(s, FALSE);
    webkit_settings_set_default_font_size(s, 14);
    /* Empty placeholder so the widget paints. */
    webkit_web_view_load_html(view,
        "<html><body style='font-family:sans-serif;color:#888;padding:24px;'>"
        "<em>편집기 내용이 여기에 미리보기로 표시됩니다.</em>"
        "</body></html>", "about:blank");
}

void preview_update(WebKitWebView *view,
                    const char    *markdown,
                    const char    *base_uri) {
    g_return_if_fail(view);

    gchar *anchored_md = inject_heading_anchors(markdown);
    char  *body = mdcore_to_html(anchored_md);
    if (!body) {
        utils_log_warn("mdcore_to_html returned NULL");
        body = g_strdup("");
    }

    gchar *full = mdcore_html_document(body);
    webkit_web_view_load_html(view, full, base_uri);

    g_free(full);
    g_free(anchored_md);
    free(body);
}

void preview_scroll_to_line(WebKitWebView *view, int line_1based) {
    g_return_if_fail(view);
    if (line_1based <= 0) return;

    gchar *js = g_strdup_printf(
        "(function(){"
        "var id='easymd-line-%d';"
        "var el=document.getElementById(id);"
        "if(el){el.scrollIntoView({behavior:'auto',block:'start'});}"
        "})();",
        line_1based);
    webkit_web_view_evaluate_javascript(view,
                                        js,
                                        -1,
                                        NULL,
                                        NULL,
                                        NULL,
                                        NULL,
                                        NULL);
    g_free(js);
}
