#pragma once

#include <cstdint>
#include <mutex>
#include <condition_variable>
#include <atomic>
#include <memory>
#include <map>

namespace RTOS {

// Semaphore class
class Semaphore {
private:
    std::atomic<int> count_;
    std::mutex mutex_;
    std::condition_variable cv_;
    
public:
    explicit Semaphore(int initial_count = 0);
    ~Semaphore() = default;
    
    bool wait(uint32_t timeout_ms = 0);  // 0 = infinite wait
    bool post();
    int get_count() const;
};

// Independent Semaphore Manager
class SemaphoreManager {
private:
    std::map<uint32_t, std::shared_ptr<Semaphore>> semaphores_;
    uint32_t next_semaphore_id_;
    
public:
    SemaphoreManager();
    ~SemaphoreManager() = default;
    
    // Semaphore management functions
    uint32_t create_semaphore(int initial_count = 0);
    bool delete_semaphore(uint32_t sem_id);
    bool semaphore_wait(uint32_t sem_id, uint32_t timeout_ms = 0);
    bool semaphore_post(uint32_t sem_id);
    int semaphore_get_count(uint32_t sem_id);
    
    // Status and debugging
    size_t get_semaphore_count() const;
    void print_semaphores() const;
};

} // namespace RTOS