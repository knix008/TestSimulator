// core/include/kstt/stt_engine.h
//
// 한국어 STT 엔진. Vosk 를 런타임에 동적 적재해 쓰며, GUI 코드는 이 헤더 하나만
// 보면 된다. 반대로 이 코어는 어떤 GUI 툴킷도 참조하지 않는다.
//
// 스레드 규칙
//   - loadModel()/start()/stop() 은 한 스레드(보통 GUI 주 스레드)에서 호출한다.
//   - 콜백(onPartial/onFinal/onLevel/onState)은 엔진 워커 스레드에서 불린다.
//     GUI 는 반드시 자기 주 루프로 넘겨서(GTK 라면 g_idle_add) 위젯을 만져야 한다.
#pragma once

#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "kstt/audio_source.h"
#include "kstt/types.h"

namespace kstt {

class SttEngine {
public:
    using PartialCallback = std::function<void(const std::string& text)>;
    using FinalCallback = std::function<void(const Transcript& result)>;
    using StateCallback = std::function<void(EngineState state, const std::string& message)>;
    using LevelCallback = std::function<void(float rms)>;  // 0..1, 레벨미터용

    SttEngine();
    ~SttEngine();
    SttEngine(const SttEngine&) = delete;
    SttEngine& operator=(const SttEngine&) = delete;

    // 콜백 등록. 엔진이 돌지 않을 때 설정할 것.
    void onPartial(PartialCallback cb);
    void onFinal(FinalCallback cb);
    void onState(StateCallback cb);
    void onLevel(LevelCallback cb);

    // 모델을 적재한다(수 초 걸릴 수 있는 블로킹 호출 — GUI 는 별도 스레드에서).
    bool loadModel(const EngineConfig& config, std::string* err);
    void unloadModel();
    bool isModelLoaded() const;
    const EngineConfig& config() const;

    // 진행 중(부분) 결과를 어떻게 내보낼지. 인식 중에도 바꿀 수 있다.
    void setPartialMode(PartialMode mode);
    PartialMode partialMode() const;

    // 받아쓸 말 목록을 바꾼다. 다음 start() 부터 적용된다(인식 중에는 무시).
    // 비우면 자유 받아쓰기로 돌아간다.
    void setVocabulary(std::vector<std::string> words);

    // 모델이 모르는 낱말들 (문법으로 쓸 수 없는 말). 모델 적재 뒤 유효하다.
    std::vector<std::string> unknownWords() const;

    // 인식 시작. 소유권은 엔진이 가지며 stop() 까지 소스를 붙들고 있는다.
    bool start(std::shared_ptr<AudioSource> source, std::string* err);

    // 인식 중지. 워커를 합류시키고 마지막 결과를 onFinal 로 흘린 뒤 돌아온다.
    void stop();
    bool isRunning() const;

    EngineState state() const;
    std::string lastError() const;

    // 실제로 적재된 Vosk 라이브러리 경로 (진단/정보 표시용)
    std::string voskLibraryPath() const;

    // --- 탐색 도우미 (모델/라이브러리 자동 찾기) ---
    static std::string findVoskLibrary();
    static std::string findDefaultModel();
    static std::vector<std::string> searchRoots();

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace kstt
