#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <time.h>

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
    uint32_t tick_thread_id;    // Simple thread ID
    bool should_stop;
    struct timespec start_time;
    bool locked;    // Simple lock for atomic operations
} TickBasedClock;

// Clock factory functions
IClock* clock_create_realtime(RealtimeClock* clock_buffer);
IClock* clock_create_tick_based(TickBasedClock* clock_buffer, uint32_t tick_interval_ms);

// Global clock tick simulation functions
void clock_tick_simulation_start(uint32_t rate_hz);
void clock_tick_simulation_stop(void);
bool clock_tick_simulation_is_running(void);
uint64_t clock_tick_simulation_get_count(void);
uint32_t clock_tick_simulation_get_rate_hz(void);
void clock_tick_simulation_set_rate_hz(uint32_t rate_hz);

// Clock utility functions
int clock_gettime(int clk_id, struct timespec* ts);
int nanosleep(const struct timespec* req, struct timespec* rem);

// Internal clock access functions
uint64_t clock_get_tick_counter(void);
uint32_t clock_get_tick_rate(void);

// Real-time clock functions
void realtime_clock_init(RealtimeClock* clock);
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
void tick_based_clock_init(TickBasedClock* clock, uint32_t tick_interval_ms);
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

// Test functions for bare-metal simulation
void clock_advance_ticks(uint64_t ticks);
void clock_set_tick_rate(uint32_t hz);
uint64_t clock_get_tick_counter(void);
uint32_t clock_get_tick_rate(void);

// Enhanced tick simulation functions
void clock_start_tick_simulation(void);
void clock_stop_tick_simulation(void);
bool clock_is_tick_simulation_active(void);
void clock_simulate_tick_interrupt(void);

#ifdef __cplusplus
}
#endif