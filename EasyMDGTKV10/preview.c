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

void preview_init(WebKitWebView *view) {
    g_return_if_fail(view);
    WebKitSettings *s = webkit_web_view_get_settings(view);
    webkit_settings_set_enable_javascript(s, FALSE);
    webkit_settings_set_enable_developer_extras(s, FALSE);
    webkit_settings_set_default_font_size(s, 14);
    /* Empty placeholder so the widget paints. */
    webkit_web_view_load_html(view,
        "<html><body style='font-family:sans-serif;color:#888;padding:24px;'>"
        "<em>편집기 내용이 여기에 미리보기로 표시됩니다.</em>"
        "</body></html>", NULL);
}

void preview_update(WebKitWebView *view,
                    const char    *markdown,
                    const char    *base_uri) {
    g_return_if_fail(view);

    char  *body = mdcore_to_html(markdown);
    if (!body) {
        utils_log_warn("mdcore_to_html returned NULL");
        body = g_strdup("");
    }

    gchar *full = mdcore_html_document(body);
    webkit_web_view_load_html(view, full, base_uri);

    g_free(full);
    free(body);
}
