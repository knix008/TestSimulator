#include "semaphore.h"
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <time.h>

// Semaphore functions
Semaphore* semaphore_create(int initial_count) {
    Semaphore* sem = (Semaphore*)malloc(sizeof(Semaphore));
    if (!sem) return NULL;
    
    sem->count = initial_count;
    
    if (platform_mutex_init(&sem->mutex) != 0) {
        free(sem);
        return NULL;
    }
    
    if (platform_cond_init(&sem->cv) != 0) {
        platform_mutex_destroy(&sem->mutex);
        free(sem);
        return NULL;
    }
    
    return sem;
}

void semaphore_destroy(Semaphore* sem) {
    if (!sem) return;
    
    platform_mutex_destroy(&sem->mutex);
    platform_cond_destroy(&sem->cv);
    free(sem);
}

bool semaphore_wait(Semaphore* sem, uint32_t timeout_ms) {
    if (!sem) return false;
    
    platform_mutex_lock(&sem->mutex);
    
    if (timeout_ms == 0) {
        // Infinite wait
        while (sem->count <= 0) {
            platform_cond_wait(&sem->cv, &sem->mutex);
        }
        sem->count--;
        platform_mutex_unlock(&sem->mutex);
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
        
        while (sem->count <= 0) {
            int result = platform_cond_timedwait(&sem->cv, &sem->mutex, &ts);
            if (result != 0) {  // Changed from ETIMEDOUT check to generic error check
                platform_mutex_unlock(&sem->mutex);
                return false;
            }
        }
        
        sem->count--;
        platform_mutex_unlock(&sem->mutex);
        return true;
    }
}

bool semaphore_post(Semaphore* sem) {
    if (!sem) return false;
    
    platform_mutex_lock(&sem->mutex);
    sem->count++;
    platform_cond_signal(&sem->cv);
    platform_mutex_unlock(&sem->mutex);
    
    return true;
}

int semaphore_get_count(const Semaphore* sem) {
    if (!sem) return -1;
    
    platform_mutex_lock((mutex_t*)&sem->mutex);
    int count = sem->count;
    platform_mutex_unlock((mutex_t*)&sem->mutex);
    
    return count;
}

// Semaphore Manager functions
SemaphoreManager* semaphore_manager_create(void) {
    SemaphoreManager* manager = (SemaphoreManager*)malloc(sizeof(SemaphoreManager));
    if (!manager) return NULL;
    
    manager->semaphores_head = NULL;
    manager->next_semaphore_id = 1;
    manager->semaphore_count = 0;
    
    if (platform_mutex_init(&manager->manager_mutex) != 0) {
        free(manager);
        return NULL;
    }
    
    return manager;
}

void semaphore_manager_destroy(SemaphoreManager* manager) {
    if (!manager) return;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    SemaphoreNode* current = manager->semaphores_head;
    while (current) {
        SemaphoreNode* next = current->next;
        semaphore_destroy(current->semaphore);
        free(current);
        current = next;
    }
    
    platform_mutex_unlock(&manager->manager_mutex);
    platform_mutex_destroy(&manager->manager_mutex);
    free(manager);
}

Semaphore* semaphore_manager_find_semaphore(SemaphoreManager* manager, uint32_t sem_id) {
    if (!manager) return NULL;
    
    SemaphoreNode* current = manager->semaphores_head;
    while (current) {
        if (current->id == sem_id) {
            return current->semaphore;
        }
        current = current->next;
    }
    
    return NULL;
}

uint32_t semaphore_manager_create_semaphore(SemaphoreManager* manager, int initial_count) {
    if (!manager) return 0;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    Semaphore* sem = semaphore_create(initial_count);
    if (!sem) {
        platform_mutex_unlock(&manager->manager_mutex);
        return 0;
    }
    
    SemaphoreNode* node = (SemaphoreNode*)malloc(sizeof(SemaphoreNode));
    if (!node) {
        semaphore_destroy(sem);
        platform_mutex_unlock(&manager->manager_mutex);
        return 0;
    }
    
    uint32_t sem_id = manager->next_semaphore_id++;
    node->id = sem_id;
    node->semaphore = sem;
    node->next = manager->semaphores_head;
    manager->semaphores_head = node;
    manager->semaphore_count++;
    
    platform_mutex_unlock(&manager->manager_mutex);
    return sem_id;
}

bool semaphore_manager_delete_semaphore(SemaphoreManager* manager, uint32_t sem_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    SemaphoreNode* current = manager->semaphores_head;
    SemaphoreNode* prev = NULL;
    
    while (current) {
        if (current->id == sem_id) {
            if (prev) {
                prev->next = current->next;
            } else {
                manager->semaphores_head = current->next;
            }
            
            semaphore_destroy(current->semaphore);
            free(current);
            manager->semaphore_count--;
            
            platform_mutex_unlock(&manager->manager_mutex);
            return true;
        }
        
        prev = current;
        current = current->next;
    }
    
    platform_mutex_unlock(&manager->manager_mutex);
    return false;
}

bool semaphore_manager_wait(SemaphoreManager* manager, uint32_t sem_id, uint32_t timeout_ms) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    Semaphore* sem = semaphore_manager_find_semaphore(manager, sem_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!sem) return false;
    
    return semaphore_wait(sem, timeout_ms);
}

bool semaphore_manager_post(SemaphoreManager* manager, uint32_t sem_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    Semaphore* sem = semaphore_manager_find_semaphore(manager, sem_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!sem) return false;
    
    return semaphore_post(sem);
}

int semaphore_manager_get_count(SemaphoreManager* manager, uint32_t sem_id) {
    if (!manager) return -1;
    
    platform_mutex_lock(&manager->manager_mutex);
    Semaphore* sem = semaphore_manager_find_semaphore(manager, sem_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!sem) return -1;
    
    return semaphore_get_count(sem);
}

size_t semaphore_manager_get_semaphore_count(const SemaphoreManager* manager) {
    if (!manager) return 0;
    
    platform_mutex_lock((mutex_t*)&manager->manager_mutex);
    size_t count = manager->semaphore_count;
    platform_mutex_unlock((mutex_t*)&manager->manager_mutex);
    
    return count;
}

void semaphore_manager_print_semaphores(const SemaphoreManager* manager) {
    if (!manager) {
        printf("SemaphoreManager is NULL\n");
        return;
    }
    
    platform_mutex_lock((mutex_t*)&manager->manager_mutex);
    
    printf("Semaphore Manager Status:\n");
    printf("Total semaphores: %zu\n", manager->semaphore_count);
    
    SemaphoreNode* current = manager->semaphores_head;
    while (current) {
        printf("  Semaphore ID %u: count = %d\n", 
               current->id, semaphore_get_count(current->semaphore));
        current = current->next;
    }
    
    platform_mutex_unlock((mutex_t*)&manager->manager_mutex);
}
