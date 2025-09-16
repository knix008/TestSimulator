#include "timer.h"
#include "scheduler.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <cassert>
#include <atomic>

using namespace RTOS;

// Test data structure
struct TimerTestData {
    std::atomic<int> callback_count{0};
    std::atomic<int> expected_count{0};
    std::string name;
    
    TimerTestData(const std::string& n) : name(n) {}
};

// Test callback functions
void test_callback(uint32_t timer_id, void* user_data) {
    if (user_data) {
        TimerTestData* data = static_cast<TimerTestData*>(user_data);
        data->callback_count++;
        std::cout << "Timer " << timer_id << " (" << data->name 
                  << ") callback executed. Count: " << data->callback_count.load() << std::endl;
    }
}

void periodic_callback(uint32_t timer_id, void* user_data) {
    if (user_data) {
        TimerTestData* data = static_cast<TimerTestData*>(user_data);
        data->callback_count++;
        std::cout << "Periodic Timer " << timer_id << " (" << data->name 
                  << ") callback executed. Count: " << data->callback_count.load() << std::endl;
        
        // Stop after 3 executions
        if (data->callback_count.load() >= 3) {
            std::cout << "Stopping periodic timer after 3 executions" << std::endl;
        }
    }
}

void test_basic_timer_functionality() {
    std::cout << "\n=== Test 1: Basic Timer Functionality ===" << std::endl;
    
    TimerManager manager;
    assert(manager.start_manager());
    
    TimerTestData test_data("Basic Test");
    test_data.expected_count = 1;
    
    // Create one-shot timer
    uint32_t timer_id = manager.create_timer("Basic Timer", TimerType::ONE_SHOT, 
                                            std::chrono::milliseconds(500), 
                                            test_callback, &test_data);
    
    assert(timer_id > 0);
    std::cout << "Created timer with ID: " << timer_id << std::endl;
    
    // Start timer
    assert(manager.start_timer(timer_id));
    std::cout << "Started timer" << std::endl;
    
    // Wait for timer to expire
    std::this_thread::sleep_for(std::chrono::milliseconds(600));
    
    // Verify callback was called
    assert(test_data.callback_count.load() == test_data.expected_count);
    std::cout << "Timer callback executed correctly" << std::endl;
    
    // Cleanup
    assert(manager.delete_timer(timer_id));
    manager.stop_manager();
    
    std::cout << "Basic timer test passed!" << std::endl;
}

void test_periodic_timer() {
    std::cout << "\n=== Test 2: Periodic Timer ===" << std::endl;
    
    TimerManager manager;
    assert(manager.start_manager());
    
    TimerTestData test_data("Periodic Test");
    test_data.expected_count = 3;
    
    // Create periodic timer
    uint32_t timer_id = manager.create_timer("Periodic Timer", TimerType::PERIODIC, 
                                            std::chrono::milliseconds(300), 
                                            periodic_callback, &test_data);
    
    assert(timer_id > 0);
    std::cout << "Created periodic timer with ID: " << timer_id << std::endl;
    
    // Start timer
    assert(manager.start_timer(timer_id));
    std::cout << "Started periodic timer" << std::endl;
    
    // Wait for multiple executions
    std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    
    // Stop timer manually
    assert(manager.stop_timer(timer_id));
    std::cout << "Stopped periodic timer" << std::endl;
    
    // Verify callback was called multiple times
    assert(test_data.callback_count.load() >= 2);
    std::cout << "Periodic timer executed " << test_data.callback_count.load() 
              << " times" << std::endl;
    
    // Cleanup
    assert(manager.delete_timer(timer_id));
    manager.stop_manager();
    
    std::cout << "Periodic timer test passed!" << std::endl;
}

void test_timer_control() {
    std::cout << "\n=== Test 3: Timer Control Operations ===" << std::endl;
    
    TimerManager manager;
    assert(manager.start_manager());
    
    TimerTestData test_data("Control Test");
    
    // Create timer
    uint32_t timer_id = manager.create_timer("Control Timer", TimerType::ONE_SHOT, 
                                            std::chrono::milliseconds(1000), 
                                            test_callback, &test_data);
    
    assert(timer_id > 0);
    std::cout << "Created timer with ID: " << timer_id << std::endl;
    
    // Test start/stop
    assert(manager.start_timer(timer_id));
    std::cout << "Started timer" << std::endl;
    
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    
    assert(manager.stop_timer(timer_id));
    std::cout << "Stopped timer before expiry" << std::endl;
    
    // Verify callback was not called
    assert(test_data.callback_count.load() == 0);
    std::cout << "Timer stopped successfully, no callback executed" << std::endl;
    
    // Test restart
    assert(manager.restart_timer(timer_id));
    std::cout << "Restarted timer" << std::endl;
    
    std::this_thread::sleep_for(std::chrono::milliseconds(1100));
    
    // Verify callback was called after restart
    assert(test_data.callback_count.load() == 1);
    std::cout << "Timer restarted and executed correctly" << std::endl;
    
    // Cleanup
    assert(manager.delete_timer(timer_id));
    manager.stop_manager();
    
    std::cout << "Timer control test passed!" << std::endl;
}

void test_multiple_timers() {
    std::cout << "\n=== Test 4: Multiple Timers ===" << std::endl;
    
    TimerManager manager;
    assert(manager.start_manager());
    
    TimerTestData data1("Timer 1");
    TimerTestData data2("Timer 2");
    TimerTestData data3("Timer 3");
    
    // Create multiple timers with different intervals
    uint32_t timer1 = manager.create_timer("Fast Timer", TimerType::ONE_SHOT, 
                                          std::chrono::milliseconds(200), 
                                          test_callback, &data1);
    uint32_t timer2 = manager.create_timer("Medium Timer", TimerType::ONE_SHOT, 
                                          std::chrono::milliseconds(400), 
                                          test_callback, &data2);
    uint32_t timer3 = manager.create_timer("Slow Timer", TimerType::ONE_SHOT, 
                                          std::chrono::milliseconds(600), 
                                          test_callback, &data3);
    
    assert(timer1 > 0 && timer2 > 0 && timer3 > 0);
    std::cout << "Created 3 timers with IDs: " << timer1 << ", " << timer2 << ", " << timer3 << std::endl;
    
    // Start all timers
    assert(manager.start_timer(timer1));
    assert(manager.start_timer(timer2));
    assert(manager.start_timer(timer3));
    std::cout << "Started all timers" << std::endl;
    
    // Wait for all timers to expire
    std::this_thread::sleep_for(std::chrono::milliseconds(700));
    
    // Verify all callbacks were called
    assert(data1.callback_count.load() == 1);
    assert(data2.callback_count.load() == 1);
    assert(data3.callback_count.load() == 1);
    std::cout << "All timers executed correctly" << std::endl;
    
    // Print timer status
    manager.print_timer_status();
    
    // Cleanup
    assert(manager.delete_timer(timer1));
    assert(manager.delete_timer(timer2));
    assert(manager.delete_timer(timer3));
    manager.stop_manager();
    
    std::cout << "Multiple timers test passed!" << std::endl;
}

void test_independent_timer_manager() {
    std::cout << "\n=== Test 5: Independent Timer Manager ===" << std::endl;
    
    TimerManager timer_manager;
    timer_manager.start_manager();
    
    TimerTestData test_data("Independent Test");
    
    // Create timer through independent timer manager
    uint32_t timer_id = timer_manager.create_timer("Independent Timer", TimerType::ONE_SHOT, 
                                                   std::chrono::milliseconds(300), 
                                                   test_callback, &test_data);
    
    assert(timer_id > 0);
    std::cout << "Created timer through independent timer manager with ID: " << timer_id << std::endl;
    
    // Start timer through timer manager
    assert(timer_manager.start_timer(timer_id));
    std::cout << "Started timer through timer manager" << std::endl;
    
    // Wait for timer to expire
    std::this_thread::sleep_for(std::chrono::milliseconds(400));
    
    // Verify callback was called
    assert(test_data.callback_count.load() == 1);
    std::cout << "Timer executed through independent timer manager correctly" << std::endl;
    
    // Print timer status
    timer_manager.print_timer_status();
    
    // Cleanup
    assert(timer_manager.delete_timer(timer_id));
    timer_manager.stop_manager();
    
    std::cout << "Independent timer manager test passed!" << std::endl;
}

void test_timer_query_functions() {
    std::cout << "\n=== Test 6: Timer Query Functions ===" << std::endl;
    
    TimerManager manager;
    assert(manager.start_manager());
    
    TimerTestData data1("Query Test 1");
    TimerTestData data2("Query Test 2");
    
    // Create timers
    uint32_t timer1 = manager.create_timer("Query Timer 1", TimerType::ONE_SHOT, 
                                          std::chrono::milliseconds(500), 
                                          test_callback, &data1);
    uint32_t timer2 = manager.create_timer("Query Timer 2", TimerType::PERIODIC, 
                                          std::chrono::milliseconds(200), 
                                          test_callback, &data2);
    
    assert(timer1 > 0 && timer2 > 0);
    
    // Suppress unused variable warning
    (void)timer2;
    
    // Test query functions
    assert(manager.get_timer_count() == 2);
    assert(manager.get_running_timer_count() == 0);
    
    std::cout << "Total timers: " << manager.get_timer_count() << std::endl;
    std::cout << "Running timers: " << manager.get_running_timer_count() << std::endl;
    
    // Start one timer
    assert(manager.start_timer(timer1));
    assert(manager.get_running_timer_count() == 1);
    
    std::cout << "Running timers after starting one: " << manager.get_running_timer_count() << std::endl;
    
    // Test get_timer function
    auto timer = manager.get_timer(timer1);
    assert(timer != nullptr);
    assert(timer->get_id() == timer1);
    assert(timer->get_name() == "Query Timer 1");
    
    std::cout << "Retrieved timer: " << timer->to_string() << std::endl;
    
    // Test get_all_timers
    auto all_timers = manager.get_all_timers();
    assert(all_timers.size() == 2);
    
    // Test get_running_timers
    auto running_timers = manager.get_running_timers();
    assert(running_timers.size() == 1);
    
    std::cout << "All timers count: " << all_timers.size() << std::endl;
    std::cout << "Running timers count: " << running_timers.size() << std::endl;
    
    // Wait for timer to expire
    std::this_thread::sleep_for(std::chrono::milliseconds(600));
    
    // Cleanup
    assert(manager.delete_timer(timer1));
    assert(manager.delete_timer(timer2));
    manager.stop_manager();
    
    std::cout << "Timer query functions test passed!" << std::endl;
}

int main() {
    std::cout << "RTOS Timer Test Suite" << std::endl;
    std::cout << "====================" << std::endl;
    
    try {
        test_basic_timer_functionality();
        test_periodic_timer();
        test_timer_control();
        test_multiple_timers();
        test_independent_timer_manager();
        test_timer_query_functions();
        
        std::cout << "\n====================" << std::endl;
        std::cout << "All timer tests passed!" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}
