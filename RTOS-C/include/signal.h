#ifndef SIGNAL_H
#define SIGNAL_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "atomic_lock.h"

#ifdef __cplusplus
extern "C" {
#endif

// Signal structure (simplified without platform dependencies)
typedef struct Signal {
    uint32_t id;    // Signal ID
    bool signaled;  // Signal state
    atomic_lock_t lock; // Atomic lock for thread safety
} Signal;

#define MAX_SIGNALS 32

// Independent Signal Manager
typedef struct SignalManager {
    Signal signals[MAX_SIGNALS];    // Fixed-size array of signals
    bool signal_used[MAX_SIGNALS];  // Track which signals are used
    uint32_t next_signal_id;
    size_t signal_count;
    atomic_lock_t manager_lock;  // Atomic lock for manager operations
} SignalManager;

// Signal functions
void signal_init(Signal* signal, uint32_t id);
void signal_destroy(Signal* signal);
bool signal_wait(Signal* signal, uint32_t timeout_ms);  // 0 = infinite wait
bool signal_send(Signal* signal);
bool signal_clear(Signal* signal);
bool signal_is_signaled(const Signal* signal);

// Signal Manager functions
void signal_manager_init(SignalManager* manager);
void signal_manager_destroy(SignalManager* manager);

// Signal management functions
uint32_t signal_manager_create_signal(SignalManager* manager);
bool signal_manager_delete_signal(SignalManager* manager, uint32_t signal_id);
bool signal_manager_wait(SignalManager* manager, uint32_t signal_id, uint32_t timeout_ms);
bool signal_manager_send(SignalManager* manager, uint32_t signal_id);
bool signal_manager_clear(SignalManager* manager, uint32_t signal_id);
bool signal_manager_is_signaled(SignalManager* manager, uint32_t signal_id);
Signal* signal_manager_find_signal(SignalManager* manager, uint32_t signal_id);
size_t signal_manager_get_count(const SignalManager* manager);
size_t signal_manager_get_signal_count(const SignalManager* manager);
Signal* signal_manager_get_signal(SignalManager* manager, uint32_t signal_id);
void signal_manager_print_signals(const SignalManager* manager);

#ifdef __cplusplus
}
#endif

#endif // SIGNAL_H
