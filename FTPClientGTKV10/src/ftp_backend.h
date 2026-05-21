#ifndef FTP_BACKEND_H
#define FTP_BACKEND_H

#include "ftp_types.h"
#include <glib.h>

typedef struct FtpSession FtpSession;

FtpSession *ftp_session_new(void);
void        ftp_session_free(FtpSession *session);

gboolean ftp_session_is_connected(FtpSession *session);

gboolean ftp_session_connect(FtpSession *session,
                             FtpProtocol protocol,
                             const gchar *host,
                             gint port,
                             const gchar *user,
                             const gchar *password,
                             GError **err);

void ftp_session_disconnect(FtpSession *session);

GPtrArray *ftp_session_list_directory(FtpSession *session,
                                      const gchar *remote_path,
                                      GError **err);

gboolean ftp_session_download(FtpSession *session,
                              const gchar *remote_path,
                              const gchar *local_path,
                              gboolean is_directory,
                              FtpProgressFn progress,
                              gpointer progress_data,
                              GError **err);

gboolean ftp_session_upload(FtpSession *session,
                            const gchar *local_path,
                            const gchar *remote_path,
                            gboolean is_directory,
                            FtpProgressFn progress,
                            gpointer progress_data,
                            GError **err);

gboolean ftp_session_delete(FtpSession *session,
                            const gchar *remote_path,
                            gboolean is_directory,
                            GError **err);

#endif /* FTP_BACKEND_H */
