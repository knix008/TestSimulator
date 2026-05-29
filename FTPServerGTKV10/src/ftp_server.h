#pragma once

#include "settings.h"
#include <stdbool.h>
#include <pthread.h>
#include <openssl/ssl.h>

typedef void (*FtpLogCb)(const char *msg, void *ud);
typedef void (*FtpCountCb)(int cur, int total, void *ud);
typedef void (*FtpXferCb)(const char *filename, long bytes, void *ud);

typedef struct {
    ServerSettings  *settings;
    bool             use_tls;
    SSL_CTX         *ssl_ctx;

    int              listen_fd;
    pthread_t        accept_tid;
    volatile bool    running;

    /* stats (protected by stats_mutex) */
    int              cur_clients;
    int              tot_clients;
    int              upload_count;
    long             upload_bytes;
    int              download_count;
    long             download_bytes;
    pthread_mutex_t  stats_mutex;

    /* callbacks */
    FtpLogCb   log_cb;   void *log_ud;
    FtpCountCb count_cb; void *count_ud;
    FtpXferCb  up_cb;    void *up_ud;
    FtpXferCb  dn_cb;    void *dn_ud;
} FtpServer;

/* Load SSL context from PKCS#12 cert (for FTPS).
   Call before ftp_server_start() if use_tls is true. */
bool ftp_server_load_cert(FtpServer *srv,
                          const char *cert_path,
                          const char *cert_pass);

bool ftp_server_init(FtpServer *srv, ServerSettings *settings, bool use_tls);
bool ftp_server_start(FtpServer *srv, int port);
void ftp_server_stop(FtpServer *srv);
void ftp_server_destroy(FtpServer *srv);
