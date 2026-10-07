// core/src/word_filter.h
//
// 인식 결과에서 "말하지 않은 것"을 떨어내는 작은 도구들. 코어 내부 전용이지만
// 단위시험이 직접 포함해 확인한다.
#pragma once

#include <string>
#include <vector>

#include "kstt/types.h"

namespace kstt {

// 공백으로 낱말 나누기 / 다시 붙이기
std::vector<std::string> splitWords(const std::string& text);
std::string joinWords(const std::vector<std::string>& words);

// 직전 추측과 지금 추측에서 공통인 앞부분(낱말 단위)만 돌려준다.
// 인식기가 뒷부분을 고쳐 쓰는 동안 화면이 깜빡이지 않게 하려는 것이다.
//   previous: "오늘 날씨가 참 좋 습니까"
//   current : "오늘 날씨가 참 초"
//   결과    : "오늘 날씨가 참"
std::string stableCommonPrefix(const std::string& previous, const std::string& current);

// 신뢰도가 minConfidence 에 못 미치는 낱말을 빼고 text 를 다시 만든다.
// words 가 비어 있으면(신뢰도를 모르면) 손대지 않는다.
// 모든 낱말이 걸러지면 빈 결과가 된다 — 부르는 쪽에서 버리면 된다.
Transcript filterByConfidence(const Transcript& result, float minConfidence);

// 정해 둔 말(vocabulary)에 없는 낱말을 전부 떨어낸다. "[unk]" 도 함께 빠진다.
// 목록이 비어 있으면 손대지 않는다.
Transcript keepOnlyVocabulary(const Transcript& result,
                              const std::vector<std::string>& vocabulary);

// 잡음 바닥을 좇아가며 "지금 소리가 나고 있는지" 판단한다.
// 마이크 감도가 제각각이라 고정 문턱만으로는 어느 기계에서는 다 통과하고
// 어느 기계에서는 다 막힌다.
class SpeechGate {
public:
    // fixedThreshold > 0 이면 그 값을 그대로 쓴다(자동 추적을 끈다).
    explicit SpeechGate(float fixedThreshold = 0.0f);

    // 한 덩어리의 RMS 와 영교차율을 넣고, 그 덩어리가 사람 목소리인지 돌려받는다.
    // maxZeroCrossingRate 가 1 이상이면 영교차율은 보지 않는다.
    bool feed(float rms, float zeroCrossingRate = 0.0f, float maxZeroCrossingRate = 1.0f);

    // 지금 추적 중인 잡음 바닥과 판정 문턱 (진단용)
    float noiseFloor() const { return noiseFloor_; }
    float threshold() const;

    void reset();

private:
    float fixedThreshold_ = 0.0f;
    float noiseFloor_ = 0.0f;
    bool primed_ = false;
};

}  // namespace kstt
