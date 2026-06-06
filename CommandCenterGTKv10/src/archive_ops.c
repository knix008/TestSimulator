#include "archive_ops.h"

#include <archive.h>
#include <archive_entry.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <string.h>
#include <errno.h>

/* ------------------------------------------------------------------ */
/* Extension / detection helpers                                        */
/* ------------------------------------------------------------------ */

const char *archive_format_ext(ArchiveFormat fmt) {
    switch (fmt) {
        case ARCHIVE_FORMAT_TAR_GZ:  return ".tar.gz";
        case ARCHIVE_FORMAT_TAR_BZ2: return ".tar.bz2";
        case ARCHIVE_FORMAT_ZIP:     return ".zip";
    }
    return ".tar.gz";
}

static const char * const known_exts[] = {
    ".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz",
    ".tar", ".zip", ".gz", ".bz2", NULL
};

gboolean archive_is_archive(const char *path) {
    for (int i = 0; known_exts[i]; i++) {
        if (g_str_has_suffix(path, known_exts[i]))
            return TRUE;
    }
    return FALSE;
}

/* Returns TRUE when the last component is exactly 3 digits, e.g. ".001" */
gboolean archive_is_split_part(const char *path, char **base_out) {
    const char *dot = strrchr(path, '.');
    if (!dot || dot == path) return FALSE;
    const char *num = dot + 1;
    if (strlen(num) != 3) return FALSE;
    for (int i = 0; i < 3; i++)
        if (!g_ascii_isdigit(num[i])) return FALSE;
    if (base_out)
        *base_out = g_strndup(path, (gsize)(dot - path));
    return TRUE;
}

/* ------------------------------------------------------------------ */
/* Splitting / joining helpers                                          */
/* ------------------------------------------------------------------ */

static gboolean split_archive(const char *path, guint64 part_size, GError **error) {
    FILE *in = fopen(path, "rb");
    if (!in) {
        g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno),
                    "파일을 열 수 없습니다: %s", g_strerror(errno));
        return FALSE;
    }

    char   buf[65536];
    int    part_num = 1;
    guint64 written = 0;
    FILE  *out = NULL;
    gboolean ok = TRUE;

    for (;;) {
        size_t n = fread(buf, 1, sizeof(buf), in);
        if (n == 0) break;

        size_t remaining = n;
        char  *ptr = buf;

        while (remaining > 0) {
            if (!out || written >= part_size) {
                if (out) fclose(out);
                char *pp = g_strdup_printf("%s.%03d", path, part_num++);
                out = fopen(pp, "wb");
                g_free(pp);
                if (!out) {
                    g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno),
                                "분할 파일을 만들 수 없습니다: %s", g_strerror(errno));
                    ok = FALSE;
                    goto done;
                }
                written = 0;
            }
            guint64 can_write = MIN((guint64)remaining, part_size - written);
            if (fwrite(ptr, 1, (size_t)can_write, out) != (size_t)can_write) {
                g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED, "파일 쓰기 실패");
                ok = FALSE;
                goto done;
            }
            ptr       += can_write;
            remaining -= (size_t)can_write;
            written   += can_write;
        }
    }

done:
    if (out) fclose(out);
    fclose(in);
    return ok;
}

/* Returns a newly-allocated path to a temporary file containing all parts,
   or NULL on error. Caller must g_unlink + g_free the returned path. */
static char *join_split_parts(const char *base_path, GError **error) {
    char *tmp_path = g_strdup("/tmp/cc_archive_XXXXXX");
    int tmp_fd = g_mkstemp(tmp_path);
    if (tmp_fd < 0) {
        g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno),
                    "임시 파일 생성 실패: %s", g_strerror(errno));
        g_free(tmp_path);
        return NULL;
    }

    char buf[65536];
    gboolean ok = TRUE;

    for (int part_num = 1; ; part_num++) {
        char *pp = g_strdup_printf("%s.%03d", base_path, part_num);
        gboolean exists = g_file_test(pp, G_FILE_TEST_EXISTS);
        if (!exists) {
            g_free(pp);
            break;
        }
        FILE *in = fopen(pp, "rb");
        g_free(pp);
        if (!in) {
            g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno),
                        "분할 파일을 열 수 없습니다: %s", g_strerror(errno));
            ok = FALSE;
            break;
        }
        size_t n;
        while ((n = fread(buf, 1, sizeof(buf), in)) > 0) {
            if (write(tmp_fd, buf, n) != (ssize_t)n) {
                g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                            "임시 파일 쓰기 실패");
                fclose(in);
                ok = FALSE;
                goto join_done;
            }
        }
        fclose(in);
    }

join_done:
    close(tmp_fd);
    if (!ok) {
        g_unlink(tmp_path);
        g_free(tmp_path);
        return NULL;
    }
    return tmp_path;
}

/* ------------------------------------------------------------------ */
/* Internal: copy data between libarchive objects                       */
/* ------------------------------------------------------------------ */

static int copy_data_a(struct archive *ar, struct archive *aw,
                       GCancellable *cancel) {
    const void *buff;
    size_t      size;
    la_int64_t  offset;
    for (;;) {
        if (cancel && g_cancellable_is_cancelled(cancel))
            return ARCHIVE_FAILED;
        int r = archive_read_data_block(ar, &buff, &size, &offset);
        if (r == ARCHIVE_EOF) return ARCHIVE_OK;
        if (r < ARCHIVE_OK)   return r;
        r = archive_write_data_block(aw, buff, size, offset);
        if (r < ARCHIVE_OK)   return r;
    }
}

/* ------------------------------------------------------------------ */
/* Internal: recursively add one source path to an open archive writer */
/* ------------------------------------------------------------------ */

static gboolean add_path_to_archive(struct archive *a,
                                    const char *src_path,
                                    ArchiveProgressFn progress_cb,
                                    gpointer progress_data,
                                    GCancellable *cancel,
                                    GError **error) {
    char *parent = g_path_get_dirname(src_path);
    size_t plen   = strlen(parent);

    struct archive *disk = archive_read_disk_new();
    archive_read_disk_set_standard_lookup(disk);

    int r = archive_read_disk_open(disk, src_path);
    if (r != ARCHIVE_OK) {
        g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                    "압축 원본을 열 수 없습니다: %s", archive_error_string(disk));
        archive_read_free(disk);
        g_free(parent);
        return FALSE;
    }

    gboolean ok = TRUE;
    struct archive_entry *entry = archive_entry_new();

    for (;;) {
        r = archive_read_next_header2(disk, entry);
        if (r == ARCHIVE_EOF) break;
        if (r < ARCHIVE_OK) {
            if (r == ARCHIVE_WARN) { archive_read_disk_descend(disk); continue; }
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                        "%s", archive_error_string(disk));
            ok = FALSE;
            break;
        }
        archive_read_disk_descend(disk);

        /* Build a path relative to the source's parent directory */
        const char *full = archive_entry_sourcepath(entry);
        const char *rel  = full;
        if (strncmp(full, parent, plen) == 0) {
            rel = full + plen;
            if (*rel == G_DIR_SEPARATOR) rel++;
        }
        if (!rel[0]) rel = g_path_get_basename(src_path);
        archive_entry_set_pathname(entry, rel);

        if (progress_cb)
            progress_cb(archive_entry_sourcepath(entry), progress_data);

        r = archive_write_header(a, entry);
        if (r < ARCHIVE_OK) {
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                        "헤더 쓰기 실패: %s", archive_error_string(a));
            ok = FALSE;
            break;
        }

        if (archive_entry_size(entry) > 0) {
            r = copy_data_a(disk, a, cancel);
            if (r < ARCHIVE_OK) {
                if (cancel && g_cancellable_is_cancelled(cancel)) {
                    g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED,
                                "압축이 취소되었습니다.");
                } else {
                    g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                                "데이터 쓰기 실패: %s", archive_error_string(a));
                }
                ok = FALSE;
                break;
            }
        }
    }

    archive_entry_free(entry);
    archive_read_close(disk);
    archive_read_free(disk);
    g_free(parent);
    return ok;
}

/* ------------------------------------------------------------------ */
/* Public: create archive                                               */
/* ------------------------------------------------------------------ */

gboolean archive_create(GPtrArray *src_paths, const char *dest_base,
                        const ArchiveCreateOpts *opts,
                        ArchiveProgressFn progress_cb, gpointer progress_data,
                        GCancellable *cancel, GError **error) {
    const char *ext  = archive_format_ext(opts->format);
    char       *dest = g_strdup_printf("%s%s", dest_base, ext);

    struct archive *a = archive_write_new();
    switch (opts->format) {
        case ARCHIVE_FORMAT_TAR_GZ:
            archive_write_add_filter_gzip(a);
            archive_write_set_format_pax_restricted(a);
            break;
        case ARCHIVE_FORMAT_TAR_BZ2:
            archive_write_add_filter_bzip2(a);
            archive_write_set_format_pax_restricted(a);
            break;
        case ARCHIVE_FORMAT_ZIP:
            archive_write_add_filter_none(a);
            archive_write_set_format_zip(a);
            break;
    }

    if (archive_write_open_filename(a, dest) != ARCHIVE_OK) {
        g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                    "아카이브 파일을 만들 수 없습니다: %s", archive_error_string(a));
        archive_write_free(a);
        g_free(dest);
        return FALSE;
    }

    gboolean ok = TRUE;
    for (guint i = 0; i < src_paths->len && ok; i++) {
        if (cancel && g_cancellable_is_cancelled(cancel)) {
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED,
                        "압축이 취소되었습니다.");
            ok = FALSE;
            break;
        }
        ok = add_path_to_archive(a, g_ptr_array_index(src_paths, i),
                                 progress_cb, progress_data, cancel, error);
    }

    archive_write_close(a);
    archive_write_free(a);

    if (!ok) {
        g_unlink(dest);
        g_free(dest);
        return FALSE;
    }

    if (opts->split && opts->split_size > 0) {
        GError *serr = NULL;
        if (!split_archive(dest, opts->split_size, &serr)) {
            g_propagate_error(error, serr);
            g_unlink(dest);
            g_free(dest);
            return FALSE;
        }
        g_unlink(dest);
    }

    g_free(dest);
    return TRUE;
}

/* ------------------------------------------------------------------ */
/* Public: extract archive (handles split parts transparently)          */
/* ------------------------------------------------------------------ */

gboolean archive_extract(const char *archive_path, const char *dest_dir,
                         ArchiveProgressFn progress_cb, gpointer progress_data,
                         GCancellable *cancel, GError **error) {
    char    *actual   = NULL;
    gboolean is_split = FALSE;

    char *base = NULL;
    if (archive_is_split_part(archive_path, &base)) {
        is_split   = TRUE;
        actual     = join_split_parts(base, error);
        g_free(base);
        if (!actual) return FALSE;
    } else {
        actual = g_strdup(archive_path);
    }

    struct archive *a = archive_read_new();
    archive_read_support_format_all(a);
    archive_read_support_filter_all(a);

    if (archive_read_open_filename(a, actual, 10240) != ARCHIVE_OK) {
        g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                    "아카이브를 열 수 없습니다: %s", archive_error_string(a));
        archive_read_free(a);
        if (is_split) g_unlink(actual);
        g_free(actual);
        return FALSE;
    }

    struct archive *disk = archive_write_disk_new();
    archive_write_disk_set_options(disk,
        ARCHIVE_EXTRACT_TIME | ARCHIVE_EXTRACT_PERM |
        ARCHIVE_EXTRACT_ACL  | ARCHIVE_EXTRACT_FFLAGS);
    archive_write_disk_set_standard_lookup(disk);

    g_mkdir_with_parents(dest_dir, 0755);

    gboolean ok = TRUE;
    struct archive_entry *entry;

    for (;;) {
        if (cancel && g_cancellable_is_cancelled(cancel)) {
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED,
                        "압축 해제가 취소되었습니다.");
            ok = FALSE;
            break;
        }

        int r = archive_read_next_header(a, &entry);
        if (r == ARCHIVE_EOF) break;
        if (r < ARCHIVE_OK) {
            if (r == ARCHIVE_WARN) continue;
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                        "%s", archive_error_string(a));
            ok = FALSE;
            break;
        }

        const char *pathname = archive_entry_pathname(entry);
        if (progress_cb) progress_cb(pathname, progress_data);

        char *full_path = g_build_filename(dest_dir, pathname, NULL);
        archive_entry_set_pathname(entry, full_path);
        g_free(full_path);

        r = archive_write_header(disk, entry);
        if (r < ARCHIVE_OK && r != ARCHIVE_WARN) {
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                        "헤더 쓰기 실패: %s", archive_error_string(disk));
            ok = FALSE;
            break;
        }

        if (archive_entry_size(entry) > 0) {
            r = copy_data_a(a, disk, cancel);
            if (r < ARCHIVE_OK) {
                if (cancel && g_cancellable_is_cancelled(cancel)) {
                    g_set_error(error, G_IO_ERROR, G_IO_ERROR_CANCELLED,
                                "압축 해제가 취소되었습니다.");
                } else {
                    g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                                "데이터 복사 실패");
                }
                ok = FALSE;
                break;
            }
        }
        archive_write_finish_entry(disk);
    }

    archive_read_close(a);
    archive_read_free(a);
    archive_write_close(disk);
    archive_write_free(disk);

    if (is_split) g_unlink(actual);
    g_free(actual);
    return ok;
}
