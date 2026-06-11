#include <string.h>
#include "stopwatch_service.h"

void stopwatch_start(StopwatchService *sw)
{
    if (sw->is_running) return;
    sw->start_us   = g_get_monotonic_time();
    sw->is_running = TRUE;
}

void stopwatch_stop(StopwatchService *sw)
{
    if (!sw->is_running) return;
    sw->elapsed_us += g_get_monotonic_time() - sw->start_us;
    sw->is_running  = FALSE;
}

void stopwatch_reset(StopwatchService *sw)
{
    sw->is_running = FALSE;
    sw->elapsed_us = 0;
    sw->lap_count  = 0;
}

void stopwatch_lap(StopwatchService *sw)
{
    if (!sw->is_running) return;
    if (sw->lap_count >= MAX_LAP_TIMES) return;
    sw->lap_times_us[sw->lap_count++] = stopwatch_elapsed_us(sw);
}

gint64 stopwatch_elapsed_us(const StopwatchService *sw)
{
    gint64 e = sw->elapsed_us;
    if (sw->is_running)
        e += g_get_monotonic_time() - sw->start_us;
    return e;
}

void stopwatch_get_hms(const StopwatchService *sw, int *h, int *m, int *s, int *ms)
{
    gint64 us    = stopwatch_elapsed_us(sw);
    gint64 total_ms = us / 1000LL;
    *ms = (int)(total_ms % 1000);
    gint64 sec  = total_ms / 1000;
    *s  = (int)(sec % 60);
    gint64 min  = sec / 60;
    *m  = (int)(min % 60);
    *h  = (int)(min / 60);
}
