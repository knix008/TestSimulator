#include "profile.h"
#include <glib/gstdio.h>
#include <string.h>

#define PROFILES_FILE "profiles.ini"
#define SETTINGS_FILE "settings.ini"
#define GROUP_GENERAL "general"

gchar *ftp_config_dir(void) {
    return g_build_filename(g_get_user_config_dir(), "ftp-gtk-client", NULL);
}

static gchar *profiles_path(void) {
    gchar *dir  = ftp_config_dir();
    gchar *path = g_build_filename(dir, PROFILES_FILE, NULL);
    g_free(dir);
    return path;
}

static gchar *settings_path(void) {
    gchar *dir  = ftp_config_dir();
    gchar *path = g_build_filename(dir, SETTINGS_FILE, NULL);
    g_free(dir);
    return path;
}

const gchar *ftp_protocol_to_string(FtpProtocol p) {
    switch (p) {
    case FTP_PROTOCOL_FTPS: return "FTPS";
    case FTP_PROTOCOL_SFTP: return "SFTP";
    default:                return "FTP";
    }
}

FtpProtocol ftp_protocol_from_string(const gchar *s) {
    if (!s) return FTP_PROTOCOL_FTP;
    if (g_ascii_strcasecmp(s, "FTPS") == 0) return FTP_PROTOCOL_FTPS;
    if (g_ascii_strcasecmp(s, "SFTP") == 0) return FTP_PROTOCOL_SFTP;
    return FTP_PROTOCOL_FTP;
}

gint ftp_default_port(FtpProtocol p) {
    return p == FTP_PROTOCOL_SFTP ? 22 : 21;
}

GList *ftp_profile_load_all(void) {
    GList    *list = NULL;
    gchar    *path = profiles_path();
    GKeyFile *kf   = g_key_file_new();
    GError   *err  = NULL;

    if (!g_key_file_load_from_file(kf, path, G_KEY_FILE_NONE, &err)) {
        if (!g_error_matches(err, G_FILE_ERROR, G_FILE_ERROR_NOENT))
            g_warning("profile: cannot load %s: %s", path, err->message);
        g_clear_error(&err);
        g_key_file_free(kf);
        g_free(path);
        return NULL;
    }

    gchar **groups = g_key_file_get_groups(kf, NULL);
    for (gint i = 0; groups && groups[i]; i++) {
        const gchar *grp = groups[i];
        if (g_strcmp0(grp, GROUP_GENERAL) == 0) continue;

        FtpProfile *p = g_new0(FtpProfile, 1);
        g_strlcpy(p->name, grp, FTP_MAX_NAME);

        gchar *host = g_key_file_get_string(kf, grp, "host", NULL);
        if (host) { g_strlcpy(p->host, host, FTP_MAX_HOST); g_free(host); }

        gchar *user = g_key_file_get_string(kf, grp, "user", NULL);
        if (user) { g_strlcpy(p->user, user, FTP_MAX_USER); g_free(user); }

        gchar *proto = g_key_file_get_string(kf, grp, "protocol", NULL);
        p->protocol = ftp_protocol_from_string(proto);
        g_free(proto);

        p->port = g_key_file_get_integer(kf, grp, "port", NULL);
        if (p->port <= 0) p->port = ftp_default_port(p->protocol);

        p->save_password = g_key_file_get_boolean(kf, grp, "save_password", NULL);
        if (p->save_password) {
            gchar *pw = g_key_file_get_string(kf, grp, "password", NULL);
            if (pw) { g_strlcpy(p->password, pw, FTP_MAX_PASS); g_free(pw); }
        }

        list = g_list_append(list, p);
    }

    g_strfreev(groups);
    g_key_file_free(kf);
    g_free(path);
    return list;
}

void ftp_profile_save_all(GList *profiles) {
    gchar    *dir  = ftp_config_dir();
    gchar    *path = profiles_path();
    GKeyFile *kf   = g_key_file_new();

    g_mkdir_with_parents(dir, 0700);

    for (GList *l = profiles; l; l = l->next) {
        FtpProfile *p = l->data;
        if (!p->name[0]) continue;          /* skip unnamed profiles */
        const gchar *grp = p->name;

        g_key_file_set_string(kf, grp, "host",     p->host);
        g_key_file_set_string(kf, grp, "user",     p->user);
        g_key_file_set_string(kf, grp, "protocol", ftp_protocol_to_string(p->protocol));
        g_key_file_set_integer(kf, grp, "port",    p->port);
        g_key_file_set_boolean(kf, grp, "save_password", p->save_password);
        if (p->save_password)
            g_key_file_set_string(kf, grp, "password", p->password);
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

FtpProfile *ftp_profile_new(const gchar *name) {
    FtpProfile *p = g_new0(FtpProfile, 1);
    if (name) g_strlcpy(p->name, name, FTP_MAX_NAME);
    p->protocol = FTP_PROTOCOL_FTP;
    p->port     = 21;
    p->save_password = TRUE;
    return p;
}

FtpProfile *ftp_profile_copy(const FtpProfile *src) {
    FtpProfile *p = g_new0(FtpProfile, 1);
    memcpy(p, src, sizeof(FtpProfile));
    return p;
}

void ftp_profile_free(FtpProfile *profile) {
    g_free(profile);
}

FtpProfile *ftp_profile_find(GList *profiles, const gchar *name) {
    for (GList *l = profiles; l; l = l->next) {
        FtpProfile *p = l->data;
        if (g_strcmp0(p->name, name) == 0) return p;
    }
    return NULL;
}

const gchar *ftp_home_directory(void) {
    const gchar *home = g_get_home_dir();
    return (home && home[0]) ? home : "/";
}

gboolean ftp_path_is_under_home(const gchar *path) {
    if (!path || !path[0]) return FALSE;
    const gchar *home = ftp_home_directory();
    if (g_strcmp0(path, home) == 0) return TRUE;
    gchar *prefix = g_strdup_printf("%s/", home);
    gboolean ok = g_str_has_prefix(path, prefix);
    g_free(prefix);
    return ok;
}

void ftp_normalize_local_path(const gchar *path, gchar *out, gsize out_size) {
    const gchar *home = ftp_home_directory();
    if (!path || !path[0]) {
        g_strlcpy(out, home, out_size);
        return;
    }
    gchar *canonical = g_canonicalize_filename(path, NULL);
    if (!canonical || !g_file_test(canonical, G_FILE_TEST_IS_DIR)) {
        g_free(canonical);
        g_strlcpy(out, home, out_size);
        return;
    }
    g_strlcpy(out, canonical, out_size);
    g_free(canonical);
}

void ftp_settings_load(FtpAppSettings *settings) {
    memset(settings, 0, sizeof(*settings));
    g_strlcpy(settings->last_local_path, ftp_home_directory(), FTP_MAX_PATH);
    g_strlcpy(settings->last_server_path, "/", FTP_MAX_PATH);

    gchar *path = settings_path();
    GKeyFile *kf = g_key_file_new();
    GError *err = NULL;

    if (g_key_file_load_from_file(kf, path, G_KEY_FILE_NONE, &err)) {
        gchar *lp = g_key_file_get_string(kf, GROUP_GENERAL, "last_local_path", NULL);
        if (lp && lp[0])
            ftp_normalize_local_path(lp, settings->last_local_path, FTP_MAX_PATH);
        g_free(lp);

        gchar *sp = g_key_file_get_string(kf, GROUP_GENERAL, "last_server_path", NULL);
        if (sp && sp[0])
            g_strlcpy(settings->last_server_path, sp, FTP_MAX_PATH);
        g_free(sp);
    }
    g_clear_error(&err);
    g_key_file_free(kf);
    g_free(path);
}

void ftp_settings_save(const FtpAppSettings *settings) {
    gchar *dir = ftp_config_dir();
    gchar *path = settings_path();
    GKeyFile *kf = g_key_file_new();

    g_mkdir_with_parents(dir, 0700);
    g_key_file_set_string(kf, GROUP_GENERAL, "last_local_path", settings->last_local_path);
    g_key_file_set_string(kf, GROUP_GENERAL, "last_server_path", settings->last_server_path);

    GError *err = NULL;
    if (!g_key_file_save_to_file(kf, path, &err)) {
        g_warning("settings: cannot save %s: %s", path, err->message);
        g_clear_error(&err);
    }

    g_key_file_free(kf);
    g_free(path);
    g_free(dir);
}
