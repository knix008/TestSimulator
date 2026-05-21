#ifndef FTP_TYPES_H
#define FTP_TYPES_H

#include <glib.h>

#define FTP_MAX_NAME   128
#define FTP_MAX_HOST   256
#define FTP_MAX_USER   128
#define FTP_MAX_PASS   256
#define FTP_MAX_PATH   4096
#define FTP_MAX_PERM   16
#define FTP_MAX_DATE   32
#define FTP_MAX_SIZE   24

typedef enum {
    FTP_PROTOCOL_FTP  = 0,
    FTP_PROTOCOL_FTPS = 1,
    FTP_PROTOCOL_SFTP = 2
} FtpProtocol;

typedef struct {
    gchar     name[FTP_MAX_NAME];
    gchar     path[FTP_MAX_PATH];
    gchar     perm[FTP_MAX_PERM];
    gchar     date[FTP_MAX_DATE];
    gchar     size_text[FTP_MAX_SIZE];
    gint64    size_bytes;
    gboolean  is_dir;
    gboolean  is_parent;
} FtpDirEntry;

typedef void (*FtpStatusFn)(const gchar *message, gpointer user_data);
typedef void (*FtpProgressFn)(gint percent, const gchar *detail, gpointer user_data);

#endif /* FTP_TYPES_H */
