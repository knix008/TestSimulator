#include "scheduler.h"
#include "semaphore.h"
#include <iostream>
#include <cassert>
#include <exception>

using namespace RTOS;

void test_semaphore_functionality() {
    std::cout << "=== Semaphore Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    SemaphoreManager sem_manager;
    
    // Create semaphore
    uint32_t sem_id = sem_manager.create_semaphore(2); // initial value 2
    assert(sem_id != 0);
    
    // Check initial count
    assert(sem_manager.semaphore_get_count(sem_id) == 2);
    std::cout << "Created semaphore with initial count: " << sem_manager.semaphore_get_count(sem_id) << std::endl;
    
    // Create test task
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // Test wait operation
    assert(sem_manager.semaphore_wait(sem_id, 1000));
    assert(sem_manager.semaphore_get_count(sem_id) == 1);
    
    // Test another wait
    assert(sem_manager.semaphore_wait(sem_id, 1000));
    assert(sem_manager.semaphore_get_count(sem_id) == 0);
    
    // Test timeout wait (should fail)
    assert(!sem_manager.semaphore_wait(sem_id, 100));
    
    // Test post operation
    sem_manager.semaphore_post(sem_id);
    assert(sem_manager.semaphore_get_count(sem_id) == 1);
    
    // Cleanup
    sem_manager.delete_semaphore(sem_id);
    sem_manager.delete_semaphore(999); // Test non-existent semaphore
    
    std::cout << "Semaphore functionality test passed!" << std::endl << std::endl;
}

int main() {
    std::cout << "Semaphore Test" << std::endl;
    std::cout << "==============" << std::endl << std::endl;
    
    try {
        test_semaphore_functionality();
        std::cout << "Semaphore test completed successfully!" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}