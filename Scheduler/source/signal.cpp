#include "signal.h"
#include <chrono>
#include <iostream>

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
SignalManager::SignalManager() : next_signal_id_(1) {}

uint32_t SignalManager::create_signal() {
    auto signal = std::make_shared<Signal>();
    uint32_t signal_id = next_signal_id_++;
    signals_[signal_id] = signal;
    return signal_id;
}

bool SignalManager::delete_signal(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it != signals_.end()) {
        signals_.erase(it);
        return true;
    }
    return false;
}

bool SignalManager::signal_wait(uint32_t signal_id, uint32_t timeout_ms) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    return it->second->wait(timeout_ms);
}

bool SignalManager::signal_send(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    return it->second->send();
}

bool SignalManager::signal_reset(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    return it->second->reset();
}

bool SignalManager::signal_is_set(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    return it->second->is_set();
}

size_t SignalManager::get_signal_count() const {
    return signals_.size();
}

void SignalManager::print_signals() const {
    std::cout << "Signals (" << signals_.size() << "):\n";
    for (const auto& pair : signals_) {
        std::cout << "  ID: " << pair.first << ", State: " << (pair.second->is_set() ? "SET" : "RESET") << "\n";
    }
}

} // namespace RTOS
