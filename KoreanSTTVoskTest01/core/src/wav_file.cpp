#include "kstt/wav_file.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <filesystem>

namespace kstt {
namespace {

uint32_t readU32(const unsigned char* p) {
    return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) |
           (static_cast<uint32_t>(p[2]) << 16) | (static_cast<uint32_t>(p[3]) << 24);
}

uint16_t readU16(const unsigned char* p) {
    return static_cast<uint16_t>(static_cast<uint16_t>(p[0]) | (static_cast<uint16_t>(p[1]) << 8));
}

void writeU32(std::ofstream& f, uint32_t v) {
    const unsigned char b[4] = {static_cast<unsigned char>(v & 0xFF),
                                static_cast<unsigned char>((v >> 8) & 0xFF),
                                static_cast<unsigned char>((v >> 16) & 0xFF),
                                static_cast<unsigned char>((v >> 24) & 0xFF)};
    f.write(reinterpret_cast<const char*>(b), 4);
}

void writeU16(std::ofstream& f, uint16_t v) {
    const unsigned char b[2] = {static_cast<unsigned char>(v & 0xFF),
                                static_cast<unsigned char>((v >> 8) & 0xFF)};
    f.write(reinterpret_cast<const char*>(b), 2);
}

// Windows 에서 UTF-8 경로를 제대로 열려면 와이드 경로로 넘겨야 한다.
// std::filesystem::u8path 가 그 변환을 해 준다 (C++17).
std::ifstream openBinary(const std::string& path) {
#if defined(_WIN32)
    return std::ifstream(std::filesystem::u8path(path), std::ios::binary);
#else
    return std::ifstream(path, std::ios::binary);
#endif
}

std::ofstream createBinary(const std::string& path) {
#if defined(_WIN32)
    return std::ofstream(std::filesystem::u8path(path), std::ios::binary | std::ios::trunc);
#else
    return std::ofstream(path, std::ios::binary | std::ios::trunc);
#endif
}

}  // namespace

bool readWav16Mono(const std::string& path, std::vector<int16_t>* out, int* srcRate,
                   int* srcChannels, int resampleTo, std::string* err) {
    const auto fail = [err](const std::string& message) {
        if (err) *err = message;
        return false;
    };

    std::ifstream file = openBinary(path);
    if (!file) return fail("cannot open WAV file: " + path);

    unsigned char header[12];
    file.read(reinterpret_cast<char*>(header), 12);
    if (!file || std::memcmp(header, "RIFF", 4) != 0 || std::memcmp(header + 8, "WAVE", 4) != 0)
        return fail("not a RIFF/WAVE file: " + path);

    int channels = 0;
    int rate = 0;
    int bits = 0;
    int format = 0;
    std::vector<int16_t> interleaved;
    bool haveFmt = false;
    bool haveData = false;

    while (file) {
        unsigned char chunkHeader[8];
        file.read(reinterpret_cast<char*>(chunkHeader), 8);
        if (!file) break;
        const uint32_t size = readU32(chunkHeader + 4);

        if (std::memcmp(chunkHeader, "fmt ", 4) == 0) {
            std::vector<unsigned char> fmt(std::max<uint32_t>(size, 16), 0);
            file.read(reinterpret_cast<char*>(fmt.data()), size);
            if (!file) return fail("truncated fmt chunk: " + path);
            format = readU16(fmt.data());
            channels = readU16(fmt.data() + 2);
            rate = static_cast<int>(readU32(fmt.data() + 4));
            bits = readU16(fmt.data() + 14);
            haveFmt = true;
        } else if (std::memcmp(chunkHeader, "data", 4) == 0) {
            if (!haveFmt) return fail("data chunk before fmt chunk: " + path);
            if (bits != 16) return fail("only 16-bit PCM WAV is supported (file has " +
                                        std::to_string(bits) + "-bit): " + path);
            if (format != 1 && format != 0xFFFE)
                return fail("only PCM WAV is supported (format " + std::to_string(format) +
                            "): " + path);
            interleaved.resize(size / 2);
            file.read(reinterpret_cast<char*>(interleaved.data()), size);
            // 꼬리가 잘린 파일도 읽은 만큼 쓴다.
            const std::streamsize got = file.gcount();
            interleaved.resize(static_cast<size_t>(std::max<std::streamsize>(got, 0) / 2));
            file.clear();
            haveData = true;
            break;
        } else {
            file.seekg(size + (size & 1), std::ios::cur);
        }
    }

    if (!haveFmt || !haveData) return fail("no fmt/data chunk found: " + path);
    if (channels <= 0) return fail("invalid channel count in " + path);

    // 모노로 섞는다.
    std::vector<int16_t> mono;
    if (channels == 1) {
        mono = std::move(interleaved);
    } else {
        const size_t frames = interleaved.size() / static_cast<size_t>(channels);
        mono.resize(frames);
        for (size_t i = 0; i < frames; ++i) {
            int sum = 0;
            for (int c = 0; c < channels; ++c)
                sum += interleaved[i * static_cast<size_t>(channels) + static_cast<size_t>(c)];
            mono[i] = static_cast<int16_t>(sum / channels);
        }
    }

    // 필요하면 선형 보간으로 표본율을 맞춘다.
    if (resampleTo > 0 && rate > 0 && rate != resampleTo && !mono.empty()) {
        const double ratio = static_cast<double>(rate) / static_cast<double>(resampleTo);
        const size_t outCount =
            static_cast<size_t>(static_cast<double>(mono.size()) / ratio);
        std::vector<int16_t> resampled(outCount);
        for (size_t i = 0; i < outCount; ++i) {
            const double src = static_cast<double>(i) * ratio;
            const size_t i0 = static_cast<size_t>(src);
            const size_t i1 = std::min(i0 + 1, mono.size() - 1);
            const double frac = src - static_cast<double>(i0);
            const double v = static_cast<double>(mono[i0]) * (1.0 - frac) +
                             static_cast<double>(mono[i1]) * frac;
            resampled[i] = static_cast<int16_t>(std::lround(v));
        }
        mono = std::move(resampled);
    }

    if (srcRate) *srcRate = rate;
    if (srcChannels) *srcChannels = channels;
    *out = std::move(mono);
    return true;
}

bool writeWav16(const std::string& path, const int16_t* samples, size_t count, int sampleRate,
                std::string* err) {
    std::ofstream file = createBinary(path);
    if (!file) {
        if (err) *err = "cannot create WAV file: " + path;
        return false;
    }
    const uint32_t dataBytes = static_cast<uint32_t>(count * sizeof(int16_t));
    file.write("RIFF", 4);
    writeU32(file, 36 + dataBytes);
    file.write("WAVE", 4);
    file.write("fmt ", 4);
    writeU32(file, 16);
    writeU16(file, 1);  // PCM
    writeU16(file, 1);  // 모노
    writeU32(file, static_cast<uint32_t>(sampleRate));
    writeU32(file, static_cast<uint32_t>(sampleRate * 2));  // 바이트/초
    writeU16(file, 2);                                      // 블록 정렬
    writeU16(file, 16);                                     // 비트/표본
    file.write("data", 4);
    writeU32(file, dataBytes);
    file.write(reinterpret_cast<const char*>(samples), static_cast<std::streamsize>(dataBytes));
    if (!file) {
        if (err) *err = "write failed: " + path;
        return false;
    }
    return true;
}

WavFileSource::WavFileSource(std::string path) : path_(std::move(path)) {}
WavFileSource::~WavFileSource() = default;

bool WavFileSource::open(int sampleRate, std::string* err) {
    cancelled_ = false;
    pos_ = 0;
    targetRate_ = sampleRate;
    return readWav16Mono(path_, &mono_, &srcRate_, &srcChannels_, sampleRate, err);
}

void WavFileSource::close() {
    mono_.clear();
    mono_.shrink_to_fit();
    pos_ = 0;
}

int WavFileSource::read(int16_t* dst, int maxSamples) {
    if (cancelled_) return 0;
    if (pos_ >= mono_.size()) return 0;
    const size_t n = std::min(static_cast<size_t>(maxSamples), mono_.size() - pos_);
    std::memcpy(dst, mono_.data() + pos_, n * sizeof(int16_t));
    pos_ += n;
    return static_cast<int>(n);
}

void WavFileSource::cancel() { cancelled_ = true; }

std::string WavFileSource::name() const {
    return std::filesystem::path(path_).filename().string();
}

double WavFileSource::durationSeconds() const {
    // mono_ 는 목표 표본율로 변환된 상태라 길이는 targetRate_ 로 나눈다.
    if (targetRate_ <= 0 || mono_.empty()) return 0.0;
    return static_cast<double>(mono_.size()) / static_cast<double>(targetRate_);
}

double WavFileSource::progress() const {
    if (mono_.empty()) return 0.0;
    return static_cast<double>(pos_) / static_cast<double>(mono_.size());
}

}  // namespace kstt
