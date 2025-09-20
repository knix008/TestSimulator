// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "signal.h"
#include <stdio.h>
#include <stdlib.h>

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

void test_signal_basic_operations(TestResults* results) {
    printf("\n=== Signal Basic Operations Tests ===\n");
    
    // Test 1: Signal creation
    Signal* signal = signal_create();
    bool test1 = (signal != NULL);
    print_test_result(results, "Signal creation", test1);
    
    if (!signal) return;
    
    // Test 2: Initial state should be not signaled
    bool test2 = !signal_is_signaled(signal);
    print_test_result(results, "Initial state is not signaled", test2);
    
    // Test 3: Send signal
    bool test3 = signal_send(signal);
    print_test_result(results, "Send signal", test3);
    
    // Test 4: Signal should be signaled after send
    bool test4 = signal_is_signaled(signal);
    print_test_result(results, "Signal is signaled after send", test4);
    
    // Test 5: Wait for signal (should succeed immediately)
    bool test5 = signal_wait(signal, 100);
    print_test_result(results, "Wait for signal (immediate)", test5);
    
    // Test 6: Signal should be reset after wait
    bool test6 = !signal_is_signaled(signal);
    print_test_result(results, "Signal reset after wait", test6);
    
    // Test 7: Wait timeout when not signaled
    bool test7 = !signal_wait(signal, 50);
    print_test_result(results, "Wait timeout when not signaled", test7);
    
    signal_destroy(signal);
}

void test_signal_manager_operations(TestResults* results) {
    printf("\n=== Signal Manager Operations Tests ===\n");
    
    // Test 1: Manager creation
    SignalManager* manager = signal_manager_create();
    bool test1 = (manager != NULL);
    print_test_result(results, "Signal manager creation", test1);
    
    if (!manager) return;
    
    // Test 2: Initial state
    size_t initial_count = signal_manager_get_signal_count(manager);
    bool test2 = (initial_count == 0);
    print_test_result(results, "Initial signal count is 0", test2);
    
    // Test 3: Create signal through manager
    uint32_t signal_id = signal_manager_create_signal(manager);
    bool test3 = (signal_id != 0);
    print_test_result(results, "Create signal through manager", test3);
    
    // Test 4: Manager count updated
    size_t count_after_create = signal_manager_get_signal_count(manager);
    bool test4 = (count_after_create == 1);
    print_test_result(results, "Manager count updated after creation", test4);
    
    // Test 5: Signal operations through manager
    bool test5a = !signal_manager_is_signaled(manager, signal_id);
    bool test5b = signal_manager_send(manager, signal_id);
    bool test5c = signal_manager_is_signaled(manager, signal_id);
    bool test5 = (test5a && test5b && test5c);
    print_test_result(results, "Signal operations through manager", test5);
    
    // Test 6: Wait through manager
    bool test6 = signal_manager_wait(manager, signal_id, 100);
    print_test_result(results, "Wait through manager", test6);
    
    // Test 7: Signal reset after wait through manager
    bool test7 = !signal_manager_is_signaled(manager, signal_id);
    print_test_result(results, "Signal reset after wait through manager", test7);
    
    // Test 8: Multiple signals
    uint32_t signal_id2 = signal_manager_create_signal(manager);
    uint32_t signal_id3 = signal_manager_create_signal(manager);
    
    size_t multiple_count = signal_manager_get_signal_count(manager);
    bool test8 = (multiple_count == 3 && signal_id2 != 0 && signal_id3 != 0);
    print_test_result(results, "Multiple signals creation", test8);
    
    // Test 9: Independent signal operations
    signal_manager_send(manager, signal_id2);
    bool test9a = signal_manager_is_signaled(manager, signal_id2);
    bool test9b = !signal_manager_is_signaled(manager, signal_id);
    bool test9c = !signal_manager_is_signaled(manager, signal_id3);
    bool test9 = (test9a && test9b && test9c);
    print_test_result(results, "Independent signal operations", test9);
    
    // Test 10: Delete signal
    bool test10 = signal_manager_delete_signal(manager, signal_id2);
    print_test_result(results, "Delete signal", test10);
    
    size_t count_after_delete = signal_manager_get_signal_count(manager);
    bool test10b = (count_after_delete == 2);
    print_test_result(results, "Count updated after deletion", test10b);
    
    signal_manager_destroy(manager);
}

void test_signal_communication_patterns(TestResults* results) {
    printf("\n=== Signal Communication Patterns Tests ===\n");
    
    SignalManager* manager = signal_manager_create();
    if (!manager) {
        print_test_result(results, "Communication patterns test setup", false);
        return;
    }
    
    // Test 1: Producer-Consumer pattern simulation
    uint32_t data_ready_signal = signal_manager_create_signal(manager);
    uint32_t processing_done_signal = signal_manager_create_signal(manager);
    
    printf("   Simulating producer-consumer communication...\n");
    
    // Producer sends data ready signal
    printf("   Producer: Data ready\n");
    signal_manager_send(manager, data_ready_signal);
    
    // Consumer waits for data ready
    bool consumer_got_data = signal_manager_wait(manager, data_ready_signal, 100);
    printf("   Consumer: %s\n", consumer_got_data ? "Received data ready signal" : "Timeout");
    
    if (consumer_got_data) {
        printf("   Consumer: Processing data...\n");
        // Consumer sends processing done signal
        signal_manager_send(manager, processing_done_signal);
        
        // Producer waits for processing done
        bool producer_got_done = signal_manager_wait(manager, processing_done_signal, 100);
        printf("   Producer: %s\n", producer_got_done ? "Received processing done signal" : "Timeout");
        
        bool test1 = (consumer_got_data && producer_got_done);
        print_test_result(results, "Producer-consumer communication pattern", test1);
    }
    
    // Test 2: Broadcast pattern simulation
    uint32_t broadcast_signal = signal_manager_create_signal(manager);
    
    printf("   Simulating broadcast to multiple receivers...\n");
    signal_manager_send(manager, broadcast_signal);
    
    bool receiver1 = signal_manager_wait(manager, broadcast_signal, 50);
    bool receiver2 = signal_manager_wait(manager, broadcast_signal, 50); // Should timeout (signal consumed)
    
    bool test2 = (receiver1 && !receiver2);
    print_test_result(results, "Signal consumed by first receiver", test2);
    
    signal_manager_destroy(manager);
}

void test_signal_error_handling(TestResults* results) {
    printf("\n=== Signal Error Handling Tests ===\n");
    
    // Test 1: NULL signal operations
    bool test1a = !signal_wait(NULL, 100);
    bool test1b = !signal_send(NULL);
    bool test1c = !signal_is_signaled(NULL);
    bool test1 = (test1a && test1b && test1c);
    print_test_result(results, "NULL signal operations", test1);
    
    // Test 2: NULL manager operations
    bool test2a = (signal_manager_create_signal(NULL) == 0);
    bool test2b = !signal_manager_delete_signal(NULL, 1);
    bool test2c = !signal_manager_wait(NULL, 1, 100);
    bool test2d = !signal_manager_send(NULL, 1);
    bool test2e = !signal_manager_is_signaled(NULL, 1);
    bool test2f = (signal_manager_get_signal_count(NULL) == 0);
    bool test2 = (test2a && test2b && test2c && test2d && test2e && test2f);
    print_test_result(results, "NULL manager operations", test2);
    
    // Test 3: Invalid signal ID operations
    SignalManager* manager = signal_manager_create();
    if (manager) {
        bool test3a = !signal_manager_wait(manager, 999, 100);
        bool test3b = !signal_manager_send(manager, 999);
        bool test3c = !signal_manager_is_signaled(manager, 999);
        bool test3d = !signal_manager_delete_signal(manager, 999);
        bool test3 = (test3a && test3b && test3c && test3d);
        print_test_result(results, "Invalid signal ID operations", test3);
        
        signal_manager_destroy(manager);
    }
    
    // Test 4: Safe destruction
    signal_destroy(NULL);
    signal_manager_destroy(NULL);
    print_test_result(results, "Safe destruction of NULL objects", true);
}

int main() {
    printf("=== RTOS C Implementation - Signal Test Suite ===\n");
    printf("Testing signal functionality and notification mechanisms...\n");
    
    TestResults results = {0, 0, 0};
    
    test_signal_basic_operations(&results);
    test_signal_manager_operations(&results);
    test_signal_communication_patterns(&results);
    test_signal_error_handling(&results);
    
    printf("\n=== Test Summary ===\n");
    printf("Total Tests: %d\n", results.tests_run);
    printf("Passed: %d\n", results.tests_passed);
    printf("Failed: %d\n", results.tests_failed);
    printf("Success Rate: %.1f%%\n", 
           results.tests_run > 0 ? (100.0 * results.tests_passed / results.tests_run) : 0.0);
    
    if (results.tests_failed == 0) {
        printf("\n🎉 ALL SIGNAL TESTS PASSED! 🎉\n");
        return 0;
    } else {
        printf("\n❌ Some signal tests failed. Please check the implementation.\n");
        return 1;
    }
}
