#include "file_ops.h"

#include <dirent.h>
#include <errno.h>
#include <glib/gstdio.h>
#include <gio/gio.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

struct SearchContext {
    GThread *thread;
    gboolean cancelled;
    gpointer user_data;
    void (*progress)(const char *path, gpointer user_data);
    void (*finished)(GPtrArray *results, gpointer user_data);
};

static gboolean copy_file_path(const char *src, const char *dest, GError **error) {
    GFile *sf = g_file_new_for_path(src);
    GFile *df = g_file_new_for_path(dest);
    gboolean ok = g_file_copy(sf, df, G_FILE_COPY_OVERWRITE, NULL, NULL, NULL, error);
    g_object_unref(sf);
    g_object_unref(df);
    return ok;
}

static gboolean move_file_path(const char *src, const char *dest, GError **error) {
    GFile *sf = g_file_new_for_path(src);
    GFile *df = g_file_new_for_path(dest);
    gboolean ok = g_file_move(sf, df, G_FILE_COPY_OVERWRITE, NULL, NULL, NULL, error);
    g_object_unref(sf);
    g_object_unref(df);
    return ok;
}

static gboolean copy_directory(const char *src, const char *dest,
                               FileOpsProgressFn progress, gpointer user_data,
                               GError **error) {
    if (g_mkdir_with_parents(dest, 0755) != 0 && errno != EEXIST) {
        g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
                    "디렉터리 생성 실패: %s", dest);
        return FALSE;
    }

    GDir *dir = g_dir_open(src, 0, NULL);
    if (!dir) return TRUE;

    const gchar *name;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0) continue;
        char *src_path = g_build_filename(src, name, NULL);
        char *dest_path = g_build_filename(dest, name, NULL);

        if (g_file_test(src_path, G_FILE_TEST_IS_DIR)) {
            if (!copy_directory(src_path, dest_path, progress, user_data, error)) {
                g_free(src_path);
                g_free(dest_path);
                g_dir_close(dir);
                return FALSE;
            }
        } else {
            if (progress) progress(name, user_data);
            if (!copy_file_path(src_path, dest_path, error)) {
                g_free(src_path);
                g_free(dest_path);
                g_dir_close(dir);
                return FALSE;
            }
        }
        g_free(src_path);
        g_free(dest_path);
    }
    g_dir_close(dir);
    return TRUE;
}

gboolean file_ops_copy_files(GPtrArray *sources,
                             const char *dest_dir,
                             FileOpsProgressFn progress,
                             gpointer user_data,
                             GError **error) {
    g_mkdir_with_parents(dest_dir, 0755);

    for (guint i = 0; i < sources->len; i++) {
        const char *src = g_ptr_array_index(sources, i);
        const char *base = g_path_get_basename(src);
        char *dest = g_build_filename(dest_dir, base, NULL);

        if (progress) progress(base, user_data);

        if (g_file_test(src, G_FILE_TEST_IS_DIR)) {
            if (!copy_directory(src, dest, progress, user_data, error)) {
                g_free(dest);
                return FALSE;
            }
        } else {
            if (!copy_file_path(src, dest, error)) {
                g_free(dest);
                return FALSE;
            }
        }
        g_free(dest);
    }
    return TRUE;
}

gboolean file_ops_move_files(GPtrArray *sources,
                             const char *dest_dir,
                             FileOpsProgressFn progress,
                             gpointer user_data,
                             GError **error) {
    g_mkdir_with_parents(dest_dir, 0755);

    for (guint i = 0; i < sources->len; i++) {
        const char *src = g_ptr_array_index(sources, i);
        const char *base = g_path_get_basename(src);
        char *dest = g_build_filename(dest_dir, base, NULL);

        if (progress) progress(base, user_data);

        if (g_file_test(src, G_FILE_TEST_IS_DIR)) {
            if (rename(src, dest) != 0) {
                g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
                            "이동 실패: %s", src);
                g_free(dest);
                return FALSE;
            }
        } else {
            if (!move_file_path(src, dest, error)) {
                g_free(dest);
                return FALSE;
            }
        }
        g_free(dest);
    }
    return TRUE;
}

static gboolean remove_recursive(const char *path, GError **error) {
    if (!g_file_test(path, G_FILE_TEST_IS_DIR))
        return g_remove(path) == 0;

    GDir *dir = g_dir_open(path, 0, error);
    if (!dir) return FALSE;

    const gchar *name;
    gboolean ok = TRUE;
    while ((name = g_dir_read_name(dir)) != NULL) {
        char *child = g_build_filename(path, name, NULL);
        if (!remove_recursive(child, error)) ok = FALSE;
        g_free(child);
        if (!ok) break;
    }
    g_dir_close(dir);
    if (!ok) return FALSE;
    return g_rmdir(path) == 0;
}

gboolean file_ops_delete_files(GPtrArray *paths, GError **error) {
    for (guint i = 0; i < paths->len; i++) {
        const char *path = g_ptr_array_index(paths, i);
        if (!remove_recursive(path, error)) return FALSE;
    }
    return TRUE;
}

static gboolean str_contains_ci(const char *haystack, const char *needle) {
    if (!needle || !*needle) return TRUE;
    char *h = g_ascii_strdown(haystack, -1);
    char *n = g_ascii_strdown(needle, -1);
    gboolean found = strstr(h, n) != NULL;
    g_free(h);
    g_free(n);
    return found;
}

static void search_recursive(const char *dir,
                             const char *pattern,
                             gboolean search_content,
                             const char *content_pattern,
                             GPtrArray *results,
                             SearchContext *ctx) {
    if (ctx->cancelled) return;

    GDir *d = g_dir_open(dir, 0, NULL);
    if (!d) return;

    const gchar *name;
    while ((name = g_dir_read_name(d)) != NULL) {
        if (ctx->cancelled) break;
        if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0) continue;

        char *full = g_build_filename(dir, name, NULL);

        if (g_file_test(full, G_FILE_TEST_IS_DIR)) {
            search_recursive(full, pattern, search_content, content_pattern, results, ctx);
        } else {
            if (g_pattern_match_simple(pattern, name)) {
                gboolean add = TRUE;
                if (search_content && content_pattern && *content_pattern) {
                    gchar *contents = NULL;
                    gsize len = 0;
                    add = FALSE;
                    if (g_file_get_contents(full, &contents, &len, NULL))
                        add = str_contains_ci(contents, content_pattern);
                    g_free(contents);
                }
                if (add) {
                    g_ptr_array_add(results, g_strdup(full));
                    if (ctx->progress) ctx->progress(full, ctx->user_data);
                }
            }
        }
        g_free(full);
    }
    g_dir_close(d);
}

typedef struct {
    SearchContext *ctx;
    char *root;
    char *pattern;
    gboolean search_content;
    char *content_pattern;
} SearchArgs;

typedef struct {
    SearchContext *ctx;
    GPtrArray *results;
} SearchFinishedData;

static gboolean search_finished_idle(gpointer data) {
    SearchFinishedData *fd = data;
    if (!fd->ctx->cancelled && fd->ctx->finished)
        fd->ctx->finished(fd->results, fd->ctx->user_data);
    else
        g_ptr_array_free(fd->results, TRUE);
    g_free(fd);
    return G_SOURCE_REMOVE;
}

static gpointer search_thread_real(gpointer data) {
    SearchArgs *args = data;
    GPtrArray *results = g_ptr_array_new_with_free_func(g_free);
    search_recursive(args->root, args->pattern,
                     args->search_content, args->content_pattern,
                     results, args->ctx);

    if (!args->ctx->cancelled) {
        SearchFinishedData *fd = g_new0(SearchFinishedData, 1);
        fd->ctx = args->ctx;
        fd->results = results;
        g_idle_add(search_finished_idle, fd);
    } else {
        g_ptr_array_free(results, TRUE);
    }

    g_free(args->root);
    g_free(args->pattern);
    g_free(args->content_pattern);
    g_free(args);
    return NULL;
}

SearchContext *file_ops_search_start(const char *root_path,
                                     const char *pattern,
                                     gboolean search_content,
                                     const char *content_pattern,
                                     void (*progress)(const char *path, gpointer user_data),
                                     void (*finished)(GPtrArray *results, gpointer user_data),
                                     gpointer user_data) {
    SearchContext *ctx = g_new0(SearchContext, 1);
    ctx->progress = progress;
    ctx->finished = finished;
    ctx->user_data = user_data;
    ctx->cancelled = FALSE;

    SearchArgs *args = g_new0(SearchArgs, 1);
    args->ctx = ctx;
    args->root = g_strdup(root_path);
    args->pattern = g_strdup(pattern && *pattern ? pattern : "*");
    args->search_content = search_content;
    args->content_pattern = g_strdup(content_pattern ? content_pattern : "");

    ctx->thread = g_thread_new("file-search", search_thread_real, args);
    return ctx;
}

void file_ops_search_cancel(SearchContext *ctx) {
    if (!ctx) return;
    ctx->cancelled = TRUE;
}

void file_ops_search_free(SearchContext *ctx) {
    if (!ctx) return;
    ctx->cancelled = TRUE;
    if (ctx->thread) g_thread_join(ctx->thread);
    g_free(ctx);
}
