#include "mutex.h"
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

void test_mutex_basic_operations(TestResults* results) {
    printf("\n=== Mutex Basic Operations Tests ===\n");
    
    // Test 1: Normal mutex creation
    Mutex* normal_mutex = mutex_create("Normal Mutex", MUTEX_NORMAL);
    bool test1 = (normal_mutex != NULL);
    print_test_result(results, "Normal mutex creation", test1);
    
    if (!normal_mutex) return;
    
    // Test 2: Mutex properties
    bool test2 = (strcmp(mutex_get_name(normal_mutex), "Normal Mutex") == 0 &&
                  !mutex_is_recursive(normal_mutex) &&
                  !mutex_is_locked(normal_mutex) &&
                  mutex_get_owner(normal_mutex) == 0);
    print_test_result(results, "Normal mutex properties", test2);
    
    // Test 3: Lock mutex
    bool test3 = mutex_lock(normal_mutex, 1000);
    print_test_result(results, "Lock mutex", test3);
    
    // Test 4: Mutex state after lock
    bool test4 = (mutex_is_locked(normal_mutex) &&
                  mutex_get_owner(normal_mutex) != 0 &&
                  mutex_get_lock_count(normal_mutex) == 1);
    print_test_result(results, "Mutex state after lock", test4);
    
    // Test 5: Try lock on already locked mutex
    bool test5 = !mutex_try_lock(normal_mutex);
    print_test_result(results, "Try lock on locked mutex fails", test5);
    
    // Test 6: Unlock mutex
    bool test6 = mutex_unlock(normal_mutex);
    print_test_result(results, "Unlock mutex", test6);
    
    // Test 7: Mutex state after unlock
    bool test7 = (!mutex_is_locked(normal_mutex) &&
                  mutex_get_owner(normal_mutex) == 0 &&
                  mutex_get_lock_count(normal_mutex) == 0);
    print_test_result(results, "Mutex state after unlock", test7);
    
    // Test 8: Try lock on unlocked mutex
    bool test8 = mutex_try_lock(normal_mutex);
    print_test_result(results, "Try lock on unlocked mutex", test8);
    
    // Cleanup
    mutex_unlock(normal_mutex); // Ensure unlocked
    mutex_destroy(normal_mutex);
}

void test_recursive_mutex_operations(TestResults* results) {
    printf("\n=== Recursive Mutex Operations Tests ===\n");
    
    // Test 1: Recursive mutex creation
    Mutex* recursive_mutex = mutex_create("Recursive Mutex", MUTEX_RECURSIVE);
    bool test1 = (recursive_mutex != NULL);
    print_test_result(results, "Recursive mutex creation", test1);
    
    if (!recursive_mutex) return;
    
    // Test 2: Recursive mutex properties
    bool test2 = (mutex_is_recursive(recursive_mutex) &&
                  !mutex_is_locked(recursive_mutex));
    print_test_result(results, "Recursive mutex properties", test2);
    
    // Test 3: First lock
    bool test3 = mutex_lock(recursive_mutex, 1000);
    print_test_result(results, "First recursive lock", test3);
    
    // Test 4: Second lock by same task (recursive)
    bool test4 = mutex_lock(recursive_mutex, 1000);
    print_test_result(results, "Second recursive lock", test4);
    
    // Test 5: Lock count after recursive locks
    bool test5 = (mutex_get_lock_count(recursive_mutex) == 2);
    print_test_result(results, "Lock count after recursive locks", test5);
    
    // Test 6: First unlock (should still be locked)
    bool test6 = mutex_unlock(recursive_mutex);
    bool test6b = (mutex_is_locked(recursive_mutex) && 
                   mutex_get_lock_count(recursive_mutex) == 1);
    print_test_result(results, "First unlock (still locked)", test6 && test6b);
    
    // Test 7: Second unlock (should be fully unlocked)
    bool test7 = mutex_unlock(recursive_mutex);
    bool test7b = (!mutex_is_locked(recursive_mutex) && 
                   mutex_get_lock_count(recursive_mutex) == 0);
    print_test_result(results, "Second unlock (fully unlocked)", test7 && test7b);
    
    mutex_destroy(recursive_mutex);
}

void test_mutex_manager_operations(TestResults* results) {
    printf("\n=== Mutex Manager Operations Tests ===\n");
    
    // Test 1: Manager creation
    MutexManager* manager = mutex_manager_create();
    bool test1 = (manager != NULL);
    print_test_result(results, "Mutex manager creation", test1);
    
    if (!manager) return;
    
    // Test 2: Initial count
    bool test2 = (mutex_manager_get_count(manager) == 0);
    print_test_result(results, "Initial mutex count is 0", test2);
    
    // Test 3: Create mutex through manager
    uint32_t mutex_id = mutex_manager_create_mutex(manager, "Manager Mutex", MUTEX_NORMAL);
    bool test3 = (mutex_id != 0);
    print_test_result(results, "Create mutex through manager", test3);
    
    // Test 4: Count updated
    bool test4 = (mutex_manager_get_count(manager) == 1);
    print_test_result(results, "Manager count updated after creation", test4);
    
    // Test 5: Lock through manager
    bool test5 = mutex_manager_lock(manager, mutex_id, 1000);
    print_test_result(results, "Lock through manager", test5);
    
    // Test 6: Check lock state through manager
    bool test6 = mutex_manager_is_locked(manager, mutex_id);
    print_test_result(results, "Check lock state through manager", test6);
    
    // Test 7: Try lock through manager (should fail)
    bool test7 = !mutex_manager_try_lock(manager, mutex_id);
    print_test_result(results, "Try lock through manager fails", test7);
    
    // Test 8: Unlock through manager
    bool test8 = mutex_manager_unlock(manager, mutex_id);
    print_test_result(results, "Unlock through manager", test8);
    
    // Test 9: Check unlocked state
    bool test9 = !mutex_manager_is_locked(manager, mutex_id);
    print_test_result(results, "Check unlocked state through manager", test9);
    
    // Test 10: Multiple mutexes
    uint32_t mutex_id2 = mutex_manager_create_mutex(manager, "Mutex 2", MUTEX_RECURSIVE);
    uint32_t mutex_id3 = mutex_manager_create_mutex(manager, "Mutex 3", MUTEX_NORMAL);
    bool test10 = (mutex_id2 != 0 && mutex_id3 != 0 && 
                   mutex_manager_get_count(manager) == 3);
    print_test_result(results, "Multiple mutexes creation", test10);
    
    // Test 11: Independent mutex operations
    bool lock2 = mutex_manager_lock(manager, mutex_id2, 1000);
    bool lock3 = mutex_manager_lock(manager, mutex_id3, 1000);
    bool test11 = (lock2 && lock3);
    print_test_result(results, "Independent mutex operations", test11);
    
    // Test 12: Delete mutex
    mutex_manager_delete_mutex(manager, mutex_id);
    bool test12 = (mutex_manager_get_count(manager) == 2);
    print_test_result(results, "Delete mutex", test12);
    
    mutex_manager_destroy(manager);
}

void test_mutex_statistics(TestResults* results) {
    printf("\n=== Mutex Statistics Tests ===\n");
    
    Mutex* mutex = mutex_create("Stats Mutex", MUTEX_NORMAL);
    if (!mutex) return;
    
    // Test 1: Initial statistics
    bool test1 = (mutex_get_total_locks(mutex) == 0 &&
                  mutex_get_total_unlocks(mutex) == 0 &&
                  mutex_get_max_wait_time(mutex) == 0);
    print_test_result(results, "Initial statistics", test1);
    
    // Test 2: Statistics after operations
    mutex_lock(mutex, 1000);
    mutex_unlock(mutex);
    mutex_lock(mutex, 1000);
    mutex_unlock(mutex);
    
    bool test2 = (mutex_get_total_locks(mutex) == 2 &&
                  mutex_get_total_unlocks(mutex) == 2);
    print_test_result(results, "Statistics after operations", test2);
    
    // Test 3: Reset statistics
    mutex_reset_statistics(mutex);
    bool test3 = (mutex_get_total_locks(mutex) == 0 &&
                  mutex_get_total_unlocks(mutex) == 0 &&
                  mutex_get_max_wait_time(mutex) == 0);
    print_test_result(results, "Reset statistics", test3);
    
    mutex_destroy(mutex);
}

void test_mutex_timeout_and_contention(TestResults* results) {
    printf("\n=== Mutex Timeout and Contention Tests ===\n");
    
    Mutex* mutex = mutex_create("Timeout Mutex", MUTEX_NORMAL);
    if (!mutex) return;
    
    // Test 1: Lock with timeout (should succeed immediately)
    bool test1 = mutex_lock(mutex, 100);
    print_test_result(results, "Lock with timeout (immediate)", test1);
    
    // Test 2: Lock timeout when already locked
    bool test2 = !mutex_lock(mutex, 50); // Should timeout
    print_test_result(results, "Lock timeout when already locked", test2);
    
    // Test 3: Try lock when locked
    bool test3 = !mutex_try_lock(mutex);
    print_test_result(results, "Try lock when locked fails", test3);
    
    // Test 4: Unlock and try lock again
    mutex_unlock(mutex);
    bool test4 = mutex_try_lock(mutex);
    print_test_result(results, "Try lock after unlock succeeds", test4);
    
    mutex_unlock(mutex);
    mutex_destroy(mutex);
}

void test_mutex_error_handling(TestResults* results) {
    printf("\n=== Mutex Error Handling Tests ===\n");
    
    // Test 1: NULL mutex operations
    bool test1 = (!mutex_lock(NULL, 1000) &&
                  !mutex_try_lock(NULL) &&
                  !mutex_unlock(NULL) &&
                  !mutex_is_locked(NULL));
    print_test_result(results, "NULL mutex operations", test1);
    
    // Test 2: NULL manager operations
    bool test2 = (!mutex_manager_lock(NULL, 1, 1000) &&
                  !mutex_manager_try_lock(NULL, 1) &&
                  !mutex_manager_unlock(NULL, 1) &&
                  mutex_manager_get_count(NULL) == 0);
    print_test_result(results, "NULL manager operations", test2);
    
    // Test 3: Invalid mutex ID operations
    MutexManager* manager = mutex_manager_create();
    if (manager) {
        bool test3 = (!mutex_manager_lock(manager, 999, 1000) &&
                      !mutex_manager_try_lock(manager, 999) &&
                      !mutex_manager_unlock(manager, 999) &&
                      !mutex_manager_is_locked(manager, 999));
        print_test_result(results, "Invalid mutex ID operations", test3);
        mutex_manager_destroy(manager);
    }
    
    // Test 4: Unlock without lock
    Mutex* mutex = mutex_create("Error Test", MUTEX_NORMAL);
    if (mutex) {
        bool test4 = !mutex_unlock(mutex); // Should fail - not locked
        print_test_result(results, "Unlock without lock fails", test4);
        mutex_destroy(mutex);
    }
    
    // Test 5: Safe destruction of NULL objects
    mutex_destroy(NULL);
    mutex_manager_destroy(NULL);
    bool test5 = true; // If we reach here, destruction was safe
    print_test_result(results, "Safe destruction of NULL objects", test5);
}

void test_mutex_name_operations(TestResults* results) {
    printf("\n=== Mutex Name Operations Tests ===\n");
    
    // Test 1: Create mutex with name
    Mutex* mutex = mutex_create("Test Mutex", MUTEX_NORMAL);
    bool test1 = (mutex != NULL && 
                  strcmp(mutex_get_name(mutex), "Test Mutex") == 0);
    print_test_result(results, "Create mutex with name", test1);
    
    if (!mutex) return;
    
    // Test 2: Change mutex name
    mutex_set_name(mutex, "Renamed Mutex");
    bool test2 = (strcmp(mutex_get_name(mutex), "Renamed Mutex") == 0);
    print_test_result(results, "Change mutex name", test2);
    
    // Test 3: Set NULL name
    mutex_set_name(mutex, NULL);
    bool test3 = (mutex_get_name(mutex) == NULL);
    print_test_result(results, "Set NULL name", test3);
    
    // Test 4: Create mutex without name
    Mutex* unnamed_mutex = mutex_create(NULL, MUTEX_NORMAL);
    bool test4 = (unnamed_mutex != NULL && mutex_get_name(unnamed_mutex) == NULL);
    print_test_result(results, "Create mutex without name", test4);
    
    // Test 5: String representation
    mutex_set_name(mutex, "String Test");
    char* mutex_str = mutex_to_string(mutex);
    bool test5 = (mutex_str != NULL && strstr(mutex_str, "String Test") != NULL);
    print_test_result(results, "String representation", test5);
    
    if (mutex_str) free(mutex_str);
    mutex_destroy(mutex);
    if (unnamed_mutex) mutex_destroy(unnamed_mutex);
}

void test_mutex_manager_advanced(TestResults* results) {
    printf("\n=== Mutex Manager Advanced Tests ===\n");
    
    MutexManager* manager = mutex_manager_create();
    if (!manager) return;
    
    // Test 1: Create different types of mutexes
    uint32_t normal_mutex = mutex_manager_create_mutex(manager, "Normal", MUTEX_NORMAL);
    uint32_t recursive_mutex = mutex_manager_create_mutex(manager, "Recursive", MUTEX_RECURSIVE);
    
    bool test1 = (normal_mutex != 0 && recursive_mutex != 0 && 
                  mutex_manager_get_count(manager) == 2);
    print_test_result(results, "Create different mutex types", test1);
    
    // Test 2: Test normal mutex behavior through manager
    bool lock_normal = mutex_manager_lock(manager, normal_mutex, 1000);
    bool try_lock_normal = !mutex_manager_try_lock(manager, normal_mutex); // Should fail
    bool test2 = (lock_normal && try_lock_normal);
    print_test_result(results, "Normal mutex behavior through manager", test2);
    
    // Test 3: Test recursive mutex behavior through manager
    bool lock_recursive1 = mutex_manager_lock(manager, recursive_mutex, 1000);
    bool lock_recursive2 = mutex_manager_lock(manager, recursive_mutex, 1000); // Should succeed
    uint32_t lock_count = mutex_manager_get_lock_count(manager, recursive_mutex);
    bool test3 = (lock_recursive1 && lock_recursive2 && lock_count == 2);
    print_test_result(results, "Recursive mutex behavior through manager", test3);
    
    // Test 4: Unlock recursive mutex
    bool unlock1 = mutex_manager_unlock(manager, recursive_mutex);
    bool still_locked = mutex_manager_is_locked(manager, recursive_mutex);
    bool unlock2 = mutex_manager_unlock(manager, recursive_mutex);
    bool fully_unlocked = !mutex_manager_is_locked(manager, recursive_mutex);
    bool test4 = (unlock1 && still_locked && unlock2 && fully_unlocked);
    print_test_result(results, "Recursive mutex unlock sequence", test4);
    
    // Test 5: Print mutexes (should not crash)
    printf("  Printing mutex manager status:\n");
    mutex_manager_print_mutexes(manager);
    bool test5 = true;
    print_test_result(results, "Print mutexes", test5);
    
    // Test 6: Print statistics
    printf("  Printing mutex statistics:\n");
    mutex_manager_print_statistics(manager);
    bool test6 = true;
    print_test_result(results, "Print statistics", test6);
    
    mutex_manager_destroy(manager);
}

void test_mutex_contention_simulation(TestResults* results) {
    printf("\n=== Mutex Contention Simulation Tests ===\n");
    
    MutexManager* manager = mutex_manager_create();
    if (!manager) return;
    
    // Create a mutex for contention testing
    uint32_t mutex_id = mutex_manager_create_mutex(manager, "Contention Test", MUTEX_NORMAL);
    
    // Test 1: Simulate multiple tasks trying to acquire mutex
    printf("  Simulating 3 tasks competing for mutex...\n");
    
    // Task 1 acquires mutex
    bool task1_acquired = mutex_manager_lock(manager, mutex_id, 1000);
    printf("  Task 1: %s\n", task1_acquired ? "Acquired mutex" : "Failed to acquire");
    
    // Task 2 tries to acquire (should timeout)
    bool task2_timeout = !mutex_manager_lock(manager, mutex_id, 50);
    printf("  Task 2: %s\n", task2_timeout ? "Timed out (expected)" : "Unexpectedly acquired");
    
    // Task 3 tries to acquire (should timeout)
    bool task3_timeout = !mutex_manager_lock(manager, mutex_id, 50);
    printf("  Task 3: %s\n", task3_timeout ? "Timed out (expected)" : "Unexpectedly acquired");
    
    bool test1 = (task1_acquired && task2_timeout && task3_timeout);
    print_test_result(results, "Mutex contention simulation", test1);
    
    // Test 2: Release mutex and let next task acquire
    bool task1_released = mutex_manager_unlock(manager, mutex_id);
    bool task2_acquired = mutex_manager_try_lock(manager, mutex_id);
    
    bool test2 = (task1_released && task2_acquired);
    print_test_result(results, "Mutex release and reacquisition", test2);
    
    printf("  Final mutex owner: %u\n", mutex_manager_get_owner(manager, mutex_id));
    
    // Cleanup
    mutex_manager_unlock(manager, mutex_id);
    mutex_manager_destroy(manager);
}

int main() {
    printf("=== RTOS C Implementation - Comprehensive Mutex Test Suite ===\n");
    printf("Testing mutex functionality, mutual exclusion, and resource management...\n");
    
    TestResults results = {0, 0, 0};
    
    test_mutex_basic_operations(&results);
    test_recursive_mutex_operations(&results);
    test_mutex_manager_operations(&results);
    test_mutex_statistics(&results);
    test_mutex_timeout_and_contention(&results);
    test_mutex_contention_simulation(&results);
    test_mutex_error_handling(&results);
    
    printf("\n=== Test Summary ===\n");
    printf("Total Tests: %d\n", results.total);
    printf("Passed: %d\n", results.passed);
    printf("Failed: %d\n", results.failed);
    printf("Success Rate: %.1f%%\n", results.total > 0 ? (results.passed * 100.0 / results.total) : 0.0);
    
    if (results.failed == 0) {
        printf("\n✅ ALL MUTEX TESTS PASSED! ✅\n");
        printf("🎉 The mutex system is fully functional! 🎉\n");
        return 0;
    } else {
        printf("\n❌ Some mutex tests failed. Please check the implementation.\n");
        return 1;
    }
}
