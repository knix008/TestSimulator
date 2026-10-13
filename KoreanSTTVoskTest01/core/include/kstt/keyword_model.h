// core/include/kstt/keyword_model.h
//
// 짧은 말만 구분하는 작은 모델. Vosk 음향 모델(수백 MB)을 쓰지 않는다.
//
// 창에서 말마다 녹음을 쌓아 학습하면, 결과 한 파일(.kmodel)에 말 이름과
// 특징이 모두 들어간다. 경로나 학습 폴더는 파일에 적지 않으므로, 그 파일만
// 다른 장치로 복사해도 같은 빌드의 프로그램이 그대로 불러 인식한다.
//
// 특징은 16kHz 모노에서 뽑은 104차원 벡터다. 말의 시간을 네 조각으로 나누고,
// 각 조각의 멜 에너지에서 전체 크기를 뺀 모양만 남긴다.
// 학습은 외부 도구 없이 이 라이브러리 안에서 끝난다.
#pragma once

#include <array>
#include <atomic>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace kstt {

inline constexpr int kKeywordSampleRate = 16000;
inline constexpr int kKeywordFeatDim = 104;
inline constexpr std::uint32_t kKeywordModelVersion = 1;

class AudioSource;

// 한 덩어리 소리를 모델에 대 본 결과. word 가 비어 있으면 받은 말이 아니다.
struct KeywordHit {
    std::string word;
    float distance = 1.0f;
    bool hasVoice = false;
};

struct KeywordClass {
    std::string word;
    float threshold = 0.32f;
    std::vector<std::array<float, kKeywordFeatDim>> exemplars;
};

class KeywordModel {
public:
    bool empty() const;
    const std::vector<KeywordClass>& classes() const { return classes_; }
    std::vector<std::string> words() const;
    // "출근, 퇴근, 경비, 해제"
    std::string summary() const;

    // 소리 한 덩어리를 가장 가까운 말로 맞춘다. 기준보다 멀거나 두 말이
    // 비슷하면 빈 말을 돌려준다.
    KeywordHit match(const std::int16_t* samples, std::size_t count) const;

    bool save(const std::string& path, std::string* err) const;
    bool load(const std::string& path, std::string* err);

    std::vector<KeywordClass> classes_;
};

// 프로그램 옆에 만드는 학습 폴더.
//   <root>/words.txt
//   <root>/model.kmodel          마지막으로 학습한 모델
//   <root>/samples/<말>/0001.wav
// 창을 열 때 prepare() 가 폴더와 기본 말(출근·퇴근·경비·해제)을 만들어 둔다.
class KeywordWorkspace {
public:
    static std::string defaultRoot();

    explicit KeywordWorkspace(std::string root);

    const std::string& root() const { return root_; }
    std::string modelPath() const;
    std::string samplesDir(const std::string& word) const;

    // 폴더와 words.txt 가 없으면 만든다. 이미 있으면 말을 지우지 않는다.
    bool prepare(std::string* err);

    std::vector<std::string> words() const;
    int sampleCount(const std::string& word) const;
    bool addWord(const std::string& word, std::string* err);
    bool removeWord(const std::string& word, std::string* err);

    // 아직 없는 0001.wav, 0002.wav, … 경로. 파일은 만들지 않는다.
    std::string allocateSamplePath(const std::string& word) const;

private:
    bool writeWords(const std::vector<std::string>& words, std::string* err) const;

    std::string root_;
};

struct KeywordTrainReport {
    int words = 0;
    int samples = 0;
    std::vector<std::string> skippedWords;
};

// samples 아래 녹음으로 모델을 만든다. 녹음이 없거나 너무 짧은 말은 빠진다.
bool trainKeywordModel(const KeywordWorkspace& workspace, KeywordModel* model,
                       KeywordTrainReport* report, std::string* err);

// 마이크에서 말 한 덩어리만 받아 온다. 무음이 이어지면 스스로 끝낸다.
// cancel 이 참이 되거나 소스가 끝나면 반환한다.
bool captureUtterance(AudioSource& source, std::vector<std::int16_t>* samples, std::string* err,
                      const std::function<void(float rms)>& onLevel = {},
                      const std::atomic<bool>* cancel = nullptr);

}  // namespace kstt
