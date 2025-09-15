#include "signal.h"
#include "scheduler.h"
#include <chrono>

namespace RTOS {

bool Signal::wait(uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        cv_.wait(lock, [this] { return signal_state_.load(); });
    } else {
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this] { return signal_state_.load(); })) {
            return false; 
        }
    }
    
    return true;
}

bool Signal::send() {
    std::lock_guard<std::mutex> lock(mutex_);
    signal_state_ = true;
    cv_.notify_all();
    return true;
}

bool Signal::reset() {
    std::lock_guard<std::mutex> lock(mutex_);
    signal_state_ = false;
    return true;
}

bool Signal::is_set() const {
    return signal_state_.load();
}

// SignalManager implementation
uint32_t SignalManager::create_signal(PriorityScheduler* scheduler) {
    auto signal = std::make_shared<Signal>();
    uint32_t signal_id = scheduler->next_sync_id_++;
    scheduler->signals_[signal_id] = signal;
    return signal_id;
}

bool SignalManager::delete_signal(PriorityScheduler* scheduler, uint32_t signal_id) {
    auto it = scheduler->signals_.find(signal_id);
    if (it != scheduler->signals_.end()) {
        scheduler->signals_.erase(it);
        return true;
    }
    return false;
}

bool SignalManager::signal_wait(PriorityScheduler* scheduler, uint32_t signal_id, uint32_t timeout_ms) {
    auto it = scheduler->signals_.find(signal_id);
    if (it == scheduler->signals_.end()) {
        return false;
    }
    
    auto current_task = scheduler->get_current_task();
    if (!current_task) {
        return false;
    }
    
    // Signal wait
    if (!it->second->wait(timeout_ms)) {
        return false; // Timeout or failure
    }
    
    return true;
}

bool SignalManager::signal_send(PriorityScheduler* scheduler, uint32_t signal_id) {
    auto it = scheduler->signals_.find(signal_id);
    if (it == scheduler->signals_.end()) {
        return false;
    }
    
    return it->second->send();
}

bool SignalManager::signal_reset(PriorityScheduler* scheduler, uint32_t signal_id) {
    auto it = scheduler->signals_.find(signal_id);
    if (it == scheduler->signals_.end()) {
        return false;
    }
    
    return it->second->reset();
}

bool SignalManager::signal_is_set(PriorityScheduler* scheduler, uint32_t signal_id) {
    auto it = scheduler->signals_.find(signal_id);
    if (it == scheduler->signals_.end()) {
        return false;
    }
    
    return it->second->is_set();
}

} // namespace RTOS
