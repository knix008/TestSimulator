#include "scheduler.h"
#include "semaphore.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_semaphore_functionality() {
    std::cout << "=== Semaphore Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Create semaphore
    uint32_t sem_id = SemaphoreManager::create_semaphore(&scheduler, 2); // initial value 2
    assert(sem_id != 0);
    
    // Check initial count
    assert(SemaphoreManager::semaphore_get_count(&scheduler, sem_id) == 2);
    std::cout << "Created semaphore with initial count: " << SemaphoreManager::semaphore_get_count(&scheduler, sem_id) << std::endl;
    
    // Create test task
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // Test wait operation
    assert(SemaphoreManager::semaphore_wait(&scheduler, sem_id, 1000));
    assert(SemaphoreManager::semaphore_get_count(&scheduler, sem_id) == 1);
    
    // Test another wait
    assert(SemaphoreManager::semaphore_wait(&scheduler, sem_id, 1000));
    assert(SemaphoreManager::semaphore_get_count(&scheduler, sem_id) == 0);
    
    // Test timeout wait (should fail)
    assert(!SemaphoreManager::semaphore_wait(&scheduler, sem_id, 100));
    
    // Test post operation
    SemaphoreManager::semaphore_post(&scheduler, sem_id);
    assert(SemaphoreManager::semaphore_get_count(&scheduler, sem_id) == 1);
    
    // Cleanup
    SemaphoreManager::delete_semaphore(&scheduler, sem_id);
    SemaphoreManager::delete_semaphore(&scheduler, 999); // Test non-existent semaphore
    
    std::cout << "Semaphore functionality test passed!" << std::endl << std::endl;
}