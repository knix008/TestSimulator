#include "timer.h"
#include "clock.h"
#include "platform.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Test result tracking
typedef struct {
    int total;
    int passed;
    int failed;
} TestResults;

// Global variables for callback testing
static int callback_count = 0;
static uint32_t last_timer_id = 0;
static void* last_user_data = NULL;

void print_test_result(TestResults* results, const char* test_name, bool passed) {
    results->total++;
    if (passed) {
        results->passed++;
        printf("✅PASS: %s\n", test_name);
    } else {
        results->failed++;
        printf("❌FAIL: %s\n", test_name);
    }
}

void test_timer_callback(uint32_t timer_id, void* user_data) {
    callback_count++;
    last_timer_id = timer_id;
    last_user_data = user_data;
    printf("  Timer %u callback executed (count: %d)\n", timer_id, callback_count);
}

void test_timer_manager_basic_operations(TestResults* results) {
    printf("\n=== Timer Manager Basic Operations Tests ===\n");
    
    // Test 1: Timer manager creation
    TimerManager* manager = timer_manager_create();
    bool test1 = (manager != NULL);
    print_test_result(results, "Timer manager creation", test1);
    
    if (!manager) return;
    
    // Test 2: Initial state
    bool test2 = (!timer_manager_is_running(manager) && 
                  timer_manager_get_timer_count(manager) == 0);
    print_test_result(results, "Initial manager state", test2);
    
    // Test 3: Start manager
    bool test3 = timer_manager_start(manager);
    print_test_result(results, "Start timer manager", test3);
    
    // Test 4: Manager running state
    bool test4 = timer_manager_is_running(manager);
    print_test_result(results, "Manager running state", test4);
    
    // Test 5: Stop manager
    bool test5 = timer_manager_stop(manager);
    print_test_result(results, "Stop timer manager", test5);
    
    // Test 6: Manager stopped state
    bool test6 = !timer_manager_is_running(manager);
    print_test_result(results, "Manager stopped state", test6);
    
    timer_manager_destroy(manager);
}

void test_timer_creation_and_properties(TestResults* results) {
    printf("\n=== Timer Creation and Properties Tests ===\n");
    
    TimerManager* manager = timer_manager_create();
    if (!manager) return;
    
    timer_manager_start(manager);
    
    // Test 1: Create one-shot timer
    uint32_t oneshot_timer = timer_manager_create_timer(manager, "OneShot Test", 
                                                       TIMER_ONE_SHOT, 100, 
                                                       test_timer_callback, NULL);
    bool test1 = (oneshot_timer != 0);
    print_test_result(results, "Create one-shot timer", test1);
    
    // Test 2: Create periodic timer
    uint32_t periodic_timer = timer_manager_create_timer(manager, "Periodic Test", 
                                                        TIMER_PERIODIC, 50, 
                                                        test_timer_callback, NULL);
    bool test2 = (periodic_timer != 0);
    print_test_result(results, "Create periodic timer", test2);
    
    // Test 3: Timer count updated
    bool test3 = (timer_manager_get_timer_count(manager) == 2);
    print_test_result(results, "Timer count updated", test3);
    
    // Test 4: Get timer properties
    Timer* timer = timer_manager_get_timer(manager, oneshot_timer);
    bool test4 = (timer != NULL && 
                  strcmp(timer_get_name(timer), "OneShot Test") == 0 &&
                  timer_get_type(timer) == TIMER_ONE_SHOT &&
                  timer_get_interval(timer) == 100);
    print_test_result(results, "Timer properties verification", test4);
    
    // Test 5: Timer initial state
    bool test5 = (timer_get_state(timer) == TIMER_STOPPED && 
                  !timer_is_running(timer));
    print_test_result(results, "Timer initial state", test5);
    
    // Test 6: Delete timer
    bool test6 = timer_manager_delete_timer(manager, oneshot_timer);
    print_test_result(results, "Delete timer", test6);
    
    // Test 7: Timer count after deletion
    bool test7 = (timer_manager_get_timer_count(manager) == 1);
    print_test_result(results, "Timer count after deletion", test7);
    
    timer_manager_stop(manager);
    timer_manager_destroy(manager);
}

void test_timer_execution_and_callbacks(TestResults* results) {
    printf("\n=== Timer Execution and Callbacks Tests ===\n");
    
    TimerManager* manager = timer_manager_create();
    if (!manager) return;
    
    timer_manager_start(manager);
    
    // Test 1: One-shot timer execution
    callback_count = 0;
    int user_data = 42;
    uint32_t oneshot_timer = timer_manager_create_timer(manager, "OneShot", 
                                                       TIMER_ONE_SHOT, 80, 
                                                       test_timer_callback, &user_data);
    
    timer_manager_start_timer(manager, oneshot_timer);
    platform_sleep_ms(120); // Wait for execution
    
    bool test1 = (callback_count == 1 && last_timer_id == oneshot_timer);
    print_test_result(results, "One-shot timer execution", test1);
    
    // Test 2: User data passed correctly
    bool test2 = (last_user_data == &user_data);
    print_test_result(results, "User data passed correctly", test2);
    
    // Test 3: One-shot timer stopped after execution
    Timer* timer = timer_manager_get_timer(manager, oneshot_timer);
    bool test3 = (timer && !timer_is_running(timer));
    print_test_result(results, "One-shot timer stopped after execution", test3);
    
    // Test 4: Periodic timer execution
    callback_count = 0;
    uint32_t periodic_timer = timer_manager_create_timer(manager, "Periodic", 
                                                        TIMER_PERIODIC, 40, 
                                                        test_timer_callback, NULL);
    
    timer_manager_start_timer(manager, periodic_timer);
    platform_sleep_ms(130); // Should trigger ~3 callbacks
    
    bool test4 = (callback_count >= 3);
    print_test_result(results, "Periodic timer multiple executions", test4);
    
    // Test 5: Periodic timer still running
    timer = timer_manager_get_timer(manager, periodic_timer);
    bool test5 = (timer && timer_is_running(timer));
    print_test_result(results, "Periodic timer still running", test5);
    
    // Test 6: Stop periodic timer
    bool test6 = timer_manager_stop_timer(manager, periodic_timer);
    print_test_result(results, "Stop periodic timer", test6);
    
    // Test 7: Timer stopped
    bool test7 = (timer && !timer_is_running(timer));
    print_test_result(results, "Periodic timer stopped", test7);
    
    timer_manager_stop(manager);
    timer_manager_destroy(manager);
}

void test_timer_control_operations(TestResults* results) {
    printf("\n=== Timer Control Operations Tests ===\n");
    
    TimerManager* manager = timer_manager_create();
    if (!manager) return;
    
    timer_manager_start(manager);
    
    uint32_t timer_id = timer_manager_create_timer(manager, "Control Test", 
                                                  TIMER_PERIODIC, 100, 
                                                  test_timer_callback, NULL);
    
    // Test 1: Start timer
    bool test1 = timer_manager_start_timer(manager, timer_id);
    print_test_result(results, "Start timer", test1);
    
    // Test 2: Timer running
    Timer* timer = timer_manager_get_timer(manager, timer_id);
    bool test2 = (timer && timer_is_running(timer));
    print_test_result(results, "Timer running after start", test2);
    
    // Test 3: Stop timer
    bool test3 = timer_manager_stop_timer(manager, timer_id);
    print_test_result(results, "Stop timer", test3);
    
    // Test 4: Timer stopped
    bool test4 = (timer && !timer_is_running(timer));
    print_test_result(results, "Timer stopped after stop", test4);
    
    // Test 5: Restart timer
    bool test5 = timer_manager_restart_timer(manager, timer_id);
    print_test_result(results, "Restart timer", test5);
    
    // Test 6: Timer running after restart
    bool test6 = (timer && timer_is_running(timer));
    print_test_result(results, "Timer running after restart", test6);
    
    // Test 7: Reset timer
    bool test7 = timer_manager_reset_timer(manager, timer_id);
    print_test_result(results, "Reset timer", test7);
    
    timer_manager_stop(manager);
    timer_manager_destroy(manager);
}

void test_timer_clock_integration(TestResults* results) {
    printf("\n=== Timer Clock Integration Tests ===\n");
    
    TimerManager* manager = timer_manager_create();
    if (!manager) return;
    
    // Test 1: Default clock (should be realtime)
    IClock* default_clock = timer_manager_get_clock(manager);
    bool test1 = (default_clock != NULL && !timer_manager_is_tick_based(manager));
    print_test_result(results, "Default realtime clock", test1);
    
    // Test 2: Set tick-based clock
    TickBasedClock* tick_clock = tick_based_clock_create(20); // 20ms ticks
    if (tick_clock) {
        timer_manager_set_clock(manager, (IClock*)tick_clock);
        bool test2 = timer_manager_is_tick_based(manager);
        print_test_result(results, "Set tick-based clock", test2);
        
        // Test 3: Tick interval
        uint32_t interval = timer_manager_get_tick_interval(manager);
        bool test3 = (interval == 20);
        print_test_result(results, "Tick interval verification", test3);
        
        // Test 4: Start tick clock and check tick progression
        timer_manager_start(manager);
        tick_based_clock_start((IClock*)tick_clock);
        
        uint64_t ticks1 = timer_manager_get_tick_count(manager);
        platform_sleep_ms(50); // Should advance ~2-3 ticks
        uint64_t ticks2 = timer_manager_get_tick_count(manager);
        
        bool test4 = (ticks2 > ticks1);
        print_test_result(results, "Tick progression with timer manager", test4);
        
        tick_based_clock_stop((IClock*)tick_clock);
        timer_manager_stop(manager);
    }
    
    timer_manager_destroy(manager);
}

void test_timer_error_handling(TestResults* results) {
    printf("\n=== Timer Error Handling Tests ===\n");
    
    // Test 1: NULL timer manager operations
    bool test1 = (!timer_manager_start(NULL) &&
                  !timer_manager_stop(NULL) &&
                  !timer_manager_is_running(NULL) &&
                  timer_manager_get_timer_count(NULL) == 0);
    print_test_result(results, "NULL timer manager operations", test1);
    
    // Test 2: Invalid timer ID operations
    TimerManager* manager = timer_manager_create();
    if (manager) {
        timer_manager_start(manager);
        
        bool test2 = (!timer_manager_start_timer(manager, 999) &&
                      !timer_manager_stop_timer(manager, 999) &&
                      !timer_manager_delete_timer(manager, 999) &&
                      timer_manager_get_timer(manager, 999) == NULL);
        print_test_result(results, "Invalid timer ID operations", test2);
        
        timer_manager_stop(manager);
        timer_manager_destroy(manager);
    }
    
    // Test 3: NULL timer operations
    bool test3 = (!timer_is_running(NULL) &&
                  timer_get_interval(NULL) == 0 &&
                  timer_get_name(NULL) == NULL);
    print_test_result(results, "NULL timer operations", test3);
    
    // Test 4: Safe destruction of NULL objects
    timer_manager_destroy(NULL);
    timer_destroy(NULL);
    bool test4 = true; // If we reach here, destruction was safe
    print_test_result(results, "Safe destruction of NULL objects", test4);
}

void test_timer_multiple_timers(TestResults* results) {
    printf("\n=== Multiple Timers Tests ===\n");
    
    TimerManager* manager = timer_manager_create();
    if (!manager) return;
    
    timer_manager_start(manager);
    
    // Test 1: Create multiple timers
    const int num_timers = 5;
    uint32_t timer_ids[5];
    
    for (int i = 0; i < num_timers; i++) {
        char name[32];
        snprintf(name, sizeof(name), "Timer_%d", i);
        timer_ids[i] = timer_manager_create_timer(manager, name, TIMER_ONE_SHOT, 
                                                 50 + i * 10, test_timer_callback, NULL);
    }
    
    bool test1 = (timer_manager_get_timer_count(manager) == num_timers);
    print_test_result(results, "Create multiple timers", test1);
    
    // Test 2: Start all timers
    bool all_started = true;
    for (int i = 0; i < num_timers; i++) {
        if (!timer_manager_start_timer(manager, timer_ids[i])) {
            all_started = false;
            break;
        }
    }
    print_test_result(results, "Start all timers", all_started);
    
    // Test 3: Wait for all timers to execute
    callback_count = 0;
    platform_sleep_ms(150); // Wait for all timers
    
    bool test3 = (callback_count == num_timers);
    print_test_result(results, "All timers executed", test3);
    
    // Test 4: All one-shot timers stopped
    bool all_stopped = true;
    for (int i = 0; i < num_timers; i++) {
        Timer* timer = timer_manager_get_timer(manager, timer_ids[i]);
        if (timer && timer_is_running(timer)) {
            all_stopped = false;
            break;
        }
    }
    print_test_result(results, "All one-shot timers stopped", all_stopped);
    
    timer_manager_stop(manager);
    timer_manager_destroy(manager);
}

void test_timer_with_different_clocks(TestResults* results) {
    printf("\n=== Timer with Different Clocks Tests ===\n");
    
    TimerManager* manager = timer_manager_create();
    if (!manager) return;
    
    // Test 1: Timer with realtime clock
    timer_manager_start(manager);
    
    callback_count = 0;
    uint32_t rt_timer = timer_manager_create_timer(manager, "Realtime Timer", 
                                                  TIMER_ONE_SHOT, 60, 
                                                  test_timer_callback, NULL);
    
    timer_manager_start_timer(manager, rt_timer);
    platform_sleep_ms(100);
    
    bool test1 = (callback_count == 1);
    print_test_result(results, "Timer with realtime clock", test1);
    
    timer_manager_stop(manager);
    
    // Test 2: Timer with tick-based clock
    TickBasedClock* tick_clock = tick_based_clock_create(10); // 10ms ticks
    if (tick_clock) {
        timer_manager_set_clock(manager, (IClock*)tick_clock);
        timer_manager_start(manager);
        tick_based_clock_start((IClock*)tick_clock);
        
        callback_count = 0;
        uint32_t tick_timer = timer_manager_create_timer(manager, "Tick Timer", 
                                                        TIMER_ONE_SHOT, 50, // 5 ticks
                                                        test_timer_callback, NULL);
        
        timer_manager_start_timer(manager, tick_timer);
        platform_sleep_ms(120); // Wait longer for tick-based execution
        
        bool test2 = (callback_count >= 1);
        print_test_result(results, "Timer with tick-based clock", test2);
        
        // Test 3: Verify tick-based mode
        bool test3 = timer_manager_is_tick_based(manager);
        print_test_result(results, "Timer manager in tick-based mode", test3);
        
        tick_based_clock_stop((IClock*)tick_clock);
        timer_manager_stop(manager);
        tick_based_clock_destroy(tick_clock);
    }
    
    timer_manager_destroy(manager);
}

int main() {
    printf("=== RTOS C Implementation - Comprehensive Timer Test Suite ===\n");
    printf("Testing timer functionality, callbacks, and clock integration...\n");
    
    TestResults results = {0, 0, 0};
    
    test_timer_manager_basic_operations(&results);
    test_timer_creation_and_properties(&results);
    test_timer_execution_and_callbacks(&results);
    test_timer_control_operations(&results);
    test_timer_clock_integration(&results);
    test_timer_with_different_clocks(&results);
    test_timer_multiple_timers(&results);
    test_timer_error_handling(&results);
    
    printf("\n=== Test Summary ===\n");
    printf("Total Tests: %d\n", results.total);
    printf("Passed: %d\n", results.passed);
    printf("Failed: %d\n", results.failed);
    printf("Success Rate: %.1f%%\n", results.total > 0 ? (results.passed * 100.0 / results.total) : 0.0);
    
    if (results.failed == 0) {
        printf("\n✅ ALL TIMER TESTS PASSED! ✅\n");
        printf("🎉 The timer system is fully functional! 🎉\n");
        return 0;
    } else {
        printf("\n❌ Some timer tests failed. Please check the implementation.\n");
        return 1;
    }
}
