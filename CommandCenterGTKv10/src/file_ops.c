#include "file_ops.h"

#include "file_ops_conflict.h"

#include <dirent.h>
#include <errno.h>
#include <glib/gstdio.h>
#include <gio/gio.h>
#include <limits.h>
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

static char *real_path_or_dup(const char *path) {
    char resolved[PATH_MAX];
    if (realpath(path, resolved))
        return g_strdup(resolved);
    return g_strdup(path);
}

static gboolean path_is_ancestor_of(const char *ancestor, const char *path) {
    char *a = real_path_or_dup(ancestor);
    char *p = real_path_or_dup(path);
    size_t alen = strlen(a);
    gboolean inside = g_str_has_prefix(p, a) &&
                      (p[alen] == '/' || p[alen] == '\0');
    g_free(a);
    g_free(p);
    return inside;
}

typedef struct {
    FileOpsProgressFn fn;
    gpointer user_data;
} FileOpsProgressCtx;

static void report_progress(FileOpsProgressCtx *ctx, const char *path) {
    if (ctx && ctx->fn)
        ctx->fn(path, ctx->user_data);
}

static guint64 count_entry_recursive(const char *path) {
    if (!g_file_test(path, G_FILE_TEST_IS_DIR))
        return 1;

    guint64 n = 0;
    GDir *dir = g_dir_open(path, 0, NULL);
    if (!dir)
        return 1;

    const gchar *name;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0)
            continue;
        char *child = g_build_filename(path, name, NULL);
        n += count_entry_recursive(child);
        g_free(child);
    }
    g_dir_close(dir);
    return n > 0 ? n : 1;
}

guint64 file_ops_count_items(GPtrArray *paths) {
    guint64 total = 0;
    if (!paths)
        return 1;
    for (guint i = 0; i < paths->len; i++)
        total += count_entry_recursive(g_ptr_array_index(paths, i));
    return total > 0 ? total : 1;
}

static gboolean copy_entry(const char *src, const char *dest,
                           GtkWindow *parent, FileOpsConflictState *conflict_state,
                           gboolean is_move, FileOpsProgressCtx *progress,
                           gboolean *skipped, GError **error);
static gboolean remove_recursive(const char *path, FileOpsProgressCtx *progress,
                                 GError **error);
static gboolean remove_dest_if_exists(const char *dest, GError **error);

static gboolean copy_file(const char *src, const char *dest, gboolean overwrite,
                          GError **error) {
    GFile *sf = g_file_new_for_path(src);
    GFile *df = g_file_new_for_path(dest);
    GFileCopyFlags flags = G_FILE_COPY_NOFOLLOW_SYMLINKS;
    if (overwrite)
        flags |= G_FILE_COPY_OVERWRITE;
    gboolean ok = g_file_copy(sf, df, flags, NULL, NULL, NULL, error);
    g_object_unref(sf);
    g_object_unref(df);
    return ok;
}

static gboolean remove_dest_if_exists(const char *dest, GError **error) {
    if (!g_file_test(dest, G_FILE_TEST_EXISTS))
        return TRUE;
    if (g_file_test(dest, G_FILE_TEST_IS_DIR))
        return remove_recursive(dest, NULL, error);
    if (g_remove(dest) != 0 && errno != ENOENT) {
        g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
                    "기존 파일 삭제 실패: %s", dest);
        return FALSE;
    }
    return TRUE;
}

static gboolean handle_dest_conflict(const char *name, const char *dest,
                                     gboolean is_move,
                                     GtkWindow *parent,
                                     FileOpsConflictState *conflict_state,
                                     gboolean *skipped, GError **error) {
    *skipped = FALSE;
    if (!g_file_test(dest, G_FILE_TEST_EXISTS))
        return TRUE;

    gboolean dest_is_dir = g_file_test(dest, G_FILE_TEST_IS_DIR);

    if (!parent) {
        if (!remove_dest_if_exists(dest, error))
            return FALSE;
        return TRUE;
    }

    FileOpsConflictResult choice = file_ops_conflict_ask_thread_safe(
        parent, conflict_state, name, dest, dest_is_dir, is_move);

    switch (choice) {
    case FILE_OPS_CONFLICT_SKIP:
        *skipped = TRUE;
        return TRUE;
    case FILE_OPS_CONFLICT_CANCEL:
        g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED,
                    "작업이 취소되었습니다.");
        return FALSE;
    case FILE_OPS_CONFLICT_OVERWRITE:
        if (!remove_dest_if_exists(dest, error))
            return FALSE;
        return TRUE;
    default:
        return FALSE;
    }
}

static gboolean copy_directory_recursive(const char *src, const char *dest,
                                         GtkWindow *parent,
                                         FileOpsConflictState *conflict_state,
                                         gboolean is_move,
                                         FileOpsProgressCtx *progress,
                                         GError **error) {
    report_progress(progress, src);

    if (g_mkdir_with_parents(dest, 0755) != 0 && errno != EEXIST) {
        g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
                    "디렉터리 생성 실패: %s", dest);
        return FALSE;
    }

    GDir *dir = g_dir_open(src, 0, error);
    if (!dir)
        return FALSE;

    const gchar *name;
    gboolean ok = TRUE;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0)
            continue;
        char *src_child = g_build_filename(src, name, NULL);
        char *dest_child = g_build_filename(dest, name, NULL);
        gboolean child_skipped = FALSE;
        if (!copy_entry(src_child, dest_child, parent, conflict_state, is_move,
                        progress, &child_skipped, error)) {
            ok = FALSE;
            g_free(src_child);
            g_free(dest_child);
            break;
        }
        g_free(src_child);
        g_free(dest_child);
    }
    g_dir_close(dir);
    return ok;
}

static gboolean copy_entry(const char *src, const char *dest,
                           GtkWindow *parent, FileOpsConflictState *conflict_state,
                           gboolean is_move, FileOpsProgressCtx *progress,
                           gboolean *skipped, GError **error) {
    const char *name = g_path_get_basename(dest);
    gboolean dest_exists = g_file_test(dest, G_FILE_TEST_EXISTS);

    if (!handle_dest_conflict(name, dest, is_move, parent, conflict_state,
                              skipped, error))
        return FALSE;
    if (*skipped)
        return TRUE;

    gboolean overwrite = dest_exists;

    if (g_file_test(src, G_FILE_TEST_IS_DIR))
        return copy_directory_recursive(src, dest, parent, conflict_state,
                                        is_move, progress, error);

    report_progress(progress, src);
    char *parent_dir = g_path_get_dirname(dest);
    g_mkdir_with_parents(parent_dir, 0755);
    g_free(parent_dir);
    return copy_file(src, dest, overwrite, error);
}

static gboolean move_entry(const char *src, const char *dest,
                           GtkWindow *parent, FileOpsConflictState *conflict_state,
                           FileOpsProgressCtx *progress,
                           gboolean *skipped, GError **error) {
    const char *name = g_path_get_basename(dest);

    if (!handle_dest_conflict(name, dest, TRUE, parent, conflict_state,
                              skipped, error))
        return FALSE;
    if (*skipped)
        return TRUE;

    GFile *sf = g_file_new_for_path(src);
    GFile *df = g_file_new_for_path(dest);

    gboolean ok = g_file_move(sf, df, G_FILE_COPY_NOFOLLOW_SYMLINKS,
                              NULL, NULL, NULL, error);
    g_object_unref(sf);
    g_object_unref(df);

    if (!ok) {
        g_clear_error(error);
        gboolean copy_skipped = FALSE;
        if (!copy_entry(src, dest, parent, conflict_state, TRUE, progress,
                        &copy_skipped, error))
            return FALSE;
        if (copy_skipped)
            *skipped = TRUE;
        else if (!remove_recursive(src, progress, error))
            return FALSE;
        ok = TRUE;
    } else {
        report_progress(progress, src);
    }
    return ok;
}

static gboolean invalid_copy_move_target(const char *src, const char *dest,
                                        const char *dest_dir, const char *name,
                                        GError **error) {
    if (g_strcmp0(src, dest) == 0) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL,
                    "원본과 대상 경로가 같습니다: %s", name);
        return TRUE;
    }
    if (path_is_ancestor_of(src, dest) || path_is_ancestor_of(src, dest_dir)) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL,
                    "폴더를 자기 자신 안으로 복사/이동할 수 없습니다: %s", name);
        return TRUE;
    }
    return FALSE;
}

static gboolean transfer_sources(GPtrArray *sources, const char *dest_dir,
                                 gboolean is_move, GtkWindow *parent,
                                 FileOpsConflictState *conflict_state,
                                 FileOpsProgressFn progress_fn,
                                 gpointer progress_data,
                                 FileOpsTransferStats *stats, GError **error) {
    FileOpsProgressCtx progress = { progress_fn, progress_data };
    if (!sources || sources->len == 0) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL,
                    is_move ? "이동할 항목이 없습니다." : "복사할 항목이 없습니다.");
        return FALSE;
    }
    if (!dest_dir || !*dest_dir) {
        g_set_error(error, G_FILE_ERROR, G_FILE_ERROR_INVAL,
                    "대상 폴더가 지정되지 않았습니다.");
        return FALSE;
    }

    if (stats) {
        stats->copied = 0;
        stats->skipped = 0;
        stats->failed = 0;
    }

    g_mkdir_with_parents(dest_dir, 0755);

    for (guint i = 0; i < sources->len; i++) {
        const char *src = g_ptr_array_index(sources, i);
        const char *base = g_path_get_basename(src);
        char *dest = g_build_filename(dest_dir, base, NULL);

        if (invalid_copy_move_target(src, dest, dest_dir, base, error)) {
            g_free(dest);
            if (stats)
                stats->failed++;
            return FALSE;
        }

        gboolean skipped = FALSE;
        gboolean ok = is_move
                            ? move_entry(src, dest, parent, conflict_state,
                                         &progress, &skipped, error)
                            : copy_entry(src, dest, parent, conflict_state, FALSE,
                                         &progress, &skipped, error);

        if (!ok) {
            g_free(dest);
            if (stats)
                stats->failed++;
            return FALSE;
        }

        if (stats) {
            if (skipped)
                stats->skipped++;
            else
                stats->copied++;
        }
        g_free(dest);
    }
    return TRUE;
}

gboolean file_ops_copy_files(GPtrArray *sources,
                             const char *dest_dir,
                             GtkWindow *parent,
                             FileOpsConflictState *conflict_state,
                             FileOpsProgressFn progress,
                             gpointer user_data,
                             FileOpsTransferStats *stats,
                             GError **error) {
    return transfer_sources(sources, dest_dir, FALSE, parent, conflict_state,
                            progress, user_data, stats, error);
}

gboolean file_ops_move_files(GPtrArray *sources,
                             const char *dest_dir,
                             GtkWindow *parent,
                             FileOpsConflictState *conflict_state,
                             FileOpsProgressFn progress,
                             gpointer user_data,
                             FileOpsTransferStats *stats,
                             GError **error) {
    return transfer_sources(sources, dest_dir, TRUE, parent, conflict_state,
                            progress, user_data, stats, error);
}

static gboolean remove_recursive(const char *path, FileOpsProgressCtx *progress,
                                 GError **error) {
    if (!g_file_test(path, G_FILE_TEST_IS_DIR)) {
        report_progress(progress, path);
        if (g_remove(path) != 0 && errno != ENOENT) {
            g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
                        "파일 삭제 실패: %s", path);
            return FALSE;
        }
        return TRUE;
    }

    GDir *dir = g_dir_open(path, 0, error);
    if (!dir)
        return FALSE;

    const gchar *name;
    gboolean ok = TRUE;
    gboolean any_child = FALSE;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0)
            continue;
        any_child = TRUE;
        char *child = g_build_filename(path, name, NULL);
        if (!remove_recursive(child, progress, error))
            ok = FALSE;
        g_free(child);
        if (!ok)
            break;
    }
    g_dir_close(dir);
    if (!ok)
        return FALSE;
    if (!any_child)
        report_progress(progress, path);
    if (g_rmdir(path) != 0 && errno != ENOENT) {
        g_set_error(error, G_FILE_ERROR, g_file_error_from_errno(errno),
                    "폴더 삭제 실패: %s", path);
        return FALSE;
    }
    return TRUE;
}

gboolean file_ops_delete_files(GPtrArray *paths,
                               FileOpsProgressFn progress_fn,
                               gpointer progress_data,
                               GError **error) {
    FileOpsProgressCtx progress = { progress_fn, progress_data };
    for (guint i = 0; i < paths->len; i++) {
        const char *path = g_ptr_array_index(paths, i);
        if (!remove_recursive(path, &progress, error))
            return FALSE;
    }
    return TRUE;
}

static gboolean str_contains_ci(const char *haystack, const char *needle) {
    if (!needle || !*needle)
        return TRUE;
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
    if (ctx->cancelled)
        return;

    GDir *d = g_dir_open(dir, 0, NULL);
    if (!d)
        return;

    const gchar *name;
    while ((name = g_dir_read_name(d)) != NULL) {
        if (ctx->cancelled)
            break;
        if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0)
            continue;

        char *full = g_build_filename(dir, name, NULL);

        if (g_file_test(full, G_FILE_TEST_IS_DIR)) {
            search_recursive(full, pattern, search_content, content_pattern,
                             results, ctx);
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
                    if (ctx->progress)
                        ctx->progress(full, ctx->user_data);
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
                                     void (*progress)(const char *path,
                                                      gpointer user_data),
                                     void (*finished)(GPtrArray *results,
                                                      gpointer user_data),
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
    if (!ctx)
        return;
    ctx->cancelled = TRUE;
}

void file_ops_search_free(SearchContext *ctx) {
    if (!ctx)
        return;
    ctx->cancelled = TRUE;
    if (ctx->thread)
        g_thread_join(ctx->thread);
    g_free(ctx);
}
