#ifndef MMON_H
#define MMON_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define MMON_MAGIC0          0x4D
#define MMON_MAGIC1          0x4E
#define MMON_VERSION         1
#define MMON_MAX_FRAME       1024
#define MMON_HDR_SIZE        8
#define MMON_CRC_SIZE        2
#define MMON_MAX_PAYLOAD     (MMON_MAX_FRAME - MMON_HDR_SIZE - MMON_CRC_SIZE)
#define MMON_HELLO_SIZE      48
#define MMON_METRIC_SIZE     12
#define MMON_DEFAULT_PORT    9510
#define MMON_DEFAULT_HTTP_PORT 9511
#define MMON_DEFAULT_INTERVAL_MS 1000
#define MMON_HOSTNAME_LEN    32
#define MMON_AGENT_ID_LEN    16

enum mmon_type {
    MMON_HELLO      = 0x01,
    MMON_HELLO_ACK  = 0x02,
    MMON_HEARTBEAT  = 0x03,
    MMON_METRICS    = 0x04,
    MMON_LOG        = 0x05,
    MMON_SUBSCRIBE  = 0x06,
    MMON_ERROR      = 0x07,
    MMON_DISCONNECT = 0x08
};

enum mmon_os {
    MMON_OS_LINUX    = 1,
    MMON_OS_WINDOWS  = 2,
    MMON_OS_MACOS    = 3,
    MMON_OS_RTOS     = 4,
    MMON_OS_ELECTRON = 5
};

enum mmon_cap {
    MMON_CAP_CPU  = 1 << 0,
    MMON_CAP_RAM  = 1 << 1,
    MMON_CAP_DISK = 1 << 2,
    MMON_CAP_LOAD = 1 << 3,
    MMON_CAP_NET  = 1 << 4,
    MMON_CAP_TEMP = 1 << 5,
    MMON_CAP_RTOS = 1 << 6
};

enum mmon_metric_id {
    MMON_CPU_PCT     = 1,
    MMON_RAM_USED    = 2,
    MMON_RAM_TOTAL   = 3,
    MMON_DISK_USED   = 4,
    MMON_DISK_TOTAL  = 5,
    MMON_LOAD1       = 6,
    MMON_LOAD5       = 7,
    MMON_LOAD15      = 8,
    MMON_NET_RX      = 9,
    MMON_NET_TX      = 10,
    MMON_NET_RX_RATE = 11,
    MMON_NET_TX_RATE = 12,
    MMON_UPTIME      = 13,
    MMON_PROCS       = 14,
    MMON_TEMP        = 15,
    MMON_HEAP_USED   = 16,
    MMON_HEAP_TOTAL  = 17,
    MMON_TASKS       = 18
};

enum mmon_vtype {
    MMON_VT_F32 = 1,
    MMON_VT_U64 = 2
};

enum mmon_log_level {
    MMON_LOG_DEBUG = 0,
    MMON_LOG_INFO  = 1,
    MMON_LOG_WARN  = 2,
    MMON_LOG_ERROR = 3
};

typedef struct {
    uint8_t id;
    uint8_t vtype;
    union {
        float    f32;
        uint64_t u64;
    } v;
} mmon_metric_t;

typedef struct {
    uint8_t  agent_id[MMON_AGENT_ID_LEN];
    uint8_t  os_type;
    uint8_t  caps;
    uint16_t interval_ms;
    char     hostname[MMON_HOSTNAME_LEN];
} mmon_hello_t;

typedef struct {
    uint8_t type;
    uint16_t seq;
    uint16_t length;
    const uint8_t *payload;
} mmon_frame_t;

typedef struct {
    uint8_t buf[MMON_MAX_FRAME * 2];
    size_t  used;
} mmon_decoder_t;

uint16_t mmon_crc16(const uint8_t *data, size_t len);

size_t mmon_encode(uint8_t *out, size_t out_cap, uint8_t type, uint16_t seq,
                   const uint8_t *payload, uint16_t payload_len);

size_t mmon_encode_hello(uint8_t *out, size_t out_cap, uint16_t seq, const mmon_hello_t *hello);
size_t mmon_encode_metrics(uint8_t *out, size_t out_cap, uint16_t seq,
                           uint64_t ts_ms, const mmon_metric_t *metrics, size_t count);
size_t mmon_encode_log(uint8_t *out, size_t out_cap, uint16_t seq,
                       uint8_t level, uint64_t ts_ms, const char *msg);
size_t mmon_encode_heartbeat(uint8_t *out, size_t out_cap, uint16_t seq);
size_t mmon_encode_subscribe(uint8_t *out, size_t out_cap, uint16_t seq,
                             uint16_t interval_ms, uint8_t enable);

void mmon_decoder_init(mmon_decoder_t *dec);
int  mmon_decoder_push(mmon_decoder_t *dec, const uint8_t *data, size_t len,
                       mmon_frame_t *frame, uint8_t *payload_out, size_t payload_cap);

int mmon_parse_hello(const uint8_t *payload, uint16_t len, mmon_hello_t *hello);
int mmon_parse_subscribe(const uint8_t *payload, uint16_t len,
                         uint16_t *interval_ms, uint8_t *enable);

#ifdef __cplusplus
}
#endif

#endif
