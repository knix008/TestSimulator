#include "mmon.h"
#include "mmon_platform.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#ifdef _WIN32
#include <winsock2.h>
#include <windows.h>
static volatile int g_run = 1;
static BOOL WINAPI on_ctrl(DWORD ev) {
    (void)ev;
    g_run = 0;
    return TRUE;
}
#else
#include <fcntl.h>
#include <signal.h>
static volatile int g_run = 1;
static void on_sig(int sig) {
    (void)sig;
    g_run = 0;
}
#endif

void mmon_request_stop(void) {
    g_run = 0;
}

int mmon_is_running(void) {
    return g_run;
}

static void usage(const char *argv0) {
    (void)argv0;
    fprintf(stderr,
            "mmon-agent - remote resource agent\n"
            "Modes: --listen --connect --push --http"
#ifdef _WIN32
            " --service"
#endif
            "\n"
            "  --listen [host:port]   wait for the monitor (TCP %d)\n"
            "  --connect host:port    connect to the monitor\n"
            "  --push [url]           POST JSON to HTTPS ingest\n"
            "  --http [host:port]     serve JSON (HTTP %d)\n"
#ifdef _WIN32
            "  --service install|uninstall|run\n"
#endif
            "Options: --demo  --interval ms  --name host\n",
            MMON_DEFAULT_PORT, MMON_DEFAULT_HTTP_PORT);
}

static int parse_hostport(const char *s, char *host, size_t host_cap, uint16_t *port, uint16_t default_port) {
    const char *colon;
    size_t n;
    if (!s || !s[0]) {
        strncpy(host, "0.0.0.0", host_cap - 1);
        *port = default_port;
        return 0;
    }
    colon = strrchr(s, ':');
    if (!colon) {
        strncpy(host, s, host_cap - 1);
        *port = default_port;
        return 0;
    }
    n = (size_t)(colon - s);
    if (n >= host_cap) n = host_cap - 1;
    memcpy(host, s, n);
    host[n] = '\0';
    *port = (uint16_t)atoi(colon + 1);
    if (*port == 0) *port = default_port;
    return 0;
}

static char g_host[128] = "0.0.0.0";
static uint16_t g_port = MMON_DEFAULT_PORT;
static int g_listen_mode = 1;
static int g_http_mode = 0;
static int g_push_mode = 0;
static char g_push_path[128] = "/metrics";
static mmon_plat_cfg_t g_cfg;

static int send_all(int fd, const uint8_t *buf, size_t len) {
    return mmon_plat_send(fd, buf, len);
}

static int session_loop(int fd, mmon_plat_cfg_t *cfg) {
    mmon_hello_t hello;
    mmon_decoder_t dec;
    mmon_metric_t metrics[32];
    uint8_t frame[MMON_MAX_FRAME];
    uint8_t rx[512];
    uint8_t payload[MMON_MAX_PAYLOAD];
    uint16_t seq = 1;
    uint64_t last_metrics = 0;
    uint64_t last_hb = 0;
    size_t n;
    int subscribed = 1;

    mmon_decoder_init(&dec);
    mmon_plat_hello(&hello, cfg);
    n = mmon_encode_hello(frame, sizeof(frame), seq++, &hello);
    if (!n || send_all(fd, frame, n) != 0) {
        fprintf(stderr, "failed to send HELLO\n");
        return -1;
    }
    n = mmon_encode_log(frame, sizeof(frame), seq++, MMON_LOG_INFO,
                        mmon_plat_now_ms(), "agent session started");
    if (n) send_all(fd, frame, n);
    mmon_plat_set_nonblock(fd);

    while (g_run) {
        int got;
        uint64_t now = mmon_plat_now_ms();

        if (subscribed && now - last_metrics >= cfg->interval_ms) {
            size_t count = mmon_plat_collect(metrics, 32, cfg);
            n = mmon_encode_metrics(frame, sizeof(frame), seq++, now, metrics, count);
            if (!n || send_all(fd, frame, n) != 0) {
                fprintf(stderr, "peer closed while sending metrics\n");
                return -1;
            }
            last_metrics = now;
        }
        if (now - last_hb >= 5000) {
            n = mmon_encode_heartbeat(frame, sizeof(frame), seq++);
            if (n) send_all(fd, frame, n);
            last_hb = now;
        }

        got = mmon_plat_recv(fd, rx, sizeof(rx));
        if (got == 0) {
            fprintf(stderr, "peer disconnected\n");
            return 0;
        }
        if (got > 0) {
            mmon_frame_t fr;
            int r;
            size_t off = 0;
            while (off < (size_t)got || dec.used > 0) {
                const uint8_t *chunk = off < (size_t)got ? rx + off : NULL;
                size_t chunk_len = off < (size_t)got ? (size_t)got - off : 0;
                r = mmon_decoder_push(&dec, chunk, chunk_len, &fr, payload, sizeof(payload));
                off = (size_t)got;
                if (r == 1) {
                    if (fr.type == MMON_SUBSCRIBE) {
                        uint16_t interval = 0;
                        uint8_t enable = 1;
                        if (mmon_parse_subscribe(payload, fr.length, &interval, &enable) == 0) {
                            if (interval) cfg->interval_ms = interval;
                            subscribed = enable ? 1 : 0;
                        }
                    } else if (fr.type == MMON_DISCONNECT) {
                        return 0;
                    } else if (fr.type == MMON_HELLO || fr.type == MMON_HELLO_ACK) {
                        n = mmon_encode_hello(frame, sizeof(frame), seq++, &hello);
                        if (n) send_all(fd, frame, n);
                    }
                } else {
                    break;
                }
            }
        }
        mmon_plat_sleep_ms(50);
    }
    return 0;
}

static const char *http_metric_key(uint8_t id) {
    switch (id) {
    case MMON_CPU_PCT: return "cpu";
    case MMON_RAM_USED: return "ram_used";
    case MMON_RAM_TOTAL: return "ram_total";
    case MMON_DISK_USED: return "disk_used";
    case MMON_DISK_TOTAL: return "disk_total";
    case MMON_LOAD1: return "load1";
    case MMON_LOAD5: return "load5";
    case MMON_LOAD15: return "load15";
    case MMON_NET_RX: return "net_rx";
    case MMON_NET_TX: return "net_tx";
    case MMON_NET_RX_RATE: return "net_rx_rate";
    case MMON_NET_TX_RATE: return "net_tx_rate";
    case MMON_UPTIME: return "uptime";
    case MMON_PROCS: return "procs";
    case MMON_TEMP: return "temp";
    case MMON_HEAP_USED: return "heap_used";
    case MMON_HEAP_TOTAL: return "heap_total";
    case MMON_TASKS: return "tasks";
    default: return NULL;
    }
}

static const char *http_os_name(uint8_t os) {
    switch (os) {
    case MMON_OS_LINUX: return "linux";
    case MMON_OS_WINDOWS: return "windows";
    case MMON_OS_MACOS: return "macos";
    case MMON_OS_RTOS: return "rtos";
    default: return "unknown";
    }
}

static int json_append(char *buf, size_t cap, size_t *used, const char *fmt, ...) {
    va_list ap;
    int n;
    if (*used >= cap) return -1;
    va_start(ap, fmt);
    n = vsnprintf(buf + *used, cap - *used, fmt, ap);
    va_end(ap);
    if (n < 0 || (size_t)n >= cap - *used) return -1;
    *used += (size_t)n;
    return 0;
}

static size_t http_metrics_json(char *buf, size_t cap, mmon_plat_cfg_t *cfg) {
    mmon_hello_t hello;
    mmon_metric_t metrics[32];
    size_t count, i, used = 0;
    uint64_t ts = mmon_plat_now_ms();
    mmon_plat_hello(&hello, cfg);
    count = mmon_plat_collect(metrics, 32, cfg);
    if (json_append(buf, cap, &used,
                    "{\"ts\":%llu,\"hostname\":\"%s\",\"os_type\":%u,\"os_name\":\"%s\"",
                    (unsigned long long)ts, hello.hostname, (unsigned)hello.os_type,
                    http_os_name(hello.os_type)) != 0) {
        return 0;
    }
    for (i = 0; i < count; i++) {
        const char *key = http_metric_key(metrics[i].id);
        if (!key) continue;
        if (metrics[i].vtype == MMON_VT_F32) {
            if (json_append(buf, cap, &used, ",\"%s\":%.3f", key, (double)metrics[i].v.f32) != 0) return 0;
        } else if (json_append(buf, cap, &used, ",\"%s\":%llu", key, (unsigned long long)metrics[i].v.u64) != 0) {
            return 0;
        }
    }
    if (json_append(buf, cap, &used, "}") != 0) return 0;
    return used;
}

static int http_recv_request(int fd, char *buf, size_t cap) {
    size_t used = 0;
    uint64_t start = mmon_plat_now_ms();
    buf[0] = '\0';
    while (used + 1 < cap && mmon_plat_now_ms() - start < 2000) {
        int n = mmon_plat_recv(fd, (uint8_t *)buf + used, cap - 1 - used);
        if (n > 0) {
            used += (size_t)n;
            buf[used] = '\0';
            if (strstr(buf, "\r\n\r\n") || strstr(buf, "\n\n")) return (int)used;
        } else if (n == 0) {
            break;
        } else {
            mmon_plat_sleep_ms(10);
        }
    }
    return used > 0 ? (int)used : -1;
}

static void http_reply(int fd, int status, const char *status_text, const char *ctype, const char *body) {
    char hdr[512];
    size_t blen = body ? strlen(body) : 0;
    int n = snprintf(hdr, sizeof(hdr),
                     "HTTP/1.1 %d %s\r\n"
                     "Content-Type: %s\r\n"
                     "Access-Control-Allow-Origin: *\r\n"
                     "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
                     "Access-Control-Allow-Headers: *\r\n"
                     "Connection: close\r\n"
                     "Content-Length: %u\r\n"
                     "\r\n",
                     status, status_text, ctype, (unsigned)blen);
    if (n > 0) mmon_plat_send(fd, (const uint8_t *)hdr, (size_t)n);
    if (blen) mmon_plat_send(fd, (const uint8_t *)body, blen);
}

static void http_handle(int fd, mmon_plat_cfg_t *cfg) {
    char req[2048];
    char json[2048];
    if (http_recv_request(fd, req, sizeof(req)) < 0) return;
    if (strncmp(req, "OPTIONS", 7) == 0) {
        http_reply(fd, 204, "No Content", "text/plain", "");
        return;
    }
    if (strncmp(req, "GET / ", 6) == 0 || strncmp(req, "GET /metrics", 12) == 0 ||
        strncmp(req, "GET /health", 11) == 0) {
        if (http_metrics_json(json, sizeof(json), cfg)) {
            http_reply(fd, 200, "OK", "application/json; charset=utf-8", json);
        } else {
            http_reply(fd, 500, "Internal Server Error", "text/plain", "collect failed");
        }
        return;
    }
    http_reply(fd, 404, "Not Found", "text/plain", "not found");
}

static int parse_push_url(const char *s, char *host, size_t host_cap, uint16_t *port, char *path, size_t path_cap) {
    char hostport[256];
    const char *slash;
    if (!s) s = "";
    if (strncmp(s, "https://", 8) == 0) s += 8;
    else if (strncmp(s, "http://", 7) == 0) s += 7;
    slash = strchr(s, '/');
    if (slash) {
        size_t n = (size_t)(slash - s);
        if (n >= sizeof(hostport)) n = sizeof(hostport) - 1;
        memcpy(hostport, s, n);
        hostport[n] = '\0';
        strncpy(path, slash, path_cap - 1);
        path[path_cap - 1] = '\0';
    } else {
        strncpy(hostport, s, sizeof(hostport) - 1);
        hostport[sizeof(hostport) - 1] = '\0';
        strncpy(path, "/metrics", path_cap - 1);
        path[path_cap - 1] = '\0';
    }
    if (!hostport[0]) strncpy(hostport, "127.0.0.1", sizeof(hostport) - 1);
    parse_hostport(hostport, host, host_cap, port, MMON_DEFAULT_HTTP_PORT);
    if (strcmp(host, "0.0.0.0") == 0) strncpy(host, "127.0.0.1", host_cap - 1);
    if (!path[0] || strcmp(path, "/") == 0) strncpy(path, "/metrics", path_cap - 1);
    return 0;
}

static int http_post_json(const char *host, uint16_t port, const char *path, const char *json) {
    char hdr[512];
    int fd;
    int n;
    uint8_t ack[128];
    fd = mmon_plat_connect(host, port);
    if (fd < 0) return -1;
    n = snprintf(hdr, sizeof(hdr),
                 "POST %s HTTP/1.1\r\n"
                 "Host: %s:%u\r\n"
                 "Content-Type: application/json\r\n"
                 "Content-Length: %u\r\n"
                 "Connection: close\r\n"
                 "\r\n",
                 path, host, (unsigned)port, (unsigned)strlen(json));
    if (n < 0 || mmon_plat_send(fd, (const uint8_t *)hdr, (size_t)n) != 0 ||
        mmon_plat_send(fd, (const uint8_t *)json, strlen(json)) != 0) {
        mmon_plat_close(fd);
        return -1;
    }
    mmon_plat_recv(fd, ack, sizeof(ack));
    mmon_plat_close(fd);
    return 0;
}

static int push_loop(mmon_plat_cfg_t *cfg) {
    char json[2048];
    fprintf(stdout, "mmon-agent push %s:%u%s%s\n", g_host, (unsigned)g_port, g_push_path,
            cfg->demo ? " (demo)" : "");
    fflush(stdout);
    while (g_run) {
        if (!http_metrics_json(json, sizeof(json), cfg) ||
            http_post_json(g_host, g_port, g_push_path, json) != 0) {
            fprintf(stderr, "push failed to %s:%u%s\n", g_host, (unsigned)g_port, g_push_path);
        }
        mmon_plat_sleep_ms(cfg->interval_ms);
    }
    return 0;
}

static int agent_run(void) {
    int rc = 0;
    if (mmon_plat_init() != 0) {
        fprintf(stderr, "platform init failed\n");
        return 1;
    }

    if (g_push_mode) {
        rc = push_loop(&g_cfg);
    } else if (g_http_mode) {
        int lfd = mmon_plat_listen(g_host, g_port);
        if (lfd < 0) {
            fprintf(stderr, "HTTP listen failed on %s:%u\n", g_host, (unsigned)g_port);
            mmon_plat_shutdown();
            return 1;
        }
        mmon_plat_set_nonblock(lfd);
        fprintf(stdout, "mmon-agent HTTP on %s:%u%s\n",
                g_host, (unsigned)g_port, g_cfg.demo ? " (demo)" : "");
        fflush(stdout);
        while (g_run) {
            int cfd = mmon_plat_accept(lfd);
            if (cfd < 0) {
                mmon_plat_sleep_ms(50);
                continue;
            }
            http_handle(cfd, &g_cfg);
            mmon_plat_close(cfd);
        }
        mmon_plat_close(lfd);
    } else if (g_listen_mode) {
        int lfd = mmon_plat_listen(g_host, g_port);
        if (lfd < 0) {
            fprintf(stderr, "listen failed on %s:%u\n", g_host, (unsigned)g_port);
            mmon_plat_shutdown();
            return 1;
        }
        mmon_plat_set_nonblock(lfd);
        fprintf(stdout, "mmon-agent listening on %s:%u%s\n",
                g_host, (unsigned)g_port, g_cfg.demo ? " (demo)" : "");
        fflush(stdout);
        while (g_run) {
            int cfd = mmon_plat_accept(lfd);
            if (cfd < 0) {
                mmon_plat_sleep_ms(200);
                continue;
            }
            fprintf(stdout, "client connected\n");
            fflush(stdout);
            session_loop(cfd, &g_cfg);
            mmon_plat_close(cfd);
            fprintf(stdout, "client disconnected\n");
            fflush(stdout);
        }
        mmon_plat_close(lfd);
    } else {
        int cfd = mmon_plat_connect(g_host, g_port);
        if (cfd < 0) {
            fprintf(stderr, "connect failed to %s:%u\n", g_host, (unsigned)g_port);
            rc = 1;
        } else {
            fprintf(stdout, "connected to %s:%u%s\n",
                    g_host, (unsigned)g_port, g_cfg.demo ? " (demo)" : "");
            session_loop(cfd, &g_cfg);
            mmon_plat_close(cfd);
        }
    }

    mmon_plat_shutdown();
    return rc;
}

#ifdef _WIN32
static void service_worker(void) {
    agent_run();
}

static int win_self_path(char *out, size_t cap) {
    DWORD n = GetModuleFileNameA(NULL, out, (DWORD)cap);
    return (n > 0 && n < cap) ? 0 : -1;
}
#endif

int main(int argc, char **argv) {
    int listen_mode = 0;
    int connect_mode = 0;
    int http_mode = 0;
    int push_mode = 0;
    int i;
#ifdef _WIN32
    int service_cmd = 0; /* 1 install, 2 uninstall, 3 run */
#endif

    memset(&g_cfg, 0, sizeof(g_cfg));
    g_cfg.interval_ms = MMON_DEFAULT_INTERVAL_MS;

    for (i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--listen") == 0) {
            listen_mode = 1;
            if (i + 1 < argc && argv[i + 1][0] != '-') {
                parse_hostport(argv[++i], g_host, sizeof(g_host), &g_port, MMON_DEFAULT_PORT);
            }
        } else if (strcmp(argv[i], "--connect") == 0) {
            connect_mode = 1;
            if (i + 1 >= argc) {
                usage(argv[0]);
                return 1;
            }
            parse_hostport(argv[++i], g_host, sizeof(g_host), &g_port, MMON_DEFAULT_PORT);
        } else if (strcmp(argv[i], "--push") == 0) {
            push_mode = 1;
            if (i + 1 < argc && argv[i + 1][0] != '-') {
                parse_push_url(argv[++i], g_host, sizeof(g_host), &g_port, g_push_path, sizeof(g_push_path));
            } else {
                strncpy(g_host, "127.0.0.1", sizeof(g_host) - 1);
                g_port = MMON_DEFAULT_HTTP_PORT;
                strncpy(g_push_path, "/metrics", sizeof(g_push_path) - 1);
            }
        } else if (strcmp(argv[i], "--http") == 0) {
            http_mode = 1;
            if (i + 1 < argc && argv[i + 1][0] != '-') {
                parse_hostport(argv[++i], g_host, sizeof(g_host), &g_port, MMON_DEFAULT_HTTP_PORT);
            } else {
                g_port = MMON_DEFAULT_HTTP_PORT;
            }
        } else if (strcmp(argv[i], "--demo") == 0) {
            g_cfg.demo = 1;
        } else if (strcmp(argv[i], "--interval") == 0 && i + 1 < argc) {
            g_cfg.interval_ms = (uint16_t)atoi(argv[++i]);
            if (g_cfg.interval_ms < 100) g_cfg.interval_ms = 100;
        } else if (strcmp(argv[i], "--name") == 0 && i + 1 < argc) {
            strncpy(g_cfg.hostname, argv[++i], MMON_HOSTNAME_LEN - 1);
        } else if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            usage(argv[0]);
            return 0;
#ifdef _WIN32
        } else if (strcmp(argv[i], "--service") == 0 && i + 1 < argc) {
            i++;
            if (strcmp(argv[i], "install") == 0) service_cmd = 1;
            else if (strcmp(argv[i], "uninstall") == 0) service_cmd = 2;
            else if (strcmp(argv[i], "run") == 0) service_cmd = 3;
            else {
                usage(argv[0]);
                return 1;
            }
#endif
        } else {
            usage(argv[0]);
            return 1;
        }
    }

    if (!listen_mode && !connect_mode && !http_mode && !push_mode) {
        listen_mode = 1;
    }
    if ((listen_mode + connect_mode + http_mode + push_mode) > 1) {
        fprintf(stderr, "choose one of --listen, --connect, --push, --http\n");
        return 1;
    }
    g_listen_mode = listen_mode;
    g_http_mode = http_mode;
    g_push_mode = push_mode;

#ifdef _WIN32
    SetConsoleCtrlHandler(on_ctrl, TRUE);
    if (service_cmd == 1) {
        char self[MAX_PATH];
        char args[256];
        if (win_self_path(self, sizeof(self)) != 0) return 1;
        _snprintf(args, sizeof(args), "--service run --listen %s:%u --interval %u",
                  g_host, (unsigned)g_port, (unsigned)g_cfg.interval_ms);
        return mmon_win_service_install(self, args) == 0 ? 0 : 1;
    }
    if (service_cmd == 2) {
        return mmon_win_service_uninstall() == 0 ? 0 : 1;
    }
    if (service_cmd == 3) {
        return mmon_win_service_run(service_worker) == 0 ? 0 : 1;
    }
#else
    signal(SIGINT, on_sig);
    signal(SIGTERM, on_sig);
#endif

    return agent_run();
}
