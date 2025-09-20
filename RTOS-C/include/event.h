#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "platform.h"

#ifdef __cplusplus
extern "C" {
#endif

// Event structure
typedef struct Event {
    uint32_t bits;
    mutex_t mutex;
    cond_t cv;
} Event;

// Event node for linked list
typedef struct EventNode {
    uint32_t id;
    Event* event;
    struct EventNode* next;
} EventNode;

// Independent Event Manager
typedef struct EventManager {
    EventNode* events_head;
    uint32_t next_event_id;
    size_t event_count;
    mutex_t manager_mutex;
} EventManager;

// Event functions
Event* event_create(void);
void event_destroy(Event* event);
bool event_wait(Event* event, uint32_t wait_bits, bool clear_on_exit, uint32_t timeout_ms);
bool event_set(Event* event, uint32_t set_bits);
bool event_clear(Event* event, uint32_t clear_bits);
uint32_t event_get_bits(const Event* event);

// Event Manager functions
EventManager* event_manager_create(void);
void event_manager_destroy(EventManager* manager);

// Event management functions
uint32_t event_manager_create_event(EventManager* manager);
bool event_manager_delete_event(EventManager* manager, uint32_t event_id);
bool event_manager_wait(EventManager* manager, uint32_t event_id, uint32_t wait_bits, bool clear_on_exit, uint32_t timeout_ms);
bool event_manager_set(EventManager* manager, uint32_t event_id, uint32_t set_bits);
bool event_manager_clear(EventManager* manager, uint32_t event_id, uint32_t clear_bits);
uint32_t event_manager_get_bits(EventManager* manager, uint32_t event_id);

// Status and debugging
size_t event_manager_get_event_count(const EventManager* manager);
void event_manager_print_events(const EventManager* manager);

// Internal helper functions
Event* event_manager_find_event(EventManager* manager, uint32_t event_id);

#ifdef __cplusplus
}
#endif