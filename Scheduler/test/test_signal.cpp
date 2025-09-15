#include "scheduler.h"
#include "signal.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_signal_functionality() {
    std::cout << "=== Signal Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Create signal
    uint32_t signal_id = SignalManager::create_signal(&scheduler);
    assert(signal_id != 0);
    
    // Check initial signal state
    assert(!SignalManager::signal_is_set(&scheduler, signal_id));
    std::cout << "Created signal with initial state: " << (SignalManager::signal_is_set(&scheduler, signal_id) ? "SET" : "NOT SET") << std::endl;
    
    // Create test task
    scheduler.create_task(5);
    auto task = scheduler.get_next_task();
    scheduler.set_current_task(task);
    
    // Signal wait (should timeout)
    assert(!SignalManager::signal_wait(&scheduler, signal_id, 100));
    
    // Send signal
    SignalManager::signal_send(&scheduler, signal_id);
    assert(SignalManager::signal_is_set(&scheduler, signal_id));
    
    // Reset signal
    SignalManager::signal_reset(&scheduler, signal_id);
    assert(!SignalManager::signal_is_set(&scheduler, signal_id));
    
    // Cleanup
    SignalManager::delete_signal(&scheduler, signal_id);
    SignalManager::delete_signal(&scheduler, 999); // Test non-existent signal
    
    std::cout << "Signal functionality test passed!" << std::endl << std::endl;
}