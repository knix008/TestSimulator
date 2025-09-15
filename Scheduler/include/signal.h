#pragma once

#include <cstdint>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <memory>
#include <map>

namespace RTOS {

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

// Independent Signal Manager
class SignalManager {
private:
    std::map<uint32_t, std::shared_ptr<Signal>> signals_;
    uint32_t next_signal_id_;
    
public:
    SignalManager();
    ~SignalManager() = default;
    
    // Signal management functions
    uint32_t create_signal();
    bool delete_signal(uint32_t signal_id);
    bool signal_wait(uint32_t signal_id, uint32_t timeout_ms = 0);
    bool signal_send(uint32_t signal_id);
    bool signal_reset(uint32_t signal_id);
    bool signal_is_set(uint32_t signal_id);
    
    // Status and debugging
    size_t get_signal_count() const;
    void print_signals() const;
};

} // namespace RTOS