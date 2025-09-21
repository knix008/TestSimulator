#include "timer_task.h"
#include <stdio.h>
#include <stdlib.h>

// Internal timer task execution function
void timer_task_execute(Task* task) {
    if (!task || !task->data) return;
    
    TaskBasedTimerManager* manager = (TaskBasedTimerManager*)task->data;
    (void)manager; // Suppress unused variable warning
    
    // This is a placeholder for timer task execution
    // In a real implementation, this would process timer events
    printf("Executing timer task (ID: %u)\n", task->id);
}

// Task-based Timer Manager functions
void task_based_timer_manager_init(TaskBasedTimerManager* manager, PriorityScheduler* scheduler, uint8_t timer_task_priority) {
    if (!manager) return;
    
    // Initialize timer manager
    timer_manager_init(&manager->timer_manager);
    manager->timer_manager_ptr = &manager->timer_manager;
    
    // Set up scheduler
    if (scheduler) {
        manager->scheduler = scheduler;
        manager->owns_scheduler = false;
    } else {
        // Initialize a local scheduler if none provided
        priority_scheduler_init(&manager->local_scheduler);
        manager->scheduler = &manager->local_scheduler;
        manager->owns_scheduler = true;
    }
    
    manager->timer_task_priority = timer_task_priority;
    
    // Initialize timer task
    task_init(&manager->timer_task, 0, timer_task_priority, NULL, manager);
    
    // Create timer task in scheduler
    uint32_t task_id = priority_scheduler_create_task(manager->scheduler, &manager->timer_task, timer_task_priority, manager);
    manager->timer_task.id = task_id;
}

void task_based_timer_manager_destroy(TaskBasedTimerManager* manager) {
    if (!manager) return;
    
    task_based_timer_manager_stop(manager);
    
    timer_manager_destroy(&manager->timer_manager);
    
    if (manager->owns_scheduler) {
        priority_scheduler_destroy(manager->scheduler);
    }
    
    // Clear the structure (no malloc, so no free needed)
    manager->timer_manager_ptr = NULL;
    manager->scheduler = NULL;
    manager->timer_task_priority = 0;
    manager->owns_scheduler = false;
}

// Timer management (delegates to underlying TimerManager)
uint32_t task_based_timer_manager_create_timer(TaskBasedTimerManager* manager, const char* name, TimerType type, 
                                              uint32_t interval_ms, TimerCallback callback, void* user_data) {
    if (!manager) return 0;
    return timer_manager_create_timer(manager->timer_manager_ptr, name, type, interval_ms, callback, user_data);
}

bool task_based_timer_manager_delete_timer(TaskBasedTimerManager* manager, uint32_t timer_id) {
    if (!manager) return false;
    return timer_manager_delete_timer(manager->timer_manager_ptr, timer_id);
}

bool task_based_timer_manager_start_timer(TaskBasedTimerManager* manager, uint32_t timer_id) {
    if (!manager) return false;
    return timer_manager_start_timer(manager->timer_manager_ptr, timer_id);
}

bool task_based_timer_manager_stop_timer(TaskBasedTimerManager* manager, uint32_t timer_id) {
    if (!manager) return false;
    return timer_manager_stop_timer(manager->timer_manager_ptr, timer_id);
}

bool task_based_timer_manager_restart_timer(TaskBasedTimerManager* manager, uint32_t timer_id) {
    if (!manager) return false;
    return timer_manager_restart_timer(manager->timer_manager_ptr, timer_id);
}

bool task_based_timer_manager_reset_timer(TaskBasedTimerManager* manager, uint32_t timer_id) {
    if (!manager) return false;
    return timer_manager_reset_timer(manager->timer_manager_ptr, timer_id);
}

// Timer query (delegates to underlying TimerManager)
Timer* task_based_timer_manager_get_timer(const TaskBasedTimerManager* manager, uint32_t timer_id) {
    if (!manager) return NULL;
    return timer_manager_get_timer(manager->timer_manager_ptr, timer_id);
}

Timer** task_based_timer_manager_get_all_timers(const TaskBasedTimerManager* manager, size_t* count) {
    if (!manager || !count) {
        if (count) *count = 0;
        return NULL;
    }
    
    // This is a simplified implementation
    // In a full implementation, you'd collect all timers from the timer manager
    *count = timer_manager_get_timer_count(manager->timer_manager_ptr);
    return NULL; // Placeholder
}

Timer** task_based_timer_manager_get_running_timers(const TaskBasedTimerManager* manager, size_t* count) {
    if (!manager || !count) {
        if (count) *count = 0;
        return NULL;
    }
    
    // This is a simplified implementation
    *count = 0; // Placeholder
    return NULL;
}

size_t task_based_timer_manager_get_timer_count(const TaskBasedTimerManager* manager) {
    if (!manager) return 0;
    return timer_manager_get_timer_count(manager->timer_manager_ptr);
}

size_t task_based_timer_manager_get_running_timer_count(const TaskBasedTimerManager* manager) {
    if (!manager) return 0;
    // This is a simplified implementation
    return 0; // Placeholder
}

// Manager control
bool task_based_timer_manager_start(TaskBasedTimerManager* manager) {
    if (!manager) return false;
    return timer_manager_start(manager->timer_manager_ptr);
}

bool task_based_timer_manager_stop(TaskBasedTimerManager* manager) {
    if (!manager) return false;
    return timer_manager_stop(manager->timer_manager_ptr);
}

bool task_based_timer_manager_is_running(const TaskBasedTimerManager* manager) {
    if (!manager) return false;
    return timer_manager_is_running(manager->timer_manager_ptr);
}

// Clock management (delegates to underlying TimerManager)
void task_based_timer_manager_set_clock(TaskBasedTimerManager* manager, IClock* clock) {
    if (manager) {
        timer_manager_set_clock(manager->timer_manager_ptr, clock);
    }
}

IClock* task_based_timer_manager_get_clock(const TaskBasedTimerManager* manager) {
    if (!manager) return NULL;
    return timer_manager_get_clock(manager->timer_manager_ptr);
}

bool task_based_timer_manager_is_tick_based(const TaskBasedTimerManager* manager) {
    if (!manager) return false;
    return timer_manager_is_tick_based(manager->timer_manager_ptr);
}

uint64_t task_based_timer_manager_get_tick_count(const TaskBasedTimerManager* manager) {
    if (!manager) return 0;
    return timer_manager_get_tick_count(manager->timer_manager_ptr);
}

uint32_t task_based_timer_manager_get_tick_interval(const TaskBasedTimerManager* manager) {
    if (!manager) return 0;
    return timer_manager_get_tick_interval(manager->timer_manager_ptr);
}

// Task-specific functions
Task* task_based_timer_manager_get_timer_task(const TaskBasedTimerManager* manager) {
    return manager ? (Task*)&manager->timer_task : NULL;
}

PriorityScheduler* task_based_timer_manager_get_scheduler(const TaskBasedTimerManager* manager) {
    return manager ? manager->scheduler : NULL;
}

uint8_t task_based_timer_manager_get_timer_task_priority(const TaskBasedTimerManager* manager) {
    return manager ? manager->timer_task_priority : 0;
}

// Debugging functions (delegates to underlying TimerManager)
void task_based_timer_manager_print_status(const TaskBasedTimerManager* manager) {
    if (!manager) {
        printf("TaskBasedTimerManager is NULL\n");
        return;
    }
    
    printf("Task-based Timer Manager Status:\n");
    printf("Timer task priority: %u\n", manager->timer_task_priority);
    printf("Owns scheduler: %s\n", manager->owns_scheduler ? "Yes" : "No");
    
    timer_manager_print_status(manager->timer_manager_ptr);
}

void task_based_timer_manager_print_running_timers(const TaskBasedTimerManager* manager) {
    if (!manager) {
        printf("TaskBasedTimerManager is NULL\n");
        return;
    }
    
    printf("Running timers in task-based manager:\n");
    // This would print running timers if we had a full implementation
}
