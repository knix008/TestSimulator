#include "../include/event.h"
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

// Test function declarations
void test_event_basic_operations(void);
void test_event_bit_operations(void);
void test_event_wait_operations(void);
void test_event_manager_operations(void);
void test_event_edge_cases(void);

int main() {
    printf("====================================================\n");
    printf("             Event Component Tests                 \n");
    printf("====================================================\n");
    
    test_event_basic_operations();
    test_event_bit_operations();
    test_event_wait_operations();
    test_event_manager_operations();
    test_event_edge_cases();
    
    printf("\n====================================================\n");
    printf("           All Event Tests PASSED!                \n");
    printf("====================================================\n");
    
    return 0;
}

void test_event_basic_operations(void) {
    printf("\n--- Testing Basic Event Operations ---\n");
    
    Event event;
    event_init(&event, 1001);
    
    // Test initial state
    assert(event_get_bits(&event) == 0);
    assert(event.id == 1001);
    printf("✓ Initial state correct (bits: 0)\n");
    
    // Test setting bits
    assert(event_set(&event, 0x01));
    assert(event_get_bits(&event) == 0x01);
    printf("✓ Set bit 0 successful (bits: 0x01)\n");
    
    assert(event_set(&event, 0x02));
    assert(event_get_bits(&event) == 0x03);
    printf("✓ Set bit 1 successful (bits: 0x03)\n");
    
    assert(event_set(&event, 0x08));
    assert(event_get_bits(&event) == 0x0B);
    printf("✓ Set bit 3 successful (bits: 0x0B)\n");
    
    // Test clearing bits
    assert(event_clear(&event, 0x02));
    assert(event_get_bits(&event) == 0x09);
    printf("✓ Clear bit 1 successful (bits: 0x09)\n");
    
    assert(event_clear(&event, 0x08));
    assert(event_get_bits(&event) == 0x01);
    printf("✓ Clear bit 3 successful (bits: 0x01)\n");
    
    assert(event_clear(&event, 0x01));
    assert(event_get_bits(&event) == 0x00);
    printf("✓ Clear bit 0 successful (bits: 0x00)\n");
    
    printf("Basic operations test PASSED\n");
}

void test_event_bit_operations(void) {
    printf("\n--- Testing Event Bit Operations ---\n");
    
    Event event;
    event_init(&event, 2001);
    
    // Test setting multiple bits at once
    assert(event_set(&event, 0xFF));
    assert(event_get_bits(&event) == 0xFF);
    printf("✓ Set multiple bits successful (bits: 0xFF)\n");
    
    // Test clearing multiple bits at once
    assert(event_clear(&event, 0xF0));
    assert(event_get_bits(&event) == 0x0F);
    printf("✓ Clear multiple bits successful (bits: 0x0F)\n");
    
    // Test setting overlapping bits
    assert(event_set(&event, 0x33));
    assert(event_get_bits(&event) == 0x3F);
    printf("✓ Set overlapping bits successful (bits: 0x3F)\n");
    
    // Test clearing overlapping bits
    assert(event_clear(&event, 0x15));
    assert(event_get_bits(&event) == 0x2A);
    printf("✓ Clear overlapping bits successful (bits: 0x2A)\n");
    
    // Test setting all bits
    assert(event_set(&event, 0xFFFFFFFF));
    assert(event_get_bits(&event) == 0xFFFFFFFF);
    printf("✓ Set all bits successful (bits: 0xFFFFFFFF)\n");
    
    // Test clearing all bits
    assert(event_clear(&event, 0xFFFFFFFF));
    assert(event_get_bits(&event) == 0x00000000);
    printf("✓ Clear all bits successful (bits: 0x00000000)\n");
    
    printf("Bit operations test PASSED\n");
}

void test_event_wait_operations(void) {
    printf("\n--- Testing Event Wait Operations ---\n");
    
    Event event;
    event_init(&event, 3001);
    
    // Test wait with no timeout (should fail immediately if bits not set)
    assert(!event_wait(&event, 0x01, false, 0));
    printf("✓ Wait with no timeout correctly failed\n");
    
    // Test wait after setting bits
    assert(event_set(&event, 0x05));
    assert(event_wait(&event, 0x01, false, 0));
    assert(event_get_bits(&event) == 0x05); // Bits should remain
    printf("✓ Wait successful without clearing bits\n");
    
    assert(event_wait(&event, 0x04, true, 0)); // Clear on exit
    assert(event_get_bits(&event) == 0x01); // Bit 2 should be cleared
    printf("✓ Wait successful with clearing bits\n");
    
    // Test wait for multiple bits
    assert(event_set(&event, 0x0A));
    assert(event_wait(&event, 0x0A, false, 0)); // Wait for both bits 1 and 3
    assert(event_get_bits(&event) == 0x0B); // All bits should be present
    printf("✓ Wait for multiple bits successful\n");
    
    // Test wait for bits that are not all set
    assert(!event_wait(&event, 0x1F, false, 0)); // Wait for bits that aren't all set
    printf("✓ Wait for partially set bits correctly failed\n");
    
    // Test wait with clear on exit
    assert(event_set(&event, 0x03));
    assert(event_wait(&event, 0x03, true, 0));
    assert(event_get_bits(&event) == 0x08); // Only bit 3 should remain
    printf("✓ Wait with clear on exit successful\n");
    
    printf("Wait operations test PASSED\n");
}

void test_event_manager_operations(void) {
    printf("\n--- Testing Event Manager Operations ---\n");
    
    EventManager manager;
    event_manager_init(&manager);
    
    // Test initial state
    assert(event_manager_get_event_count(&manager) == 0);
    printf("✓ Manager initial state correct\n");
    
    // Test creating events
    uint32_t event1_id = event_manager_create_event(&manager);
    uint32_t event2_id = event_manager_create_event(&manager);
    
    assert(event1_id != 0);
    assert(event2_id != 0);
    assert(event1_id != event2_id);
    assert(event_manager_get_event_count(&manager) == 2);
    printf("✓ Two events created successfully\n");
    
    // Test getting events
    Event* event1 = event_manager_get_event(&manager, event1_id);
    Event* event2 = event_manager_get_event(&manager, event2_id);
    
    assert(event1 != NULL);
    assert(event2 != NULL);
    assert(event_get_bits(event1) == 0);
    assert(event_get_bits(event2) == 0);
    printf("✓ Events retrieved correctly\n");
    
    // Test manager operations
    assert(event_manager_set(&manager, event1_id, 0x01));
    assert(event_get_bits(event1) == 0x01);
    printf("✓ Manager set operation works\n");
    
    assert(event_manager_clear(&manager, event1_id, 0x01));
    assert(event_get_bits(event1) == 0x00);
    printf("✓ Manager clear operation works\n");
    
    assert(event_manager_set(&manager, event2_id, 0xFF));
    assert(event_manager_get_bits(&manager, event2_id) == 0xFF);
    printf("✓ Manager get bits operation works\n");
    
    // Test wait through manager
    assert(event_manager_wait(&manager, event2_id, 0x0F, false, 0));
    assert(event_get_bits(event2) == 0xFF); // Should remain unchanged
    printf("✓ Manager wait operation works\n");
    
    // Test deleting events
    assert(event_manager_delete_event(&manager, event1_id));
    assert(event_manager_get_event(&manager, event1_id) == NULL);
    assert(event_manager_get_event_count(&manager) == 1);
    printf("✓ Event deletion works\n");
    
    // Test deleting non-existent event
    assert(!event_manager_delete_event(&manager, 999));
    assert(event_manager_get_event_count(&manager) == 1);
    printf("✓ Non-existent event deletion handling correct\n");
    
    event_manager_destroy(&manager);
    printf("Manager operations test PASSED\n");
}

void test_event_edge_cases(void) {
    printf("\n--- Testing Edge Cases ---\n");
    
    Event event;
    event_init(&event, 4001);
    
    // Test NULL parameters
    assert(!event_set(NULL, 0x01));
    assert(!event_clear(NULL, 0x01));
    assert(event_get_bits(NULL) == 0);
    assert(!event_wait(NULL, 0x01, false, 0));
    printf("✓ NULL event parameter handling correct\n");
    
    // Test operations with zero bits
    assert(event_set(&event, 0x00));
    assert(event_get_bits(&event) == 0x00);
    printf("✓ Set zero bits handling correct\n");
    
    assert(event_clear(&event, 0x00));
    assert(event_get_bits(&event) == 0x00);
    printf("✓ Clear zero bits handling correct\n");
    
    // Test wait with zero bits
    assert(event_wait(&event, 0x00, false, 0)); // Should succeed (all zero bits are set)
    printf("✓ Wait for zero bits handling correct\n");
    
    // Test wait with clear on exit for zero bits
    assert(event_wait(&event, 0x00, true, 0)); // Should succeed and clear nothing
    assert(event_get_bits(&event) == 0x00);
    printf("✓ Wait for zero bits with clear on exit handling correct\n");
    
    // Test maximum bits
    assert(event_set(&event, 0xFFFFFFFF));
    assert(event_get_bits(&event) == 0xFFFFFFFF);
    printf("✓ Set maximum bits successful\n");
    
    assert(event_wait(&event, 0xFFFFFFFF, false, 0));
    assert(event_get_bits(&event) == 0xFFFFFFFF);
    printf("✓ Wait for maximum bits successful\n");
    
    // Test manager edge cases
    EventManager manager;
    event_manager_init(&manager);
    
    assert(!event_manager_set(NULL, 1, 0x01));
    assert(!event_manager_clear(NULL, 1, 0x01));
    assert(event_manager_get_bits(NULL, 1) == 0);
    assert(!event_manager_wait(NULL, 1, 0x01, false, 0));
    assert(!event_manager_set(&manager, 999, 0x01)); // Non-existent event
    assert(!event_manager_clear(&manager, 999, 0x01)); // Non-existent event
    assert(event_manager_get_bits(&manager, 999) == 0); // Non-existent event
    assert(!event_manager_wait(&manager, 999, 0x01, false, 0)); // Non-existent event
    printf("✓ Manager edge case handling correct\n");
    
    event_manager_destroy(&manager);
    printf("Edge cases test PASSED\n");
}
