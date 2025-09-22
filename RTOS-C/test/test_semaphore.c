#include "../include/semaphore.h"
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

// Test function declarations
void test_semaphore_basic_operations(void);
void test_semaphore_wait_post(void);
void test_semaphore_manager_operations(void);
void test_semaphore_edge_cases(void);

int main() {
    printf("====================================================\n");
    printf("           Semaphore Component Tests               \n");
    printf("====================================================\n");
    
    test_semaphore_basic_operations();
    test_semaphore_wait_post();
    test_semaphore_manager_operations();
    test_semaphore_edge_cases();
    
    printf("\n====================================================\n");
    printf("         All Semaphore Tests PASSED!              \n");
    printf("====================================================\n");
    
    return 0;
}

void test_semaphore_basic_operations(void) {
    printf("\n--- Testing Basic Semaphore Operations ---\n");
    
    Semaphore sem;
    semaphore_init(&sem, 3, 1001); // Initial count: 3, ID: 1001
    
    // Test initial state
    assert(semaphore_get_count(&sem) == 3);
    assert(sem.id == 1001);
    printf("✓ Initial state correct (count: 3)\n");
    
    // Test semaphore operations
    assert(semaphore_wait(&sem, 0)); // No wait
    assert(semaphore_get_count(&sem) == 2);
    printf("✓ Semaphore wait successful (count: 2)\n");
    
    assert(semaphore_wait(&sem, 0));
    assert(semaphore_get_count(&sem) == 1);
    printf("✓ Semaphore wait successful (count: 1)\n");
    
    assert(semaphore_wait(&sem, 0));
    assert(semaphore_get_count(&sem) == 0);
    printf("✓ Semaphore wait successful (count: 0)\n");
    
    // Test wait on empty semaphore (should fail with timeout 0)
    assert(!semaphore_wait(&sem, 0));
    assert(semaphore_get_count(&sem) == 0);
    printf("✓ Wait on empty semaphore correctly failed\n");
    
    // Test post operations
    assert(semaphore_post(&sem));
    assert(semaphore_get_count(&sem) == 1);
    printf("✓ Semaphore post successful (count: 1)\n");
    
    assert(semaphore_post(&sem));
    assert(semaphore_get_count(&sem) == 2);
    printf("✓ Semaphore post successful (count: 2)\n");
    
    assert(semaphore_post(&sem));
    assert(semaphore_get_count(&sem) == 3);
    printf("✓ Semaphore post successful (count: 3)\n");
    
    // Test post beyond initial count (should fail)
    assert(!semaphore_post(&sem));
    assert(semaphore_get_count(&sem) == 3);
    printf("✓ Post beyond initial count correctly failed\n");
    
    printf("Basic operations test PASSED\n");
}

void test_semaphore_wait_post(void) {
    printf("\n--- Testing Semaphore Wait/Post Operations ---\n");
    
    Semaphore sem;
    semaphore_init(&sem, 2, 2001); // Initial count: 2
    
    // Test multiple waits
    assert(semaphore_wait(&sem, 0));
    assert(semaphore_get_count(&sem) == 1);
    printf("✓ First wait successful\n");
    
    assert(semaphore_wait(&sem, 0));
    assert(semaphore_get_count(&sem) == 0);
    printf("✓ Second wait successful\n");
    
    // Test wait with timeout (should fail immediately with 0 timeout)
    assert(!semaphore_wait(&sem, 0));
    assert(semaphore_get_count(&sem) == 0);
    printf("✓ Wait with timeout correctly handled\n");
    
    // Test post to allow waiting
    assert(semaphore_post(&sem));
    assert(semaphore_get_count(&sem) == 1);
    printf("✓ Post successful after empty\n");
    
    // Test wait after post
    assert(semaphore_wait(&sem, 0));
    assert(semaphore_get_count(&sem) == 0);
    printf("✓ Wait successful after post\n");
    
    // Test multiple posts
    assert(semaphore_post(&sem));
    assert(semaphore_post(&sem));
    assert(semaphore_get_count(&sem) == 2);
    printf("✓ Multiple posts successful\n");
    
    // Test wait after multiple posts
    assert(semaphore_wait(&sem, 0));
    assert(semaphore_wait(&sem, 0));
    assert(semaphore_get_count(&sem) == 0);
    printf("✓ Multiple waits after posts successful\n");
    
    printf("Wait/Post operations test PASSED\n");
}

void test_semaphore_manager_operations(void) {
    printf("\n--- Testing Semaphore Manager Operations ---\n");
    
    SemaphoreManager manager;
    semaphore_manager_init(&manager);
    
    // Test initial state
    assert(semaphore_manager_get_semaphore_count(&manager) == 0);
    printf("✓ Manager initial state correct\n");
    
    // Test creating semaphores
    uint32_t sem1_id = semaphore_manager_create_semaphore(&manager, 1); // Binary semaphore
    uint32_t sem2_id = semaphore_manager_create_semaphore(&manager, 5); // Counting semaphore
    
    assert(sem1_id != 0);
    assert(sem2_id != 0);
    assert(sem1_id != sem2_id);
    assert(semaphore_manager_get_semaphore_count(&manager) == 2);
    printf("✓ Two semaphores created successfully\n");
    
    // Test getting semaphores
    Semaphore* sem1 = semaphore_manager_get_semaphore(&manager, sem1_id);
    Semaphore* sem2 = semaphore_manager_get_semaphore(&manager, sem2_id);
    
    assert(sem1 != NULL);
    assert(sem2 != NULL);
    assert(semaphore_get_count(sem1) == 1);
    assert(semaphore_get_count(sem2) == 5);
    (void)sem1; // Suppress unused variable warning
    (void)sem2; // Suppress unused variable warning
    printf("✓ Semaphores retrieved correctly\n");
    
    // Test manager operations
    assert(semaphore_manager_wait(&manager, sem1_id, 0));
    assert(semaphore_get_count(sem1) == 0);
    printf("✓ Manager wait operation works\n");
    
    assert(semaphore_manager_post(&manager, sem1_id));
    assert(semaphore_get_count(sem1) == 1);
    printf("✓ Manager post operation works\n");
    
    // Test multiple operations on counting semaphore
    for (int i = 0; i < 3; i++) {
        assert(semaphore_manager_wait(&manager, sem2_id, 0));
    }
    assert(semaphore_get_count(sem2) == 2);
    printf("✓ Multiple manager operations on counting semaphore\n");
    
    // Test deleting semaphores
    assert(semaphore_manager_delete_semaphore(&manager, sem1_id));
    assert(semaphore_manager_get_semaphore(&manager, sem1_id) == NULL);
    assert(semaphore_manager_get_semaphore_count(&manager) == 1);
    printf("✓ Semaphore deletion works\n");
    
    // Test deleting non-existent semaphore
    assert(!semaphore_manager_delete_semaphore(&manager, 999));
    assert(semaphore_manager_get_semaphore_count(&manager) == 1);
    printf("✓ Non-existent semaphore deletion handling correct\n");
    
    semaphore_manager_destroy(&manager);
    printf("Manager operations test PASSED\n");
}

void test_semaphore_edge_cases(void) {
    printf("\n--- Testing Edge Cases ---\n");
    
    Semaphore sem;
    semaphore_init(&sem, 0, 3001); // Start with count 0
    
    // Test NULL parameters
    assert(!semaphore_wait(NULL, 0));
    assert(!semaphore_post(NULL));
    assert(semaphore_get_count(NULL) == 0);
    printf("✓ NULL semaphore parameter handling correct\n");
    
    // Test operations on zero-count semaphore
    assert(!semaphore_wait(&sem, 0)); // Should fail immediately
    assert(semaphore_get_count(&sem) == 0);
    printf("✓ Wait on zero-count semaphore correctly failed\n");
    
    // Test post on zero-count semaphore
    assert(semaphore_post(&sem));
    assert(semaphore_get_count(&sem) == 1);
    printf("✓ Post on zero-count semaphore successful\n");
    
    // Test large initial count
    Semaphore large_sem;
    semaphore_init(&large_sem, 1000, 3002);
    assert(semaphore_get_count(&large_sem) == 1000);
    printf("✓ Large initial count handling correct\n");
    
    // Test multiple waits on large semaphore
    for (int i = 0; i < 100; i++) {
        assert(semaphore_wait(&large_sem, 0));
    }
    assert(semaphore_get_count(&large_sem) == 900);
    printf("✓ Multiple waits on large semaphore\n");
    
    // Test timeout values
    assert(semaphore_wait(&sem, 1000)); // Should succeed immediately
    assert(!semaphore_wait(&sem, 0));   // Should fail immediately
    printf("✓ Timeout parameter handling correct\n");
    
    // Test manager edge cases
    SemaphoreManager manager;
    semaphore_manager_init(&manager);
    
    assert(!semaphore_manager_wait(NULL, 1, 0));
    assert(!semaphore_manager_post(NULL, 1));
    assert(!semaphore_manager_wait(&manager, 999, 0)); // Non-existent semaphore
    assert(!semaphore_manager_post(&manager, 999));    // Non-existent semaphore
    printf("✓ Manager edge case handling correct\n");
    
    semaphore_manager_destroy(&manager);
    printf("Edge cases test PASSED\n");
}
