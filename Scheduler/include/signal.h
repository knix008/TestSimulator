#pragma once

#include <cstdint>
#include <mutex>
#include <condition_variable>
#include <atomic>

namespace RTOS {

// Signal Å¬·¡½º
class Signal {
private:
    std::atomic<bool> signal_state_;
    std::mutex mutex_;
    std::condition_variable cv_;
    
public:
    Signal() : signal_state_(false) {}
    ~Signal() = default;
    
    bool wait(uint32_t timeout_ms = 0);
    bool send();
    bool reset();
    bool is_set() const;
};

} // namespace RTOS
