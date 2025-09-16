#include <iostream>
#include <cassert>
#include <chrono>
#include <thread>
#include <atomic>
#include "timer_task.h"
#include "scheduler.h"

using namespace RTOS;

// Test data structure
struct TimerTaskTestData {
    std::atomic<int> callback_count{0};
    std::string test_name;
    
    TimerTaskTestData(const std::string& name) : test_name(name) {}
};

// Timer callback function
void timer_task_test_callback(uint32_t timer_id, void* user_data) {
    if (user_data) {
        TimerTaskTestData* data = static_cast<TimerTaskTestData*>(user_data);
        data->callback_count++;
        std::cout << "Timer " << timer_id << " expired in " << data->test_name 
                  << " test! Count: " << data->callback_count.load() << std::endl;
    }
}

void test_timer_task_basic_functionality() {
    std::cout << "\n=== Test 1: Timer Task Basic Functionality ===" << std::endl;
    
    // Create scheduler and timer task
    auto scheduler = std::make_shared<PriorityScheduler>();
    TaskBasedTimerManager timer_manager(scheduler, 0); // High priority
    
    TimerTaskTestData test_data("Basic");
    
    // Create timer
    uint32_t timer_id = timer_manager.create_timer("Basic Test", TimerType::ONE_SHOT, 
                                                  std::chrono::milliseconds(300), 
                                                  timer_task_test_callback, &test_data);
    
    assert(timer_id > 0);
    std::cout << "Created timer with ID: " << timer_id << std::endl;
    
    // Start timer manager (starts timer task in scheduler)
    assert(timer_manager.start_manager());
    assert(timer_manager.is_running());
    
    // Start timer
    assert(timer_manager.start_timer(timer_id));
    std::cout << "Started timer" << std::endl;
    
    // Run scheduler to execute timer task
    std::cout << "Running scheduler..." << std::endl;
    auto start_time = std::chrono::steady_clock::now();
    
    while (test_data.callback_count.load() == 0 && 
           std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now() - start_time).count() < 1000) {
        
        auto task = scheduler->get_next_task();
        if (task) {
            std::cout << "Executing task " << task->get_id() << " with priority " 
                      << (int)task->get_priority() << std::endl;
            // Execute the task (TimerTask)
            task->execute();
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
    
    // Verify callback was called
    assert(test_data.callback_count.load() == 1);
    std::cout << "Timer executed correctly" << std::endl;
    
    // Cleanup
    timer_manager.stop_manager();
    timer_manager.delete_timer(timer_id);
    
    std::cout << "Timer task basic functionality test passed!" << std::endl;
}

void test_timer_task_periodic() {
    std::cout << "\n=== Test 2: Timer Task Periodic Timer ===" << std::endl;
    
    auto scheduler = std::make_shared<PriorityScheduler>();
    TaskBasedTimerManager timer_manager(scheduler, 0);
    
    TimerTaskTestData test_data("Periodic");
    
    // Create periodic timer
    uint32_t timer_id = timer_manager.create_timer("Periodic Test", TimerType::PERIODIC, 
                                                  std::chrono::milliseconds(200), 
                                                  timer_task_test_callback, &test_data);
    
    timer_manager.start_manager();
    assert(timer_manager.start_timer(timer_id));
    
    // Run scheduler for multiple periods
    std::cout << "Running scheduler for periodic timer..." << std::endl;
    auto start_time = std::chrono::steady_clock::now();
    
    while (std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now() - start_time).count() < 800) {
        
        auto task = scheduler->get_next_task();
        if (task) {
            task->execute();
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
    
    // Should have executed multiple times
    assert(test_data.callback_count.load() >= 3);
    std::cout << "Periodic timer executed " << test_data.callback_count.load() << " times" << std::endl;
    
    timer_manager.stop_timer(timer_id);
    timer_manager.stop_manager();
    timer_manager.delete_timer(timer_id);
    
    std::cout << "Timer task periodic test passed!" << std::endl;
}

void test_timer_task_multiple_timers() {
    std::cout << "\n=== Test 3: Timer Task Multiple Timers ===" << std::endl;
    
    auto scheduler = std::make_shared<PriorityScheduler>();
    TaskBasedTimerManager timer_manager(scheduler, 0);
    
    TimerTaskTestData test_data("Multiple");
    
    // Create multiple timers
    uint32_t timer1 = timer_manager.create_timer("Timer 1", TimerType::ONE_SHOT, 
                                                std::chrono::milliseconds(200), 
                                                timer_task_test_callback, &test_data);
    uint32_t timer2 = timer_manager.create_timer("Timer 2", TimerType::ONE_SHOT, 
                                                std::chrono::milliseconds(400), 
                                                timer_task_test_callback, &test_data);
    uint32_t timer3 = timer_manager.create_timer("Timer 3", TimerType::ONE_SHOT, 
                                                std::chrono::milliseconds(600), 
                                                timer_task_test_callback, &test_data);
    
    assert(timer1 > 0 && timer2 > 0 && timer3 > 0);
    std::cout << "Created 3 timers with IDs: " << timer1 << ", " << timer2 << ", " << timer3 << std::endl;
    
    timer_manager.start_manager();
    assert(timer_manager.start_timer(timer1));
    assert(timer_manager.start_timer(timer2));
    assert(timer_manager.start_timer(timer3));
    
    // Run scheduler
    std::cout << "Running scheduler for multiple timers..." << std::endl;
    auto start_time = std::chrono::steady_clock::now();
    
    while (test_data.callback_count.load() < 3 && 
           std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now() - start_time).count() < 1000) {
        
        auto task = scheduler->get_next_task();
        if (task) {
            task->execute();
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
    
    assert(test_data.callback_count.load() == 3);
    std::cout << "All timers executed correctly" << std::endl;
    
    timer_manager.stop_manager();
    timer_manager.delete_timer(timer1);
    timer_manager.delete_timer(timer2);
    timer_manager.delete_timer(timer3);
    
    std::cout << "Timer task multiple timers test passed!" << std::endl;
}

void test_timer_task_with_tick_timing() {
    std::cout << "\n=== Test 4: Timer Task with Tick-based Timing ===" << std::endl;
    
    auto scheduler = std::make_shared<PriorityScheduler>();
    TaskBasedTimerManager timer_manager(scheduler, 0);
    
    // Set tick-based timing provider
    auto tick_provider = std::make_unique<TickBasedTimingProvider>(std::chrono::milliseconds(10));
    timer_manager.set_timing_provider(std::move(tick_provider));
    
    TimerTaskTestData test_data("Tick-based");
    
    uint32_t timer_id = timer_manager.create_timer("Tick Test", TimerType::ONE_SHOT, 
                                                  std::chrono::milliseconds(50), // 5 ticks
                                                  timer_task_test_callback, &test_data);
    
    assert(timer_manager.is_tick_based());
    std::cout << "Using tick-based timing with " << timer_manager.get_tick_interval().count() << "ms per tick" << std::endl;
    
    timer_manager.start_manager();
    assert(timer_manager.start_timer(timer_id));
    
    // Run scheduler
    std::cout << "Running scheduler with tick-based timing..." << std::endl;
    auto start_time = std::chrono::steady_clock::now();
    
    while (test_data.callback_count.load() == 0 && 
           std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now() - start_time).count() < 200) {
        
        auto task = scheduler->get_next_task();
        if (task) {
            task->execute();
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
    
    assert(test_data.callback_count.load() == 1);
    std::cout << "Tick-based timer executed correctly" << std::endl;
    std::cout << "Total ticks: " << timer_manager.get_tick_count() << std::endl;
    
    timer_manager.stop_manager();
    timer_manager.delete_timer(timer_id);
    
    std::cout << "Timer task with tick-based timing test passed!" << std::endl;
}

void test_timer_task_with_other_tasks() {
    std::cout << "\n=== Test 5: Timer Task with Other Tasks ===" << std::endl;
    
    auto scheduler = std::make_shared<PriorityScheduler>();
    TaskBasedTimerManager timer_manager(scheduler, 1); // Medium priority
    
    // Create other tasks
    uint32_t high_priority_task = scheduler->create_task(0); // Higher priority
    uint32_t low_priority_task = scheduler->create_task(2);  // Lower priority
    
    // Suppress unused variable warnings
    (void)high_priority_task;
    (void)low_priority_task;
    
    TimerTaskTestData test_data("Mixed");
    
    uint32_t timer_id = timer_manager.create_timer("Mixed Test", TimerType::ONE_SHOT, 
                                                  std::chrono::milliseconds(300), 
                                                  timer_task_test_callback, &test_data);
    
    timer_manager.start_manager();
    assert(timer_manager.start_timer(timer_id));
    
    // Run scheduler with mixed tasks
    std::cout << "Running scheduler with mixed tasks..." << std::endl;
    auto start_time = std::chrono::steady_clock::now();
    
    while (test_data.callback_count.load() == 0 && 
           std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now() - start_time).count() < 1000) {
        
        auto task = scheduler->get_next_task();
        if (task) {
            std::cout << "Executing task " << task->get_id() << " with priority " 
                      << (int)task->get_priority() << std::endl;
            task->execute();
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
    
    assert(test_data.callback_count.load() == 1);
    std::cout << "Timer task worked correctly with other tasks" << std::endl;
    
    timer_manager.stop_manager();
    timer_manager.delete_timer(timer_id);
    
    std::cout << "Timer task with other tasks test passed!" << std::endl;
}

int main() {
    std::cout << "RTOS Timer Task Test Suite" << std::endl;
    std::cout << "==========================" << std::endl;
    
    try {
        test_timer_task_basic_functionality();
        test_timer_task_periodic();
        test_timer_task_multiple_timers();
        test_timer_task_with_tick_timing();
        test_timer_task_with_other_tasks();
        
        std::cout << "\n==========================" << std::endl;
        std::cout << "All timer task tests passed!" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}
