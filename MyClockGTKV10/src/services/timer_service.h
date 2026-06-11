#pragma once
#include "app_state.h"

void   timer_service_init(TimerService *svc);
void   timer_service_set(TimerService *svc, int h, int m, int s, const char *label);
void   timer_service_start(TimerService *svc);
void   timer_service_pause(TimerService *svc);
void   timer_service_stop(TimerService *svc);
gint64 timer_service_remaining_us(const TimerService *svc);
void   timer_service_get_remaining_hms(const TimerService *svc, int *h, int *m, int *s);
