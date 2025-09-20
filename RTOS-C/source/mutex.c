#include "mutex.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

// Mutex functions
Mutex* mutex_create(const char* name, MutexType type) {
    Mutex* mutex = (Mutex*)malloc(sizeof(Mutex));
    if (!mutex) return NULL;
    
    mutex->id = 0; // Will be set by manager
    mutex->owner_task_id = 0;
    mutex->is_locked = false;
    mutex->lock_count = 0;
    mutex->recursive = (type == MUTEX_RECURSIVE);
    
    // Set name
    if (name) {
        mutex->name = (char*)malloc(strlen(name) + 1);
        if (mutex->name) {
            strcpy(mutex->name, name);
        }
    } else {
        mutex->name = NULL;
    }
    
    // Initialize statistics
    mutex->total_locks = 0;
    mutex->total_unlocks = 0;
    mutex->max_wait_time_ms = 0;
    
    // Initialize platform synchronization
    if (platform_mutex_init(&mutex->platform_mutex) != 0) {
        if (mutex->name) free(mutex->name);
        free(mutex);
        return NULL;
    }
    
    if (platform_cond_init(&mutex->cv) != 0) {
        platform_mutex_destroy(&mutex->platform_mutex);
        if (mutex->name) free(mutex->name);
        free(mutex);
        return NULL;
    }
    
    return mutex;
}

void mutex_destroy(Mutex* mutex) {
    if (!mutex) return;
    
    platform_mutex_lock(&mutex->platform_mutex);
    
    // Clean up name
    if (mutex->name) {
        free(mutex->name);
        mutex->name = NULL;
    }
    
    platform_mutex_unlock(&mutex->platform_mutex);
    
    platform_mutex_destroy(&mutex->platform_mutex);
    platform_cond_destroy(&mutex->cv);
    free(mutex);
}

bool mutex_lock(Mutex* mutex, uint32_t timeout_ms) {
    if (!mutex) return false;
    
    platform_mutex_lock(&mutex->platform_mutex);
    
    // Record start time for statistics
    struct timespec start_time;
    clock_gettime(CLOCK_REALTIME, &start_time);
    
    // Check if already owned by current task (for recursive mutex)
    // Note: In a real RTOS, we would get the current task ID from the scheduler
    // For this implementation, we'll use a simplified approach
    uint32_t current_task_id = 1; // Simplified - in real RTOS this would come from scheduler
    
    if (mutex->is_locked && mutex->owner_task_id == current_task_id && mutex->recursive) {
        // Recursive lock by same task
        mutex->lock_count++;
        mutex->total_locks++;
        platform_mutex_unlock(&mutex->platform_mutex);
        return true;
    }
    
    // Wait for mutex to become available
    if (timeout_ms == 0) {
        // Infinite wait
        while (mutex->is_locked) {
            platform_cond_wait(&mutex->cv, &mutex->platform_mutex);
        }
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
        
        while (mutex->is_locked) {
            int result = platform_cond_timedwait(&mutex->cv, &mutex->platform_mutex, &ts);
            if (result != 0) { // Timeout or error
                platform_mutex_unlock(&mutex->platform_mutex);
                return false;
            }
        }
    }
    
    // Acquire the mutex
    mutex->is_locked = true;
    mutex->owner_task_id = current_task_id;
    mutex->lock_count = 1;
    mutex->total_locks++;
    
    // Update statistics
    struct timespec end_time;
    clock_gettime(CLOCK_REALTIME, &end_time);
    uint32_t wait_time_ms = (uint32_t)((end_time.tv_sec - start_time.tv_sec) * 1000 + 
                                      (end_time.tv_nsec - start_time.tv_nsec) / 1000000);
    if (wait_time_ms > mutex->max_wait_time_ms) {
        mutex->max_wait_time_ms = wait_time_ms;
    }
    
    platform_mutex_unlock(&mutex->platform_mutex);
    return true;
}

bool mutex_try_lock(Mutex* mutex) {
    if (!mutex) return false;
    
    platform_mutex_lock(&mutex->platform_mutex);
    
    uint32_t current_task_id = 1; // Simplified
    
    // Check if already owned by current task (for recursive mutex)
    if (mutex->is_locked && mutex->owner_task_id == current_task_id && mutex->recursive) {
        mutex->lock_count++;
        mutex->total_locks++;
        platform_mutex_unlock(&mutex->platform_mutex);
        return true;
    }
    
    // Try to acquire if not locked
    if (!mutex->is_locked) {
        mutex->is_locked = true;
        mutex->owner_task_id = current_task_id;
        mutex->lock_count = 1;
        mutex->total_locks++;
        platform_mutex_unlock(&mutex->platform_mutex);
        return true;
    }
    
    platform_mutex_unlock(&mutex->platform_mutex);
    return false; // Already locked by another task
}

bool mutex_unlock(Mutex* mutex) {
    if (!mutex) return false;
    
    platform_mutex_lock(&mutex->platform_mutex);
    
    uint32_t current_task_id = 1; // Simplified
    
    // Check if mutex is locked and owned by current task
    if (!mutex->is_locked || mutex->owner_task_id != current_task_id) {
        platform_mutex_unlock(&mutex->platform_mutex);
        return false; // Not locked or not owned by current task
    }
    
    // Decrement lock count (for recursive mutex)
    mutex->lock_count--;
    mutex->total_unlocks++;
    
    // Release mutex if lock count reaches zero
    if (mutex->lock_count == 0) {
        mutex->is_locked = false;
        mutex->owner_task_id = 0;
        platform_cond_signal(&mutex->cv); // Wake up waiting tasks
    }
    
    platform_mutex_unlock(&mutex->platform_mutex);
    return true;
}

// Mutex state queries
bool mutex_is_locked(const Mutex* mutex) {
    if (!mutex) return false;
    return mutex->is_locked;
}

uint32_t mutex_get_owner(const Mutex* mutex) {
    if (!mutex) return 0;
    return mutex->owner_task_id;
}

uint32_t mutex_get_lock_count(const Mutex* mutex) {
    if (!mutex) return 0;
    return mutex->lock_count;
}

bool mutex_is_recursive(const Mutex* mutex) {
    if (!mutex) return false;
    return mutex->recursive;
}

// Mutex properties
uint32_t mutex_get_id(const Mutex* mutex) {
    if (!mutex) return 0;
    return mutex->id;
}

const char* mutex_get_name(const Mutex* mutex) {
    if (!mutex) return NULL;
    return mutex->name;
}

void mutex_set_name(Mutex* mutex, const char* name) {
    if (!mutex) return;
    
    platform_mutex_lock(&mutex->platform_mutex);
    
    // Free old name
    if (mutex->name) {
        free(mutex->name);
        mutex->name = NULL;
    }
    
    // Set new name
    if (name) {
        mutex->name = (char*)malloc(strlen(name) + 1);
        if (mutex->name) {
            strcpy(mutex->name, name);
        }
    }
    
    platform_mutex_unlock(&mutex->platform_mutex);
}

// Statistics
uint32_t mutex_get_total_locks(const Mutex* mutex) {
    if (!mutex) return 0;
    return mutex->total_locks;
}

uint32_t mutex_get_total_unlocks(const Mutex* mutex) {
    if (!mutex) return 0;
    return mutex->total_unlocks;
}

uint32_t mutex_get_max_wait_time(const Mutex* mutex) {
    if (!mutex) return 0;
    return mutex->max_wait_time_ms;
}

void mutex_reset_statistics(Mutex* mutex) {
    if (!mutex) return;
    
    platform_mutex_lock(&mutex->platform_mutex);
    mutex->total_locks = 0;
    mutex->total_unlocks = 0;
    mutex->max_wait_time_ms = 0;
    platform_mutex_unlock(&mutex->platform_mutex);
}

// String representation
char* mutex_to_string(const Mutex* mutex) {
    if (!mutex) return NULL;
    
    char* str = (char*)malloc(256);
    if (str) {
        snprintf(str, 256, "Mutex{id=%u, name='%s', locked=%s, owner=%u, count=%u, recursive=%s}",
                 mutex->id,
                 mutex->name ? mutex->name : "unnamed",
                 mutex->is_locked ? "true" : "false",
                 mutex->owner_task_id,
                 mutex->lock_count,
                 mutex->recursive ? "true" : "false");
    }
    return str;
}

// Mutex Manager functions
MutexManager* mutex_manager_create(void) {
    MutexManager* manager = (MutexManager*)malloc(sizeof(MutexManager));
    if (!manager) return NULL;
    
    manager->mutexes_head = NULL;
    manager->next_mutex_id = 1;
    manager->mutex_count = 0;
    
    if (platform_mutex_init(&manager->manager_mutex) != 0) {
        free(manager);
        return NULL;
    }
    
    return manager;
}

void mutex_manager_destroy(MutexManager* manager) {
    if (!manager) return;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    // Destroy all mutexes
    MutexNode* current = manager->mutexes_head;
    while (current) {
        MutexNode* next = current->next;
        mutex_destroy(current->mutex);
        free(current);
        current = next;
    }
    
    platform_mutex_unlock(&manager->manager_mutex);
    platform_mutex_destroy(&manager->manager_mutex);
    free(manager);
}

uint32_t mutex_manager_create_mutex(MutexManager* manager, const char* name, MutexType type) {
    if (!manager) return 0;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    // Create mutex
    Mutex* mutex = mutex_create(name, type);
    if (!mutex) {
        platform_mutex_unlock(&manager->manager_mutex);
        return 0;
    }
    
    // Assign ID
    mutex->id = manager->next_mutex_id++;
    
    // Add to list
    MutexNode* node = (MutexNode*)malloc(sizeof(MutexNode));
    if (!node) {
        mutex_destroy(mutex);
        platform_mutex_unlock(&manager->manager_mutex);
        return 0;
    }
    
    node->id = mutex->id;
    node->mutex = mutex;
    node->next = manager->mutexes_head;
    manager->mutexes_head = node;
    manager->mutex_count++;
    
    uint32_t mutex_id = mutex->id;
    platform_mutex_unlock(&manager->manager_mutex);
    return mutex_id;
}

bool mutex_manager_delete_mutex(MutexManager* manager, uint32_t mutex_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    MutexNode* current = manager->mutexes_head;
    MutexNode* prev = NULL;
    
    while (current) {
        if (current->id == mutex_id) {
            // Remove from list
            if (prev) {
                prev->next = current->next;
            } else {
                manager->mutexes_head = current->next;
            }
            
            // Destroy mutex
            mutex_destroy(current->mutex);
            free(current);
            manager->mutex_count--;
            
            platform_mutex_unlock(&manager->manager_mutex);
            return true;
        }
        prev = current;
        current = current->next;
    }
    
    platform_mutex_unlock(&manager->manager_mutex);
    return false;
}

// Mutex operations through manager
bool mutex_manager_lock(MutexManager* manager, uint32_t mutex_id, uint32_t timeout_ms) {
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    if (!mutex) return false;
    
    return mutex_lock(mutex, timeout_ms);
}

bool mutex_manager_try_lock(MutexManager* manager, uint32_t mutex_id) {
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    if (!mutex) return false;
    
    return mutex_try_lock(mutex);
}

bool mutex_manager_unlock(MutexManager* manager, uint32_t mutex_id) {
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    if (!mutex) return false;
    
    return mutex_unlock(mutex);
}

// Mutex queries through manager
bool mutex_manager_is_locked(MutexManager* manager, uint32_t mutex_id) {
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    if (!mutex) return false;
    
    return mutex_is_locked(mutex);
}

uint32_t mutex_manager_get_owner(MutexManager* manager, uint32_t mutex_id) {
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    if (!mutex) return 0;
    
    return mutex_get_owner(mutex);
}

uint32_t mutex_manager_get_lock_count(MutexManager* manager, uint32_t mutex_id) {
    Mutex* mutex = mutex_manager_find_mutex(manager, mutex_id);
    if (!mutex) return 0;
    
    return mutex_get_lock_count(mutex);
}

// Manager status and debugging
size_t mutex_manager_get_count(const MutexManager* manager) {
    if (!manager) return 0;
    return manager->mutex_count;
}

void mutex_manager_print_mutexes(const MutexManager* manager) {
    if (!manager) return;
    
    platform_mutex_lock((mutex_t*)&manager->manager_mutex);
    
    printf("=== Mutex Manager Status ===\n");
    printf("Total mutexes: %zu\n", manager->mutex_count);
    
    MutexNode* current = manager->mutexes_head;
    int index = 1;
    while (current) {
        char* mutex_str = mutex_to_string(current->mutex);
        printf("%d. %s\n", index++, mutex_str ? mutex_str : "Invalid mutex");
        if (mutex_str) free(mutex_str);
        current = current->next;
    }
    
    platform_mutex_unlock((mutex_t*)&manager->manager_mutex);
}

void mutex_manager_print_statistics(const MutexManager* manager) {
    if (!manager) return;
    
    platform_mutex_lock((mutex_t*)&manager->manager_mutex);
    
    printf("=== Mutex Statistics ===\n");
    printf("Total mutexes: %zu\n", manager->mutex_count);
    
    uint32_t total_locks = 0;
    uint32_t total_unlocks = 0;
    uint32_t max_wait = 0;
    
    MutexNode* current = manager->mutexes_head;
    while (current) {
        total_locks += current->mutex->total_locks;
        total_unlocks += current->mutex->total_unlocks;
        if (current->mutex->max_wait_time_ms > max_wait) {
            max_wait = current->mutex->max_wait_time_ms;
        }
        current = current->next;
    }
    
    printf("Total locks: %u\n", total_locks);
    printf("Total unlocks: %u\n", total_unlocks);
    printf("Max wait time: %u ms\n", max_wait);
    
    platform_mutex_unlock((mutex_t*)&manager->manager_mutex);
}

// Internal helper functions
Mutex* mutex_manager_find_mutex(MutexManager* manager, uint32_t mutex_id) {
    if (!manager) return NULL;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    MutexNode* current = manager->mutexes_head;
    while (current) {
        if (current->id == mutex_id) {
            Mutex* mutex = current->mutex;
            platform_mutex_unlock(&manager->manager_mutex);
            return mutex;
        }
        current = current->next;
    }
    
    platform_mutex_unlock(&manager->manager_mutex);
    return NULL;
}
