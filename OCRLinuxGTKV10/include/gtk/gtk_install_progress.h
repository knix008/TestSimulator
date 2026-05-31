#ifndef GTK_INSTALL_PROGRESS_H
#define GTK_INSTALL_PROGRESS_H

#include <gtk/gtk.h>
#include "app/ocr_app.h"

gboolean gtk_install_progress_prepare_engine(GtkWindow *parent, OcrApp *app, GError **error);

#endif
