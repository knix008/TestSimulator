#ifndef MMON_PLATFORM_H
#define MMON_PLATFORM_H

#include "mmon.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int demo;
    uint16_t interval_ms;
    char hostname[MMON_HOSTNAME_LEN];
} mmon_plat_cfg_t;

int      mmon_plat_init(void);
void     mmon_plat_shutdown(void);
uint64_t mmon_plat_now_ms(void);
void     mmon_plat_sleep_ms(uint32_t ms);
void     mmon_plat_hello(mmon_hello_t *hello, const mmon_plat_cfg_t *cfg);
size_t   mmon_plat_collect(mmon_metric_t *out, size_t max_count, const mmon_plat_cfg_t *cfg);

/* Returns connected client/peer fd, or <0 on failure.
   listen_mode: bind host:port and accept one client.
   connect_mode: connect to host:port. */
int  mmon_plat_listen(const char *host, uint16_t port);
int  mmon_plat_accept(int listen_fd);
int  mmon_plat_connect(const char *host, uint16_t port);
int  mmon_plat_send(int fd, const uint8_t *data, size_t len);
int  mmon_plat_recv(int fd, uint8_t *data, size_t cap);
void mmon_plat_close(int fd);
int  mmon_plat_set_nonblock(int fd);

#ifdef _WIN32
#define MMON_WIN_SVC_NAME "MyMonitorAgent"
int mmon_win_service_install(const char *bin, const char *args);
int mmon_win_service_uninstall(void);
int mmon_win_service_run(void (*worker)(void));
#endif

void mmon_request_stop(void);
int  mmon_is_running(void);

#ifdef __cplusplus
}
#endif

#endif
