/**
 * EasyMD GTK
 * preview.h - Markdown -> HTML rendering using libcmark, displayed in WebKit2.
 */
#ifndef EASYMD_PREVIEW_H
#define EASYMD_PREVIEW_H

#include <gtk/gtk.h>
#include <webkit2/webkit2.h>

/* One-time setup (loads an empty document). */
void preview_init(WebKitWebView *view);

/* Render `markdown` to HTML and load it into the WebView.
 * `base_uri` (may be NULL) is used to resolve relative image paths. */
void preview_update(WebKitWebView *view,
                    const char    *markdown,
                    const char    *base_uri);

#endif /* EASYMD_PREVIEW_H */
