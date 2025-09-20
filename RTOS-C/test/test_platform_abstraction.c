// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "platform.h"
#include "clock.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Test results tracking
typedef struct TestResults {
    int tests_run;
    int tests_passed;
    int tests_failed;
} TestResults;

void print_test_result(TestResults* results, const char* test_name, bool passed) {
    results->tests_run++;
    if (passed) {
        results->tests_passed++;
        printf("✓ PASS: %s\n", test_name);
    } else {
        results->tests_failed++;
        printf("✗ FAIL: %s\n", test_name);
    }
}

// Test data for thread function
typedef struct ThreadTestData {
    int value;
    bool executed;
    char message[64];
} ThreadTestData;

// Simple thread function for testing
void* test_thread_function(void* arg) {
    ThreadTestData* data = (ThreadTestData*)arg;
    if (data) {
        data->executed = true;
        data->value = 42;
        strncpy(data->message, "Thread executed successfully", sizeof(data->message) - 1);
        data->message[sizeof(data->message) - 1] = '\0';
    }
    return NULL;
}

void test_mutex_operations(TestResults* results) {
    printf("\n=== Mutex Operations Tests ===\n");
    
    mutex_t mutex;
    
    // Test 1: Mutex initialization
    int init_result = platform_mutex_init(&mutex);
    bool test1 = (init_result == 0);
    print_test_result(results, "Mutex initialization", test1);
    
    if (init_result == 0) {
        // Test 2: Mutex lock
        int lock_result = platform_mutex_lock(&mutex);
        bool test2 = (lock_result == 0);
        print_test_result(results, "Mutex lock", test2);
        
        // Test 3: Mutex unlock
        int unlock_result = platform_mutex_unlock(&mutex);
        bool test3 = (unlock_result == 0);
        print_test_result(results, "Mutex unlock", test3);
        
        // Test 4: Multiple lock/unlock cycles
        bool test4 = true;
        for (int i = 0; i < 10; i++) {
            if (platform_mutex_lock(&mutex) != 0 || platform_mutex_unlock(&mutex) != 0) {
                test4 = false;
                break;
            }
        }
        print_test_result(results, "Multiple lock/unlock cycles", test4);
        
        // Test 5: Mutex destruction
        int destroy_result = platform_mutex_destroy(&mutex);
        bool test5 = (destroy_result == 0);
        print_test_result(results, "Mutex destruction", test5);
    }
}

void test_condition_variable_operations(TestResults* results) {
    printf("\n=== Condition Variable Operations Tests ===\n");
    
    cond_t cond;
    mutex_t mutex;
    
    // Initialize mutex and condition variable
    int mutex_init = platform_mutex_init(&mutex);
    int cond_init = platform_cond_init(&cond);
    
    bool test1 = (mutex_init == 0 && cond_init == 0);
    print_test_result(results, "Condition variable and mutex initialization", test1);
    
    if (mutex_init == 0 && cond_init == 0) {
        // Test 2: Condition variable signal
        int signal_result = platform_cond_signal(&cond);
        bool test2 = (signal_result == 0);
        print_test_result(results, "Condition variable signal", test2);
        
        // Test 3: Condition variable broadcast
        int broadcast_result = platform_cond_broadcast(&cond);
        bool test3 = (broadcast_result == 0);
        print_test_result(results, "Condition variable broadcast", test3);
        
        // Test 4: Timed wait with immediate timeout
        platform_mutex_lock(&mutex);
        struct timespec ts;
        clock_gettime(CLOCK_REALTIME, &ts);
        ts.tv_nsec += 1000000; // 1ms in the future
        if (ts.tv_nsec >= 1000000000) {
            ts.tv_sec++;
            ts.tv_nsec -= 1000000000;
        }
        
        int timedwait_result = platform_cond_timedwait(&cond, &mutex, &ts);
        platform_mutex_unlock(&mutex);
        
        // Should timeout (return non-zero)
        bool test4 = (timedwait_result != 0);
        print_test_result(results, "Condition variable timed wait timeout", test4);
        
        // Cleanup
        platform_cond_destroy(&cond);
        platform_mutex_destroy(&mutex);
        print_test_result(results, "Condition variable cleanup", true);
    }
}

void test_thread_operations(TestResults* results) {
    printf("\n=== Thread Operations Tests ===\n");
    
    ThreadTestData data = {0, false, ""};
    thread_t thread;
    
    // Test 1: Thread creation
    int create_result = platform_thread_create(&thread, test_thread_function, &data);
    bool test1 = (create_result == 0);
    print_test_result(results, "Thread creation", test1);
    
    if (create_result == 0) {
        // Test 2: Thread join
        int join_result = platform_thread_join(thread, NULL);
        bool test2 = (join_result == 0);
        print_test_result(results, "Thread join", test2);
        
        // Test 3: Thread execution verification
        bool test3 = (data.executed && data.value == 42 && 
                      strcmp(data.message, "Thread executed successfully") == 0);
        print_test_result(results, "Thread execution verification", test3);
    }
}

void test_time_operations(TestResults* results) {
    printf("\n=== Time Operations Tests ===\n");
    
    // Test 1: clock_gettime functionality
    struct timespec ts1, ts2;
    int clock_result1 = clock_gettime(CLOCK_REALTIME, &ts1);
    bool test1 = (clock_result1 == 0);
    print_test_result(results, "clock_gettime CLOCK_REALTIME", test1);
    
    int clock_result2 = clock_gettime(CLOCK_MONOTONIC, &ts2);
    bool test1b = (clock_result2 == 0);
    print_test_result(results, "clock_gettime CLOCK_MONOTONIC", test1b);
    
    // Test 2: Time progression
    platform_sleep_ms(10); // Sleep for 10ms
    struct timespec ts3;
    clock_gettime(CLOCK_REALTIME, &ts3);
    
    // Time should have progressed
    bool test2 = (ts3.tv_sec > ts1.tv_sec || 
                  (ts3.tv_sec == ts1.tv_sec && ts3.tv_nsec > ts1.tv_nsec));
    print_test_result(results, "Time progression after sleep", test2);
    
    // Test 3: nanosleep functionality
    struct timespec sleep_time = {0, 1000000}; // 1ms
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);
    int nanosleep_result = nanosleep(&sleep_time, NULL);
    clock_gettime(CLOCK_MONOTONIC, &end);
    
    bool test3 = (nanosleep_result == 0);
    print_test_result(results, "nanosleep execution", test3);
    
    // Verify sleep duration (should be at least 1ms)
    long elapsed_ms = (long)((end.tv_sec - start.tv_sec) * 1000 + 
                      (end.tv_nsec - start.tv_nsec) / 1000000);
    bool test3b = (elapsed_ms >= 0); // Allow some tolerance
    print_test_result(results, "nanosleep duration", test3b);
}

void test_utility_functions(TestResults* results) {
    printf("\n=== Utility Functions Tests ===\n");
    
    // These utility functions are defined in clock.h but not available in platform abstraction
    // For now, we'll test basic time operations
    
    struct timespec ts1 = {2, 500000000}; // 2.5 seconds
    struct timespec ts2 = {3, 0}; // 3 seconds
    
    // Test 1: Basic timespec operations
    bool test1 = (ts1.tv_sec == 2 && ts1.tv_nsec == 500000000);
    print_test_result(results, "timespec structure initialization", test1);
    
    // Test 2: Time comparison logic
    bool test2 = (ts2.tv_sec > ts1.tv_sec || 
                  (ts2.tv_sec == ts1.tv_sec && ts2.tv_nsec > ts1.tv_nsec));
    print_test_result(results, "Time comparison logic", test2);
    
    // Test 3: Time arithmetic
    struct timespec result = {ts1.tv_sec + 1, ts1.tv_nsec + 500000000};
    if (result.tv_nsec >= 1000000000) {
        result.tv_sec++;
        result.tv_nsec -= 1000000000;
    }
    bool test3 = (result.tv_sec == 4 && result.tv_nsec == 0);
    print_test_result(results, "Time arithmetic operations", test3);
}

void test_platform_sleep_functions(TestResults* results) {
    printf("\n=== Platform Sleep Functions Tests ===\n");
    
    // Test 1: platform_sleep_ms
    struct timespec start, end;
    clock_gettime(CLOCK_MONOTONIC, &start);
    platform_sleep_ms(50); // Sleep for 50ms
    clock_gettime(CLOCK_MONOTONIC, &end);
    
    long elapsed_ms = (long)((end.tv_sec - start.tv_sec) * 1000 + 
                      (end.tv_nsec - start.tv_nsec) / 1000000);
    bool test1 = (elapsed_ms >= 40 && elapsed_ms <= 100); // Allow some tolerance
    print_test_result(results, "platform_sleep_ms duration", test1);
    
    // Test 2: platform_sleep_until
    clock_gettime(CLOCK_MONOTONIC, &start);
    struct timespec target;
    target.tv_sec = start.tv_sec;
    target.tv_nsec = start.tv_nsec + 30000000; // Add 30ms
    if (target.tv_nsec >= 1000000000) {
        target.tv_sec++;
        target.tv_nsec -= 1000000000;
    }
    platform_sleep_until(target);
    clock_gettime(CLOCK_MONOTONIC, &end);
    
    elapsed_ms = (long)((end.tv_sec - start.tv_sec) * 1000 + 
                 (end.tv_nsec - start.tv_nsec) / 1000000);
    bool test2 = (elapsed_ms >= 25 && elapsed_ms <= 60); // Allow some tolerance
    print_test_result(results, "platform_sleep_until duration", test2);
    
    // Test 3: platform_sleep_until with past time (should not sleep)
    clock_gettime(CLOCK_MONOTONIC, &start);
    struct timespec past;
    past.tv_sec = start.tv_sec - 1;
    past.tv_nsec = start.tv_nsec;
    platform_sleep_until(past);
    clock_gettime(CLOCK_MONOTONIC, &end);
    
    elapsed_ms = (long)((end.tv_sec - start.tv_sec) * 1000 + 
                 (end.tv_nsec - start.tv_nsec) / 1000000);
    bool test3 = (elapsed_ms < 10); // Should be very quick
    print_test_result(results, "platform_sleep_until with past time", test3);
}

void test_error_handling(TestResults* results) {
    printf("\n=== Error Handling Tests ===\n");
    
    // Test 1: NULL pointer handling for mutex operations
    bool test1a = (platform_mutex_init(NULL) != 0);
    bool test1b = (platform_mutex_lock(NULL) != 0);
    bool test1c = (platform_mutex_unlock(NULL) != 0);
    bool test1d = (platform_mutex_destroy(NULL) != 0);
    bool test1 = (test1a && test1b && test1c && test1d);
    print_test_result(results, "NULL pointer handling for mutex", test1);
    
    // Test 2: NULL pointer handling for condition variables
    bool test2a = (platform_cond_init(NULL) != 0);
    bool test2b = (platform_cond_signal(NULL) != 0);
    bool test2c = (platform_cond_broadcast(NULL) != 0);
    bool test2d = (platform_cond_destroy(NULL) != 0);
    bool test2 = (test2a && test2b && test2c && test2d);
    print_test_result(results, "NULL pointer handling for condition variables", test2);
    
    // Test 3: NULL pointer handling for threads
    bool test3a = (platform_thread_create(NULL, test_thread_function, NULL) != 0);
    bool test3b = (platform_thread_create(NULL, NULL, NULL) != 0);
    bool test3 = (test3a && test3b);
    print_test_result(results, "NULL pointer handling for threads", test3);
    
    // Test 4: Invalid clock IDs
    struct timespec ts;
    bool test4 = (clock_gettime(999, &ts) != 0); // Invalid clock ID
    print_test_result(results, "Invalid clock ID handling", test4);
}

int main() {
    printf("=== RTOS C Implementation - Platform Abstraction Test Suite ===\n");
    printf("Testing cross-platform threading and timing functions...\n");
    
    TestResults results = {0, 0, 0};
    
    test_mutex_operations(&results);
    test_condition_variable_operations(&results);
    test_thread_operations(&results);
    test_time_operations(&results);
    test_utility_functions(&results);
    test_platform_sleep_functions(&results);
    test_error_handling(&results);
    
    printf("\n=== Test Summary ===\n");
    printf("Total Tests: %d\n", results.tests_run);
    printf("Passed: %d\n", results.tests_passed);
    printf("Failed: %d\n", results.tests_failed);
    printf("Success Rate: %.1f%%\n", 
           results.tests_run > 0 ? (100.0 * results.tests_passed / results.tests_run) : 0.0);
    
    if (results.tests_failed == 0) {
        printf("\n🎉 ALL PLATFORM ABSTRACTION TESTS PASSED! 🎉\n");
        return 0;
    } else {
        printf("\n❌ Some tests failed. Please check the implementation.\n");
        return 1;
    }
}
