#ifndef EVENT_H
#define EVENT_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "atomic_lock.h"

#ifdef __cplusplus
extern "C" {
#endif

// Event structure
typedef struct Event {
    uint32_t id;    // Event ID
    uint32_t bits;  // Event flags (32-bit)
    atomic_lock_t lock; // Atomic lock for thread safety
} Event;

#define MAX_EVENTS 32

// Independent Event Manager
typedef struct EventManager {
    Event events[MAX_EVENTS];    // Fixed-size array of events
    bool event_used[MAX_EVENTS]; // Track which events are used
    uint32_t next_event_id;
    size_t event_count;
    atomic_lock_t manager_lock;  // Atomic lock for manager operations
} EventManager;

// Event functions
void event_init(Event* event, uint32_t id);
void event_destroy(Event* event);
bool event_wait(Event* event, uint32_t wait_bits, bool clear_on_exit, uint32_t timeout_ms);
bool event_set(Event* event, uint32_t set_bits);
bool event_clear(Event* event, uint32_t clear_bits);
uint32_t event_get_bits(const Event* event);

// Event Manager functions
void event_manager_init(EventManager* manager);
void event_manager_destroy(EventManager* manager);

// Event management functions
uint32_t event_manager_create_event(EventManager* manager);
bool event_manager_delete_event(EventManager* manager, uint32_t event_id);
bool event_manager_wait(EventManager* manager, uint32_t event_id, uint32_t wait_bits, bool clear_on_exit, uint32_t timeout_ms);
bool event_manager_set(EventManager* manager, uint32_t event_id, uint32_t set_bits);
bool event_manager_clear(EventManager* manager, uint32_t event_id, uint32_t clear_bits);
uint32_t event_manager_get_bits(EventManager* manager, uint32_t event_id);
Event* event_manager_find_event(EventManager* manager, uint32_t event_id);
Event* event_manager_get_event(EventManager* manager, uint32_t event_id);
size_t event_manager_get_count(const EventManager* manager);
size_t event_manager_get_event_count(const EventManager* manager);
void event_manager_print_events(const EventManager* manager);

#ifdef __cplusplus
}
#endif

#endif // EVENT_H
