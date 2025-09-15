#include "scheduler.h"
#include "semaphore.h"
#include "event.h"
#include "signal.h"
#include "message_queue.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_sync_object_management() {
    std::cout << "=== Synchronization Object Management Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Create synchronization objects
    uint32_t sem1 = SemaphoreManager::create_semaphore(&scheduler, 1);
    uint32_t sem2 = SemaphoreManager::create_semaphore(&scheduler, 2);
    uint32_t event1 = EventManager::create_event(&scheduler);
    uint32_t event2 = EventManager::create_event(&scheduler);
    uint32_t signal1 = SignalManager::create_signal(&scheduler);
    uint32_t signal2 = SignalManager::create_signal(&scheduler);
    
    assert(sem1 != 0 && sem2 != 0);
    assert(event1 != 0 && event2 != 0);
    assert(signal1 != 0 && signal2 != 0);
    
    std::cout << "Created synchronization objects:" << std::endl;
    scheduler.print_sync_objects();
    
    // Delete objects
    assert(SemaphoreManager::delete_semaphore(&scheduler, sem1));
    assert(EventManager::delete_event(&scheduler, event1));
    assert(SignalManager::delete_signal(&scheduler, signal1));
    
    std::cout << "After deleting some objects:" << std::endl;
    scheduler.print_sync_objects();
    
    // Test non-existent object deletion
    assert(!SemaphoreManager::delete_semaphore(&scheduler, 999));
    assert(!EventManager::delete_event(&scheduler, 999));
    assert(!SignalManager::delete_signal(&scheduler, 999));
    
    // Cleanup remaining objects
    SemaphoreManager::delete_semaphore(&scheduler, sem2);
    EventManager::delete_event(&scheduler, event2);
    SignalManager::delete_signal(&scheduler, signal2);
    
    std::cout << "Synchronization object management test passed!" << std::endl << std::endl;
}