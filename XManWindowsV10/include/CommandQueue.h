#pragma once
#include <functional>
#include <future>
#include <mutex>
#include <queue>

namespace XMan {

// 수신 스레드에서 메인 스레드로 작업을 위임하는 큐
class CommandQueue
{
public:
    void post(std::function<void()> fn)
    {
        std::lock_guard<std::mutex> lk(m_mutex);
        m_queue.push(std::move(fn));
    }

    // 결과를 기다리는 동기 버전 (수신 스레드에서 호출, 메인 스레드가 실행)
    template <typename Fn>
    auto postSync(Fn fn) -> decltype(fn())
    {
        using R = decltype(fn());
        auto promise = std::make_shared<std::promise<R>>();
        auto future  = promise->get_future();
        post([fn = std::move(fn), promise]() mutable {
            promise->set_value(fn());
        });
        return future.get();
    }

    // 메인 스레드에서 호출 — 쌓인 작업 모두 실행
    void drain()
    {
        std::queue<std::function<void()>> local;
        {
            std::lock_guard<std::mutex> lk(m_mutex);
            std::swap(local, m_queue);
        }
        while (!local.empty())
        {
            local.front()();
            local.pop();
        }
    }

private:
    std::queue<std::function<void()>> m_queue;
    std::mutex m_mutex;
};

} // namespace XMan
