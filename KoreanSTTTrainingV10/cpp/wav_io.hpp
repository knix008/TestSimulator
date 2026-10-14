#pragma once

#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace kws {

struct WavData {
    int sample_rate = 0;
    std::vector<float> samples;
};

inline uint16_t read_u16(const unsigned char* data) {
    return static_cast<uint16_t>(data[0] | (static_cast<uint16_t>(data[1]) << 8));
}

inline uint32_t read_u32_bytes(const unsigned char* data) {
    return static_cast<uint32_t>(data[0]) | (static_cast<uint32_t>(data[1]) << 8) |
           (static_cast<uint32_t>(data[2]) << 16) | (static_cast<uint32_t>(data[3]) << 24);
}

inline uint32_t read_u32_stream(std::istream& in) {
    unsigned char bytes[4];
    if (!in.read(reinterpret_cast<char*>(bytes), 4)) {
        throw std::runtime_error("WAV 헤더가 짧습니다.");
    }
    return read_u32_bytes(bytes);
}

inline WavData read_wav(const std::filesystem::path& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        throw std::runtime_error("WAV 파일을 열 수 없습니다.");
    }
    char riff[12];
    if (!in.read(riff, 12) || std::string(riff, 4) != "RIFF" || std::string(riff + 8, 4) != "WAVE") {
        throw std::runtime_error("WAV 형식이 아닙니다.");
    }

    std::vector<unsigned char> fmt;
    std::vector<unsigned char> data;
    while (in && (fmt.empty() || data.empty())) {
        char id_bytes[4];
        if (!in.read(id_bytes, 4)) {
            break;
        }
        const std::string id(id_bytes, 4);
        const uint32_t size = read_u32_stream(in);
        if (size > 64u * 1024u * 1024u) {
            throw std::runtime_error("WAV 청크가 너무 큽니다.");
        }
        std::vector<unsigned char> chunk(size);
        if (size > 0 && !in.read(reinterpret_cast<char*>(chunk.data()), static_cast<std::streamsize>(size))) {
            throw std::runtime_error("WAV 데이터를 읽지 못했습니다.");
        }
        if (size % 2 == 1) {
            in.ignore(1);
        }
        if (id == "fmt ") {
            fmt = std::move(chunk);
        } else if (id == "data") {
            data = std::move(chunk);
        }
    }
    if (fmt.size() < 16 || data.empty()) {
        throw std::runtime_error("WAV에 fmt 또는 data 청크가 없습니다.");
    }

    int audio_format = read_u16(fmt.data());
    const int channels = read_u16(fmt.data() + 2);
    const int sample_rate = static_cast<int>(read_u32_bytes(fmt.data() + 4));
    const int block_align = read_u16(fmt.data() + 12);
    const int bits = read_u16(fmt.data() + 14);
    if (audio_format == 0xFFFE) {
        if (fmt.size() < 26) {
            throw std::runtime_error("확장 WAV 헤더가 짧습니다.");
        }
        audio_format = read_u16(fmt.data() + 24);
    }
    if (channels < 1 || channels > 8 || block_align <= 0 || sample_rate <= 0) {
        throw std::runtime_error("지원하지 않는 WAV 채널 또는 샘플레이트입니다.");
    }
    if (data.size() % static_cast<size_t>(block_align) != 0) {
        throw std::runtime_error("WAV 데이터 길이가 맞지 않습니다.");
    }

    const size_t frames = data.size() / static_cast<size_t>(block_align);
    WavData wav;
    wav.sample_rate = sample_rate;
    wav.samples.resize(frames);
    const bool pcm16 = audio_format == 1 && bits == 16;
    const bool pcm32 = audio_format == 3 && bits == 32;
    if (!pcm16 && !pcm32) {
        throw std::runtime_error("16-bit PCM 또는 32-bit float WAV만 지원합니다.");
    }
    for (size_t frame = 0; frame < frames; ++frame) {
        const unsigned char* frame_data = data.data() + frame * static_cast<size_t>(block_align);
        double sum = 0.0;
        for (int channel = 0; channel < channels; ++channel) {
            const unsigned char* sample = frame_data + static_cast<size_t>(channel * (bits / 8));
            if (pcm16) {
                const auto value = static_cast<int16_t>(read_u16(sample));
                sum += static_cast<double>(value) / 32768.0;
            } else {
                float value = 0.f;
                static_assert(sizeof(float) == 4, "float must be 32-bit");
                std::memcpy(&value, sample, sizeof(float));
                sum += static_cast<double>(value);
            }
        }
        wav.samples[frame] = static_cast<float>(sum / static_cast<double>(channels));
    }
    return wav;
}

}  // namespace kws
