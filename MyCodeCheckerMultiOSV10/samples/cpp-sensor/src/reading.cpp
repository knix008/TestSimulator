#include "sensor/reading.hpp"

#include <cstring>

namespace sensor {

RingBuffer::RingBuffer(std::size_t capacity)
    : items_(new Reading[capacity]), capacity_(capacity), head_(0), count_(0) {}

RingBuffer::~RingBuffer() {
    delete items_;  // DELETE_ARRAY: allocated with new[]
}

void RingBuffer::push(const Reading& r) {
    items_[head_] = r;
    head_ = (head_ + 1) % capacity_;
    if (count_ < capacity_) {
        ++count_;
    }
}

const Reading* RingBuffer::latest() const {
    if (count_ == 0) {
        return nullptr;
    }
    return &items_[(head_ + capacity_ - 1) % capacity_];
}

double RingBuffer::average() const {
    double sum = 0;
    for (std::size_t i = 0; i < count_; i++) {
        sum += items_[i].value;
    }
    return sum / count_;  // divides by zero when the buffer is empty (member state; not detected yet)
}

std::string unitName(Unit u) {
    switch (u) {
    case Celsius:
        return "C";
    case Fahrenheit:
        return "F";
    case Volt:
        return "V";  // MISSING_BREAK is not needed here, but Ampere falls into default
    case Ampere:
    default:
        return "A";
    }
}

}  // namespace sensor
