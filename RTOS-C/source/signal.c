#include "signal.h"
#include "clock.h"
#include <stdio.h>
#include <string.h>
#include <time.h>

// Signal functions
void signal_init(Signal* signal, uint32_t id) {
    if (!signal) return;
    
    signal->id = id;
    signal->signaled = false;
    atomic_lock_init(&signal->lock);
}

void signal_destroy(Signal* signal) {
    if (!signal) return;
    
    signal->signaled = false;
    atomic_lock_init(&signal->lock);
    // No free() needed - caller manages memory
}

bool signal_wait(Signal* signal, uint32_t timeout_ms) {
    if (!signal) return false;
    
    // Simple signal wait without platform dependencies
    uint32_t start_time = 0;
    if (timeout_ms > 0) {
        struct timespec ts;
        clock_gettime(0, &ts);
        start_time = (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
    }
    
    // Check if signal is already set
    if (signal->signaled) {
        // Signal is set, proceed to clear it
    } else if (timeout_ms == 0) {
        // No timeout, don't wait
        return false;
    } else {
        // Wait for signal to be set
        while (!signal->signaled) {
            // Busy wait - in real hardware this would yield to scheduler
            volatile int dummy = 0;
            dummy++;
            
            // Check timeout
            struct timespec ts;
            clock_gettime(0, &ts);
            uint32_t current_time = (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
            if (current_time - start_time >= timeout_ms) {
                return false; // Timeout
            }
        }
    }
    
    // Clear signal after receiving it
    signal->signaled = false;
    
    return true;
}

bool signal_send(Signal* signal) {
    if (!signal) return false;
    
    ATOMIC_LOCK(&signal->lock, LOCK_ID_SIGNAL);
    signal->signaled = true;
    ATOMIC_UNLOCK(&signal->lock, LOCK_ID_SIGNAL);
    
    return true;
}

bool signal_clear(Signal* signal) {
    if (!signal) return false;
    
    ATOMIC_LOCK(&signal->lock, LOCK_ID_SIGNAL);
    signal->signaled = false;
    ATOMIC_UNLOCK(&signal->lock, LOCK_ID_SIGNAL);
    
    return true;
}

bool signal_is_signaled(const Signal* signal) {
    return signal ? signal->signaled : false;
}

// Signal Manager functions
void signal_manager_init(SignalManager* manager) {
    if (!manager) return;
    
    // Initialize signal array
    for (int i = 0; i < MAX_SIGNALS; i++) {
        manager->signal_used[i] = false;
    }
    manager->next_signal_id = 1;
    manager->signal_count = 0;
    atomic_lock_init(&manager->manager_lock);
}

void signal_manager_destroy(SignalManager* manager) {
    if (!manager) return;
    
    // Destroy all signals
    for (int i = 0; i < MAX_SIGNALS; i++) {
        if (manager->signal_used[i]) {
            signal_destroy(&manager->signals[i]);
            manager->signal_used[i] = false;
        }
    }
    
    manager->signal_count = 0;
    atomic_lock_init(&manager->manager_lock);
    // No free() needed - caller manages memory
}

uint32_t signal_manager_create_signal(SignalManager* manager) {
    if (!manager) return 0;
    
    ATOMIC_LOCK(&manager->manager_lock, LOCK_ID_SIGNAL);
    
    // Find an available slot
    int slot = -1;
    for (int i = 0; i < MAX_SIGNALS; i++) {
        if (!manager->signal_used[i]) {
            slot = i;
            break;
        }
    }
    
    if (slot == -1) {
        ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_SIGNAL);
        return 0;  // No available slots
    }
    
    uint32_t signal_id = manager->next_signal_id++;
    Signal* signal = &manager->signals[slot];
    
    signal_init(signal, signal_id);
    
    manager->signal_used[slot] = true;
    manager->signal_count++;
    
    ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_SIGNAL);
    return signal_id;
}

bool signal_manager_delete_signal(SignalManager* manager, uint32_t signal_id) {
    if (!manager) return false;
    
    ATOMIC_LOCK(&manager->manager_lock, LOCK_ID_SIGNAL);
    
    // Find the signal in the fixed-size array
    for (int i = 0; i < MAX_SIGNALS; i++) {
        if (manager->signal_used[i] && manager->signals[i].id == signal_id) {
            signal_destroy(&manager->signals[i]);
            manager->signal_used[i] = false;
            manager->signal_count--;
            
            ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_SIGNAL);
            return true;
        }
    }
    
    ATOMIC_UNLOCK(&manager->manager_lock, LOCK_ID_SIGNAL);
    return false;
}

Signal* signal_manager_find_signal(SignalManager* manager, uint32_t signal_id) {
    if (!manager) return NULL;
    
    for (int i = 0; i < MAX_SIGNALS; i++) {
        if (manager->signal_used[i] && manager->signals[i].id == signal_id) {
            return &manager->signals[i];
        }
    }
    return NULL;
}

bool signal_manager_wait(SignalManager* manager, uint32_t signal_id, uint32_t timeout_ms) {
    if (!manager) return false;
    
    Signal* signal = signal_manager_find_signal(manager, signal_id);
    if (!signal) return false;
    
    return signal_wait(signal, timeout_ms);
}

bool signal_manager_send(SignalManager* manager, uint32_t signal_id) {
    if (!manager) return false;
    
    Signal* signal = signal_manager_find_signal(manager, signal_id);
    if (!signal) return false;
    
    return signal_send(signal);
}

bool signal_manager_clear(SignalManager* manager, uint32_t signal_id) {
    if (!manager) return false;
    
    Signal* signal = signal_manager_find_signal(manager, signal_id);
    if (!signal) return false;
    
    return signal_clear(signal);
}

bool signal_manager_is_signaled(SignalManager* manager, uint32_t signal_id) {
    if (!manager) return false;
    
    Signal* signal = signal_manager_find_signal(manager, signal_id);
    if (!signal) return false;
    
    return signal_is_signaled(signal);
}

size_t signal_manager_get_count(const SignalManager* manager) {
    return manager ? manager->signal_count : 0;
}

size_t signal_manager_get_signal_count(const SignalManager* manager) {
    return signal_manager_get_count(manager);
}

Signal* signal_manager_get_signal(SignalManager* manager, uint32_t signal_id) {
    return signal_manager_find_signal(manager, signal_id);
}

void signal_manager_print_signals(const SignalManager* manager) {
    if (!manager) return;
    
    printf("=== Signal Manager Status ===\n");
    printf("Total signals: %zu\n", manager->signal_count);
    
    for (int i = 0; i < MAX_SIGNALS; i++) {
        if (manager->signal_used[i]) {
            Signal* signal = (Signal*)&manager->signals[i];
            printf("  Signal %u: signaled=%s\n", 
                   signal->id, signal->signaled ? "true" : "false");
        }
    }
    printf("=============================\n");
}
