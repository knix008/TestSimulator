#include "scheduler.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_sync_object_management() {
    std::cout << "=== Synchronization Object Management Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // 동기화 객체들 생성
    uint32_t sem1 = scheduler.create_semaphore(1);
    uint32_t sem2 = scheduler.create_semaphore(2);
    uint32_t event1 = scheduler.create_event();
    uint32_t event2 = scheduler.create_event();
    uint32_t signal1 = scheduler.create_signal();
    uint32_t signal2 = scheduler.create_signal();
    
    assert(sem1 != 0 && sem2 != 0);
    assert(event1 != 0 && event2 != 0);
    assert(signal1 != 0 && signal2 != 0);
    
    std::cout << "Created synchronization objects:" << std::endl;
    scheduler.print_sync_objects();
    
    // 일부 객체 삭제
    assert(scheduler.delete_semaphore(sem1));
    assert(scheduler.delete_event(event1));
    assert(scheduler.delete_signal(signal1));
    
    std::cout << "After deleting some objects:" << std::endl;
    scheduler.print_sync_objects();
    
    // 존재하지 않는 객체 삭제 시도
    assert(!scheduler.delete_semaphore(999));
    assert(!scheduler.delete_event(999));
    assert(!scheduler.delete_signal(999));
    
    std::cout << "Synchronization object management test passed!" << std::endl << std::endl;
}

