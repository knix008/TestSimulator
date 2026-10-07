// platform/windows/wave_in_source.cpp
//
// Windows 마이크 입력 (waveIn/winmm). 16kHz·모노·16비트로 바로 받으므로 코어에서
// 변환할 일이 없다. CALLBACK_EVENT 로 받고 read() 안에서 이벤트를 기다린다.
#include <windows.h>

#include <mmsystem.h>

#include <atomic>
#include <cstring>
#include <string>
#include <vector>

#include "kstt/platform/audio_input.h"

namespace kstt::platform {
namespace {

constexpr int kBufferCount = 8;
constexpr int kBufferMillis = 100;

std::string wideToUtf8(const wchar_t* s) {
    if (!s || !*s) return {};
    const int n = WideCharToMultiByte(CP_UTF8, 0, s, -1, nullptr, 0, nullptr, nullptr);
    if (n <= 1) return {};
    std::string out(static_cast<size_t>(n - 1), '\0');
    WideCharToMultiByte(CP_UTF8, 0, s, -1, out.data(), n, nullptr, nullptr);
    return out;
}

std::string waveError(MMRESULT code) {
    wchar_t text[MAXERRORLENGTH] = {0};
    if (waveInGetErrorTextW(code, text, MAXERRORLENGTH) == MMSYSERR_NOERROR)
        return wideToUtf8(text);
    return "waveIn error " + std::to_string(code);
}

class WaveInSource : public AudioSource {
public:
    explicit WaveInSource(int deviceId) : deviceId_(deviceId) {}

    ~WaveInSource() override { close(); }

    bool open(int sampleRate, std::string* err) override {
        close();
        cancelled_ = false;

        event_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
        if (!event_) {
            if (err) *err = "CreateEvent failed";
            return false;
        }

        WAVEFORMATEX format = {};
        format.wFormatTag = WAVE_FORMAT_PCM;
        format.nChannels = 1;
        format.nSamplesPerSec = static_cast<DWORD>(sampleRate);
        format.wBitsPerSample = 16;
        format.nBlockAlign = 2;
        format.nAvgBytesPerSec = static_cast<DWORD>(sampleRate) * 2;
        format.cbSize = 0;

        const UINT device = deviceId_ < 0 ? static_cast<UINT>(WAVE_MAPPER)
                                          : static_cast<UINT>(deviceId_);
        MMRESULT result = waveInOpen(&handle_, device, &format,
                                     reinterpret_cast<DWORD_PTR>(event_), 0, CALLBACK_EVENT);
        if (result != MMSYSERR_NOERROR) {
            if (err)
                *err = "cannot open microphone (" + describeDevice() + "): " + waveError(result);
            close();
            return false;
        }

        const size_t samplesPerBuffer =
            static_cast<size_t>(sampleRate) * kBufferMillis / 1000;
        buffers_.assign(kBufferCount, std::vector<int16_t>(samplesPerBuffer));
        headers_.assign(kBufferCount, WAVEHDR{});
        for (int i = 0; i < kBufferCount; ++i) {
            headers_[i].lpData = reinterpret_cast<LPSTR>(buffers_[i].data());
            headers_[i].dwBufferLength =
                static_cast<DWORD>(samplesPerBuffer * sizeof(int16_t));
            result = waveInPrepareHeader(handle_, &headers_[i], sizeof(WAVEHDR));
            if (result != MMSYSERR_NOERROR) {
                if (err) *err = "waveInPrepareHeader: " + waveError(result);
                close();
                return false;
            }
            prepared_ = i + 1;
            result = waveInAddBuffer(handle_, &headers_[i], sizeof(WAVEHDR));
            if (result != MMSYSERR_NOERROR) {
                if (err) *err = "waveInAddBuffer: " + waveError(result);
                close();
                return false;
            }
        }

        result = waveInStart(handle_);
        if (result != MMSYSERR_NOERROR) {
            if (err) *err = "waveInStart: " + waveError(result);
            close();
            return false;
        }
        started_ = true;
        next_ = 0;
        consumedBytes_ = 0;
        return true;
    }

    void close() override {
        if (handle_) {
            if (started_) {
                waveInStop(handle_);
                waveInReset(handle_);  // 미완료 버퍼를 모두 돌려받는다
                started_ = false;
            }
            for (int i = 0; i < prepared_; ++i)
                waveInUnprepareHeader(handle_, &headers_[i], sizeof(WAVEHDR));
            prepared_ = 0;
            waveInClose(handle_);
            handle_ = nullptr;
        }
        if (event_) {
            CloseHandle(event_);
            event_ = nullptr;
        }
        headers_.clear();
        buffers_.clear();
    }

    int read(int16_t* dst, int maxSamples) override {
        if (!handle_ || maxSamples <= 0) return -1;

        while (true) {
            if (cancelled_.load()) return 0;

            WAVEHDR& header = headers_[static_cast<size_t>(next_)];
            if (header.dwFlags & WHDR_DONE) {
                const DWORD recorded = header.dwBytesRecorded;
                if (consumedBytes_ >= recorded) {
                    requeue(header);
                    continue;
                }
                const DWORD availableBytes = recorded - consumedBytes_;
                const DWORD wantedBytes =
                    static_cast<DWORD>(maxSamples) * static_cast<DWORD>(sizeof(int16_t));
                const DWORD copyBytes = availableBytes < wantedBytes ? availableBytes
                                                                     : wantedBytes;
                memcpy(dst, header.lpData + consumedBytes_, copyBytes);
                consumedBytes_ += copyBytes;
                if (consumedBytes_ >= recorded) requeue(header);
                return static_cast<int>(copyBytes / sizeof(int16_t));
            }

            // 아직 채워지지 않았다 — 드라이버가 깨워줄 때까지 기다린다.
            // 타임아웃을 두어 cancel() 을 놓치지 않는다.
            WaitForSingleObject(event_, 100);
        }
    }

    void cancel() override {
        cancelled_ = true;
        if (event_) SetEvent(event_);
    }

    std::string name() const override { return describeDevice(); }
    bool isLive() const override { return true; }

private:
    void requeue(WAVEHDR& header) {
        header.dwFlags &= ~static_cast<DWORD>(WHDR_DONE);
        header.dwBytesRecorded = 0;
        waveInAddBuffer(handle_, &header, sizeof(WAVEHDR));
        consumedBytes_ = 0;
        next_ = (next_ + 1) % kBufferCount;
    }

    std::string describeDevice() const {
        if (deviceId_ < 0) return "마이크 (시스템 기본)";
        WAVEINCAPSW caps = {};
        if (waveInGetDevCapsW(static_cast<UINT_PTR>(deviceId_), &caps, sizeof(caps)) ==
            MMSYSERR_NOERROR) {
            return wideToUtf8(caps.szPname);
        }
        return "마이크 " + std::to_string(deviceId_);
    }

    int deviceId_ = -1;
    HWAVEIN handle_ = nullptr;
    HANDLE event_ = nullptr;
    std::vector<std::vector<int16_t>> buffers_;
    std::vector<WAVEHDR> headers_;
    int prepared_ = 0;
    bool started_ = false;
    int next_ = 0;
    DWORD consumedBytes_ = 0;
    std::atomic<bool> cancelled_{false};
};

}  // namespace

std::vector<AudioDevice> inputDevices() {
    std::vector<AudioDevice> devices;
    devices.push_back({-1, "시스템 기본 입력 장치"});

    const UINT count = waveInGetNumDevs();
    for (UINT i = 0; i < count; ++i) {
        WAVEINCAPSW caps = {};
        if (waveInGetDevCapsW(i, &caps, sizeof(caps)) != MMSYSERR_NOERROR) continue;
        std::string name = wideToUtf8(caps.szPname);
        if (name.empty()) name = "입력 장치 " + std::to_string(i);
        devices.push_back({static_cast<int>(i), name});
    }
    return devices;
}

std::shared_ptr<AudioSource> createMicrophone(int deviceId) {
    return std::make_shared<WaveInSource>(deviceId);
}

const char* backendName() { return "waveIn"; }

}  // namespace kstt::platform
