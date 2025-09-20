#include "signal.h"
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <time.h>

// Signal functions
Signal* signal_create(void) {
    Signal* signal = (Signal*)malloc(sizeof(Signal));
    if (!signal) return NULL;
    
    signal->signaled = false;
    
    if (platform_mutex_init(&signal->mutex) != 0) {
        free(signal);
        return NULL;
    }
    
    if (platform_cond_init(&signal->cv) != 0) {
        platform_mutex_destroy(&signal->mutex);
        free(signal);
        return NULL;
    }
    
    return signal;
}

void signal_destroy(Signal* signal) {
    if (!signal) return;
    
    platform_mutex_destroy(&signal->mutex);
    platform_cond_destroy(&signal->cv);
    free(signal);
}

bool signal_wait(Signal* signal, uint32_t timeout_ms) {
    if (!signal) return false;
    
    platform_mutex_lock(&signal->mutex);
    
    if (timeout_ms == 0) {
        // Infinite wait
        while (!signal->signaled) {
            platform_cond_wait(&signal->cv, &signal->mutex);
        }
        signal->signaled = false; // Reset signal after receiving
        platform_mutex_unlock(&signal->mutex);
        return true;
    } else {
        // Timed wait
        struct timespec ts;
        clock_gettime(CLOCK_REALTIME, &ts);
        ts.tv_sec += timeout_ms / 1000;
        ts.tv_nsec += (timeout_ms % 1000) * 1000000;
        if (ts.tv_nsec >= 1000000000) {
            ts.tv_sec++;
            ts.tv_nsec -= 1000000000;
        }
        
        while (!signal->signaled) {
            int result = platform_cond_timedwait(&signal->cv, &signal->mutex, &ts);
            if (result != 0) {  // Any error (including timeout)
                platform_mutex_unlock(&signal->mutex);
                return false;
            }
        }
        
        signal->signaled = false; // Reset signal after receiving
        platform_mutex_unlock(&signal->mutex);
        return true;
    }
}

bool signal_send(Signal* signal) {
    if (!signal) return false;
    
    platform_mutex_lock(&signal->mutex);
    signal->signaled = true;
    platform_cond_signal(&signal->cv);
    platform_mutex_unlock(&signal->mutex);
    
    return true;
}

bool signal_is_signaled(const Signal* signal) {
    if (!signal) return false;
    
    platform_mutex_lock((mutex_t*)&signal->mutex);
    bool signaled = signal->signaled;
    platform_mutex_unlock((mutex_t*)&signal->mutex);
    
    return signaled;
}

// Signal Manager functions
SignalManager* signal_manager_create(void) {
    SignalManager* manager = (SignalManager*)malloc(sizeof(SignalManager));
    if (!manager) return NULL;
    
    manager->signals_head = NULL;
    manager->next_signal_id = 1;
    manager->signal_count = 0;
    
    if (platform_mutex_init(&manager->manager_mutex) != 0) {
        free(manager);
        return NULL;
    }
    
    return manager;
}

void signal_manager_destroy(SignalManager* manager) {
    if (!manager) return;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    SignalNode* current = manager->signals_head;
    while (current) {
        SignalNode* next = current->next;
        signal_destroy(current->signal);
        free(current);
        current = next;
    }
    
    platform_mutex_unlock(&manager->manager_mutex);
    platform_mutex_destroy(&manager->manager_mutex);
    free(manager);
}

Signal* signal_manager_find_signal(SignalManager* manager, uint32_t signal_id) {
    if (!manager) return NULL;
    
    SignalNode* current = manager->signals_head;
    while (current) {
        if (current->id == signal_id) {
            return current->signal;
        }
        current = current->next;
    }
    
    return NULL;
}

uint32_t signal_manager_create_signal(SignalManager* manager) {
    if (!manager) return 0;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    Signal* signal = signal_create();
    if (!signal) {
        platform_mutex_unlock(&manager->manager_mutex);
        return 0;
    }
    
    SignalNode* node = (SignalNode*)malloc(sizeof(SignalNode));
    if (!node) {
        signal_destroy(signal);
        platform_mutex_unlock(&manager->manager_mutex);
        return 0;
    }
    
    uint32_t signal_id = manager->next_signal_id++;
    node->id = signal_id;
    node->signal = signal;
    node->next = manager->signals_head;
    manager->signals_head = node;
    manager->signal_count++;
    
    platform_mutex_unlock(&manager->manager_mutex);
    return signal_id;
}

bool signal_manager_delete_signal(SignalManager* manager, uint32_t signal_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    
    SignalNode* current = manager->signals_head;
    SignalNode* prev = NULL;
    
    while (current) {
        if (current->id == signal_id) {
            if (prev) {
                prev->next = current->next;
            } else {
                manager->signals_head = current->next;
            }
            
            signal_destroy(current->signal);
            free(current);
            manager->signal_count--;
            
            platform_mutex_unlock(&manager->manager_mutex);
            return true;
        }
        
        prev = current;
        current = current->next;
    }
    
    platform_mutex_unlock(&manager->manager_mutex);
    return false;
}

bool signal_manager_wait(SignalManager* manager, uint32_t signal_id, uint32_t timeout_ms) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    Signal* signal = signal_manager_find_signal(manager, signal_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!signal) return false;
    
    return signal_wait(signal, timeout_ms);
}

bool signal_manager_send(SignalManager* manager, uint32_t signal_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    Signal* signal = signal_manager_find_signal(manager, signal_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!signal) return false;
    
    return signal_send(signal);
}

bool signal_manager_is_signaled(SignalManager* manager, uint32_t signal_id) {
    if (!manager) return false;
    
    platform_mutex_lock(&manager->manager_mutex);
    Signal* signal = signal_manager_find_signal(manager, signal_id);
    platform_mutex_unlock(&manager->manager_mutex);
    
    if (!signal) return false;
    
    return signal_is_signaled(signal);
}

size_t signal_manager_get_signal_count(const SignalManager* manager) {
    if (!manager) return 0;
    
    platform_mutex_lock((mutex_t*)&manager->manager_mutex);
    size_t count = manager->signal_count;
    platform_mutex_unlock((mutex_t*)&manager->manager_mutex);
    
    return count;
}

void signal_manager_print_signals(const SignalManager* manager) {
    if (!manager) {
        printf("SignalManager is NULL\n");
        return;
    }
    
    platform_mutex_lock((mutex_t*)&manager->manager_mutex);
    
    printf("Signal Manager Status:\n");
    printf("Total signals: %zu\n", manager->signal_count);
    
    SignalNode* current = manager->signals_head;
    while (current) {
        printf("  Signal ID %u: %s\n", 
               current->id, signal_is_signaled(current->signal) ? "signaled" : "not signaled");
        current = current->next;
    }
    
    platform_mutex_unlock((mutex_t*)&manager->manager_mutex);
}
