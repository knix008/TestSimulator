/*
 * Example RTOS glue. Copy this file into the firmware tree and replace the
 * stubs with board calls (UART, lwIP, FreeRTOS heap/task stats).
 *
 * Typical FreeRTOS loop:
 *   mmon_rtos_session_init(&session, &id);
 *   mmon_rtos_send_hello(&session);
 *   for (;;) {
 *       n = uart_read(buf, sizeof(buf));
 *       if (n > 0) mmon_rtos_on_rx(&session, buf, n);
 *       mmon_rtos_tick(&session);
 *       vTaskDelay(pdMS_TO_TICKS(20));
 *   }
 */

#include "mmon_rtos_port.h"

#if defined(MMON_RTOS_EXAMPLE_BUILD)

#include <string.h>

static mmon_rtos_session_t g_session;

/* ---- board stubs: replace these ---- */

uint64_t mmon_rtos_now_ms(void) {
    /* return xTaskGetTickCount() * portTICK_PERIOD_MS; */
    static uint64_t t;
    t += 20;
    return t;
}

int mmon_rtos_send(const uint8_t *data, size_t len) {
    /* uart_write(data, len);  or  tcp_write(pcb, data, len, TCP_WRITE_FLAG_COPY); */
    (void)data;
    (void)len;
    return 0;
}

void mmon_rtos_collect(mmon_rtos_sample_t *out) {
    memset(out, 0, sizeof(*out));
    /* out->cpu_pct = 100.f - (idle_counter / idle_max) * 100.f; */
    out->cpu_pct = 18.0f;
    out->has_cpu = 1;
    /* out->heap_used = configTOTAL_HEAP_SIZE - xPortGetFreeHeapSize(); */
    out->heap_used = 48 * 1024;
    out->heap_total = 128 * 1024;
    out->has_heap = 1;
    /* out->tasks = uxTaskGetNumberOfTasks(); */
    out->tasks = 7;
    out->has_tasks = 1;
    out->net_rx_rate = 800.0f;
    out->net_tx_rate = 120.0f;
    out->has_net = 1;
    out->temp_c = 41.5f;
    out->has_temp = 1;
    out->uptime_s = mmon_rtos_now_ms() / 1000ull;
}

void mmon_rtos_app_init(void) {
    mmon_rtos_identity_t id;
    memset(&id, 0, sizeof(id));
    id.os_type = MMON_OS_RTOS;
    id.caps = (uint8_t)(MMON_CAP_CPU | MMON_CAP_RAM | MMON_CAP_NET | MMON_CAP_TEMP | MMON_CAP_RTOS);
    id.interval_ms = 1000;
    strncpy(id.hostname, "rtos-node-1", MMON_HOSTNAME_LEN - 1);
    memcpy(id.agent_id, "rtos-node-1", 11);
    mmon_rtos_session_init(&g_session, &id);
    mmon_rtos_send_hello(&g_session);
}

void mmon_rtos_app_poll(const uint8_t *rx, size_t rx_len) {
    if (rx && rx_len) {
        mmon_rtos_on_rx(&g_session, rx, rx_len);
    }
    mmon_rtos_tick(&g_session);
}

#endif
