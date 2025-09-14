#include "event.h"
#include <chrono>

namespace RTOS {

// Event 구현
Event::Event() : event_bits_(0) {}

bool Event::wait(uint32_t event_mask, bool clear_on_exit, uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        // 무한 대기
        cv_.wait(lock, [this, event_mask] { return (event_bits_ & event_mask) != 0; });
    } else {
        // 타임아웃 대기
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this, event_mask] { return (event_bits_ & event_mask) != 0; })) {
            return false; // 타임아웃
        }
    }
    
    if (clear_on_exit) {
        event_bits_ &= ~event_mask;
    }
    return true;
}

bool Event::set(uint32_t event_bits) {
    std::lock_guard<std::mutex> lock(mutex_);
    event_bits_ |= event_bits;
    cv_.notify_all();
    return true;
}

bool Event::clear(uint32_t event_bits) {
    std::lock_guard<std::mutex> lock(mutex_);
    event_bits_ &= ~event_bits;
    return true;
}

uint32_t Event::get_bits() const {
    return event_bits_.load();
}

} // namespace RTOS
