// platform/macos/coreaudio_source.cpp
//
// macOS 마이크 입력 (CoreAudio AudioQueue). AudioQueue 는 콜백으로 밀어주므로,
// 큐에 쌓아두고 read() 에서 꺼내 당기기 모델로 바꿔 준다.
//
// 주의: macOS 는 마이크 접근에 사용자 허가가 필요하다. .app 번들로 묶을 때
// Info.plist 에 NSMicrophoneUsageDescription 을 넣어야 하고, 터미널에서 직접
// 실행하면 터미널 앱의 마이크 권한을 따른다.
#include <AudioToolbox/AudioToolbox.h>
#include <CoreAudio/CoreAudio.h>
#include <CoreFoundation/CoreFoundation.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <deque>
#include <mutex>
#include <string>
#include <vector>

#include "kstt/platform/audio_input.h"

namespace kstt::platform {
namespace {

constexpr int kBufferCount = 8;
constexpr int kBufferMillis = 100;
constexpr size_t kMaxQueuedChunks = 64;  // 약 6초. 넘치면 오래된 것을 버린다.

std::string cfStringToUtf8(CFStringRef s) {
    if (!s) return {};
    const CFIndex length = CFStringGetLength(s);
    const CFIndex maxSize = CFStringGetMaximumSizeForEncoding(length, kCFStringEncodingUTF8) + 1;
    std::string out(static_cast<size_t>(maxSize), '\0');
    if (!CFStringGetCString(s, out.data(), maxSize, kCFStringEncodingUTF8)) return {};
    out.resize(std::strlen(out.c_str()));
    return out;
}

// 입력 채널이 있는 장치들의 (이름, UID) 목록
struct CoreAudioDevice {
    std::string name;
    std::string uid;
};

std::vector<CoreAudioDevice> enumerateInputs() {
    std::vector<CoreAudioDevice> result;

    AudioObjectPropertyAddress address = {kAudioHardwarePropertyDevices,
                                          kAudioObjectPropertyScopeGlobal,
                                          kAudioObjectPropertyElementMain};
    UInt32 dataSize = 0;
    if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &address, 0, nullptr, &dataSize) !=
        noErr)
        return result;

    const size_t count = dataSize / sizeof(AudioDeviceID);
    std::vector<AudioDeviceID> ids(count);
    if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, nullptr, &dataSize,
                                   ids.data()) != noErr)
        return result;

    for (AudioDeviceID id : ids) {
        // 입력 스트림이 있는지 확인
        AudioObjectPropertyAddress streams = {kAudioDevicePropertyStreams,
                                              kAudioObjectPropertyScopeInput,
                                              kAudioObjectPropertyElementMain};
        UInt32 streamsSize = 0;
        if (AudioObjectGetPropertyDataSize(id, &streams, 0, nullptr, &streamsSize) != noErr ||
            streamsSize == 0)
            continue;

        CoreAudioDevice device;

        AudioObjectPropertyAddress nameAddress = {kAudioObjectPropertyName,
                                                  kAudioObjectPropertyScopeGlobal,
                                                  kAudioObjectPropertyElementMain};
        CFStringRef name = nullptr;
        UInt32 size = sizeof(name);
        if (AudioObjectGetPropertyData(id, &nameAddress, 0, nullptr, &size, &name) == noErr) {
            device.name = cfStringToUtf8(name);
            if (name) CFRelease(name);
        }

        AudioObjectPropertyAddress uidAddress = {kAudioDevicePropertyDeviceUID,
                                                 kAudioObjectPropertyScopeGlobal,
                                                 kAudioObjectPropertyElementMain};
        CFStringRef uid = nullptr;
        size = sizeof(uid);
        if (AudioObjectGetPropertyData(id, &uidAddress, 0, nullptr, &size, &uid) == noErr) {
            device.uid = cfStringToUtf8(uid);
            if (uid) CFRelease(uid);
        }

        if (device.name.empty()) device.name = device.uid;
        if (!device.name.empty()) result.push_back(std::move(device));
    }
    return result;
}

class CoreAudioSource : public AudioSource {
public:
    CoreAudioSource(int deviceId, std::string deviceName, std::string deviceUid)
        : deviceId_(deviceId),
          deviceName_(std::move(deviceName)),
          deviceUid_(std::move(deviceUid)) {}

    ~CoreAudioSource() override { close(); }

    bool open(int sampleRate, std::string* err) override {
        close();
        cancelled_ = false;

        AudioStreamBasicDescription format = {};
        format.mSampleRate = static_cast<Float64>(sampleRate);
        format.mFormatID = kAudioFormatLinearPCM;
        format.mFormatFlags = kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked;
        format.mBitsPerChannel = 16;
        format.mChannelsPerFrame = 1;
        format.mFramesPerPacket = 1;
        format.mBytesPerFrame = 2;
        format.mBytesPerPacket = 2;

        OSStatus status = AudioQueueNewInput(&format, &inputCallback, this, nullptr, nullptr, 0,
                                            &queue_);
        if (status != noErr) {
            if (err) *err = "AudioQueueNewInput failed (" + std::to_string(status) + ")";
            return false;
        }

        if (deviceId_ >= 0 && !deviceUid_.empty()) {
            CFStringRef uid = CFStringCreateWithCString(nullptr, deviceUid_.c_str(),
                                                        kCFStringEncodingUTF8);
            status = AudioQueueSetProperty(queue_, kAudioQueueProperty_CurrentDevice, &uid,
                                           sizeof(uid));
            if (uid) CFRelease(uid);
            if (status != noErr) {
                if (err)
                    *err = "cannot select input device " + deviceName_ + " (" +
                           std::to_string(status) + ")";
                close();
                return false;
            }
        }

        const UInt32 bufferBytes =
            static_cast<UInt32>(sampleRate * kBufferMillis / 1000) * sizeof(int16_t);
        for (int i = 0; i < kBufferCount; ++i) {
            AudioQueueBufferRef buffer = nullptr;
            status = AudioQueueAllocateBuffer(queue_, bufferBytes, &buffer);
            if (status != noErr) {
                if (err) *err = "AudioQueueAllocateBuffer failed (" + std::to_string(status) + ")";
                close();
                return false;
            }
            AudioQueueEnqueueBuffer(queue_, buffer, 0, nullptr);
        }

        status = AudioQueueStart(queue_, nullptr);
        if (status != noErr) {
            if (err) *err = "AudioQueueStart failed (" + std::to_string(status) + ")";
            close();
            return false;
        }
        running_ = true;
        return true;
    }

    void close() override {
        if (queue_) {
            if (running_) {
                AudioQueueStop(queue_, true);
                running_ = false;
            }
            AudioQueueDispose(queue_, true);
            queue_ = nullptr;
        }
        std::lock_guard<std::mutex> lock(mutex_);
        chunks_.clear();
        offset_ = 0;
    }

    int read(int16_t* dst, int maxSamples) override {
        if (!queue_ || maxSamples <= 0) return -1;

        std::unique_lock<std::mutex> lock(mutex_);
        while (chunks_.empty()) {
            if (cancelled_.load()) return 0;
            cv_.wait_for(lock, std::chrono::milliseconds(100));
        }

        std::vector<int16_t>& front = chunks_.front();
        const size_t available = front.size() - offset_;
        const size_t n = available < static_cast<size_t>(maxSamples)
                             ? available
                             : static_cast<size_t>(maxSamples);
        std::memcpy(dst, front.data() + offset_, n * sizeof(int16_t));
        offset_ += n;
        if (offset_ >= front.size()) {
            chunks_.pop_front();
            offset_ = 0;
        }
        return static_cast<int>(n);
    }

    void cancel() override {
        cancelled_ = true;
        cv_.notify_all();
    }

    std::string name() const override {
        return deviceId_ < 0 ? "마이크 (시스템 기본)" : deviceName_;
    }
    bool isLive() const override { return true; }

private:
    static void inputCallback(void* userData, AudioQueueRef queue, AudioQueueBufferRef buffer,
                              const AudioTimeStamp*, UInt32, const AudioStreamPacketDescription*) {
        auto* self = static_cast<CoreAudioSource*>(userData);
        const size_t samples = buffer->mAudioDataByteSize / sizeof(int16_t);
        if (samples > 0) {
            const int16_t* data = static_cast<const int16_t*>(buffer->mAudioData);
            {
                std::lock_guard<std::mutex> lock(self->mutex_);
                if (self->chunks_.size() >= kMaxQueuedChunks) {
                    self->chunks_.pop_front();  // 소비가 밀렸다면 오래된 것을 버린다
                    self->offset_ = 0;
                }
                self->chunks_.emplace_back(data, data + samples);
            }
            self->cv_.notify_one();
        }
        AudioQueueEnqueueBuffer(queue, buffer, 0, nullptr);
    }

    int deviceId_ = -1;
    std::string deviceName_;
    std::string deviceUid_;
    AudioQueueRef queue_ = nullptr;
    bool running_ = false;

    std::mutex mutex_;
    std::condition_variable cv_;
    std::deque<std::vector<int16_t>> chunks_;
    size_t offset_ = 0;
    std::atomic<bool> cancelled_{false};
};

}  // namespace

std::vector<AudioDevice> inputDevices() {
    std::vector<AudioDevice> devices;
    devices.push_back({-1, "시스템 기본 입력 장치"});

    const std::vector<CoreAudioDevice> found = enumerateInputs();
    for (size_t i = 0; i < found.size(); ++i)
        devices.push_back({static_cast<int>(i), found[i].name});
    return devices;
}

std::shared_ptr<AudioSource> createMicrophone(int deviceId) {
    std::string name = "마이크 (시스템 기본)";
    std::string uid;
    if (deviceId >= 0) {
        const std::vector<CoreAudioDevice> found = enumerateInputs();
        if (static_cast<size_t>(deviceId) < found.size()) {
            name = found[static_cast<size_t>(deviceId)].name;
            uid = found[static_cast<size_t>(deviceId)].uid;
        }
    }
    return std::make_shared<CoreAudioSource>(deviceId, std::move(name), std::move(uid));
}

const char* backendName() { return "CoreAudio"; }

}  // namespace kstt::platform
