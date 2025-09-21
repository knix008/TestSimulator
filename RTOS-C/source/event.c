#include "event.h"
#include "clock.h"
#include <stdio.h>
#include <string.h>
#include <time.h>

// Event functions
void event_init(Event* event, uint32_t id) {
    if (!event) return;
    
    event->id = id;
    event->bits = 0;
    atomic_lock_init(&event->lock);
}

void event_destroy(Event* event) {
    if (!event) return;
    
    event->bits = 0;
    atomic_lock_init(&event->lock);
    // No free() needed - caller manages memory
}

bool event_wait(Event* event, uint32_t wait_bits, bool clear_on_exit, uint32_t timeout_ms) {
    if (!event) return false;
    
    // Simple event wait without platform dependencies
    uint32_t start_time = 0;
    if (timeout_ms > 0) {
        struct timespec ts;
        clock_gettime(0, &ts);
        start_time = (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
    }
    
    // Check if bits are already set
    if ((event->bits & wait_bits) == wait_bits) {
        // Bits are set, proceed to clear if requested
    } else if (timeout_ms == 0) {
        // No timeout, don't wait
        return false;
    } else {
        // Wait for all specified bits to be set
        while ((event->bits & wait_bits) != wait_bits) {
            // Busy wait - in real hardware this would yield to scheduler
            volatile int dummy = 0;
            dummy++;
            
            // Check timeout
            struct timespec ts;
            clock_gettime(0, &ts);
            uint32_t current_time = (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
            if (current_time - start_time >= timeout_ms) {
                return false; // Timeout
            }
        }
    }
    
    // Clear bits if requested
    if (clear_on_exit) {
        event->bits &= ~wait_bits;
    }
    
    return true;
}

bool event_set(Event* event, uint32_t set_bits) {
    if (!event) return false;
    
    ATOMIC_LOCK(&event->lock, LOCK_ID_EVENT);
    event->bits |= set_bits;
    ATOMIC_UNLOCK(&event->lock, LOCK_ID_EVENT);
    
    return true;
}

bool event_clear(Event* event, uint32_t clear_bits) {
    if (!event) return false;
    
    ATOMIC_LOCK(&event->lock, LOCK_ID_EVENT);
    event->bits &= ~clear_bits;
    ATOMIC_UNLOCK(&event->lock, LOCK_ID_EVENT);
    
    return true;
}

uint32_t event_get_bits(const Event* event) {
    return event ? event->bits : 0;
}

// Event Manager functions
void event_manager_init(EventManager* manager) {
    if (!manager) return;
    
    // Initialize event array
    for (int i = 0; i < MAX_EVENTS; i++) {
        manager->event_used[i] = false;
    }
    manager->next_event_id = 1;
    manager->event_count = 0;
    atomic_lock_init(&manager->manager_lock);
}

void event_manager_destroy(EventManager* manager) {
    if (!manager) return;
    
    // Destroy all events
    for (int i = 0; i < MAX_EVENTS; i++) {
        if (manager->event_used[i]) {
            event_destroy(&manager->events[i]);
            manager->event_used[i] = false;
        }
    }
    
    manager->event_count = 0;
    atomic_lock_init(&manager->manager_lock);
    // No free() needed - caller manages memory
}

uint32_t event_manager_create_event(EventManager* manager) {
    if (!manager) return 0;
    
    ATOMIC_LOCK(&manager->manager_lock, LOCK_ID_EVENT);
    
    // Find an available slot
    int slot = -1;
    for (int i = 0; i < MAX_EVENTS; i++) {
        if (!manager->event_used[i]) {
            slot = i;
            break;
        }
    }
    
    if (slot == -1) {
        ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_EVENT);
        return 0;  // No available slots
    }
    
    uint32_t event_id = manager->next_event_id++;
    Event* event = &manager->events[slot];
    
    event_init(event, event_id);
    
    manager->event_used[slot] = true;
    manager->event_count++;
    
    ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_EVENT);
    return event_id;
}

bool event_manager_delete_event(EventManager* manager, uint32_t event_id) {
    if (!manager) return false;
    
    ATOMIC_LOCK(&manager->manager_lock, LOCK_ID_EVENT);
    
    // Find the event in the fixed-size array
    for (int i = 0; i < MAX_EVENTS; i++) {
        if (manager->event_used[i] && manager->events[i].id == event_id) {
            event_destroy(&manager->events[i]);
            manager->event_used[i] = false;
            manager->event_count--;
            
            ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_EVENT);
            return true;
        }
    }
    
    ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_EVENT);
    return false;
}

Event* event_manager_find_event(EventManager* manager, uint32_t event_id) {
    if (!manager) return NULL;
    
    for (int i = 0; i < MAX_EVENTS; i++) {
        if (manager->event_used[i] && manager->events[i].id == event_id) {
            return &manager->events[i];
        }
    }
    return NULL;
}

bool event_manager_wait(EventManager* manager, uint32_t event_id, uint32_t wait_bits, bool clear_on_exit, uint32_t timeout_ms) {
    if (!manager) return false;
    
    Event* event = event_manager_find_event(manager, event_id);
    if (!event) return false;
    
    return event_wait(event, wait_bits, clear_on_exit, timeout_ms);
}

bool event_manager_set(EventManager* manager, uint32_t event_id, uint32_t set_bits) {
    if (!manager) return false;
    
    Event* event = event_manager_find_event(manager, event_id);
    if (!event) return false;
    
    return event_set(event, set_bits);
}

bool event_manager_clear(EventManager* manager, uint32_t event_id, uint32_t clear_bits) {
    if (!manager) return false;
    
    Event* event = event_manager_find_event(manager, event_id);
    if (!event) return false;
    
    return event_clear(event, clear_bits);
}

uint32_t event_manager_get_bits(EventManager* manager, uint32_t event_id) {
    if (!manager) return 0;
    
    Event* event = event_manager_find_event(manager, event_id);
    if (!event) return 0;
    
    return event_get_bits(event);
}

size_t event_manager_get_count(const EventManager* manager) {
    return manager ? manager->event_count : 0;
}

Event* event_manager_get_event(EventManager* manager, uint32_t event_id) {
    return event_manager_find_event(manager, event_id);
}

size_t event_manager_get_event_count(const EventManager* manager) {
    return event_manager_get_count(manager);
}

void event_manager_print_events(const EventManager* manager) {
    if (!manager) return;
    
    printf("=== Event Manager Status ===\n");
    printf("Total events: %zu\n", manager->event_count);
    
    for (int i = 0; i < MAX_EVENTS; i++) {
        if (manager->event_used[i]) {
            Event* event = (Event*)&manager->events[i];
            printf("  Event %u: bits=0x%08X\n", 
                   event->id, event->bits);
        }
    }
    printf("============================\n");
}
