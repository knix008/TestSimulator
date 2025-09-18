#include "scheduler.h"
#include "event.h"
#include <iostream>
#include <cassert>
#include <exception>

using namespace RTOS;

void test_event_functionality() {
    std::cout << "=== Event Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    EventManager event_manager;
    
    // Create event
    uint32_t event_id = event_manager.create_event();
    assert(event_id != 0);
    
    // Check initial event bits
    assert(event_manager.event_get_bits(event_id) == 0);
    std::cout << "Created event with initial bits: " << event_manager.event_get_bits(event_id) << std::endl;
    
    // Set event bits
    assert(event_manager.event_set(event_id, 0x01 | 0x04)); // bits 0 and 2 set
    assert(event_manager.event_get_bits(event_id) == 0x05);
    
    // Create test task
    scheduler.create_task(5);
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // Test event wait
    assert(event_manager.event_wait(event_id, 0x01, true, 1000));
    assert(event_manager.event_get_bits(event_id) == 0x04); // bit 0 cleared
    
    // Clear event bits
    event_manager.event_clear(event_id, 0x04);
    assert(event_manager.event_get_bits(event_id) == 0x00);
    
    // Cleanup
    event_manager.delete_event(event_id);
    event_manager.delete_event(999); // Test non-existent event
    
    std::cout << "Event functionality test passed!" << std::endl << std::endl;
}

int main() {
    std::cout << "Event Test" << std::endl;
    std::cout << "==========" << std::endl << std::endl;
    
    try {
        test_event_functionality();
        std::cout << "Event test completed successfully!" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}