#pragma once

#include <cstdint>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <memory>
#include <map>

namespace RTOS {

// Forward declarations
class PriorityScheduler;
struct Task;

// Signal class
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

// Signal management functions for PriorityScheduler
class SignalManager {
public:
    // Signal management functions
    static uint32_t create_signal(PriorityScheduler* scheduler);
    static bool delete_signal(PriorityScheduler* scheduler, uint32_t signal_id);
    static bool signal_wait(PriorityScheduler* scheduler, uint32_t signal_id, uint32_t timeout_ms = 0);
    static bool signal_send(PriorityScheduler* scheduler, uint32_t signal_id);
    static bool signal_reset(PriorityScheduler* scheduler, uint32_t signal_id);
    static bool signal_is_set(PriorityScheduler* scheduler, uint32_t signal_id);
};

} // namespace RTOS