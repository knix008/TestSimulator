#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <time.h>
#include "clock.h"
#include "atomic_lock.h"

#ifdef __cplusplus
extern "C" {
#endif

// Timer types
typedef enum {
    TIMER_ONE_SHOT,    // Execute once and stop
    TIMER_PERIODIC     // Execute repeatedly
} TimerType;

// Timer state
typedef enum {
    TIMER_STOPPED,
    TIMER_RUNNING,
    TIMER_EXPIRED,
    TIMER_DELETED
} TimerState;

// Timer callback function type
typedef void (*TimerCallback)(uint32_t timer_id, void* user_data);

// Timer structure for RTOS
typedef struct Timer {
    uint32_t id;
    char name[64];  // Fixed-size buffer instead of char*
    TimerType type;
    TimerState state;
    uint32_t interval_ms;
    uint32_t remaining_time_ms;
    TimerCallback callback;
    void* user_data;
    struct timespec start_time;
    struct timespec next_expiry;
    
    // Thread safety using atomic locks
    atomic_lock_t lock;    // Atomic lock for thread safety
    bool should_stop;
    
    // Clock reference
    IClock* clock;
} Timer;

// Timer node for linked list
typedef struct TimerNode {
    uint32_t id;
    Timer* timer;
    struct TimerNode* next;
} TimerNode;

#define MAX_TIMERS 32

// Timer Manager structure
typedef struct TimerManager {
    // Timer storage (fixed-size array instead of linked list)
    Timer timers[MAX_TIMERS];
    bool timer_used[MAX_TIMERS];
    
    // Timer ID counter
    uint32_t next_timer_id;
    
    // Clock
    IClock* clock;
    bool owns_clock;
    
    // Timer thread (simplified without platform dependencies)
    uint32_t timer_thread_id;    // Simple thread ID
    bool running;
    bool should_stop;
    
    // Thread synchronization using atomic locks
    atomic_lock_t manager_lock;    // Atomic lock for manager operations
    
    size_t timer_count;
} TimerManager;

// Timer functions
void timer_init(Timer* timer, uint32_t timer_id, const char* name, TimerType type, 
               uint32_t interval_ms, TimerCallback callback, void* user_data, IClock* clock);
void timer_destroy(Timer* timer);
void timer_set_clock(Timer* timer, IClock* clock);

// Getters
uint32_t timer_get_id(const Timer* timer);
const char* timer_get_name(const Timer* timer);
TimerType timer_get_type(const Timer* timer);
TimerState timer_get_state(const Timer* timer);
uint32_t timer_get_interval(const Timer* timer);
uint32_t timer_get_remaining_time(const Timer* timer);
void* timer_get_user_data(const Timer* timer);

// Setters
void timer_set_callback(Timer* timer, TimerCallback callback);
void timer_set_user_data(Timer* timer, void* data);

// Timer control
bool timer_start(Timer* timer);
bool timer_stop(Timer* timer);
bool timer_restart(Timer* timer);
bool timer_reset(Timer* timer);

// Timer execution
void timer_execute_callback(Timer* timer);

// Utility methods
bool timer_is_running(const Timer* timer);
bool timer_is_expired(const Timer* timer);
bool timer_is_stopped(const Timer* timer);

// String representation
char* timer_to_string(const Timer* timer);
const char* timer_state_to_string(TimerState state);
const char* timer_type_to_string(TimerType type);

// Timer Manager functions
void timer_manager_init(TimerManager* manager);
void timer_manager_destroy(TimerManager* manager);

// Additional functions for testing
void timer_execute(Timer* timer);

// Timer management
uint32_t timer_manager_create_timer(TimerManager* manager, const char* name, TimerType type, 
                                   uint32_t interval_ms, TimerCallback callback, void* user_data);
bool timer_manager_delete_timer(TimerManager* manager, uint32_t timer_id);
bool timer_manager_start_timer(TimerManager* manager, uint32_t timer_id);
bool timer_manager_stop_timer(TimerManager* manager, uint32_t timer_id);
bool timer_manager_restart_timer(TimerManager* manager, uint32_t timer_id);
bool timer_manager_reset_timer(TimerManager* manager, uint32_t timer_id);

// Timer query
Timer* timer_manager_get_timer(const TimerManager* manager, uint32_t timer_id);
Timer** timer_manager_get_all_timers(const TimerManager* manager, size_t* count);
Timer** timer_manager_get_running_timers(const TimerManager* manager, size_t* count);
size_t timer_manager_get_timer_count(const TimerManager* manager);
size_t timer_manager_get_running_timer_count(const TimerManager* manager);

// Manager control
bool timer_manager_start(TimerManager* manager);
bool timer_manager_stop(TimerManager* manager);
bool timer_manager_is_running(const TimerManager* manager);

// Clock management
void timer_manager_set_clock(TimerManager* manager, IClock* clock);
IClock* timer_manager_get_clock(const TimerManager* manager);
bool timer_manager_is_tick_based(const TimerManager* manager);
uint64_t timer_manager_get_tick_count(const TimerManager* manager);
uint32_t timer_manager_get_tick_interval(const TimerManager* manager);

// Debugging functions
void timer_manager_print_status(const TimerManager* manager);
void timer_manager_print_running_timers(const TimerManager* manager);

// Internal helper functions
Timer* timer_manager_find_timer(TimerManager* manager, uint32_t timer_id);
void* timer_manager_thread_function(void* arg);
Timer* timer_manager_find_next_expiring_timer(TimerManager* manager);
uint32_t timer_manager_wait_for_next_timer(TimerManager* manager);
void timer_manager_execute_expired_timers(TimerManager* manager);

#ifdef __cplusplus
}
#endif