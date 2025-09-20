#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "timer.h"
#include "scheduler.h"
#include "task.h"

#ifdef __cplusplus
extern "C" {
#endif

// Task-based Timer Manager structure
typedef struct TaskBasedTimerManager {
    TimerManager* timer_manager;
    PriorityScheduler* scheduler;
    Task* timer_task;
    uint8_t timer_task_priority;
    bool owns_scheduler;
} TaskBasedTimerManager;

// Task-based Timer Manager functions
TaskBasedTimerManager* task_based_timer_manager_create(PriorityScheduler* scheduler, uint8_t timer_task_priority);
void task_based_timer_manager_destroy(TaskBasedTimerManager* manager);

// Timer management (delegates to underlying TimerManager)
uint32_t task_based_timer_manager_create_timer(TaskBasedTimerManager* manager, const char* name, TimerType type, 
                                              uint32_t interval_ms, TimerCallback callback, void* user_data);
bool task_based_timer_manager_delete_timer(TaskBasedTimerManager* manager, uint32_t timer_id);
bool task_based_timer_manager_start_timer(TaskBasedTimerManager* manager, uint32_t timer_id);
bool task_based_timer_manager_stop_timer(TaskBasedTimerManager* manager, uint32_t timer_id);
bool task_based_timer_manager_restart_timer(TaskBasedTimerManager* manager, uint32_t timer_id);
bool task_based_timer_manager_reset_timer(TaskBasedTimerManager* manager, uint32_t timer_id);

// Timer query (delegates to underlying TimerManager)
Timer* task_based_timer_manager_get_timer(const TaskBasedTimerManager* manager, uint32_t timer_id);
Timer** task_based_timer_manager_get_all_timers(const TaskBasedTimerManager* manager, size_t* count);
Timer** task_based_timer_manager_get_running_timers(const TaskBasedTimerManager* manager, size_t* count);
size_t task_based_timer_manager_get_timer_count(const TaskBasedTimerManager* manager);
size_t task_based_timer_manager_get_running_timer_count(const TaskBasedTimerManager* manager);

// Manager control
bool task_based_timer_manager_start(TaskBasedTimerManager* manager);
bool task_based_timer_manager_stop(TaskBasedTimerManager* manager);
bool task_based_timer_manager_is_running(const TaskBasedTimerManager* manager);

// Clock management (delegates to underlying TimerManager)
void task_based_timer_manager_set_clock(TaskBasedTimerManager* manager, IClock* clock);
IClock* task_based_timer_manager_get_clock(const TaskBasedTimerManager* manager);
bool task_based_timer_manager_is_tick_based(const TaskBasedTimerManager* manager);
uint64_t task_based_timer_manager_get_tick_count(const TaskBasedTimerManager* manager);
uint32_t task_based_timer_manager_get_tick_interval(const TaskBasedTimerManager* manager);

// Task-specific functions
Task* task_based_timer_manager_get_timer_task(const TaskBasedTimerManager* manager);
PriorityScheduler* task_based_timer_manager_get_scheduler(const TaskBasedTimerManager* manager);
uint8_t task_based_timer_manager_get_timer_task_priority(const TaskBasedTimerManager* manager);

// Debugging functions (delegates to underlying TimerManager)
void task_based_timer_manager_print_status(const TaskBasedTimerManager* manager);
void task_based_timer_manager_print_running_timers(const TaskBasedTimerManager* manager);

// Internal timer task execution function
void timer_task_execute(Task* task);

#ifdef __cplusplus
}
#endif