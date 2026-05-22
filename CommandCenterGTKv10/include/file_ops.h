#ifndef FILE_OPS_H
#define FILE_OPS_H

#include <glib.h>

typedef void (*FileOpsProgressFn)(const char *filename, gpointer user_data);

gboolean file_ops_copy_files(GPtrArray *sources,
                             const char *dest_dir,
                             FileOpsProgressFn progress,
                             gpointer user_data,
                             GError **error);
gboolean file_ops_move_files(GPtrArray *sources,
                             const char *dest_dir,
                             FileOpsProgressFn progress,
                             gpointer user_data,
                             GError **error);
gboolean file_ops_delete_files(GPtrArray *paths, GError **error);

typedef struct SearchContext SearchContext;

SearchContext *file_ops_search_start(const char *root_path,
                                     const char *pattern,
                                     gboolean search_content,
                                     const char *content_pattern,
                                     void (*progress)(const char *path, gpointer user_data),
                                     void (*finished)(GPtrArray *results, gpointer user_data),
                                     gpointer user_data);
void file_ops_search_cancel(SearchContext *ctx);
void file_ops_search_free(SearchContext *ctx);

#endif
