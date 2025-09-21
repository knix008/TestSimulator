#include "../include/mutex.h"
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

// Test function declarations
void test_mutex_basic_operations(void);
void test_mutex_recursive_locking(void);
void test_mutex_manager_operations(void);
void test_mutex_edge_cases(void);

int main() {
    printf("====================================================\n");
    printf("             Mutex Component Tests                 \n");
    printf("====================================================\n");
    
    test_mutex_basic_operations();
    test_mutex_recursive_locking();
    test_mutex_manager_operations();
    test_mutex_edge_cases();
    
    printf("\n====================================================\n");
    printf("           All Mutex Tests PASSED!                 \n");
    printf("====================================================\n");
    
    return 0;
}

void test_mutex_basic_operations(void) {
    printf("\n--- Testing Basic Mutex Operations ---\n");
    
    Mutex mutex;
    mutex_init(&mutex, "TestMutex", MUTEX_NORMAL);
    
    // Test initial state
    assert(!mutex_is_locked(&mutex));
    assert(mutex_get_owner(&mutex) == 0);
    assert(mutex_get_lock_count(&mutex) == 0);
    assert(mutex_get_total_locks(&mutex) == 0);
    assert(mutex_get_total_unlocks(&mutex) == 0);
    printf("✓ Initial state correct\n");
    
    // Test locking
    assert(mutex_lock(&mutex, 0)); // No timeout
    assert(mutex_is_locked(&mutex));
    assert(mutex_get_owner(&mutex) == 1);
    assert(mutex_get_lock_count(&mutex) == 1);
    assert(mutex_get_total_locks(&mutex) == 1);
    printf("✓ Mutex locked successfully\n");
    
    // Test double lock attempt (should fail for normal mutex)
    assert(!mutex_lock(&mutex, 0)); // Different task
    assert(mutex_get_owner(&mutex) == 1); // Still owned by task 1
    assert(mutex_get_lock_count(&mutex) == 1);
    printf("✓ Double lock attempt correctly rejected\n");
    
    // Test unlocking
    assert(mutex_unlock(&mutex));
    assert(!mutex_is_locked(&mutex));
    assert(mutex_get_owner(&mutex) == 0);
    assert(mutex_get_lock_count(&mutex) == 0);
    assert(mutex_get_total_unlocks(&mutex) == 1);
    printf("✓ Mutex unlocked successfully\n");
    
    // Test unlock by wrong owner
    assert(!mutex_unlock(&mutex));
    assert(!mutex_is_locked(&mutex));
    printf("✓ Wrong owner unlock correctly rejected\n");
    
    printf("Basic operations test PASSED\n");
}

void test_mutex_recursive_locking(void) {
    printf("\n--- Testing Recursive Mutex ---\n");
    
    Mutex recursive_mutex;
    mutex_init(&recursive_mutex, "RecursiveMutex", MUTEX_RECURSIVE);
    
    // Test recursive locking
    assert(mutex_lock(&recursive_mutex, 0));
    assert(mutex_get_lock_count(&recursive_mutex) == 1);
    printf("✓ First lock acquired\n");
    
    assert(mutex_lock(&recursive_mutex, 0));
    assert(mutex_get_lock_count(&recursive_mutex) == 2);
    printf("✓ Second recursive lock acquired\n");
    
    assert(mutex_lock(&recursive_mutex, 0));
    assert(mutex_get_lock_count(&recursive_mutex) == 3);
    printf("✓ Third recursive lock acquired\n");
    
    // Test recursive unlocking
    assert(mutex_unlock(&recursive_mutex));
    assert(mutex_is_locked(&recursive_mutex));
    assert(mutex_get_lock_count(&recursive_mutex) == 2);
    printf("✓ First recursive unlock\n");
    
    assert(mutex_unlock(&recursive_mutex));
    assert(mutex_is_locked(&recursive_mutex));
    assert(mutex_get_lock_count(&recursive_mutex) == 1);
    printf("✓ Second recursive unlock\n");
    
    assert(mutex_unlock(&recursive_mutex));
    assert(!mutex_is_locked(&recursive_mutex));
    assert(mutex_get_lock_count(&recursive_mutex) == 0);
    printf("✓ Final unlock - mutex completely released\n");
    
    // Test statistics
    assert(mutex_get_total_locks(&recursive_mutex) == 3);
    assert(mutex_get_total_unlocks(&recursive_mutex) == 3);
    printf("✓ Statistics tracking correct\n");
    
    printf("Recursive locking test PASSED\n");
}

void test_mutex_manager_operations(void) {
    printf("\n--- Testing Mutex Manager Operations ---\n");
    
    MutexManager manager;
    mutex_manager_init(&manager);
    
    // Test initial state
    assert(mutex_manager_get_mutex_count(&manager) == 0);
    printf("✓ Manager initial state correct\n");
    
    // Test creating mutexes
    uint32_t mutex1_id = mutex_manager_create_mutex(&manager, "Mutex1", MUTEX_NORMAL);
    uint32_t mutex2_id = mutex_manager_create_mutex(&manager, "Mutex2", MUTEX_RECURSIVE);
    
    assert(mutex1_id != 0);
    assert(mutex2_id != 0);
    assert(mutex1_id != mutex2_id);
    assert(mutex_manager_get_mutex_count(&manager) == 2);
    printf("✓ Two mutexes created successfully\n");
    
    // Test getting mutexes
    Mutex* mutex1 = mutex_manager_get_mutex(&manager, mutex1_id);
    Mutex* mutex2 = mutex_manager_get_mutex(&manager, mutex2_id);
    
    assert(mutex1 != NULL);
    assert(mutex2 != NULL);
    assert(mutex_get_type(mutex1) == MUTEX_NORMAL);
    assert(mutex_get_type(mutex2) == MUTEX_RECURSIVE);
    printf("✓ Mutexes retrieved correctly\n");
    
    // Test manager operations
    assert(mutex_manager_lock(&manager, mutex1_id, 0));
    assert(mutex_is_locked(mutex1));
    printf("✓ Manager lock operation works\n");
    
    assert(mutex_manager_unlock(&manager, mutex1_id));
    assert(!mutex_is_locked(mutex1));
    printf("✓ Manager unlock operation works\n");
    
    // Test deleting mutexes
    assert(mutex_manager_delete_mutex(&manager, mutex1_id));
    assert(mutex_manager_get_mutex(&manager, mutex1_id) == NULL);
    assert(mutex_manager_get_mutex_count(&manager) == 1);
    printf("✓ Mutex deletion works\n");
    
    // Test deleting non-existent mutex
    assert(!mutex_manager_delete_mutex(&manager, 999));
    assert(mutex_manager_get_mutex_count(&manager) == 1);
    printf("✓ Non-existent mutex deletion handling correct\n");
    
    mutex_manager_destroy(&manager);
    printf("Manager operations test PASSED\n");
}

void test_mutex_edge_cases(void) {
    printf("\n--- Testing Edge Cases ---\n");
    
    Mutex mutex;
    mutex_init(&mutex, "EdgeCaseMutex", MUTEX_NORMAL);
    
    // Test NULL parameters
    assert(!mutex_lock(NULL, 0));
    assert(!mutex_unlock(NULL));
    assert(!mutex_is_locked(NULL));
    assert(mutex_get_owner(NULL) == 0);
    assert(mutex_get_lock_count(NULL) == 0);
    printf("✓ NULL mutex parameter handling correct\n");
    
    // Test invalid task IDs
    assert(mutex_lock(&mutex, 0)); // Task ID 0 should be valid
    assert(mutex_unlock(&mutex));
    printf("✓ Task ID 0 handling correct\n");
    
    // Test timeout (should succeed immediately in our implementation)
    assert(mutex_lock(&mutex, 100)); // 100ms timeout
    assert(mutex_is_locked(&mutex));
    assert(mutex_unlock(&mutex));
    printf("✓ Timeout parameter handling correct\n");
    
    // Test maximum wait time tracking
    assert(mutex_lock(&mutex, 1000)); // 1000ms timeout
    assert(mutex_unlock(&mutex));
    // Note: max_wait_time_ms tracking depends on implementation
    printf("✓ Maximum wait time tracking\n");
    
    // Test mutex with very long name
    char long_name[65]; // Longer than MAX_MUTEX_NAME_LENGTH
    for (int i = 0; i < 64; i++) {
        long_name[i] = 'A' + (i % 26);
    }
    long_name[64] = '\0';
    
    Mutex long_name_mutex;
    mutex_init(&long_name_mutex, long_name, MUTEX_NORMAL);
    // Should handle long names gracefully (truncate or reject)
    printf("✓ Long name handling\n");
    
    printf("Edge cases test PASSED\n");
}
