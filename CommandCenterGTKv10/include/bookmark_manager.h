#ifndef BOOKMARK_MANAGER_H
#define BOOKMARK_MANAGER_H

#include <glib.h>
#include "json_util.h"

typedef struct BookmarkManager BookmarkManager;

BookmarkManager *bookmark_manager_new(void);
void bookmark_manager_free(BookmarkManager *mgr);
GPtrArray *bookmark_manager_get_all(BookmarkManager *mgr);
gboolean bookmark_manager_add(BookmarkManager *mgr, const char *path, const char *name);
void bookmark_manager_remove(BookmarkManager *mgr, const char *path);

#endif
