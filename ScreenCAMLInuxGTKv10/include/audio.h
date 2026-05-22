#pragma once
#include <string>
#include <vector>

struct AudioSource {
    std::string display_name;  // Human-readable (Description from pactl)
    std::string device_id;     // PulseAudio source name; empty = system default
};

// Enumerate available audio input sources via pactl.
// First entry is always the system default (device_id="").
// Monitor (loopback) devices are excluded.
std::vector<AudioSource> audio_enumerate_sources();
