#include "scheduler.h"
#include <iostream>
#include <cassert>

using namespace RTOS;

void test_basic_functionality() {
    std::cout << "=== Basic Functionality Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Create tasks
    uint32_t task1 = scheduler.create_task(0);
    uint32_t task2 = scheduler.create_task(0);
    uint32_t task3 = scheduler.create_task(5);
    uint32_t task4 = scheduler.create_task(10);
    
    std::cout << "Created tasks: " << task1 << ", " << task2 << ", " << task3 << ", " << task4 << std::endl;
    
    // Check highest priority
    uint8_t highest_priority = scheduler.get_highest_ready_priority();
    std::cout << "Highest priority: " << (int)highest_priority << std::endl;
    assert(highest_priority == 0);
    
    // Check task count by priority
    size_t priority_0_count = scheduler.get_task_count(0);
    size_t priority_5_count = scheduler.get_task_count(5);
    size_t priority_10_count = scheduler.get_task_count(10);
    size_t total_tasks = scheduler.get_total_task_count();
    
    std::cout << "Task counts - Priority 0: " << priority_0_count 
              << ", Priority 5: " << priority_5_count 
              << ", Priority 10: " << priority_10_count 
              << ", Total: " << total_tasks << std::endl;
    
    assert(priority_0_count == 2);
    assert(priority_5_count == 1);
    assert(priority_10_count == 1);
    assert(total_tasks == 4);
    
    std::cout << "Basic functionality test passed!" << std::endl << std::endl;
}

void test_priority_ordering() {
    std::cout << "=== Priority Ordering Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Create tasks with different priorities
    uint32_t task1 = scheduler.create_task(15);
    uint32_t task2 = scheduler.create_task(3);
    uint32_t task3 = scheduler.create_task(7);
    uint32_t task4 = scheduler.create_task(1);
    uint32_t task5 = scheduler.create_task(12);
    uint32_t task6 = scheduler.create_task(0);
    uint32_t task7 = scheduler.create_task(8);
    uint32_t task8 = scheduler.create_task(2);
    
    std::cout << "Created task " << task1 << " with priority 15" << std::endl;
    std::cout << "Created task " << task2 << " with priority 3" << std::endl;
    std::cout << "Created task " << task3 << " with priority 7" << std::endl;
    std::cout << "Created task " << task4 << " with priority 1" << std::endl;
    std::cout << "Created task " << task5 << " with priority 12" << std::endl;
    std::cout << "Created task " << task6 << " with priority 0" << std::endl;
    std::cout << "Created task " << task7 << " with priority 8" << std::endl;
    std::cout << "Created task " << task8 << " with priority 2" << std::endl;
    
    // Execute tasks in priority order
    uint8_t expected_priorities[] = {0, 1, 2, 3, 7, 8, 12, 15};
    for (int i = 0; i < 8; i++) {
        auto task = scheduler.get_next_task();
        assert(task != nullptr);
        std::cout << "Got task " << task->get_id() << " with priority " << (int)task->get_priority() << std::endl;
        assert(task->get_priority() == expected_priorities[i]);
    }
    
    std::cout << "Priority ordering test passed!" << std::endl << std::endl;
}

void test_bitmap_optimization() {
    std::cout << "=== Bitmap Optimization Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Check initial bitmap state
    scheduler.print_priority_bitmap();
    
    // Create tasks at specific priorities
    scheduler.create_task(0);
    scheduler.create_task(7);
    scheduler.create_task(15);
    scheduler.create_task(31);
    scheduler.create_task(63);
    scheduler.create_task(127);
    
    std::cout << "After creating tasks at priorities 0, 7, 15, 31, 63, 127:" << std::endl;
    scheduler.print_priority_bitmap();
    
    // Check highest priority
    uint8_t highest = scheduler.get_highest_ready_priority();
    std::cout << "Highest priority found: " << (int)highest << std::endl;
    assert(highest == 0);
    
    // Remove highest priority task
    auto task = scheduler.get_next_task();
    assert(task != nullptr);
    assert(task->get_priority() == 0);
    scheduler.remove_task(task->get_id());
    
    std::cout << "After removing highest priority task:" << std::endl;
    scheduler.print_priority_bitmap();
    
    // Check new highest priority
    uint8_t new_highest = scheduler.get_highest_ready_priority();
    std::cout << "New highest priority: " << (int)new_highest << std::endl;
    assert(new_highest == 7);
    
    std::cout << "Bitmap optimization test passed!" << std::endl << std::endl;
}

void test_task_removal() {
    std::cout << "=== Task Removal Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Create tasks
    scheduler.create_task(5);
    uint32_t task2 = scheduler.create_task(5);
    scheduler.create_task(5);
    scheduler.create_task(10);
    
    std::cout << "Created 4 tasks" << std::endl;
    
    // Remove task 2
    bool removed = scheduler.remove_task(task2);
    assert(removed);
    std::cout << "Removed task " << task2 << std::endl;
    
    // Execute remaining tasks
    std::cout << "Executing remaining tasks:" << std::endl;
    while (auto task = scheduler.get_next_task()) {
        std::cout << "Executing task " << task->get_id() << " with priority " << (int)task->get_priority() << std::endl;
    }
    
    std::cout << "Task removal test passed!" << std::endl << std::endl;
}

void test_edge_cases() {
    std::cout << "=== Edge Cases Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Test invalid priority task creation
    uint32_t invalid_task = scheduler.create_task(255); // Invalid priority
    assert(invalid_task == 0);
    std::cout << "Invalid priority tests passed" << std::endl;
    
    // Test empty scheduler
    auto no_task = scheduler.get_next_task();
    assert(no_task == nullptr);
    std::cout << "Empty scheduler tests passed" << std::endl;
    
    // Test maximum priority
    uint32_t max_priority_task = scheduler.create_task(127);
    assert(max_priority_task != 0);
    auto task = scheduler.get_next_task();
    assert(task->get_priority() == 127);
    std::cout << "Maximum priority test passed" << std::endl;
    
    std::cout << "Edge cases test passed!" << std::endl << std::endl;
}

void performance_test() {
    std::cout << "=== Performance Test ===" << std::endl;
    
    PriorityScheduler scheduler;
    
    // Create 1000 tasks
    for (int i = 0; i < 1000; i++) {
        uint8_t priority = i % 128;
        scheduler.create_task(priority);
    }
    
    std::cout << "Created 1000 tasks" << std::endl;
    
    // Execute all tasks in priority order
    int executed_count = 0;
    while (auto task = scheduler.get_next_task()) {
        executed_count++;
    }
    
    std::cout << "Executed " << executed_count << " tasks in priority order" << std::endl;
    assert(executed_count == 1000);
    
    std::cout << "Performance test passed!" << std::endl << std::endl;
}