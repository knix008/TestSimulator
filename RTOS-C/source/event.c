#include "event.h"
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <time.h>

// Event functions
Event* event_create(void) {
    Event* event = (Event*)malloc(sizeof(Event));
    if (!event) return NULL;
    
    event->bits = 0;
    
    if (platform_mutex_init(&event->mutex) != 0) {
        free(event);
        return NULL;
    }
    
    if (platform_cond_init(&event->cv) != 0) {
        platform_mutex_destroy(&event->mutex);
        free(event);
        return NULL;
    }
    
    return event;
}

void event_destroy(Event* event) {
    if (!event) return;
    
    platform_mutex_destroy(&event->mutex);
    platform_cond_destroy(&event->cv);
    free(event);
}

bool event_wait(Event* event, uint32_t wait_bits, bool clear_on_exit, uint32_t timeout_ms) {
    if (!event) return false;
    
    platform_mutex_lock(&event->mutex);
    
    if (timeout_ms == 0) {
        // Infinite wait
        while ((event->bits & wait_bits) != wait_bits) {
            platform_cond_wait(&event->cv, &event->mutex);
        }
        
        if (clear_on_exit) {
            event->bits &= ~wait_bits;
        }
        
        platform_mutex_unlock(&event->mutex);
        return true;
    } else {
        // Timed wait
        struct timespec ts;
        clock_gettime(CLOCK_REALTIME, &ts);
        ts.tv_sec += timeout_ms / 1000;
        ts.tv_nsec += (timeout_ms % 1000) * 1000000;
        if (ts.tv_nsec >= 1000000000) {
            ts.tv_sec++;
            ts.tv_nsec -= 1000000000;
        }
        
        while ((event->bits & wait_bits) != wait_bits) {
            int result = platform_cond_timedwait(&event->cv, &event->mutex, &ts);
            if (result != 0) {
                platform_mutex_unlock(&event->mutex);
                return false;
            }
        }
        
        if (clear_on_exit) {
            event->bits &= ~wait_bits;
        }
        
        platform_mutex_unlock(&event->mutex);
        return true;
    }
}

bool event_set(Event* event, uint32_t set_bits) {
    if (!event) return false;
    
    platform_mutex_lock(&event->mutex);
    event->bits |= set_bits;
    platform_cond_broadcast(&event->cv);
    platform_mutex_unlock(&event->mutex);
    
    return true;
}

bool event_clear(Event* event, uint32_t clear_bits) {
    if (!event) return false;
    
    platform_mutex_lock(&event->mutex);
    event->bits &= ~clear_bits;
    platform_mutex_unlock(&event->mutex);
    
    return true;
}

uint32_t event_get_bits(const Event* event) {
    if (!event) return 0;
    
    platform_mutex_lock((mutex_t*)&event->mutex);
    uint32_t bits = event->bits;
    platform_mutex_unlock((mutex_t*)&event->mutex);
    
    return bits;
}

// Event Manager functions
EventManager* event_manager_create(void) {
    EventManager* manager = (EventManager*)malloc(sizeof(EventManager));
    if (!manager) return NULL;
    
    manager->events_head = NULL;
    manager->next_event_id = 1;
    manager->event_count = 0;
    
    if (platform_mutex_init(&manager->manager_mutex) != 0) {
        free(manager);
        return NULL;
    }
    
    return manager;
}

void event_manager_destroy(EventManager* manager) {
    if (!manager) return;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    EventNode* current = manager->events_head;
    while (current) {
        EventNode* next = current->next;
        event_destroy(current->event);
        free(current);
        current = next;
    }
    
    platform_mutex_unlock(&manager->manager_mutex);
    platform_mutex_destroy(&manager->manager_mutex);
    free(manager);
}

Event* event_manager_find_event(EventManager* manager, uint32_t event_id) {
    if (!manager) return NULL;
    
    EventNode* current = manager->events_head;
    while (current) {
        if (current->id == event_id) {
            return current->event;
        }
        current = current->next;
    }
    
    return NULL;
}

uint32_t event_manager_create_event(EventManager* manager) {
    if (!manager) return 0;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    Event* event = event_create();
    if (!event) {
        platform_mutex_unlock(&manager->manager_mutex);
        return 0;
    }
    
    EventNode* node = (EventNode*)malloc(sizeof(EventNode));
    if (!node) {
        event_destroy(event);
        platform_mutex_unlock(&manager->manager_mutex);
        return 0;
    }
    
    uint32_t event_id = manager->next_event_id++;
    node->id = event_id;
    node->event = event;
    node->next = manager->events_head;
    manager->events_head = node;
    manager->event_count++;
    
    platform_mutex_unlock(&manager->manager_mutex);
    return event_id;
}

bool event_manager_delete_event(EventManager* manager, uint32_t event_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    EventNode* current = manager->events_head;
    EventNode* prev = NULL;
    
    while (current) {
        if (current->id == event_id) {
            if (prev) {
                prev->next = current->next;
            } else {
                manager->events_head = current->next;
            }
            
            event_destroy(current->event);
            free(current);
            manager->event_count--;
            
            platform_mutex_unlock(&manager->manager_mutex);
            return true;
        }
        
        prev = current;
        current = current->next;
    }
    
    platform_mutex_unlock(&manager->manager_mutex);
    return false;
}

bool event_manager_wait(EventManager* manager, uint32_t event_id, uint32_t wait_bits, bool clear_on_exit, uint32_t timeout_ms) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    Event* event = event_manager_find_event(manager, event_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!event) return false;
    
    return event_wait(event, wait_bits, clear_on_exit, timeout_ms);
}

bool event_manager_set(EventManager* manager, uint32_t event_id, uint32_t set_bits) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    Event* event = event_manager_find_event(manager, event_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!event) return false;
    
    return event_set(event, set_bits);
}

bool event_manager_clear(EventManager* manager, uint32_t event_id, uint32_t clear_bits) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    Event* event = event_manager_find_event(manager, event_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!event) return false;
    
    return event_clear(event, clear_bits);
}

uint32_t event_manager_get_bits(EventManager* manager, uint32_t event_id) {
    if (!manager) return 0;
    
    platform_mutex_lock(&manager->manager_mutex);
    Event* event = event_manager_find_event(manager, event_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!event) return 0;
    
    return event_get_bits(event);
}

size_t event_manager_get_event_count(const EventManager* manager) {
    if (!manager) return 0;
    
    platform_mutex_lock((mutex_t*)&manager->manager_mutex);
    size_t count = manager->event_count;
    platform_mutex_unlock((mutex_t*)&manager->manager_mutex);
    
    return count;
}

void event_manager_print_events(const EventManager* manager) {
    if (!manager) {
        printf("EventManager is NULL\n");
        return;
    }
    
    platform_mutex_lock((mutex_t*)&manager->manager_mutex);
    
    printf("Event Manager Status:\n");
    printf("Total events: %zu\n", manager->event_count);
    
    EventNode* current = manager->events_head;
    while (current) {
        printf("  Event ID %u: bits = 0x%08X\n", 
               current->id, event_get_bits(current->event));
        current = current->next;
    }
    
    platform_mutex_unlock((mutex_t*)&manager->manager_mutex);
}
