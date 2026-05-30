#include "sftp_server.h"
#include "virtual_fs.h"
#include "log_manager.h"
#include "platform.h"
#include <libssh/libssh.h>
#include <libssh/server.h>
#include <libssh/sftp.h>
#include <libssh/callbacks.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <dirent.h>
#include <sys/stat.h>
#include <errno.h>
#include <pthread.h>

/* ---- file/dir handle bookkeeping --------------------------------------- */

typedef struct {
    bool  is_dir;
    int   fd;       /* for files */
    DIR  *dir;      /* for directories */
    char  path[MAX_PATH_LEN];
} SftpHandle;

/* ---- sftp attributes from stat ---------------------------------------- */

static sftp_attributes stat_to_attr(const struct stat *st) {
    sftp_attributes a = calloc(1, sizeof(*a));
    a->flags       = SSH_FILEXFER_ATTR_SIZE | SSH_FILEXFER_ATTR_PERMISSIONS |
                     SSH_FILEXFER_ATTR_ACMODTIME;
    a->size        = (uint64_t)st->st_size;
    a->permissions = st->st_mode;
    a->atime       = (uint32_t)st->st_atime;
    a->mtime       = (uint32_t)st->st_mtime;
    a->uid         = st->st_uid;
    a->gid         = st->st_gid;
    return a;
}

/* ---- session context --------------------------------------------------- */

typedef struct {
    SftpServer *srv;
    ssh_session session;
    VirtualFS   vfs;
    bool        can_read;
    bool        can_write;
} SftpSessionCtx;

/* ---- SFTP message handling --------------------------------------------- */

static void handle_sftp(sftp_session sftp, SftpSessionCtx *ctx) {
    sftp_client_message msg;

    while ((msg = sftp_get_client_message(sftp)) != NULL) {
        uint8_t type = sftp_client_message_get_type(msg);

        switch (type) {

        case SSH_FXP_REALPATH: {
            const char *filename = sftp_client_message_get_filename(msg);
            char vpath[MAX_PATH_LEN];
            str_copy(vpath, filename ? filename : "/", sizeof(vpath));
            vfs_normalize(vpath);
            sftp_attributes a = calloc(1, sizeof(*a));
            a->flags = SSH_FILEXFER_ATTR_PERMISSIONS;
            a->permissions = S_IFDIR | 0755;
            sftp_reply_name(msg, vpath, a);
            free(a);
            break;
        }

        case SSH_FXP_STAT:
        case SSH_FXP_LSTAT: {
            const char *filename = sftp_client_message_get_filename(msg);
            char vpath[MAX_PATH_LEN];
            str_copy(vpath, filename ? filename : "/", sizeof(vpath));
            vfs_normalize(vpath);
            struct stat st;
            if (vfs_stat(&ctx->vfs, vpath, &st)) {
                sftp_attributes a = stat_to_attr(&st);
                sftp_reply_attr(msg, a);
                free(a);
            } else {
                sftp_reply_status(msg, SSH_FX_NO_SUCH_FILE, "No such file");
            }
            break;
        }

        case SSH_FXP_FSTAT: {
            SftpHandle *h = sftp_handle(sftp, msg->handle);
            if (!h) { sftp_reply_status(msg, SSH_FX_FAILURE, "Bad handle"); break; }
            struct stat st;
            int rc = h->is_dir ? stat(h->path, &st) : fstat(h->fd, &st);
            if (rc == 0) {
                sftp_attributes a = stat_to_attr(&st);
                sftp_reply_attr(msg, a);
                free(a);
            } else {
                sftp_reply_status(msg, SSH_FX_FAILURE, "stat failed");
            }
            break;
        }

        case SSH_FXP_OPENDIR: {
            if (!ctx->can_read) {
                sftp_reply_status(msg, SSH_FX_PERMISSION_DENIED, "Permission denied");
                break;
            }
            const char *filename = sftp_client_message_get_filename(msg);
            char vpath[MAX_PATH_LEN];
            str_copy(vpath, filename ? filename : "/", sizeof(vpath));
            vfs_normalize(vpath);

            char ppath[MAX_PATH_LEN];
            bool is_vroot = (strcmp(vpath, "/") == 0);
            if (!is_vroot && (!vfs_resolve(&ctx->vfs, vpath, ppath, sizeof(ppath)) || ppath[0] == '\0')) {
                sftp_reply_status(msg, SSH_FX_NO_SUCH_FILE, "No such directory");
                break;
            }

            SftpHandle *h = calloc(1, sizeof(SftpHandle));
            h->is_dir = true;
            str_copy(h->path, vpath, sizeof(h->path));
            if (!is_vroot) {
                h->dir = opendir(ppath);
                if (!h->dir) { free(h); sftp_reply_status(msg, SSH_FX_FAILURE, strerror(errno)); break; }
            }
            ssh_string handle = sftp_handle_alloc(sftp, h);
            sftp_reply_handle(msg, handle);
            ssh_string_free(handle);
            break;
        }

        case SSH_FXP_READDIR: {
            SftpHandle *h = sftp_handle(sftp, msg->handle);
            if (!h || !h->is_dir) { sftp_reply_status(msg, SSH_FX_FAILURE, "Bad handle"); break; }

            bool is_vroot = (strcmp(h->path, "/") == 0);
            bool is_multi = !(ctx->vfs.folder_count == 1 &&
                (ctx->vfs.folders[0].virtual_name[0] == '\0' ||
                 strcmp(ctx->vfs.folders[0].virtual_name, "/") == 0));

            if (is_vroot && is_multi) {
                bool sent = false;
                for (int i = 0; i < ctx->vfs.folder_count; i++) {
                    const char *vn = ctx->vfs.folders[i].virtual_name;
                    if (i < h->fd) continue;
                    struct stat st;
                    memset(&st, 0, sizeof(st));
                    if (stat(ctx->vfs.folders[i].physical_path, &st) != 0)
                        st.st_mode = S_IFDIR | 0755;
                    sftp_attributes a = stat_to_attr(&st);
                    a->permissions = S_IFDIR | 0755;
                    sftp_reply_names_add(msg, vn, vn, a);
                    free(a);
                    h->fd = i + 1;
                    sent = true;
                    break;
                }
                if (!sent) sftp_reply_status(msg, SSH_FX_EOF, "EOF");
                else sftp_reply_names(msg);
            } else if (h->dir) {
                char ppath2[MAX_PATH_LEN];
                vfs_resolve(&ctx->vfs, h->path, ppath2, sizeof(ppath2));
                struct dirent *de;
                bool sent = false;
                for (int n = 0; n < 32; n++) {
                    de = readdir(h->dir);
                    if (!de) break;
                    if (strcmp(de->d_name, ".") == 0 || strcmp(de->d_name, "..") == 0) { n--; continue; }
                    char full[MAX_PATH_LEN];
                    snprintf(full, sizeof(full), "%s/%s", ppath2, de->d_name);
                    struct stat st;
                    if (stat(full, &st) != 0) { n--; continue; }
                    sftp_attributes a = stat_to_attr(&st);
                    sftp_reply_names_add(msg, de->d_name, de->d_name, a);
                    free(a);
                    sent = true;
                }
                if (!sent) sftp_reply_status(msg, SSH_FX_EOF, "EOF");
                else sftp_reply_names(msg);
            } else {
                sftp_reply_status(msg, SSH_FX_EOF, "EOF");
            }
            break;
        }

        case SSH_FXP_OPEN: {
            const char *filename = sftp_client_message_get_filename(msg);
            uint32_t    flags    = sftp_client_message_get_flags(msg);

            char vpath[MAX_PATH_LEN];
            str_copy(vpath, filename ? filename : "/", sizeof(vpath));
            vfs_normalize(vpath);

            char ppath[MAX_PATH_LEN];
            if (!vfs_resolve(&ctx->vfs, vpath, ppath, sizeof(ppath)) || ppath[0] == '\0') {
                sftp_reply_status(msg, SSH_FX_NO_SUCH_FILE, "No such file");
                break;
            }

            int oflags = 0;
            bool need_write = (flags & (SSH_FXF_WRITE | SSH_FXF_CREAT | SSH_FXF_TRUNC | SSH_FXF_APPEND));
            if ((flags & SSH_FXF_READ) && need_write)    oflags = O_RDWR;
            else if (need_write)                          oflags = O_WRONLY;
            else                                          oflags = O_RDONLY;
            if (flags & SSH_FXF_CREAT) oflags |= O_CREAT;
            if (flags & SSH_FXF_TRUNC) oflags |= O_TRUNC;
            if (flags & SSH_FXF_EXCL)  oflags |= O_EXCL;
            if (flags & SSH_FXF_APPEND) oflags |= O_APPEND;

            if (need_write && !ctx->can_write) {
                sftp_reply_status(msg, SSH_FX_PERMISSION_DENIED, "Permission denied");
                break;
            }
            if (!need_write && !ctx->can_read) {
                sftp_reply_status(msg, SSH_FX_PERMISSION_DENIED, "Permission denied");
                break;
            }

            int fd = open(ppath, oflags, 0644);
            if (fd < 0) {
                sftp_reply_status(msg, SSH_FX_NO_SUCH_FILE, strerror(errno));
                break;
            }
            if (!need_write)
                posix_fadvise(fd, 0, 0, POSIX_FADV_SEQUENTIAL);
            SftpHandle *h = calloc(1, sizeof(SftpHandle));
            h->fd = fd;
            str_copy(h->path, ppath, sizeof(h->path));
            ssh_string handle = sftp_handle_alloc(sftp, h);
            sftp_reply_handle(msg, handle);
            ssh_string_free(handle);
            break;
        }

        case SSH_FXP_READ: {
            SftpHandle *h = sftp_handle(sftp, msg->handle);
            if (!h || h->is_dir) { sftp_reply_status(msg, SSH_FX_FAILURE, "Bad handle"); break; }
            uint64_t offset = msg->offset;
            uint32_t length = msg->len;
            if (length > 65536) length = 65536;
            char *buf = malloc(length);
            lseek(h->fd, (off_t)offset, SEEK_SET);
            ssize_t n = read(h->fd, buf, length);
            if (n <= 0) sftp_reply_status(msg, SSH_FX_EOF, "EOF");
            else        sftp_reply_data(msg, buf, (int)n);
            free(buf);
            break;
        }

        case SSH_FXP_WRITE: {
            SftpHandle *h = sftp_handle(sftp, msg->handle);
            if (!h || h->is_dir) { sftp_reply_status(msg, SSH_FX_FAILURE, "Bad handle"); break; }
            uint64_t    offset = msg->offset;
            ssh_string  data   = msg->data;
            uint32_t    dlen   = data ? (uint32_t)ssh_string_len(data) : 0;
            lseek(h->fd, (off_t)offset, SEEK_SET);
            ssize_t w = (data && dlen) ? write(h->fd, ssh_string_get_char(data), dlen) : 0;
            if (w < 0) sftp_reply_status(msg, SSH_FX_FAILURE, strerror(errno));
            else        sftp_reply_status(msg, SSH_FX_OK, "OK");
            break;
        }

        case SSH_FXP_CLOSE: {
            SftpHandle *h = sftp_handle(sftp, msg->handle);
            if (!h) { sftp_reply_status(msg, SSH_FX_FAILURE, "Bad handle"); break; }
            if (h->is_dir) {
                if (h->dir) closedir(h->dir);
            } else {
                close(h->fd);
            }
            sftp_handle_remove(sftp, h);
            free(h);
            sftp_reply_status(msg, SSH_FX_OK, "OK");
            break;
        }

        case SSH_FXP_REMOVE: {
            if (!ctx->can_write) { sftp_reply_status(msg, SSH_FX_PERMISSION_DENIED, "Permission denied"); break; }
            const char *filename = sftp_client_message_get_filename(msg);
            char vpath[MAX_PATH_LEN];
            str_copy(vpath, filename ? filename : "", sizeof(vpath));
            vfs_normalize(vpath);
            if (vfs_remove(&ctx->vfs, vpath)) sftp_reply_status(msg, SSH_FX_OK, "OK");
            else sftp_reply_status(msg, SSH_FX_FAILURE, strerror(errno));
            break;
        }

        case SSH_FXP_MKDIR: {
            if (!ctx->can_write) { sftp_reply_status(msg, SSH_FX_PERMISSION_DENIED, "Permission denied"); break; }
            const char *filename = sftp_client_message_get_filename(msg);
            char vpath[MAX_PATH_LEN];
            str_copy(vpath, filename ? filename : "", sizeof(vpath));
            vfs_normalize(vpath);
            if (vfs_mkdir(&ctx->vfs, vpath)) sftp_reply_status(msg, SSH_FX_OK, "OK");
            else sftp_reply_status(msg, SSH_FX_FAILURE, strerror(errno));
            break;
        }

        case SSH_FXP_RMDIR: {
            if (!ctx->can_write) { sftp_reply_status(msg, SSH_FX_PERMISSION_DENIED, "Permission denied"); break; }
            const char *filename = sftp_client_message_get_filename(msg);
            char vpath[MAX_PATH_LEN];
            str_copy(vpath, filename ? filename : "", sizeof(vpath));
            vfs_normalize(vpath);
            if (vfs_rmdir(&ctx->vfs, vpath)) sftp_reply_status(msg, SSH_FX_OK, "OK");
            else sftp_reply_status(msg, SSH_FX_FAILURE, strerror(errno));
            break;
        }

        case SSH_FXP_RENAME: {
            if (!ctx->can_write) { sftp_reply_status(msg, SSH_FX_PERMISSION_DENIED, "Permission denied"); break; }
            const char *src = sftp_client_message_get_filename(msg);
            const char *dst = sftp_client_message_get_data(msg);
            if (!src || !dst) { sftp_reply_status(msg, SSH_FX_FAILURE, "Bad args"); break; }
            char vs[MAX_PATH_LEN], vd[MAX_PATH_LEN];
            str_copy(vs, src, sizeof(vs)); vfs_normalize(vs);
            str_copy(vd, dst, sizeof(vd)); vfs_normalize(vd);
            if (vfs_rename(&ctx->vfs, vs, vd)) sftp_reply_status(msg, SSH_FX_OK, "OK");
            else sftp_reply_status(msg, SSH_FX_FAILURE, strerror(errno));
            break;
        }

        case SSH_FXP_SETSTAT:
        case SSH_FXP_FSETSTAT:
            sftp_reply_status(msg, SSH_FX_OK, "OK");
            break;

        default:
            sftp_reply_status(msg, SSH_FX_OP_UNSUPPORTED, "Unsupported");
            break;
        }

        sftp_client_message_free(msg);
    }
}

/* ---- session thread ---------------------------------------------------- */

typedef struct {
    SftpServer  *srv;
    ssh_session  session;
} ThreadArg;

static bool s_quit_requested(SftpServer *srv) {
    return !srv->running;
}

static void *sftp_session_thread(void *arg) {
    ThreadArg *ta = arg;
    SftpServer *srv = ta->srv;
    ssh_session session = ta->session;
    free(ta);

    SftpSessionCtx ctx;
    memset(&ctx, 0, sizeof(ctx));
    ctx.srv = srv;
    ctx.session = session;
    ctx.can_read  = true;
    ctx.can_write = false;

    if (ssh_handle_key_exchange(session) != SSH_OK) {
        log_manager_log("SFTP key exchange failed: %s", ssh_get_error(session));
        goto cleanup;
    }

    ssh_channel channel = NULL;
    bool authenticated = false;
    bool channel_opened = false;
    char authed_user[MAX_NAME_LEN] = "";

    struct ssh_server_callbacks_struct srv_cb;
    memset(&srv_cb, 0, sizeof(srv_cb));
    ssh_callbacks_init(&srv_cb);

    int timeout_ms = 30000;
    ssh_set_blocking(session, 0);

    while (!s_quit_requested(srv)) {
        ssh_message msg = ssh_message_get(session);
        if (!msg) {
            ssh_event event = ssh_event_new();
            ssh_event_add_session(event, session);
            ssh_event_dopoll(event, 100);
            ssh_event_free(event);
            timeout_ms -= 100;
            if (timeout_ms <= 0) break;
            continue;
        }
        int mtype = ssh_message_type(msg);
        int msub  = ssh_message_subtype(msg);

        if (!authenticated) {
            if (mtype == SSH_REQUEST_AUTH) {
                const char *user = ssh_message_auth_user(msg);
                bool ok = false;

                if (msub == SSH_AUTH_METHOD_NONE) {
                    /* anonymous login with no credentials */
                    if (srv->settings->allow_anonymous) {
                        ok = true;
                        ctx.can_read  = true;
                        ctx.can_write = false;
                    }
                } else if (msub == SSH_AUTH_METHOD_PASSWORD) {
                    const char *pass = ssh_message_auth_password(msg);
                    if (srv->settings->allow_anonymous &&
                        strcasecmp(user ? user : "", "anonymous") == 0) {
                        /* anonymous: accept any password */
                        ok = true;
                        ctx.can_read  = true;
                        ctx.can_write = false;
                    } else {
                        for (int i = 0; i < srv->settings->user_count; i++) {
                            if (strcasecmp(srv->settings->users[i].username, user ? user : "") == 0 &&
                                strcmp(srv->settings->users[i].password, pass ? pass : "") == 0) {
                                ok = true;
                                ctx.can_read  = srv->settings->users[i].can_read;
                                ctx.can_write = srv->settings->users[i].can_write;
                                break;
                            }
                        }
                    }
                }

                if (ok) {
                    str_copy(authed_user, user ? user : "anonymous", sizeof(authed_user));
                    authenticated = true;
                    log_manager_log("SFTP auth OK for user '%s'", authed_user);
                    ssh_message_auth_reply_success(msg, 0);
                } else {
                    int methods = SSH_AUTH_METHOD_PASSWORD;
                    if (srv->settings->allow_anonymous)
                        methods |= SSH_AUTH_METHOD_NONE;
                    log_manager_log("SFTP auth FAILED for user '%s'", user ? user : "");
                    ssh_message_auth_set_methods(msg, methods);
                    ssh_message_reply_default(msg);
                }
            } else {
                ssh_message_reply_default(msg);
            }
        } else if (!channel_opened) {
            if (mtype == SSH_REQUEST_CHANNEL_OPEN &&
                msub == SSH_CHANNEL_SESSION) {
                channel = ssh_message_channel_request_open_reply_accept(msg);
                channel_opened = true;
                timeout_ms = 30000;
            } else {
                ssh_message_reply_default(msg);
            }
        } else {
            if (mtype == SSH_REQUEST_CHANNEL &&
                msub == SSH_CHANNEL_REQUEST_SUBSYSTEM) {
                const char *subsys = ssh_message_channel_request_subsystem(msg);
                if (subsys && strcmp(subsys, "sftp") == 0) {
                    ssh_message_channel_request_reply_success(msg);
                    ssh_message_free(msg);

                    vfs_init(&ctx.vfs, srv->settings->folders,
                             srv->settings->folder_count);

                    sftp_session sftp = sftp_server_new(session, channel);
                    if (sftp && sftp_server_init(sftp) == 0) {
                        log_manager_log("SFTP session started for '%s'", authed_user);
                        handle_sftp(sftp, &ctx);
                    }
                    if (sftp) sftp_free(sftp);
                    vfs_destroy(&ctx.vfs);
                    goto cleanup;
                }
            }
            ssh_message_reply_default(msg);
        }
        ssh_message_free(msg);
    }

cleanup:
    ssh_disconnect(session);
    ssh_free(session);

    pthread_mutex_lock(&srv->stats_mutex);
    int cur = --srv->cur_clients;
    int tot = srv->tot_clients;
    pthread_mutex_unlock(&srv->stats_mutex);
    if (srv->count_cb) srv->count_cb(cur, tot, srv->count_ud);
    log_manager_log("SFTP client disconnected");
    return NULL;
}

/* ---- accept loop ------------------------------------------------------- */

static void *sftp_accept_loop(void *arg) {
    SftpServer *srv = arg;
    ssh_bind sshbind = (ssh_bind)srv->sshbind;
    int bind_fd  = ssh_bind_get_fd(sshbind);
    int stop_rfd = srv->stop_pipe[0];

    if (bind_fd < 0 || stop_rfd < 0) return NULL;

    while (srv->running) {
        fd_set rfds;
        FD_ZERO(&rfds);
        FD_SET(bind_fd,  &rfds);
        FD_SET(stop_rfd, &rfds);
        int maxfd = (bind_fd > stop_rfd ? bind_fd : stop_rfd) + 1;
        struct timeval tv = { .tv_sec = 1 };
        if (select(maxfd, &rfds, NULL, NULL, &tv) <= 0) continue;
        if (!srv->running || FD_ISSET(stop_rfd, &rfds)) break;
        if (!FD_ISSET(bind_fd, &rfds)) continue;

        ssh_session session = ssh_new();
        if (ssh_bind_accept(sshbind, session) == SSH_ERROR) {
            ssh_free(session);
            continue;
        }

        pthread_mutex_lock(&srv->stats_mutex);
        int cur = ++srv->cur_clients;
        int tot = ++srv->tot_clients;
        pthread_mutex_unlock(&srv->stats_mutex);
        if (srv->count_cb) srv->count_cb(cur, tot, srv->count_ud);

        ThreadArg *ta = malloc(sizeof(ThreadArg));
        ta->srv     = srv;
        ta->session = session;

        pthread_t tid;
        pthread_attr_t attr;
        pthread_attr_init(&attr);
        pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
        if (pthread_create(&tid, &attr, sftp_session_thread, ta) != 0) {
            free(ta);
            ssh_disconnect(session);
            ssh_free(session);
        }
        pthread_attr_destroy(&attr);
    }
    return NULL;
}

/* ---- public API -------------------------------------------------------- */

bool sftp_srv_init(SftpServer *srv, ServerSettings *settings) {
    memset(srv, 0, sizeof(*srv));
    srv->settings = settings;
    srv->stop_pipe[0] = srv->stop_pipe[1] = -1;
    pthread_mutex_init(&srv->stats_mutex, NULL);
    return true;
}

bool sftp_srv_start(SftpServer *srv, int port) {
    const char *key_path = srv->settings->sftp_host_key_path;

    if (!key_path || !*key_path || access(key_path, F_OK) != 0) {
        char *default_path = sftp_get_default_key_path();
        if (!sftp_generate_host_key(default_path)) {
            log_manager_log("SFTP: 호스트 키 생성 실패: %s", default_path);
            free(default_path);
            return false;
        }
        str_copy(srv->settings->sftp_host_key_path, default_path, MAX_PATH_LEN);
        key_path = srv->settings->sftp_host_key_path;
        free(default_path);
    }

    /* verify key loads and print fingerprint */
    {
        ssh_key test_key = NULL;
        if (ssh_pki_import_privkey_file(key_path, NULL, NULL, NULL, &test_key) != SSH_OK) {
            log_manager_log("SFTP: 호스트 키 손상됨, 재생성: %s", key_path);
            sftp_generate_host_key(key_path);
            if (ssh_pki_import_privkey_file(key_path, NULL, NULL, NULL, &test_key) != SSH_OK) {
                log_manager_log("SFTP: 호스트 키 재생성 실패");
                return false;
            }
        }
        unsigned char *hash = NULL;
        size_t hlen = 0;
        if (ssh_get_publickey_hash(test_key, SSH_PUBLICKEY_HASH_SHA256, &hash, &hlen) == SSH_OK) {
            char *b64 = base64_encode(hash, hlen);
            if (b64) {
                size_t len = strlen(b64);
                while (len > 0 && b64[len-1] == '=') b64[--len] = '\0';
                log_manager_log("SFTP: 호스트 키 지문 SHA256:%s", b64);
                log_manager_log("SFTP: 클라이언트에서 위 지문을 수락하거나, known_hosts에서 이전 항목을 삭제하세요");
                free(b64);
            }
            ssh_clean_pubkey_hash(&hash);
        }
        ssh_key_free(test_key);
    }

    ssh_bind sshbind = ssh_bind_new();
    char portstr[16];
    snprintf(portstr, sizeof(portstr), "%d", port);
    ssh_bind_options_set(sshbind, SSH_BIND_OPTIONS_BINDPORT_STR, portstr);
    ssh_bind_options_set(sshbind, SSH_BIND_OPTIONS_HOSTKEY, key_path);

    if (ssh_bind_listen(sshbind) < 0) {
        log_manager_log("SFTP bind failed: %s", ssh_get_error(sshbind));
        ssh_bind_free(sshbind);
        return false;
    }

    if (pipe(srv->stop_pipe) != 0) {
        ssh_bind_free(sshbind);
        return false;
    }

    srv->sshbind = sshbind;
    srv->running = true;

    if (pthread_create(&srv->accept_tid, NULL, sftp_accept_loop, srv) != 0) {
        srv->running = false;
        close(srv->stop_pipe[0]); close(srv->stop_pipe[1]);
        srv->stop_pipe[0] = srv->stop_pipe[1] = -1;
        ssh_bind_free(sshbind);
        srv->sshbind = NULL;
        return false;
    }
    log_manager_log("SFTP server started on port %d", port);
    return true;
}

void sftp_srv_stop(SftpServer *srv) {
    if (!srv->running) return;
    srv->running = false;
    /* wake accept loop immediately via self-pipe */
    if (srv->stop_pipe[1] >= 0) {
        char c = 0;
        ssize_t n = write(srv->stop_pipe[1], &c, 1);
        (void)n;
    }
    pthread_join(srv->accept_tid, NULL);
    if (srv->stop_pipe[0] >= 0) { close(srv->stop_pipe[0]); srv->stop_pipe[0] = -1; }
    if (srv->stop_pipe[1] >= 0) { close(srv->stop_pipe[1]); srv->stop_pipe[1] = -1; }
    if (srv->sshbind) {
        ssh_bind_free((ssh_bind)srv->sshbind);
        srv->sshbind = NULL;
    }
    log_manager_log("SFTP server stopped.");
}

void sftp_srv_destroy(SftpServer *srv) {
    sftp_srv_stop(srv);
    pthread_mutex_destroy(&srv->stats_mutex);
}

/* ---- key management --------------------------------------------------- */

char *sftp_get_default_key_path(void) {
    char *cfgdir = get_config_dir();
    char *ftpdir = path_join(cfgdir, "FTPServerGTK");
    free(cfgdir);
    make_dirs(ftpdir, 0700);
    char *path = path_join(ftpdir, "ssh_host_rsa_key");
    free(ftpdir);
    return path;
}

bool sftp_generate_host_key(const char *path) {
    ssh_key key = NULL;
    if (ssh_pki_generate(SSH_KEYTYPE_ED25519, 0, &key) != SSH_OK)
        return false;
    char *dir = path_dirname_str(path);
    make_dirs(dir, 0700);
    free(dir);
    int rc = ssh_pki_export_privkey_file(key, NULL, NULL, NULL, path);
    ssh_key_free(key);
    return rc == SSH_OK;
}

char *sftp_get_fingerprint(const char *path) {
    if (!path || !*path || access(path, F_OK) != 0) return NULL;

    ssh_key key = NULL;
    if (ssh_pki_import_privkey_file(path, NULL, NULL, NULL, &key) != SSH_OK)
        return NULL;

    unsigned char *hash = NULL;
    size_t hlen = 0;
    ssh_get_publickey_hash(key, SSH_PUBLICKEY_HASH_SHA256, &hash, &hlen);
    ssh_key_free(key);

    if (!hash) return NULL;
    char *b64 = base64_encode(hash, hlen);
    ssh_clean_pubkey_hash(&hash);

    if (!b64) return NULL;
    size_t len = strlen(b64);
    while (len > 0 && b64[len - 1] == '=') { b64[--len] = '\0'; }

    char *result = malloc(len + 8);
    snprintf(result, len + 8, "SHA256:%s", b64);
    free(b64);
    return result;
}
