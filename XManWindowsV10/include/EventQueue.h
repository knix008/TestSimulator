#pragma once
#include <cstdint>
#include <mutex>
#include <queue>
#include <vector>

namespace XMan {

// 메인 스레드(이벤트 생성) → 수신 스레드(클라이언트 전송) 간 이벤트 큐
class EventQueue
{
public:
    void push(std::vector<uint8_t> event)
    {
        std::lock_guard<std::mutex> lk(m_mutex);
        m_events.push(std::move(event));
    }

    bool pop(std::vector<uint8_t>& out)
    {
        std::lock_guard<std::mutex> lk(m_mutex);
        if (m_events.empty())
            return false;
        out = std::move(m_events.front());
        m_events.pop();
        return true;
    }

    bool empty() const
    {
        std::lock_guard<std::mutex> lk(m_mutex);
        return m_events.empty();
    }

private:
    std::queue<std::vector<uint8_t>> m_events;
    mutable std::mutex m_mutex;
};

} // namespace XMan
