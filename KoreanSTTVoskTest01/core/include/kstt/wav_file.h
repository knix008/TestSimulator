// core/include/kstt/wav_file.h
//
// RIFF/WAVE 읽기·쓰기. 외부 라이브러리 없이 표준 라이브러리만 쓴다.
// WavFileSource 는 AudioSource 구현이라 파일만으로도 엔진 전체를 돌릴 수 있고,
// 그래서 코어 단위시험이 마이크 없이 가능하다.
#pragma once

#include <cstdint>
#include <fstream>
#include <string>
#include <vector>

#include "kstt/audio_source.h"

namespace kstt {

// 16비트 PCM WAV 를 읽어 모노/목표 표본율로 변환해 내보내는 입력 소스.
class WavFileSource : public AudioSource {
public:
    explicit WavFileSource(std::string path);
    ~WavFileSource() override;

    bool open(int sampleRate, std::string* err) override;
    void close() override;
    int read(int16_t* dst, int maxSamples) override;
    void cancel() override;
    std::string name() const override;
    bool isLive() const override { return false; }

    // 원본 파일 정보 (open 이후 유효)
    int sourceSampleRate() const { return srcRate_; }
    int sourceChannels() const { return srcChannels_; }
    double durationSeconds() const;
    // 0..1, 파일 변환 진행률
    double progress() const;

private:
    std::string path_;
    std::vector<int16_t> mono_;  // 목표 표본율로 변환된 모노 표본 전체
    size_t pos_ = 0;
    int srcRate_ = 0;
    int srcChannels_ = 0;
    int targetRate_ = 0;
    bool cancelled_ = false;
};

// 16비트 PCM 모노 WAV 쓰기 (시험용 음원 생성, 녹음 저장에 쓴다)
bool writeWav16(const std::string& path, const int16_t* samples, size_t count, int sampleRate,
                std::string* err);

// 16비트 PCM WAV 를 모노로 읽는다. resampleTo > 0 이면 선형 보간으로 변환한다.
bool readWav16Mono(const std::string& path, std::vector<int16_t>* out, int* srcRate,
                   int* srcChannels, int resampleTo, std::string* err);

}  // namespace kstt
