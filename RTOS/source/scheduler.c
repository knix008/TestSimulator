#include "scheduler.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Task queue operations
void task_queue_init(TaskQueue* queue) {
    if (queue) {
        for (int i = 0; i < MAX_TASKS_PER_PRIORITY; i++) {
            queue->tasks[i] = NULL;
        }
        queue->count = 0;
        queue->head = 0;
        queue->tail = 0;
    }
}

void task_queue_destroy(TaskQueue* queue) {
    if (!queue) return;
    
    for (int i = 0; i < MAX_TASKS_PER_PRIORITY; i++) {
        queue->tasks[i] = NULL;
    }
    queue->count = 0;
    queue->head = 0;
    queue->tail = 0;
}

void task_queue_enqueue(TaskQueue* queue, Task* task) {
    if (!queue || !task) return;
    
    // Check if queue is full
    if (queue->count >= MAX_TASKS_PER_PRIORITY) return;
    
    queue->tasks[queue->tail] = task;
    queue->tail = (queue->tail + 1) % MAX_TASKS_PER_PRIORITY;
    queue->count++;
}

Task* task_queue_dequeue(TaskQueue* queue) {
    if (!queue || queue->count == 0) return NULL;
    
    Task* task = queue->tasks[queue->head];
    queue->tasks[queue->head] = NULL;
    queue->head = (queue->head + 1) % MAX_TASKS_PER_PRIORITY;
    queue->count--;
    
    return task;
}

bool task_queue_remove(TaskQueue* queue, uint32_t task_id) {
    if (!queue || queue->count == 0) return false;
    
    // Search for the task to remove
    for (size_t i = 0; i < MAX_TASKS_PER_PRIORITY; i++) {
        if (queue->tasks[i] && queue->tasks[i]->id == task_id) {
            // Shift remaining tasks left
            for (size_t j = i; j < MAX_TASKS_PER_PRIORITY - 1; j++) {
                queue->tasks[j] = queue->tasks[j + 1];
            }
            queue->tasks[MAX_TASKS_PER_PRIORITY - 1] = NULL;
            queue->count--;
            return true;
        }
    }
    
    return false;
}

bool task_queue_is_empty(const TaskQueue* queue) {
    return !queue || queue->count == 0;
}

size_t task_queue_size(const TaskQueue* queue) {
    return queue ? queue->count : 0;
}

// Priority scheduler functions
void priority_scheduler_init(PriorityScheduler* scheduler) {
    if (!scheduler) return;
    
    // Initialize bitmap
    memset(scheduler->priority_bitmap, 0, sizeof(scheduler->priority_bitmap));
    
    // Initialize task queues
    for (int i = 0; i < MAX_PRIORITY_LEVELS; i++) {
        task_queue_init(&scheduler->task_queues[i]);
    }
    
    scheduler->current_task = NULL;
    scheduler->next_task_id = 1;
    
    // Initialize blocked tasks array (fixed size)
    scheduler->blocked_tasks_capacity = 16;
    scheduler->blocked_tasks_count = 0;
    // Note: blocked_tasks will be a fixed-size array in the struct
}

void priority_scheduler_destroy(PriorityScheduler* scheduler) {
    if (!scheduler) return;
    
    // Destroy all task queues
    for (int i = 0; i < MAX_PRIORITY_LEVELS; i++) {
        task_queue_destroy(&scheduler->task_queues[i]);
    }
    
    // Clear blocked tasks (no need to free since they're stack-allocated)
    for (size_t i = 0; i < scheduler->blocked_tasks_count; i++) {
        scheduler->blocked_tasks[i] = NULL;
    }
    scheduler->blocked_tasks_count = 0;
}

uint8_t priority_scheduler_find_highest_priority(const PriorityScheduler* scheduler) {
    if (!scheduler) return MAX_PRIORITY_LEVELS;
    
    for (int i = 0; i < 16; ++i) {
        if (scheduler->priority_bitmap[i] != 0) {
            uint8_t byte_value = scheduler->priority_bitmap[i];
            int bit_position = 0;
            
            while ((byte_value & 0x01) == 0) {
                byte_value >>= 1;
                bit_position++;
            }
            
            return (uint8_t)(i * 8 + bit_position);
        }
    }
    
    return MAX_PRIORITY_LEVELS;
}

void priority_scheduler_update_priority_bitmap(PriorityScheduler* scheduler, uint8_t priority, bool add) {
    if (!scheduler || !priority_scheduler_is_valid_priority(priority)) {
        return;
    }
    
    int byte_index = priority / 8;
    int bit_index = priority % 8;
    uint8_t bit_mask = 1 << bit_index;
    
    if (add) {
        scheduler->priority_bitmap[byte_index] |= bit_mask;
    } else {
        scheduler->priority_bitmap[byte_index] &= ~bit_mask;
    }
}

bool priority_scheduler_is_valid_priority(uint8_t priority) {
    return priority < MAX_PRIORITY_LEVELS;
}

uint32_t priority_scheduler_create_task(PriorityScheduler* scheduler, Task* task, uint8_t priority, void* data) {
    if (!scheduler || !task || !priority_scheduler_is_valid_priority(priority)) {
        return 0;
    }
    
    uint32_t task_id = scheduler->next_task_id++;
    task_init(task, task_id, priority, NULL, data);
    
    // Add to appropriate priority queue
    task_queue_enqueue(&scheduler->task_queues[priority], task);
    
    // Update priority bitmap
    priority_scheduler_update_priority_bitmap(scheduler, priority, true);
    
    return task_id;
}

bool priority_scheduler_add_task(PriorityScheduler* scheduler, Task* task, uint32_t task_id, uint8_t priority, void* data) {
    if (!scheduler || !task || !priority_scheduler_is_valid_priority(priority)) {
        return false;
    }
    
    // Check for duplicate task ID
    for (int i = 0; i < MAX_PRIORITY_LEVELS; i++) {
        TaskQueue* queue = &scheduler->task_queues[i];
        for (int j = 0; j < queue->count; j++) {
            int index = (queue->head + j) % MAX_TASKS_PER_PRIORITY;
            if (queue->tasks[index]->id == task_id) {
                return false; // Duplicate ID found
            }
        }
    }
    
    task_init(task, task_id, priority, task->function, data);
    
    // Add to appropriate priority queue
    task_queue_enqueue(&scheduler->task_queues[priority], task);
    
    // Update priority bitmap
    priority_scheduler_update_priority_bitmap(scheduler, priority, true);
    
    return true;
}

bool priority_scheduler_remove_task(PriorityScheduler* scheduler, uint32_t task_id) {
    if (!scheduler) return false;
    
    // Search through all priority levels
    for (int priority = 0; priority < MAX_PRIORITY_LEVELS; priority++) {
        TaskQueue* queue = &scheduler->task_queues[priority];
        if (task_queue_remove(queue, task_id)) {
            // If queue is now empty, update bitmap
            if (task_queue_is_empty(queue)) {
                priority_scheduler_update_priority_bitmap(scheduler, (uint8_t)priority, false);
            }
            return true;
        }
    }
    
    return false;
}

Task* priority_scheduler_get_next_task(PriorityScheduler* scheduler) {
    if (!scheduler) return NULL;
    
    uint8_t highest_priority = priority_scheduler_find_highest_priority(scheduler);
    if (highest_priority >= MAX_PRIORITY_LEVELS) {
        return NULL;
    }
    
    TaskQueue* queue = &scheduler->task_queues[highest_priority];
    Task* task = task_queue_dequeue(queue);
    
    // If queue is now empty, update bitmap
    if (task_queue_is_empty(queue)) {
        priority_scheduler_update_priority_bitmap(scheduler, highest_priority, false);
    }
    
    return task;
}

Task* priority_scheduler_get_current_task(const PriorityScheduler* scheduler) {
    return scheduler ? scheduler->current_task : NULL;
}

void priority_scheduler_set_current_task(PriorityScheduler* scheduler, Task* task) {
    if (scheduler) {
        scheduler->current_task = task;
    }
}

bool priority_scheduler_has_ready_tasks(const PriorityScheduler* scheduler) {
    if (!scheduler) return false;
    
    for (int i = 0; i < 16; ++i) {
        if (scheduler->priority_bitmap[i] != 0) {
            return true;
        }
    }
    
    return false;
}

uint8_t priority_scheduler_get_highest_ready_priority(const PriorityScheduler* scheduler) {
    return scheduler ? priority_scheduler_find_highest_priority(scheduler) : MAX_PRIORITY_LEVELS;
}

uint8_t priority_scheduler_get_highest_priority(const PriorityScheduler* scheduler) {
    return priority_scheduler_get_highest_ready_priority(scheduler);
}

size_t priority_scheduler_get_task_count(const PriorityScheduler* scheduler, uint8_t priority) {
    if (!scheduler || !priority_scheduler_is_valid_priority(priority)) {
        return 0;
    }
    
    return task_queue_size(&scheduler->task_queues[priority]);
}

size_t priority_scheduler_get_total_task_count(const PriorityScheduler* scheduler) {
    if (!scheduler) return 0;
    
    size_t total = 0;
    for (int i = 0; i < MAX_PRIORITY_LEVELS; i++) {
        total += task_queue_size(&scheduler->task_queues[i]);
    }
    
    return total;
}

void priority_scheduler_print_priority_bitmap(const PriorityScheduler* scheduler) {
    if (!scheduler) {
        printf("Scheduler is NULL\n");
        return;
    }
    
    printf("Priority bitmap (16 bytes):\n");
    for (int i = 0; i < 16; i++) {
        printf("Byte %2d: 0x%02X (", i, scheduler->priority_bitmap[i]);
        for (int bit = 7; bit >= 0; bit--) {
            printf("%d", (scheduler->priority_bitmap[i] >> bit) & 1);
        }
        printf(")\n");
    }
}

void priority_scheduler_print_task_queues(const PriorityScheduler* scheduler) {
    if (!scheduler) {
        printf("Scheduler is NULL\n");
        return;
    }
    
    printf("Task queues:\n");
    for (int i = 0; i < MAX_PRIORITY_LEVELS; i++) {
        size_t count = task_queue_size(&scheduler->task_queues[i]);
        if (count > 0) {
            printf("Priority %d: %zu tasks\n", i, count);
        }
    }
}

void priority_scheduler_print_blocked_tasks(const PriorityScheduler* scheduler) {
    if (!scheduler) {
        printf("Scheduler is NULL\n");
        return;
    }
    
    printf("Blocked tasks: %zu\n", scheduler->blocked_tasks_count);
    for (size_t i = 0; i < scheduler->blocked_tasks_count; i++) {
        Task* task = scheduler->blocked_tasks[i];
        if (task) {
            printf("  Task %u (priority %u)\n", task->id, task->priority);
        }
    }
}

void priority_scheduler_unblock_task(PriorityScheduler* scheduler, Task* task) {
    if (!scheduler || !task) return;
    
    // Remove from blocked tasks array
    for (size_t i = 0; i < scheduler->blocked_tasks_count; i++) {
        if (scheduler->blocked_tasks[i] == task) {
            // Shift remaining tasks
            for (size_t j = i; j < scheduler->blocked_tasks_count - 1; j++) {
                scheduler->blocked_tasks[j] = scheduler->blocked_tasks[j + 1];
            }
            scheduler->blocked_tasks_count--;
            
            // Transition task to ready and add to appropriate queue
            task_transition_to_ready(task);
            task_queue_enqueue(&scheduler->task_queues[task->priority], task);
            priority_scheduler_update_priority_bitmap(scheduler, task->priority, true);
            
            break;
        }
    }
}
