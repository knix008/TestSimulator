#include "semaphore.h"
#include "clock.h"
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <limits.h>

// Semaphore functions
void semaphore_init(Semaphore* sem, int initial_count, uint32_t id) {
    if (!sem) return;
    
    sem->id = id;
    sem->count = initial_count;
    // Set maximum count to initial count, but allow posting if initial count is 0
    sem->max_count = (initial_count > 0) ? initial_count : INT_MAX;
    atomic_lock_init(&sem->lock);
}

void semaphore_destroy(Semaphore* sem) {
    if (!sem) return;
    
    sem->count = 0;
    sem->max_count = 0;
    atomic_lock_init(&sem->lock);
    // No free() needed - caller manages memory
}

bool semaphore_wait(Semaphore* sem, uint32_t timeout_ms) {
    if (!sem) return false;
    
    // Simple semaphore wait without platform dependencies
    uint32_t start_time = 0;
    if (timeout_ms > 0) {
        struct timespec ts;
        clock_gettime(0, &ts);
        start_time = (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
    }
    
    // Check if semaphore is available
    if (sem->count > 0) {
        // Semaphore is available, proceed
    } else if (timeout_ms == 0) {
        // No timeout, don't wait
        return false;
    } else {
        // Wait for semaphore to be available
        while (sem->count <= 0) {
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
    
    // Decrement count atomically
    ATOMIC_LOCK(&sem->lock, LOCK_ID_SEMAPHORE);
    if (sem->count > 0) {
        sem->count--;
        ATOMIC_UNLOCK(&sem->lock, LOCK_ID_SEMAPHORE);
        return true;
    }
    ATOMIC_UNLOCK(&sem->lock, LOCK_ID_SEMAPHORE);
    
    return false;
}

bool semaphore_post(Semaphore* sem) {
    if (!sem) return false;
    
    ATOMIC_LOCK(&sem->lock, LOCK_ID_SEMAPHORE);
    
    // Check if we can increment without exceeding maximum
    if (sem->count >= sem->max_count) {
        ATOMIC_UNLOCK(&sem->lock, LOCK_ID_SEMAPHORE);
        return false; // Cannot post beyond maximum count
    }
    
    sem->count++;
    ATOMIC_UNLOCK(&sem->lock, LOCK_ID_SEMAPHORE);
    
    return true;
}

int semaphore_get_count(const Semaphore* sem) {
    return sem ? sem->count : 0;
}

// Semaphore Manager functions
void semaphore_manager_init(SemaphoreManager* manager) {
    if (!manager) return;
    
    // Initialize semaphore array
    for (int i = 0; i < MAX_SEMAPHORES; i++) {
        manager->semaphore_used[i] = false;
    }
    manager->next_semaphore_id = 1;
    manager->semaphore_count = 0;
    atomic_lock_init(&manager->manager_lock);
}

void semaphore_manager_destroy(SemaphoreManager* manager) {
    if (!manager) return;
    
    // Destroy all semaphores
    for (int i = 0; i < MAX_SEMAPHORES; i++) {
        if (manager->semaphore_used[i]) {
            semaphore_destroy(&manager->semaphores[i]);
            manager->semaphore_used[i] = false;
        }
    }
    
    manager->semaphore_count = 0;
    atomic_lock_init(&manager->manager_lock);
    // No free() needed - caller manages memory
}

uint32_t semaphore_manager_create_semaphore(SemaphoreManager* manager, int initial_count) {
    if (!manager) return 0;
    
    ATOMIC_LOCK(&manager->manager_lock, LOCK_ID_SEMAPHORE);
    
    // Find an available slot
    int slot = -1;
    for (int i = 0; i < MAX_SEMAPHORES; i++) {
        if (!manager->semaphore_used[i]) {
            slot = i;
            break;
        }
    }
    
    if (slot == -1) {
        ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_SEMAPHORE);
        return 0;  // No available slots
    }
    
    uint32_t semaphore_id = manager->next_semaphore_id++;
    Semaphore* sem = &manager->semaphores[slot];
    
    semaphore_init(sem, initial_count, semaphore_id);
    
    manager->semaphore_used[slot] = true;
    manager->semaphore_count++;
    
    ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_SEMAPHORE);
    return semaphore_id;
}

bool semaphore_manager_delete_semaphore(SemaphoreManager* manager, uint32_t semaphore_id) {
    if (!manager) return false;
    
    ATOMIC_LOCK(&manager->manager_lock, LOCK_ID_SEMAPHORE);
    
    // Find the semaphore in the fixed-size array
    for (int i = 0; i < MAX_SEMAPHORES; i++) {
        if (manager->semaphore_used[i] && manager->semaphores[i].id == semaphore_id) {
            semaphore_destroy(&manager->semaphores[i]);
            manager->semaphore_used[i] = false;
            manager->semaphore_count--;
            
            ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_SEMAPHORE);
            return true;
        }
    }
    
    ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_SEMAPHORE);
    return false;
}

Semaphore* semaphore_manager_find_semaphore(SemaphoreManager* manager, uint32_t semaphore_id) {
    if (!manager) return NULL;
    
    for (int i = 0; i < MAX_SEMAPHORES; i++) {
        if (manager->semaphore_used[i] && manager->semaphores[i].id == semaphore_id) {
            return &manager->semaphores[i];
        }
    }
    return NULL;
}

bool semaphore_manager_wait(SemaphoreManager* manager, uint32_t semaphore_id, uint32_t timeout_ms) {
    if (!manager) return false;
    
    Semaphore* sem = semaphore_manager_find_semaphore(manager, semaphore_id);
    if (!sem) return false;
    
    return semaphore_wait(sem, timeout_ms);
}

bool semaphore_manager_post(SemaphoreManager* manager, uint32_t semaphore_id) {
    if (!manager) return false;
    
    Semaphore* sem = semaphore_manager_find_semaphore(manager, semaphore_id);
    if (!sem) return false;
    
    return semaphore_post(sem);
}

int semaphore_manager_get_count(SemaphoreManager* manager, uint32_t semaphore_id) {
    if (!manager) return -1;
    
    Semaphore* sem = semaphore_manager_find_semaphore(manager, semaphore_id);
    if (!sem) return -1;
    
    return semaphore_get_count(sem);
}

size_t semaphore_manager_get_count_total(const SemaphoreManager* manager) {
    return manager ? manager->semaphore_count : 0;
}

size_t semaphore_manager_get_semaphore_count(const SemaphoreManager* manager) {
    return semaphore_manager_get_count_total(manager);
}

Semaphore* semaphore_manager_get_semaphore(SemaphoreManager* manager, uint32_t sem_id) {
    return semaphore_manager_find_semaphore(manager, sem_id);
}

void semaphore_manager_print_semaphores(const SemaphoreManager* manager) {
    if (!manager) return;
    
    printf("=== Semaphore Manager Status ===\n");
    printf("Total semaphores: %zu\n", manager->semaphore_count);
    
    for (int i = 0; i < MAX_SEMAPHORES; i++) {
        if (manager->semaphore_used[i]) {
            Semaphore* sem = (Semaphore*)&manager->semaphores[i];
            printf("  Semaphore %u: count=%d\n", 
                   sem->id, sem->count);
        }
    }
    printf("================================\n");
}
