#include "signal.h"
#include <chrono>

namespace RTOS {

// Signal 구현
bool Signal::wait(uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        // 무한 대기
        cv_.wait(lock, [this] { return signal_state_.load(); });
    } else {
        // 타임아웃 대기
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this] { return signal_state_.load(); })) {
            return false; // 타임아웃
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

} // namespace RTOS
