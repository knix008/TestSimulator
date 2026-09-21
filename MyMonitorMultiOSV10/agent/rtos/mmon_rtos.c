#include "mmon_rtos_port.h"
#include <string.h>

void mmon_rtos_session_init(mmon_rtos_session_t *s, const mmon_rtos_identity_t *id) {
    memset(s, 0, sizeof(*s));
    if (id) {
        s->id = *id;
    } else {
        s->id.os_type = MMON_OS_RTOS;
        s->id.caps = (uint8_t)(MMON_CAP_CPU | MMON_CAP_RTOS | MMON_CAP_NET);
        strncpy(s->id.hostname, "rtos", MMON_HOSTNAME_LEN - 1);
    }
    if (s->id.os_type == 0) {
        s->id.os_type = MMON_OS_RTOS;
    }
    s->interval_ms = s->id.interval_ms ? s->id.interval_ms : MMON_DEFAULT_INTERVAL_MS;
    s->subscribed = 1;
    s->seq = 1;
    mmon_decoder_init(&s->dec);
}

int mmon_rtos_send_hello(mmon_rtos_session_t *s) {
    mmon_hello_t hello;
    size_t n;
    memset(&hello, 0, sizeof(hello));
    memcpy(hello.agent_id, s->id.agent_id, MMON_AGENT_ID_LEN);
    hello.os_type = s->id.os_type;
    hello.caps = s->id.caps ? s->id.caps : (uint8_t)(MMON_CAP_CPU | MMON_CAP_RTOS);
    hello.interval_ms = s->interval_ms;
    memcpy(hello.hostname, s->id.hostname, MMON_HOSTNAME_LEN);
    n = mmon_encode_hello(s->tx, sizeof(s->tx), s->seq++, &hello);
    if (!n) return -1;
    return mmon_rtos_send(s->tx, n);
}

int mmon_rtos_on_rx(mmon_rtos_session_t *s, const uint8_t *data, size_t len) {
    mmon_frame_t fr;
    int r;
    int handled = 0;
    const uint8_t *chunk = data;
    size_t chunk_len = len;

    do {
        r = mmon_decoder_push(&s->dec, chunk, chunk_len, &fr, s->payload, sizeof(s->payload));
        chunk = NULL;
        chunk_len = 0;
        if (r != 1) {
            break;
        }
        handled++;
        if (fr.type == MMON_SUBSCRIBE) {
            uint16_t interval = 0;
            uint8_t enable = 1;
            if (mmon_parse_subscribe(s->payload, fr.length, &interval, &enable) == 0) {
                if (interval) s->interval_ms = interval;
                s->subscribed = enable ? 1 : 0;
            }
        } else if (fr.type == MMON_HELLO || fr.type == MMON_HELLO_ACK) {
            mmon_rtos_send_hello(s);
        } else if (fr.type == MMON_DISCONNECT) {
            s->subscribed = 0;
        }
    } while (1);
    return handled;
}

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

int mmon_rtos_tick(mmon_rtos_session_t *s) {
    mmon_rtos_sample_t sample;
    mmon_metric_t metrics[12];
    size_t n = 0;
    size_t encoded;
    uint64_t now;

    if (!s->subscribed) {
        return 0;
    }
    now = mmon_rtos_now_ms();
    if (s->last_metrics_ms && (now - s->last_metrics_ms) < s->interval_ms) {
        return 0;
    }
    memset(&sample, 0, sizeof(sample));
    mmon_rtos_collect(&sample);

    if (sample.has_cpu) add_f32(metrics, &n, 12, MMON_CPU_PCT, sample.cpu_pct);
    if (sample.has_heap) {
        add_u64(metrics, &n, 12, MMON_HEAP_USED, sample.heap_used);
        add_u64(metrics, &n, 12, MMON_HEAP_TOTAL, sample.heap_total);
        add_u64(metrics, &n, 12, MMON_RAM_USED, sample.heap_used);
        add_u64(metrics, &n, 12, MMON_RAM_TOTAL, sample.heap_total);
    }
    if (sample.has_tasks) add_u64(metrics, &n, 12, MMON_TASKS, sample.tasks);
    if (sample.has_net) {
        add_f32(metrics, &n, 12, MMON_NET_RX_RATE, sample.net_rx_rate);
        add_f32(metrics, &n, 12, MMON_NET_TX_RATE, sample.net_tx_rate);
    }
    if (sample.has_temp) add_f32(metrics, &n, 12, MMON_TEMP, sample.temp_c);
    add_u64(metrics, &n, 12, MMON_UPTIME, sample.uptime_s ? sample.uptime_s : now / 1000ull);

    encoded = mmon_encode_metrics(s->tx, sizeof(s->tx), s->seq++, now, metrics, n);
    if (!encoded) return -1;
    s->last_metrics_ms = now;
    return mmon_rtos_send(s->tx, encoded);
}
