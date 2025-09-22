// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "task.h"
#include "message_queue.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Constructor-like function
void task_init(Task* task, uint32_t task_id, uint8_t task_priority, TaskFunction function, void* task_data) {
    if (!task) return;
    
    task->id = task_id;
    task->priority = task_priority;
    task->state = TASK_READY;
    task->function = function;
    task->data = task_data;
    
    // Initialize synchronization fields
    task->waiting_semaphore = NULL;
    task->waiting_event = NULL;
    task->waiting_signal = NULL;
    task->waiting_message_queue = NULL;
    task->event_mask = 0;
    task->clear_on_exit = true;
}

// Destructor-like function
void task_destroy(Task* task) {
    if (task) {
        // Clear the task data - no need to free since it's stack-allocated
        task->id = 0;
        task->priority = 0;
        task->state = TASK_READY;
        task->data = NULL;
        task->waiting_semaphore = NULL;
        task->waiting_event = NULL;
        task->waiting_signal = NULL;
        task->waiting_message_queue = NULL;
        task->event_mask = 0;
        task->clear_on_exit = false;
    }
}

// Getters
uint32_t task_get_id(const Task* task) {
    return task ? task->id : 0;
}

uint8_t task_get_priority(const Task* task) {
    return task ? task->priority : 0;
}

TaskState task_get_state(const Task* task) {
    return task ? task->state : TASK_READY;
}

void* task_get_data(const Task* task) {
    return task ? task->data : NULL;
}

void* task_get_function(Task* task) {
    return task ? (void*)task->function : NULL;
}

void task_set_priority(Task* task, uint8_t priority) {
    if (task) {
        task->priority = priority;
    }
}

// Synchronization getters
Semaphore* task_get_waiting_semaphore(const Task* task) {
    return task ? task->waiting_semaphore : NULL;
}

Event* task_get_waiting_event(const Task* task) {
    return task ? task->waiting_event : NULL;
}

Signal* task_get_waiting_signal(const Task* task) {
    return task ? task->waiting_signal : NULL;
}

MessageQueue* task_get_waiting_message_queue(const Task* task) {
    return task ? task->waiting_message_queue : NULL;
}

uint32_t task_get_event_mask(const Task* task) {
    return task ? task->event_mask : 0;
}

bool task_get_clear_on_exit(const Task* task) {
    return task ? task->clear_on_exit : true;
}

// Setters
void task_set_state(Task* task, TaskState new_state) {
    if (task) {
        task->state = new_state;
    }
}

void task_set_data(Task* task, void* new_data) {
    if (task) {
        task->data = new_data;
    }
}

// Synchronization setters
void task_set_waiting_semaphore(Task* task, Semaphore* semaphore) {
    if (task) {
        task->waiting_semaphore = semaphore;
    }
}

void task_set_waiting_event(Task* task, Event* event) {
    if (task) {
        task->waiting_event = event;
    }
}

void task_set_waiting_signal(Task* task, Signal* signal) {
    if (task) {
        task->waiting_signal = signal;
    }
}

void task_set_waiting_message_queue(Task* task, MessageQueue* mq) {
    if (task) {
        task->waiting_message_queue = mq;
    }
}

void task_set_event_mask(Task* task, uint32_t mask) {
    if (task) {
        task->event_mask = mask;
    }
}

void task_set_clear_on_exit(Task* task, bool clear) {
    if (task) {
        task->clear_on_exit = clear;
    }
}

// Utility methods
bool task_is_ready(const Task* task) {
    return task && task->state == TASK_READY;
}

bool task_is_running(const Task* task) {
    return task && task->state == TASK_RUNNING;
}

bool task_is_blocked(const Task* task) {
    return task && task->state == TASK_BLOCKED;
}

bool task_is_suspended(const Task* task) {
    return task && task->state == TASK_SUSPENDED;
}

// State transition methods
void task_transition_to_ready(Task* task) {
    if (task) {
        task->state = TASK_READY;
        task_clear_wait_states(task);
    }
}

void task_transition_to_running(Task* task) {
    if (task) {
        task->state = TASK_RUNNING;
    }
}

void task_transition_to_blocked(Task* task) {
    if (task) {
        task->state = TASK_BLOCKED;
    }
}

void task_transition_to_suspended(Task* task) {
    if (task) {
        task->state = TASK_SUSPENDED;
        task_clear_wait_states(task);
    }
}

// Clear all synchronization wait states
void task_clear_wait_states(Task* task) {
    if (task) {
        task->waiting_semaphore = NULL;
        task->waiting_event = NULL;
        task->waiting_signal = NULL;
        task->waiting_message_queue = NULL;
        task->event_mask = 0;
        task->clear_on_exit = true;
    }
}

// Task execution
void task_execute(Task* task) {
    if (task) {
        printf("Executing task %u with priority %u\n", task->id, task->priority);
        if (task->function) {
            task->function(task->data);
        }
    }
}

// String representation
void task_to_string(const Task* task, char* buffer, size_t buffer_size) {
    if (!task || !buffer || buffer_size == 0) {
        if (buffer && buffer_size > 0) {
            buffer[0] = '\0';
        }
        return;
    }
    
    char state_buffer[32];
    task_state_to_string(task->state, state_buffer, sizeof(state_buffer));
    
    snprintf(buffer, buffer_size, "Task{id=%u, priority=%u, state=%s, data=%s}",
            task->id, task->priority, state_buffer, 
            task->data ? "present" : "null");
}

void task_state_to_string(TaskState state, char* buffer, size_t buffer_size) {
    if (!buffer || buffer_size == 0) return;
    
    const char* state_str;
    switch (state) {
        case TASK_READY:
            state_str = "READY";
            break;
        case TASK_RUNNING:
            state_str = "RUNNING";
            break;
        case TASK_BLOCKED:
            state_str = "BLOCKED";
            break;
        case TASK_SUSPENDED:
            state_str = "SUSPENDED";
            break;
        default:
            state_str = "UNKNOWN";
            break;
    }
    
    strncpy(buffer, state_str, buffer_size - 1);
    buffer[buffer_size - 1] = '\0';
}

// Comparison functions for priority-based sorting
bool task_less_than(const Task* task1, const Task* task2) {
    if (!task1 || !task2) {
        return false;
    }
    // Lower priority number means higher priority (0 is highest)
    return task1->priority > task2->priority;
}

bool task_greater_than(const Task* task1, const Task* task2) {
    if (!task1 || !task2) {
        return false;
    }
    // Higher priority number means lower priority
    return task1->priority < task2->priority;
}

bool task_equal(const Task* task1, const Task* task2) {
    if (!task1 || !task2) {
        return false;
    }
    return task1->id == task2->id;
}

bool task_not_equal(const Task* task1, const Task* task2) {
    if (!task1 || !task2) {
        return true;
    }
    return task1->id != task2->id;
}
