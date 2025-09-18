#include "scheduler.h"
#include "semaphore.h"
#include "event.h"
#include "signal.h"
#include "message_queue.h"
#include <iostream>
#include <cassert>
#include <exception>

using namespace RTOS;

void test_sync_object_management() {
    std::cout << "=== Synchronization Object Management Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    SemaphoreManager sem_manager;
    EventManager event_manager;
    SignalManager signal_manager;
    MessageQueueManager mq_manager;
    
    // Create synchronization objects
    uint32_t sem1 = sem_manager.create_semaphore(1);
    uint32_t sem2 = sem_manager.create_semaphore(2);
    uint32_t event1 = event_manager.create_event();
    uint32_t event2 = event_manager.create_event();
    uint32_t signal1 = signal_manager.create_signal();
    uint32_t signal2 = signal_manager.create_signal();
    uint32_t mq1 = mq_manager.create_message_queue(10);
    
    assert(sem1 != 0 && sem2 != 0);
    assert(event1 != 0 && event2 != 0);
    assert(signal1 != 0 && signal2 != 0);
    assert(mq1 != 0);
    
    // Suppress unused variable warnings
    (void)sem1; (void)event1; (void)signal1; (void)mq1;
    
    std::cout << "Created synchronization objects:" << std::endl;
    std::cout << "Semaphores: " << sem_manager.get_semaphore_count() << std::endl;
    std::cout << "Events: " << event_manager.get_event_count() << std::endl;
    std::cout << "Signals: " << signal_manager.get_signal_count() << std::endl;
    std::cout << "Message Queues: " << mq_manager.get_message_queue_count() << std::endl;
    
    // Delete objects
    assert(sem_manager.delete_semaphore(sem1));
    assert(event_manager.delete_event(event1));
    assert(signal_manager.delete_signal(signal1));
    assert(mq_manager.delete_message_queue(mq1));
    
    std::cout << "After deleting some objects:" << std::endl;
    std::cout << "Semaphores: " << sem_manager.get_semaphore_count() << std::endl;
    std::cout << "Events: " << event_manager.get_event_count() << std::endl;
    std::cout << "Signals: " << signal_manager.get_signal_count() << std::endl;
    std::cout << "Message Queues: " << mq_manager.get_message_queue_count() << std::endl;
    
    // Test non-existent object deletion
    assert(!sem_manager.delete_semaphore(999));
    assert(!event_manager.delete_event(999));
    assert(!signal_manager.delete_signal(999));
    assert(!mq_manager.delete_message_queue(999));
    
    // Cleanup remaining objects
    sem_manager.delete_semaphore(sem2);
    event_manager.delete_event(event2);
    signal_manager.delete_signal(signal2);
    
    std::cout << "Synchronization object management test passed!" << std::endl << std::endl;
}

int main() {
    std::cout << "Synchronization Management Test" << std::endl;
    std::cout << "===============================" << std::endl << std::endl;
    
    try {
        test_sync_object_management();
        std::cout << "Synchronization management test completed successfully!" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}