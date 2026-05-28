#pragma once

#include <glib.h>

typedef enum {
    SORT_NAME_ASC = 0,
    SORT_NAME_DESC,
    SORT_DATE_NEWEST,
    SORT_DATE_OLDEST,
    SORT_CUSTOM
} FileSortOrder;

typedef struct {
    char          *source_directory;
    gboolean       recursive;
    FileSortOrder  sort_order;
    gboolean       insert_header;
    char         **exclude_patterns;
    int            n_exclude_patterns;
    char          *output_file;
} MergeOptions;

/* Returns a newly-allocated GPtrArray of char* file paths; free with g_ptr_array_unref(). */
GPtrArray *md_merger_get_files(const MergeOptions *opts);

/* Returns a newly-allocated string containing the merged markdown; g_free() when done. */
char      *md_merger_merge(GPtrArray *files, const MergeOptions *opts);
