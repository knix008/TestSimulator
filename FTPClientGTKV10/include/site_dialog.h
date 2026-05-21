#ifndef SITE_DIALOG_H
#define SITE_DIALOG_H

#include "profile.h"
#include <gtk/gtk.h>

gboolean site_dialog_run_manage(GtkWindow *parent,
                                GList **profiles_io,
                                FtpProfile *apply_out);

gboolean site_dialog_run_edit(GtkWindow *parent,
                             FtpProfile *profile,
                             gboolean is_new);

#endif /* SITE_DIALOG_H */
