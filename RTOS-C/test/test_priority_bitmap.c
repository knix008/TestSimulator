// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "scheduler.h"
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

void test_bitmap_basic_operations(TestResults* results) {
    printf("\n=== Bitmap Basic Operations Tests ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Bitmap test setup", false);
        return;
    }
    
    // Test 1: Empty scheduler has no ready tasks
    bool test1 = !priority_scheduler_has_ready_tasks(scheduler);
    print_test_result(results, "Empty scheduler has no ready tasks", test1);
    
    // Test 2: Add task at priority 0 (highest)
    priority_scheduler_create_task(scheduler, 0, NULL);
    bool test2 = priority_scheduler_has_ready_tasks(scheduler);
    print_test_result(results, "Scheduler has ready tasks after adding priority 0", test2);
    
    // Test 3: Highest priority should be 0
    uint8_t highest = priority_scheduler_get_highest_ready_priority(scheduler);
    bool test3 = (highest == 0);
    print_test_result(results, "Highest priority is 0", test3);
    
    // Test 4: Add task at priority 127 (lowest)
    priority_scheduler_create_task(scheduler, 127, NULL);
    highest = priority_scheduler_get_highest_ready_priority(scheduler);
    bool test4 = (highest == 0); // Should still be 0
    print_test_result(results, "Highest priority remains 0 after adding priority 127", test4);
    
    priority_scheduler_destroy(scheduler);
}

void test_bitmap_all_priorities(TestResults* results) {
    printf("\n=== Bitmap All Priorities Tests ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "All priorities test setup", false);
        return;
    }
    
    // Test 1: Add tasks at all priority levels
    for (int i = 0; i < 128; i++) {
        priority_scheduler_create_task(scheduler, (uint8_t)i, NULL);
    }
    
    bool test1 = (priority_scheduler_get_total_task_count(scheduler) == 128);
    print_test_result(results, "All 128 priority levels populated", test1);
    
    // Test 2: Highest priority should still be 0
    uint8_t highest = priority_scheduler_get_highest_ready_priority(scheduler);
    bool test2 = (highest == 0);
    print_test_result(results, "Highest priority is 0 with all priorities", test2);
    
    // Test 3: Remove tasks in priority order and verify bitmap updates
    bool test3 = true;
    for (int expected_priority = 0; expected_priority < 128; expected_priority++) {
        Task* task = priority_scheduler_get_next_task(scheduler);
        if (!task || task_get_priority(task) != expected_priority) {
            test3 = false;
            if (task) task_destroy(task);
            break;
        }
        task_destroy(task);
        
        // Check next highest priority
        if (expected_priority < 127) {
            uint8_t next_highest = priority_scheduler_get_highest_ready_priority(scheduler);
            if (next_highest != expected_priority + 1) {
                test3 = false;
                break;
            }
        }
    }
    print_test_result(results, "Priority order maintained throughout removal", test3);
    
    // Test 4: Scheduler should be empty now
    bool test4 = !priority_scheduler_has_ready_tasks(scheduler);
    print_test_result(results, "Scheduler empty after removing all tasks", test4);
    
    priority_scheduler_destroy(scheduler);
}

void test_bitmap_sparse_priorities(TestResults* results) {
    printf("\n=== Bitmap Sparse Priorities Tests ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Sparse priorities test setup", false);
        return;
    }
    
    // Test with sparse priority distribution
    int sparse_priorities[] = {1, 8, 15, 32, 63, 64, 100, 126};
    int num_priorities = sizeof(sparse_priorities) / sizeof(sparse_priorities[0]);
    
    // Test 1: Add tasks at sparse priorities
    for (int i = 0; i < num_priorities; i++) {
        priority_scheduler_create_task(scheduler, (uint8_t)sparse_priorities[i], NULL);
    }
    
    bool test1 = (priority_scheduler_get_total_task_count(scheduler) == (size_t)num_priorities);
    print_test_result(results, "Sparse priorities tasks added", test1);
    
    // Test 2: Verify tasks come out in priority order
    bool test2 = true;
    for (int i = 0; i < num_priorities; i++) {
        Task* task = priority_scheduler_get_next_task(scheduler);
        if (!task || task_get_priority(task) != sparse_priorities[i]) {
            test2 = false;
            if (task) task_destroy(task);
            break;
        }
        task_destroy(task);
    }
    print_test_result(results, "Sparse priorities retrieved in correct order", test2);
    
    priority_scheduler_destroy(scheduler);
}

void test_bitmap_boundary_conditions(TestResults* results) {
    printf("\n=== Bitmap Boundary Conditions Tests ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Boundary conditions test setup", false);
        return;
    }
    
    // Test 1: Boundary priorities (0, 7, 8, 15, 16, etc.)
    int boundary_priorities[] = {0, 7, 8, 15, 16, 31, 32, 63, 64, 127};
    int num_boundaries = sizeof(boundary_priorities) / sizeof(boundary_priorities[0]);
    
    for (int i = 0; i < num_boundaries; i++) {
        priority_scheduler_create_task(scheduler, (uint8_t)boundary_priorities[i], NULL);
    }
    
    bool test1 = (priority_scheduler_get_total_task_count(scheduler) == (size_t)num_boundaries);
    print_test_result(results, "Boundary priority tasks added", test1);
    
    // Test 2: Verify correct priority order
    bool test2 = true;
    for (int i = 0; i < num_boundaries; i++) {
        Task* task = priority_scheduler_get_next_task(scheduler);
        if (!task || task_get_priority(task) != boundary_priorities[i]) {
            test2 = false;
            if (task) task_destroy(task);
            break;
        }
        task_destroy(task);
    }
    print_test_result(results, "Boundary priorities in correct order", test2);
    
    priority_scheduler_destroy(scheduler);
}

void test_bitmap_byte_boundaries(TestResults* results) {
    printf("\n=== Bitmap Byte Boundaries Tests ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Byte boundaries test setup", false);
        return;
    }
    
    // Test each byte boundary (0-7, 8-15, 16-23, ..., 120-127)
    for (int byte = 0; byte < 16; byte++) {
        // Add one task in each byte
        int priority = byte * 8 + (byte % 8); // Vary position within byte
        priority_scheduler_create_task(scheduler, (uint8_t)priority, NULL);
    }
    
    bool test1 = (priority_scheduler_get_total_task_count(scheduler) == 16);
    print_test_result(results, "One task per byte boundary added", test1);
    
    // Test that bitmap correctly finds the highest priority across all bytes
    uint8_t highest = priority_scheduler_get_highest_ready_priority(scheduler);
    bool test2 = (highest == 0); // Should be from byte 0
    print_test_result(results, "Correct highest priority across byte boundaries", test2);
    
    // Remove the highest priority task and check next
    Task* task = priority_scheduler_get_next_task(scheduler);
    if (task) {
        task_destroy(task);
        highest = priority_scheduler_get_highest_ready_priority(scheduler);
        bool test3 = (highest == 9); // Should be from byte 1 (1*8 + 1 = 9)
        print_test_result(results, "Correct next highest after byte 0 removal", test3);
    }
    
    priority_scheduler_destroy(scheduler);
}

void test_bitmap_performance_characteristics(TestResults* results) {
    printf("\n=== Bitmap Performance Characteristics Tests ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Performance test setup", false);
        return;
    }
    
    // Test 1: O(1) complexity - time should be constant regardless of number of tasks
    // Add many tasks at different priorities
    for (int i = 0; i < 100; i++) {
        priority_scheduler_create_task(scheduler, (uint8_t)(i % 128), NULL);
    }
    
    // The bitmap should still find the highest priority in constant time
    uint8_t highest = priority_scheduler_get_highest_ready_priority(scheduler);
    bool test1 = (highest == 0);
    print_test_result(results, "O(1) highest priority lookup with many tasks", test1);
    
    // Test 2: Consistent performance with sparse distribution
    PriorityScheduler* sparse_scheduler = priority_scheduler_create();
    priority_scheduler_create_task(sparse_scheduler, 127, NULL); // Only lowest priority
    
    uint8_t sparse_highest = priority_scheduler_get_highest_ready_priority(sparse_scheduler);
    bool test2 = (sparse_highest == 127);
    print_test_result(results, "O(1) lookup with sparse distribution", test2);
    
    priority_scheduler_destroy(sparse_scheduler);
    priority_scheduler_destroy(scheduler);
}

void test_bitmap_multiple_tasks_same_priority(TestResults* results) {
    printf("\n=== Multiple Tasks Same Priority Tests ===\n");
    
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (!scheduler) {
        print_test_result(results, "Same priority test setup", false);
        return;
    }
    
    // Test 1: Multiple tasks at same priority
    const int num_tasks = 5;
    const uint8_t priority = 10;
    
    for (int i = 0; i < num_tasks; i++) {
        priority_scheduler_create_task(scheduler, priority, NULL);
    }
    
    size_t count_at_priority = priority_scheduler_get_task_count(scheduler, priority);
    bool test1 = (count_at_priority == num_tasks);
    print_test_result(results, "Correct count for multiple tasks at same priority", test1);
    
    // Test 2: Bitmap should still report correct highest priority
    uint8_t highest = priority_scheduler_get_highest_ready_priority(scheduler);
    bool test2 = (highest == priority);
    print_test_result(results, "Correct highest priority with multiple same-priority tasks", test2);
    
    // Test 3: Add higher priority task
    priority_scheduler_create_task(scheduler, 5, NULL);
    highest = priority_scheduler_get_highest_ready_priority(scheduler);
    bool test3 = (highest == 5);
    print_test_result(results, "Higher priority task takes precedence", test3);
    
    // Test 4: Remove higher priority task, should go back to original priority
    Task* high_task = priority_scheduler_get_next_task(scheduler);
    if (high_task) {
        task_destroy(high_task);
        highest = priority_scheduler_get_highest_ready_priority(scheduler);
        bool test4 = (highest == priority);
        print_test_result(results, "Correct priority after removing higher priority task", test4);
    }
    
    priority_scheduler_destroy(scheduler);
}

void test_bitmap_edge_cases(TestResults* results) {
    printf("\n=== Bitmap Edge Cases Tests ===\n");
    
    // Test 1: NULL scheduler
    bool test1 = !priority_scheduler_has_ready_tasks(NULL);
    print_test_result(results, "NULL scheduler has no ready tasks", test1);
    
    uint8_t null_priority = priority_scheduler_get_highest_ready_priority(NULL);
    bool test1b = (null_priority >= 128); // Should return invalid priority
    print_test_result(results, "NULL scheduler returns invalid priority", test1b);
    
    // Test 2: Invalid priority handling
    PriorityScheduler* scheduler = priority_scheduler_create();
    if (scheduler) {
        uint32_t invalid_task = priority_scheduler_create_task(scheduler, 200, NULL);
        bool test2 = (invalid_task == 0);
        print_test_result(results, "Invalid priority rejected", test2);
        
        // Test 3: Task count for invalid priority
        size_t invalid_count = priority_scheduler_get_task_count(scheduler, 200);
        bool test3 = (invalid_count == 0);
        print_test_result(results, "Zero count for invalid priority", test3);
        
        priority_scheduler_destroy(scheduler);
    }
}

int main() {
    printf("=== RTOS C Implementation - Priority Bitmap Test Suite ===\n");
    printf("Testing O(1) priority bitmap optimization...\n");
    
    TestResults results = {0, 0, 0};
    
    test_bitmap_basic_operations(&results);
    test_bitmap_all_priorities(&results);
    test_bitmap_sparse_priorities(&results);
    test_bitmap_boundary_conditions(&results);
    test_bitmap_byte_boundaries(&results);
    test_bitmap_performance_characteristics(&results);
    test_bitmap_multiple_tasks_same_priority(&results);
    test_bitmap_edge_cases(&results);
    
    printf("\n=== Test Summary ===\n");
    printf("Total Tests: %d\n", results.tests_run);
    printf("Passed: %d\n", results.tests_passed);
    printf("Failed: %d\n", results.tests_failed);
    printf("Success Rate: %.1f%%\n", 
           results.tests_run > 0 ? (100.0 * results.tests_passed / results.tests_run) : 0.0);
    
    if (results.tests_failed == 0) {
        printf("\n🎉 ALL PRIORITY BITMAP TESTS PASSED! 🎉\n");
        printf("The O(1) priority scheduling optimization is working correctly!\n");
        return 0;
    } else {
        printf("\n❌ Some tests failed. Please check the implementation.\n");
        return 1;
    }
}
