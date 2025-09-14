#include "scheduler.h"
#include <iostream>
#include <algorithm>
#include <cstring>

namespace RTOS {

// PriorityScheduler 구현
PriorityScheduler::PriorityScheduler() 
    : current_task_(nullptr), next_task_id_(1), next_sync_id_(1) {
    // 비트맵 초기화
    std::memset(priority_bitmap_, 0, sizeof(priority_bitmap_));
}

uint8_t PriorityScheduler::find_highest_priority() const {
    // 비트맵에서 가장 높은 우선순위 (가장 작은 인덱스) 찾기
    for (int i = 0; i < 16; ++i) {
        if (priority_bitmap_[i] != 0) {
            // 첫 번째 비트 찾기
            uint8_t byte_value = priority_bitmap_[i];
            int bit_position = 0;
            
            // 비트 스캔을 통한 첫 번째 비트 위치 찾기
            while ((byte_value & 0x01) == 0) {
                byte_value >>= 1;
                bit_position++;
            }
            
            return static_cast<uint8_t>(i * 8 + bit_position);
        }
    }
    
    return MAX_PRIORITY_LEVELS; // 유효하지 않은 우선순위 반환
}

void PriorityScheduler::update_priority_bitmap(uint8_t priority, bool add) {
    if (!is_valid_priority(priority)) {
        return;
    }
    
    int byte_index = priority / 8;
    int bit_index = priority % 8;
    uint8_t bit_mask = 1 << bit_index;
    
    if (add) {
        // 해당 우선순위에 Task가 있음을 표시
        priority_bitmap_[byte_index] |= bit_mask;
    } else {
        // 해당 우선순위에 Task가 없음을 표시
        priority_bitmap_[byte_index] &= ~bit_mask;
    }
}

bool PriorityScheduler::is_valid_priority(uint8_t priority) const {
    return priority < MAX_PRIORITY_LEVELS;
}

uint32_t PriorityScheduler::create_task(uint8_t priority, void* data) {
    if (!is_valid_priority(priority)) {
        return 0; // 유효하지 않은 우선순위
    }
    
    auto task = std::make_shared<Task>(next_task_id_++, priority, data);
    task_queues_[priority].push(task);
    
    // 비트맵 업데이트
    update_priority_bitmap(priority, true);
    
    return task->id;
}

bool PriorityScheduler::add_task(uint32_t task_id, uint8_t priority, void* data) {
    if (!is_valid_priority(priority)) {
        return false;
    }
    
    auto task = std::make_shared<Task>(task_id, priority, data);
    task_queues_[priority].push(task);
    
    // 비트맵 업데이트
    update_priority_bitmap(priority, true);
    
    return true;
}

bool PriorityScheduler::remove_task(uint32_t task_id) {
    // 모든 우선순위 큐에서 해당 Task 찾아서 제거
    for (uint8_t priority = 0; priority < MAX_PRIORITY_LEVELS; ++priority) {
        std::queue<std::shared_ptr<Task>> temp_queue;
        bool found = false;
        
        while (!task_queues_[priority].empty()) {
            auto task = task_queues_[priority].front();
            task_queues_[priority].pop();
            
            if (task->id == task_id) {
                found = true;
                break;
            } else {
                temp_queue.push(task);
            }
        }
        
        // 원래 큐에 다시 추가
        while (!temp_queue.empty()) {
            task_queues_[priority].push(temp_queue.front());
            temp_queue.pop();
        }
        
        if (found) {
            // 해당 우선순위에 Task가 없으면 비트맵에서 제거
            if (task_queues_[priority].empty()) {
                update_priority_bitmap(priority, false);
            }
            return true;
        }
    }
    
    return false;
}

std::shared_ptr<Task> PriorityScheduler::get_next_task() {
    uint8_t highest_priority = find_highest_priority();
    
    if (highest_priority >= MAX_PRIORITY_LEVELS) {
        return nullptr; // 실행 가능한 Task가 없음
    }
    
    if (task_queues_[highest_priority].empty()) {
        return nullptr;
    }
    
    auto next_task = task_queues_[highest_priority].front();
    task_queues_[highest_priority].pop();
    
    // 해당 우선순위에 Task가 없으면 비트맵에서 제거
    if (task_queues_[highest_priority].empty()) {
        update_priority_bitmap(highest_priority, false);
    }
    
    return next_task;
}

bool PriorityScheduler::has_ready_tasks() const {
    for (int i = 0; i < 16; ++i) {
        if (priority_bitmap_[i] != 0) {
            return true;
        }
    }
    return false;
}

uint8_t PriorityScheduler::get_highest_ready_priority() const {
    return find_highest_priority();
}

size_t PriorityScheduler::get_task_count(uint8_t priority) const {
    if (!is_valid_priority(priority)) {
        return 0;
    }
    
    return task_queues_[priority].size();
}

size_t PriorityScheduler::get_total_task_count() const {
    size_t total = 0;
    for (uint8_t priority = 0; priority < MAX_PRIORITY_LEVELS; ++priority) {
        total += task_queues_[priority].size();
    }
    return total;
}

void PriorityScheduler::unblock_task(std::shared_ptr<Task> task) {
    if (task && task->state == TaskState::BLOCKED) {
        task->state = TaskState::READY;
        task_queues_[task->priority].push(task);
        update_priority_bitmap(task->priority, true);
        
        // 대기 목록에서 제거
        auto it = std::find(blocked_tasks_.begin(), blocked_tasks_.end(), task);
        if (it != blocked_tasks_.end()) {
            blocked_tasks_.erase(it);
        }
    }
}

// Semaphore 관리 함수들
uint32_t PriorityScheduler::create_semaphore(int initial_count) {
    auto semaphore = std::make_shared<Semaphore>(initial_count);
    uint32_t sem_id = next_sync_id_++;
    semaphores_[sem_id] = semaphore;
    return sem_id;
}

bool PriorityScheduler::delete_semaphore(uint32_t sem_id) {
    auto it = semaphores_.find(sem_id);
    if (it != semaphores_.end()) {
        semaphores_.erase(it);
        return true;
    }
    return false;
}

bool PriorityScheduler::semaphore_wait(uint32_t sem_id, uint32_t timeout_ms) {
    auto it = semaphores_.find(sem_id);
    if (it == semaphores_.end()) {
        return false;
    }
    
    auto current_task = get_current_task();
    if (!current_task) {
        return false;
    }
    
    // 세마포어 대기
    if (!it->second->wait(timeout_ms)) {
        return false; // 타임아웃 또는 실패
    }
    
    return true;
}

bool PriorityScheduler::semaphore_post(uint32_t sem_id) {
    auto it = semaphores_.find(sem_id);
    if (it == semaphores_.end()) {
        return false;
    }
    
    return it->second->post();
}

int PriorityScheduler::semaphore_get_count(uint32_t sem_id) {
    auto it = semaphores_.find(sem_id);
    if (it == semaphores_.end()) {
        return -1;
    }
    
    return it->second->get_count();
}

// Event 관리 함수들
uint32_t PriorityScheduler::create_event() {
    auto event = std::make_shared<Event>();
    uint32_t event_id = next_sync_id_++;
    events_[event_id] = event;
    return event_id;
}

bool PriorityScheduler::delete_event(uint32_t event_id) {
    auto it = events_.find(event_id);
    if (it != events_.end()) {
        events_.erase(it);
        return true;
    }
    return false;
}

bool PriorityScheduler::event_wait(uint32_t event_id, uint32_t event_mask, bool clear_on_exit, uint32_t timeout_ms) {
    auto it = events_.find(event_id);
    if (it == events_.end()) {
        return false;
    }
    
    auto current_task = get_current_task();
    if (!current_task) {
        return false;
    }
    
    // 이벤트 대기
    if (!it->second->wait(event_mask, clear_on_exit, timeout_ms)) {
        return false; // 타임아웃 또는 실패
    }
    
    return true;
}

bool PriorityScheduler::event_set(uint32_t event_id, uint32_t event_bits) {
    auto it = events_.find(event_id);
    if (it == events_.end()) {
        return false;
    }
    
    return it->second->set(event_bits);
}

bool PriorityScheduler::event_clear(uint32_t event_id, uint32_t event_bits) {
    auto it = events_.find(event_id);
    if (it == events_.end()) {
        return false;
    }
    
    return it->second->clear(event_bits);
}

uint32_t PriorityScheduler::event_get_bits(uint32_t event_id) {
    auto it = events_.find(event_id);
    if (it == events_.end()) {
        return 0;
    }
    
    return it->second->get_bits();
}

// Signal 관리 함수들
uint32_t PriorityScheduler::create_signal() {
    auto signal = std::make_shared<Signal>();
    uint32_t signal_id = next_sync_id_++;
    signals_[signal_id] = signal;
    return signal_id;
}

bool PriorityScheduler::delete_signal(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it != signals_.end()) {
        signals_.erase(it);
        return true;
    }
    return false;
}

bool PriorityScheduler::signal_wait(uint32_t signal_id, uint32_t timeout_ms) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    auto current_task = get_current_task();
    if (!current_task) {
        return false;
    }
    
    // 시그널 대기
    if (!it->second->wait(timeout_ms)) {
        return false; // 타임아웃 또는 실패
    }
    
    return true;
}

bool PriorityScheduler::signal_send(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    return it->second->send();
}

bool PriorityScheduler::signal_reset(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    return it->second->reset();
}

bool PriorityScheduler::signal_is_set(uint32_t signal_id) {
    auto it = signals_.find(signal_id);
    if (it == signals_.end()) {
        return false;
    }
    
    return it->second->is_set();
}

void PriorityScheduler::print_priority_bitmap() const {
    std::cout << "Priority Bitmap: ";
    for (int i = 0; i < 16; ++i) {
        std::cout << std::hex << static_cast<int>(priority_bitmap_[i]) << " ";
    }
    std::cout << std::dec << std::endl;
}

void PriorityScheduler::print_task_queues() const {
    std::cout << "Task Queues:\n";
    for (uint8_t priority = 0; priority < MAX_PRIORITY_LEVELS; ++priority) {
        if (!task_queues_[priority].empty()) {
            std::cout << "  Priority " << static_cast<int>(priority) 
                      << ": " << task_queues_[priority].size() << " tasks\n";
        }
    }
}

// Message Queue 관리 함수들
uint32_t PriorityScheduler::create_message_queue(size_t max_size) {
    auto mq = std::make_shared<MessageQueue>(max_size);
    uint32_t mq_id = next_sync_id_++;
    message_queues_[mq_id] = mq;
    return mq_id;
}

bool PriorityScheduler::delete_message_queue(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it != message_queues_.end()) {
        message_queues_.erase(it);
        return true;
    }
    return false;
}

bool PriorityScheduler::message_queue_send(uint32_t mq_id, uint32_t type, const std::string& data, uint32_t timeout_ms) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    auto current_task = get_current_task();
    if (!current_task) {
        return false;
    }
    
    return it->second->send(type, data, timeout_ms);
}

bool PriorityScheduler::message_queue_send(uint32_t mq_id, const Message& message, uint32_t timeout_ms) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    auto current_task = get_current_task();
    if (!current_task) {
        return false;
    }
    
    return it->second->send(message, timeout_ms);
}

bool PriorityScheduler::message_queue_receive(uint32_t mq_id, uint32_t& type, std::string& data, uint32_t timeout_ms) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    auto current_task = get_current_task();
    if (!current_task) {
        return false;
    }
    
    return it->second->receive(type, data, timeout_ms);
}

bool PriorityScheduler::message_queue_receive(uint32_t mq_id, Message& message, uint32_t timeout_ms) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    auto current_task = get_current_task();
    if (!current_task) {
        return false;
    }
    
    return it->second->receive(message, timeout_ms);
}

size_t PriorityScheduler::message_queue_get_count(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return 0;
    }
    
    return it->second->get_message_count();
}

size_t PriorityScheduler::message_queue_get_max_size(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return 0;
    }
    
    return it->second->get_max_size();
}

bool PriorityScheduler::message_queue_is_empty(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return true;
    }
    
    return it->second->is_empty();
}

bool PriorityScheduler::message_queue_is_full(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    return it->second->is_full();
}

void PriorityScheduler::message_queue_clear(uint32_t mq_id) {
    auto it = message_queues_.find(mq_id);
    if (it != message_queues_.end()) {
        it->second->clear();
    }
}

bool PriorityScheduler::message_queue_peek(uint32_t mq_id, Message& message) {
    auto it = message_queues_.find(mq_id);
    if (it == message_queues_.end()) {
        return false;
    }
    
    return it->second->peek(message);
}

void PriorityScheduler::print_sync_objects() const {
    std::cout << "Synchronization Objects:\n";
    std::cout << "  Semaphores: " << semaphores_.size() << "\n";
    std::cout << "  Events: " << events_.size() << "\n";
    std::cout << "  Signals: " << signals_.size() << "\n";
    std::cout << "  Message Queues: " << message_queues_.size() << "\n";
    std::cout << "  Blocked Tasks: " << blocked_tasks_.size() << "\n";
}

} // namespace RTOS