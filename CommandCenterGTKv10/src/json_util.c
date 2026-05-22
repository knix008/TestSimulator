#include "json_util.h"

#include <stdio.h>
#include <string.h>

void bookmark_entry_free(gpointer data) {
    BookmarkEntry *b = data;
    if (!b) return;
    g_free(b->path);
    g_free(b->name);
    g_free(b);
}

static char *json_escape(const char *s) {
    GString *out = g_string_new("\"");
    for (const char *p = s; *p; p++) {
        if (*p == '"' || *p == '\\')
            g_string_append_c(out, '\\');
        g_string_append_c(out, *p);
    }
    g_string_append_c(out, '"');
    return g_string_free(out, FALSE);
}

static char *json_unescape(const char *s, int len) {
    GString *out = g_string_sized_new((gsize)len);
    for (int i = 0; i < len; i++) {
        if (s[i] == '\\' && i + 1 < len) {
            i++;
            g_string_append_c(out, s[i]);
        } else {
            g_string_append_c(out, s[i]);
        }
    }
    return g_string_free(out, FALSE);
}

static const char *find_key_value(const char *json, const char *key, int *out_len) {
    char pattern[128];
    g_snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *pos = strstr(json, pattern);
    if (!pos) return NULL;
    pos = strchr(pos + strlen(pattern), ':');
    if (!pos) return NULL;
    pos++;
    while (*pos == ' ' || *pos == '\t') pos++;
    if (*pos != '"') return NULL;
    pos++;
    const char *start = pos;
    while (*pos) {
        if (*pos == '"' && (pos == start || *(pos - 1) != '\\')) break;
        pos++;
    }
    *out_len = (int)(pos - start);
    return start;
}

GPtrArray *json_load_bookmarks(const char *file_path) {
    GPtrArray *arr = g_ptr_array_new_with_free_func(bookmark_entry_free);
    gchar *contents = NULL;
    gsize len = 0;
    if (!g_file_get_contents(file_path, &contents, &len, NULL)) return arr;
    const char *p = contents;
    while ((p = strstr(p, "\"Path\"")) != NULL) {
        int path_len = 0;
        const char *path_val = find_key_value(p, "Path", &path_len);
        if (!path_val) break;
        char *path = json_unescape(path_val, path_len);

        const char *name_key = strstr(p, "\"Name\"");
        char *name = NULL;
        if (name_key) {
            int name_len = 0;
            const char *name_val = find_key_value(name_key, "Name", &name_len);
            if (name_val) name = json_unescape(name_val, name_len);
        }
        if (!name || !*name) name = g_path_get_basename(path);

        BookmarkEntry *b = g_new0(BookmarkEntry, 1);
        b->path = path;
        b->name = name;
        g_ptr_array_add(arr, b);
        p++;
    }
    g_free(contents);
    return arr;
}

gboolean json_save_bookmarks(const char *file_path, GPtrArray *bookmarks) {
    GString *json = g_string_new("[\n");
    for (guint i = 0; i < bookmarks->len; i++) {
        BookmarkEntry *b = g_ptr_array_index(bookmarks, i);
        char *ep = json_escape(b->path);
        char *en = json_escape(b->name);
        g_string_append_printf(json, "  {\"Path\": %s, \"Name\": %s}", ep, en);
        g_free(ep);
        g_free(en);
        if (i + 1 < bookmarks->len) g_string_append(json, ",\n");
    }
    g_string_append(json, "\n]\n");
    gboolean ok = g_file_set_contents(file_path, json->str, -1, NULL);
    g_string_free(json, TRUE);
    return ok;
}

gboolean json_load_session(const char *file_path,
                           gchar **left_path,
                           gchar **right_path,
                           gint *splitter_distance) {
    gchar *contents = NULL;
    gsize len = 0;
    if (!g_file_get_contents(file_path, &contents, &len, NULL)) return FALSE;

    int llen = 0, rlen = 0;
    const char *lp = find_key_value(contents, "LeftPath", &llen);
    const char *rp = find_key_value(contents, "RightPath", &rlen);
    if (lp) *left_path = json_unescape(lp, llen);
    if (rp) *right_path = json_unescape(rp, rlen);

    const char *sp = strstr(contents, "\"SplitterDistance\"");
    if (sp) {
        sp = strchr(sp, ':');
        if (sp) *splitter_distance = atoi(sp + 1);
    }

    g_free(contents);
    return TRUE;
}

gboolean json_save_session(const char *file_path,
                           const char *left_path,
                           const char *right_path,
                           gint splitter_distance) {
    char *el = json_escape(left_path ? left_path : "");
    char *er = json_escape(right_path ? right_path : "");
    gchar *json = g_strdup_printf(
        "{\n  \"LeftPath\": %s,\n  \"RightPath\": %s,\n  \"SplitterDistance\": %d\n}\n",
        el, er, splitter_distance);
    g_free(el);
    g_free(er);
    gboolean ok = g_file_set_contents(file_path, json, -1, NULL);
    g_free(json);
    return ok;
}
