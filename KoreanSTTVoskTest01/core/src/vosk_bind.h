// core/src/vosk_bind.h
//
// Vosk C API 를 런타임에 적재해 함수 포인터로 들고 있는다. 링크 시점 의존성을
// 두지 않기 때문에
//   - libvosk 가 없어도 앱은 뜨고, GUI 가 "라이브러리를 찾을 수 없다"를 안내할 수 있고
//   - 같은 코드가 .dll/.so/.dylib 를 그대로 받아들인다.
// 코어 내부 전용 헤더.
#pragma once

#include <string>

namespace kstt {

// vosk_api.h 의 불완전 타입들 (헤더를 포함하지 않고도 쓰기 위해 그대로 둔다)
struct VoskModel;
struct VoskRecognizer;

class VoskLibrary {
public:
    VoskLibrary() = default;
    ~VoskLibrary();
    VoskLibrary(const VoskLibrary&) = delete;
    VoskLibrary& operator=(const VoskLibrary&) = delete;

    // path 가 비어 있으면 기본 탐색 경로를 훑는다.
    bool load(const std::string& path, std::string* err);
    void unload();
    bool loaded() const { return handle_ != nullptr; }
    const std::string& path() const { return path_; }

    // --- 적재된 함수들 ---
    VoskModel* (*model_new)(const char* path) = nullptr;
    void (*model_free)(VoskModel*) = nullptr;
    VoskRecognizer* (*recognizer_new)(VoskModel*, float sampleRate) = nullptr;
    // 문법(받을 말 목록)을 주고 만드는 인식기. 모델이 동적 그래프를 가질 때만 있다.
    VoskRecognizer* (*recognizer_new_grm)(VoskModel*, float sampleRate,
                                          const char* grammar) = nullptr;
    int (*model_find_word)(VoskModel*, const char* word) = nullptr;
    void (*recognizer_free)(VoskRecognizer*) = nullptr;
    void (*recognizer_set_words)(VoskRecognizer*, int) = nullptr;
    void (*recognizer_set_partial_words)(VoskRecognizer*, int) = nullptr;
    void (*recognizer_set_max_alternatives)(VoskRecognizer*, int) = nullptr;
    int (*recognizer_accept_waveform_s)(VoskRecognizer*, const short*, int) = nullptr;
    const char* (*recognizer_result)(VoskRecognizer*) = nullptr;
    const char* (*recognizer_partial_result)(VoskRecognizer*) = nullptr;
    const char* (*recognizer_final_result)(VoskRecognizer*) = nullptr;
    void (*recognizer_reset)(VoskRecognizer*) = nullptr;
    void (*set_log_level)(int) = nullptr;

private:
    void* handle_ = nullptr;
    std::string path_;
};

// 플랫폼별 공유 라이브러리 파일명 ("libvosk.dll" / "libvosk.so" / "libvosk.dylib")
const char* voskLibraryFileName();

}  // namespace kstt
