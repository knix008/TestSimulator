// Sensor logger: reads a device every second and writes a CSV log.
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <string>

#include "sensor/device.hpp"
#include "sensor/reading.hpp"

namespace sensor {
int writeCsv(const char* file, const Reading* items, int n);
char* formatLabel(const char* prefix, int channel);
}

using namespace sensor;

int main(int argc, char** argv) {
    const char* port = argc > 1 ? argv[1] : "ttyS0";
    std::unique_ptr<Device> dev = makeDevice(argc > 2 ? argv[2] : "serial");
    if (!dev->open(port)) {  // makeDevice returns null for unknown kinds (needs cross-function null tracking; not detected yet)
        std::printf("cannot open %s\n", port);
        return 1;
    }
    RingBuffer buffer(8);
    for (int i = 0; i < 8; i++) {
        buffer.push(dev->read());
    }
    const Reading* last = buffer.latest();
    std::printf("last %.2f %s\n", last->value, unitName(last->unit).c_str());

    char command[128];
    std::snprintf(command, sizeof(command), "logger-upload %s", argv[1]);
    std::system(command);  // OS_CMD_INJECTION / CERT ENV33-C

    char* label = formatLabel("thermo", 1);
    std::printf("%s average %.2f\n", label, buffer.average());
    return 0;  // RESOURCE_LEAK: label is never freed
}
