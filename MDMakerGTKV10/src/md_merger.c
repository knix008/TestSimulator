#include "md_merger.h"

#include <string.h>
#include <sys/stat.h>

/* ── glob matching ─────────────────────────────────────────────────── */
static gboolean glob_match(const char *text, const char *pattern)
{
    if (*pattern == '\0') return *text == '\0';
    if (*pattern == '*') {
        if (glob_match(text, pattern + 1)) return TRUE;
        return *text != '\0' && glob_match(text + 1, pattern);
    }
    if (*pattern == '?' && *text != '\0')
        return glob_match(text + 1, pattern + 1);
    if (g_ascii_toupper(*pattern) == g_ascii_toupper(*text))
        return glob_match(text + 1, pattern + 1);
    return FALSE;
}

static gboolean is_excluded(const char *full_path,
                             const char *base_dir,
                             char      **patterns,
                             int         n_patterns)
{
    if (n_patterns == 0) return FALSE;

    char *rel = NULL;
    if (g_str_has_prefix(full_path, base_dir))
        rel = g_strdup(full_path + strlen(base_dir) + (full_path[strlen(base_dir)] == G_DIR_SEPARATOR ? 1 : 0));
    else
        rel = g_strdup(full_path);

    /* split by directory separator and test each segment */
    char **segments = g_strsplit_set(rel, "/\\", -1);
    g_free(rel);

    gboolean excluded = FALSE;
    for (int s = 0; segments[s] != NULL && !excluded; s++) {
        for (int p = 0; p < n_patterns && !excluded; p++) {
            const char *pat = patterns[p];
            if (pat && *pat && glob_match(segments[s], pat))
                excluded = TRUE;
        }
    }
    g_strfreev(segments);
    return excluded;
}

/* ── sorting helpers ───────────────────────────────────────────────── */
static int cmp_name_asc(gconstpointer a, gconstpointer b)
{
    return g_ascii_strcasecmp(*(const char *const *)a, *(const char *const *)b);
}
static int cmp_name_desc(gconstpointer a, gconstpointer b)
{
    return -cmp_name_asc(a, b);
}

static time_t mtime_of(const char *path)
{
    struct stat st;
    return (stat(path, &st) == 0) ? st.st_mtime : 0;
}
static int cmp_date_newest(gconstpointer a, gconstpointer b)
{
    time_t ta = mtime_of(*(const char *const *)a);
    time_t tb = mtime_of(*(const char *const *)b);
    return (ta > tb) ? -1 : (ta < tb) ? 1 : 0;
}
static int cmp_date_oldest(gconstpointer a, gconstpointer b)
{
    return -cmp_date_newest(a, b);
}

/* ── public API ────────────────────────────────────────────────────── */
GPtrArray *md_merger_get_files(const MergeOptions *opts)
{
    GPtrArray *arr = g_ptr_array_new_with_free_func(g_free);
    if (!opts->source_directory || !g_file_test(opts->source_directory, G_FILE_TEST_IS_DIR))
        return arr;

    GQueue *dirs = g_queue_new();
    g_queue_push_tail(dirs, g_strdup(opts->source_directory));

    while (!g_queue_is_empty(dirs)) {
        char *dir = g_queue_pop_head(dirs);
        GDir *d = g_dir_open(dir, 0, NULL);
        if (d) {
            const char *name;
            while ((name = g_dir_read_name(d)) != NULL) {
                char *full = g_build_filename(dir, name, NULL);
                if (g_file_test(full, G_FILE_TEST_IS_DIR)) {
                    if (opts->recursive)
                        g_queue_push_tail(dirs, g_strdup(full));
                    g_free(full);
                } else if (g_str_has_suffix(name, ".md") || g_str_has_suffix(name, ".MD")) {
                    if (!is_excluded(full, opts->source_directory,
                                     opts->exclude_patterns, opts->n_exclude_patterns))
                        g_ptr_array_add(arr, full);
                    else
                        g_free(full);
                } else {
                    g_free(full);
                }
            }
            g_dir_close(d);
        }
        g_free(dir);
    }
    g_queue_free(dirs);

    if (opts->sort_order == SORT_NAME_ASC)
        g_ptr_array_sort(arr, cmp_name_asc);
    else if (opts->sort_order == SORT_NAME_DESC)
        g_ptr_array_sort(arr, cmp_name_desc);
    else if (opts->sort_order == SORT_DATE_NEWEST)
        g_ptr_array_sort(arr, cmp_date_newest);
    else if (opts->sort_order == SORT_DATE_OLDEST)
        g_ptr_array_sort(arr, cmp_date_oldest);
    /* SORT_CUSTOM: no sort */

    return arr;
}

char *md_merger_merge(GPtrArray *files, const MergeOptions *opts)
{
    GString *sb = g_string_new(NULL);

    for (guint i = 0; i < files->len; i++) {
        const char *fpath = g_ptr_array_index(files, i);

        if (opts->insert_header) {
            const char *base = opts->source_directory;
            const char *rel  = fpath;
            if (base && g_str_has_prefix(fpath, base))
                rel = fpath + strlen(base) + (fpath[strlen(base)] == G_DIR_SEPARATOR ? 1 : 0);
            g_string_append_printf(sb, "## %s\n\n", rel);
        }

        char *content = NULL;
        gsize flen = 0;
        if (g_file_get_contents(fpath, &content, &flen, NULL)) {
            const char *text = content;
            gsize len = flen;

            /* strip UTF-8 BOM (EF BB BF) */
            if (len >= 3
                && (guchar)text[0] == 0xEF
                && (guchar)text[1] == 0xBB
                && (guchar)text[2] == 0xBF) {
                text += 3;
                len  -= 3;
            }

            /* ensure valid UTF-8; replace bad bytes with U+FFFD */
            char *safe = NULL;
            if (!g_utf8_validate(text, (gssize)len, NULL)) {
                safe = g_utf8_make_valid(text, (gssize)len);
                text = safe;
                len  = strlen(safe);
            }

            /* TrimEnd */
            while (len > 0 && (text[len-1] == '\n' || text[len-1] == '\r'
                                || text[len-1] == ' '  || text[len-1] == '\t'))
                len--;
            g_string_append_len(sb, text, (gssize)len);
            g_free(safe);
            g_free(content);
        }
        g_string_append_c(sb, '\n');

        if (i < files->len - 1)
            g_string_append(sb, "\n---\n\n");
    }

    return g_string_free(sb, FALSE);
}
