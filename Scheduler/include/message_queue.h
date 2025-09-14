#pragma once

#include <cstdint>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <memory>
#include <string>

namespace RTOS {

// 메시지 구조체
struct Message {
    uint32_t id;
    uint32_t type;
    std::string data;
    uint32_t timestamp;
    
    Message(uint32_t msg_id = 0, uint32_t msg_type = 0, const std::string& msg_data = "", uint32_t msg_timestamp = 0)
        : id(msg_id), type(msg_type), data(msg_data), timestamp(msg_timestamp) {}
};

// Message Queue 클래스
class MessageQueue {
private:
    std::queue<Message> messages_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    size_t max_size_;
    uint32_t next_message_id_;
    
public:
    explicit MessageQueue(size_t max_size = 100);
    ~MessageQueue() = default;
    
    // 메시지 전송
    bool send(const Message& message, uint32_t timeout_ms = 0);
    bool send(uint32_t type, const std::string& data, uint32_t timeout_ms = 0);
    
    // 메시지 수신
    bool receive(Message& message, uint32_t timeout_ms = 0);
    bool receive(uint32_t& type, std::string& data, uint32_t timeout_ms = 0);
    
    // 상태 조회
    size_t get_message_count() const;
    size_t get_max_size() const;
    bool is_empty() const;
    bool is_full() const;
    
    // 큐 관리
    void clear();
    bool peek(Message& message) const;
};

} // namespace RTOS
