#include "clock.h"
#include "atomic_lock.h"
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#ifdef _WIN32
#include <windows.h>
#include <process.h>
#else
#include <pthread.h>
#include <unistd.h>
#endif

// Clock constants for bare-metal
#define CLOCK_REALTIME 0
#define CLOCK_MONOTONIC 1

// Improved bare-metal clock implementation with tick simulation
static uint64_t tick_counter = 1000000; // Start at 1 second to avoid 0 time
static uint32_t tick_rate_hz = 1000; // 1000 Hz = 1ms per tick
static uint64_t last_tick_time = 0; // For tick simulation
static bool tick_simulation_active = false;

// Thread-based clock tick simulation
static volatile bool tick_thread_running = false;
static volatile bool tick_thread_should_stop = false;
static uint32_t tick_thread_rate_hz = 1000; // Default 1000 Hz

#ifdef _WIN32
static HANDLE tick_thread_handle = NULL;
static DWORD tick_thread_id = 0;
#else
static pthread_t tick_thread = 0;
#endif

// Thread function for clock tick simulation
#ifdef _WIN32
static DWORD WINAPI clock_tick_thread_function(LPVOID lpParam) {
    (void)lpParam; // Unused parameter
    
    DWORD sleep_interval_ms = 1000 / tick_thread_rate_hz; // Convert Hz to ms
    if (sleep_interval_ms == 0) sleep_interval_ms = 1; // Minimum 1ms
    
    while (!tick_thread_should_stop) {
        // Increment tick counter (simulating hardware interrupt)
        tick_counter++;
        
        // Sleep for the tick interval, but check stop flag frequently
        DWORD sleep_time = 0;
        while (sleep_time < sleep_interval_ms && !tick_thread_should_stop) {
            Sleep(1); // Sleep 1ms at a time
            sleep_time++;
        }
    }
    
    return 0;
}
#else
static void* clock_tick_thread_function(void* arg) {
    (void)arg; // Unused parameter
    
    struct timespec sleep_time;
    sleep_time.tv_sec = 0;
    sleep_time.tv_nsec = (1000000000ULL / tick_thread_rate_hz); // Convert Hz to ns
    if (sleep_time.tv_nsec == 0) sleep_time.tv_nsec = 1000000; // Minimum 1ms
    
    while (!tick_thread_should_stop) {
        // Increment tick counter (simulating hardware interrupt)
        tick_counter++;
        
        // Sleep for the tick interval, but check stop flag frequently
        struct timespec short_sleep;
        short_sleep.tv_sec = 0;
        short_sleep.tv_nsec = 1000000; // 1ms
        
        long total_ns = sleep_time.tv_nsec;
        long slept_ns = 0;
        
        while (slept_ns < total_ns && !tick_thread_should_stop) {
            nanosleep(&short_sleep, NULL);
            slept_ns += short_sleep.tv_nsec;
        }
    }
    
    return NULL;
}
#endif

// Simple clock_gettime implementation for bare-metal
int clock_gettime(int clk_id, struct timespec* ts) {
    (void)clk_id; // Both CLOCK_REALTIME and CLOCK_MONOTONIC use same source
    
    if (!ts) return -1;
    
    // Convert tick counter to timespec
    uint64_t ticks = tick_counter;
    ts->tv_sec = (time_t)(ticks / tick_rate_hz);
    ts->tv_nsec = (long)((ticks % tick_rate_hz) * (1000000000ULL / tick_rate_hz));
    
    return 0;
}

// Simple nanosleep implementation for bare-metal
int nanosleep(const struct timespec* req, struct timespec* rem) {
    if (!req) return -1;
    
    // For testing purposes, use a simple delay instead of tick-based waiting
    // This avoids issues when tick simulation is stopped
    volatile int delay_count = (int)(req->tv_sec * 1000 + req->tv_nsec / 1000000);
    if (delay_count < 1) delay_count = 1; // Minimum 1ms equivalent
    
    for (int i = 0; i < delay_count * 1000; i++) {
        volatile int dummy = 0;
        dummy++;
    }
    
    if (rem) {
        rem->tv_sec = 0;
        rem->tv_nsec = 0;
    }
    
    return 0;
}

// Function to advance the tick counter (for testing purposes)
void clock_advance_ticks(uint64_t ticks) {
    tick_counter += ticks;
}

// Function to set the tick rate (for testing purposes)
void clock_set_tick_rate(uint32_t hz) {
    tick_rate_hz = hz;
}

// Function to get the current tick counter (for testing purposes)
uint64_t clock_get_tick_counter(void) {
    return tick_counter;
}

// Function to get the current tick rate (for testing purposes)
uint32_t clock_get_tick_rate(void) {
    return tick_rate_hz;
}

// Enhanced tick simulation functions
void clock_start_tick_simulation(void) {
    tick_simulation_active = true;
    last_tick_time = tick_counter;
}

void clock_stop_tick_simulation(void) {
    tick_simulation_active = false;
}

bool clock_is_tick_simulation_active(void) {
    return tick_simulation_active;
}

// Simulate tick interrupt - call this periodically to advance time
void clock_simulate_tick_interrupt(void) {
    if (!tick_simulation_active) return;
    
    // Advance by one tick (1ms)
    tick_counter++;
    
    // In a real RTOS, this would trigger scheduler and timer checks
    // For simulation, we can add callback support here
}

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

// Using atomic operations from atomic_lock.h

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
    
    // Advance the tick counter to simulate time passing
    clock_advance_ticks(duration_ms);
    
    // Simple delay loop - in real hardware this would use hardware timer
    for (uint32_t i = 0; i < duration_ms * 1000; i++) {
        volatile int dummy = 0;
        dummy++;
    }
}

void realtime_clock_sleep_until(const IClock* self, struct timespec target_time) {
    (void)self; // Unused parameter
    
    struct timespec current_time;
    clock_gettime(CLOCK_MONOTONIC, &current_time);
    
    if (target_time.tv_sec > current_time.tv_sec || 
        (target_time.tv_sec == current_time.tv_sec && target_time.tv_nsec > current_time.tv_nsec)) {
        
        struct timespec sleep_time;
        sleep_time.tv_sec = target_time.tv_sec - current_time.tv_sec;
        sleep_time.tv_nsec = target_time.tv_nsec - current_time.tv_nsec;
        
        if (sleep_time.tv_nsec < 0) {
            sleep_time.tv_sec--;
            sleep_time.tv_nsec += 1000000000;
        }
        
        // Convert to milliseconds and advance tick counter
        uint32_t sleep_ms = timespec_to_ms(sleep_time);
        clock_advance_ticks(sleep_ms);
        
        // Simple delay loop - in real hardware this would use hardware timer
        for (uint32_t i = 0; i < sleep_ms * 1000; i++) {
            volatile int dummy = 0;
            dummy++;
        }
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
    // No free() needed - caller manages memory
    (void)self;
}

void realtime_clock_init(RealtimeClock* clock) {
    if (!clock) return;
    
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
}

// Tick-based clock functions
uint32_t tick_based_clock_get_current_time_ms(const IClock* self) {
    if (!self) return 0;
    
    const TickBasedClock* tick_clock = (const TickBasedClock*)self;
    
    // Calculate time based on tick count
    uint64_t ticks = tick_based_clock_get_tick_count(self);
    return (uint32_t)(ticks * tick_clock->tick_interval_ms);
}

struct timespec tick_based_clock_get_current_time_point(const IClock* self) {
    if (!self) {
        struct timespec zero = {0, 0};
        return zero;
    }
    
    const TickBasedClock* tick_clock = (const TickBasedClock*)self;
    
    simple_lock((bool*)&tick_clock->locked);
    uint64_t ticks = tick_clock->tick_count;
    simple_unlock((bool*)&tick_clock->locked);
    
    struct timespec result;
    result.tv_sec = (time_t)(ticks * tick_clock->tick_interval_ms / 1000);
    result.tv_nsec = (long)((ticks * tick_clock->tick_interval_ms % 1000) * 1000000);
    
    return result;
}

void tick_based_clock_sleep_for_ms(const IClock* self, uint32_t duration_ms) {
    if (!self) return;
    
    const TickBasedClock* tick_clock = (const TickBasedClock*)self;
    
    // Simple sleep implementation
    uint32_t ticks_to_sleep = duration_ms / tick_clock->tick_interval_ms;
    for (uint32_t i = 0; i < ticks_to_sleep; i++) {
        volatile int dummy = 0;
        dummy++;
    }
}

void tick_based_clock_sleep_until(const IClock* self, struct timespec target_time) {
    if (!self) return;
    
    struct timespec current_time = tick_based_clock_get_current_time_point(self);
    
    if (target_time.tv_sec > current_time.tv_sec || 
        (target_time.tv_sec == current_time.tv_sec && target_time.tv_nsec > current_time.tv_nsec)) {
        
        struct timespec sleep_time;
        sleep_time.tv_sec = target_time.tv_sec - current_time.tv_sec;
        sleep_time.tv_nsec = target_time.tv_nsec - current_time.tv_nsec;
        
        if (sleep_time.tv_nsec < 0) {
            sleep_time.tv_sec--;
            sleep_time.tv_nsec += 1000000000;
        }
        
        uint32_t sleep_ms = timespec_to_ms(sleep_time);
        tick_based_clock_sleep_for_ms(self, sleep_ms);
    }
}

bool tick_based_clock_is_tick_based(const IClock* self) {
    (void)self; // Unused parameter
    return true;
}

uint64_t tick_based_clock_get_tick_count(const IClock* self) {
    if (!self) return 0;
    
    const TickBasedClock* tick_clock = (const TickBasedClock*)self;
    
    // If clock is not running, return the last tick count
    if (!tick_clock->base.running) {
        return tick_clock->tick_count;
    }
    
    // Calculate ticks based on global time and this clock's start time
    uint64_t global_ticks = clock_get_tick_counter();
    uint64_t start_ticks = timespec_to_ms(tick_clock->start_time);
    
    if (global_ticks > start_ticks) {
        uint64_t elapsed_ticks = (global_ticks - start_ticks) / tick_clock->tick_interval_ms;
        return elapsed_ticks;
    }
    
    return 0;
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
}

void tick_based_clock_stop(IClock* self) {
    if (!self) return;
    
    TickBasedClock* tick_clock = (TickBasedClock*)self;
    if (!tick_clock->base.running) return;
    
    // Save current tick count before stopping
    uint64_t current_ticks = tick_based_clock_get_tick_count(self);
    tick_clock->tick_count = current_ticks;
    
    tick_clock->should_stop = true;
    tick_clock->base.running = false;
}

bool tick_based_clock_is_running(const IClock* self) {
    return self ? self->running : false;
}

void tick_based_clock_destroy_impl(IClock* self) {
    if (!self) return;
    
    TickBasedClock* tick_clock = (TickBasedClock*)self;
    tick_based_clock_stop(self);
    simple_unlock(&tick_clock->locked);
    free(tick_clock);
}

void* tick_based_clock_thread_function(void* arg) {
    TickBasedClock* tick_clock = (TickBasedClock*)arg;
    if (!tick_clock) return NULL;
    
    struct timespec sleep_time = ms_to_timespec(tick_clock->tick_interval_ms);
    
    while (!tick_clock->should_stop) {
        nanosleep(&sleep_time, NULL);
        
        if (!tick_clock->should_stop) {
            simple_lock(&tick_clock->locked);
            tick_clock->tick_count++;
            simple_unlock(&tick_clock->locked);
        }
    }
    
    return NULL;
}

void tick_based_clock_init(TickBasedClock* clock, uint32_t tick_interval_ms) {
    if (!clock) return;
    
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
    clock->locked = false;
    clock_gettime(CLOCK_MONOTONIC, &clock->start_time);
}

void tick_based_clock_destroy(TickBasedClock* clock) {
    if (clock) {
        tick_based_clock_stop((IClock*)clock);
        simple_unlock(&clock->locked);
        // No free() needed - caller manages memory
    }
}

// Clock factory functions
IClock* clock_create_realtime(RealtimeClock* clock_buffer) {
    if (!clock_buffer) return NULL;
    realtime_clock_init(clock_buffer);
    return (IClock*)clock_buffer;
}

IClock* clock_create_tick_based(TickBasedClock* clock_buffer, uint32_t tick_interval_ms) {
    if (!clock_buffer) return NULL;
    tick_based_clock_init(clock_buffer, tick_interval_ms);
    return (IClock*)clock_buffer;
}

// Global clock tick simulation functions
void clock_tick_simulation_start(uint32_t rate_hz) {
    if (tick_thread_running) {
        printf("Clock tick simulation is already running\n");
        return;
    }
    
    tick_thread_rate_hz = rate_hz;
    tick_thread_should_stop = false;
    
#ifdef _WIN32
    tick_thread_handle = CreateThread(
        NULL,                           // Default security attributes
        0,                              // Default stack size
        clock_tick_thread_function,     // Thread function
        NULL,                           // No thread function arguments
        0,                              // Default creation flags
        &tick_thread_id                 // Thread ID
    );
    
    if (tick_thread_handle == NULL) {
        printf("Failed to create clock tick thread\n");
        return;
    }
#else
    if (pthread_create(&tick_thread, NULL, clock_tick_thread_function, NULL) != 0) {
        printf("Failed to create clock tick thread\n");
        return;
    }
#endif
    
    tick_thread_running = true;
    printf("Clock tick simulation started at %u Hz\n", tick_rate_hz);
}

void clock_tick_simulation_stop(void) {
    if (!tick_thread_running) {
        printf("Clock tick simulation is not running\n");
        return;
    }
    
    tick_thread_should_stop = true;
    
#ifdef _WIN32
    if (tick_thread_handle != NULL) {
        WaitForSingleObject(tick_thread_handle, INFINITE);
        CloseHandle(tick_thread_handle);
        tick_thread_handle = NULL;
    }
#else
    if (tick_thread != 0) {
        pthread_join(tick_thread, NULL);
        tick_thread = 0;
    }
#endif
    
    tick_thread_running = false;
    printf("Clock tick simulation stopped\n");
}

bool clock_tick_simulation_is_running(void) {
    return tick_thread_running;
}

uint64_t clock_tick_simulation_get_count(void) {
    return tick_counter;
}

uint32_t clock_tick_simulation_get_rate_hz(void) {
    return tick_thread_rate_hz;
}

void clock_tick_simulation_set_rate_hz(uint32_t rate_hz) {
    if (tick_thread_running) {
        printf("Cannot change rate while simulation is running\n");
        return;
    }
    
    tick_thread_rate_hz = rate_hz;
    printf("Clock tick rate set to %u Hz\n", rate_hz);
}
