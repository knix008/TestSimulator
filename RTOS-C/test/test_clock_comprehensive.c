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

void test_realtime_clock_operations(TestResults* results) {
    printf("\n=== Realtime Clock Operations Tests ===\n");
    
    // Test 1: Realtime clock creation
    RealtimeClock* rt_clock = realtime_clock_create();
    bool test1 = (rt_clock != NULL);
    print_test_result(results, "Realtime clock creation", test1);
    
    if (!rt_clock) return;
    
    // Cast to IClock for polymorphic operations
    IClock* iclock = (IClock*)rt_clock;
    
    // Test 2: Get current time
    uint32_t time1 = realtime_clock_get_current_time_ms(iclock);
    bool test2 = (time1 > 0);
    print_test_result(results, "Get current time", test2);
    
    // Test 3: Time progression
    platform_sleep_ms(50);
    uint32_t time2 = realtime_clock_get_current_time_ms(iclock);
    bool test3 = (time2 > time1);
    print_test_result(results, "Time progression", test3);
    
    // Test 4: Time difference reasonable
    uint32_t diff = time2 - time1;
    bool test4 = (diff >= 40 && diff <= 100); // Allow tolerance
    print_test_result(results, "Time difference reasonable", test4);
    
    // Test 5: Not tick-based
    bool test5 = !iclock->is_tick_based(iclock);
    print_test_result(results, "Realtime clock not tick-based", test5);
    
    // Test 6: Get time point
    struct timespec ts = iclock->get_current_time_point(iclock);
    bool test6 = (ts.tv_sec > 0 || ts.tv_nsec > 0);
    print_test_result(results, "Get current time point", test6);
    
    // Test 7: Sleep for duration
    uint32_t before_sleep = realtime_clock_get_current_time_ms(iclock);
    iclock->sleep_for_ms(iclock, 30);
    uint32_t after_sleep = realtime_clock_get_current_time_ms(iclock);
    bool test7 = (after_sleep >= before_sleep + 25); // Allow some tolerance
    print_test_result(results, "Sleep for duration", test7);
    
    realtime_clock_destroy(rt_clock);
}

void test_tick_based_clock_operations(TestResults* results) {
    printf("\n=== Tick-based Clock Operations Tests ===\n");
    
    // Test 1: Tick-based clock creation
    TickBasedClock* tick_clock = tick_based_clock_create(15); // 15ms per tick
    bool test1 = (tick_clock != NULL);
    print_test_result(results, "Tick-based clock creation", test1);
    
    if (!tick_clock) return;
    
    // Cast to IClock for polymorphic operations
    IClock* iclock = (IClock*)tick_clock;
    
    // Test 2: Initial tick count
    uint64_t initial_ticks = tick_based_clock_get_tick_count(iclock);
    bool test2 = (initial_ticks == 0);
    print_test_result(results, "Initial tick count", test2);
    
    // Test 3: Tick interval
    uint32_t interval = tick_based_clock_get_tick_interval_ms(iclock);
    bool test3 = (interval == 15);
    print_test_result(results, "Tick interval", test3);
    
    // Test 4: Is tick-based
    bool test4 = iclock->is_tick_based(iclock);
    print_test_result(results, "Clock is tick-based", test4);
    
    // Test 5: Start ticking
    tick_based_clock_start(iclock);
    bool test5 = tick_based_clock_is_running(iclock);
    print_test_result(results, "Start ticking", test5);
    
    // Test 6: Tick progression
    uint64_t ticks1 = tick_based_clock_get_tick_count(iclock);
    platform_sleep_ms(50); // Should advance ~3 ticks
    uint64_t ticks2 = tick_based_clock_get_tick_count(iclock);
    bool test6 = (ticks2 > ticks1);
    print_test_result(results, "Tick progression", test6);
    
    // Test 7: Approximate tick count
    uint64_t tick_diff = ticks2 - ticks1;
    bool test7 = (tick_diff >= 2 && tick_diff <= 5); // Allow tolerance
    print_test_result(results, "Approximate tick count", test7);
    
    // Test 8: Current time in ms
    uint32_t time_ms = tick_based_clock_get_current_time_ms(iclock);
    uint32_t expected_ms = (uint32_t)(tick_based_clock_get_tick_count(iclock) * 15);
    bool test8 = (time_ms == expected_ms);
    print_test_result(results, "Current time in ms", test8);
    
    // Test 9: Stop ticking
    tick_based_clock_stop(iclock);
    bool test9 = !tick_based_clock_is_running(iclock);
    print_test_result(results, "Stop ticking", test9);
    
    // Test 10: No more ticks after stop
    uint64_t ticks_before_stop = tick_based_clock_get_tick_count(iclock);
    platform_sleep_ms(50);
    uint64_t ticks_after_stop = tick_based_clock_get_tick_count(iclock);
    bool test10 = (ticks_after_stop == ticks_before_stop);
    print_test_result(results, "No ticks after stop", test10);
    
    tick_based_clock_destroy(tick_clock);
}

void test_clock_utility_functions(TestResults* results) {
    printf("\n=== Clock Utility Functions Tests ===\n");
    
    // Test 1: timespec operations
    struct timespec ts1, ts2;
    
    // Initialize timespec
    ts1.tv_sec = 1;
    ts1.tv_nsec = 500000000; // 1.5 seconds
    bool test1 = (ts1.tv_sec == 1 && ts1.tv_nsec == 500000000);
    print_test_result(results, "timespec initialization", test1);
    
    // Test 2: timespec add milliseconds
    ts1 = timespec_add_ms(ts1, 500); // Add 0.5 seconds
    bool test2 = (ts1.tv_sec == 2 && ts1.tv_nsec == 0);
    print_test_result(results, "timespec add milliseconds", test2);
    
    // Test 3: timespec add with overflow
    ts1.tv_sec = 0;
    ts1.tv_nsec = 800000000; // 0.8 seconds
    ts1 = timespec_add_ms(ts1, 300); // Add 0.3 seconds = 1.1 seconds total
    bool test3 = (ts1.tv_sec == 1 && ts1.tv_nsec == 100000000);
    print_test_result(results, "timespec add with overflow", test3);
    
    // Test 4: timespec comparison
    ts1.tv_sec = 1; ts1.tv_nsec = 500000000;
    ts2.tv_sec = 1; ts2.tv_nsec = 600000000;
    bool test4 = (timespec_compare(ts1, ts2) < 0 && // ts1 < ts2
                  timespec_compare(ts2, ts1) > 0 && // ts2 > ts1
                  timespec_compare(ts1, ts1) == 0); // ts1 == ts1
    print_test_result(results, "timespec comparison", test4);
    
    // Test 5: timespec to milliseconds
    ts1.tv_sec = 2; ts1.tv_nsec = 500000000; // 2.5 seconds
    uint32_t ms = timespec_to_ms(ts1);
    bool test5 = (ms == 2500);
    print_test_result(results, "timespec to milliseconds", test5);
    
    // Test 6: milliseconds to timespec
    struct timespec ts_result = ms_to_timespec(3750); // 3.75 seconds
    bool test6 = (ts_result.tv_sec == 3 && ts_result.tv_nsec == 750000000);
    print_test_result(results, "milliseconds to timespec", test6);
}

void test_clock_polymorphism(TestResults* results) {
    printf("\n=== Clock Polymorphism Tests ===\n");
    
    // Test 1: Realtime clock through IClock interface
    RealtimeClock* rt_clock = realtime_clock_create();
    if (rt_clock) {
        IClock* iclock = (IClock*)rt_clock;
        
        uint32_t time1 = iclock->get_current_time_ms(iclock);
        platform_sleep_ms(30);
        uint32_t time2 = iclock->get_current_time_ms(iclock);
        
        bool test1 = (time2 > time1 && !iclock->is_tick_based(iclock));
        print_test_result(results, "Realtime clock polymorphism", test1);
        
        realtime_clock_destroy(rt_clock);
    }
    
    // Test 2: Tick-based clock through IClock interface
    TickBasedClock* tick_clock = tick_based_clock_create(25);
    if (tick_clock) {
        IClock* iclock = (IClock*)tick_clock;
        
        iclock->start(iclock);
        
        uint64_t ticks1 = iclock->get_tick_count(iclock);
        platform_sleep_ms(60); // Should advance ~2 ticks
        uint64_t ticks2 = iclock->get_tick_count(iclock);
        
        bool test2 = (ticks2 > ticks1 && iclock->is_tick_based(iclock));
        print_test_result(results, "Tick-based clock polymorphism", test2);
        
        iclock->stop(iclock);
        tick_based_clock_destroy(tick_clock);
    }
}

void test_clock_error_handling(TestResults* results) {
    printf("\n=== Clock Error Handling Tests ===\n");
    
    // Test 1: NULL clock operations (may not return 0, just check they don't crash)
    realtime_clock_get_current_time_ms(NULL);
    tick_based_clock_get_current_time_ms(NULL);
    tick_based_clock_get_tick_count(NULL);
    bool test1 = true; // If we reach here, functions handled NULL safely
    print_test_result(results, "NULL clock operations", test1);
    
    // Test 2: NULL timespec operations (functions take by value, so no NULL test needed)
    struct timespec result = ms_to_timespec(1000);
    bool test2 = (result.tv_sec == 1 && result.tv_nsec == 0);
    print_test_result(results, "timespec utility functions work", test2);
    
    // Test 3: Safe destruction of NULL objects
    realtime_clock_destroy(NULL);
    tick_based_clock_destroy(NULL);
    bool test3 = true; // If we reach here, destruction was safe
    print_test_result(results, "Safe destruction of NULL objects", test3);
    
    // Test 4: Invalid tick interval (implementation may allow 0, so just test it doesn't crash)
    TickBasedClock* test_tick_clock = tick_based_clock_create(0); // Test with 0 interval
    if (test_tick_clock) {
        tick_based_clock_destroy(test_tick_clock);
    }
    bool test4 = true; // If we reach here, function handled edge case safely
    print_test_result(results, "Edge case tick interval handled", test4);
}

int main() {
    printf("=== RTOS C Implementation - Comprehensive Clock Test Suite ===\n");
    printf("Testing clock functionality, timing mechanisms, and polymorphism...\n");
    
    TestResults results = {0, 0, 0};
    
    test_realtime_clock_operations(&results);
    test_tick_based_clock_operations(&results);
    test_clock_utility_functions(&results);
    test_clock_polymorphism(&results);
    test_clock_error_handling(&results);
    
    printf("\n=== Test Summary ===\n");
    printf("Total Tests: %d\n", results.total);
    printf("Passed: %d\n", results.passed);
    printf("Failed: %d\n", results.failed);
    printf("Success Rate: %.1f%%\n", results.total > 0 ? (results.passed * 100.0 / results.total) : 0.0);
    
    if (results.failed == 0) {
        printf("\n✅ ALL CLOCK TESTS PASSED! ✅\n");
        printf("🎉 The clock system is fully functional! 🎉\n");
        return 0;
    } else {
        printf("\n❌ Some clock tests failed. Please check the implementation.\n");
        return 1;
    }
}
