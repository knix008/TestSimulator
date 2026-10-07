#include "word_filter.h"

#include <algorithm>

#include "kstt/vocabulary.h"

namespace kstt {
namespace {

// 잡음 바닥보다 이만큼 커야 "소리가 난다"고 본다.
constexpr float kSpeechFactor = 3.0f;

// 아무리 조용한 방이라도 이보다 작으면 소리로 치지 않는다 (약 -44 dBFS).
constexpr float kAbsoluteFloor = 0.006f;

// 잡음 바닥 추적 계수. 내려갈 때는 빠르게(조용해지면 금방 따라감),
// 올라갈 때는 아주 느리게(말소리를 잡음으로 착각하지 않게).
constexpr float kFallRate = 0.10f;
constexpr float kRiseRate = 0.002f;

// 첫 덩어리로 잡음 바닥을 잡을 때의 상한.
//
// 말을 시작한 뒤에 인식을 켜면 첫 덩어리가 이미 말소리라, 그 크기를 잡음 바닥으로
// 삼으면 문턱이 말소리보다 높아져 그 뒤로 아무것도 통과하지 못한다. 그래서 처음에는
// 낮게 잡아 두고(조용한 방의 잡음 수준), 정말 시끄러운 곳이면 느린 상승으로 따라가게 한다.
constexpr float kPrimeCap = 0.02f;

bool isSpace(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r'; }

}  // namespace

std::vector<std::string> splitWords(const std::string& text) {
    std::vector<std::string> words;
    size_t i = 0;
    while (i < text.size()) {
        while (i < text.size() && isSpace(text[i])) ++i;
        const size_t start = i;
        while (i < text.size() && !isSpace(text[i])) ++i;
        if (i > start) words.push_back(text.substr(start, i - start));
    }
    return words;
}

std::string joinWords(const std::vector<std::string>& words) {
    std::string out;
    for (const std::string& word : words) {
        if (!out.empty()) out.push_back(' ');
        out += word;
    }
    return out;
}

std::string stableCommonPrefix(const std::string& previous, const std::string& current) {
    const std::vector<std::string> a = splitWords(previous);
    const std::vector<std::string> b = splitWords(current);

    size_t common = 0;
    const size_t limit = std::min(a.size(), b.size());
    while (common < limit && a[common] == b[common]) ++common;

    if (common == 0) return {};
    return joinWords(std::vector<std::string>(b.begin(), b.begin() + static_cast<long>(common)));
}

Transcript filterByConfidence(const Transcript& result, float minConfidence) {
    if (minConfidence <= 0.0f || result.words.empty()) return result;

    Transcript out;
    out.isFinal = result.isFinal;
    std::vector<std::string> kept;
    for (const Word& word : result.words) {
        if (word.conf < minConfidence) continue;
        kept.push_back(word.text);
        out.words.push_back(word);
    }
    out.text = joinWords(kept);
    return out;
}

Transcript keepOnlyVocabulary(const Transcript& result,
                              const std::vector<std::string>& vocabulary) {
    if (vocabulary.empty()) return result;

    Transcript out;
    out.isFinal = result.isFinal;

    // 낱말 정보가 있으면 그것으로, 없으면 text 를 쪼개서 거른다.
    if (!result.words.empty()) {
        std::vector<std::string> kept;
        for (const Word& word : result.words) {
            if (std::find(vocabulary.begin(), vocabulary.end(), word.text) == vocabulary.end())
                continue;
            kept.push_back(word.text);
            out.words.push_back(word);
        }
        out.text = joinWords(kept);
        return out;
    }

    std::vector<std::string> kept;
    for (const std::string& word : splitWords(result.text)) {
        if (std::find(vocabulary.begin(), vocabulary.end(), word) != vocabulary.end())
            kept.push_back(word);
    }
    out.text = joinWords(kept);
    return out;
}

SpeechGate::SpeechGate(float fixedThreshold) : fixedThreshold_(fixedThreshold) {}

void SpeechGate::reset() {
    noiseFloor_ = 0.0f;
    primed_ = false;
}

float SpeechGate::threshold() const {
    if (fixedThreshold_ > 0.0f) return fixedThreshold_;
    return std::max(kAbsoluteFloor, noiseFloor_ * kSpeechFactor);
}

bool SpeechGate::feed(float rms, float zeroCrossingRate, float maxZeroCrossingRate) {
    // 쉭쉭거리는 잡음(선풍기·바람·키보드)은 영교차율이 높다. 에너지가 충분해도
    // 여기서 걸러 내면 "소리는 났지만 말은 아니다" 를 구분할 수 있다.
    const bool soundsLikeVoice =
        maxZeroCrossingRate >= 1.0f || zeroCrossingRate <= maxZeroCrossingRate;

    if (fixedThreshold_ > 0.0f) return soundsLikeVoice && rms >= fixedThreshold_;

    if (!primed_) {
        noiseFloor_ = std::min(rms, kPrimeCap);
        primed_ = true;
    }

    const bool loudEnough = rms >= threshold();
    const bool voiced = loudEnough && soundsLikeVoice;

    // 말하는 동안에도 바닥이 조금씩 올라가되, 말소리에 끌려가지 않도록 천천히.
    // 조용해지면 빠르게 따라 내려가고, 시끄러워지면 아주 느리게 올라간다.
    // 올라가는 쪽을 "조용할 때만" 으로 막아 두면, 바닥을 잘못 잡았을 때 영영
    // 빠져나오지 못하므로 늘 조금씩 따라가게 둔다.
    const float rate = rms < noiseFloor_ ? kFallRate : kRiseRate;
    noiseFloor_ += (rms - noiseFloor_) * rate;

    return voiced;
}

}  // namespace kstt
