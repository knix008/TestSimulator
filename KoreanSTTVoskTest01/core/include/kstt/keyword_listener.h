// core/include/kstt/keyword_listener.h
//
// 키워드 모델을 마이크로, 또는 WAV 로 듣는다. Vosk 를 적재하지 않는다.
// 콜백은 듣는 스레드에서 불리므로, 창은 자기 스레드로 넘겨서 그려야 한다.
#pragma once

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

#include "kstt/keyword_model.h"

namespace kstt {

class AudioSource;

class KeywordListener {
public:
    using ResultCallback = std::function<void(const std::string& word)>;
    using LevelCallback = std::function<void(float rms)>;
    // running 이 거짓이면 듣기가 끝난 것이다. error 이면 message 가 사유다.
    using StateCallback = std::function<void(bool running, const std::string& message, bool error)>;

    KeywordListener() = default;
    ~KeywordListener();
    KeywordListener(const KeywordListener&) = delete;
    KeywordListener& operator=(const KeywordListener&) = delete;

    void onResult(ResultCallback cb);
    void onLevel(LevelCallback cb);
    void onState(StateCallback cb);

    // 모델을 값으로 복사해 둔다. 이후 원본을 다시 학습해도 진행 중인 듣기에는
    // 영향이 없다. 실패하면 듣기를 시작하지 않는다.
    bool start(std::shared_ptr<AudioSource> source, const KeywordModel& model, std::string* err);
    void stop();
    bool isRunning() const { return running_.load(); }

private:
    void loop();

    ResultCallback onResult_;
    LevelCallback onLevel_;
    StateCallback onState_;
    KeywordModel model_;
    std::shared_ptr<AudioSource> source_;
    std::mutex sourceMutex_;
    std::thread worker_;
    std::atomic<bool> stop_{false};
    std::atomic<bool> running_{false};
};

}  // namespace kstt
