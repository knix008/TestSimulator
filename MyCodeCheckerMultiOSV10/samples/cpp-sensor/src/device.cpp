#include "sensor/device.hpp"

#include <cstdlib>
#include <cstring>

namespace sensor {

SerialThermometer::SerialThermometer(std::string name)
    : Device(name), port_(nullptr), lineBuffer_(static_cast<char*>(std::malloc(64))) {}

SerialThermometer::~SerialThermometer() {
    if (port_ != nullptr) {
        std::fclose(port_);
    }
    // lineBuffer_ is never freed (CTOR_DTOR_LEAK)
}

bool SerialThermometer::open(const char* port) {
    char path[16];
    std::strcpy(path, "/dev/");
    std::strcat(path, port);  // STRING_OVERFLOW / OVERRUN for long port names
    port_ = std::fopen(path, "r");
    return port_ != nullptr;
}

Reading SerialThermometer::read() {
    Reading r;
    r.channel = 1;
    r.unit = Fahrenheit;
    if (std::fgets(lineBuffer_, 64, port_) == nullptr) {  // port_ may be null (member state; not detected yet)
        r.value = -1;
        return r;
    }
    r.value = toCelsius(std::atof(lineBuffer_));
    r.label = name_;
    return r;
}

std::unique_ptr<Device> makeDevice(const std::string& kind) {
    if (kind == "serial") {
        return std::unique_ptr<Device>(new SerialThermometer("thermo"));
    }
    return nullptr;
}

std::vector<std::string> listPorts() {
    std::vector<std::string> ports;
    for (int i = 0; i < 4; i++) {
        std::string name = "ttyS" + std::to_string(i);
        ports.push_back(name);  // COPY_INSTEAD_OF_MOVE: name is not used afterwards
    }
    return ports;
}

}  // namespace sensor
