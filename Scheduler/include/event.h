#pragma once

#include <cstdint>
#include <mutex>
#include <condition_variable>
#include <atomic>

namespace RTOS {

// Event Å¬·¡½º
class Event {
private:
    std::atomic<uint32_t> event_bits_;
    std::mutex mutex_;
    std::condition_variable cv_;
    
public:
    Event();
    ~Event() = default;
    
    bool wait(uint32_t event_mask, bool clear_on_exit = true, uint32_t timeout_ms = 0);
    bool set(uint32_t event_bits);
    bool clear(uint32_t event_bits);
    uint32_t get_bits() const;
};

} // namespace RTOS
