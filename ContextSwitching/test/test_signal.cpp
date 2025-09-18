#include "scheduler.h"
#include "signal.h"
#include <iostream>
#include <cassert>
#include <exception>

using namespace RTOS;

void test_signal_functionality() {
    std::cout << "=== Signal Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    SignalManager signal_manager;
    
    // Create signal
    uint32_t signal_id = signal_manager.create_signal();
    assert(signal_id != 0);
    
    // Check initial signal state
    assert(!signal_manager.signal_is_set(signal_id));
    std::cout << "Created signal with initial state: " << (signal_manager.signal_is_set(signal_id) ? "SET" : "NOT SET") << std::endl;
    
    // Create test task
    scheduler.create_task(5);
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // Signal wait (should timeout)
    assert(!signal_manager.signal_wait(signal_id, 100));
    
    // Send signal
    signal_manager.signal_send(signal_id);
    assert(signal_manager.signal_is_set(signal_id));
    
    // Reset signal
    signal_manager.signal_reset(signal_id);
    assert(!signal_manager.signal_is_set(signal_id));
    
    // Cleanup
    signal_manager.delete_signal(signal_id);
    signal_manager.delete_signal(999); // Test non-existent signal
    
    std::cout << "Signal functionality test passed!" << std::endl << std::endl;
}

int main() {
    std::cout << "Signal Test" << std::endl;
    std::cout << "===========" << std::endl << std::endl;
    
    try {
        test_signal_functionality();
        std::cout << "Signal test completed successfully!" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Test failed with unknown exception" << std::endl;
        return 1;
    }
    
    return 0;
}