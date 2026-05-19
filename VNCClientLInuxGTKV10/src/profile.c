#include "profile.h"
#include <glib.h>
#include <glib/gstdio.h>
#include <string.h>
#include <stdlib.h>

#define PROFILES_FILE "profiles.ini"
#define GROUP_GENERAL "general"
#define KEY_PORT        "port"
#define KEY_SAVE_PASS   "save_password"
#define KEY_PASSWORD    "password"
#define KEY_VIEW_ONLY   "view_only"
#define KEY_SHARED      "shared"
#define KEY_SCALE_MODE  "scale_mode"

gchar *profile_config_dir(void) {
    return g_build_filename(g_get_user_config_dir(), "vnc-gtk-client", NULL);
}

static gchar *profiles_path(void) {
    gchar *dir  = profile_config_dir();
    gchar *path = g_build_filename(dir, PROFILES_FILE, NULL);
    g_free(dir);
    return path;
}

GList *profile_load_all(void) {
    GList      *list  = NULL;
    gchar      *path  = profiles_path();
    GKeyFile   *kf    = g_key_file_new();
    GError     *err   = NULL;

    if (!g_key_file_load_from_file(kf, path, G_KEY_FILE_NONE, &err)) {
        if (!g_error_matches(err, G_FILE_ERROR, G_FILE_ERROR_NOENT))
            g_warning("profile: cannot load %s: %s", path, err->message);
        g_clear_error(&err);
        g_key_file_free(kf);
        g_free(path);
        return NULL;
    }

    gchar **groups = g_key_file_get_groups(kf, NULL);
    for (gint i = 0; groups[i]; i++) {
        const gchar *grp = groups[i];
        if (g_strcmp0(grp, GROUP_GENERAL) == 0) continue;

        VncProfile *p = g_new0(VncProfile, 1);
        g_strlcpy(p->name, grp, PROFILE_MAX_NAME);

        gchar *host = g_key_file_get_string(kf, grp, "host", NULL);
        if (host) { g_strlcpy(p->host, host, PROFILE_MAX_HOST); g_free(host); }

        p->port       = g_key_file_get_integer(kf, grp, KEY_PORT,       NULL);
        if (p->port <= 0) p->port = VNC_DEFAULT_PORT;

        p->save_password = g_key_file_get_boolean(kf, grp, KEY_SAVE_PASS, NULL);
        p->view_only     = g_key_file_get_boolean(kf, grp, KEY_VIEW_ONLY, NULL);
        p->shared        = g_key_file_get_boolean(kf, grp, KEY_SHARED,    NULL);
        p->scale_mode    = (VncScaleMode)g_key_file_get_integer(kf, grp, KEY_SCALE_MODE, NULL);

        if (p->save_password) {
            gchar *pw = g_key_file_get_string(kf, grp, KEY_PASSWORD, NULL);
            if (pw) { g_strlcpy(p->password, pw, PROFILE_MAX_PASS); g_free(pw); }
        }

        list = g_list_append(list, p);
    }

    g_strfreev(groups);
    g_key_file_free(kf);
    g_free(path);
    return list;
}

void profile_save_all(GList *profiles) {
    gchar    *dir  = profile_config_dir();
    gchar    *path = profiles_path();
    GKeyFile *kf   = g_key_file_new();

    g_mkdir_with_parents(dir, 0700);

    for (GList *l = profiles; l; l = l->next) {
        VncProfile *p   = l->data;
        const gchar *grp = p->name;

        g_key_file_set_string (kf, grp, "host",       p->host);
        g_key_file_set_integer(kf, grp, KEY_PORT,      p->port);
        g_key_file_set_boolean(kf, grp, KEY_SAVE_PASS, p->save_password);
        g_key_file_set_boolean(kf, grp, KEY_VIEW_ONLY, p->view_only);
        g_key_file_set_boolean(kf, grp, KEY_SHARED,    p->shared);
        g_key_file_set_integer(kf, grp, KEY_SCALE_MODE,(gint)p->scale_mode);

        if (p->save_password)
            g_key_file_set_string(kf, grp, KEY_PASSWORD, p->password);
    }

    GError *err = NULL;
    if (!g_key_file_save_to_file(kf, path, &err)) {
        g_warning("profile: cannot save %s: %s", path, err->message);
        g_clear_error(&err);
    }

    g_key_file_free(kf);
    g_free(path);
    g_free(dir);
}

VncProfile *profile_new(const gchar *name) {
    VncProfile *p = g_new0(VncProfile, 1);
    if (name) g_strlcpy(p->name, name, PROFILE_MAX_NAME);
    p->port       = VNC_DEFAULT_PORT;
    p->shared     = TRUE;
    p->scale_mode = VNC_SCALE_FIT;
    return p;
}

VncProfile *profile_copy(const VncProfile *src) {
    VncProfile *p = g_new0(VncProfile, 1);
    memcpy(p, src, sizeof(VncProfile));
    return p;
}

void profile_free(VncProfile *profile) {
    g_free(profile);
}

VncProfile *profile_find(GList *profiles, const gchar *name) {
    for (GList *l = profiles; l; l = l->next) {
        VncProfile *p = l->data;
        if (g_strcmp0(p->name, name) == 0) return p;
    }
    return NULL;
}
