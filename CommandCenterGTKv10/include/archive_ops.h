#ifndef ARCHIVE_OPS_H
#define ARCHIVE_OPS_H

#include <glib.h>
#include <gio/gio.h>

typedef enum {
    CC_ARCHIVE_FMT_TAR_GZ,
    CC_ARCHIVE_FMT_TAR_BZ2,
    CC_ARCHIVE_FMT_ZIP,
} ArchiveFormat;

typedef struct {
    ArchiveFormat format;
    gboolean      split;
    guint64       split_size; /* bytes; 0 = no split */
} ArchiveCreateOpts;

typedef void (*ArchiveProgressFn)(const char *filename, gpointer user_data);

const char *archive_format_ext(ArchiveFormat fmt);
const char *archive_format_ext_split(ArchiveFormat fmt);
const char *archive_format_ext_for(const ArchiveCreateOpts *opts);
gboolean    archive_is_archive(const char *path);
gboolean    archive_is_split_part(const char *path, char **base_out);
gboolean    archive_split_detect(const char *path, char **base_out);

gboolean archive_create(GPtrArray         *src_paths,
                        const char        *dest_base,
                        const ArchiveCreateOpts *opts,
                        ArchiveProgressFn  progress_cb,
                        gpointer           progress_data,
                        GCancellable      *cancel,
                        GError           **error);

gboolean archive_extract(const char        *archive_path,
                         const char        *dest_dir,
                         ArchiveProgressFn  progress_cb,
                         gpointer           progress_data,
                         GCancellable      *cancel,
                         GError           **error);

#endif /* ARCHIVE_OPS_H */
