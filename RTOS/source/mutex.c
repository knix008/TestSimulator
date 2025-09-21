#include "mutex.h"
#include "atomic_lock.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

// Real mutex lock with proper semantics
static bool real_mutex_lock(Mutex* mutex, uint32_t timeout_ms) {
    if (!mutex) return false;
    
    uint32_t start_time = 0;
    if (timeout_ms > 0) {
        // Simple time tracking - in real hardware this would use a system timer
        start_time = (uint32_t)time(NULL) * 1000;
    }
    
    while (atomic_test_and_set(&mutex->is_locked)) {
        // Check for timeout
        if (timeout_ms > 0) {
            uint32_t current_time = (uint32_t)time(NULL) * 1000;
            if ((current_time - start_time) >= timeout_ms) {
                return false; // Timeout
            }
        }
        
        // Busy wait - in real hardware this would yield to scheduler
        volatile int dummy = 0;
        dummy++;
    }
    
    return true; // Successfully acquired lock
}

// Real mutex unlock
static void real_mutex_unlock(Mutex* mutex) {
    if (mutex) {
        atomic_clear(&mutex->is_locked);
    }
}

// Mutex functions
void mutex_init(Mutex* mutex, const char* name, MutexType type) {
    if (!mutex) return;
    
    mutex->id = 0; // Will be set by manager
    mutex->type = type;
    mutex->owner_task_id = 0;
    mutex->is_locked = false;
    mutex->lock_count = 0;
    mutex->recursive = (type == MUTEX_RECURSIVE);
    
    // Set name (copy to fixed-size buffer)
    if (name) {
        strncpy(mutex->name, name, sizeof(mutex->name) - 1);
        mutex->name[sizeof(mutex->name) - 1] = '\0';
    } else {
        mutex->name[0] = '\0';
    }
    
    // Initialize statistics
    mutex->total_locks = 0;
    mutex->total_unlocks = 0;
    mutex->max_wait_time_ms = 0;
}

void mutex_destroy(Mutex* mutex) {
    if (!mutex) return;
    
    // Clear mutex state (no malloc, so no free needed)
    mutex->is_locked = false;
    mutex->owner_task_id = 0;
    mutex->lock_count = 0;
    mutex->id = 0;
    mutex->name[0] = '\0';
    mutex->total_locks = 0;
    mutex->total_unlocks = 0;
    mutex->max_wait_time_ms = 0;
}

bool mutex_lock(Mutex* mutex, uint32_t timeout_ms) {
    if (!mutex) return false;
    
    uint32_t current_task_id = 1; // In real implementation, this would be current task ID
    
    // Check for recursive lock first
    if (mutex->is_locked && mutex->owner_task_id == current_task_id) {
        // Recursive lock
        if (mutex->recursive) {
            mutex->lock_count++;
            mutex->total_locks++;
            return true;
        } else {
            return false; // Non-recursive mutex already locked by same task
        }
    }
    
    // Try to acquire the lock using real mutex implementation
    if (!real_mutex_lock(mutex, timeout_ms)) {
        return false; // Failed to acquire lock (timeout or error)
    }
    
    // Acquire lock
    mutex->is_locked = true;
    mutex->owner_task_id = current_task_id;
    mutex->lock_count = 1;
    mutex->total_locks++;
    
    return true;
}

bool mutex_try_lock(Mutex* mutex) {
    if (!mutex) return false;
    
    uint32_t current_task_id = 1; // In real implementation, this would be current task ID
    
    if (mutex->is_locked) {
        if (mutex->owner_task_id == current_task_id && mutex->recursive) {
            // Recursive lock
            mutex->lock_count++;
            mutex->total_locks++;
            return true;
        }
        return false; // Already locked by another task or non-recursive
    }
    
    // Acquire lock
    mutex->is_locked = true;
    mutex->owner_task_id = current_task_id;
    mutex->lock_count = 1;
    mutex->total_locks++;
    
    return true;
}

bool mutex_unlock(Mutex* mutex) {
    if (!mutex || !mutex->is_locked) return false;
    
    uint32_t current_task_id = 1; // In real implementation, this would be current task ID
    
    if (mutex->owner_task_id != current_task_id) {
        return false; // Not owned by current task
    }
    
    mutex->lock_count--;
    mutex->total_unlocks++;
    
    if (mutex->lock_count == 0) {
        // Use real mutex unlock
        real_mutex_unlock(mutex);
        mutex->owner_task_id = 0;
    }
    
    return true;
}

// Mutex state queries
bool mutex_is_locked(const Mutex* mutex) {
    return mutex ? mutex->is_locked : false;
}

uint32_t mutex_get_owner(const Mutex* mutex) {
    return mutex ? mutex->owner_task_id : 0;
}

uint32_t mutex_get_lock_count(const Mutex* mutex) {
    return mutex ? mutex->lock_count : 0;
}

bool mutex_is_recursive(const Mutex* mutex) {
    return mutex ? mutex->recursive : false;
}

// Mutex properties
uint32_t mutex_get_id(const Mutex* mutex) {
    return mutex ? mutex->id : 0;
}

const char* mutex_get_name(const Mutex* mutex) {
    return mutex ? mutex->name : NULL;
}

void mutex_set_name(Mutex* mutex, const char* name) {
    if (!mutex) return;
    
    if (name) {
        strncpy(mutex->name, name, sizeof(mutex->name) - 1);
        mutex->name[sizeof(mutex->name) - 1] = '\0';
    } else {
        mutex->name[0] = '\0';
    }
}

// Statistics
uint32_t mutex_get_total_locks(const Mutex* mutex) {
    return mutex ? mutex->total_locks : 0;
}

uint32_t mutex_get_total_unlocks(const Mutex* mutex) {
    return mutex ? mutex->total_unlocks : 0;
}

uint32_t mutex_get_max_wait_time(const Mutex* mutex) {
    return mutex ? mutex->max_wait_time_ms : 0;
}

void mutex_reset_statistics(Mutex* mutex) {
    if (!mutex) return;
    
    mutex->total_locks = 0;
    mutex->total_unlocks = 0;
    mutex->max_wait_time_ms = 0;
}

// String representation
void mutex_to_string(const Mutex* mutex, char* buffer, size_t buffer_size) {
    if (!mutex || !buffer || buffer_size == 0) {
        if (buffer && buffer_size > 0) {
            buffer[0] = '\0';
        }
        return;
    }
    
    snprintf(buffer, buffer_size, 
             "Mutex{id=%u, name=%s, locked=%s, owner=%u, count=%u, recursive=%s, locks=%u, unlocks=%u}",
             mutex->id,
             mutex->name,
             mutex->is_locked ? "true" : "false",
             mutex->owner_task_id,
             mutex->lock_count,
             mutex->recursive ? "true" : "false",
             mutex->total_locks,
             mutex->total_unlocks);
}

// Mutex Manager functions
void mutex_manager_init(MutexManager* manager) {
    if (!manager) return;
    
    // Initialize all mutex slots as unused
    for (int i = 0; i < MAX_MUTEXES; i++) {
        manager->mutex_used[i] = false;
        mutex_init(&manager->mutexes[i], NULL, MUTEX_NORMAL);
    }
    
    manager->next_mutex_id = 1;
    manager->mutex_count = 0;
    atomic_lock_init(&manager->manager_lock);
}

void mutex_manager_destroy(MutexManager* manager) {
    if (!manager) return;
    
    // Clear all mutexes (no malloc, so no free needed)
    for (int i = 0; i < MAX_MUTEXES; i++) {
        manager->mutex_used[i] = false;
        mutex_destroy(&manager->mutexes[i]);
    }
    
    manager->next_mutex_id = 1;
    manager->mutex_count = 0;
    atomic_lock_init(&manager->manager_lock);
}

uint32_t mutex_manager_create_mutex(MutexManager* manager, const char* name, MutexType type) {
    if (!manager) return 0;
    
    // Find an unused slot
    int slot = -1;
    for (int i = 0; i < MAX_MUTEXES; i++) {
        if (!manager->mutex_used[i]) {
            slot = i;
            break;
        }
    }
    
    if (slot == -1) {
        return 0; // No free slots
    }
    
    // Initialize the mutex in the slot
    Mutex* mutex = &manager->mutexes[slot];
    mutex_init(mutex, name, type);
    mutex->id = manager->next_mutex_id++;
    
    manager->mutex_used[slot] = true;
    manager->mutex_count++;
    
    return mutex->id;
}

bool mutex_manager_delete_mutex(MutexManager* manager, uint32_t mutex_id) {
    if (!manager) return false;
    
    // Find the mutex slot
    for (int i = 0; i < MAX_MUTEXES; i++) {
        if (manager->mutex_used[i] && manager->mutexes[i].id == mutex_id) {
            mutex_destroy(&manager->mutexes[i]);
            manager->mutex_used[i] = false;
            manager->mutex_count--;
            return true;
        }
    }
    
    return false;
}

// Mutex operations through manager
bool mutex_manager_lock(MutexManager* manager, uint32_t mutex_id, uint32_t timeout_ms) {
    if (!manager) return false;
    
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    return mutex ? mutex_lock(mutex, timeout_ms) : false;
}

bool mutex_manager_try_lock(MutexManager* manager, uint32_t mutex_id) {
    if (!manager) return false;
    
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    return mutex ? mutex_try_lock(mutex) : false;
}

bool mutex_manager_unlock(MutexManager* manager, uint32_t mutex_id) {
    if (!manager) return false;
    
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    return mutex ? mutex_unlock(mutex) : false;
}

// Mutex queries through manager
bool mutex_manager_is_locked(MutexManager* manager, uint32_t mutex_id) {
    if (!manager) return false;
    
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    return mutex ? mutex_is_locked(mutex) : false;
}

uint32_t mutex_manager_get_owner(MutexManager* manager, uint32_t mutex_id) {
    if (!manager) return 0;
    
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    return mutex ? mutex_get_owner(mutex) : 0;
}

uint32_t mutex_manager_get_lock_count(MutexManager* manager, uint32_t mutex_id) {
    if (!manager) return 0;
    
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    return mutex ? mutex_get_lock_count(mutex) : 0;
}

// Manager status and debugging
size_t mutex_manager_get_count(const MutexManager* manager) {
    return manager ? manager->mutex_count : 0;
}

void mutex_manager_print_mutexes(const MutexManager* manager) {
    if (!manager) return;
    
    printf("=== Mutex Manager Status ===\n");
    printf("Total mutexes: %zu\n", manager->mutex_count);
    
    for (int i = 0; i < MAX_MUTEXES; i++) {
        if (manager->mutex_used[i]) {
            char buffer[256];
            mutex_to_string(&manager->mutexes[i], buffer, sizeof(buffer));
            printf("  %s\n", buffer);
        }
    }
    printf("===========================\n");
}

void mutex_manager_print_statistics(const MutexManager* manager) {
    if (!manager) return;
    
    printf("=== Mutex Statistics ===\n");
    
    for (int i = 0; i < MAX_MUTEXES; i++) {
        if (manager->mutex_used[i]) {
            const Mutex* mutex = &manager->mutexes[i];
            printf("Mutex %u (%s): locks=%u, unlocks=%u, max_wait=%ums\n",
                   mutex->id,
                   mutex->name,
                   mutex->total_locks,
                   mutex->total_unlocks,
                   mutex->max_wait_time_ms);
        }
    }
    printf("========================\n");
}

// Internal helper functions
Mutex* mutex_manager_find_mutex(MutexManager* manager, uint32_t mutex_id) {
    if (!manager) return NULL;
    
    for (int i = 0; i < MAX_MUTEXES; i++) {
        if (manager->mutex_used[i] && manager->mutexes[i].id == mutex_id) {
            return &manager->mutexes[i];
        }
    }
    return NULL;
}

Mutex* mutex_manager_get_mutex(MutexManager* manager, uint32_t mutex_id) {
    return mutex_manager_find_mutex(manager, mutex_id);
}

size_t mutex_manager_get_mutex_count(const MutexManager* manager) {
    return mutex_manager_get_count(manager);
}

MutexType mutex_get_type(const Mutex* mutex) {
    return mutex ? mutex->type : MUTEX_NORMAL;
}