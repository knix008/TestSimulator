#ifndef SEMAPHORE_H
#define SEMAPHORE_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "atomic_lock.h"

#ifdef __cplusplus
extern "C" {
#endif

// Semaphore structure (simplified without platform dependencies)
typedef struct Semaphore {
    uint32_t id;    // Semaphore ID
    int count;      // Current count
    int max_count;  // Maximum count (initialized with initial count)
    atomic_lock_t lock; // Atomic lock for thread safety
} Semaphore;

#define MAX_SEMAPHORES 32

// Independent Semaphore Manager
typedef struct SemaphoreManager {
    Semaphore semaphores[MAX_SEMAPHORES];    // Fixed-size array of semaphores
    bool semaphore_used[MAX_SEMAPHORES];     // Track which semaphores are used
    uint32_t next_semaphore_id;
    size_t semaphore_count;
    atomic_lock_t manager_lock;  // Atomic lock for manager operations
} SemaphoreManager;

// Semaphore functions
void semaphore_init(Semaphore* sem, int initial_count, uint32_t id);
void semaphore_destroy(Semaphore* sem);
bool semaphore_wait(Semaphore* sem, uint32_t timeout_ms);  // 0 = infinite wait
bool semaphore_post(Semaphore* sem);
int semaphore_get_count(const Semaphore* sem);

// Semaphore Manager functions
void semaphore_manager_init(SemaphoreManager* manager);
void semaphore_manager_destroy(SemaphoreManager* manager);

// Semaphore management functions
uint32_t semaphore_manager_create_semaphore(SemaphoreManager* manager, int initial_count);
bool semaphore_manager_delete_semaphore(SemaphoreManager* manager, uint32_t semaphore_id);
bool semaphore_manager_wait(SemaphoreManager* manager, uint32_t semaphore_id, uint32_t timeout_ms);
bool semaphore_manager_post(SemaphoreManager* manager, uint32_t semaphore_id);
int semaphore_manager_get_count(SemaphoreManager* manager, uint32_t semaphore_id);
Semaphore* semaphore_manager_find_semaphore(SemaphoreManager* manager, uint32_t semaphore_id);
size_t semaphore_manager_get_count_total(const SemaphoreManager* manager);
size_t semaphore_manager_get_semaphore_count(const SemaphoreManager* manager);
Semaphore* semaphore_manager_get_semaphore(SemaphoreManager* manager, uint32_t sem_id);
void semaphore_manager_print_semaphores(const SemaphoreManager* manager);

#ifdef __cplusplus
}
#endif

#endif // SEMAPHORE_H
