#include "signal.h"
#include "scheduler.h"
#include <chrono>

namespace RTOS {

// Signal ����
bool Signal::wait(uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        // ���� ���
        cv_.wait(lock, [this] { return signal_state_.load(); });
    } else {
        // Ÿ�Ӿƿ� ���
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this] { return signal_state_.load(); })) {
            return false; // Ÿ�Ӿƿ�
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

// Signal management functions
uint32_t PriorityScheduler::create_signal() {
    auto signal = std::make_shared<Signal>();
    uint32_t signal_id = next_sync_id_++;
    signals_[signal_id] = signal;
    return signal_id;
}

bool PriorityScheduler::delete_signal(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it != signals_.end()) {
        signals_.erase(it);
        return true;
    }
    return false;
}

bool PriorityScheduler::signal_wait(uint32_t signal_id, uint32_t timeout_ms) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    auto current_task = get_current_task();
    if (!current_task) {
        return false;
    }
    
    // Signal wait
    if (!it->second->wait(timeout_ms)) {
        return false; // Timeout or failure
    }
    
    return true;
}

bool PriorityScheduler::signal_send(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    return it->second->send();
}

bool PriorityScheduler::signal_reset(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    return it->second->reset();
}

bool PriorityScheduler::signal_is_set(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    return it->second->is_set();
}

} // namespace RTOS
