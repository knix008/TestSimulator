#pragma once

#include <gtk/gtk.h>
#include "app_settings.h"

/* Show a document-view window.
   content   – merged markdown text (owned by caller)
   file_path – path for the title / save dialog, or NULL for preview-only
   settings  – PDF/export settings (may be NULL) */
void document_view_show(GtkWindow      *parent,
                        const char     *content,
                        const char     *file_path,
                        AppSettings    *settings);
