#pragma once
#include "app_settings.h"
#include <glib.h>
#include <gio/gio.h>

gboolean docx_write(const char *markdown, const char *output_path,
                    const AppSettings *settings, GError **error);
