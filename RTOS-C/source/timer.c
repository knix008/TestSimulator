#include "timer.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "platform.h"

// Timer functions
Timer* rtos_timer_create(uint32_t timer_id, const char* name, TimerType type, 
                        uint32_t interval_ms, TimerCallback callback, void* user_data) {
    Timer* timer = (Timer*)malloc(sizeof(Timer));
    if (!timer) return NULL;
    
    timer->id = timer_id;
    timer->name = name ? strdup(name) : NULL;
    timer->type = type;
    timer->state = TIMER_STOPPED;
    timer->interval_ms = interval_ms;
    timer->remaining_time_ms = interval_ms;
    timer->callback = callback;
    timer->user_data = user_data;
    timer->should_stop = false;
    timer->clock = NULL;
    
    if (platform_mutex_init(&timer->mutex) != 0) {
        free(timer->name);
        free(timer);
        return NULL;
    }
    
    if (platform_cond_init(&timer->cv) != 0) {
        platform_mutex_destroy(&timer->mutex);
        free(timer->name);
        free(timer);
        return NULL;
    }
    
    return timer;
}

void timer_destroy(Timer* timer) {
    if (!timer) return;
    
    timer_stop(timer);
    platform_mutex_destroy(&timer->mutex);
    platform_cond_destroy(&timer->cv);
    free(timer->name);
    free(timer);
}

void timer_set_clock(Timer* timer, IClock* clock) {
    if (timer) {
        timer->clock = clock;
    }
}

// Getters
uint32_t timer_get_id(const Timer* timer) {
    return timer ? timer->id : 0;
}

const char* timer_get_name(const Timer* timer) {
    return timer ? timer->name : NULL;
}

TimerType timer_get_type(const Timer* timer) {
    return timer ? timer->type : TIMER_ONE_SHOT;
}

TimerState timer_get_state(const Timer* timer) {
    if (!timer) return TIMER_STOPPED;
    
    platform_mutex_lock((mutex_t*)&timer->mutex);
    TimerState state = timer->state;
    platform_mutex_unlock((mutex_t*)&timer->mutex);
    
    return state;
}

uint32_t timer_get_interval(const Timer* timer) {
    return timer ? timer->interval_ms : 0;
}

uint32_t timer_get_remaining_time(const Timer* timer) {
    if (!timer) return 0;
    
    platform_mutex_lock((mutex_t*)&timer->mutex);
    uint32_t remaining = timer->remaining_time_ms;
    platform_mutex_unlock((mutex_t*)&timer->mutex);
    
    return remaining;
}

void* timer_get_user_data(const Timer* timer) {
    return timer ? timer->user_data : NULL;
}

// Setters
void timer_set_callback(Timer* timer, TimerCallback callback) {
    if (timer) {
        timer->callback = callback;
    }
}

void timer_set_user_data(Timer* timer, void* data) {
    if (timer) {
        timer->user_data = data;
    }
}

// Timer control
bool timer_start(Timer* timer) {
    if (!timer) return false;
    
    platform_mutex_lock(&timer->mutex);
    
    if (timer->state == TIMER_RUNNING) {
        platform_mutex_unlock(&timer->mutex);
        return true;
    }
    
    timer->state = TIMER_RUNNING;
    timer->remaining_time_ms = timer->interval_ms;
    timer->should_stop = false;
    
    if (timer->clock) {
        timer->start_time = timer->clock->get_current_time_point(timer->clock);
        timer->next_expiry = timespec_add_ms(timer->start_time, timer->interval_ms);
    } else {
        clock_gettime(CLOCK_MONOTONIC, &timer->start_time);
        timer->next_expiry = timespec_add_ms(timer->start_time, timer->interval_ms);
    }
    
    platform_mutex_unlock(&timer->mutex);
    return true;
}

bool timer_stop(Timer* timer) {
    if (!timer) return false;
    
    platform_mutex_lock(&timer->mutex);
    timer->state = TIMER_STOPPED;
    timer->should_stop = true;
    platform_cond_signal(&timer->cv);
    platform_mutex_unlock(&timer->mutex);
    
    return true;
}

bool timer_restart(Timer* timer) {
    if (!timer) return false;
    
    timer_stop(timer);
    return timer_start(timer);
}

bool timer_reset(Timer* timer) {
    if (!timer) return false;
    
    platform_mutex_lock(&timer->mutex);
    timer->remaining_time_ms = timer->interval_ms;
    
    if (timer->state == TIMER_RUNNING) {
        if (timer->clock) {
            timer->start_time = timer->clock->get_current_time_point(timer->clock);
        } else {
            clock_gettime(CLOCK_MONOTONIC, &timer->start_time);
        }
        timer->next_expiry = timespec_add_ms(timer->start_time, timer->interval_ms);
    }
    
    platform_mutex_unlock(&timer->mutex);
    return true;
}

// Timer execution
void timer_execute_callback(Timer* timer) {
    if (!timer || !timer->callback) return;
    
    timer->callback(timer->id, timer->user_data);
}

// Utility methods
bool timer_is_running(const Timer* timer) {
    return timer && timer_get_state(timer) == TIMER_RUNNING;
}

bool timer_is_expired(const Timer* timer) {
    return timer && timer_get_state(timer) == TIMER_EXPIRED;
}

bool timer_is_stopped(const Timer* timer) {
    return timer && timer_get_state(timer) == TIMER_STOPPED;
}

// String representation
char* timer_to_string(const Timer* timer) {
    if (!timer) {
        char* result = (char*)malloc(32);
        if (result) {
            strcpy(result, "Timer{null}");
        }
        return result;
    }
    
    char* result = (char*)malloc(256);
    if (result) {
        snprintf(result, 256, "Timer{id=%u, name=%s, type=%s, state=%s, interval=%ums}",
                timer->id, 
                timer->name ? timer->name : "unnamed",
                timer_type_to_string(timer->type),
                timer_state_to_string(timer_get_state(timer)),
                timer->interval_ms);
    }
    return result;
}

const char* timer_state_to_string(TimerState state) {
    switch (state) {
        case TIMER_STOPPED: return "STOPPED";
        case TIMER_RUNNING: return "RUNNING";
        case TIMER_EXPIRED: return "EXPIRED";
        case TIMER_DELETED: return "DELETED";
        default: return "UNKNOWN";
    }
}

const char* timer_type_to_string(TimerType type) {
    switch (type) {
        case TIMER_ONE_SHOT: return "ONE_SHOT";
        case TIMER_PERIODIC: return "PERIODIC";
        default: return "UNKNOWN";
    }
}

// Timer Manager functions
TimerManager* timer_manager_create(void) {
    TimerManager* manager = (TimerManager*)malloc(sizeof(TimerManager));
    if (!manager) return NULL;
    
    manager->timers_head = NULL;
    manager->next_timer_id = 1;
    manager->clock = clock_create_realtime();
    manager->owns_clock = true;
    manager->running = false;
    manager->should_stop = false;
    manager->timer_count = 0;
    
    if (platform_mutex_init(&manager->timers_mutex) != 0) {
        if (manager->clock) manager->clock->destroy(manager->clock);
        free(manager);
        return NULL;
    }
    
    if (platform_cond_init(&manager->cv) != 0) {
        platform_mutex_destroy(&manager->timers_mutex);
        if (manager->clock) manager->clock->destroy(manager->clock);
        free(manager);
        return NULL;
    }
    
    return manager;
}

void timer_manager_destroy(TimerManager* manager) {
    if (!manager) return;
    
    timer_manager_stop(manager);
    
    platform_mutex_lock(&manager->timers_mutex);
    
    TimerNode* current = manager->timers_head;
    while (current) {
        TimerNode* next = current->next;
        timer_destroy(current->timer);
        free(current);
        current = next;
    }
    
    platform_mutex_unlock(&manager->timers_mutex);
    
    if (manager->owns_clock && manager->clock) {
        manager->clock->destroy(manager->clock);
    }
    
    platform_mutex_destroy(&manager->timers_mutex);
    platform_cond_destroy(&manager->cv);
    free(manager);
}

Timer* timer_manager_find_timer(TimerManager* manager, uint32_t timer_id) {
    if (!manager) return NULL;
    
    TimerNode* current = manager->timers_head;
    while (current) {
        if (current->timer->id == timer_id) {
            return current->timer;
        }
        current = current->next;
    }
    
    return NULL;
}

uint32_t timer_manager_create_timer(TimerManager* manager, const char* name, TimerType type, 
                                   uint32_t interval_ms, TimerCallback callback, void* user_data) {
    if (!manager) return 0;
    
    platform_mutex_lock(&manager->timers_mutex);
    
    uint32_t timer_id = manager->next_timer_id++;
    Timer* timer = rtos_timer_create(timer_id, name, type, interval_ms, callback, user_data);
    if (!timer) {
        platform_mutex_unlock(&manager->timers_mutex);
        return 0;
    }
    
    timer_set_clock(timer, manager->clock);
    
    TimerNode* node = (TimerNode*)malloc(sizeof(TimerNode));
    if (!node) {
        timer_destroy(timer);
        platform_mutex_unlock(&manager->timers_mutex);
        return 0;
    }
    
    node->timer = timer;
    node->next = manager->timers_head;
    manager->timers_head = node;
    manager->timer_count++;
    
    platform_mutex_unlock(&manager->timers_mutex);
    return timer_id;
}

bool timer_manager_delete_timer(TimerManager* manager, uint32_t timer_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->timers_mutex);
    
    TimerNode* current = manager->timers_head;
    TimerNode* prev = NULL;
    
    while (current) {
        if (current->timer->id == timer_id) {
            if (prev) {
                prev->next = current->next;
            } else {
                manager->timers_head = current->next;
            }
            
            timer_destroy(current->timer);
            free(current);
            manager->timer_count--;
            
            platform_mutex_unlock(&manager->timers_mutex);
            return true;
        }
        
        prev = current;
        current = current->next;
    }
    
    platform_mutex_unlock(&manager->timers_mutex);
    return false;
}

bool timer_manager_start_timer(TimerManager* manager, uint32_t timer_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->timers_mutex);
    Timer* timer = timer_manager_find_timer(manager, timer_id);
    platform_mutex_unlock(&manager->timers_mutex);
    
    if (!timer) return false;
    
    return timer_start(timer);
}

bool timer_manager_stop_timer(TimerManager* manager, uint32_t timer_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->timers_mutex);
    Timer* timer = timer_manager_find_timer(manager, timer_id);
    platform_mutex_unlock(&manager->timers_mutex);
    
    if (!timer) return false;
    
    return timer_stop(timer);
}

bool timer_manager_restart_timer(TimerManager* manager, uint32_t timer_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->timers_mutex);
    Timer* timer = timer_manager_find_timer(manager, timer_id);
    platform_mutex_unlock(&manager->timers_mutex);
    
    if (!timer) return false;
    
    return timer_restart(timer);
}

bool timer_manager_reset_timer(TimerManager* manager, uint32_t timer_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->timers_mutex);
    Timer* timer = timer_manager_find_timer(manager, timer_id);
    platform_mutex_unlock(&manager->timers_mutex);
    
    if (!timer) return false;
    
    return timer_reset(timer);
}

Timer* timer_manager_get_timer(const TimerManager* manager, uint32_t timer_id) {
    if (!manager) return NULL;
    
    platform_mutex_lock((mutex_t*)&manager->timers_mutex);
    Timer* timer = timer_manager_find_timer((TimerManager*)manager, timer_id);
    platform_mutex_unlock((mutex_t*)&manager->timers_mutex);
    
    return timer;
}

size_t timer_manager_get_timer_count(const TimerManager* manager) {
    if (!manager) return 0;
    
    platform_mutex_lock((mutex_t*)&manager->timers_mutex);
    size_t count = manager->timer_count;
    platform_mutex_unlock((mutex_t*)&manager->timers_mutex);
    
    return count;
}

bool timer_manager_start(TimerManager* manager) {
    if (!manager || manager->running) return false;
    
    manager->running = true;
    manager->should_stop = false;
    
    if (manager->clock && !manager->clock->is_running(manager->clock)) {
        manager->clock->start(manager->clock);
    }
    
    if (platform_thread_create(&manager->timer_thread, timer_manager_thread_function, manager) != 0) {
        manager->running = false;
        return false;
    }
    
    return true;
}

bool timer_manager_stop(TimerManager* manager) {
    if (!manager || !manager->running) return false;
    
    manager->should_stop = true;
    manager->running = false;
    
    platform_cond_signal(&manager->cv);
    platform_thread_join(manager->timer_thread, NULL);
    
    if (manager->clock && manager->clock->is_running(manager->clock)) {
        manager->clock->stop(manager->clock);
    }
    
    return true;
}

bool timer_manager_is_running(const TimerManager* manager) {
    return manager ? manager->running : false;
}

void timer_manager_set_clock(TimerManager* manager, IClock* clock) {
    if (!manager) return;
    
    platform_mutex_lock(&manager->timers_mutex);
    
    if (manager->owns_clock && manager->clock) {
        manager->clock->destroy(manager->clock);
    }
    
    manager->clock = clock;
    manager->owns_clock = false;
    
    // Update all timers to use the new clock
    TimerNode* current = manager->timers_head;
    while (current) {
        timer_set_clock(current->timer, clock);
        current = current->next;
    }
    
    platform_mutex_unlock(&manager->timers_mutex);
}

IClock* timer_manager_get_clock(const TimerManager* manager) {
    return manager ? manager->clock : NULL;
}

bool timer_manager_is_tick_based(const TimerManager* manager) {
    return manager && manager->clock ? manager->clock->is_tick_based(manager->clock) : false;
}

uint64_t timer_manager_get_tick_count(const TimerManager* manager) {
    return manager && manager->clock ? manager->clock->get_tick_count(manager->clock) : 0;
}

uint32_t timer_manager_get_tick_interval(const TimerManager* manager) {
    return manager && manager->clock ? manager->clock->get_tick_interval_ms(manager->clock) : 0;
}

void timer_manager_print_status(const TimerManager* manager) {
    if (!manager) {
        printf("TimerManager is NULL\n");
        return;
    }
    
    platform_mutex_lock((mutex_t*)&manager->timers_mutex);
    
    printf("Timer Manager Status:\n");
    printf("Running: %s\n", manager->running ? "Yes" : "No");
    printf("Total timers: %zu\n", manager->timer_count);
    printf("Clock type: %s\n", manager->clock && manager->clock->is_tick_based(manager->clock) ? "Tick-based" : "Realtime");
    
    TimerNode* current = manager->timers_head;
    while (current) {
        printf("  Timer ID %u: %s (%s)\n", 
               current->timer->id,
               current->timer->name ? current->timer->name : "unnamed",
               timer_state_to_string(timer_get_state(current->timer)));
        current = current->next;
    }
    
    platform_mutex_unlock((mutex_t*)&manager->timers_mutex);
}

void* timer_manager_thread_function(void* arg) {
    TimerManager* manager = (TimerManager*)arg;
    if (!manager) return NULL;
    
    while (!manager->should_stop) {
        platform_mutex_lock(&manager->timers_mutex);
        
        // Check all timers for expiry
        TimerNode* current = manager->timers_head;
        while (current && !manager->should_stop) {
            Timer* timer = current->timer;
            
            if (timer_is_running(timer)) {
                struct timespec current_time;
                if (manager->clock) {
                    current_time = manager->clock->get_current_time_point(manager->clock);
                } else {
                    clock_gettime(CLOCK_MONOTONIC, &current_time);
                }
                
                if (timespec_compare(current_time, timer->next_expiry) >= 0) {
                    // Timer expired
                    timer_execute_callback(timer);
                    
                    if (timer->type == TIMER_PERIODIC) {
                        // Reset for next period
                        timer->next_expiry = timespec_add_ms(timer->next_expiry, timer->interval_ms);
                    } else {
                        // One-shot timer, stop it
                        timer->state = TIMER_EXPIRED;
                    }
                }
            }
            
            current = current->next;
        }
        
        platform_mutex_unlock(&manager->timers_mutex);
        
        // Sleep for a short time before checking again
        struct timespec sleep_time = ms_to_timespec(10);
        nanosleep(&sleep_time, NULL);
    }
    
    return NULL;
}
