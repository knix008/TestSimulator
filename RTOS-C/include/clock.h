#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <time.h>
#include "platform.h"

#ifdef __cplusplus
extern "C" {
#endif

// Clock interface structure with function pointers
typedef struct IClock {
    // Function pointers for clock operations
    uint32_t (*get_current_time_ms)(const struct IClock* self);
    struct timespec (*get_current_time_point)(const struct IClock* self);
    void (*sleep_for_ms)(const struct IClock* self, uint32_t duration_ms);
    void (*sleep_until)(const struct IClock* self, struct timespec target_time);
    bool (*is_tick_based)(const struct IClock* self);
    uint64_t (*get_tick_count)(const struct IClock* self);
    uint32_t (*get_tick_interval_ms)(const struct IClock* self);
    void (*start)(struct IClock* self);
    void (*stop)(struct IClock* self);
    bool (*is_running)(const struct IClock* self);
    void (*destroy)(struct IClock* self);
    
    // Common data
    bool running;
} IClock;

// Real-time clock using system clock
typedef struct RealtimeClock {
    IClock base;  // Must be first member
} RealtimeClock;

// Tick-based clock simulating RTOS tick system
typedef struct TickBasedClock {
    IClock base;  // Must be first member
    uint64_t tick_count;
    uint32_t tick_interval_ms;
    thread_t tick_thread;
    bool should_stop;
    struct timespec start_time;
    mutex_t mutex;
} TickBasedClock;

// Clock factory functions
IClock* clock_create_realtime(void);
IClock* clock_create_tick_based(uint32_t tick_interval_ms);

// Real-time clock functions
RealtimeClock* realtime_clock_create(void);
void realtime_clock_destroy(RealtimeClock* clock);
uint32_t realtime_clock_get_current_time_ms(const IClock* self);
struct timespec realtime_clock_get_current_time_point(const IClock* self);
void realtime_clock_sleep_for_ms(const IClock* self, uint32_t duration_ms);
void realtime_clock_sleep_until(const IClock* self, struct timespec target_time);
bool realtime_clock_is_tick_based(const IClock* self);
uint64_t realtime_clock_get_tick_count(const IClock* self);
uint32_t realtime_clock_get_tick_interval_ms(const IClock* self);
void realtime_clock_start(IClock* self);
void realtime_clock_stop(IClock* self);
bool realtime_clock_is_running(const IClock* self);
void realtime_clock_destroy_impl(IClock* self);

// Tick-based clock functions
TickBasedClock* tick_based_clock_create(uint32_t tick_interval_ms);
void tick_based_clock_destroy(TickBasedClock* clock);
uint32_t tick_based_clock_get_current_time_ms(const IClock* self);
struct timespec tick_based_clock_get_current_time_point(const IClock* self);
void tick_based_clock_sleep_for_ms(const IClock* self, uint32_t duration_ms);
void tick_based_clock_sleep_until(const IClock* self, struct timespec target_time);
bool tick_based_clock_is_tick_based(const IClock* self);
uint64_t tick_based_clock_get_tick_count(const IClock* self);
uint32_t tick_based_clock_get_tick_interval_ms(const IClock* self);
void tick_based_clock_start(IClock* self);
void tick_based_clock_stop(IClock* self);
bool tick_based_clock_is_running(const IClock* self);
void tick_based_clock_destroy_impl(IClock* self);
void* tick_based_clock_thread_function(void* arg);

// Utility functions
uint32_t timespec_to_ms(struct timespec ts);
struct timespec ms_to_timespec(uint32_t ms);
struct timespec timespec_add_ms(struct timespec ts, uint32_t ms);
int timespec_compare(struct timespec ts1, struct timespec ts2);

#ifdef __cplusplus
}
#endif