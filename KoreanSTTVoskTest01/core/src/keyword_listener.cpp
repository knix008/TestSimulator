#include "kstt/keyword_listener.h"

#include "keyword_audio.h"
#include "kstt/audio_source.h"

namespace kstt {

KeywordListener::~KeywordListener() { stop(); }

void KeywordListener::onResult(ResultCallback cb) { onResult_ = std::move(cb); }
void KeywordListener::onLevel(LevelCallback cb) { onLevel_ = std::move(cb); }
void KeywordListener::onState(StateCallback cb) { onState_ = std::move(cb); }

bool KeywordListener::start(std::shared_ptr<AudioSource> source, const KeywordModel& model,
                            std::string* err) {
    stop();
    if (!source) {
        if (err) *err = "입력 장치가 없습니다.";
        return false;
    }
    if (model.empty()) {
        if (err) *err = "키워드 모델이 없습니다. 먼저 학습하거나 모델 파일을 여세요.";
        return false;
    }
    if (!source->open(kKeywordSampleRate, err)) return false;

    {
        std::lock_guard<std::mutex> lock(sourceMutex_);
        source_ = std::move(source);
        model_ = model;
    }
    stop_.store(false);
    running_.store(true);
    worker_ = std::thread([this] { loop(); });
    return true;
}

void KeywordListener::stop() {
    stop_.store(true);
    std::shared_ptr<AudioSource> source;
    {
        std::lock_guard<std::mutex> lock(sourceMutex_);
        source = source_;
    }
    if (source) source->cancel();
    if (worker_.joinable()) worker_.join();
    running_.store(false);
}

void KeywordListener::loop() {
    std::shared_ptr<AudioSource> source;
    KeywordModel model;
    {
        std::lock_guard<std::mutex> lock(sourceMutex_);
        source = source_;
        model = model_;
    }
    if (onState_) onState_(true, source ? source->name() : std::string(), false);

    SpeechSegmenter segmenter;
    std::int16_t chunk[1600];
    std::string endMessage = "finished";
    bool error = false;
    while (source && !stop_.load()) {
        const int n = source->read(chunk, 1600);
        if (n < 0) {
            endMessage = "입력을 읽지 못했습니다.";
            error = true;
            break;
        }
        std::vector<std::vector<std::int16_t>> ready;
        if (n == 0) {
            segmenter.flush(&ready);
        } else {
            segmenter.push(chunk, n, &ready);
            if (onLevel_) onLevel_(segmenter.rms());
        }
        for (const std::vector<std::int16_t>& utterance : ready) {
            const KeywordHit hit = model.match(utterance.data(), utterance.size());
            if (!hit.word.empty() && onResult_) onResult_(hit.word);
        }
        if (n == 0) break;
    }
    if (source) source->close();
    {
        std::lock_guard<std::mutex> lock(sourceMutex_);
        source_.reset();
    }
    running_.store(false);
    if (onState_) onState_(false, endMessage, error);
}

}  // namespace kstt
