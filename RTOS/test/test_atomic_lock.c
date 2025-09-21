#include "../include/atomic_lock.h"
#include <stdio.h>
#include <stdlib.h>
#include <assert.h>

// Test function declarations
void test_atomic_lock_basic_operations(void);
void test_atomic_lock_recursive_locking(void);
void test_atomic_lock_multiple_owners(void);
void test_atomic_lock_try_acquire(void);
void test_atomic_lock_status_functions(void);

int main() {
    printf("====================================================\n");
    printf("           Atomic Lock Component Tests              \n");
    printf("====================================================\n");
    
    test_atomic_lock_basic_operations();
    test_atomic_lock_recursive_locking();
    test_atomic_lock_multiple_owners();
    test_atomic_lock_try_acquire();
    test_atomic_lock_status_functions();
    
    printf("\n====================================================\n");
    printf("         All Atomic Lock Tests PASSED!              \n");
    printf("====================================================\n");
    
    return 0;
}

void test_atomic_lock_basic_operations(void) {
    printf("\n--- Testing Basic Atomic Lock Operations ---\n");
    
    atomic_lock_t lock;
    atomic_lock_init(&lock);
    
    // Test initial state
    assert(!atomic_lock_is_locked(&lock));
    assert(atomic_lock_get_owner(&lock) == 0);
    assert(atomic_lock_get_count(&lock) == 0);
    printf("✓ Initial state correct\n");
    
    // Test acquire and release
    atomic_lock_acquire(&lock, 1001);
    assert(atomic_lock_is_locked(&lock));
    assert(atomic_lock_get_owner(&lock) == 1001);
    assert(atomic_lock_get_count(&lock) == 1);
    printf("✓ Lock acquired successfully\n");
    
    atomic_lock_release(&lock, 1001);
    assert(!atomic_lock_is_locked(&lock));
    assert(atomic_lock_get_owner(&lock) == 0);
    assert(atomic_lock_get_count(&lock) == 0);
    printf("✓ Lock released successfully\n");
    
    printf("Basic operations test PASSED\n");
}

void test_atomic_lock_recursive_locking(void) {
    printf("\n--- Testing Recursive Locking ---\n");
    
    atomic_lock_t lock;
    atomic_lock_init(&lock);
    
    uint32_t owner_id = 2001;
    
    // Test recursive locking
    atomic_lock_acquire(&lock, owner_id);
    assert(atomic_lock_get_count(&lock) == 1);
    printf("✓ First lock acquired\n");
    
    atomic_lock_acquire(&lock, owner_id);
    assert(atomic_lock_get_count(&lock) == 2);
    printf("✓ Second recursive lock acquired\n");
    
    atomic_lock_acquire(&lock, owner_id);
    assert(atomic_lock_get_count(&lock) == 3);
    printf("✓ Third recursive lock acquired\n");
    
    // Test recursive unlocking
    atomic_lock_release(&lock, owner_id);
    assert(atomic_lock_is_locked(&lock));
    assert(atomic_lock_get_count(&lock) == 2);
    printf("✓ First recursive unlock\n");
    
    atomic_lock_release(&lock, owner_id);
    assert(atomic_lock_is_locked(&lock));
    assert(atomic_lock_get_count(&lock) == 1);
    printf("✓ Second recursive unlock\n");
    
    atomic_lock_release(&lock, owner_id);
    assert(!atomic_lock_is_locked(&lock));
    assert(atomic_lock_get_count(&lock) == 0);
    printf("✓ Final unlock - lock completely released\n");
    
    printf("Recursive locking test PASSED\n");
}

void test_atomic_lock_multiple_owners(void) {
    printf("\n--- Testing Multiple Owners ---\n");
    
    atomic_lock_t lock;
    atomic_lock_init(&lock);
    
    uint32_t owner1 = 3001;
    uint32_t owner2 = 3002;
    
    // First owner acquires lock
    atomic_lock_acquire(&lock, owner1);
    assert(atomic_lock_get_owner(&lock) == owner1);
    assert(atomic_lock_get_count(&lock) == 1);
    printf("✓ Owner 1 acquired lock\n");
    
    // Second owner tries to acquire using try_acquire (non-blocking)
    // This should fail because owner1 already has the lock
    bool acquired = atomic_lock_try_acquire(&lock, owner2);
    assert(!acquired); // Should fail
    (void)acquired; // Suppress unused variable warning
    assert(atomic_lock_get_owner(&lock) == owner1); // Still owned by owner1
    printf("✓ Owner 2 correctly failed to acquire (try_acquire)\n");
    
    // First owner tries to release (should succeed)
    atomic_lock_release(&lock, owner1);
    assert(!atomic_lock_is_locked(&lock)); // Now unlocked
    printf("✓ Owner 1 released lock\n");
    
    // Now owner2 can acquire the lock
    atomic_lock_acquire(&lock, owner2);
    assert(atomic_lock_get_owner(&lock) == owner2);
    assert(atomic_lock_get_count(&lock) == 1);
    printf("✓ Owner 2 acquired lock after owner1 released\n");
    
    // Second owner releases
    atomic_lock_release(&lock, owner2);
    assert(!atomic_lock_is_locked(&lock));
    printf("✓ Owner 2 released lock\n");
    
    printf("Multiple owners test PASSED\n");
}

void test_atomic_lock_try_acquire(void) {
    printf("\n--- Testing Try Acquire ---\n");
    
    atomic_lock_t lock;
    atomic_lock_init(&lock);
    
    uint32_t owner1 = 4001;
    uint32_t owner2 = 4002;
    (void)owner2; // Suppress unused variable warning
    
    // Test try acquire on unlocked lock
    assert(atomic_lock_try_acquire(&lock, owner1));
    assert(atomic_lock_is_locked(&lock));
    assert(atomic_lock_get_owner(&lock) == owner1);
    printf("✓ Try acquire on unlocked lock succeeded\n");
    
    // Test try acquire on locked lock by different owner
    assert(!atomic_lock_try_acquire(&lock, owner2));
    assert(atomic_lock_get_owner(&lock) == owner1); // Still owned by owner1
    printf("✓ Try acquire by different owner failed correctly\n");
    
    // Test try acquire on locked lock by same owner (recursive)
    assert(atomic_lock_try_acquire(&lock, owner1));
    assert(atomic_lock_get_count(&lock) == 2);
    printf("✓ Try acquire by same owner succeeded (recursive)\n");
    
    // Clean up
    atomic_lock_release(&lock, owner1);
    atomic_lock_release(&lock, owner1);
    
    printf("Try acquire test PASSED\n");
}

void test_atomic_lock_status_functions(void) {
    printf("\n--- Testing Status Functions ---\n");
    
    atomic_lock_t lock;
    atomic_lock_init(&lock);
    
    // Test with NULL lock
    assert(!atomic_lock_is_locked(NULL));
    assert(atomic_lock_get_owner(NULL) == 0);
    assert(atomic_lock_get_count(NULL) == 0);
    printf("✓ NULL lock handling correct\n");
    
    // Test status functions with valid lock
    assert(!atomic_lock_is_locked(&lock));
    assert(atomic_lock_get_owner(&lock) == 0);
    assert(atomic_lock_get_count(&lock) == 0);
    printf("✓ Unlocked status correct\n");
    
    atomic_lock_acquire(&lock, 5001);
    assert(atomic_lock_is_locked(&lock));
    assert(atomic_lock_get_owner(&lock) == 5001);
    assert(atomic_lock_get_count(&lock) == 1);
    printf("✓ Locked status correct\n");
    
    atomic_lock_release(&lock, 5001);
    assert(!atomic_lock_is_locked(&lock));
    assert(atomic_lock_get_owner(&lock) == 0);
    assert(atomic_lock_get_count(&lock) == 0);
    printf("✓ Released status correct\n");
    
    printf("Status functions test PASSED\n");
}
