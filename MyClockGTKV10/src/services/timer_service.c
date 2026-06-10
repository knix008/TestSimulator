#include <string.h>
#include "timer_service.h"

void timer_service_init(TimerService *svc)
{
    memset(svc, 0, sizeof(*svc));
    svc->state = TIMER_STATE_IDLE;
}

void timer_service_set(TimerService *svc, int h, int m, int s, const char *label)
{
    svc->set_hours   = h;
    svc->set_minutes = m;
    svc->set_seconds = s;
    g_strlcpy(svc->label, label ? label : "", sizeof(svc->label));

    gint64 total_us = (gint64)h * 3600000000LL
                    + (gint64)m * 60000000LL
                    + (gint64)s * 1000000LL;
    svc->remain_us = total_us;
    svc->state     = TIMER_STATE_IDLE;
}

void timer_service_start(TimerService *svc)
{
    if (svc->state == TIMER_STATE_RUNNING) return;

    svc->start_us = g_get_monotonic_time();
    svc->state    = TIMER_STATE_RUNNING;
}

void timer_service_pause(TimerService *svc)
{
    if (svc->state != TIMER_STATE_RUNNING) return;

    gint64 elapsed = g_get_monotonic_time() - svc->start_us;
    svc->remain_us -= elapsed;
    if (svc->remain_us < 0) svc->remain_us = 0;
    svc->state = TIMER_STATE_PAUSED;
}

void timer_service_stop(TimerService *svc)
{
    gint64 total_us = (gint64)svc->set_hours   * 3600000000LL
                    + (gint64)svc->set_minutes * 60000000LL
                    + (gint64)svc->set_seconds * 1000000LL;
    svc->remain_us = total_us;
    svc->state     = TIMER_STATE_IDLE;
}

gint64 timer_service_remaining_us(const TimerService *svc)
{
    if (svc->state == TIMER_STATE_IDLE)   return svc->remain_us;
    if (svc->state == TIMER_STATE_PAUSED) return svc->remain_us;

    gint64 elapsed = g_get_monotonic_time() - svc->start_us;
    gint64 remain  = svc->remain_us - elapsed;
    return remain < 0 ? 0 : remain;
}

void timer_service_get_remaining_hms(const TimerService *svc, int *h, int *m, int *s)
{
    gint64 us  = timer_service_remaining_us(svc);
    gint64 sec = us / 1000000LL;
    *h = (int)(sec / 3600);
    *m = (int)((sec % 3600) / 60);
    *s = (int)(sec % 60);
}
