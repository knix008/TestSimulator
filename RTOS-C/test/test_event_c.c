// _CRT_SECURE_NO_WARNINGS defined in CMakeLists.txt
#include "event.h"
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

void test_event_basic_operations(TestResults* results) {
    printf("\n=== Event Basic Operations Tests ===\n");
    
    // Test 1: Event creation
    Event* event = event_create();
    bool test1 = (event != NULL);
    print_test_result(results, "Event creation", test1);
    
    if (!event) return;
    
    // Test 2: Initial event bits should be 0
    uint32_t initial_bits = event_get_bits(event);
    bool test2 = (initial_bits == 0);
    print_test_result(results, "Initial event bits are 0", test2);
    
    // Test 3: Set event bits
    bool test3 = event_set(event, 0x01);
    print_test_result(results, "Set event bits", test3);
    
    // Test 4: Verify bits are set
    uint32_t bits_after_set = event_get_bits(event);
    bool test4 = (bits_after_set == 0x01);
    print_test_result(results, "Event bits set correctly", test4);
    
    // Test 5: Set additional bits
    event_set(event, 0x04);
    uint32_t multiple_bits = event_get_bits(event);
    bool test5 = (multiple_bits == 0x05); // 0x01 | 0x04
    print_test_result(results, "Multiple event bits set", test5);
    
    // Test 6: Clear specific bits
    bool test6 = event_clear(event, 0x01);
    print_test_result(results, "Clear event bits", test6);
    
    // Test 7: Verify bits cleared correctly
    uint32_t bits_after_clear = event_get_bits(event);
    bool test7 = (bits_after_clear == 0x04);
    print_test_result(results, "Event bits cleared correctly", test7);
    
    // Test 8: Wait for existing bits (should succeed immediately)
    bool test8 = event_wait(event, 0x04, false, 100);
    print_test_result(results, "Wait for existing bits", test8);
    
    // Test 9: Wait for non-existing bits (should timeout)
    bool test9 = !event_wait(event, 0x08, false, 50);
    print_test_result(results, "Wait timeout for non-existing bits", test9);
    
    event_destroy(event);
}

void test_event_manager_operations(TestResults* results) {
    printf("\n=== Event Manager Operations Tests ===\n");
    
    // Test 1: Manager creation
    EventManager* manager = event_manager_create();
    bool test1 = (manager != NULL);
    print_test_result(results, "Event manager creation", test1);
    
    if (!manager) return;
    
    // Test 2: Initial state
    size_t initial_count = event_manager_get_event_count(manager);
    bool test2 = (initial_count == 0);
    print_test_result(results, "Initial event count is 0", test2);
    
    // Test 3: Create event through manager
    uint32_t event_id = event_manager_create_event(manager);
    bool test3 = (event_id != 0);
    print_test_result(results, "Create event through manager", test3);
    
    // Test 4: Manager count updated
    size_t count_after_create = event_manager_get_event_count(manager);
    bool test4 = (count_after_create == 1);
    print_test_result(results, "Manager count updated after creation", test4);
    
    // Test 5: Event operations through manager
    bool test5a = event_manager_set(manager, event_id, 0x0F);
    uint32_t bits = event_manager_get_bits(manager, event_id);
    bool test5b = (bits == 0x0F);
    bool test5 = (test5a && test5b);
    print_test_result(results, "Event operations through manager", test5);
    
    // Test 6: Wait through manager
    bool test6 = event_manager_wait(manager, event_id, 0x02, false, 100);
    print_test_result(results, "Wait through manager", test6);
    
    // Test 7: Clear through manager
    bool test7a = event_manager_clear(manager, event_id, 0x04);
    uint32_t bits_after_clear = event_manager_get_bits(manager, event_id);
    bool test7b = (bits_after_clear == 0x0B); // 0x0F & ~0x04
    bool test7 = (test7a && test7b);
    print_test_result(results, "Clear through manager", test7);
    
    // Test 8: Multiple events
    uint32_t event_id2 = event_manager_create_event(manager);
    uint32_t event_id3 = event_manager_create_event(manager);
    
    size_t multiple_count = event_manager_get_event_count(manager);
    bool test8 = (multiple_count == 3 && event_id2 != 0 && event_id3 != 0);
    print_test_result(results, "Multiple events creation", test8);
    
    // Test 9: Delete event
    bool test9 = event_manager_delete_event(manager, event_id2);
    print_test_result(results, "Delete event", test9);
    
    size_t count_after_delete = event_manager_get_event_count(manager);
    bool test9b = (count_after_delete == 2);
    print_test_result(results, "Count updated after deletion", test9b);
    
    event_manager_destroy(manager);
}

void test_event_bit_patterns(TestResults* results) {
    printf("\n=== Event Bit Patterns Tests ===\n");
    
    EventManager* manager = event_manager_create();
    if (!manager) {
        print_test_result(results, "Bit patterns test setup", false);
        return;
    }
    
    uint32_t event_id = event_manager_create_event(manager);
    
    // Test various bit patterns
    uint32_t patterns[] = {0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80,
                          0xFF, 0x0F0F, 0xF0F0, 0xAAAA, 0x5555, 0xFFFFFFFF};
    int num_patterns = sizeof(patterns) / sizeof(patterns[0]);
    
    bool all_patterns_ok = true;
    
    for (int i = 0; i < num_patterns; i++) {
        // Set pattern
        event_manager_set(manager, event_id, patterns[i]);
        uint32_t read_bits = event_manager_get_bits(manager, event_id);
        
        if (read_bits != patterns[i]) {
            all_patterns_ok = false;
            break;
        }
        
        // Clear pattern
        event_manager_clear(manager, event_id, patterns[i]);
        uint32_t cleared_bits = event_manager_get_bits(manager, event_id);
        
        if (cleared_bits != 0) {
            all_patterns_ok = false;
            break;
        }
    }
    
    print_test_result(results, "All bit patterns handled correctly", all_patterns_ok);
    
    // Test complex bit operations
    event_manager_set(manager, event_id, 0xFF);
    event_manager_clear(manager, event_id, 0x0F);
    uint32_t complex_result = event_manager_get_bits(manager, event_id);
    bool test_complex = (complex_result == 0xF0);
    print_test_result(results, "Complex bit operations", test_complex);
    
    event_manager_destroy(manager);
}

void test_event_wait_scenarios(TestResults* results) {
    printf("\n=== Event Wait Scenarios Tests ===\n");
    
    EventManager* manager = event_manager_create();
    if (!manager) {
        print_test_result(results, "Wait scenarios test setup", false);
        return;
    }
    
    uint32_t event_id = event_manager_create_event(manager);
    
    // Test 1: Wait for single bit
    event_manager_set(manager, event_id, 0x02);
    bool test1 = event_manager_wait(manager, event_id, 0x02, false, 100);
    print_test_result(results, "Wait for single bit", test1);
    
    // Test 2: Wait for multiple bits (all must be set)
    // Clear all bits first to ensure clean state
    event_manager_clear(manager, event_id, 0xFFFFFFFF);
    event_manager_set(manager, event_id, 0x05); // Set bits 0 and 2 (binary: 101)
    
    bool test2a = event_manager_wait(manager, event_id, 0x05, false, 100); // Should succeed (all bits present)
    bool test2b = !event_manager_wait(manager, event_id, 0x07, false, 50); // Should timeout (bit 1 not set, binary: 111)
    bool test2 = (test2a && test2b);
    print_test_result(results, "Wait for multiple bits", test2);
    
    // Test 3: Wait with clear on exit
    // Clear all bits first, then set specific bits for this test
    event_manager_clear(manager, event_id, 0xFFFFFFFF);
    event_manager_set(manager, event_id, 0x0C); // Set bits 2 and 3
    
    bool test3a = event_manager_wait(manager, event_id, 0x08, true, 100); // Wait for bit 3, clear on exit
    uint32_t bits_after_clear_wait = event_manager_get_bits(manager, event_id);
    bool test3b = (bits_after_clear_wait == 0x04); // Only bit 2 should remain (0x08 cleared)
    bool test3 = (test3a && test3b);
    print_test_result(results, "Wait with clear on exit", test3);
    
    // Test 4: Wait without clear on exit
    event_manager_set(manager, event_id, 0x10);
    bool test4a = event_manager_wait(manager, event_id, 0x10, false, 100);
    uint32_t bits_after_no_clear = event_manager_get_bits(manager, event_id);
    bool test4b = ((bits_after_no_clear & 0x10) != 0); // 0x10 should remain
    bool test4 = (test4a && test4b);
    print_test_result(results, "Wait without clear on exit", test4);
    
    event_manager_destroy(manager);
}

int main() {
    printf("=== RTOS C Implementation - Event Test Suite ===\n");
    printf("Testing event functionality and inter-task communication...\n");
    
    TestResults results = {0, 0, 0};
    
    test_event_basic_operations(&results);
    test_event_manager_operations(&results);
    test_event_bit_patterns(&results);
    test_event_wait_scenarios(&results);
    
    printf("\n=== Test Summary ===\n");
    printf("Total Tests: %d\n", results.tests_run);
    printf("Passed: %d\n", results.tests_passed);
    printf("Failed: %d\n", results.tests_failed);
    printf("Success Rate: %.1f%%\n", 
           results.tests_run > 0 ? (100.0 * results.tests_passed / results.tests_run) : 0.0);
    
    if (results.tests_failed == 0) {
        printf("\n🎉 ALL EVENT TESTS PASSED! 🎉\n");
        return 0;
    } else {
        printf("\n❌ Some event tests failed. Please check the implementation.\n");
        return 1;
    }
}
