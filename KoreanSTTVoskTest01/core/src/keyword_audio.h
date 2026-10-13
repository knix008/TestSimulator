// core/src/keyword_audio.h
//
// 키워드 모델이 쓰는 특징과 말 경계. 코어 밖에서는 쓰지 않는다.
#pragma once

#include <cstdint>
#include <vector>

#include "kstt/keyword_model.h"

namespace kstt {

// 말 한 덩어리의 특징. 무음이거나 너무 짧으면 거짓.
bool embedKeyword(const std::int16_t* samples, std::size_t count, float out[kKeywordFeatDim]);

// 들어온 표본을 말 단위로 자른다. 말이 끝나면 ready 에 한 덩어리를 넣는다.
class SpeechSegmenter {
public:
    void push(const std::int16_t* data, int count, std::vector<std::vector<std::int16_t>>* ready);
    void flush(std::vector<std::vector<std::int16_t>>* ready);
    float rms() const { return rms_; }

private:
    void consumeHop(const std::int16_t* frame, int count,
                    std::vector<std::vector<std::int16_t>>* ready);
    void emit(std::vector<std::vector<std::int16_t>>* ready);

    std::vector<std::int16_t> pending_;
    std::vector<std::int16_t> buffer_;
    bool inSpeech_ = false;
    int speechSamples_ = 0;
    int silenceSamples_ = 0;
    float noise_ = 0.008f;
    float rms_ = 0.0f;
};

}  // namespace kstt
