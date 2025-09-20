// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "semaphore.h"
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

void test_semaphore_basic_operations(TestResults* results) {
    printf("\n=== Semaphore Basic Operations Tests ===\n");
    
    // Test 1: Semaphore creation
    Semaphore* sem = semaphore_create(2);
    bool test1 = (sem != NULL);
    print_test_result(results, "Semaphore creation", test1);
    
    if (!sem) return;
    
    // Test 2: Initial count verification
    int initial_count = semaphore_get_count(sem);
    bool test2 = (initial_count == 2);
    print_test_result(results, "Initial count verification", test2);
    
    // Test 3: Semaphore wait (should succeed immediately)
    bool test3 = semaphore_wait(sem, 100); // 100ms timeout
    print_test_result(results, "Semaphore wait success", test3);
    
    // Test 4: Count decremented after wait
    int count_after_wait = semaphore_get_count(sem);
    bool test4 = (count_after_wait == 1);
    print_test_result(results, "Count decremented after wait", test4);
    
    // Test 5: Semaphore post
    bool test5 = semaphore_post(sem);
    print_test_result(results, "Semaphore post success", test5);
    
    // Test 6: Count incremented after post
    int count_after_post = semaphore_get_count(sem);
    bool test6 = (count_after_post == 2);
    print_test_result(results, "Count incremented after post", test6);
    
    // Test 7: Multiple waits
    semaphore_wait(sem, 100);
    semaphore_wait(sem, 100);
    int count_after_multiple_waits = semaphore_get_count(sem);
    bool test7 = (count_after_multiple_waits == 0);
    print_test_result(results, "Multiple waits decrement count correctly", test7);
    
    // Test 8: Wait timeout when count is 0
    bool test8 = !semaphore_wait(sem, 50); // Should timeout
    print_test_result(results, "Wait timeout when count is 0", test8);
    
    semaphore_destroy(sem);
}

void test_semaphore_manager_operations(TestResults* results) {
    printf("\n=== Semaphore Manager Operations Tests ===\n");
    
    // Test 1: Manager creation
    SemaphoreManager* manager = semaphore_manager_create();
    bool test1 = (manager != NULL);
    print_test_result(results, "Semaphore manager creation", test1);
    
    if (!manager) return;
    
    // Test 2: Initial state
    size_t initial_count = semaphore_manager_get_semaphore_count(manager);
    bool test2 = (initial_count == 0);
    print_test_result(results, "Initial semaphore count is 0", test2);
    
    // Test 3: Create semaphore through manager
    uint32_t sem_id = semaphore_manager_create_semaphore(manager, 3);
    bool test3 = (sem_id != 0);
    print_test_result(results, "Create semaphore through manager", test3);
    
    // Test 4: Manager count updated
    size_t count_after_create = semaphore_manager_get_semaphore_count(manager);
    bool test4 = (count_after_create == 1);
    print_test_result(results, "Manager count updated after creation", test4);
    
    // Test 5: Semaphore operations through manager
    int sem_count = semaphore_manager_get_count(manager, sem_id);
    bool test5 = (sem_count == 3);
    print_test_result(results, "Get semaphore count through manager", test5);
    
    // Test 6: Wait through manager
    bool test6 = semaphore_manager_wait(manager, sem_id, 100);
    print_test_result(results, "Wait through manager", test6);
    
    // Test 7: Post through manager
    bool test7 = semaphore_manager_post(manager, sem_id);
    print_test_result(results, "Post through manager", test7);
    
    // Test 8: Multiple semaphores
    uint32_t sem_id2 = semaphore_manager_create_semaphore(manager, 1);
    uint32_t sem_id3 = semaphore_manager_create_semaphore(manager, 5);
    
    size_t final_count = semaphore_manager_get_semaphore_count(manager);
    bool test8 = (final_count == 3 && sem_id2 != 0 && sem_id3 != 0);
    print_test_result(results, "Multiple semaphores creation", test8);
    
    // Test 9: Delete semaphore
    bool test9 = semaphore_manager_delete_semaphore(manager, sem_id2);
    print_test_result(results, "Delete semaphore", test9);
    
    size_t count_after_delete = semaphore_manager_get_semaphore_count(manager);
    bool test9b = (count_after_delete == 2);
    print_test_result(results, "Count updated after deletion", test9b);
    
    semaphore_manager_destroy(manager);
}

void test_semaphore_concurrency_simulation(TestResults* results) {
    printf("\n=== Semaphore Concurrency Simulation Tests ===\n");
    
    SemaphoreManager* manager = semaphore_manager_create();
    if (!manager) {
        print_test_result(results, "Concurrency test setup", false);
        return;
    }
    
    // Create a resource semaphore with limited count
    uint32_t resource_sem = semaphore_manager_create_semaphore(manager, 2);
    
    // Simulate multiple tasks acquiring resources
    printf("   Simulating 5 tasks competing for 2 resources...\n");
    
    int successful_acquisitions = 0;
    int timeouts = 0;
    
    // Simulate 5 tasks trying to acquire resources
    for (int i = 0; i < 5; i++) {
        printf("   Task %d attempting to acquire resource...\n", i + 1);
        
        if (semaphore_manager_wait(manager, resource_sem, 10)) { // Short timeout
            successful_acquisitions++;
            printf("   Task %d acquired resource (count: %d)\n", 
                   i + 1, semaphore_manager_get_count(manager, resource_sem));
        } else {
            timeouts++;
            printf("   Task %d timed out waiting for resource\n", i + 1);
        }
    }
    
    bool test1 = (successful_acquisitions == 2 && timeouts == 3);
    print_test_result(results, "Resource contention simulation", test1);
    
    // Release resources
    semaphore_manager_post(manager, resource_sem);
    semaphore_manager_post(manager, resource_sem);
    
    // Verify count is back to 2
    int final_count = semaphore_manager_get_count(manager, resource_sem);
    bool test2 = (final_count == 2);
    print_test_result(results, "Resource release and count restoration", test2);
    
    semaphore_manager_destroy(manager);
}

void test_semaphore_error_handling(TestResults* results) {
    printf("\n=== Semaphore Error Handling Tests ===\n");
    
    // Test 1: NULL semaphore operations
    bool test1a = !semaphore_wait(NULL, 100);
    bool test1b = !semaphore_post(NULL);
    bool test1c = (semaphore_get_count(NULL) == -1);
    bool test1 = (test1a && test1b && test1c);
    print_test_result(results, "NULL semaphore operations", test1);
    
    // Test 2: NULL manager operations
    bool test2a = (semaphore_manager_create_semaphore(NULL, 1) == 0);
    bool test2b = !semaphore_manager_delete_semaphore(NULL, 1);
    bool test2c = !semaphore_manager_wait(NULL, 1, 100);
    bool test2d = !semaphore_manager_post(NULL, 1);
    bool test2e = (semaphore_manager_get_count(NULL, 1) == -1);
    bool test2f = (semaphore_manager_get_semaphore_count(NULL) == 0);
    bool test2 = (test2a && test2b && test2c && test2d && test2e && test2f);
    print_test_result(results, "NULL manager operations", test2);
    
    // Test 3: Invalid semaphore ID operations
    SemaphoreManager* manager = semaphore_manager_create();
    if (manager) {
        bool test3a = !semaphore_manager_wait(manager, 999, 100); // Non-existent ID
        bool test3b = !semaphore_manager_post(manager, 999);
        bool test3c = (semaphore_manager_get_count(manager, 999) == -1);
        bool test3d = !semaphore_manager_delete_semaphore(manager, 999);
        bool test3 = (test3a && test3b && test3c && test3d);
        print_test_result(results, "Invalid semaphore ID operations", test3);
        
        semaphore_manager_destroy(manager);
    }
    
    // Test 4: Safe destruction
    semaphore_destroy(NULL); // Should not crash
    semaphore_manager_destroy(NULL); // Should not crash
    print_test_result(results, "Safe destruction of NULL objects", true);
}

int main() {
    printf("=== RTOS C Implementation - Semaphore Test Suite ===\n");
    printf("Testing semaphore functionality and resource management...\n");
    
    TestResults results = {0, 0, 0};
    
    test_semaphore_basic_operations(&results);
    test_semaphore_manager_operations(&results);
    test_semaphore_concurrency_simulation(&results);
    test_semaphore_error_handling(&results);
    
    printf("\n=== Test Summary ===\n");
    printf("Total Tests: %d\n", results.tests_run);
    printf("Passed: %d\n", results.tests_passed);
    printf("Failed: %d\n", results.tests_failed);
    printf("Success Rate: %.1f%%\n", 
           results.tests_run > 0 ? (100.0 * results.tests_passed / results.tests_run) : 0.0);
    
    if (results.tests_failed == 0) {
        printf("\n🎉 ALL SEMAPHORE TESTS PASSED! 🎉\n");
        return 0;
    } else {
        printf("\n❌ Some semaphore tests failed. Please check the implementation.\n");
        return 1;
    }
}
