#include "semaphore.h"
#include "scheduler.h"
#include <chrono>

namespace RTOS {

// Semaphore constructor
Semaphore::Semaphore(int initial_count) : count_(initial_count) {}

bool Semaphore::wait(uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        // Infinite wait
        cv_.wait(lock, [this] { return count_ > 0; });
    } else {
        // Timeout wait
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this] { return count_ > 0; })) {
            return false; // Timeout
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

// SemaphoreManager implementation
uint32_t SemaphoreManager::create_semaphore(PriorityScheduler* scheduler, int initial_count) {
    auto semaphore = std::make_shared<Semaphore>(initial_count);
    uint32_t sem_id = scheduler->next_sync_id_++;
    scheduler->semaphores_[sem_id] = semaphore;
    return sem_id;
}

bool SemaphoreManager::delete_semaphore(PriorityScheduler* scheduler, uint32_t sem_id) {
    auto it = scheduler->semaphores_.find(sem_id);
    if (it != scheduler->semaphores_.end()) {
        scheduler->semaphores_.erase(it);
        return true;
    }
    return false;
}

bool SemaphoreManager::semaphore_wait(PriorityScheduler* scheduler, uint32_t sem_id, uint32_t timeout_ms) {
    auto it = scheduler->semaphores_.find(sem_id);
    if (it == scheduler->semaphores_.end()) {
        return false;
    }
    
    auto current_task = scheduler->get_current_task();
    if (!current_task) {
        return false;
    }
    
    // Semaphore wait
    if (!it->second->wait(timeout_ms)) {
        return false; // Timeout or failure
    }
    
    return true;
}

bool SemaphoreManager::semaphore_post(PriorityScheduler* scheduler, uint32_t sem_id) {
    auto it = scheduler->semaphores_.find(sem_id);
    if (it == scheduler->semaphores_.end()) {
        return false;
    }
    
    return it->second->post();
}

int SemaphoreManager::semaphore_get_count(PriorityScheduler* scheduler, uint32_t sem_id) {
    auto it = scheduler->semaphores_.find(sem_id);
    if (it == scheduler->semaphores_.end()) {
        return -1;
    }
    
    return it->second->get_count();
}

} // namespace RTOS