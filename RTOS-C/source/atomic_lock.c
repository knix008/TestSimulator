#include "atomic_lock.h"
#include <stdio.h>

// Basic atomic operations for bare-metal systems
bool atomic_test_and_set(bool* lock_var) {
    if (!lock_var) return true; // Invalid pointer, treat as already locked
    bool old_value = *lock_var;
    if (!old_value) {
        *lock_var = true;
    }
    return old_value;
}

void atomic_clear(bool* lock_var) {
    if (lock_var) {
        *lock_var = false;
    }
}

// Simple busy-wait lock operations for bare-metal systems
void simple_lock(bool* lock_var) {
    if (!lock_var) return;
    
    while (*lock_var) {
        // Busy wait - in real hardware this would yield to scheduler
        volatile int dummy = 0;
        dummy++;
    }
    *lock_var = true;
}

void simple_unlock(bool* lock_var) {
    if (lock_var) {
        *lock_var = false;
    }
}

// Atomic lock functions
void atomic_lock_init(atomic_lock_t* lock) {
    if (!lock) return;
    
    lock->locked = false;
    lock->owner_id = 0;
    lock->lock_count = 0;
}

void atomic_lock_acquire(atomic_lock_t* lock, uint32_t owner_id) {
    if (!lock) return;
    
    // Busy wait until lock is available
    while (lock->locked && lock->owner_id != owner_id) {
        // Yield to scheduler in real hardware
        volatile int dummy = 0;
        dummy++;
    }
    
    // Acquire the lock
    lock->locked = true;
    lock->owner_id = owner_id;
    lock->lock_count++;
}

void atomic_lock_release(atomic_lock_t* lock, uint32_t owner_id) {
    if (!lock) return;
    
    // Only release if we own the lock
    if (lock->locked && lock->owner_id == owner_id) {
        lock->lock_count--;
        
        // Only unlock if count reaches zero
        if (lock->lock_count == 0) {
            lock->locked = false;
            lock->owner_id = 0;
        }
    }
}

bool atomic_lock_try_acquire(atomic_lock_t* lock, uint32_t owner_id) {
    if (!lock) return false;
    
    // Try to acquire lock without blocking
    if (!lock->locked) {
        lock->locked = true;
        lock->owner_id = owner_id;
        lock->lock_count = 1;
        return true;
    }
    
    // If we already own the lock, increment count (recursive lock)
    if (lock->owner_id == owner_id) {
        lock->lock_count++;
        return true;
    }
    
    return false; // Lock is held by someone else
}

bool atomic_lock_is_locked(const atomic_lock_t* lock) {
    return lock ? lock->locked : false;
}

uint32_t atomic_lock_get_owner(const atomic_lock_t* lock) {
    return lock ? lock->owner_id : 0;
}

uint32_t atomic_lock_get_count(const atomic_lock_t* lock) {
    return lock ? lock->lock_count : 0;
}
