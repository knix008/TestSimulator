#ifdef _WIN32

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0601
#endif

#include "mmon_platform.h"

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <iphlpapi.h>
#include <netioapi.h>
#include <psapi.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "psapi.lib")

static uint64_t g_prev_idle;
static uint64_t g_prev_kernel;
static uint64_t g_prev_user;
static int g_have_cpu;
static uint64_t g_prev_rx;
static uint64_t g_prev_tx;
static uint64_t g_prev_ms;
static int g_have_net;

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

static uint64_t filetime_u64(const FILETIME *ft) {
    ULARGE_INTEGER u;
    u.LowPart = ft->dwLowDateTime;
    u.HighPart = ft->dwHighDateTime;
    return u.QuadPart;
}

static int read_cpu_pct(float *out) {
    FILETIME idle, kernel, user;
    uint64_t i, k, u, didle, dtotal;
    if (!GetSystemTimes(&idle, &kernel, &user)) {
        return -1;
    }
    i = filetime_u64(&idle);
    k = filetime_u64(&kernel);
    u = filetime_u64(&user);
    if (!g_have_cpu) {
        g_prev_idle = i;
        g_prev_kernel = k;
        g_prev_user = u;
        g_have_cpu = 1;
        *out = 0;
        return 0;
    }
    didle = i - g_prev_idle;
    dtotal = (k - g_prev_kernel) + (u - g_prev_user);
    g_prev_idle = i;
    g_prev_kernel = k;
    g_prev_user = u;
    if (!dtotal) {
        *out = 0;
        return 0;
    }
    *out = (float)(100.0 * (double)(dtotal - didle) / (double)dtotal);
    if (*out < 0) *out = 0;
    if (*out > 100) *out = 100;
    return 0;
}

static int read_mem(uint64_t *used, uint64_t *total) {
    MEMORYSTATUSEX ms;
    ms.dwLength = sizeof(ms);
    if (!GlobalMemoryStatusEx(&ms)) {
        return -1;
    }
    *total = ms.ullTotalPhys;
    *used = ms.ullTotalPhys - ms.ullAvailPhys;
    return 0;
}

static int read_disk(uint64_t *used, uint64_t *total) {
    char drives[256];
    char *p;
    uint64_t sum_used = 0, sum_total = 0;
    int any = 0;

    if (!GetLogicalDriveStringsA(sizeof(drives) - 1, drives)) {
        ULARGE_INTEGER free_bytes, total_bytes, dummy;
        if (!GetDiskFreeSpaceExA("C:\\", &dummy, &total_bytes, &free_bytes)) {
            return -1;
        }
        *total = total_bytes.QuadPart;
        *used = total_bytes.QuadPart - free_bytes.QuadPart;
        return 0;
    }
    for (p = drives; *p; p += strlen(p) + 1) {
        ULARGE_INTEGER free_bytes, total_bytes, dummy;
        if (GetDriveTypeA(p) != DRIVE_FIXED) continue;
        if (!GetDiskFreeSpaceExA(p, &dummy, &total_bytes, &free_bytes)) continue;
        sum_total += total_bytes.QuadPart;
        sum_used += total_bytes.QuadPart - free_bytes.QuadPart;
        any = 1;
    }
    if (!any) return -1;
    *used = sum_used;
    *total = sum_total;
    return 0;
}

static int read_net(uint64_t *rx, uint64_t *tx) {
    MIB_IF_TABLE2 *table = NULL;
    ULONG i;
    uint64_t sum_rx = 0, sum_tx = 0;

    if (GetIfTable2(&table) == NO_ERROR && table) {
        for (i = 0; i < table->NumEntries; i++) {
            MIB_IF_ROW2 *row = &table->Table[i];
            if (row->Type == IF_TYPE_SOFTWARE_LOOPBACK) continue;
            if (row->OperStatus != IfOperStatusUp) continue;
            sum_rx += row->InOctets;
            sum_tx += row->OutOctets;
        }
        FreeMibTable(table);
        *rx = sum_rx;
        *tx = sum_tx;
        return 0;
    }

    {
        PMIB_IFTABLE legacy = NULL;
        DWORD size = 0;
        DWORD j;
        if (GetIfTable(NULL, &size, TRUE) != ERROR_INSUFFICIENT_BUFFER) {
            return -1;
        }
        legacy = (PMIB_IFTABLE)malloc(size);
        if (!legacy) return -1;
        if (GetIfTable(legacy, &size, TRUE) != NO_ERROR) {
            free(legacy);
            return -1;
        }
        for (j = 0; j < legacy->dwNumEntries; j++) {
            MIB_IFROW *row = &legacy->table[j];
            if (row->dwType == IF_TYPE_SOFTWARE_LOOPBACK) continue;
            sum_rx += row->dwInOctets;
            sum_tx += row->dwOutOctets;
        }
        free(legacy);
        *rx = sum_rx;
        *tx = sum_tx;
        return 0;
    }
}

static int read_procs(uint64_t *count) {
    DWORD ids[2048];
    DWORD needed = 0;
    if (!EnumProcesses(ids, sizeof(ids), &needed)) {
        return -1;
    }
    *count = needed / sizeof(DWORD);
    return 0;
}

static void fill_demo(mmon_metric_t *out, size_t *n, size_t max, uint64_t now) {
    float phase = (float)((now / 1000) % 60) / 60.0f;
    add_f32(out, n, max, MMON_CPU_PCT, 25.0f + 20.0f * phase);
    add_u64(out, n, max, MMON_RAM_USED, 400ull * 1024 * 1024 + (uint64_t)(phase * 80 * 1024 * 1024));
    add_u64(out, n, max, MMON_RAM_TOTAL, 8ull * 1024 * 1024 * 1024);
    add_u64(out, n, max, MMON_DISK_USED, 120ull * 1024 * 1024 * 1024);
    add_u64(out, n, max, MMON_DISK_TOTAL, 512ull * 1024 * 1024 * 1024);
    add_f32(out, n, max, MMON_LOAD1, 0.0f);
    add_f32(out, n, max, MMON_NET_RX_RATE, 12000.0f + phase * 4000.0f);
    add_f32(out, n, max, MMON_NET_TX_RATE, 4000.0f + phase * 1500.0f);
    add_u64(out, n, max, MMON_UPTIME, now / 1000);
    add_u64(out, n, max, MMON_PROCS, 120);
}

int mmon_plat_init(void) {
    WSADATA wsa;
    g_have_cpu = 0;
    g_have_net = 0;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        return -1;
    }
    return 0;
}

void mmon_plat_shutdown(void) {
    WSACleanup();
}

uint64_t mmon_plat_now_ms(void) {
    FILETIME ft;
    uint64_t t;
    GetSystemTimeAsFileTime(&ft);
    t = filetime_u64(&ft);
    /* 100ns since 1601 to ms since 1970 */
    return (t / 10000ull) - 11644473600000ull;
}

void mmon_plat_sleep_ms(uint32_t ms) {
    Sleep(ms);
}

void mmon_plat_hello(mmon_hello_t *hello, const mmon_plat_cfg_t *cfg) {
    char name[MAX_COMPUTERNAME_LENGTH + 1];
    DWORD nlen = (DWORD)sizeof(name);
    memset(hello, 0, sizeof(*hello));
    hello->os_type = MMON_OS_WINDOWS;
    hello->caps = (uint8_t)(MMON_CAP_CPU | MMON_CAP_RAM | MMON_CAP_DISK | MMON_CAP_LOAD | MMON_CAP_NET);
    hello->interval_ms = cfg && cfg->interval_ms ? cfg->interval_ms : MMON_DEFAULT_INTERVAL_MS;
    if (cfg && cfg->hostname[0]) {
        strncpy(hello->hostname, cfg->hostname, MMON_HOSTNAME_LEN - 1);
    } else if (GetComputerNameA(name, &nlen)) {
        strncpy(hello->hostname, name, MMON_HOSTNAME_LEN - 1);
    } else {
        strncpy(hello->hostname, "windows", MMON_HOSTNAME_LEN - 1);
    }
    memcpy(hello->agent_id, hello->hostname, MMON_AGENT_ID_LEN);
}

size_t mmon_plat_collect(mmon_metric_t *out, size_t max_count, const mmon_plat_cfg_t *cfg) {
    size_t n = 0;
    float cpu = 0;
    uint64_t ram_used = 0, ram_total = 0, disk_used = 0, disk_total = 0;
    uint64_t rx = 0, tx = 0, now;

    if (!out || !max_count) return 0;
    now = mmon_plat_now_ms();
    if (cfg && cfg->demo) {
        fill_demo(out, &n, max_count, now);
        return n;
    }
    if (read_cpu_pct(&cpu) == 0) add_f32(out, &n, max_count, MMON_CPU_PCT, cpu);
    if (read_mem(&ram_used, &ram_total) == 0) {
        add_u64(out, &n, max_count, MMON_RAM_USED, ram_used);
        add_u64(out, &n, max_count, MMON_RAM_TOTAL, ram_total);
    }
    if (read_disk(&disk_used, &disk_total) == 0) {
        add_u64(out, &n, max_count, MMON_DISK_USED, disk_used);
        add_u64(out, &n, max_count, MMON_DISK_TOTAL, disk_total);
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
    add_u64(out, &n, max_count, MMON_UPTIME, GetTickCount64() / 1000ull);
    {
        SYSTEM_INFO sys;
        uint64_t procs = 0;
        GetSystemInfo(&sys);
        if (sys.dwNumberOfProcessors > 0) {
            add_f32(out, &n, max_count, MMON_LOAD1, cpu / 100.0f * (float)sys.dwNumberOfProcessors);
        }
        if (read_procs(&procs) == 0) {
            add_u64(out, &n, max_count, MMON_PROCS, procs);
        }
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
    SOCKET fd;
    struct sockaddr_in addr;
    BOOL yes = TRUE;
    fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (fd == INVALID_SOCKET) return -1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, (const char *)&yes, sizeof(yes));
    if (make_addr(host, port, &addr) != 0 || bind(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        closesocket(fd);
        return -1;
    }
    if (listen(fd, 4) != 0) {
        closesocket(fd);
        return -1;
    }
    return (int)fd;
}

int mmon_plat_accept(int listen_fd) {
    SOCKET c = accept((SOCKET)listen_fd, NULL, NULL);
    if (c == INVALID_SOCKET) return -1;
    return (int)c;
}

int mmon_plat_connect(const char *host, uint16_t port) {
    struct addrinfo hints;
    struct addrinfo *res = NULL;
    struct addrinfo *p;
    char portstr[16];
    SOCKET fd;

    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    _snprintf(portstr, sizeof(portstr), "%u", (unsigned)port);
    if (getaddrinfo(host ? host : "127.0.0.1", portstr, &hints, &res) != 0) {
        return -1;
    }
    for (p = res; p; p = p->ai_next) {
        fd = socket(p->ai_family, p->ai_socktype, p->ai_protocol);
        if (fd == INVALID_SOCKET) continue;
        if (connect(fd, p->ai_addr, (int)p->ai_addrlen) == 0) {
            freeaddrinfo(res);
            return (int)fd;
        }
        closesocket(fd);
    }
    freeaddrinfo(res);
    return -1;
}

int mmon_plat_set_nonblock(int fd) {
    u_long mode = 1;
    return ioctlsocket((SOCKET)fd, FIONBIO, &mode) == 0 ? 0 : -1;
}

int mmon_plat_send(int fd, const uint8_t *data, size_t len) {
    size_t sent = 0;
    while (sent < len) {
        int n = send((SOCKET)fd, (const char *)(data + sent), (int)(len - sent), 0);
        if (n <= 0) return -1;
        sent += (size_t)n;
    }
    return 0;
}

int mmon_plat_recv(int fd, uint8_t *data, size_t cap) {
    int n = recv((SOCKET)fd, (char *)data, (int)cap, 0);
    return n;
}

void mmon_plat_close(int fd) {
    if (fd >= 0) closesocket((SOCKET)fd);
}

#endif
