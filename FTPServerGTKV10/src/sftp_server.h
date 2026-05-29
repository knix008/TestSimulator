#pragma once

#include "settings.h"
#include <stdbool.h>
#include <pthread.h>

typedef void (*SftpLogCb)(const char *msg, void *ud);
typedef void (*SftpCountCb)(int cur, int total, void *ud);

typedef struct {
    ServerSettings  *settings;

    void            *sshbind;   /* ssh_bind (opaque to avoid header pollution) */
    pthread_t        accept_tid;
    volatile bool    running;

    int              cur_clients;
    int              tot_clients;
    pthread_mutex_t  stats_mutex;

    SftpLogCb   log_cb;   void *log_ud;
    SftpCountCb count_cb; void *count_ud;
} SftpServer;

bool  sftp_srv_init(SftpServer *srv, ServerSettings *settings);
bool  sftp_srv_start(SftpServer *srv, int port);
void  sftp_srv_stop(SftpServer *srv);
void  sftp_srv_destroy(SftpServer *srv);

/* Key management */
bool  sftp_generate_host_key(const char *path);
char *sftp_get_fingerprint(const char *path);  /* caller must free() */
char *sftp_get_default_key_path(void);          /* caller must free() */
