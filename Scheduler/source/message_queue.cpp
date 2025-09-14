#include "message_queue.h"
#include <chrono>
#include <ctime>

namespace RTOS {

// MessageQueue 구현
MessageQueue::MessageQueue(size_t max_size) 
    : max_size_(max_size), next_message_id_(1) {}

bool MessageQueue::send(const Message& message, uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        // 무한 대기
        cv_.wait(lock, [this] { return messages_.size() < max_size_; });
    } else {
        // 타임아웃 대기
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this] { return messages_.size() < max_size_; })) {
            return false; // 타임아웃
        }
    }
    
    // 메시지 ID 설정 (0인 경우 자동 생성)
    Message msg = message;
    if (msg.id == 0) {
        msg.id = next_message_id_++;
    }
    
    // 타임스탬프 설정 (0인 경우 현재 시간)
    if (msg.timestamp == 0) {
        msg.timestamp = static_cast<uint32_t>(std::time(nullptr));
    }
    
    messages_.push(msg);
    cv_.notify_one(); // 대기 중인 수신자에게 알림
    
    return true;
}

bool MessageQueue::send(uint32_t type, const std::string& data, uint32_t timeout_ms) {
    Message message(0, type, data);
    return send(message, timeout_ms);
}

bool MessageQueue::receive(Message& message, uint32_t timeout_ms) {
    std::unique_lock<std::mutex> lock(mutex_);
    
    if (timeout_ms == 0) {
        // 무한 대기
        cv_.wait(lock, [this] { return !messages_.empty(); });
    } else {
        // 타임아웃 대기
        auto timeout = std::chrono::milliseconds(timeout_ms);
        if (!cv_.wait_for(lock, timeout, [this] { return !messages_.empty(); })) {
            return false; // 타임아웃
        }
    }
    
    message = messages_.front();
    messages_.pop();
    cv_.notify_one(); // 대기 중인 송신자에게 알림
    
    return true;
}

bool MessageQueue::receive(uint32_t& type, std::string& data, uint32_t timeout_ms) {
    Message message;
    if (receive(message, timeout_ms)) {
        type = message.type;
        data = message.data;
        return true;
    }
    return false;
}

size_t MessageQueue::get_message_count() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return messages_.size();
}

size_t MessageQueue::get_max_size() const {
    return max_size_;
}

bool MessageQueue::is_empty() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return messages_.empty();
}

bool MessageQueue::is_full() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return messages_.size() >= max_size_;
}

void MessageQueue::clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    std::queue<Message> empty;
    messages_.swap(empty);
    cv_.notify_all(); // 모든 대기 중인 송신자에게 알림
}

bool MessageQueue::peek(Message& message) const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!messages_.empty()) {
        message = messages_.front();
        return true;
    }
    return false;
}

} // namespace RTOS
