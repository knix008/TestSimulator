#include "scheduler.h"
#include "event.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_event_functionality() {
    std::cout << "=== Event Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Create event
    uint32_t event_id = EventManager::create_event(&scheduler);
    assert(event_id != 0);
    
    // Check initial event bits
    assert(EventManager::event_get_bits(&scheduler, event_id) == 0);
    std::cout << "Created event with initial bits: " << EventManager::event_get_bits(&scheduler, event_id) << std::endl;
    
    // Set event bits
    assert(EventManager::event_set(&scheduler, event_id, 0x01 | 0x04)); // bits 0 and 2 set
    assert(EventManager::event_get_bits(&scheduler, event_id) == 0x05);
    
    // Create test task
    scheduler.create_task(5);
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // Test event wait
    assert(EventManager::event_wait(&scheduler, event_id, 0x01, true, 1000));
    assert(EventManager::event_get_bits(&scheduler, event_id) == 0x04); // bit 0 cleared
    
    // Clear event bits
    EventManager::event_clear(&scheduler, event_id, 0x04);
    assert(EventManager::event_get_bits(&scheduler, event_id) == 0x00);
    
    // Cleanup
    EventManager::delete_event(&scheduler, event_id);
    EventManager::delete_event(&scheduler, 999); // Test non-existent event
    
    std::cout << "Event functionality test passed!" << std::endl << std::endl;
}