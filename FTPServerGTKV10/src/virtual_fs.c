#include "virtual_fs.h"
#include "platform.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <unistd.h>
#include <dirent.h>
#include <sys/stat.h>
#include <time.h>
#include <errno.h>

/* ---- dynamic string (replaces GString) --------------------------------- */

typedef struct { char *buf; size_t len; size_t cap; } DynStr;

static void ds_init(DynStr *ds) {
    ds->cap = 1024; ds->len = 0;
    ds->buf = malloc(ds->cap);
    if (ds->buf) ds->buf[0] = '\0';
}

static void ds_printf(DynStr *ds, const char *fmt, ...) __attribute__((format(printf, 2, 3)));
static void ds_printf(DynStr *ds, const char *fmt, ...) {
    if (!ds->buf) return;
    for (;;) {
        size_t avail = ds->cap - ds->len;
        va_list ap;
        va_start(ap, fmt);
        int n = vsnprintf(ds->buf + ds->len, avail, fmt, ap);
        va_end(ap);
        if (n < 0) return;
        if ((size_t)n < avail) { ds->len += (size_t)n; return; }
        ds->cap = ds->cap * 2 + (size_t)n + 1;
        char *nb = realloc(ds->buf, ds->cap);
        if (!nb) return;
        ds->buf = nb;
    }
}

/* Transfer ownership of buffer to caller; ds is invalidated. */
static char *ds_take(DynStr *ds) {
    char *b = ds->buf;
    ds->buf = NULL; ds->len = ds->cap = 0;
    return b;
}

/* ---- VirtualFS lifecycle ----------------------------------------------- */

void vfs_init(VirtualFS *vfs, SharedFolderEntry *folders, int count) {
    vfs->folder_count = count;
    vfs->folders = malloc((count > 0 ? count : 1) * sizeof(SharedFolderEntry));
    for (int i = 0; i < count; i++)
        vfs->folders[i] = folders[i];
}

void vfs_destroy(VirtualFS *vfs) {
    free(vfs->folders);
    vfs->folders      = NULL;
    vfs->folder_count = 0;
}

/* ---- path normalization ------------------------------------------------ */

void vfs_normalize(char *path) {
    if (!path || !*path) return;

    char *parts[256];
    int   np = 0;
    bool  is_abs = (path[0] == '/');

    char *copy = strdup(path);
    char *tok  = strtok(copy, "/");
    while (tok) {
        if (strcmp(tok, ".") == 0) {
            /* skip */
        } else if (strcmp(tok, "..") == 0) {
            if (np > 0) np--;
        } else {
            parts[np++] = tok;
        }
        tok = strtok(NULL, "/");
    }

    char out[MAX_PATH_LEN] = "";
    if (is_abs || np == 0) strcat(out, "/");
    for (int i = 0; i < np; i++) {
        if (i > 0) strcat(out, "/");
        strcat(out, parts[i]);
    }
    if (!is_abs && np == 0) strcpy(out, "/");

    str_copy(path, out, MAX_PATH_LEN);
    free(copy);
}

/* ---- path resolution --------------------------------------------------- */

bool vfs_resolve(const VirtualFS *vfs, const char *vpath,
                 char *out, size_t out_len) {
    char norm[MAX_PATH_LEN];
    str_copy(norm, vpath, sizeof(norm));
    vfs_normalize(norm);

    if (vfs->folder_count == 0) return false;

    if (vfs->folder_count == 1 &&
        (vfs->folders[0].virtual_name[0] == '\0' ||
         strcmp(vfs->folders[0].virtual_name, "/") == 0)) {
        const char *rel = norm + 1;
        if (*rel)
            snprintf(out, out_len, "%s/%s", vfs->folders[0].physical_path, rel);
        else
            str_copy(out, vfs->folders[0].physical_path, out_len);
        return true;
    }

    if (strcmp(norm, "/") == 0) {
        out[0] = '\0';
        return true;
    }

    for (int i = 0; i < vfs->folder_count; i++) {
        const char *vn = vfs->folders[i].virtual_name;
        char prefix[MAX_NAME_LEN + 2];
        snprintf(prefix, sizeof(prefix), "/%s", vn);

        if (strcmp(norm, prefix) == 0) {
            str_copy(out, vfs->folders[i].physical_path, out_len);
            return true;
        }
        if (strncmp(norm, prefix, strlen(prefix)) == 0 &&
            norm[strlen(prefix)] == '/') {
            const char *sub = norm + strlen(prefix) + 1;
            snprintf(out, out_len, "%s/%s", vfs->folders[i].physical_path, sub);
            return true;
        }
    }
    return false;
}

/* ---- stat helpers ------------------------------------------------------- */

bool vfs_stat(const VirtualFS *vfs, const char *vpath, struct stat *st) {
    char ppath[MAX_PATH_LEN];
    char norm[MAX_PATH_LEN];
    str_copy(norm, vpath, sizeof(norm));
    vfs_normalize(norm);
    if (strcmp(norm, "/") == 0) {
        memset(st, 0, sizeof(*st));
        st->st_mode = S_IFDIR | 0755;
        st->st_mtime = time(NULL);
        return true;
    }
    if (!vfs_resolve(vfs, vpath, ppath, sizeof(ppath))) return false;
    if (ppath[0] == '\0') {
        memset(st, 0, sizeof(*st));
        st->st_mode = S_IFDIR | 0755;
        return true;
    }
    return stat(ppath, st) == 0;
}

bool vfs_is_dir(const VirtualFS *vfs, const char *vpath) {
    struct stat st;
    if (!vfs_stat(vfs, vpath, &st)) return false;
    return S_ISDIR(st.st_mode);
}

bool vfs_is_file(const VirtualFS *vfs, const char *vpath) {
    struct stat st;
    if (!vfs_stat(vfs, vpath, &st)) return false;
    return S_ISREG(st.st_mode);
}

/* ---- directory listing ------------------------------------------------- */

static void append_ls_line(DynStr *ds, const char *name, struct stat *st) {
    char perm[11];
    perm[0]  = S_ISDIR(st->st_mode) ? 'd' : '-';
    perm[1]  = (st->st_mode & S_IRUSR) ? 'r' : '-';
    perm[2]  = (st->st_mode & S_IWUSR) ? 'w' : '-';
    perm[3]  = (st->st_mode & S_IXUSR) ? 'x' : '-';
    perm[4]  = (st->st_mode & S_IRGRP) ? 'r' : '-';
    perm[5]  = (st->st_mode & S_IWGRP) ? 'w' : '-';
    perm[6]  = (st->st_mode & S_IXGRP) ? 'x' : '-';
    perm[7]  = (st->st_mode & S_IROTH) ? 'r' : '-';
    perm[8]  = (st->st_mode & S_IWOTH) ? 'w' : '-';
    perm[9]  = (st->st_mode & S_IXOTH) ? 'x' : '-';
    perm[10] = '\0';

    char tsbuf[20];
    struct tm *t = localtime(&st->st_mtime);
    strftime(tsbuf, sizeof(tsbuf), "%b %d %H:%M", t);

    ds_printf(ds, "%s 1 ftp ftp %10lld %s %s\r\n",
              perm, (long long)st->st_size, tsbuf, name);
}

char *vfs_list(const VirtualFS *vfs, const char *vpath) {
    DynStr ds; ds_init(&ds);
    char norm[MAX_PATH_LEN];
    str_copy(norm, vpath, sizeof(norm));
    vfs_normalize(norm);

    bool is_root = (strcmp(norm, "/") == 0);

    if (is_root && !(vfs->folder_count == 1 &&
        (vfs->folders[0].virtual_name[0] == '\0' ||
         strcmp(vfs->folders[0].virtual_name, "/") == 0))) {
        for (int i = 0; i < vfs->folder_count; i++) {
            struct stat st;
            stat(vfs->folders[i].physical_path, &st);
            st.st_mode = S_IFDIR | 0755;
            append_ls_line(&ds, vfs->folders[i].virtual_name, &st);
        }
        return ds_take(&ds);
    }

    char ppath[MAX_PATH_LEN];
    if (!vfs_resolve(vfs, norm, ppath, sizeof(ppath)) || ppath[0] == '\0')
        return ds_take(&ds);

    DIR *d = opendir(ppath);
    if (!d) return ds_take(&ds);

    struct dirent *entry;
    while ((entry = readdir(d))) {
        if (strcmp(entry->d_name, ".") == 0 ||
            strcmp(entry->d_name, "..") == 0) continue;
        char full[MAX_PATH_LEN];
        snprintf(full, sizeof(full), "%s/%s", ppath, entry->d_name);
        struct stat st;
        if (stat(full, &st) == 0)
            append_ls_line(&ds, entry->d_name, &st);
    }
    closedir(d);
    return ds_take(&ds);
}

char *vfs_mlsd(const VirtualFS *vfs, const char *vpath) {
    DynStr ds; ds_init(&ds);
    char norm[MAX_PATH_LEN];
    str_copy(norm, vpath, sizeof(norm));
    vfs_normalize(norm);

    bool is_root  = (strcmp(norm, "/") == 0);
    bool is_multi = !(vfs->folder_count == 1 &&
        (vfs->folders[0].virtual_name[0] == '\0' ||
         strcmp(vfs->folders[0].virtual_name, "/") == 0));

    if (is_root && is_multi) {
        for (int i = 0; i < vfs->folder_count; i++) {
            struct stat st;
            if (stat(vfs->folders[i].physical_path, &st) != 0) continue;
            char mtbuf[20];
            struct tm *t = gmtime(&st.st_mtime);
            strftime(mtbuf, sizeof(mtbuf), "%Y%m%d%H%M%S", t);
            ds_printf(&ds, "Type=dir;Modify=%s;Perm=el; %s\r\n",
                      mtbuf, vfs->folders[i].virtual_name);
        }
        return ds_take(&ds);
    }

    char ppath[MAX_PATH_LEN];
    if (!vfs_resolve(vfs, norm, ppath, sizeof(ppath)) || ppath[0] == '\0')
        return ds_take(&ds);

    DIR *d = opendir(ppath);
    if (!d) return ds_take(&ds);

    struct dirent *entry;
    while ((entry = readdir(d))) {
        if (strcmp(entry->d_name, ".") == 0 ||
            strcmp(entry->d_name, "..") == 0) continue;
        char full[MAX_PATH_LEN];
        snprintf(full, sizeof(full), "%s/%s", ppath, entry->d_name);
        struct stat st;
        if (stat(full, &st) != 0) continue;

        char mtbuf[20];
        struct tm *t = gmtime(&st.st_mtime);
        strftime(mtbuf, sizeof(mtbuf), "%Y%m%d%H%M%S", t);

        if (S_ISDIR(st.st_mode))
            ds_printf(&ds, "Type=dir;Modify=%s;Perm=el; %s\r\n", mtbuf, entry->d_name);
        else
            ds_printf(&ds, "Type=file;Size=%lld;Modify=%s;Perm=r; %s\r\n",
                      (long long)st.st_size, mtbuf, entry->d_name);
    }
    closedir(d);
    return ds_take(&ds);
}

/* ---- mutations --------------------------------------------------------- */

bool vfs_mkdir(const VirtualFS *vfs, const char *vpath) {
    char ppath[MAX_PATH_LEN];
    if (!vfs_resolve(vfs, vpath, ppath, sizeof(ppath)) || ppath[0] == '\0') return false;
    return mkdir(ppath, 0755) == 0;
}

bool vfs_rmdir(const VirtualFS *vfs, const char *vpath) {
    char ppath[MAX_PATH_LEN];
    if (!vfs_resolve(vfs, vpath, ppath, sizeof(ppath)) || ppath[0] == '\0') return false;
    return rmdir(ppath) == 0;
}

bool vfs_remove(const VirtualFS *vfs, const char *vpath) {
    char ppath[MAX_PATH_LEN];
    if (!vfs_resolve(vfs, vpath, ppath, sizeof(ppath)) || ppath[0] == '\0') return false;
    return unlink(ppath) == 0;
}

bool vfs_rename(const VirtualFS *vfs,
                const char *old_vpath, const char *new_vpath) {
    char op[MAX_PATH_LEN], np[MAX_PATH_LEN];
    if (!vfs_resolve(vfs, old_vpath, op, sizeof(op)) || op[0] == '\0') return false;
    if (!vfs_resolve(vfs, new_vpath, np, sizeof(np)) || np[0] == '\0') return false;
    return rename(op, np) == 0;
}
