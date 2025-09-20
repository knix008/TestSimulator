// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "task.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

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

void test_task_creation_destruction(TestResults* results) {
    printf("\n=== Task Creation/Destruction Tests ===\n");
    
    // Test 1: Basic task creation
    Task* task = task_create(1, 5, NULL);
    bool test1 = (task != NULL);
    print_test_result(results, "Basic task creation", test1);
    
    if (task) {
        // Test 2: Task ID verification
        bool test2 = (task_get_id(task) == 1);
        print_test_result(results, "Task ID verification", test2);
        
        // Test 3: Task priority verification
        bool test3 = (task_get_priority(task) == 5);
        print_test_result(results, "Task priority verification", test3);
        
        // Test 4: Initial state is READY
        bool test4 = task_is_ready(task);
        print_test_result(results, "Initial state is READY", test4);
        
        task_destroy(task);
    }
    
    // Test 5: Task creation with data
    int* data = (int*)malloc(sizeof(int));
    *data = 42;
    task = task_create(2, 10, data);
    bool test5 = (task != NULL && task_get_data(task) == data);
    print_test_result(results, "Task creation with data", test5);
    
    if (task) {
        bool test5b = (*(int*)task_get_data(task) == 42);
        print_test_result(results, "Task data verification", test5b);
        
        free(data);
        task_destroy(task);
    }
}

void test_task_state_transitions(TestResults* results) {
    printf("\n=== Task State Transition Tests ===\n");
    
    Task* task = task_create(1, 5, NULL);
    if (!task) {
        print_test_result(results, "Task state test setup", false);
        return;
    }
    
    // Test 1: Initial state
    bool test1 = (task_get_state(task) == TASK_READY && task_is_ready(task));
    print_test_result(results, "Initial READY state", test1);
    
    // Test 2: Transition to RUNNING
    task_transition_to_running(task);
    bool test2 = (task_get_state(task) == TASK_RUNNING && task_is_running(task));
    print_test_result(results, "Transition to RUNNING", test2);
    
    // Test 3: Transition to BLOCKED
    task_transition_to_blocked(task);
    bool test3 = (task_get_state(task) == TASK_BLOCKED && task_is_blocked(task));
    print_test_result(results, "Transition to BLOCKED", test3);
    
    // Test 4: Transition to SUSPENDED
    task_transition_to_suspended(task);
    bool test4 = (task_get_state(task) == TASK_SUSPENDED && task_is_suspended(task));
    print_test_result(results, "Transition to SUSPENDED", test4);
    
    // Test 5: Transition back to READY
    task_transition_to_ready(task);
    bool test5 = (task_get_state(task) == TASK_READY && task_is_ready(task));
    print_test_result(results, "Transition back to READY", test5);
    
    task_destroy(task);
}

void test_task_data_management(TestResults* results) {
    printf("\n=== Task Data Management Tests ===\n");
    
    Task* task = task_create(1, 5, NULL);
    if (!task) {
        print_test_result(results, "Task data test setup", false);
        return;
    }
    
    // Test 1: Initial NULL data
    bool test1 = (task_get_data(task) == NULL);
    print_test_result(results, "Initial NULL data", test1);
    
    // Test 2: Set data
    char* test_data = "Hello, RTOS!";
    task_set_data(task, test_data);
    bool test2 = (task_get_data(task) == test_data);
    print_test_result(results, "Set task data", test2);
    
    // Test 3: Update data
    int* int_data = (int*)malloc(sizeof(int));
    *int_data = 123;
    task_set_data(task, int_data);
    bool test3 = (task_get_data(task) == int_data && *(int*)task_get_data(task) == 123);
    print_test_result(results, "Update task data", test3);
    
    // Test 4: Clear data
    task_set_data(task, NULL);
    bool test4 = (task_get_data(task) == NULL);
    print_test_result(results, "Clear task data", test4);
    
    free(int_data);
    task_destroy(task);
}

void test_task_synchronization_fields(TestResults* results) {
    printf("\n=== Task Synchronization Fields Tests ===\n");
    
    Task* task = task_create(1, 5, NULL);
    if (!task) {
        print_test_result(results, "Task sync test setup", false);
        return;
    }
    
    // Test 1: Initial synchronization state
    bool test1 = (task_get_waiting_semaphore(task) == NULL &&
                  task_get_waiting_event(task) == NULL &&
                  task_get_waiting_signal(task) == NULL &&
                  task_get_waiting_message_queue(task) == NULL &&
                  task_get_event_mask(task) == 0 &&
                  task_get_clear_on_exit(task) == true);
    print_test_result(results, "Initial synchronization state", test1);
    
    // Test 2: Set event mask
    task_set_event_mask(task, 0xFF00);
    bool test2 = (task_get_event_mask(task) == 0xFF00);
    print_test_result(results, "Set event mask", test2);
    
    // Test 3: Set clear on exit
    task_set_clear_on_exit(task, false);
    bool test3 = (task_get_clear_on_exit(task) == false);
    print_test_result(results, "Set clear on exit", test3);
    
    // Test 4: Clear wait states
    task_clear_wait_states(task);
    bool test4 = (task_get_event_mask(task) == 0 && task_get_clear_on_exit(task) == true);
    print_test_result(results, "Clear wait states", test4);
    
    task_destroy(task);
}

void test_task_comparison_functions(TestResults* results) {
    printf("\n=== Task Comparison Functions Tests ===\n");
    
    Task* task1 = task_create(1, 5, NULL);   // Priority 5
    Task* task2 = task_create(2, 3, NULL);   // Priority 3 (higher priority)
    Task* task3 = task_create(3, 5, NULL);   // Same priority as task1
    Task* task4 = task_create(1, 8, NULL);   // Same ID as task1
    
    if (!task1 || !task2 || !task3 || !task4) {
        print_test_result(results, "Task comparison test setup", false);
        return;
    }
    
    // Test 1: Priority comparison (lower number = higher priority)
    bool test1 = task_greater_than(task2, task1);  // task2 (priority 3) > task1 (priority 5)
    print_test_result(results, "Higher priority comparison", test1);
    
    bool test1b = task_less_than(task1, task2);    // task1 (priority 5) < task2 (priority 3)
    print_test_result(results, "Lower priority comparison", test1b);
    
    // Test 2: Equal priority comparison
    bool test2 = (!task_greater_than(task1, task3) && !task_less_than(task1, task3));
    print_test_result(results, "Equal priority comparison", test2);
    
    // Test 3: Task equality by ID
    bool test3 = task_equal(task1, task4);  // Same ID
    print_test_result(results, "Task equality by ID", test3);
    
    // Test 4: Task inequality
    bool test4 = task_not_equal(task1, task2);  // Different IDs
    print_test_result(results, "Task inequality", test4);
    
    task_destroy(task1);
    task_destroy(task2);
    task_destroy(task3);
    task_destroy(task4);
}

void test_task_string_representation(TestResults* results) {
    printf("\n=== Task String Representation Tests ===\n");
    
    Task* task = task_create(42, 10, NULL);
    if (!task) {
        print_test_result(results, "Task string test setup", false);
        return;
    }
    
    // Test 1: Task to string
    char* task_str = task_to_string(task);
    bool test1 = (task_str != NULL && strstr(task_str, "id=42") != NULL && 
                  strstr(task_str, "priority=10") != NULL);
    print_test_result(results, "Task to string representation", test1);
    free(task_str);
    
    // Test 2: State to string for each state
    char* ready_str = task_state_to_string(TASK_READY);
    bool test2a = (ready_str != NULL && strcmp(ready_str, "READY") == 0);
    print_test_result(results, "READY state to string", test2a);
    free(ready_str);
    
    task_transition_to_running(task);
    char* running_str = task_state_to_string(TASK_RUNNING);
    bool test2b = (running_str != NULL && strcmp(running_str, "RUNNING") == 0);
    print_test_result(results, "RUNNING state to string", test2b);
    free(running_str);
    
    task_transition_to_blocked(task);
    char* blocked_str = task_state_to_string(TASK_BLOCKED);
    bool test2c = (blocked_str != NULL && strcmp(blocked_str, "BLOCKED") == 0);
    print_test_result(results, "BLOCKED state to string", test2c);
    free(blocked_str);
    
    task_transition_to_suspended(task);
    char* suspended_str = task_state_to_string(TASK_SUSPENDED);
    bool test2d = (suspended_str != NULL && strcmp(suspended_str, "SUSPENDED") == 0);
    print_test_result(results, "SUSPENDED state to string", test2d);
    free(suspended_str);
    
    task_destroy(task);
}

void test_task_execution(TestResults* results) {
    printf("\n=== Task Execution Tests ===\n");
    
    Task* task = task_create(1, 5, NULL);
    if (!task) {
        print_test_result(results, "Task execution test setup", false);
        return;
    }
    
    // Test 1: Task execution (should not crash)
    printf("   Testing task execution (should print task info):\n   ");
    task_execute(task);
    print_test_result(results, "Task execution completed", true);
    
    task_destroy(task);
}

void test_null_pointer_handling(TestResults* results) {
    printf("\n=== NULL Pointer Handling Tests ===\n");
    
    // Test all functions with NULL pointers to ensure they don't crash
    bool test1 = (task_get_id(NULL) == 0);
    print_test_result(results, "NULL task get_id", test1);
    
    bool test2 = (task_get_priority(NULL) == 0);
    print_test_result(results, "NULL task get_priority", test2);
    
    bool test3 = (task_get_state(NULL) == TASK_READY);
    print_test_result(results, "NULL task get_state", test3);
    
    bool test4 = (task_get_data(NULL) == NULL);
    print_test_result(results, "NULL task get_data", test4);
    
    bool test5 = (!task_is_ready(NULL) && !task_is_running(NULL) && 
                  !task_is_blocked(NULL) && !task_is_suspended(NULL));
    print_test_result(results, "NULL task state checks", test5);
    
    // These should not crash
    task_destroy(NULL);
    task_set_data(NULL, NULL);
    task_set_event_mask(NULL, 0);
    task_clear_wait_states(NULL);
    task_execute(NULL);
    print_test_result(results, "NULL pointer operations safety", true);
    
    // Test string functions with NULL
    char* null_str = task_to_string(NULL);
    bool test6 = (null_str != NULL && strstr(null_str, "null") != NULL);
    print_test_result(results, "NULL task to string", test6);
    free(null_str);
}

int main() {
    printf("=== RTOS C Implementation - Task Management Test Suite ===\n");
    printf("Testing task creation, state management, and operations...\n");
    
    TestResults results = {0, 0, 0};
    
    test_task_creation_destruction(&results);
    test_task_state_transitions(&results);
    test_task_data_management(&results);
    test_task_synchronization_fields(&results);
    test_task_comparison_functions(&results);
    test_task_string_representation(&results);
    test_task_execution(&results);
    test_null_pointer_handling(&results);
    
    printf("\n=== Test Summary ===\n");
    printf("Total Tests: %d\n", results.tests_run);
    printf("Passed: %d\n", results.tests_passed);
    printf("Failed: %d\n", results.tests_failed);
    printf("Success Rate: %.1f%%\n", 
           results.tests_run > 0 ? (100.0 * results.tests_passed / results.tests_run) : 0.0);
    
    if (results.tests_failed == 0) {
        printf("\n🎉 ALL TASK MANAGEMENT TESTS PASSED! 🎉\n");
        return 0;
    } else {
        printf("\n❌ Some tests failed. Please check the implementation.\n");
        return 1;
    }
}
