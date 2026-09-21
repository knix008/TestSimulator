#ifndef _WIN32

#define _DEFAULT_SOURCE
#define _POSIX_C_SOURCE 200809L

#include "mmon_platform.h"

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/in.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/statvfs.h>
#include <sys/time.h>
#include <sys/types.h>
#include <unistd.h>

#ifdef __APPLE__
#include <mach/mach.h>
#include <sys/sysctl.h>
#endif

static uint64_t g_prev_rx;
static uint64_t g_prev_tx;
static uint64_t g_prev_ms;
static int g_have_net;

#ifdef __linux__
static int read_cpu_pct(float *out) {
    static unsigned long long puser, pnice, psystem, pidle, piowait, pirq, psoft;
    static int have;
    FILE *fp;
    unsigned long long user, nice, system, idle, iowait, irq, softirq, steal;
    unsigned long long total, idle_all, dtotal, didle;
    char cpu[8];

    fp = fopen("/proc/stat", "r");
    if (!fp) {
        return -1;
    }
    if (fscanf(fp, "%7s %llu %llu %llu %llu %llu %llu %llu %llu",
               cpu, &user, &nice, &system, &idle, &iowait, &irq, &softirq, &steal) < 5) {
        fclose(fp);
        return -1;
    }
    fclose(fp);

    if (!have) {
        puser = user; pnice = nice; psystem = system; pidle = idle;
        piowait = iowait; pirq = irq; psoft = softirq;
        have = 1;
        *out = 0;
        return 0;
    }

    idle_all = idle + iowait;
    total = user + nice + system + idle + iowait + irq + softirq + steal;
    dtotal = total - (puser + pnice + psystem + pidle + piowait + pirq + psoft);
    didle = idle_all - (pidle + piowait);
    puser = user; pnice = nice; psystem = system; pidle = idle;
    piowait = iowait; pirq = irq; psoft = softirq;
    if (dtotal == 0) {
        *out = 0;
        return 0;
    }
    *out = (float)(100.0 * (double)(dtotal - didle) / (double)dtotal);
    return 0;
}

static int read_mem(uint64_t *used, uint64_t *total) {
    FILE *fp;
    char key[64];
    unsigned long long val;
    char unit[32];
    unsigned long long mem_total = 0, mem_avail = 0, mem_free = 0, buffers = 0, cached = 0;

    fp = fopen("/proc/meminfo", "r");
    if (!fp) {
        return -1;
    }
    while (fscanf(fp, "%63s %llu %31s", key, &val, unit) == 3) {
        if (strcmp(key, "MemTotal:") == 0) mem_total = val * 1024ULL;
        else if (strcmp(key, "MemAvailable:") == 0) mem_avail = val * 1024ULL;
        else if (strcmp(key, "MemFree:") == 0) mem_free = val * 1024ULL;
        else if (strcmp(key, "Buffers:") == 0) buffers = val * 1024ULL;
        else if (strcmp(key, "Cached:") == 0) cached = val * 1024ULL;
    }
    fclose(fp);
    if (!mem_total) {
        return -1;
    }
    *total = mem_total;
    *used = mem_avail ? (mem_total - mem_avail) : (mem_total - mem_free - buffers - cached);
    return 0;
}

static int read_net(uint64_t *rx, uint64_t *tx) {
    FILE *fp;
    char line[256];
    uint64_t sum_rx = 0, sum_tx = 0;

    fp = fopen("/proc/net/dev", "r");
    if (!fp) {
        return -1;
    }
    if (!fgets(line, sizeof(line), fp) || !fgets(line, sizeof(line), fp)) {
        fclose(fp);
        return -1;
    }
    while (fgets(line, sizeof(line), fp)) {
        char *colon;
        unsigned long long r, t;
        char ifname[32];
        colon = strchr(line, ':');
        if (!colon) continue;
        *colon = '\0';
        sscanf(line, "%31s", ifname);
        if (strcmp(ifname, "lo") == 0) continue;
        if (sscanf(colon + 1, "%llu %*s %*s %*s %*s %*s %*s %*s %llu", &r, &t) == 2) {
            sum_rx += r;
            sum_tx += t;
        }
    }
    fclose(fp);
    *rx = sum_rx;
    *tx = sum_tx;
    return 0;
}

static int read_procs(uint64_t *count) {
    FILE *fp;
    char line[256];
    unsigned long long n = 0;
    fp = fopen("/proc/loadavg", "r");
    if (!fp) {
        return -1;
    }
    if (fgets(line, sizeof(line), fp)) {
        /* loadavg: 0.00 0.00 0.00 1/123 456 */
        char *slash = strchr(line, '/');
        if (slash) {
            n = strtoull(slash + 1, NULL, 10);
        }
    }
    fclose(fp);
    *count = n;
    return 0;
}
#endif

#ifdef __APPLE__
static int read_cpu_pct(float *out) {
    host_cpu_load_info_data_t cpuinfo;
    mach_msg_type_number_t count = HOST_CPU_LOAD_INFO_COUNT;
    static unsigned int prev[CPU_STATE_MAX];
    static int have;
    natural_t user, sys, idle, nice, total, busy;

    if (host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO,
                        (host_info_t)&cpuinfo, &count) != KERN_SUCCESS) {
        return -1;
    }
    user = cpuinfo.cpu_ticks[CPU_STATE_USER];
    sys = cpuinfo.cpu_ticks[CPU_STATE_SYSTEM];
    idle = cpuinfo.cpu_ticks[CPU_STATE_IDLE];
    nice = cpuinfo.cpu_ticks[CPU_STATE_NICE];
    if (!have) {
        prev[CPU_STATE_USER] = user;
        prev[CPU_STATE_SYSTEM] = sys;
        prev[CPU_STATE_IDLE] = idle;
        prev[CPU_STATE_NICE] = nice;
        have = 1;
        *out = 0;
        return 0;
    }
    busy = (user - prev[CPU_STATE_USER]) + (sys - prev[CPU_STATE_SYSTEM]) + (nice - prev[CPU_STATE_NICE]);
    total = busy + (idle - prev[CPU_STATE_IDLE]);
    prev[CPU_STATE_USER] = user;
    prev[CPU_STATE_SYSTEM] = sys;
    prev[CPU_STATE_IDLE] = idle;
    prev[CPU_STATE_NICE] = nice;
    *out = total ? (float)(100.0 * busy / total) : 0;
    return 0;
}

static int read_mem(uint64_t *used, uint64_t *total) {
    int mib[2] = {CTL_HW, HW_MEMSIZE};
    uint64_t memsize = 0;
    size_t len = sizeof(memsize);
    mach_msg_type_number_t count = HOST_VM_INFO64_COUNT;
    vm_statistics64_data_t vm;
    uint64_t page;

    if (sysctl(mib, 2, &memsize, &len, NULL, 0) != 0) {
        return -1;
    }
    if (host_statistics64(mach_host_self(), HOST_VM_INFO64, (host_info64_t)&vm, &count) != KERN_SUCCESS) {
        return -1;
    }
    page = (uint64_t)sysconf(_SC_PAGESIZE);
    *total = memsize;
    *used = ((uint64_t)vm.active_count + vm.inactive_count + vm.wire_count) * page;
    return 0;
}

static int read_net(uint64_t *rx, uint64_t *tx) {
    *rx = 0;
    *tx = 0;
    return -1;
}

static int read_procs(uint64_t *count) {
    int mib[3] = {CTL_KERN, KERN_PROC, KERN_PROC_ALL};
    size_t len = 0;
    if (sysctl(mib, 3, NULL, &len, NULL, 0) != 0) {
        return -1;
    }
    *count = len / 800;
    return 0;
}
#endif

static void add_f32(mmon_metric_t *out, size_t *n, size_t max, uint8_t id, float v) {
    if (*n >= max) return;
    out[*n].id = id;
    out[*n].vtype = MMON_VT_F32;
    out[*n].v.f32 = v;
    (*n)++;
}

static void add_u64(mmon_metric_t *out, size_t *n, size_t max, uint8_t id, uint64_t v) {
    if (*n >= max) return;
    out[*n].id = id;
    out[*n].vtype = MMON_VT_U64;
    out[*n].v.u64 = v;
    (*n)++;
}

static void fill_demo(mmon_metric_t *out, size_t *n, size_t max, uint64_t now) {
    float phase = (float)((now / 1000) % 60) / 60.0f;
    float cpu = 25.0f + 20.0f * phase;
    add_f32(out, n, max, MMON_CPU_PCT, cpu);
    add_u64(out, n, max, MMON_RAM_USED,  400ull * 1024 * 1024 + (uint64_t)(phase * 80 * 1024 * 1024));
    add_u64(out, n, max, MMON_RAM_TOTAL, 1024ull * 1024 * 1024);
    add_u64(out, n, max, MMON_DISK_USED,  8ull * 1024 * 1024 * 1024);
    add_u64(out, n, max, MMON_DISK_TOTAL, 32ull * 1024 * 1024 * 1024);
    add_f32(out, n, max, MMON_LOAD1, 0.4f + phase);
    add_f32(out, n, max, MMON_LOAD5, 0.3f + phase * 0.5f);
    add_f32(out, n, max, MMON_LOAD15, 0.2f);
    add_f32(out, n, max, MMON_NET_RX_RATE, 12000.0f + phase * 4000.0f);
    add_f32(out, n, max, MMON_NET_TX_RATE, 4000.0f + phase * 1500.0f);
    add_u64(out, n, max, MMON_UPTIME, now / 1000);
    add_u64(out, n, max, MMON_PROCS, 80);
}

int mmon_plat_init(void) {
    g_have_net = 0;
    return 0;
}

void mmon_plat_shutdown(void) {}

uint64_t mmon_plat_now_ms(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (uint64_t)tv.tv_sec * 1000ull + (uint64_t)tv.tv_usec / 1000ull;
}

void mmon_plat_sleep_ms(uint32_t ms) {
    usleep(ms * 1000);
}

void mmon_plat_hello(mmon_hello_t *hello, const mmon_plat_cfg_t *cfg) {
    memset(hello, 0, sizeof(*hello));
#ifdef __APPLE__
    hello->os_type = MMON_OS_MACOS;
#else
    hello->os_type = MMON_OS_LINUX;
#endif
    hello->caps = (uint8_t)(MMON_CAP_CPU | MMON_CAP_RAM | MMON_CAP_DISK | MMON_CAP_LOAD | MMON_CAP_NET);
    hello->interval_ms = cfg && cfg->interval_ms ? cfg->interval_ms : MMON_DEFAULT_INTERVAL_MS;
    if (cfg && cfg->hostname[0]) {
        strncpy(hello->hostname, cfg->hostname, MMON_HOSTNAME_LEN - 1);
    } else {
        gethostname(hello->hostname, MMON_HOSTNAME_LEN - 1);
    }
    memcpy(hello->agent_id, hello->hostname, MMON_AGENT_ID_LEN);
}

size_t mmon_plat_collect(mmon_metric_t *out, size_t max_count, const mmon_plat_cfg_t *cfg) {
    size_t n = 0;
    float cpu = 0;
    uint64_t ram_used = 0, ram_total = 0;
    uint64_t disk_used = 0, disk_total = 0;
    uint64_t rx = 0, tx = 0, now, procs = 0;
    double load[3] = {0, 0, 0};
    struct statvfs vfs;

    if (!out || !max_count) {
        return 0;
    }
    now = mmon_plat_now_ms();
    if (cfg && cfg->demo) {
        fill_demo(out, &n, max_count, now);
        return n;
    }

    if (read_cpu_pct(&cpu) == 0) {
        add_f32(out, &n, max_count, MMON_CPU_PCT, cpu);
    }
    if (read_mem(&ram_used, &ram_total) == 0) {
        add_u64(out, &n, max_count, MMON_RAM_USED, ram_used);
        add_u64(out, &n, max_count, MMON_RAM_TOTAL, ram_total);
    }
    if (statvfs("/", &vfs) == 0) {
        disk_total = (uint64_t)vfs.f_blocks * vfs.f_frsize;
        disk_used = disk_total - (uint64_t)vfs.f_bavail * vfs.f_frsize;
        add_u64(out, &n, max_count, MMON_DISK_USED, disk_used);
        add_u64(out, &n, max_count, MMON_DISK_TOTAL, disk_total);
    }
    if (getloadavg(load, 3) == 3) {
        add_f32(out, &n, max_count, MMON_LOAD1, (float)load[0]);
        add_f32(out, &n, max_count, MMON_LOAD5, (float)load[1]);
        add_f32(out, &n, max_count, MMON_LOAD15, (float)load[2]);
    }
    if (read_net(&rx, &tx) == 0) {
        add_u64(out, &n, max_count, MMON_NET_RX, rx);
        add_u64(out, &n, max_count, MMON_NET_TX, tx);
        if (g_have_net && now > g_prev_ms) {
            float dt = (float)(now - g_prev_ms) / 1000.0f;
            if (dt > 0) {
                add_f32(out, &n, max_count, MMON_NET_RX_RATE, (float)(rx - g_prev_rx) / dt);
                add_f32(out, &n, max_count, MMON_NET_TX_RATE, (float)(tx - g_prev_tx) / dt);
            }
        }
        g_prev_rx = rx;
        g_prev_tx = tx;
        g_prev_ms = now;
        g_have_net = 1;
    }
    add_u64(out, &n, max_count, MMON_UPTIME, (uint64_t)(now / 1000));
    if (read_procs(&procs) == 0) {
        add_u64(out, &n, max_count, MMON_PROCS, procs);
    }
    return n;
}

static int make_addr(const char *host, uint16_t port, struct sockaddr_in *addr) {
    memset(addr, 0, sizeof(*addr));
    addr->sin_family = AF_INET;
    addr->sin_port = htons(port);
    if (!host || strcmp(host, "0.0.0.0") == 0) {
        addr->sin_addr.s_addr = htonl(INADDR_ANY);
        return 0;
    }
    if (inet_pton(AF_INET, host, &addr->sin_addr) == 1) {
        return 0;
    }
    return -1;
}

int mmon_plat_listen(const char *host, uint16_t port) {
    int fd, yes = 1;
    struct sockaddr_in addr;
    fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return -1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
    if (make_addr(host, port, &addr) != 0 || bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        close(fd);
        return -1;
    }
    if (listen(fd, 4) != 0) {
        close(fd);
        return -1;
    }
    return fd;
}

int mmon_plat_accept(int listen_fd) {
    return accept(listen_fd, NULL, NULL);
}

int mmon_plat_connect(const char *host, uint16_t port) {
    int fd;
    struct sockaddr_in addr;
    fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return -1;
    if (make_addr(host, port, &addr) != 0 || connect(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        close(fd);
        return -1;
    }
    return fd;
}

int mmon_plat_send(int fd, const uint8_t *data, size_t len) {
    size_t sent = 0;
    while (sent < len) {
        ssize_t n = send(fd, data + sent, len - sent, 0);
        if (n < 0) {
            if (errno == EINTR) continue;
            return -1;
        }
        sent += (size_t)n;
    }
    return 0;
}

int mmon_plat_recv(int fd, uint8_t *data, size_t cap) {
    ssize_t n = recv(fd, data, cap, 0);
    if (n < 0) {
        if (errno == EINTR) return 0;
        return -1;
    }
    return (int)n;
}

void mmon_plat_close(int fd) {
    if (fd >= 0) close(fd);
}

int mmon_plat_set_nonblock(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0) return -1;
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK) == 0 ? 0 : -1;
}

#endif
