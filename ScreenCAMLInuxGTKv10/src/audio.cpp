#include "audio.h"

#include <cstdio>
#include <cstring>
#include <string>

// Parse `pactl list sources` verbose output.
// Extracts Name: and Description: fields, skips .monitor loopback devices.
std::vector<AudioSource> audio_enumerate_sources() {
    std::vector<AudioSource> result;
    result.push_back({"기본 마이크 (시스템 기본값)", ""});

    FILE* pipe = popen("pactl list sources 2>/dev/null", "r");
    if (!pipe) return result;

    char buf[1024];
    std::string cur_name, cur_desc;

    auto flush = [&]() {
        if (cur_name.empty()) return;
        if (cur_name.find(".monitor") != std::string::npos) {
            cur_name.clear(); cur_desc.clear();
            return;
        }
        const std::string display = cur_desc.empty() ? cur_name : cur_desc;
        result.push_back({display, cur_name});
        cur_name.clear(); cur_desc.clear();
    };

    while (fgets(buf, sizeof(buf), pipe)) {
        // Trim trailing newline/CR
        std::string line = buf;
        while (!line.empty() && (line.back() == '\n' || line.back() == '\r'))
            line.pop_back();

        if (line.rfind("Source #", 0) == 0) {
            flush();
        } else if (line.rfind("\tName: ", 0) == 0) {
            cur_name = line.substr(7);   // len("\tName: ") == 7
        } else if (line.rfind("\tDescription: ", 0) == 0) {
            cur_desc = line.substr(14);  // len("\tDescription: ") == 14
        }
    }
    flush();
    pclose(pipe);
    return result;
}
