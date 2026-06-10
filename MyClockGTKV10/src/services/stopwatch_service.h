#pragma once
#include "app_state.h"

void   stopwatch_start(StopwatchService *sw);
void   stopwatch_stop(StopwatchService  *sw);
void   stopwatch_reset(StopwatchService *sw);
void   stopwatch_lap(StopwatchService   *sw);
gint64 stopwatch_elapsed_us(const StopwatchService *sw);
void   stopwatch_get_hms(const StopwatchService *sw, int *h, int *m, int *s, int *ms);
