#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "task.h"

#ifdef __cplusplus
extern "C" {
#endif

// Priority levels 0-127 (128 levels), 0 is the highest priority
#define MAX_PRIORITY_LEVELS 128

// Task queue node for linked list implementation
typedef struct TaskQueueNode {
    Task* task;
    struct TaskQueueNode* next;
} TaskQueueNode;

// Task queue structure
typedef struct TaskQueue {
    TaskQueueNode* front;
    TaskQueueNode* rear;
    size_t count;
} TaskQueue;

// Priority-based scheduler structure
typedef struct PriorityScheduler {
    // Bitmap for 128 priority levels (16 uint8_t = 128 bits)
    uint8_t priority_bitmap[16];
    
    // Task queue for each priority level
    TaskQueue task_queues[MAX_PRIORITY_LEVELS];
    
    // Currently running task
    Task* current_task;
    
    // Task ID counter
    uint32_t next_task_id;
    
    // Blocked tasks array
    Task** blocked_tasks;
    size_t blocked_tasks_count;
    size_t blocked_tasks_capacity;
} PriorityScheduler;

// Constructor-like function
PriorityScheduler* priority_scheduler_create(void);

// Destructor-like function
void priority_scheduler_destroy(PriorityScheduler* scheduler);

// Task management functions
uint32_t priority_scheduler_create_task(PriorityScheduler* scheduler, uint8_t priority, void* data);
bool priority_scheduler_add_task(PriorityScheduler* scheduler, uint32_t task_id, uint8_t priority, void* data);
bool priority_scheduler_remove_task(PriorityScheduler* scheduler, uint32_t task_id);

// Scheduling functions
Task* priority_scheduler_get_next_task(PriorityScheduler* scheduler);
Task* priority_scheduler_get_current_task(const PriorityScheduler* scheduler);
void priority_scheduler_set_current_task(PriorityScheduler* scheduler, Task* task);

// Status query functions
bool priority_scheduler_has_ready_tasks(const PriorityScheduler* scheduler);
uint8_t priority_scheduler_get_highest_ready_priority(const PriorityScheduler* scheduler);
size_t priority_scheduler_get_task_count(const PriorityScheduler* scheduler, uint8_t priority);
size_t priority_scheduler_get_total_task_count(const PriorityScheduler* scheduler);

// Debugging functions
void priority_scheduler_print_priority_bitmap(const PriorityScheduler* scheduler);
void priority_scheduler_print_task_queues(const PriorityScheduler* scheduler);
void priority_scheduler_print_blocked_tasks(const PriorityScheduler* scheduler);

// Internal helper functions
uint8_t priority_scheduler_find_highest_priority(const PriorityScheduler* scheduler);
void priority_scheduler_update_priority_bitmap(PriorityScheduler* scheduler, uint8_t priority, bool add);
bool priority_scheduler_is_valid_priority(uint8_t priority);
void priority_scheduler_unblock_task(PriorityScheduler* scheduler, Task* task);

// Task queue operations
void task_queue_init(TaskQueue* queue);
void task_queue_destroy(TaskQueue* queue);
void task_queue_enqueue(TaskQueue* queue, Task* task);
Task* task_queue_dequeue(TaskQueue* queue);
bool task_queue_remove(TaskQueue* queue, uint32_t task_id);
bool task_queue_is_empty(const TaskQueue* queue);
size_t task_queue_size(const TaskQueue* queue);

#ifdef __cplusplus
}
#endif