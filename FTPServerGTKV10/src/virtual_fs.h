#pragma once

#include "settings.h"
#include <stdbool.h>
#include <sys/stat.h>
#include <dirent.h>

typedef struct {
    SharedFolderEntry *folders;
    int                folder_count;
} VirtualFS;

void vfs_init(VirtualFS *vfs, SharedFolderEntry *folders, int count);
void vfs_destroy(VirtualFS *vfs);

/* Normalize a virtual path in-place (handle .., ., duplicate slashes). */
void vfs_normalize(char *path);

/* Resolve virtual path to physical absolute path.
   Returns true on success; false if path escapes or folder not found. */
bool vfs_resolve(const VirtualFS *vfs, const char *vpath,
                 char *out, size_t out_len);

bool vfs_is_dir(const VirtualFS *vfs, const char *vpath);
bool vfs_is_file(const VirtualFS *vfs, const char *vpath);
bool vfs_stat(const VirtualFS *vfs, const char *vpath, struct stat *st);

/* Build a Unix-style listing (LIST command).  Result is heap-allocated. */
char *vfs_list(const VirtualFS *vfs, const char *vpath);

/* Build an MLSD-style listing (MLSD command).  Result is heap-allocated. */
char *vfs_mlsd(const VirtualFS *vfs, const char *vpath);

/* File-system mutations */
bool vfs_mkdir(const VirtualFS *vfs, const char *vpath);
bool vfs_rmdir(const VirtualFS *vfs, const char *vpath);
bool vfs_remove(const VirtualFS *vfs, const char *vpath);
bool vfs_rename(const VirtualFS *vfs,
                const char *old_vpath, const char *new_vpath);
