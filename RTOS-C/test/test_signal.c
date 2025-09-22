#include "../include/signal.h"
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

// Test function declarations
void test_signal_basic_operations(void);
void test_signal_send_wait(void);
void test_signal_manager_operations(void);
void test_signal_edge_cases(void);

int main() {
    printf("====================================================\n");
    printf("             Signal Component Tests               \n");
    printf("====================================================\n");
    
    test_signal_basic_operations();
    test_signal_send_wait();
    test_signal_manager_operations();
    test_signal_edge_cases();
    
    printf("\n====================================================\n");
    printf("           All Signal Tests PASSED!              \n");
    printf("====================================================\n");
    
    return 0;
}

void test_signal_basic_operations(void) {
    printf("\n--- Testing Basic Signal Operations ---\n");
    
    Signal signal;
    signal_init(&signal, 1001);
    
    // Test initial state
    assert(!signal_is_signaled(&signal));
    assert(signal.id == 1001);
    printf("✓ Initial state correct (not signaled)\n");
    
    // Test sending signal
    assert(signal_send(&signal));
    assert(signal_is_signaled(&signal));
    printf("✓ Signal sent successfully\n");
    
    // Test sending signal again (should still be signaled)
    assert(signal_send(&signal));
    assert(signal_is_signaled(&signal));
    printf("✓ Multiple sends handled correctly\n");
    
    // Test clearing signal
    assert(signal_clear(&signal));
    assert(!signal_is_signaled(&signal));
    printf("✓ Signal cleared successfully\n");
    
    // Test clearing already cleared signal
    assert(signal_clear(&signal));
    assert(!signal_is_signaled(&signal));
    printf("✓ Clear already cleared signal handled correctly\n");
    
    printf("Basic operations test PASSED\n");
}

void test_signal_send_wait(void) {
    printf("\n--- Testing Signal Send/Wait Operations ---\n");
    
    Signal signal;
    signal_init(&signal, 2001);
    
    // Test wait with no timeout (should fail immediately if not signaled)
    assert(!signal_wait(&signal, 0));
    printf("✓ Wait with no timeout correctly failed\n");
    
    // Test send then wait
    assert(signal_send(&signal));
    assert(signal_wait(&signal, 0)); // Should succeed and consume signal
    assert(!signal_is_signaled(&signal)); // Signal should be consumed
    printf("✓ Send then wait successful (signal consumed)\n");
    
    // Test wait after signal consumed
    assert(!signal_wait(&signal, 0)); // Should fail (no signal)
    printf("✓ Wait after signal consumed correctly failed\n");
    
    // Test send, wait with timeout
    assert(signal_send(&signal));
    assert(signal_wait(&signal, 100)); // 100ms timeout
    assert(!signal_is_signaled(&signal)); // Signal consumed
    printf("✓ Send then wait with timeout successful\n");
    
    // Test multiple sends, single wait
    assert(signal_send(&signal));
    assert(signal_send(&signal));
    assert(signal_send(&signal));
    assert(signal_is_signaled(&signal));
    
    assert(signal_wait(&signal, 0)); // Should consume one signal
    assert(!signal_is_signaled(&signal)); // Should be cleared
    printf("✓ Multiple sends, single wait (signal consumed)\n");
    
    // Test send, wait, send, wait pattern
    assert(signal_send(&signal));
    assert(signal_wait(&signal, 0));
    assert(signal_send(&signal));
    assert(signal_wait(&signal, 0));
    assert(!signal_is_signaled(&signal));
    printf("✓ Send-wait-send-wait pattern successful\n");
    
    printf("Send/Wait operations test PASSED\n");
}

void test_signal_manager_operations(void) {
    printf("\n--- Testing Signal Manager Operations ---\n");
    
    SignalManager manager;
    signal_manager_init(&manager);
    
    // Test initial state
    assert(signal_manager_get_signal_count(&manager) == 0);
    printf("✓ Manager initial state correct\n");
    
    // Test creating signals
    uint32_t signal1_id = signal_manager_create_signal(&manager);
    uint32_t signal2_id = signal_manager_create_signal(&manager);
    
    assert(signal1_id != 0);
    assert(signal2_id != 0);
    assert(signal1_id != signal2_id);
    assert(signal_manager_get_signal_count(&manager) == 2);
    printf("✓ Two signals created successfully\n");
    
    // Test getting signals
    Signal* signal1 = signal_manager_get_signal(&manager, signal1_id);
    Signal* signal2 = signal_manager_get_signal(&manager, signal2_id);
    
    assert(signal1 != NULL);
    assert(signal2 != NULL);
    assert(!signal_is_signaled(signal1));
    assert(!signal_is_signaled(signal2));
    (void)signal1; // Suppress unused variable warning
    (void)signal2; // Suppress unused variable warning
    printf("✓ Signals retrieved correctly\n");
    
    // Test manager operations
    assert(signal_manager_send(&manager, signal1_id));
    assert(signal_is_signaled(signal1));
    printf("✓ Manager send operation works\n");
    
    assert(signal_manager_is_signaled(&manager, signal1_id));
    assert(!signal_manager_is_signaled(&manager, signal2_id));
    printf("✓ Manager is_signaled operation works\n");
    
    assert(signal_manager_wait(&manager, signal1_id, 0));
    assert(!signal_is_signaled(signal1)); // Signal consumed
    printf("✓ Manager wait operation works\n");
    
    assert(signal_manager_clear(&manager, signal2_id));
    assert(!signal_is_signaled(signal2));
    printf("✓ Manager clear operation works\n");
    
    // Test operations on non-existent signal
    assert(!signal_manager_send(&manager, 999));
    assert(!signal_manager_is_signaled(&manager, 999));
    assert(!signal_manager_wait(&manager, 999, 0));
    assert(!signal_manager_clear(&manager, 999));
    printf("✓ Non-existent signal operations handled correctly\n");
    
    // Test deleting signals
    assert(signal_manager_delete_signal(&manager, signal1_id));
    assert(signal_manager_get_signal(&manager, signal1_id) == NULL);
    assert(signal_manager_get_signal_count(&manager) == 1);
    printf("✓ Signal deletion works\n");
    
    // Test deleting non-existent signal
    assert(!signal_manager_delete_signal(&manager, 999));
    assert(signal_manager_get_signal_count(&manager) == 1);
    printf("✓ Non-existent signal deletion handling correct\n");
    
    signal_manager_destroy(&manager);
    printf("Manager operations test PASSED\n");
}

void test_signal_edge_cases(void) {
    printf("\n--- Testing Edge Cases ---\n");
    
    Signal signal;
    signal_init(&signal, 3001);
    
    // Test NULL parameters
    assert(!signal_send(NULL));
    assert(!signal_wait(NULL, 0));
    assert(!signal_is_signaled(NULL));
    assert(!signal_clear(NULL));
    printf("✓ NULL signal parameter handling correct\n");
    
    // Test operations on signaled signal
    assert(signal_send(&signal));
    assert(signal_is_signaled(&signal));
    
    assert(signal_send(&signal)); // Send again
    assert(signal_is_signaled(&signal)); // Still signaled
    printf("✓ Multiple sends on signaled signal handled correctly\n");
    
    assert(signal_clear(&signal));
    assert(!signal_is_signaled(&signal));
    printf("✓ Clear signaled signal successful\n");
    
    // Test wait with different timeout values
    assert(signal_send(&signal));
    assert(signal_wait(&signal, 1)); // 1ms timeout
    assert(!signal_is_signaled(&signal));
    printf("✓ Wait with 1ms timeout successful\n");
    
    assert(!signal_wait(&signal, 0)); // No timeout
    printf("✓ Wait with no timeout correctly failed\n");
    
    // Test manager edge cases
    SignalManager manager;
    signal_manager_init(&manager);
    
    assert(!signal_manager_send(NULL, 1));
    assert(!signal_manager_wait(NULL, 1, 0));
    assert(!signal_manager_is_signaled(NULL, 1));
    assert(!signal_manager_clear(NULL, 1));
    assert(!signal_manager_send(&manager, 999)); // Non-existent signal
    assert(!signal_manager_wait(&manager, 999, 0)); // Non-existent signal
    assert(!signal_manager_is_signaled(&manager, 999)); // Non-existent signal
    assert(!signal_manager_clear(&manager, 999)); // Non-existent signal
    printf("✓ Manager edge case handling correct\n");
    
    // Test creating maximum number of signals
    uint32_t signal_ids[MAX_SIGNALS];
    for (int i = 0; i < MAX_SIGNALS; i++) {
        signal_ids[i] = signal_manager_create_signal(&manager);
        assert(signal_ids[i] != 0);
    }
    assert(signal_manager_get_signal_count(&manager) == MAX_SIGNALS);
    printf("✓ Maximum number of signals created successfully\n");
    
    // Test creating signal when manager is full
    uint32_t overflow_signal = signal_manager_create_signal(&manager);
    assert(overflow_signal == 0); // Should fail
    (void)overflow_signal; // Suppress unused variable warning
    assert(signal_manager_get_signal_count(&manager) == MAX_SIGNALS);
    printf("✓ Signal creation when manager full correctly failed\n");
    
    signal_manager_destroy(&manager);
    printf("Edge cases test PASSED\n");
}
