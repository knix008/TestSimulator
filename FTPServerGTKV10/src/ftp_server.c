#include "ftp_server.h"
#include "virtual_fs.h"
#include "log_manager.h"
#include "platform.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <time.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/stat.h>
#include <pthread.h>
#include <ctype.h>
#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/pkcs12.h>

/* ---- passive port range ----------------------------------------------- */
#define PASV_PORT_MIN 50000
#define PASV_PORT_MAX 59999

/* ---- session state ----------------------------------------------------- */
typedef enum { AUTH_NONE, AUTH_NEED_PASS, AUTH_OK } AuthState;

typedef struct {
    FtpServer  *srv;
    int         ctrl_fd;
    SSL        *ssl;         /* control channel TLS */
    SSL        *data_ssl;    /* data channel TLS (FTPS) */
    char        cwd[MAX_PATH_LEN];
    AuthState   auth;
    UserEntry  *user;        /* pointer into settings->users */
    bool        allow_anon;
    char        type;        /* 'A' or 'I' */
    int         pasv_listen_fd;
    char        rnfr[MAX_PATH_LEN];
    VirtualFS   vfs;
    bool        quit;
} Session;

/* ---- I/O helpers ------------------------------------------------------- */

static ssize_t sess_write(Session *s, const void *buf, size_t len) {
    if (s->ssl) return SSL_write(s->ssl, buf, (int)len);
    return write(s->ctrl_fd, buf, len);
}

static ssize_t sess_read(Session *s, void *buf, size_t len) {
    if (s->ssl) return SSL_read(s->ssl, buf, (int)len);
    return read(s->ctrl_fd, buf, len);
}

static void send_resp(Session *s, int code, const char *msg) {
    char line[1024];
    snprintf(line, sizeof(line), "%d %s\r\n", code, msg);
    sess_write(s, line, strlen(line));
}

static void send_resp_multi_start(Session *s, int code, const char *msg) {
    char line[1024];
    snprintf(line, sizeof(line), "%d-%s\r\n", code, msg);
    sess_write(s, line, strlen(line));
}

static void send_resp_multi_end(Session *s, int code, const char *msg) {
    char line[256];
    snprintf(line, sizeof(line), "%d %s\r\n", code, msg);
    sess_write(s, line, strlen(line));
}

/* Read one CRLF-terminated line from control connection. */
static bool recv_line(Session *s, char *buf, size_t buflen) {
    size_t n = 0;
    while (n < buflen - 1) {
        char c;
        ssize_t r = sess_read(s, &c, 1);
        if (r <= 0) return false;
        if (c == '\r') continue;
        if (c == '\n') break;
        buf[n++] = c;
    }
    buf[n] = '\0';
    return true;
}

/* ---- data connection (PASV) ------------------------------------------- */

/* Bind a random port in PASV_PORT_MIN..PASV_PORT_MAX on 0.0.0.0.
   Returns listening fd, or -1 on failure. Sets *port. */
static int pasv_bind(int *port) {
    for (int p = PASV_PORT_MIN; p <= PASV_PORT_MAX; p++) {
        int fd = socket(AF_INET, SOCK_STREAM, 0);
        if (fd < 0) continue;
        int opt = 1;
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
        struct sockaddr_in addr = { .sin_family = AF_INET,
                                    .sin_port   = htons((uint16_t)p),
                                    .sin_addr   = {.s_addr = INADDR_ANY} };
        if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) == 0) {
            listen(fd, 1);
            *port = p;
            return fd;
        }
        close(fd);
    }
    return -1;
}

/* Accept the data connection (with 30-second timeout). */
static int accept_data(int listen_fd) {
    struct timeval tv = { .tv_sec = 30 };
    fd_set fds;
    FD_ZERO(&fds);
    FD_SET(listen_fd, &fds);
    if (select(listen_fd + 1, &fds, NULL, NULL, &tv) <= 0) return -1;
    return accept(listen_fd, NULL, NULL);
}

static ssize_t data_write(Session *s, int data_fd, const void *buf, size_t n) {
    if (s->data_ssl) return SSL_write(s->data_ssl, buf, (int)n);
    return write(data_fd, buf, n);
}
static ssize_t data_read(Session *s, int data_fd, void *buf, size_t n) {
    if (s->data_ssl) return SSL_read(s->data_ssl, buf, (int)n);
    return read(data_fd, buf, n);
}

/* Accept data connection and wrap in TLS if FTPS. Returns fd or -1. */
static int open_data_connection(Session *s) {
    int dfd = accept_data(s->pasv_listen_fd);
    close(s->pasv_listen_fd); s->pasv_listen_fd = -1;
    if (dfd < 0) return -1;
    if (s->srv->use_tls && s->srv->ssl_ctx) {
        s->data_ssl = SSL_new(s->srv->ssl_ctx);
        SSL_set_fd(s->data_ssl, dfd);
        if (SSL_accept(s->data_ssl) <= 0) {
            SSL_free(s->data_ssl); s->data_ssl = NULL;
            close(dfd);
            return -1;
        }
    }
    return dfd;
}

static void close_data_connection(Session *s, int dfd) {
    if (s->data_ssl) {
        SSL_shutdown(s->data_ssl);
        SSL_free(s->data_ssl);
        s->data_ssl = NULL;
    }
    if (dfd >= 0) close(dfd);
}

/* ---- authentication helper -------------------------------------------- */

static UserEntry *find_user(FtpServer *srv, const char *username) {
    ServerSettings *cfg = srv->settings;
    for (int i = 0; i < cfg->user_count; i++) {
        if (strcasecmp(cfg->users[i].username, username) == 0)
            return &cfg->users[i];
    }
    return NULL;
}

/* ---- FTP command handlers --------------------------------------------- */

static void cmd_user(Session *s, const char *arg) {
    if (!arg || !*arg) { send_resp(s, 501, "Syntax error."); return; }
    s->auth = AUTH_NEED_PASS;
    if (strcmp(arg, "anonymous") == 0 && s->srv->settings->allow_anonymous) {
        s->user      = NULL;
        s->allow_anon = true;
        send_resp(s, 331, "Guest login ok, send your email as password.");
    } else {
        s->allow_anon = false;
        s->user = find_user(s->srv, arg);
        send_resp(s, 331, "Password required.");
    }
}

static void cmd_pass(Session *s, const char *arg) {
    if (s->auth != AUTH_NEED_PASS) {
        send_resp(s, 503, "Login with USER first."); return;
    }
    if (s->allow_anon) {
        s->auth = AUTH_OK;
        log_manager_log("Anonymous login from ctrl_fd=%d", s->ctrl_fd);
        send_resp(s, 230, "Guest login ok.");
        return;
    }
    if (s->user && strcmp(s->user->password, arg ? arg : "") == 0) {
        s->auth = AUTH_OK;
        log_manager_log("User '%s' logged in", s->user->username);
        send_resp(s, 230, "Login successful.");
    } else {
        s->auth = AUTH_NONE;
        s->user = NULL;
        log_manager_log("Login failed");
        send_resp(s, 530, "Login incorrect.");
    }
}

static bool check_read(Session *s) {
    if (s->auth != AUTH_OK) { send_resp(s, 530, "Not logged in."); return false; }
    if (!s->user) return true; /* anonymous read-only */
    if (!s->user->can_read) { send_resp(s, 550, "Permission denied."); return false; }
    return true;
}

static bool check_write(Session *s) {
    if (s->auth != AUTH_OK) { send_resp(s, 530, "Not logged in."); return false; }
    if (!s->user) { send_resp(s, 550, "Permission denied."); return false; }
    if (!s->user->can_write) { send_resp(s, 550, "Permission denied."); return false; }
    return true;
}

static void cmd_syst(Session *s) {
    send_resp(s, 215, "UNIX Type: L8");
}

static void cmd_feat(Session *s) {
    send_resp_multi_start(s, 211, "Features:");
    sess_write(s, " PASV\r\n", 7);
    sess_write(s, " MLST type*;size*;modify*;perm*;\r\n", 34);
    sess_write(s, " UTF8\r\n", 7);
    sess_write(s, " SIZE\r\n", 7);
    sess_write(s, " MDTM\r\n", 7);
    send_resp_multi_end(s, 211, "End");
}

static void cmd_type(Session *s, const char *arg) {
    if (!arg) { send_resp(s, 501, "Syntax error."); return; }
    if (toupper((unsigned char)arg[0]) == 'A') {
        s->type = 'A';
        send_resp(s, 200, "Type set to A.");
    } else if (toupper((unsigned char)arg[0]) == 'I') {
        s->type = 'I';
        send_resp(s, 200, "Type set to I.");
    } else {
        send_resp(s, 504, "Command not implemented for that parameter.");
    }
}

static void cmd_pwd(Session *s) {
    if (s->auth != AUTH_OK) { send_resp(s, 530, "Not logged in."); return; }
    char msg[MAX_PATH_LEN + 8];
    snprintf(msg, sizeof(msg), "\"%s\" is current directory.", s->cwd);
    send_resp(s, 257, msg);
}

static void cmd_cwd(Session *s, const char *arg) {
    if (!check_read(s)) return;
    if (!arg || !*arg) { send_resp(s, 501, "Syntax error."); return; }

    char newcwd[MAX_PATH_LEN];
    if (arg[0] == '/') {
        str_copy(newcwd, arg, sizeof(newcwd));
    } else {
        if (strcmp(s->cwd, "/") == 0)
            snprintf(newcwd, sizeof(newcwd), "/%s", arg);
        else
            snprintf(newcwd, sizeof(newcwd), "%s/%s", s->cwd, arg);
    }
    vfs_normalize(newcwd);

    if (!vfs_is_dir(&s->vfs, newcwd)) {
        send_resp(s, 550, "No such file or directory.");
        return;
    }
    str_copy(s->cwd, newcwd, sizeof(s->cwd));
    send_resp(s, 250, "CWD command successful.");
}

static void cmd_cdup(Session *s) {
    if (!check_read(s)) return;
    char newcwd[MAX_PATH_LEN];
    str_copy(newcwd, s->cwd, sizeof(newcwd));
    char *slash = strrchr(newcwd, '/');
    if (slash && slash != newcwd) *slash = '\0';
    else strcpy(newcwd, "/");
    vfs_normalize(newcwd);
    str_copy(s->cwd, newcwd, sizeof(s->cwd));
    send_resp(s, 200, "CDUP command successful.");
}

static void cmd_pasv(Session *s) {
    if (s->auth != AUTH_OK) { send_resp(s, 530, "Not logged in."); return; }
    if (s->pasv_listen_fd >= 0) { close(s->pasv_listen_fd); s->pasv_listen_fd = -1; }
    int port = 0;
    int fd = pasv_bind(&port);
    if (fd < 0) { send_resp(s, 425, "Cannot open passive connection."); return; }
    s->pasv_listen_fd = fd;

    /* Get local IP */
    struct sockaddr_in sin; socklen_t slen = sizeof(sin);
    getsockname(s->ctrl_fd, (struct sockaddr *)&sin, &slen);
    unsigned char *ip = (unsigned char *)&sin.sin_addr.s_addr;
    char msg[128];
    snprintf(msg, sizeof(msg),
             "Entering Passive Mode (%u,%u,%u,%u,%u,%u).",
             ip[0], ip[1], ip[2], ip[3],
             (unsigned)(port >> 8), (unsigned)(port & 0xFF));
    send_resp(s, 227, msg);
}

static void cmd_list(Session *s, const char *arg) {
    if (!check_read(s)) return;
    if (s->pasv_listen_fd < 0) { send_resp(s, 425, "Use PASV first."); return; }

    char target[MAX_PATH_LEN];
    if (arg && *arg && arg[0] != '-')
        str_copy(target, arg, sizeof(target));
    else
        str_copy(target, s->cwd, sizeof(target));
    vfs_normalize(target);

    send_resp(s, 150, "Here comes the directory listing.");
    int dfd = open_data_connection(s);
    if (dfd < 0) { send_resp(s, 425, "Cannot open data connection."); return; }

    char *listing = vfs_list(&s->vfs, target);
    if (listing) {
        data_write(s, dfd, listing, strlen(listing));
        free(listing);
    }
    close_data_connection(s, dfd);
    send_resp(s, 226, "Directory send OK.");
}

static void cmd_mlsd(Session *s, const char *arg) {
    if (!check_read(s)) return;
    if (s->pasv_listen_fd < 0) { send_resp(s, 425, "Use PASV first."); return; }

    char target[MAX_PATH_LEN];
    str_copy(target, (arg && *arg) ? arg : s->cwd, sizeof(target));
    vfs_normalize(target);

    send_resp(s, 150, "Here comes the directory listing.");
    int dfd = open_data_connection(s);
    if (dfd < 0) { send_resp(s, 425, "Cannot open data connection."); return; }

    char *listing = vfs_mlsd(&s->vfs, target);
    if (listing) {
        data_write(s, dfd, listing, strlen(listing));
        free(listing);
    }
    close_data_connection(s, dfd);
    send_resp(s, 226, "Directory send OK.");
}

static void cmd_retr(Session *s, const char *arg) {
    if (!check_read(s)) return;
    if (!arg || !*arg) { send_resp(s, 501, "Syntax error."); return; }
    if (s->pasv_listen_fd < 0) { send_resp(s, 425, "Use PASV first."); return; }

    char vpath[MAX_PATH_LEN];
    if (arg[0] == '/') str_copy(vpath, arg, sizeof(vpath));
    else snprintf(vpath, sizeof(vpath), "%s/%s", s->cwd, arg);
    vfs_normalize(vpath);

    char ppath[MAX_PATH_LEN];
    if (!vfs_resolve(&s->vfs, vpath, ppath, sizeof(ppath)) || ppath[0] == '\0') {
        send_resp(s, 550, "No such file."); return;
    }

    int file_fd = open(ppath, O_RDONLY);
    if (file_fd < 0) { send_resp(s, 550, "Cannot open file."); return; }

    struct stat st;
    fstat(file_fd, &st);
    char msg[64];
    snprintf(msg, sizeof(msg), "Opening BINARY mode data connection (%lld bytes).",
             (long long)st.st_size);
    send_resp(s, 150, msg);

    int dfd = open_data_connection(s);
    if (dfd < 0) { close(file_fd); send_resp(s, 425, "Cannot open data connection."); return; }

    int bufsz = (s->srv->settings->buffer_size_kb > 0 ?
                 s->srv->settings->buffer_size_kb : 64) * 1024;
    char *buf = malloc(bufsz);
    long total = 0;
    ssize_t n;
    while ((n = read(file_fd, buf, bufsz)) > 0) {
        ssize_t written = 0;
        while (written < n) {
            ssize_t w = data_write(s, dfd, buf + written, n - written);
            if (w <= 0) goto retr_done;
            written += w;
        }
        total += n;
    }
retr_done:
    free(buf);
    close(file_fd);
    close_data_connection(s, dfd);
    log_manager_log("RETR %s (%ld bytes)", arg, total);

    /* Stats callback */
    pthread_mutex_lock(&s->srv->stats_mutex);
    s->srv->download_count++;
    s->srv->download_bytes += total;
    pthread_mutex_unlock(&s->srv->stats_mutex);
    if (s->srv->dn_cb) s->srv->dn_cb(arg, total, s->srv->dn_ud);

    send_resp(s, 226, "Transfer complete.");
}

static void cmd_stor(Session *s, const char *arg) {
    if (!check_write(s)) return;
    if (!arg || !*arg) { send_resp(s, 501, "Syntax error."); return; }
    if (s->pasv_listen_fd < 0) { send_resp(s, 425, "Use PASV first."); return; }

    char vpath[MAX_PATH_LEN];
    if (arg[0] == '/') str_copy(vpath, arg, sizeof(vpath));
    else snprintf(vpath, sizeof(vpath), "%s/%s", s->cwd, arg);
    vfs_normalize(vpath);

    char ppath[MAX_PATH_LEN];
    if (!vfs_resolve(&s->vfs, vpath, ppath, sizeof(ppath)) || ppath[0] == '\0') {
        send_resp(s, 550, "Cannot store file."); return;
    }

    int file_fd = open(ppath, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (file_fd < 0) { send_resp(s, 550, "Cannot create file."); return; }

    send_resp(s, 150, "Ok to send data.");
    int dfd = open_data_connection(s);
    if (dfd < 0) { close(file_fd); send_resp(s, 425, "Cannot open data connection."); return; }

    int bufsz = (s->srv->settings->buffer_size_kb > 0 ?
                 s->srv->settings->buffer_size_kb : 64) * 1024;
    char *buf = malloc(bufsz);
    long total = 0;
    ssize_t n;
    while ((n = data_read(s, dfd, buf, bufsz)) > 0) {
        if (write(file_fd, buf, n) < 0) break;
        total += n;
    }
    free(buf);
    close(file_fd);
    close_data_connection(s, dfd);
    log_manager_log("STOR %s (%ld bytes)", arg, total);

    pthread_mutex_lock(&s->srv->stats_mutex);
    s->srv->upload_count++;
    s->srv->upload_bytes += total;
    pthread_mutex_unlock(&s->srv->stats_mutex);
    if (s->srv->up_cb) s->srv->up_cb(arg, total, s->srv->up_ud);

    send_resp(s, 226, "Transfer complete.");
}

static void cmd_dele(Session *s, const char *arg) {
    if (!check_write(s)) return;
    if (!arg || !*arg) { send_resp(s, 501, "Syntax error."); return; }
    char vpath[MAX_PATH_LEN];
    if (arg[0] == '/') str_copy(vpath, arg, sizeof(vpath));
    else snprintf(vpath, sizeof(vpath), "%s/%s", s->cwd, arg);
    vfs_normalize(vpath);
    if (vfs_remove(&s->vfs, vpath)) send_resp(s, 250, "File deleted.");
    else send_resp(s, 550, "Delete failed.");
}

static void cmd_mkd(Session *s, const char *arg) {
    if (!check_write(s)) return;
    if (!arg || !*arg) { send_resp(s, 501, "Syntax error."); return; }
    char vpath[MAX_PATH_LEN];
    if (arg[0] == '/') str_copy(vpath, arg, sizeof(vpath));
    else snprintf(vpath, sizeof(vpath), "%s/%s", s->cwd, arg);
    vfs_normalize(vpath);
    if (vfs_mkdir(&s->vfs, vpath)) {
        char msg[MAX_PATH_LEN + 4];
        snprintf(msg, sizeof(msg), "\"%s\" created.", vpath);
        send_resp(s, 257, msg);
    } else {
        send_resp(s, 550, "Create directory failed.");
    }
}

static void cmd_rmd(Session *s, const char *arg) {
    if (!check_write(s)) return;
    if (!arg || !*arg) { send_resp(s, 501, "Syntax error."); return; }
    char vpath[MAX_PATH_LEN];
    if (arg[0] == '/') str_copy(vpath, arg, sizeof(vpath));
    else snprintf(vpath, sizeof(vpath), "%s/%s", s->cwd, arg);
    vfs_normalize(vpath);
    if (vfs_rmdir(&s->vfs, vpath)) send_resp(s, 250, "Directory removed.");
    else send_resp(s, 550, "Remove directory failed.");
}

static void cmd_rnfr(Session *s, const char *arg) {
    if (!check_write(s)) return;
    if (!arg || !*arg) { send_resp(s, 501, "Syntax error."); return; }
    char vpath[MAX_PATH_LEN];
    if (arg[0] == '/') str_copy(vpath, arg, sizeof(vpath));
    else snprintf(vpath, sizeof(vpath), "%s/%s", s->cwd, arg);
    vfs_normalize(vpath);
    str_copy(s->rnfr, vpath, sizeof(s->rnfr));
    send_resp(s, 350, "Ready for destination name.");
}

static void cmd_rnto(Session *s, const char *arg) {
    if (!check_write(s)) return;
    if (!s->rnfr[0]) { send_resp(s, 503, "RNFR required first."); return; }
    if (!arg || !*arg) { send_resp(s, 501, "Syntax error."); return; }
    char vpath[MAX_PATH_LEN];
    if (arg[0] == '/') str_copy(vpath, arg, sizeof(vpath));
    else snprintf(vpath, sizeof(vpath), "%s/%s", s->cwd, arg);
    vfs_normalize(vpath);
    if (vfs_rename(&s->vfs, s->rnfr, vpath)) {
        send_resp(s, 250, "Rename successful.");
    } else {
        send_resp(s, 550, "Rename failed.");
    }
    s->rnfr[0] = '\0';
}

static void cmd_size(Session *s, const char *arg) {
    if (!check_read(s)) return;
    if (!arg || !*arg) { send_resp(s, 501, "Syntax error."); return; }
    char vpath[MAX_PATH_LEN];
    if (arg[0] == '/') str_copy(vpath, arg, sizeof(vpath));
    else snprintf(vpath, sizeof(vpath), "%s/%s", s->cwd, arg);
    vfs_normalize(vpath);
    struct stat st;
    if (!vfs_stat(&s->vfs, vpath, &st)) { send_resp(s, 550, "No such file."); return; }
    char msg[32];
    snprintf(msg, sizeof(msg), "%lld", (long long)st.st_size);
    send_resp(s, 213, msg);
}

static void cmd_mdtm(Session *s, const char *arg) {
    if (!check_read(s)) return;
    if (!arg || !*arg) { send_resp(s, 501, "Syntax error."); return; }
    char vpath[MAX_PATH_LEN];
    if (arg[0] == '/') str_copy(vpath, arg, sizeof(vpath));
    else snprintf(vpath, sizeof(vpath), "%s/%s", s->cwd, arg);
    vfs_normalize(vpath);
    struct stat st;
    if (!vfs_stat(&s->vfs, vpath, &st)) { send_resp(s, 550, "No such file."); return; }
    char msg[20];
    struct tm *t = gmtime(&st.st_mtime);
    strftime(msg, sizeof(msg), "%Y%m%d%H%M%S", t);
    send_resp(s, 213, msg);
}

/* ---- main command dispatcher ------------------------------------------ */

static void process_command(Session *s, char *line) {
    /* split "CMD ARG" */
    char *cmd = line;
    char *arg = strchr(line, ' ');
    if (arg) { *arg = '\0'; arg++; while (*arg == ' ') arg++; }

    /* Convert command to upper-case */
    for (char *p = cmd; *p; p++) *p = toupper((unsigned char)*p);

    if      (!strcmp(cmd, "USER"))   cmd_user(s, arg);
    else if (!strcmp(cmd, "PASS"))   cmd_pass(s, arg);
    else if (!strcmp(cmd, "QUIT"))   { send_resp(s, 221, "Goodbye."); s->quit = true; }
    else if (!strcmp(cmd, "SYST"))   cmd_syst(s);
    else if (!strcmp(cmd, "FEAT"))   cmd_feat(s);
    else if (!strcmp(cmd, "NOOP"))   send_resp(s, 200, "OK.");
    else if (!strcmp(cmd, "TYPE"))   cmd_type(s, arg);
    else if (!strcmp(cmd, "MODE"))   send_resp(s, 200, "Mode set to S.");
    else if (!strcmp(cmd, "STRU"))   send_resp(s, 200, "Structure set to F.");
    else if (!strcmp(cmd, "PWD") ||
             !strcmp(cmd, "XPWD"))   cmd_pwd(s);
    else if (!strcmp(cmd, "CWD") ||
             !strcmp(cmd, "XCWD"))   cmd_cwd(s, arg);
    else if (!strcmp(cmd, "CDUP") ||
             !strcmp(cmd, "XCUP"))   cmd_cdup(s);
    else if (!strcmp(cmd, "PASV"))   cmd_pasv(s);
    else if (!strcmp(cmd, "LIST"))   cmd_list(s, arg);
    else if (!strcmp(cmd, "NLST"))   cmd_list(s, arg);
    else if (!strcmp(cmd, "MLSD"))   cmd_mlsd(s, arg);
    else if (!strcmp(cmd, "RETR"))   cmd_retr(s, arg);
    else if (!strcmp(cmd, "STOR"))   cmd_stor(s, arg);
    else if (!strcmp(cmd, "APPE"))   cmd_stor(s, arg);
    else if (!strcmp(cmd, "DELE"))   cmd_dele(s, arg);
    else if (!strcmp(cmd, "MKD") ||
             !strcmp(cmd, "XMKD"))   cmd_mkd(s, arg);
    else if (!strcmp(cmd, "RMD") ||
             !strcmp(cmd, "XRMD"))   cmd_rmd(s, arg);
    else if (!strcmp(cmd, "RNFR"))   cmd_rnfr(s, arg);
    else if (!strcmp(cmd, "RNTO"))   cmd_rnto(s, arg);
    else if (!strcmp(cmd, "SIZE"))   cmd_size(s, arg);
    else if (!strcmp(cmd, "MDTM"))   cmd_mdtm(s, arg);
    else if (!strcmp(cmd, "ABOR"))   send_resp(s, 226, "ABOR command successful.");
    else if (!strcmp(cmd, "OPTS"))   send_resp(s, 200, "OK.");
    else if (!strcmp(cmd, "HELP"))   send_resp(s, 214, "Help OK.");
    else
        send_resp(s, 502, "Command not implemented.");
}

/* ---- session thread ----------------------------------------------------- */

static void *session_thread(void *arg) {
    Session *s = arg;

    /* FTPS: do SSL handshake */
    if (s->srv->use_tls && s->srv->ssl_ctx) {
        s->ssl = SSL_new(s->srv->ssl_ctx);
        SSL_set_fd(s->ssl, s->ctrl_fd);
        if (SSL_accept(s->ssl) <= 0) {
            char errbuf[256];
            ERR_error_string_n(ERR_get_error(), errbuf, sizeof(errbuf));
            log_manager_log("FTPS TLS 핸드셰이크 실패: %s", errbuf);
            FtpServer *srv = s->srv;
            SSL_free(s->ssl);
            close(s->ctrl_fd);
            free(s);
            pthread_mutex_lock(&srv->stats_mutex);
            srv->cur_clients--;
            pthread_mutex_unlock(&srv->stats_mutex);
            return NULL;
        }
    }

    send_resp(s, 220, "FTPServerGTK ready.");

    char line[2048];
    while (!s->quit && recv_line(s, line, sizeof(line))) {
        process_command(s, line);
    }

    /* cleanup */
    if (s->pasv_listen_fd >= 0) { close(s->pasv_listen_fd); }
    if (s->data_ssl) { SSL_shutdown(s->data_ssl); SSL_free(s->data_ssl); }
    if (s->ssl) { SSL_shutdown(s->ssl); SSL_free(s->ssl); }
    close(s->ctrl_fd);
    vfs_destroy(&s->vfs);

    pthread_mutex_lock(&s->srv->stats_mutex);
    int cur = --s->srv->cur_clients;
    int tot = s->srv->tot_clients;
    pthread_mutex_unlock(&s->srv->stats_mutex);

    if (s->srv->count_cb) s->srv->count_cb(cur, tot, s->srv->count_ud);
    log_manager_log("Client disconnected (fd=%d)", s->ctrl_fd);
    free(s);
    return NULL;
}

/* ---- accept loop ------------------------------------------------------- */

static void *accept_loop(void *arg) {
    FtpServer *srv = arg;
    log_manager_log("FTP%s server listening on port %d",
                    srv->use_tls ? "S" : "", 0); /* port logged in start() */

    while (srv->running) {
        struct timeval tv = { .tv_sec = 1 };
        fd_set fds;
        FD_ZERO(&fds);
        FD_SET(srv->listen_fd, &fds);
        int r = select(srv->listen_fd + 1, &fds, NULL, NULL, &tv);
        if (r <= 0) continue;

        struct sockaddr_in addr;
        socklen_t alen = sizeof(addr);
        int cfd = accept(srv->listen_fd, (struct sockaddr *)&addr, &alen);
        if (cfd < 0) continue;

        pthread_mutex_lock(&srv->stats_mutex);
        int cur = ++srv->cur_clients;
        int tot = ++srv->tot_clients;
        pthread_mutex_unlock(&srv->stats_mutex);

        if (srv->count_cb) srv->count_cb(cur, tot, srv->count_ud);
        log_manager_log("Client connected from %s (fd=%d)",
                        inet_ntoa(addr.sin_addr), cfd);

        Session *sess = calloc(1, sizeof(Session));
        sess->srv            = srv;
        sess->ctrl_fd        = cfd;
        sess->pasv_listen_fd = -1;
        sess->type           = 'I';
        strcpy(sess->cwd, "/");
        vfs_init(&sess->vfs, srv->settings->folders, srv->settings->folder_count);

        pthread_t tid;
        pthread_attr_t attr;
        pthread_attr_init(&attr);
        pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
        if (pthread_create(&tid, &attr, session_thread, sess) != 0) {
            free(sess);
            close(cfd);
        }
        pthread_attr_destroy(&attr);
    }
    return NULL;
}

/* ---- public API -------------------------------------------------------- */

bool ftp_server_init(FtpServer *srv, ServerSettings *settings, bool use_tls) {
    SSL_CTX *old_ctx = srv->ssl_ctx;
    pthread_mutex_t old_mutex = srv->stats_mutex;
    bool had_mutex = srv->running || old_ctx; /* heuristic: was ever started */

    memset(srv, 0, sizeof(*srv));

    if (old_ctx) SSL_CTX_free(old_ctx);
    if (had_mutex) pthread_mutex_destroy(&old_mutex);

    srv->settings  = settings;
    srv->use_tls   = use_tls;
    srv->listen_fd = -1;
    pthread_mutex_init(&srv->stats_mutex, NULL);

    if (use_tls) {
        srv->ssl_ctx = SSL_CTX_new(TLS_server_method());
        if (!srv->ssl_ctx) return false;
        SSL_CTX_set_min_proto_version(srv->ssl_ctx, TLS1_2_VERSION);
        SSL_CTX_set_mode(srv->ssl_ctx, SSL_MODE_AUTO_RETRY);
    }
    return true;
}

bool ftp_server_load_cert(FtpServer *srv,
                          const char *cert_path, const char *cert_pass) {
    if (!srv->ssl_ctx) return false;

    FILE *fp = fopen(cert_path, "rb");
    if (!fp) { log_manager_log("FTPS: 인증서 파일 열기 실패: %s", cert_path); return false; }
    PKCS12 *p12 = d2i_PKCS12_fp(fp, NULL);
    fclose(fp);
    if (!p12) { log_manager_log("FTPS: PKCS12 파싱 실패 (파일 형식 오류)"); return false; }

    /* normalize empty password to NULL */
    const char *pass = (cert_pass && *cert_pass) ? cert_pass : NULL;

    EVP_PKEY *pkey = NULL;
    X509     *cert = NULL;
    if (!PKCS12_parse(p12, pass, &pkey, &cert, NULL)) {
        /* retry with empty string if NULL failed */
        if (!pass) PKCS12_parse(p12, "", &pkey, &cert, NULL);
    }
    PKCS12_free(p12);

    if (!pkey || !cert) {
        log_manager_log("FTPS: 인증서 복호화 실패 (비밀번호 오류 또는 손상된 파일)");
        if (pkey) EVP_PKEY_free(pkey);
        if (cert) X509_free(cert);
        return false;
    }

    int rc = SSL_CTX_use_certificate(srv->ssl_ctx, cert);
    if (rc != 1) { log_manager_log("FTPS: SSL 인증서 로드 실패"); X509_free(cert); EVP_PKEY_free(pkey); return false; }
    rc = SSL_CTX_use_PrivateKey(srv->ssl_ctx, pkey);
    if (rc != 1) { log_manager_log("FTPS: SSL 개인키 로드 실패"); X509_free(cert); EVP_PKEY_free(pkey); return false; }

    X509_free(cert);
    EVP_PKEY_free(pkey);

    if (SSL_CTX_check_private_key(srv->ssl_ctx) != 1) {
        log_manager_log("FTPS: 인증서와 개인키가 일치하지 않습니다");
        return false;
    }
    log_manager_log("FTPS: 인증서 로드 완료");
    return true;
}

bool ftp_server_start(FtpServer *srv, int port) {
    srv->listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (srv->listen_fd < 0) return false;

    int opt = 1;
    setsockopt(srv->listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {
        .sin_family      = AF_INET,
        .sin_port        = htons((uint16_t)port),
        .sin_addr.s_addr = INADDR_ANY
    };
    if (bind(srv->listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        close(srv->listen_fd); srv->listen_fd = -1; return false;
    }
    listen(srv->listen_fd, 10);

    srv->running = true;
    if (pthread_create(&srv->accept_tid, NULL, accept_loop, srv) != 0) {
        srv->running = false;
        close(srv->listen_fd); srv->listen_fd = -1;
        return false;
    }
    log_manager_log("FTP%s server started on port %d",
                    srv->use_tls ? "S" : "", port);
    return true;
}

void ftp_server_stop(FtpServer *srv) {
    if (!srv->running) return;
    srv->running = false;
    if (srv->listen_fd >= 0) { close(srv->listen_fd); srv->listen_fd = -1; }
    pthread_join(srv->accept_tid, NULL);
    log_manager_log("FTP%s server stopped.", srv->use_tls ? "S" : "");
}

void ftp_server_destroy(FtpServer *srv) {
    ftp_server_stop(srv);
    if (srv->ssl_ctx) { SSL_CTX_free(srv->ssl_ctx); srv->ssl_ctx = NULL; }
    pthread_mutex_destroy(&srv->stats_mutex);
}
