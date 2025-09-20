#include "clock.h"
#include <stdio.h>
#include <stdlib.h>
#include "platform.h"

// Utility functions
uint32_t timespec_to_ms(struct timespec ts) {
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

struct timespec ms_to_timespec(uint32_t ms) {
    struct timespec ts;
    ts.tv_sec = ms / 1000;
    ts.tv_nsec = (ms % 1000) * 1000000;
    return ts;
}

struct timespec timespec_add_ms(struct timespec ts, uint32_t ms) {
    ts.tv_nsec += (ms % 1000) * 1000000;
    ts.tv_sec += ms / 1000;
    
    if (ts.tv_nsec >= 1000000000) {
        ts.tv_sec++;
        ts.tv_nsec -= 1000000000;
    }
    
    return ts;
}

int timespec_compare(struct timespec ts1, struct timespec ts2) {
    if (ts1.tv_sec < ts2.tv_sec) return -1;
    if (ts1.tv_sec > ts2.tv_sec) return 1;
    if (ts1.tv_nsec < ts2.tv_nsec) return -1;
    if (ts1.tv_nsec > ts2.tv_nsec) return 1;
    return 0;
}

// Real-time clock functions
uint32_t realtime_clock_get_current_time_ms(const IClock* self) {
    (void)self; // Unused parameter
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return timespec_to_ms(ts);
}

struct timespec realtime_clock_get_current_time_point(const IClock* self) {
    (void)self; // Unused parameter
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts;
}

void realtime_clock_sleep_for_ms(const IClock* self, uint32_t duration_ms) {
    (void)self; // Unused parameter
    struct timespec ts = ms_to_timespec(duration_ms);
    nanosleep(&ts, NULL);
}

void realtime_clock_sleep_until(const IClock* self, struct timespec target_time) {
    (void)self; // Unused parameter
    struct timespec current_time;
    clock_gettime(CLOCK_MONOTONIC, &current_time);
    
    if (timespec_compare(target_time, current_time) > 0) {
        struct timespec sleep_time;
        sleep_time.tv_sec = target_time.tv_sec - current_time.tv_sec;
        sleep_time.tv_nsec = target_time.tv_nsec - current_time.tv_nsec;
        
        if (sleep_time.tv_nsec < 0) {
            sleep_time.tv_sec--;
            sleep_time.tv_nsec += 1000000000;
        }
        
        nanosleep(&sleep_time, NULL);
    }
}

bool realtime_clock_is_tick_based(const IClock* self) {
    (void)self; // Unused parameter
    return false;
}

uint64_t realtime_clock_get_tick_count(const IClock* self) {
    (void)self; // Unused parameter
    return 0;
}

uint32_t realtime_clock_get_tick_interval_ms(const IClock* self) {
    (void)self; // Unused parameter
    return 0;
}

void realtime_clock_start(IClock* self) {
    if (self) {
        self->running = true;
    }
}

void realtime_clock_stop(IClock* self) {
    if (self) {
        self->running = false;
    }
}

bool realtime_clock_is_running(const IClock* self) {
    return self ? self->running : false;
}

void realtime_clock_destroy_impl(IClock* self) {
    if (self) {
        free(self);
    }
}

RealtimeClock* realtime_clock_create(void) {
    RealtimeClock* clock = (RealtimeClock*)malloc(sizeof(RealtimeClock));
    if (!clock) return NULL;
    
    // Initialize function pointers
    clock->base.get_current_time_ms = realtime_clock_get_current_time_ms;
    clock->base.get_current_time_point = realtime_clock_get_current_time_point;
    clock->base.sleep_for_ms = realtime_clock_sleep_for_ms;
    clock->base.sleep_until = realtime_clock_sleep_until;
    clock->base.is_tick_based = realtime_clock_is_tick_based;
    clock->base.get_tick_count = realtime_clock_get_tick_count;
    clock->base.get_tick_interval_ms = realtime_clock_get_tick_interval_ms;
    clock->base.start = realtime_clock_start;
    clock->base.stop = realtime_clock_stop;
    clock->base.is_running = realtime_clock_is_running;
    clock->base.destroy = realtime_clock_destroy_impl;
    clock->base.running = false;
    
    return clock;
}

void realtime_clock_destroy(RealtimeClock* clock) {
    if (clock) {
        free(clock);
    }
}

// Tick-based clock functions
uint32_t tick_based_clock_get_current_time_ms(const IClock* self) {
    if (!self) return 0;
    
    const TickBasedClock* tick_clock = (const TickBasedClock*)self;
    return (uint32_t)(tick_clock->tick_count * tick_clock->tick_interval_ms);
}

struct timespec tick_based_clock_get_current_time_point(const IClock* self) {
    if (!self) {
        struct timespec ts = {0, 0};
        return ts;
    }
    
    const TickBasedClock* tick_clock = (const TickBasedClock*)self;
    uint32_t current_ms = (uint32_t)(tick_clock->tick_count * tick_clock->tick_interval_ms);
    
    struct timespec current_time = timespec_add_ms(tick_clock->start_time, current_ms);
    return current_time;
}

void tick_based_clock_sleep_for_ms(const IClock* self, uint32_t duration_ms) {
    if (!self) return;
    
    const TickBasedClock* tick_clock = (const TickBasedClock*)self;
    uint32_t ticks_to_wait = (duration_ms + tick_clock->tick_interval_ms - 1) / tick_clock->tick_interval_ms;
    uint64_t target_tick = tick_clock->tick_count + ticks_to_wait;
    
    while (tick_clock->tick_count < target_tick && tick_clock->base.running) {
        struct timespec sleep_time = ms_to_timespec(1);
        nanosleep(&sleep_time, NULL);
    }
}

void tick_based_clock_sleep_until(const IClock* self, struct timespec target_time) {
    if (!self) return;
    
    const TickBasedClock* tick_clock = (const TickBasedClock*)self;
    struct timespec current_time = tick_based_clock_get_current_time_point(self);
    
    while (timespec_compare(current_time, target_time) < 0 && tick_clock->base.running) {
        struct timespec sleep_time = ms_to_timespec(1);
        nanosleep(&sleep_time, NULL);
        current_time = tick_based_clock_get_current_time_point(self);
    }
}

bool tick_based_clock_is_tick_based(const IClock* self) {
    (void)self; // Unused parameter
    return true;
}

uint64_t tick_based_clock_get_tick_count(const IClock* self) {
    if (!self) return 0;
    
    const TickBasedClock* tick_clock = (const TickBasedClock*)self;
    return tick_clock->tick_count;
}

uint32_t tick_based_clock_get_tick_interval_ms(const IClock* self) {
    if (!self) return 0;
    
    const TickBasedClock* tick_clock = (const TickBasedClock*)self;
    return tick_clock->tick_interval_ms;
}

void tick_based_clock_start(IClock* self) {
    if (!self) return;
    
    TickBasedClock* tick_clock = (TickBasedClock*)self;
    if (tick_clock->base.running) return;
    
    tick_clock->base.running = true;
    tick_clock->should_stop = false;
    clock_gettime(CLOCK_MONOTONIC, &tick_clock->start_time);
    
    if (platform_thread_create(&tick_clock->tick_thread, tick_based_clock_thread_function, tick_clock) != 0) {
        tick_clock->base.running = false;
    }
}

void tick_based_clock_stop(IClock* self) {
    if (!self) return;
    
    TickBasedClock* tick_clock = (TickBasedClock*)self;
    if (!tick_clock->base.running) return;
    
    tick_clock->should_stop = true;
    tick_clock->base.running = false;
    
    platform_thread_join(tick_clock->tick_thread, NULL);
}

bool tick_based_clock_is_running(const IClock* self) {
    return self ? self->running : false;
}

void tick_based_clock_destroy_impl(IClock* self) {
    if (!self) return;
    
    TickBasedClock* tick_clock = (TickBasedClock*)self;
    tick_based_clock_stop(self);
    platform_mutex_destroy(&tick_clock->mutex);
    free(tick_clock);
}

void* tick_based_clock_thread_function(void* arg) {
    TickBasedClock* tick_clock = (TickBasedClock*)arg;
    if (!tick_clock) return NULL;
    
    struct timespec sleep_time = ms_to_timespec(tick_clock->tick_interval_ms);
    
    while (!tick_clock->should_stop) {
        nanosleep(&sleep_time, NULL);
        
        if (!tick_clock->should_stop) {
            platform_mutex_lock(&tick_clock->mutex);
            tick_clock->tick_count++;
            platform_mutex_unlock(&tick_clock->mutex);
        }
    }
    
    return NULL;
}

TickBasedClock* tick_based_clock_create(uint32_t tick_interval_ms) {
    TickBasedClock* clock = (TickBasedClock*)malloc(sizeof(TickBasedClock));
    if (!clock) return NULL;
    
    // Initialize function pointers
    clock->base.get_current_time_ms = tick_based_clock_get_current_time_ms;
    clock->base.get_current_time_point = tick_based_clock_get_current_time_point;
    clock->base.sleep_for_ms = tick_based_clock_sleep_for_ms;
    clock->base.sleep_until = tick_based_clock_sleep_until;
    clock->base.is_tick_based = tick_based_clock_is_tick_based;
    clock->base.get_tick_count = tick_based_clock_get_tick_count;
    clock->base.get_tick_interval_ms = tick_based_clock_get_tick_interval_ms;
    clock->base.start = tick_based_clock_start;
    clock->base.stop = tick_based_clock_stop;
    clock->base.is_running = tick_based_clock_is_running;
    clock->base.destroy = tick_based_clock_destroy_impl;
    clock->base.running = false;
    
    // Initialize tick-specific data
    clock->tick_count = 0;
    clock->tick_interval_ms = tick_interval_ms;
    clock->should_stop = false;
    clock_gettime(CLOCK_MONOTONIC, &clock->start_time);
    
    if (platform_mutex_init(&clock->mutex) != 0) {
        free(clock);
        return NULL;
    }
    
    return clock;
}

void tick_based_clock_destroy(TickBasedClock* clock) {
    if (clock) {
        tick_based_clock_stop((IClock*)clock);
        platform_mutex_destroy(&clock->mutex);
        free(clock);
    }
}

// Clock factory functions
IClock* clock_create_realtime(void) {
    RealtimeClock* realtime_clock = realtime_clock_create();
    return realtime_clock ? (IClock*)realtime_clock : NULL;
}

IClock* clock_create_tick_based(uint32_t tick_interval_ms) {
    TickBasedClock* tick_clock = tick_based_clock_create(tick_interval_ms);
    return tick_clock ? (IClock*)tick_clock : NULL;
}
