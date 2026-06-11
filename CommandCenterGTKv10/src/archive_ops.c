#include "archive_ops.h"

#include <glib/gstdio.h>
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
        case CC_ARCHIVE_FMT_TAR_GZ:  return ".tar.gz";
        case CC_ARCHIVE_FMT_TAR_BZ2: return ".tar.bz2";
        case CC_ARCHIVE_FMT_ZIP:     return ".zip";
    }
    return ".tar.gz";
}

/* Split naming: ZIP → 7-Zip style (.zip + .z01/.z02/...); tar → .tgz/.tbz2 + .001/.002 */
const char *archive_format_ext_split(ArchiveFormat fmt) {
    switch (fmt) {
        case CC_ARCHIVE_FMT_TAR_GZ:  return ".tgz";
        case CC_ARCHIVE_FMT_TAR_BZ2: return ".tbz2";
        case CC_ARCHIVE_FMT_ZIP:     return ".zip";
    }
    return ".tgz";
}

const char *archive_format_ext_for(const ArchiveCreateOpts *opts) {
    if (opts && opts->split && opts->split_size > 0)
        return archive_format_ext_split(opts->format);
    return archive_format_ext(opts ? opts->format : CC_ARCHIVE_FMT_TAR_GZ);
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

static gboolean split_suffix_is_gnu(const char *suffix) {
    return suffix[0] && suffix[1] &&
           g_ascii_islower(suffix[0]) && g_ascii_islower(suffix[1]) &&
           suffix[2] == '\0';
}

static gboolean split_suffix_is_legacy_numeric(const char *suffix) {
    if (strlen(suffix) != 3)
        return FALSE;
    for (int i = 0; i < 3; i++)
        if (!g_ascii_isdigit(suffix[i]))
            return FALSE;
    return TRUE;
}

/* 7-Zip spanned ZIP volumes: .z01, .z02, ... */
static gboolean split_suffix_is_zip_volume(const char *suffix) {
    if (!suffix[0] || suffix[0] != 'z')
        return FALSE;
    for (const char *p = suffix + 1; *p; p++) {
        if (!g_ascii_isdigit(*p))
            return FALSE;
    }
    return suffix[1] != '\0';
}

static gboolean path_has_archive_ext(const char *path) {
    for (int i = 0; known_exts[i]; i++) {
        if (g_str_has_suffix(path, known_exts[i]))
            return TRUE;
    }
    return FALSE;
}

/* Volume suffix: .z01/.001/.aa — not the first .zip/.tgz segment */
gboolean archive_is_split_part(const char *path, char **base_out) {
    const char *dot = strrchr(path, '.');
    if (!dot || dot == path)
        return FALSE;
    const char *suffix = dot + 1;
    if (!split_suffix_is_zip_volume(suffix) &&
        !split_suffix_is_gnu(suffix) &&
        !split_suffix_is_legacy_numeric(suffix))
        return FALSE;
    if (split_suffix_is_legacy_numeric(suffix) && !path_has_archive_ext(path))
        return FALSE;
    if (base_out)
        *base_out = g_strndup(path, (gsize)(dot - path));
    return TRUE;
}

static gboolean split_zip_set_exists(const char *base) {
    char *z01 = g_strdup_printf("%s.z01", base);
    gboolean has = g_file_test(z01, G_FILE_TEST_EXISTS);
    g_free(z01);
    return has;
}

static gboolean split_tar_set_exists(const char *path) {
    char *p001 = g_strdup_printf("%s.001", path);
    gboolean has = g_file_test(p001, G_FILE_TEST_EXISTS);
    g_free(p001);
    return has;
}

static gboolean split_gnu_set_exists(const char *path) {
    char *paa = g_strdup_printf("%s.aa", path);
    gboolean has = g_file_test(paa, G_FILE_TEST_EXISTS);
    g_free(paa);
    return has;
}

/* First segment (.zip/.tgz) or later volume (.z01/.001/.aa) */
gboolean archive_split_detect(const char *path, char **base_out) {
    if (archive_is_split_part(path, base_out))
        return TRUE;

    if (g_str_has_suffix(path, ".zip")) {
        gsize len = strlen(path) - 4;
        char *base = g_strndup(path, len);
        if (split_zip_set_exists(base)) {
            if (base_out)
                *base_out = base;
            else
                g_free(base);
            return TRUE;
        }
        g_free(base);
    }

    if (path_has_archive_ext(path)) {
        if (split_tar_set_exists(path) || split_gnu_set_exists(path)) {
            if (base_out)
                *base_out = g_strdup(path);
            return TRUE;
        }
    }

    return FALSE;
}

static void split_part_suffix_gnu(char *buf, size_t buflen, unsigned part_index) {
    unsigned n = part_index;
    char s[3];
    s[1] = (char)('a' + (n % 26));
    n /= 26;
    s[0] = (char)('a' + (n % 26));
    s[2] = '\0';
    g_strlcpy(buf, s, buflen);
}

static char *split_part_path(const char *dest_base, ArchiveFormat fmt,
                             unsigned part_index) {
    if (fmt == CC_ARCHIVE_FMT_ZIP) {
        if (part_index == 0)
            return g_strdup_printf("%s.zip", dest_base);
        if (part_index < 100)
            return g_strdup_printf("%s.z%02u", dest_base, part_index);
        return g_strdup_printf("%s.z%u", dest_base, part_index);
    }
    const char *ext = archive_format_ext_split(fmt);
    char *vol0 = g_strdup_printf("%s%s", dest_base, ext);
    if (part_index == 0)
        return vol0;
    return g_strdup_printf("%s.%03u", vol0, part_index);
}

/* ------------------------------------------------------------------ */
/* Splitting / joining helpers                                          */
/* ------------------------------------------------------------------ */

static gboolean copy_file_path(const char *src, const char *dst, GError **error) {
    GFile *s = g_file_new_for_path(src);
    GFile *d = g_file_new_for_path(dst);
    gboolean ok = g_file_copy(s, d, G_FILE_COPY_OVERWRITE, NULL, NULL, NULL, error);
    g_object_unref(s);
    g_object_unref(d);
    return ok;
}

static gboolean append_file_to_fd(const char *part_path, int out_fd, GError **error) {
    FILE *in = fopen(part_path, "rb");
    if (!in) {
        g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno),
                    "분할 파일을 열 수 없습니다: %s", g_strerror(errno));
        return FALSE;
    }
    char buf[65536];
    size_t n;
    while ((n = fread(buf, 1, sizeof(buf), in)) > 0) {
        if (write(out_fd, buf, n) != (ssize_t)n) {
            g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED, "임시 파일 쓰기 실패");
            fclose(in);
            return FALSE;
        }
    }
    fclose(in);
    return TRUE;
}

static gboolean split_archive(const char *src_path, const char *dest_base,
                              const ArchiveCreateOpts *opts, guint64 part_size,
                              GError **error) {
    char *first_part = split_part_path(dest_base, opts->format, 0);
    char *read_path = g_strdup(src_path);
    char *temp_copy = NULL;

    /* First volume reuses the archive path (.zip / .tgz); read from a copy. */
    if (strcmp(first_part, src_path) == 0) {
        temp_copy = g_strdup_printf("%s.__ccsplit", src_path);
        if (!copy_file_path(src_path, temp_copy, error)) {
            g_free(temp_copy);
            g_free(first_part);
            g_free(read_path);
            return FALSE;
        }
        g_free(read_path);
        read_path = temp_copy;
    }
    g_free(first_part);

    FILE *in = fopen(read_path, "rb");
    if (!in) {
        g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno),
                    "파일을 열 수 없습니다: %s", g_strerror(errno));
        if (temp_copy)
            g_unlink(temp_copy);
        g_free(read_path);
        return FALSE;
    }

    char     buf[65536];
    unsigned part_index = 0;
    guint64  written = 0;
    FILE    *out = NULL;
    char    *out_path = NULL;
    gboolean ok = TRUE;

    for (;;) {
        size_t n = fread(buf, 1, sizeof(buf), in);
        if (n == 0) break;

        size_t remaining = n;
        char  *ptr = buf;

        while (remaining > 0) {
            if (!out || written >= part_size) {
                if (out) fclose(out);
                g_free(out_path);
                out_path = split_part_path(dest_base, opts->format, part_index++);
                out = fopen(out_path, "wb");
                if (!out) {
                    g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno),
                                "분할 파일을 만들 수 없습니다: %s", g_strerror(errno));
                    ok = FALSE;
                    goto split_done;
                }
                written = 0;
            }
            guint64 can_write = MIN((guint64)remaining, part_size - written);
            if (fwrite(ptr, 1, (size_t)can_write, out) != (size_t)can_write) {
                g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED, "파일 쓰기 실패");
                ok = FALSE;
                goto split_done;
            }
            ptr       += can_write;
            remaining -= (size_t)can_write;
            written   += can_write;
        }
    }

split_done:
    if (out) fclose(out);
    g_free(out_path);
    fclose(in);
    if (temp_copy) {
        g_unlink(temp_copy);
        g_free(read_path);
    } else {
        g_free(read_path);
    }
    return ok;
}

/* Returns a newly-allocated path to a temporary file containing all parts,
   or NULL on error. Caller must g_unlink + g_free the returned path. */
typedef enum {
    SPLIT_SCHEME_ZIP,
    SPLIT_SCHEME_TAR_NUM,
    SPLIT_SCHEME_GNU,
} SplitScheme;

static SplitScheme detect_split_scheme(const char *base_path) {
    char *zip0 = g_strdup_printf("%s.zip", base_path);
    char *z01  = g_strdup_printf("%s.z01", base_path);
    if (g_file_test(zip0, G_FILE_TEST_EXISTS) ||
        g_file_test(z01, G_FILE_TEST_EXISTS)) {
        g_free(zip0);
        g_free(z01);
        return SPLIT_SCHEME_ZIP;
    }
    g_free(zip0);
    g_free(z01);

    if (split_tar_set_exists(base_path))
        return SPLIT_SCHEME_TAR_NUM;
    if (split_gnu_set_exists(base_path))
        return SPLIT_SCHEME_GNU;
    return SPLIT_SCHEME_TAR_NUM;
}

static char *join_split_parts(const char *base_path, GError **error) {
    char *tmp_path = g_strdup("/tmp/cc_archive_XXXXXX");
    int tmp_fd = g_mkstemp(tmp_path);
    if (tmp_fd < 0) {
        g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno),
                    "임시 파일 생성 실패: %s", g_strerror(errno));
        g_free(tmp_path);
        return NULL;
    }

    gboolean ok = TRUE;
    gboolean any_part = FALSE;
    SplitScheme scheme = detect_split_scheme(base_path);

    if (scheme == SPLIT_SCHEME_ZIP) {
        for (unsigned part_index = 0; ; part_index++) {
            char *pp = split_part_path(base_path, CC_ARCHIVE_FMT_ZIP, part_index);
            gboolean exists = g_file_test(pp, G_FILE_TEST_EXISTS);
            if (!exists) {
                g_free(pp);
                break;
            }
            any_part = TRUE;
            if (!append_file_to_fd(pp, tmp_fd, error)) {
                g_free(pp);
                ok = FALSE;
                break;
            }
            g_free(pp);
        }
    } else if (scheme == SPLIT_SCHEME_TAR_NUM) {
        for (unsigned part_index = 0; ; part_index++) {
            char *pp;
            if (part_index == 0)
                pp = g_strdup(base_path);
            else
                pp = g_strdup_printf("%s.%03u", base_path, part_index);
            gboolean exists = g_file_test(pp, G_FILE_TEST_EXISTS);
            if (!exists) {
                g_free(pp);
                break;
            }
            any_part = TRUE;
            if (!append_file_to_fd(pp, tmp_fd, error)) {
                g_free(pp);
                ok = FALSE;
                break;
            }
            g_free(pp);
        }
    } else {
        for (unsigned part_index = 0; ; part_index++) {
            char suffix[4];
            split_part_suffix_gnu(suffix, sizeof suffix, part_index);
            char *pp = g_strdup_printf("%s.%s", base_path, suffix);
            gboolean exists = g_file_test(pp, G_FILE_TEST_EXISTS);
            if (!exists) {
                g_free(pp);
                break;
            }
            any_part = TRUE;
            if (!append_file_to_fd(pp, tmp_fd, error)) {
                g_free(pp);
                ok = FALSE;
                break;
            }
            g_free(pp);
        }
    }

    if (!any_part) {
        g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                    "분할 파일을 찾을 수 없습니다: %s", base_path);
        ok = FALSE;
    }

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

/* archive_read → archive_write_disk (extract); sparse-aware */
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

/* archive_read_disk → archive_write (compress); data_block not supported */
static int copy_data_disk_to_archive(struct archive *disk, struct archive *aw,
                                     GCancellable *cancel) {
    char buf[65536];
    for (;;) {
        if (cancel && g_cancellable_is_cancelled(cancel))
            return ARCHIVE_FAILED;
        ssize_t n = archive_read_data(disk, buf, sizeof(buf));
        if (n == 0) return ARCHIVE_OK;
        if (n < 0) return (int)n;
        ssize_t w = archive_write_data(aw, buf, (size_t)n);
        if (w < 0) return (int)w;
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
            r = copy_data_disk_to_archive(disk, a, cancel);
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
    const char *ext  = archive_format_ext_for(opts);
    char       *dest = g_strdup_printf("%s%s", dest_base, ext);

    struct archive *a = archive_write_new();
    switch (opts->format) {
        case CC_ARCHIVE_FMT_TAR_GZ:
            archive_write_add_filter_gzip(a);
            archive_write_set_format_pax_restricted(a);
            break;
        case CC_ARCHIVE_FMT_TAR_BZ2:
            archive_write_add_filter_bzip2(a);
            archive_write_set_format_pax_restricted(a);
            break;
        case CC_ARCHIVE_FMT_ZIP:
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
        if (!split_archive(dest, dest_base, opts, opts->split_size, &serr)) {
            g_propagate_error(error, serr);
            g_unlink(dest);
            g_free(dest);
            return FALSE;
        }
        /* First split volume keeps dest path (.zip / .tgz); do not delete it. */
        char *first_part = split_part_path(dest_base, opts->format, 0);
        if (strcmp(first_part, dest) != 0)
            g_unlink(dest);
        g_free(first_part);
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
    if (archive_split_detect(archive_path, &base)) {
        is_split = TRUE;
        actual = join_split_parts(base, error);
        g_free(base);
        if (!actual)
            return FALSE;
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
