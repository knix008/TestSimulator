// Sensor reading value type and the ring buffer that keeps the latest samples.
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

#include "sensor/units.hpp"

namespace sensor {

struct Reading {
    std::uint32_t channel;
    double value;
    Unit unit;
    std::string label;
};

class RingBuffer {
public:
    explicit RingBuffer(std::size_t capacity);
    ~RingBuffer();

    void push(const Reading& r);
    const Reading* latest() const;
    double average() const;
    std::size_t size() const { return count_; }

private:
    Reading* items_;
    std::size_t capacity_;
    std::size_t head_;
    std::size_t count_;
};

}  // namespace sensor
