#include "mmon.h"
#include <string.h>

uint16_t mmon_crc16(const uint8_t *data, size_t len) {
    uint16_t crc = 0xFFFF;
    size_t i;
    int bit;
    for (i = 0; i < len; i++) {
        crc ^= (uint16_t)data[i] << 8;
        for (bit = 0; bit < 8; bit++) {
            if (crc & 0x8000) {
                crc = (uint16_t)((crc << 1) ^ 0x1021);
            } else {
                crc = (uint16_t)(crc << 1);
            }
        }
    }
    return crc;
}

static void put_u16(uint8_t *p, uint16_t v) {
    p[0] = (uint8_t)(v & 0xFF);
    p[1] = (uint8_t)((v >> 8) & 0xFF);
}

static void put_u64(uint8_t *p, uint64_t v) {
    int i;
    for (i = 0; i < 8; i++) {
        p[i] = (uint8_t)((v >> (8 * i)) & 0xFF);
    }
}

static uint16_t get_u16(const uint8_t *p) {
    return (uint16_t)(p[0] | ((uint16_t)p[1] << 8));
}

static uint64_t get_u64(const uint8_t *p) {
    uint64_t v = 0;
    int i;
    for (i = 0; i < 8; i++) {
        v |= (uint64_t)p[i] << (8 * i);
    }
    return v;
}

static void put_f32(uint8_t *p, float v) {
    union {
        float f;
        uint32_t u;
    } u;
    u.f = v;
    p[0] = (uint8_t)(u.u & 0xFF);
    p[1] = (uint8_t)((u.u >> 8) & 0xFF);
    p[2] = (uint8_t)((u.u >> 16) & 0xFF);
    p[3] = (uint8_t)((u.u >> 24) & 0xFF);
}

size_t mmon_encode(uint8_t *out, size_t out_cap, uint8_t type, uint16_t seq,
                   const uint8_t *payload, uint16_t payload_len) {
    size_t total;
    uint16_t crc;
    if (!out || payload_len > MMON_MAX_PAYLOAD) {
        return 0;
    }
    total = (size_t)MMON_HDR_SIZE + payload_len + MMON_CRC_SIZE;
    if (out_cap < total) {
        return 0;
    }
    out[0] = MMON_MAGIC0;
    out[1] = MMON_MAGIC1;
    out[2] = MMON_VERSION;
    out[3] = type;
    put_u16(out + 4, seq);
    put_u16(out + 6, payload_len);
    if (payload_len && payload) {
        memcpy(out + MMON_HDR_SIZE, payload, payload_len);
    }
    crc = mmon_crc16(out, MMON_HDR_SIZE + payload_len);
    put_u16(out + MMON_HDR_SIZE + payload_len, crc);
    return total;
}

static void write_hello_payload(uint8_t *p, const mmon_hello_t *hello) {
    memset(p, 0, MMON_HELLO_SIZE);
    memcpy(p, hello->agent_id, MMON_AGENT_ID_LEN);
    p[16] = hello->os_type;
    p[17] = hello->caps;
    put_u16(p + 18, hello->interval_ms);
    memcpy(p + 20, hello->hostname, MMON_HOSTNAME_LEN);
}

size_t mmon_encode_hello(uint8_t *out, size_t out_cap, uint16_t seq, const mmon_hello_t *hello) {
    uint8_t payload[MMON_HELLO_SIZE];
    write_hello_payload(payload, hello);
    return mmon_encode(out, out_cap, MMON_HELLO, seq, payload, MMON_HELLO_SIZE);
}

size_t mmon_encode_metrics(uint8_t *out, size_t out_cap, uint16_t seq,
                           uint64_t ts_ms, const mmon_metric_t *metrics, size_t count) {
    uint8_t payload[MMON_MAX_PAYLOAD];
    size_t i;
    size_t off;
    if (count > 64) {
        count = 64;
    }
    memset(payload, 0, sizeof(payload));
    put_u64(payload, ts_ms);
    payload[8] = (uint8_t)count;
    off = 12;
    for (i = 0; i < count; i++) {
        if (off + MMON_METRIC_SIZE > MMON_MAX_PAYLOAD) {
            break;
        }
        payload[off] = metrics[i].id;
        payload[off + 1] = metrics[i].vtype;
        if (metrics[i].vtype == MMON_VT_F32) {
            put_f32(payload + off + 4, metrics[i].v.f32);
        } else {
            put_u64(payload + off + 4, metrics[i].v.u64);
        }
        off += MMON_METRIC_SIZE;
    }
    return mmon_encode(out, out_cap, MMON_METRICS, seq, payload, (uint16_t)off);
}

size_t mmon_encode_log(uint8_t *out, size_t out_cap, uint16_t seq,
                       uint8_t level, uint64_t ts_ms, const char *msg) {
    uint8_t payload[MMON_MAX_PAYLOAD];
    size_t msg_len;
    size_t len;
    if (!msg) {
        msg = "";
    }
    msg_len = strlen(msg);
    if (msg_len > MMON_MAX_PAYLOAD - 12) {
        msg_len = MMON_MAX_PAYLOAD - 12;
    }
    memset(payload, 0, 12);
    payload[0] = level;
    put_u64(payload + 4, ts_ms);
    memcpy(payload + 12, msg, msg_len);
    len = 12 + msg_len;
    return mmon_encode(out, out_cap, MMON_LOG, seq, payload, (uint16_t)len);
}

size_t mmon_encode_heartbeat(uint8_t *out, size_t out_cap, uint16_t seq) {
    return mmon_encode(out, out_cap, MMON_HEARTBEAT, seq, NULL, 0);
}

size_t mmon_encode_subscribe(uint8_t *out, size_t out_cap, uint16_t seq,
                             uint16_t interval_ms, uint8_t enable) {
    uint8_t payload[4];
    payload[0] = (uint8_t)(interval_ms & 0xFF);
    payload[1] = (uint8_t)((interval_ms >> 8) & 0xFF);
    payload[2] = enable;
    payload[3] = 0;
    return mmon_encode(out, out_cap, MMON_SUBSCRIBE, seq, payload, 4);
}

void mmon_decoder_init(mmon_decoder_t *dec) {
    if (dec) {
        dec->used = 0;
    }
}

static void decoder_consume(mmon_decoder_t *dec, size_t n) {
    if (n >= dec->used) {
        dec->used = 0;
        return;
    }
    memmove(dec->buf, dec->buf + n, dec->used - n);
    dec->used -= n;
}

int mmon_decoder_push(mmon_decoder_t *dec, const uint8_t *data, size_t len,
                      mmon_frame_t *frame, uint8_t *payload_out, size_t payload_cap) {
    size_t room;
    if (!dec || !frame) {
        return -1;
    }
    if (data && len) {
        room = sizeof(dec->buf) - dec->used;
        if (len > room) {
            len = room;
        }
        memcpy(dec->buf + dec->used, data, len);
        dec->used += len;
    }

    while (dec->used >= MMON_HDR_SIZE) {
        size_t i;
        uint16_t payload_len;
        size_t total;
        uint16_t got_crc;
        uint16_t exp_crc;

        if (dec->buf[0] != MMON_MAGIC0 || dec->buf[1] != MMON_MAGIC1) {
            int found = 0;
            for (i = 1; i < dec->used; i++) {
                if (dec->buf[i] == MMON_MAGIC0) {
                    decoder_consume(dec, i);
                    found = 1;
                    break;
                }
            }
            if (!found) {
                dec->used = 0;
                return 0;
            }
            continue;
        }

        if (dec->buf[2] != MMON_VERSION) {
            decoder_consume(dec, 1);
            continue;
        }

        payload_len = get_u16(dec->buf + 6);
        if (payload_len > MMON_MAX_PAYLOAD) {
            decoder_consume(dec, 1);
            continue;
        }
        total = (size_t)MMON_HDR_SIZE + payload_len + MMON_CRC_SIZE;
        if (dec->used < total) {
            return 0;
        }

        exp_crc = mmon_crc16(dec->buf, MMON_HDR_SIZE + payload_len);
        got_crc = get_u16(dec->buf + MMON_HDR_SIZE + payload_len);
        if (got_crc != exp_crc) {
            decoder_consume(dec, 1);
            continue;
        }

        frame->type = dec->buf[3];
        frame->seq = get_u16(dec->buf + 4);
        frame->length = payload_len;
        if (payload_out && payload_cap >= payload_len) {
            memcpy(payload_out, dec->buf + MMON_HDR_SIZE, payload_len);
            frame->payload = payload_out;
        } else {
            frame->payload = NULL;
        }
        decoder_consume(dec, total);
        return 1;
    }
    return 0;
}

int mmon_parse_hello(const uint8_t *payload, uint16_t len, mmon_hello_t *hello) {
    if (!payload || !hello || len < MMON_HELLO_SIZE) {
        return -1;
    }
    memset(hello, 0, sizeof(*hello));
    memcpy(hello->agent_id, payload, MMON_AGENT_ID_LEN);
    hello->os_type = payload[16];
    hello->caps = payload[17];
    hello->interval_ms = get_u16(payload + 18);
    memcpy(hello->hostname, payload + 20, MMON_HOSTNAME_LEN);
    hello->hostname[MMON_HOSTNAME_LEN - 1] = '\0';
    return 0;
}

int mmon_parse_subscribe(const uint8_t *payload, uint16_t len,
                         uint16_t *interval_ms, uint8_t *enable) {
    if (!payload || len < 4) {
        return -1;
    }
    if (interval_ms) {
        *interval_ms = get_u16(payload);
    }
    if (enable) {
        *enable = payload[2];
    }
    return 0;
}
