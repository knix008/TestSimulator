#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include "platform.h"

#ifdef __cplusplus
extern "C" {
#endif

// Signal structure
typedef struct Signal {
    bool signaled;
    mutex_t mutex;
    cond_t cv;
} Signal;

// Signal node for linked list
typedef struct SignalNode {
    uint32_t id;
    Signal* signal;
    struct SignalNode* next;
} SignalNode;

// Independent Signal Manager
typedef struct SignalManager {
    SignalNode* signals_head;
    uint32_t next_signal_id;
    size_t signal_count;
    mutex_t manager_mutex;
} SignalManager;

// Signal functions
Signal* signal_create(void);
void signal_destroy(Signal* signal);
bool signal_wait(Signal* signal, uint32_t timeout_ms);  // 0 = infinite wait
bool signal_send(Signal* signal);
bool signal_is_signaled(const Signal* signal);

// Signal Manager functions
SignalManager* signal_manager_create(void);
void signal_manager_destroy(SignalManager* manager);

// Signal management functions
uint32_t signal_manager_create_signal(SignalManager* manager);
bool signal_manager_delete_signal(SignalManager* manager, uint32_t signal_id);
bool signal_manager_wait(SignalManager* manager, uint32_t signal_id, uint32_t timeout_ms);
bool signal_manager_send(SignalManager* manager, uint32_t signal_id);
bool signal_manager_is_signaled(SignalManager* manager, uint32_t signal_id);

// Status and debugging
size_t signal_manager_get_signal_count(const SignalManager* manager);
void signal_manager_print_signals(const SignalManager* manager);

// Internal helper functions
Signal* signal_manager_find_signal(SignalManager* manager, uint32_t signal_id);

#ifdef __cplusplus
}
#endif