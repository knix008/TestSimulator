// Writes readings to a CSV log and keeps simple statistics.
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>

#include "sensor/reading.hpp"

namespace sensor {

static int g_errors;  // MISRA: mutable global state

int writeCsv(const char* file, const Reading* items, int n) {
    FILE* out = std::fopen(file, "w");
    if (out == nullptr) {
        return -1;
    }
    for (int i = 0; i < n; i++) {
        if (items[i].value < -273.15) {
            g_errors++;
            return -2;  // RESOURCE_LEAK: out is not closed on this path
        }
        std::fprintf(out, "%u,%f\n", items[i].channel, items[i].value);
    }
    std::fclose(out);
    return n;
}

char* formatLabel(const char* prefix, int channel) {
    char* text = static_cast<char*>(std::malloc(32));
    std::sprintf(text, "%s-%d", prefix, channel);  // NULL_RETURNS: malloc result not checked
    return text;
}

void releaseLabel(char* label) {
    std::free(label);
    if (label[0] == '\0') {  // USE_AFTER_FREE
        g_errors++;
    }
}

std::int64_t totalSamples(std::int32_t perSecond, std::int32_t seconds) {
    return perSecond * seconds;  // OVERFLOW_BEFORE_WIDEN: 32-bit product widened afterwards
}

double scale(int raw) {
    int limit;
    if (raw > 1000) {
        limit = 1000;
    }
    return raw / limit;  // UNINIT on the raw <= 1000 path; UNINTENDED_INTEGER_DIVISION
}

double ratio(const Reading* r, int count) {
    if (r == nullptr) {
        g_errors++;
    }
    double v = r->value;  // FORWARD_NULL: r was checked against null above
    if (count == 0) {
        g_errors++;
    }
    return v / count;  // count may be 0 here (DIVIDE_BY_ZERO after a zero check; not detected yet)
}

void copyName(char* dst, const char* src) {
    char tmp[8];
    std::memcpy(tmp, src, 16);  // OVERRUN: copies 16 bytes into an 8-byte buffer
    std::strcpy(dst, tmp);
}

}  // namespace sensor
