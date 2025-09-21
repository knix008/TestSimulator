#pragma once

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Forward declarations
typedef struct Semaphore Semaphore;
typedef struct Event Event;
typedef struct Signal Signal;
typedef struct MessageQueue MessageQueue;

// Task state definition
typedef enum {
    TASK_READY,
    TASK_RUNNING,
    TASK_BLOCKED,
    TASK_SUSPENDED
} TaskState;

// Task function pointer type
typedef void (*TaskFunction)(void* data);

// Task structure for RTOS scheduler
typedef struct Task {
    uint32_t id;
    uint8_t priority;
    TaskState state;
    TaskFunction function;
    void* data;
    
    // Synchronization related fields
    Semaphore* waiting_semaphore;
    Event* waiting_event;
    Signal* waiting_signal;
    MessageQueue* waiting_message_queue;
    uint32_t event_mask;
    bool clear_on_exit;
} Task;

// Constructor-like function
void task_init(Task* task, uint32_t task_id, uint8_t task_priority, TaskFunction function, void* task_data);

// Destructor-like function
void task_destroy(Task* task);

// Getters
uint32_t task_get_id(const Task* task);
uint8_t task_get_priority(const Task* task);
TaskState task_get_state(const Task* task);
void* task_get_data(const Task* task);
void* task_get_function(Task* task);

// Setters
void task_set_priority(Task* task, uint8_t priority);

// Synchronization getters
Semaphore* task_get_waiting_semaphore(const Task* task);
Event* task_get_waiting_event(const Task* task);
Signal* task_get_waiting_signal(const Task* task);
MessageQueue* task_get_waiting_message_queue(const Task* task);
uint32_t task_get_event_mask(const Task* task);
bool task_get_clear_on_exit(const Task* task);

// Setters
void task_set_state(Task* task, TaskState new_state);
void task_set_data(Task* task, void* new_data);

// Synchronization setters
void task_set_waiting_semaphore(Task* task, Semaphore* semaphore);
void task_set_waiting_event(Task* task, Event* event);
void task_set_waiting_signal(Task* task, Signal* signal);
void task_set_waiting_message_queue(Task* task, MessageQueue* mq);
void task_set_event_mask(Task* task, uint32_t mask);
void task_set_clear_on_exit(Task* task, bool clear);

// Utility methods
bool task_is_ready(const Task* task);
bool task_is_running(const Task* task);
bool task_is_blocked(const Task* task);
bool task_is_suspended(const Task* task);

// State transition methods
void task_transition_to_ready(Task* task);
void task_transition_to_running(Task* task);
void task_transition_to_blocked(Task* task);
void task_transition_to_suspended(Task* task);

// Clear all synchronization wait states
void task_clear_wait_states(Task* task);

// Task execution
void task_execute(Task* task);

// String representation
void task_to_string(const Task* task, char* buffer, size_t buffer_size);
void task_state_to_string(TaskState state, char* buffer, size_t buffer_size);

// Comparison functions for priority-based sorting
bool task_less_than(const Task* task1, const Task* task2);
bool task_greater_than(const Task* task1, const Task* task2);
bool task_equal(const Task* task1, const Task* task2);
bool task_not_equal(const Task* task1, const Task* task2);

#ifdef __cplusplus
}
#endif