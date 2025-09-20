#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "platform.h"

#ifdef __cplusplus
extern "C" {
#endif

// Mutex structure for RTOS
typedef struct Mutex {
    uint32_t id;
    char* name;
    uint32_t owner_task_id;  // ID of task that owns the mutex (0 = no owner)
    bool is_locked;
    uint32_t lock_count;     // For recursive mutex support
    bool recursive;          // Whether this mutex supports recursive locking
    
    // Platform synchronization
    mutex_t platform_mutex;
    cond_t cv;
    
    // Statistics
    uint32_t total_locks;
    uint32_t total_unlocks;
    uint32_t max_wait_time_ms;
} Mutex;

// Mutex node for linked list
typedef struct MutexNode {
    uint32_t id;
    Mutex* mutex;
    struct MutexNode* next;
} MutexNode;

// Mutex Manager structure
typedef struct MutexManager {
    MutexNode* mutexes_head;
    uint32_t next_mutex_id;
    size_t mutex_count;
    mutex_t manager_mutex;
} MutexManager;

// Mutex types
typedef enum {
    MUTEX_NORMAL,      // Standard mutex (non-recursive)
    MUTEX_RECURSIVE    // Recursive mutex (same task can lock multiple times)
} MutexType;

// Mutex functions
Mutex* mutex_create(const char* name, MutexType type);
void mutex_destroy(Mutex* mutex);

// Core mutex operations
bool mutex_lock(Mutex* mutex, uint32_t timeout_ms);
bool mutex_try_lock(Mutex* mutex);
bool mutex_unlock(Mutex* mutex);

// Mutex state queries
bool mutex_is_locked(const Mutex* mutex);
uint32_t mutex_get_owner(const Mutex* mutex);
uint32_t mutex_get_lock_count(const Mutex* mutex);
bool mutex_is_recursive(const Mutex* mutex);

// Mutex properties
uint32_t mutex_get_id(const Mutex* mutex);
const char* mutex_get_name(const Mutex* mutex);
void mutex_set_name(Mutex* mutex, const char* name);

// Statistics
uint32_t mutex_get_total_locks(const Mutex* mutex);
uint32_t mutex_get_total_unlocks(const Mutex* mutex);
uint32_t mutex_get_max_wait_time(const Mutex* mutex);
void mutex_reset_statistics(Mutex* mutex);

// String representation
char* mutex_to_string(const Mutex* mutex);

// Mutex Manager functions
MutexManager* mutex_manager_create(void);
void mutex_manager_destroy(MutexManager* manager);

// Mutex management functions
uint32_t mutex_manager_create_mutex(MutexManager* manager, const char* name, MutexType type);
bool mutex_manager_delete_mutex(MutexManager* manager, uint32_t mutex_id);

// Mutex operations through manager
bool mutex_manager_lock(MutexManager* manager, uint32_t mutex_id, uint32_t timeout_ms);
bool mutex_manager_try_lock(MutexManager* manager, uint32_t mutex_id);
bool mutex_manager_unlock(MutexManager* manager, uint32_t mutex_id);

// Mutex queries through manager
bool mutex_manager_is_locked(MutexManager* manager, uint32_t mutex_id);
uint32_t mutex_manager_get_owner(MutexManager* manager, uint32_t mutex_id);
uint32_t mutex_manager_get_lock_count(MutexManager* manager, uint32_t mutex_id);

// Manager status and debugging
size_t mutex_manager_get_count(const MutexManager* manager);
void mutex_manager_print_mutexes(const MutexManager* manager);
void mutex_manager_print_statistics(const MutexManager* manager);

// Internal helper functions
Mutex* mutex_manager_find_mutex(MutexManager* manager, uint32_t mutex_id);

#ifdef __cplusplus
}
#endif
