#include <iostream>
#include <cassert>
#include <chrono>
#include <thread>
#include <atomic>
#include "clock.h"
#include "timer.h"

using namespace RTOS;

// Test data structure
struct TimingTestData {
    std::atomic<int> callback_count{0};
    std::string test_name;
    
    TimingTestData(const std::string& name) : test_name(name) {}
};

// Timer callback function
void timing_test_callback(uint32_t timer_id, void* user_data) {
    if (user_data) {
        TimingTestData* data = static_cast<TimingTestData*>(user_data);
        data->callback_count++;
        std::cout << "Timer " << timer_id << " expired in " << data->test_name 
                  << " test! Count: " << data->callback_count.load() << std::endl;
    }
}

void test_realtime_clock() {
    std::cout << "\n=== Test 1: Realtime Clock ===" << std::endl;
    
    RealtimeClock clock;
    
    // Test basic functionality
    assert(!clock.is_tick_based());
    assert(clock.get_tick_count() == 0);
    assert(clock.get_tick_interval().count() == 0);
    
    clock.start();
    assert(clock.is_running());
    
    // Test timing accuracy
    auto start_time = clock.get_current_time();
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    auto end_time = clock.get_current_time();
    
    auto elapsed = end_time - start_time;
    std::cout << "Realtime elapsed: " << elapsed.count() << "ms" << std::endl;
    assert(elapsed.count() >= 90 && elapsed.count() <= 150); // Allow some tolerance
    
    clock.stop();
    assert(!clock.is_running());
    
    std::cout << "Realtime clock test passed!" << std::endl;
}

void test_tick_based_clock() {
    std::cout << "\n=== Test 2: Tick-based Clock ===" << std::endl;
    
    TickBasedClock clock(std::chrono::milliseconds(10)); // 10ms per tick
    
    // Test basic functionality
    assert(clock.is_tick_based());
    assert(clock.get_tick_interval().count() == 10);
    
    clock.start();
    assert(clock.is_running());
    
    // Wait for some ticks
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    
    uint64_t tick_count = clock.get_tick_count();
    std::cout << "Tick count after 50ms: " << tick_count << std::endl;
    assert(tick_count >= 4 && tick_count <= 6); // Allow some tolerance
    
    // Test timing accuracy
    auto start_time = clock.get_current_time();
    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    auto end_time = clock.get_current_time();
    
    auto elapsed = end_time - start_time;
    std::cout << "Tick-based elapsed: " << elapsed.count() << "ms" << std::endl;
    assert(elapsed.count() >= 20 && elapsed.count() <= 40); // Allow some tolerance
    
    clock.stop();
    assert(!clock.is_running());
    
    std::cout << "Tick-based clock test passed!" << std::endl;
}

void test_timer_with_realtime_timing() {
    std::cout << "\n=== Test 3: Timer with Realtime Timing ===" << std::endl;
    
    TimerManager timer_manager;
    
    // Use realtime clock (default)
    TimingTestData test_data("Realtime");
    
    uint32_t timer_id = timer_manager.create_timer("Realtime Test", TimerType::ONE_SHOT, 
                                                   std::chrono::milliseconds(200), 
                                                   timing_test_callback, &test_data);
    
    assert(timer_id > 0);
    assert(!timer_manager.is_tick_based());
    
    timer_manager.start_manager();
    assert(timer_manager.start_timer(timer_id));
    
    // Wait for timer to expire
    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    
    assert(test_data.callback_count.load() == 1);
    std::cout << "Realtime timer executed correctly" << std::endl;
    
    timer_manager.stop_manager();
    timer_manager.delete_timer(timer_id);
    
    std::cout << "Timer with realtime timing test passed!" << std::endl;
}

void test_timer_with_tick_based_timing() {
    std::cout << "\n=== Test 4: Timer with Tick-based Timing ===" << std::endl;
    
    TimerManager timer_manager;
    
    // Set tick-based clock
    auto tick_clock = std::make_unique<TickBasedClock>(std::chrono::milliseconds(5)); // 5ms per tick
    timer_manager.set_clock(std::move(tick_clock));
    
    TimingTestData test_data("Tick-based");
    
    uint32_t timer_id = timer_manager.create_timer("Tick Test", TimerType::ONE_SHOT, 
                                                   std::chrono::milliseconds(50), // 10 ticks
                                                   timing_test_callback, &test_data);
    
    assert(timer_id > 0);
    assert(timer_manager.is_tick_based());
    assert(timer_manager.get_tick_interval().count() == 5);
    
    timer_manager.start_manager();
    assert(timer_manager.start_timer(timer_id));
    
    // Wait for timer to expire
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    
    assert(test_data.callback_count.load() == 1);
    std::cout << "Tick-based timer executed correctly" << std::endl;
    
    timer_manager.stop_manager();
    timer_manager.delete_timer(timer_id);
    
    std::cout << "Timer with tick-based timing test passed!" << std::endl;
}

void test_timing_provider_switching() {
    std::cout << "\n=== Test 5: Timing Provider Switching ===" << std::endl;
    
    TimerManager timer_manager;
    
    // Start with realtime timing
    TimingTestData realtime_data("Realtime Switch");
    uint32_t realtime_timer = timer_manager.create_timer("Realtime Switch", TimerType::ONE_SHOT, 
                                                         std::chrono::milliseconds(100), 
                                                         timing_test_callback, &realtime_data);
    
    timer_manager.start_manager();
    assert(timer_manager.start_timer(realtime_timer));
    
    // Wait a bit
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    
    // Switch to tick-based clock
    auto tick_clock = std::make_unique<TickBasedClock>(std::chrono::milliseconds(10));
    timer_manager.set_clock(std::move(tick_clock));
    
    assert(timer_manager.is_tick_based());
    
    // Create new timer with tick-based timing
    TimingTestData tick_data("Tick Switch");
    uint32_t tick_timer = timer_manager.create_timer("Tick Switch", TimerType::ONE_SHOT, 
                                                     std::chrono::milliseconds(50), 
                                                     timing_test_callback, &tick_data);
    
    assert(timer_manager.start_timer(tick_timer));
    
    // Wait for both timers to expire
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    
    assert(realtime_data.callback_count.load() == 1);
    assert(tick_data.callback_count.load() == 1);
    
    std::cout << "Both timing providers worked correctly" << std::endl;
    
    timer_manager.stop_manager();
    timer_manager.delete_timer(realtime_timer);
    timer_manager.delete_timer(tick_timer);
    
    std::cout << "Timing provider switching test passed!" << std::endl;
}

void test_periodic_timer_with_tick_timing() {
    std::cout << "\n=== Test 6: Periodic Timer with Tick Timing ===" << std::endl;
    
    TimerManager timer_manager;
    
    // Use tick-based clock with 20ms per tick
    auto tick_clock = std::make_unique<TickBasedClock>(std::chrono::milliseconds(20));
    timer_manager.set_clock(std::move(tick_clock));
    
    TimingTestData test_data("Periodic Tick");
    
    uint32_t timer_id = timer_manager.create_timer("Periodic Tick", TimerType::PERIODIC, 
                                                   std::chrono::milliseconds(100), // 5 ticks
                                                   timing_test_callback, &test_data);
    
    timer_manager.start_manager();
    assert(timer_manager.start_timer(timer_id));
    
    // Wait for multiple periods
    std::this_thread::sleep_for(std::chrono::milliseconds(350));
    
    // Should have executed at least 3 times
    assert(test_data.callback_count.load() >= 3);
    std::cout << "Periodic tick timer executed " << test_data.callback_count.load() << " times" << std::endl;
    
    timer_manager.stop_timer(timer_id);
    timer_manager.stop_manager();
    timer_manager.delete_timer(timer_id);
    
    std::cout << "Periodic timer with tick timing test passed!" << std::endl;
}

int main() {
    std::cout << "RTOS Timing System Test Suite" << std::endl;
    std::cout << "==============================" << std::endl;
    
    try {
        test_realtime_clock();
        test_tick_based_clock();
        test_timer_with_realtime_timing();
        test_timer_with_tick_based_timing();
        test_timing_provider_switching();
        test_periodic_timer_with_tick_timing();
        
        std::cout << "\n==============================" << std::endl;
        std::cout << "All timing system tests passed!" << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "Test failed with exception: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}
