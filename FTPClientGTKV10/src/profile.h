#ifndef PROFILE_H
#define PROFILE_H

#include "ftp_types.h"
#include <glib.h>

typedef struct {
    gchar       name[FTP_MAX_NAME];
    FtpProtocol protocol;
    gchar       host[FTP_MAX_HOST];
    gint        port;
    gchar       user[FTP_MAX_USER];
    gchar       password[FTP_MAX_PASS];
    gboolean    save_password;
} FtpProfile;

typedef struct {
    gchar last_local_path[FTP_MAX_PATH];
    gchar last_server_path[FTP_MAX_PATH];
} FtpAppSettings;

gchar       *ftp_config_dir(void);
GList       *ftp_profile_load_all(void);
void         ftp_profile_save_all(GList *profiles);
FtpProfile  *ftp_profile_new(const gchar *name);
FtpProfile  *ftp_profile_copy(const FtpProfile *src);
void         ftp_profile_free(FtpProfile *profile);
FtpProfile  *ftp_profile_find(GList *profiles, const gchar *name);

void         ftp_settings_load(FtpAppSettings *settings);
void         ftp_settings_save(const FtpAppSettings *settings);

const gchar *ftp_home_directory(void);
gboolean     ftp_path_is_under_home(const gchar *path);
void         ftp_normalize_local_path(const gchar *path, gchar *out, gsize out_size);

const gchar *ftp_protocol_to_string(FtpProtocol p);
FtpProtocol  ftp_protocol_from_string(const gchar *s);
gint         ftp_default_port(FtpProtocol p);

#endif /* PROFILE_H */
