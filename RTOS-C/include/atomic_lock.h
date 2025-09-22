#ifndef ATOMIC_LOCK_H
#define ATOMIC_LOCK_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Atomic lock structure
typedef struct {
    volatile bool locked;
    volatile uint32_t owner_id;
    volatile uint32_t lock_count;
} atomic_lock_t;

// Basic atomic operations for bare-metal systems
bool atomic_test_and_set(bool* lock_var);
void atomic_clear(bool* lock_var);

// Simple busy-wait lock operations for bare-metal systems
void simple_lock(bool* lock_var);
void simple_unlock(bool* lock_var);

// Atomic lock functions
void atomic_lock_init(atomic_lock_t* lock);
void atomic_lock_acquire(atomic_lock_t* lock, uint32_t owner_id);
void atomic_lock_release(atomic_lock_t* lock, uint32_t owner_id);
bool atomic_lock_try_acquire(atomic_lock_t* lock, uint32_t owner_id);
bool atomic_lock_is_locked(const atomic_lock_t* lock);
uint32_t atomic_lock_get_owner(const atomic_lock_t* lock);
uint32_t atomic_lock_get_count(const atomic_lock_t* lock);

// Convenience macros for common use cases
#define ATOMIC_LOCK(lock, owner) atomic_lock_acquire(lock, owner)
#define ATOMIC_UNLOCK(lock, owner) atomic_lock_release(lock, owner)
#define ATOMIC_TRYLOCK(lock, owner) atomic_lock_try_acquire(lock, owner)

// Global lock IDs for different components
#define LOCK_ID_SCHEDULER     0x1000
#define LOCK_ID_MUTEX         0x2000
#define LOCK_ID_SEMAPHORE     0x3000
#define LOCK_ID_EVENT         0x4000
#define LOCK_ID_SIGNAL        0x5000
#define LOCK_ID_MESSAGE_QUEUE 0x6000
#define LOCK_ID_TIMER         0x7000
#define LOCK_ID_CLOCK         0x8000
#define LOCK_ID_TIMER_TASK    0x9000

#ifdef __cplusplus
}
#endif

#endif // ATOMIC_LOCK_H
