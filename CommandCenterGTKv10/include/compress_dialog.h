#ifndef COMPRESS_DIALOG_H
#define COMPRESS_DIALOG_H

#include <gtk/gtk.h>
#include "archive_ops.h"

typedef struct {
    char           *dest_path;  /* full path including extension */
    ArchiveCreateOpts opts;
} CompressDialogResult;

/* Shows the compression options dialog.
   default_name : suggested archive base name (no extension)
   default_dir  : directory where the archive will be saved
   Returns TRUE if the user confirmed, FALSE if cancelled.
   On TRUE, out_result is filled in; caller must call
   compress_dialog_result_free() when done. */
gboolean compress_dialog_run(GtkWindow           *parent,
                             const char          *default_name,
                             const char          *default_dir,
                             CompressDialogResult *out_result);

void compress_dialog_result_free(CompressDialogResult *r);

#endif /* COMPRESS_DIALOG_H */
