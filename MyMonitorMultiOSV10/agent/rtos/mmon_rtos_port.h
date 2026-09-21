#ifndef MMON_RTOS_PORT_H
#define MMON_RTOS_PORT_H

/*
 * RTOS port API. The protocol core (mmon_protocol.c) has no heap or socket
 * dependency. Wire these hooks to UART, lwIP, or the vendor TCP stack.
 */

#include "../include/mmon.h"

#ifdef __cplusplus
extern "C" {
#endif

#ifndef MMON_RTOS_TX_CAP
#define MMON_RTOS_TX_CAP MMON_MAX_FRAME
#endif

typedef struct {
    uint8_t  os_type;       /* MMON_OS_RTOS */
    uint8_t  caps;
    uint16_t interval_ms;
    char     hostname[MMON_HOSTNAME_LEN];
    uint8_t  agent_id[MMON_AGENT_ID_LEN];
} mmon_rtos_identity_t;

typedef struct {
    float    cpu_pct;
    uint64_t heap_used;
    uint64_t heap_total;
    uint64_t tasks;
    float    net_rx_rate;
    float    net_tx_rate;
    float    temp_c;
    uint64_t uptime_s;
    int      has_cpu;
    int      has_heap;
    int      has_tasks;
    int      has_net;
    int      has_temp;
} mmon_rtos_sample_t;

/* Board implementer provides these. */
uint64_t mmon_rtos_now_ms(void);
int      mmon_rtos_send(const uint8_t *data, size_t len);
void     mmon_rtos_collect(mmon_rtos_sample_t *out);

typedef struct {
    mmon_rtos_identity_t id;
    mmon_decoder_t       dec;
    uint16_t             seq;
    uint16_t             interval_ms;
    uint8_t              subscribed;
    uint64_t             last_metrics_ms;
    uint8_t              tx[MMON_RTOS_TX_CAP];
    uint8_t              payload[MMON_MAX_PAYLOAD];
} mmon_rtos_session_t;

void mmon_rtos_session_init(mmon_rtos_session_t *s, const mmon_rtos_identity_t *id);
int  mmon_rtos_on_rx(mmon_rtos_session_t *s, const uint8_t *data, size_t len);
int  mmon_rtos_send_hello(mmon_rtos_session_t *s);
int  mmon_rtos_tick(mmon_rtos_session_t *s);

#ifdef __cplusplus
}
#endif

#endif
