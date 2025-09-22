#include "../include/timer.h"
#include "../include/clock.h"
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <string.h>

// Test function declarations
void test_timer_basic_operations(void);
void test_timer_one_shot_behavior(void);
void test_timer_periodic_behavior(void);
void test_timer_manager_operations(void);
void test_timer_edge_cases(void);

// Timer callback for testing
static int callback_count = 0;
static uint32_t last_timer_id = 0;

void test_timer_callback(uint32_t timer_id, void* user_data) {
    (void)user_data; // Suppress unused parameter warning
    callback_count++;
    last_timer_id = timer_id;
    printf("  Timer callback executed (ID: %u, count: %d)\n", timer_id, callback_count);
}

int main() {
    printf("====================================================\n");
    printf("              Timer Component Tests               \n");
    printf("====================================================\n");
    
    test_timer_basic_operations();
    test_timer_one_shot_behavior();
    test_timer_periodic_behavior();
    test_timer_manager_operations();
    test_timer_edge_cases();
    
    printf("\n====================================================\n");
    printf("            All Timer Tests PASSED!               \n");
    printf("====================================================\n");
    
    return 0;
}

void test_timer_basic_operations(void) {
    printf("\n--- Testing Basic Timer Operations ---\n");
    
    Timer timer;
    timer_init(&timer, 1, "TestTimer", TIMER_ONE_SHOT, 1000, test_timer_callback, NULL, NULL);
    
    // Test initial state
    assert(timer_get_id(&timer) == 1);
    assert(strcmp(timer_get_name(&timer), "TestTimer") == 0);
    assert(timer_get_type(&timer) == TIMER_ONE_SHOT);
    assert(timer_get_state(&timer) == TIMER_STOPPED);
    assert(timer_get_interval(&timer) == 1000);
    assert(timer_get_remaining_time(&timer) == 0);
    assert(timer_get_user_data(&timer) == NULL);
    printf("✓ Initial state correct\n");
    
    // Test setters
    timer_set_callback(&timer, test_timer_callback);
    timer_set_user_data(&timer, (void*)0x12345678);
    assert(timer_get_user_data(&timer) == (void*)0x12345678);
    printf("✓ Setters work correctly\n");
    
    printf("Basic operations test PASSED\n");
}

void test_timer_one_shot_behavior(void) {
    printf("\n--- Testing One-Shot Timer Behavior ---\n");
    
    Timer timer;
    timer_init(&timer, 2, "OneShotTimer", TIMER_ONE_SHOT, 100, test_timer_callback, NULL, NULL);
    
    // Reset callback count
    callback_count = 0;
    last_timer_id = 0;
    
    // Test starting timer
    printf("Starting timer...\n");
    assert(timer_start(&timer));
    printf("Timer started, checking state...\n");
    assert(timer_get_state(&timer) == TIMER_RUNNING);
    printf("✓ One-shot timer started\n");
    
    // Test timer execution (simulate time passing)
    printf("Simulating timer execution...\n");
    timer_execute(&timer);
    printf("Timer executed, checking state...\n");
    
    // Note: In a real implementation, the callback would be called after the interval
    // For testing, we'll verify the timer state
    assert(timer_get_state(&timer) == TIMER_STOPPED); // One-shot timer stops after execution
    printf("✓ Timer execution simulated\n");
    
    // Test stopping timer
    assert(timer_stop(&timer));
    assert(timer_get_state(&timer) == TIMER_STOPPED);
    printf("✓ Timer stopped\n");
    
    // Test restarting timer
    assert(timer_restart(&timer));
    assert(timer_get_state(&timer) == TIMER_RUNNING);
    printf("✓ Timer restarted\n");
    
    // Test resetting timer
    assert(timer_reset(&timer));
    assert(timer_get_state(&timer) == TIMER_STOPPED);
    assert(timer_get_remaining_time(&timer) == 0);
    printf("✓ Timer reset\n");
    
    printf("One-shot timer behavior test PASSED\n");
}

void test_timer_periodic_behavior(void) {
    printf("\n--- Testing Periodic Timer Behavior ---\n");
    
    Timer timer;
    timer_init(&timer, 3, "PeriodicTimer", TIMER_PERIODIC, 200, test_timer_callback, NULL, NULL);
    
    // Test starting periodic timer
    assert(timer_start(&timer));
    assert(timer_get_state(&timer) == TIMER_RUNNING);
    assert(timer_get_type(&timer) == TIMER_PERIODIC);
    printf("✓ Periodic timer started\n");
    
    // Test multiple executions (simulate periodic behavior)
    for (int i = 0; i < 3; i++) {
        timer_execute(&timer);
        printf("✓ Periodic execution %d simulated\n", i + 1);
    }
    
    // Test stopping periodic timer
    assert(timer_stop(&timer));
    assert(timer_get_state(&timer) == TIMER_STOPPED);
    printf("✓ Periodic timer stopped\n");
    
    printf("Periodic timer behavior test PASSED\n");
}

void test_timer_manager_operations(void) {
    printf("\n--- Testing Timer Manager Operations ---\n");
    
    TimerManager manager;
    timer_manager_init(&manager);
    
    // Test initial state
    assert(timer_manager_get_timer_count(&manager) == 0);
    assert(timer_manager_get_running_timer_count(&manager) == 0);
    printf("✓ Manager initial state correct\n");
    
    // Test creating timers
    uint32_t timer1_id = timer_manager_create_timer(&manager, "Timer1", TIMER_ONE_SHOT, 500, test_timer_callback, NULL);
    uint32_t timer2_id = timer_manager_create_timer(&manager, "Timer2", TIMER_PERIODIC, 1000, test_timer_callback, NULL);
    
    assert(timer1_id != 0);
    assert(timer2_id != 0);
    assert(timer1_id != timer2_id);
    assert(timer_manager_get_timer_count(&manager) == 2);
    printf("✓ Two timers created successfully\n");
    
    // Test getting timers
    Timer* timer1 = timer_manager_get_timer(&manager, timer1_id);
    Timer* timer2 = timer_manager_get_timer(&manager, timer2_id);
    
    assert(timer1 != NULL);
    assert(timer2 != NULL);
    assert(timer_get_type(timer1) == TIMER_ONE_SHOT);
    assert(timer_get_type(timer2) == TIMER_PERIODIC);
    (void)timer1; // Suppress unused variable warning
    (void)timer2; // Suppress unused variable warning
    printf("✓ Timers retrieved correctly\n");
    
    // Test manager operations
    assert(timer_manager_start_timer(&manager, timer1_id));
    assert(timer_get_state(timer1) == TIMER_RUNNING);
    assert(timer_manager_get_running_timer_count(&manager) == 1);
    printf("✓ Manager start operation works\n");
    
    assert(timer_manager_stop_timer(&manager, timer1_id));
    assert(timer_get_state(timer1) == TIMER_STOPPED);
    assert(timer_manager_get_running_timer_count(&manager) == 0);
    printf("✓ Manager stop operation works\n");
    
    // Test manager start/stop
    assert(timer_manager_start(&manager));
    assert(timer_manager_is_running(&manager));
    printf("✓ Manager started\n");
    
    assert(timer_manager_stop(&manager));
    assert(!timer_manager_is_running(&manager));
    printf("✓ Manager stopped\n");
    
    // Test deleting timers
    assert(timer_manager_delete_timer(&manager, timer1_id));
    assert(timer_manager_get_timer(&manager, timer1_id) == NULL);
    assert(timer_manager_get_timer_count(&manager) == 1);
    printf("✓ Timer deletion works\n");
    
    // Test deleting non-existent timer
    assert(!timer_manager_delete_timer(&manager, 999));
    assert(timer_manager_get_timer_count(&manager) == 1);
    printf("✓ Non-existent timer deletion handling correct\n");
    
    timer_manager_destroy(&manager);
    printf("Manager operations test PASSED\n");
}

void test_timer_edge_cases(void) {
    printf("\n--- Testing Edge Cases ---\n");
    
    Timer timer;
    timer_init(&timer, 4, "EdgeCaseTimer", TIMER_ONE_SHOT, 0, NULL, NULL, NULL); // Zero interval
    
    // Test NULL parameters
    assert(!timer_start(NULL));
    assert(!timer_stop(NULL));
    assert(!timer_restart(NULL));
    assert(!timer_reset(NULL));
    assert(timer_get_id(NULL) == 0);
    assert(timer_get_name(NULL) == NULL);
    assert(timer_get_type(NULL) == TIMER_ONE_SHOT); // Default value
    assert(timer_get_state(NULL) == TIMER_STOPPED);
    printf("✓ NULL timer parameter handling correct\n");
    
    // Test operations on timer with zero interval
    assert(timer_start(&timer));
    assert(timer_get_state(&timer) == TIMER_RUNNING);
    printf("✓ Timer with zero interval handling\n");
    
    // Test timer with very large interval
    Timer large_timer;
    timer_init(&large_timer, 5, "LargeTimer", TIMER_ONE_SHOT, 0xFFFFFFFF, test_timer_callback, NULL, NULL);
    assert(timer_start(&large_timer));
    assert(timer_get_remaining_time(&large_timer) == 0xFFFFFFFF);
    printf("✓ Timer with large interval handling\n");
    
    // Test timer with NULL callback
    Timer no_callback_timer;
    timer_init(&no_callback_timer, 6, "NoCallbackTimer", TIMER_ONE_SHOT, 100, NULL, NULL, NULL);
    assert(timer_start(&no_callback_timer));
    timer_execute(&no_callback_timer); // Should not crash
    printf("✓ Timer with NULL callback handling\n");
    
    // Test timer with very long name
    char long_name[65]; // Longer than typical limit
    for (int i = 0; i < 64; i++) {
        long_name[i] = 'A' + (i % 26);
    }
    long_name[64] = '\0';
    
    Timer long_name_timer;
    timer_init(&long_name_timer, 7, long_name, TIMER_ONE_SHOT, 100, test_timer_callback, NULL, NULL);
    assert(strcmp(timer_get_name(&long_name_timer), long_name) == 0);
    printf("✓ Timer with long name handling\n");
    
    // Test manager edge cases
    TimerManager manager;
    timer_manager_init(&manager);
    
    assert(!timer_manager_create_timer(NULL, "Test", TIMER_ONE_SHOT, 100, NULL, NULL));
    assert(!timer_manager_start_timer(NULL, 1));
    assert(!timer_manager_stop_timer(NULL, 1));
    assert(!timer_manager_delete_timer(NULL, 1));
    assert(!timer_manager_start_timer(&manager, 999)); // Non-existent timer
    assert(!timer_manager_stop_timer(&manager, 999)); // Non-existent timer
    assert(!timer_manager_delete_timer(&manager, 999)); // Non-existent timer
    printf("✓ Manager edge case handling correct\n");
    
    // Test creating maximum number of timers
    uint32_t timer_ids[MAX_TIMERS];
    for (int i = 0; i < MAX_TIMERS; i++) {
        char name[32];
        sprintf(name, "Timer%d", i);
        timer_ids[i] = timer_manager_create_timer(&manager, name, TIMER_ONE_SHOT, 100, NULL, NULL);
        assert(timer_ids[i] != 0);
    }
    assert(timer_manager_get_timer_count(&manager) == MAX_TIMERS);
    printf("✓ Maximum number of timers created successfully\n");
    
    // Test creating timer when manager is full
    uint32_t overflow_timer = timer_manager_create_timer(&manager, "Overflow", TIMER_ONE_SHOT, 100, NULL, NULL);
    assert(overflow_timer == 0); // Should fail
    (void)overflow_timer; // Suppress unused variable warning
    assert(timer_manager_get_timer_count(&manager) == MAX_TIMERS);
    printf("✓ Timer creation when manager full correctly failed\n");
    
    timer_manager_destroy(&manager);
    printf("Edge cases test PASSED\n");
}
