// platform/linux/alsa_source.cpp
//
// Linux 마이크 입력 (ALSA). 16kHz·모노·S16_LE 로 직접 받는다.
// snd_pcm_readi 가 블로킹이라 cancel() 은 플래그를 세우고 짧은 타임아웃으로 빠져
// 나오게 한다(snd_pcm_wait).
#include <alsa/asoundlib.h>

#include <atomic>
#include <cerrno>
#include <cstdlib>
#include <string>
#include <vector>

#include "kstt/platform/audio_input.h"

namespace kstt::platform {
namespace {

class AlsaSource : public AudioSource {
public:
    explicit AlsaSource(int deviceId, std::string deviceName)
        : deviceId_(deviceId), deviceName_(std::move(deviceName)) {}

    ~AlsaSource() override { close(); }

    bool open(int sampleRate, std::string* err) override {
        close();
        cancelled_ = false;

        const std::string device = deviceId_ < 0 ? "default" : deviceName_;
        int rc = snd_pcm_open(&handle_, device.c_str(), SND_PCM_STREAM_CAPTURE, 0);
        if (rc < 0) {
            if (err) *err = "snd_pcm_open(" + device + "): " + snd_strerror(rc);
            handle_ = nullptr;
            return false;
        }

        unsigned int rate = static_cast<unsigned int>(sampleRate);
        rc = snd_pcm_set_params(handle_, SND_PCM_FORMAT_S16_LE, SND_PCM_ACCESS_RW_INTERLEAVED,
                                1 /* 모노 */, rate, 1 /* 소프트 리샘플 허용 */,
                                200000 /* 지연 200ms */);
        if (rc < 0) {
            if (err) *err = std::string("snd_pcm_set_params: ") + snd_strerror(rc);
            close();
            return false;
        }

        rc = snd_pcm_prepare(handle_);
        if (rc < 0) {
            if (err) *err = std::string("snd_pcm_prepare: ") + snd_strerror(rc);
            close();
            return false;
        }
        snd_pcm_start(handle_);
        return true;
    }

    void close() override {
        if (handle_) {
            snd_pcm_drop(handle_);
            snd_pcm_close(handle_);
            handle_ = nullptr;
        }
    }

    int read(int16_t* dst, int maxSamples) override {
        if (!handle_ || maxSamples <= 0) return -1;

        while (true) {
            if (cancelled_.load()) return 0;

            // 100ms 기다려 보고, 데이터가 없으면 cancel 여부를 다시 확인한다.
            const int ready = snd_pcm_wait(handle_, 100);
            if (ready == 0) continue;  // 타임아웃
            if (ready < 0) {
                if (!recover(ready)) return -1;
                continue;
            }

            const snd_pcm_sframes_t got = snd_pcm_readi(handle_, dst, maxSamples);
            if (got > 0) return static_cast<int>(got);
            if (got == 0 || got == -EAGAIN) continue;
            if (!recover(static_cast<int>(got))) return -1;
        }
    }

    void cancel() override { cancelled_ = true; }

    std::string name() const override {
        return deviceId_ < 0 ? "마이크 (시스템 기본)" : deviceName_;
    }
    bool isLive() const override { return true; }

private:
    // 언더런/장치 일시 중단에서 복구한다. 복구 불가면 false.
    bool recover(int errorCode) {
        const int rc = snd_pcm_recover(handle_, errorCode, 1 /* 조용히 */);
        if (rc < 0) return false;
        snd_pcm_start(handle_);
        return true;
    }

    int deviceId_ = -1;
    std::string deviceName_;
    snd_pcm_t* handle_ = nullptr;
    std::atomic<bool> cancelled_{false};
};

}  // namespace

std::vector<AudioDevice> inputDevices() {
    std::vector<AudioDevice> devices;
    devices.push_back({-1, "시스템 기본 입력 장치 (default)"});

    void** hints = nullptr;
    if (snd_device_name_hint(-1, "pcm", &hints) != 0 || !hints) return devices;

    int id = 0;
    for (void** hint = hints; *hint; ++hint) {
        char* ioid = snd_device_name_get_hint(*hint, "IOID");
        char* name = snd_device_name_get_hint(*hint, "NAME");
        char* desc = snd_device_name_get_hint(*hint, "DESC");

        // IOID 가 없으면 입·출력 겸용, "Input" 이면 입력 전용. 출력 전용은 건너뛴다.
        const bool isInput = !ioid || std::string(ioid) == "Input";
        if (isInput && name) {
            std::string label = name;
            if (desc) {
                std::string description = desc;
                // 설명의 첫 줄만 쓴다.
                const size_t nl = description.find('\n');
                if (nl != std::string::npos) description.resize(nl);
                if (!description.empty()) label = description + " [" + name + "]";
            }
            devices.push_back({id++, label});
        }

        free(ioid);
        free(name);
        free(desc);
    }
    snd_device_name_free_hint(hints);
    return devices;
}

std::shared_ptr<AudioSource> createMicrophone(int deviceId) {
    // 장치 번호를 ALSA 장치 이름으로 되돌린다 (목록의 순서를 그대로 쓴다).
    std::string deviceName = "default";
    if (deviceId >= 0) {
        const std::vector<AudioDevice> devices = inputDevices();
        for (const AudioDevice& device : devices) {
            if (device.id != deviceId) continue;
            // "설명 [hw:0,0]" 형태에서 대괄호 안을 뽑는다.
            const size_t open = device.name.rfind('[');
            const size_t close = device.name.rfind(']');
            if (open != std::string::npos && close != std::string::npos && close > open)
                deviceName = device.name.substr(open + 1, close - open - 1);
            else
                deviceName = device.name;
            break;
        }
    }
    return std::make_shared<AlsaSource>(deviceId, deviceName);
}

const char* backendName() { return "ALSA"; }

}  // namespace kstt::platform
