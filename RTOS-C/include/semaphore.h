#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "platform.h"

#ifdef __cplusplus
extern "C" {
#endif

// Semaphore structure
typedef struct Semaphore {
    int count;
    mutex_t mutex;
    cond_t cv;
} Semaphore;

// Semaphore node for linked list
typedef struct SemaphoreNode {
    uint32_t id;
    Semaphore* semaphore;
    struct SemaphoreNode* next;
} SemaphoreNode;

// Independent Semaphore Manager
typedef struct SemaphoreManager {
    SemaphoreNode* semaphores_head;
    uint32_t next_semaphore_id;
    size_t semaphore_count;
    mutex_t manager_mutex;
} SemaphoreManager;

// Semaphore functions
Semaphore* semaphore_create(int initial_count);
void semaphore_destroy(Semaphore* sem);
bool semaphore_wait(Semaphore* sem, uint32_t timeout_ms);  // 0 = infinite wait
bool semaphore_post(Semaphore* sem);
int semaphore_get_count(const Semaphore* sem);

// Semaphore Manager functions
SemaphoreManager* semaphore_manager_create(void);
void semaphore_manager_destroy(SemaphoreManager* manager);

// Semaphore management functions
uint32_t semaphore_manager_create_semaphore(SemaphoreManager* manager, int initial_count);
bool semaphore_manager_delete_semaphore(SemaphoreManager* manager, uint32_t sem_id);
bool semaphore_manager_wait(SemaphoreManager* manager, uint32_t sem_id, uint32_t timeout_ms);
bool semaphore_manager_post(SemaphoreManager* manager, uint32_t sem_id);
int semaphore_manager_get_count(SemaphoreManager* manager, uint32_t sem_id);

// Status and debugging
size_t semaphore_manager_get_semaphore_count(const SemaphoreManager* manager);
void semaphore_manager_print_semaphores(const SemaphoreManager* manager);

// Internal helper functions
Semaphore* semaphore_manager_find_semaphore(SemaphoreManager* manager, uint32_t sem_id);

#ifdef __cplusplus
}
#endif