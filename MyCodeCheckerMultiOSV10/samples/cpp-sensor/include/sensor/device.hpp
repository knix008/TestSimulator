// Devices that produce readings. The base class has virtual functions but no
// virtual destructor on purpose (VIRTUAL_DTOR / AUTOSAR A12-4-1; not detected yet).
#pragma once

#include <cstdio>
#include <memory>
#include <string>
#include <vector>

#include "sensor/reading.hpp"

namespace sensor {

class Device {
public:
    explicit Device(std::string name) : name_(name) {}
    virtual Reading read() = 0;
    virtual bool open(const char* port) = 0;
    const std::string& name() const { return name_; }

protected:
    std::string name_;
};

class SerialThermometer : public Device {
public:
    explicit SerialThermometer(std::string name);
    ~SerialThermometer();
    Reading read() override;
    bool open(const char* port) override;

private:
    FILE* port_;
    char* lineBuffer_;
};

std::unique_ptr<Device> makeDevice(const std::string& kind);
std::vector<std::string> listPorts();

}  // namespace sensor
