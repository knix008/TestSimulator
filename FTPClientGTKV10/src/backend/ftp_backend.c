#include "ftp_backend.h"
#include "profile.h"

#include <curl/curl.h>
#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>

struct FtpSession {
    FtpProtocol  protocol;
    gboolean     connected;
    gchar       *host;
    gint         port;
    gchar       *user;
    gchar       *password;
};

/* ── helpers ─────────────────────────────────────────────────────────── */

static const gchar *scheme_for(FtpProtocol p) {
    switch (p) {
    case FTP_PROTOCOL_FTPS: return "ftps";
    case FTP_PROTOCOL_SFTP: return "sftp";
    default:                return "ftp";
    }
}

static gchar *url_encode_part(const gchar *s) {
    if (!s) return g_strdup("");
    CURL *tmp = curl_easy_init();
    if (!tmp) return g_strdup(s);
    char *enc = curl_easy_escape(tmp, s, 0);
    gchar *out = enc ? g_strdup(enc) : g_strdup(s);
    curl_free(enc);
    curl_easy_cleanup(tmp);
    return out;
}

static gchar *build_url(FtpSession *session, const gchar *path) {
    gchar *enc_user = url_encode_part(session->user);
    gchar *enc_pass = url_encode_part(session->password);
    const gchar *scheme = scheme_for(session->protocol);
    const gchar *p = path && path[0] ? path : "/";

    gchar *url;
    if (p[0] == '/')
        url = g_strdup_printf("%s://%s:%s@%s:%d%s",
            scheme, enc_user, enc_pass, session->host, session->port, p);
    else
        url = g_strdup_printf("%s://%s:%s@%s:%d/%s",
            scheme, enc_user, enc_pass, session->host, session->port, p);

    g_free(enc_user);
    g_free(enc_pass);
    return url;
}

typedef struct {
    GString *buf;
} MemBuf;

static size_t write_mem(void *ptr, size_t size, size_t nmemb, void *userdata) {
    MemBuf *m = userdata;
    g_string_append_len(m->buf, ptr, (gssize)(size * nmemb));
    return size * nmemb;
}

static size_t read_file_cb(void *ptr, size_t size, size_t nmemb, void *userdata) {
    return fread(ptr, size, nmemb, (FILE *)userdata);
}

static size_t curl_empty_read(char *ptr, size_t size, size_t nmemb, void *userdata) {
    (void)ptr;
    (void)size;
    (void)nmemb;
    (void)userdata;
    return 0;
}

static void curl_apply_common(FtpSession *session, CURL *curl);

static gchar *build_remote_child_path(const gchar *parent, const gchar *name) {
    if (g_strcmp0(parent, "/") == 0)
        return g_strdup_printf("/%s", name);
    if (g_str_has_suffix(parent, "/"))
        return g_strdup_printf("%s%s", parent, name);
    return g_strdup_printf("%s/%s", parent, name);
}

static gboolean local_path_is_directory(const gchar *path) {
    struct stat st;
    if (stat(path, &st) == 0)
        return S_ISDIR(st.st_mode);
    return g_file_test(path, G_FILE_TEST_IS_DIR);
}

static void entry_set_size(FtpDirEntry *e, gint64 bytes) {
    e->size_bytes = bytes;
    if (e->is_dir)
        g_strlcpy(e->size_text, "-", FTP_MAX_SIZE);
    else if (bytes < 1024)
        g_snprintf(e->size_text, FTP_MAX_SIZE, "%lld", (long long)bytes);
    else if (bytes < 1024 * 1024)
        g_snprintf(e->size_text, FTP_MAX_SIZE, "%.1f KB", bytes / 1024.0);
    else if (bytes < 1024LL * 1024 * 1024)
        g_snprintf(e->size_text, FTP_MAX_SIZE, "%.1f MB", bytes / (1024.0 * 1024.0));
    else
        g_snprintf(e->size_text, FTP_MAX_SIZE, "%.1f GB",
                   bytes / (1024.0 * 1024.0 * 1024.0));
}

static void entry_set_defaults(FtpDirEntry *e) {
    g_strlcpy(e->perm, "---------", FTP_MAX_PERM);
    g_strlcpy(e->date, "-", FTP_MAX_DATE);
    entry_set_size(e, 0);
}

static void build_remote_path(FtpDirEntry *e, const gchar *base_path, const gchar *name) {
    if (g_str_has_suffix(base_path, "/"))
        g_snprintf(e->path, FTP_MAX_PATH, "%s%s", base_path, name);
    else if (g_strcmp0(base_path, "/") == 0)
        g_snprintf(e->path, FTP_MAX_PATH, "/%s", name);
    else
        g_snprintf(e->path, FTP_MAX_PATH, "%s/%s", base_path, name);
}

static gboolean parse_mlsd_line(const gchar *line, FtpDirEntry *e) {
    /* Require at least one fact=value pair with a semicolon */
    if (!strchr(line, '=') || !strchr(line, ';')) return FALSE;

    /* Extract filename.
       RFC 3659: "facts<SP>filename" — the name follows the last "; ".
       Some servers (IIS) use a name= fact instead. */
    const gchar *name_start = NULL;
    const gchar *last_semi  = strrchr(line, ';');
    if (last_semi && last_semi[1] == ' ' && last_semi[2])
        name_start = last_semi + 2;

    if (!name_start) {
        const gchar *nk = strstr(line, "name=");
        if (nk && (nk == line || *(nk - 1) == ';'))
            name_start = nk + 5;
    }
    if (!name_start || !name_start[0]) return FALSE;

    gchar tmp[FTP_MAX_NAME];
    g_strlcpy(tmp, name_start, FTP_MAX_NAME);
    gchar *sc = strchr(tmp, ';');
    if (sc) *sc = '\0';
    g_strlcpy(e->name, g_strstrip(tmp), FTP_MAX_NAME);

    if (!e->name[0] || g_strcmp0(e->name, ".") == 0 || g_strcmp0(e->name, "..") == 0)
        return FALSE;

    /* type=cdir/pdir are "." and ".." — filtered by name above */
    e->is_dir = (strstr(line, "type=dir") != NULL);

    const gchar *mode_key = strstr(line, "UNIX.mode=");
    if (mode_key) {
        unsigned mode = 0;
        sscanf(mode_key + 10, "%o", &mode);
        g_snprintf(e->perm, FTP_MAX_PERM, "%c%c%c%c%c%c%c%c%c%c",
            e->is_dir ? 'd' : '-',
            (mode & 0400) ? 'r' : '-', (mode & 0200) ? 'w' : '-', (mode & 0100) ? 'x' : '-',
            (mode & 0040) ? 'r' : '-', (mode & 0020) ? 'w' : '-', (mode & 0010) ? 'x' : '-',
            (mode & 0004) ? 'r' : '-', (mode & 0002) ? 'w' : '-', (mode & 0001) ? 'x' : '-');
    } else {
        g_strlcpy(e->perm, e->is_dir ? "drwxr-xr-x" : "-rw-r--r--", FTP_MAX_PERM);
    }

    const gchar *size_key = strstr(line, "size=");
    if (size_key && (size_key == line || *(size_key - 1) == ';')) {
        gint64 sz = g_ascii_strtoll(size_key + 5, NULL, 10);
        entry_set_size(e, sz);
    } else {
        entry_set_size(e, 0);
    }

    const gchar *mod_key = strstr(line, "modify=");
    if (mod_key && (mod_key == line || *(mod_key - 1) == ';')) {
        char y[5], mo[3], d[3], h[3], mi[3], s[3];
        if (sscanf(mod_key + 7, "%4c%2c%2c%2c%2c%2c", y, mo, d, h, mi, s) == 6) {
            y[4] = mo[2] = d[2] = h[2] = mi[2] = s[2] = '\0';
            g_snprintf(e->date, FTP_MAX_DATE, "%s-%s-%s %s:%s", y, mo, d, h, mi);
        }
    }
    if (!e->date[0]) g_strlcpy(e->date, "-", FTP_MAX_DATE);
    return TRUE;
}

static gboolean parse_unix_list_line(const gchar *line, FtpDirEntry *e) {
    if (!line || strlen(line) < 10) return FALSE;
    if (line[0] != 'd' && line[0] != '-' && line[0] != 'l') return FALSE;

    g_strlcpy(e->perm, line, 11);

    gchar *dup = g_strdup(line);
    gchar **raw = g_strsplit_set(dup, " \t", -1);

    /* g_strsplit_set creates empty strings for consecutive delimiters.
       Collect only non-empty tokens so column indices are correct. */
    GPtrArray *toks = g_ptr_array_new();
    for (gint i = 0; raw[i]; i++) {
        if (raw[i][0])
            g_ptr_array_add(toks, raw[i]);
    }
    gint n = (gint)toks->len;

    gboolean ok = FALSE;
    /* Standard Unix ls -l: perm links owner group size month day time/year name... */
    if (n >= 9 && g_ascii_isdigit(((gchar *)toks->pdata[4])[0])) {
        gint64 sz = g_ascii_strtoll(toks->pdata[4], NULL, 10);
        e->is_dir = (line[0] == 'd');
        entry_set_size(e, sz);
        g_snprintf(e->date, FTP_MAX_DATE, "%s %s %s",
                   (gchar *)toks->pdata[5],
                   (gchar *)toks->pdata[6],
                   (gchar *)toks->pdata[7]);
        GString *nm = g_string_new(toks->pdata[8]);
        for (gint i = 9; i < n; i++) {
            g_string_append_c(nm, ' ');
            g_string_append(nm, toks->pdata[i]);
        }
        g_strlcpy(e->name, nm->str, FTP_MAX_NAME);
        g_string_free(nm, TRUE);
        ok = TRUE;
    } else if (n >= 4) {
        /* Fallback: last token is the name */
        e->is_dir = (line[0] == 'd');
        entry_set_size(e, 0);
        g_strlcpy(e->date, "-", FTP_MAX_DATE);
        g_strlcpy(e->name, toks->pdata[n - 1], FTP_MAX_NAME);
        ok = TRUE;
    }

    g_ptr_array_free(toks, FALSE);
    g_strfreev(raw);
    g_free(dup);

    if (!ok || !e->name[0] ||
        g_strcmp0(e->name, ".") == 0 || g_strcmp0(e->name, "..") == 0)
        return FALSE;
    return TRUE;
}

/* SFTP (and some FTP) listings: one bare filename per line */
static gboolean parse_plain_name_line(const gchar *line, FtpDirEntry *e) {
    if (!line || !line[0]) return FALSE;
    if (strchr(line, ' ') || strchr(line, '\t') ||
        strchr(line, '=') || strchr(line, ';'))
        return FALSE;
    g_strlcpy(e->name, line, FTP_MAX_NAME);
    if (g_strcmp0(e->name, ".") == 0 || g_strcmp0(e->name, "..") == 0)
        return FALSE;
    e->is_dir = FALSE;
    e->perm[0] = '?'; /* bare-name listing — probe type later */
    return TRUE;
}

static gboolean curl_probe_remote_dir(FtpSession *session, const gchar *remote_path) {
    gchar *base = build_url(session, remote_path);
    gchar *url = g_str_has_suffix(base, "/")
               ? g_strdup(base)
               : g_strdup_printf("%s/", base);
    g_free(base);

    MemBuf mem = { .buf = g_string_new(NULL) };
    CURL *curl = curl_easy_init();
    curl_apply_common(session, curl);
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_mem);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &mem);
    if (session->protocol != FTP_PROTOCOL_SFTP)
        curl_easy_setopt(curl, CURLOPT_TRANSFERTEXT, 1L);

    CURLcode res = curl_easy_perform(curl);
    gboolean is_dir = (res == CURLE_OK);
    g_string_free(mem.buf, TRUE);
    curl_easy_cleanup(curl);
    g_free(url);
    return is_dir;
}

static void listing_detect_dirs(FtpSession *session, GPtrArray *entries) {
    for (guint i = 0; i < entries->len; i++) {
        FtpDirEntry *e = g_ptr_array_index(entries, i);
        if (e->is_dir || e->perm[0] != '?')
            continue;
        if (curl_probe_remote_dir(session, e->path)) {
            e->is_dir = TRUE;
            g_strlcpy(e->perm, "drwxr-xr-x", FTP_MAX_PERM);
            g_strlcpy(e->size_text, "-", FTP_MAX_SIZE);
        } else {
            g_strlcpy(e->perm, "-rw-r--r--", FTP_MAX_PERM);
        }
    }
}

static void parse_listing(FtpSession *session, const gchar *raw,
                          GPtrArray *out, const gchar *base_path) {
    gchar **lines = g_strsplit(raw, "\n", -1);
    for (gint i = 0; lines[i]; i++) {
        gchar *line = g_strstrip(lines[i]);
        if (!line[0]) continue;

        FtpDirEntry *e = g_new0(FtpDirEntry, 1);
        entry_set_defaults(e);

        gboolean ok = FALSE;
        /* MLSD lines contain fact=value pairs separated by semicolons.
           Detect by presence of both '=' and ';' before falling back to
           Unix LIST format. */
        if (strchr(line, '=') && strchr(line, ';'))
            ok = parse_mlsd_line(line, e);
        else if (line[0] == 'd' || line[0] == '-' || line[0] == 'l')
            ok = parse_unix_list_line(line, e);
        else
            ok = parse_plain_name_line(line, e);

        if (!ok) {
            g_free(e);
            continue;
        }

        build_remote_path(e, base_path, e->name);
        g_ptr_array_add(out, e);
    }
    g_strfreev(lines);
    listing_detect_dirs(session, out);
}

static gboolean curl_ftp_mkdir_one(FtpSession *session, const gchar *remote,
                                     GError **err) {
    gchar *cmd = g_strdup_printf("MKD %s", remote);
    struct curl_slist *quote = curl_slist_append(NULL, cmd);
    g_free(cmd);

    gchar *url = build_url(session, "/");
    CURL *curl = curl_easy_init();
    curl_apply_common(session, curl);
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_NOBODY, 1L);
    curl_easy_setopt(curl, CURLOPT_QUOTE, quote);

    CURLcode res = curl_easy_perform(curl);
    curl_slist_free_all(quote);
    curl_easy_cleanup(curl);
    g_free(url);

    if (res != CURLE_OK) {
        if (err)
            g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                        "MKD %s failed: %s", remote, curl_easy_strerror(res));
        return FALSE;
    }
    return TRUE;
}

static gboolean curl_sftp_ensure_dir_one(FtpSession *session, const gchar *remote) {
    gchar *base = build_url(session, remote);
    gchar *url = g_str_has_suffix(base, "/")
               ? g_strdup(base)
               : g_strdup_printf("%s/", base);
    g_free(base);

    CURL *curl = curl_easy_init();
    curl_apply_common(session, curl);
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_UPLOAD, 1L);
    curl_easy_setopt(curl, CURLOPT_READFUNCTION, curl_empty_read);
    curl_easy_setopt(curl, CURLOPT_INFILESIZE, 0L);
    curl_easy_setopt(curl, CURLOPT_FTP_CREATE_MISSING_DIRS,
                     (long)CURLFTP_CREATE_DIR);

    CURLcode res = curl_easy_perform(curl);
    curl_easy_cleanup(curl);
    g_free(url);
    return (res == CURLE_OK);
}

static gboolean curl_ensure_remote_dir(FtpSession *session, const gchar *remote) {
    if (!remote || !remote[0] || g_strcmp0(remote, "/") == 0)
        return TRUE;

    const gchar *walk = remote[0] == '/' ? remote + 1 : remote;
    if (!walk[0]) return TRUE;

    gchar *dup = g_strdup(walk);
    gchar **parts = g_strsplit(dup, "/", -1);
    GString *accum = g_string_new("");

    for (guint i = 0; parts[i]; i++) {
        if (!parts[i][0]) continue;
        if (accum->len) g_string_append_c(accum, '/');
        g_string_append(accum, parts[i]);
        gchar *mkd = g_strdup_printf("/%s", accum->str);
        if (session->protocol == FTP_PROTOCOL_SFTP) {
            curl_sftp_ensure_dir_one(session, mkd);
        } else {
            GError *mkd_err = NULL;
            if (!curl_ftp_mkdir_one(session, mkd, &mkd_err))
                g_clear_error(&mkd_err);
        }
        g_free(mkd);
    }

    g_strfreev(parts);
    g_free(dup);
    g_string_free(accum, TRUE);
    return TRUE;
}

static void curl_apply_common(FtpSession *session, CURL *curl) {
    curl_easy_setopt(curl, CURLOPT_USERNAME, session->user);
    curl_easy_setopt(curl, CURLOPT_PASSWORD, session->password);
    curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 20L);
    curl_easy_setopt(curl, CURLOPT_LOW_SPEED_TIME, 60L);
    curl_easy_setopt(curl, CURLOPT_LOW_SPEED_LIMIT, 100L);
    curl_easy_setopt(curl, CURLOPT_TCP_KEEPALIVE, 1L);

    if (session->protocol == FTP_PROTOCOL_FTPS) {
        curl_easy_setopt(curl, CURLOPT_USE_SSL, (long)CURLUSESSL_ALL);
        curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
        curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 0L);
    }

    if (session->protocol == FTP_PROTOCOL_SFTP) {
        curl_easy_setopt(curl, CURLOPT_SSH_AUTH_TYPES,
                         (long)(CURLSSH_AUTH_PASSWORD | CURLSSH_AUTH_KEYBOARD));
        /* Not setting CURLOPT_SSH_KNOWNHOSTS disables host-key verification,
           which is acceptable for a development/testing client. */
    }
}

static int xfer_progress(void *clientp,
                         curl_off_t dltotal, curl_off_t dlnow,
                         curl_off_t ultotal, curl_off_t ulnow) {
    struct {
        FtpProgressFn fn;
        gpointer data;
        const gchar *label;
    } *ctx = clientp;
    if (!ctx || !ctx->fn) return 0;
    curl_off_t total = dltotal > 0 ? dltotal : ultotal;
    curl_off_t now   = dltotal > 0 ? dlnow   : ulnow;
    gint pct = total > 0 ? (gint)((now * 100) / total) : 0;
    ctx->fn(pct, ctx->label, ctx->data);
    return 0;
}

/* ── list ────────────────────────────────────────────────────────────── */

static GPtrArray *curl_list_directory(FtpSession *session, const gchar *path, GError **err) {
    GPtrArray *arr = g_ptr_array_new_with_free_func(g_free);
    gchar *base = build_url(session, path);
    /* libcurl requires a trailing slash to list a directory;
       without it, it attempts to download the path as a file. */
    gchar *url = g_str_has_suffix(base, "/")
               ? g_strdup(base)
               : g_strdup_printf("%s/", base);
    g_free(base);

    MemBuf mem = { .buf = g_string_new(NULL) };
    CURL *curl = curl_easy_init();
    curl_apply_common(session, curl);
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_mem);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &mem);
    if (session->protocol != FTP_PROTOCOL_SFTP)
        curl_easy_setopt(curl, CURLOPT_TRANSFERTEXT, 1L);

    CURLcode res = curl_easy_perform(curl);
    if (res != CURLE_OK) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "List failed: %s", curl_easy_strerror(res));
    } else {
        const gchar *norm = path && path[0] ? path : "/";
        parse_listing(session, mem.buf->str, arr, norm);
    }

    g_string_free(mem.buf, TRUE);
    curl_easy_cleanup(curl);
    g_free(url);
    return arr;
}

/* ── file transfer ───────────────────────────────────────────────────── */

static gboolean curl_download_file(FtpSession *session,
                                   const gchar *remote,
                                   const gchar *local,
                                   FtpProgressFn progress,
                                   gpointer progress_data,
                                   GError **err) {
    gchar *url = build_url(session, remote);
    FILE *out = fopen(local, "wb");
    if (!out) {
        g_free(url);
        g_set_error(err, G_FILE_ERROR, g_file_error_from_errno(errno),
                    "Cannot create file: %s", local);
        return FALSE;
    }

    struct { FtpProgressFn fn; gpointer data; const gchar *label; } ctx =
        { progress, progress_data, remote };

    CURL *curl = curl_easy_init();
    curl_apply_common(session, curl);
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, out);
    if (progress) {
        curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, xfer_progress);
        curl_easy_setopt(curl, CURLOPT_XFERINFODATA, &ctx);
        curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);
    }

    CURLcode res = curl_easy_perform(curl);
    fclose(out);
    curl_easy_cleanup(curl);
    g_free(url);

    if (res != CURLE_OK) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "Download failed: %s", curl_easy_strerror(res));
        return FALSE;
    }
    if (progress) progress(100, remote, progress_data);
    return TRUE;
}

static gboolean curl_upload_file(FtpSession *session,
                                 const gchar *local,
                                 const gchar *remote,
                                 FtpProgressFn progress,
                                 gpointer progress_data,
                                 GError **err) {
    gchar *url = build_url(session, remote);
    FILE *in = fopen(local, "rb");
    if (!in) {
        g_free(url);
        g_set_error(err, G_FILE_ERROR, g_file_error_from_errno(errno),
                    "Cannot open file: %s", local);
        return FALSE;
    }

    struct { FtpProgressFn fn; gpointer data; const gchar *label; } ctx =
        { progress, progress_data, local };

    CURL *curl = curl_easy_init();
    curl_apply_common(session, curl);
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_UPLOAD, 1L);
    curl_easy_setopt(curl, CURLOPT_READFUNCTION, read_file_cb);
    curl_easy_setopt(curl, CURLOPT_READDATA, in);

    struct stat st;
    if (fstat(fileno(in), &st) == 0)
        curl_easy_setopt(curl, CURLOPT_INFILESIZE_LARGE, (curl_off_t)st.st_size);

    if (progress) {
        curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, xfer_progress);
        curl_easy_setopt(curl, CURLOPT_XFERINFODATA, &ctx);
        curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);
    }

    curl_easy_setopt(curl, CURLOPT_FTP_CREATE_MISSING_DIRS,
                     (long)CURLFTP_CREATE_DIR_RETRY);

    CURLcode res = curl_easy_perform(curl);
    fclose(in);
    curl_easy_cleanup(curl);
    g_free(url);

    if (res != CURLE_OK) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "Upload failed: %s", curl_easy_strerror(res));
        return FALSE;
    }
    if (progress) progress(100, local, progress_data);
    return TRUE;
}

static gboolean entry_is_dir(FtpSession *session, FtpDirEntry *e) {
    if (e->is_dir || e->perm[0] == 'd')
        return TRUE;
    if (e->perm[0] == '-' || e->perm[0] == 'l')
        return FALSE;
    return curl_probe_remote_dir(session, e->path);
}

static gboolean curl_download_dir(FtpSession *session,
                                  const gchar *remote,
                                  const gchar *local,
                                  FtpProgressFn progress,
                                  gpointer progress_data,
                                  GError **err) {
    if (g_mkdir_with_parents(local, 0755) < 0 && errno != EEXIST) {
        g_set_error(err, G_FILE_ERROR, g_file_error_from_errno(errno),
                    "Cannot create directory: %s", local);
        return FALSE;
    }

    if (progress)
        progress(0, remote, progress_data);

    GPtrArray *entries = curl_list_directory(session, remote, err);
    if (!entries)
        return FALSE;

    gboolean ok = TRUE;
    for (guint i = 0; i < entries->len; i++) {
        FtpDirEntry *e = g_ptr_array_index(entries, i);
        if (g_strcmp0(e->name, ".") == 0 || g_strcmp0(e->name, "..") == 0)
            continue;

        gchar *child_local = g_build_filename(local, e->name, NULL);
        if (entry_is_dir(session, e)) {
            if (!curl_download_dir(session, e->path, child_local,
                                   progress, progress_data, err))
                ok = FALSE;
        } else {
            GError *ferr = NULL;
            if (!curl_download_file(session, e->path, child_local,
                                    progress, progress_data, &ferr)) {
                g_clear_error(&ferr);
                if (curl_probe_remote_dir(session, e->path)) {
                    if (!curl_download_dir(session, e->path, child_local,
                                           progress, progress_data, err))
                        ok = FALSE;
                } else {
                    ok = FALSE;
                }
            }
        }
        g_free(child_local);
    }
    g_ptr_array_unref(entries);
    if (progress)
        progress(100, remote, progress_data);
    return ok;
}

static gboolean curl_upload_dir(FtpSession *session,
                                const gchar *local,
                                const gchar *remote,
                                FtpProgressFn progress,
                                gpointer progress_data,
                                GError **err) {
    if (!g_file_test(local, G_FILE_TEST_IS_DIR)) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "Not a local directory: %s", local);
        return FALSE;
    }

    curl_ensure_remote_dir(session, remote);

    GDir *dir = g_dir_open(local, 0, NULL);
    if (!dir) {
        g_set_error(err, G_FILE_ERROR, g_file_error_from_errno(errno),
                    "Cannot open local directory: %s", local);
        return FALSE;
    }

    if (progress)
        progress(0, remote, progress_data);

    gboolean ok = TRUE;
    const gchar *name;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (g_strcmp0(name, ".") == 0 || g_strcmp0(name, "..") == 0)
            continue;

        gchar *lp = g_build_filename(local, name, NULL);
        gchar *rp = build_remote_child_path(remote, name);

        if (local_path_is_directory(lp)) {
            if (!curl_upload_dir(session, lp, rp, progress, progress_data, err))
                ok = FALSE;
        } else {
            if (!curl_upload_file(session, lp, rp, progress, progress_data, err))
                ok = FALSE;
        }
        g_free(lp);
        g_free(rp);
    }
    g_dir_close(dir);
    if (progress)
        progress(100, remote, progress_data);
    return ok;
}

/* ── delete ──────────────────────────────────────────────────────────── */

static gboolean curl_delete_entry(FtpSession *session, const gchar *path,
                                   gboolean is_dir, GError **err) {
    /* Use POSTQUOTE to send DELE (file) or RMD (dir) after connecting */
    const gchar *verb = is_dir ? "RMD" : "DELE";
    gchar *cmd = g_strdup_printf("%s %s", verb, path);
    struct curl_slist *pq = curl_slist_append(NULL, cmd);
    g_free(cmd);

    gchar *url = build_url(session, "/");
    CURL *curl = curl_easy_init();
    curl_apply_common(session, curl);
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_NOBODY, 1L);
    curl_easy_setopt(curl, CURLOPT_POSTQUOTE, pq);

    CURLcode res = curl_easy_perform(curl);
    curl_slist_free_all(pq);
    curl_easy_cleanup(curl);
    g_free(url);

    if (res != CURLE_OK) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "삭제 실패: %s", curl_easy_strerror(res));
        return FALSE;
    }
    return TRUE;
}

/* ── public API ──────────────────────────────────────────────────────── */

FtpSession *ftp_session_new(void) {
    static gboolean curl_inited = FALSE;
    if (!curl_inited) {
        curl_global_init(CURL_GLOBAL_DEFAULT);
        curl_inited = TRUE;
    }
    return g_new0(FtpSession, 1);
}

void ftp_session_free(FtpSession *session) {
    if (!session) return;
    ftp_session_disconnect(session);
    g_free(session->host);
    g_free(session->user);
    g_free(session->password);
    g_free(session);
}

gboolean ftp_session_is_connected(FtpSession *session) {
    return session && session->connected;
}

void ftp_session_disconnect(FtpSession *session) {
    if (!session) return;
    session->connected = FALSE;
}

gboolean ftp_session_connect(FtpSession *session,
                             FtpProtocol protocol,
                             const gchar *host,
                             gint port,
                             const gchar *user,
                             const gchar *password,
                             GError **err) {
    g_return_val_if_fail(session != NULL, FALSE);

    ftp_session_disconnect(session);
    session->protocol = protocol;
    g_free(session->host);
    g_free(session->user);
    g_free(session->password);
    session->host     = g_strdup(host);
    session->user     = g_strdup(user ? user : "");
    session->password = g_strdup(password ? password : "");
    session->port     = port > 0 ? port : ftp_default_port(protocol);

    /* For SFTP, do a directory list of "/" to verify connectivity.
       For FTP/FTPS, use NOBODY (NOOP) which is lighter. */
    CURLcode res;
    if (session->protocol == FTP_PROTOCOL_SFTP) {
        gchar *base = build_url(session, "/");
        gchar *url  = g_str_has_suffix(base, "/") ? g_strdup(base)
                                                   : g_strdup_printf("%s/", base);
        g_free(base);
        MemBuf mem = { .buf = g_string_new(NULL) };
        CURL *curl = curl_easy_init();
        curl_apply_common(session, curl);
        curl_easy_setopt(curl, CURLOPT_URL, url);
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_mem);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &mem);
        res = curl_easy_perform(curl);
        g_string_free(mem.buf, TRUE);
        curl_easy_cleanup(curl);
        g_free(url);
    } else {
        gchar *url = build_url(session, "/");
        CURL *curl = curl_easy_init();
        curl_apply_common(session, curl);
        curl_easy_setopt(curl, CURLOPT_URL, url);
        curl_easy_setopt(curl, CURLOPT_NOBODY, 1L);
        res = curl_easy_perform(curl);
        curl_easy_cleanup(curl);
        g_free(url);
    }

    if (res != CURLE_OK && res != CURLE_REMOTE_FILE_NOT_FOUND) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "Connect failed: %s", curl_easy_strerror(res));
        return FALSE;
    }

    session->connected = TRUE;
    return TRUE;
}

GPtrArray *ftp_session_list_directory(FtpSession *session,
                                      const gchar *remote_path,
                                      GError **err) {
    if (!ftp_session_is_connected(session)) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Not connected");
        return g_ptr_array_new_with_free_func(g_free);
    }
    return curl_list_directory(session, remote_path, err);
}

gboolean ftp_session_download(FtpSession *session,
                              const gchar *remote_path,
                              const gchar *local_path,
                              gboolean is_directory,
                              FtpProgressFn progress,
                              gpointer progress_data,
                              GError **err) {
    if (!ftp_session_is_connected(session)) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Not connected");
        return FALSE;
    }
    return is_directory
        ? curl_download_dir(session, remote_path, local_path, progress, progress_data, err)
        : curl_download_file(session, remote_path, local_path, progress, progress_data, err);
}

gboolean ftp_session_delete(FtpSession *session,
                            const gchar *remote_path,
                            gboolean is_directory,
                            GError **err) {
    if (!ftp_session_is_connected(session)) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Not connected");
        return FALSE;
    }
    if (session->protocol == FTP_PROTOCOL_SFTP) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_NOSYS,
                    "SFTP 삭제는 지원되지 않습니다");
        return FALSE;
    }
    return curl_delete_entry(session, remote_path, is_directory, err);
}

gboolean ftp_session_upload(FtpSession *session,
                            const gchar *local_path,
                            const gchar *remote_path,
                            gboolean is_directory,
                            FtpProgressFn progress,
                            gpointer progress_data,
                            GError **err) {
    if (!ftp_session_is_connected(session)) {
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Not connected");
        return FALSE;
    }
    return is_directory
        ? curl_upload_dir(session, local_path, remote_path, progress, progress_data, err)
        : curl_upload_file(session, local_path, remote_path, progress, progress_data, err);
}
