#pragma once

#include <cstdint>
#include <chrono>
#include <memory>
#include <thread>
#include <atomic>

namespace RTOS {

// Timing interface for different timing strategies
class ITimingProvider {
public:
    virtual ~ITimingProvider() = default;
    
    // Get current time in milliseconds
    virtual std::chrono::milliseconds get_current_time() const = 0;
    
    // Get current time point
    virtual std::chrono::steady_clock::time_point get_current_time_point() const = 0;
    
    // Sleep for specified duration
    virtual void sleep_for(std::chrono::milliseconds duration) = 0;
    
    // Sleep until specified time point
    virtual void sleep_until(std::chrono::steady_clock::time_point target_time) = 0;
    
    // Check if timing is based on ticks
    virtual bool is_tick_based() const = 0;
    
    // Get tick count (only valid for tick-based timing)
    virtual uint64_t get_tick_count() const = 0;
    
    // Get tick interval in milliseconds (only valid for tick-based timing)
    virtual std::chrono::milliseconds get_tick_interval() const = 0;
    
    // Start the timing provider
    virtual void start() = 0;
    
    // Stop the timing provider
    virtual void stop() = 0;
    
    // Check if timing provider is running
    virtual bool is_running() const = 0;
};

// Real-time timing provider using system clock
class RealtimeTimingProvider : public ITimingProvider {
private:
    std::atomic<bool> running_{false};
    
public:
    RealtimeTimingProvider() = default;
    ~RealtimeTimingProvider() override { stop(); }
    
    std::chrono::milliseconds get_current_time() const override;
    std::chrono::steady_clock::time_point get_current_time_point() const override;
    void sleep_for(std::chrono::milliseconds duration) override;
    void sleep_until(std::chrono::steady_clock::time_point target_time) override;
    
    bool is_tick_based() const override { return false; }
    uint64_t get_tick_count() const override { return 0; }
    std::chrono::milliseconds get_tick_interval() const override { return std::chrono::milliseconds(0); }
    
    void start() override { running_ = true; }
    void stop() override { running_ = false; }
    bool is_running() const override { return running_.load(); }
};

// Tick-based timing provider simulating RTOS tick system
class TickBasedTimingProvider : public ITimingProvider {
private:
    std::atomic<uint64_t> tick_count_{0};
    std::chrono::milliseconds tick_interval_;
    std::thread tick_thread_;
    std::atomic<bool> running_{false};
    std::atomic<bool> should_stop_{false};
    std::chrono::steady_clock::time_point start_time_;
    
public:
    explicit TickBasedTimingProvider(std::chrono::milliseconds tick_interval = std::chrono::milliseconds(1));
    ~TickBasedTimingProvider() override;
    
    std::chrono::milliseconds get_current_time() const override;
    std::chrono::steady_clock::time_point get_current_time_point() const override;
    void sleep_for(std::chrono::milliseconds duration) override;
    void sleep_until(std::chrono::steady_clock::time_point target_time) override;
    
    bool is_tick_based() const override { return true; }
    uint64_t get_tick_count() const override { return tick_count_.load(); }
    std::chrono::milliseconds get_tick_interval() const override { return tick_interval_; }
    
    void start() override;
    void stop() override;
    bool is_running() const override { return running_.load(); }
    
private:
    void tick_thread_function();
};

// Factory for creating timing providers
class TimingProviderFactory {
public:
    static std::unique_ptr<ITimingProvider> create_realtime_provider();
    static std::unique_ptr<ITimingProvider> create_tick_based_provider(
        std::chrono::milliseconds tick_interval = std::chrono::milliseconds(1));
};

} // namespace RTOS
