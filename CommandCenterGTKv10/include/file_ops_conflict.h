#ifndef FILE_OPS_CONFLICT_H
#define FILE_OPS_CONFLICT_H

#include <gtk/gtk.h>

typedef enum {
    FILE_OPS_CONFLICT_OVERWRITE,
    FILE_OPS_CONFLICT_SKIP,
    FILE_OPS_CONFLICT_CANCEL
} FileOpsConflictResult;

typedef struct {
    gboolean apply_to_all;
    FileOpsConflictResult apply_all_result;
} FileOpsConflictState;

void file_ops_conflict_reset(FileOpsConflictState *state);

FileOpsConflictResult file_ops_conflict_ask(GtkWindow *parent,
                                            FileOpsConflictState *state,
                                            const char *name,
                                            const char *dest_path,
                                            gboolean dest_is_dir,
                                            gboolean is_move);

#endif
