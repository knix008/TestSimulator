#ifndef INPUT_DIALOG_H
#define INPUT_DIALOG_H

#include <gtk/gtk.h>

gboolean input_dialog_run(GtkWindow *parent,
                          const char *title,
                          const char *label,
                          const char *default_text,
                          char **out_text);

#endif
