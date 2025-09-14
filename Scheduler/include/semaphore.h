#pragma once

#include <cstdint>
#include <mutex>
#include <condition_variable>
#include <atomic>

namespace RTOS {

// Semaphore 클래스
class Semaphore {
private:
    std::atomic<int> count_;
    std::mutex mutex_;
    std::condition_variable cv_;
    
public:
    explicit Semaphore(int initial_count = 0);
    ~Semaphore() = default;
    
    bool wait(uint32_t timeout_ms = 0);  // 0 = 무한 대기
    bool post();
    int get_count() const;
};

} // namespace RTOS
