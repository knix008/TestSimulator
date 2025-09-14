#include "semaphore.h"
#include <chrono>

namespace RTOS {

// Semaphore 구현
Semaphore::Semaphore(int initial_count) : count_(initial_count) {}

bool Semaphore::wait(uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        // 무한 대기
        cv_.wait(lock, [this] { return count_ > 0; });
    } else {
        // 타임아웃 대기
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this] { return count_ > 0; })) {
            return false; // 타임아웃
        }
    }
    
    count_--;
    return true;
}

bool Semaphore::post() {
    std::lock_guard<std::mutex> lock(mutex_);
    count_++;
    cv_.notify_one();
    return true;
}

int Semaphore::get_count() const {
    return count_.load();
}

} // namespace RTOS
