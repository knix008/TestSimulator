#include "kstt/stt_engine.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <mutex>
#include <thread>
#include <vector>

#include "json_light.h"
#include "paths.h"
#include "vosk_bind.h"
#include "kstt/vocabulary.h"
#include "word_filter.h"

namespace kstt {

const char* toString(EngineState state) {
    switch (state) {
        case EngineState::Unloaded: return "Unloaded";
        case EngineState::Loading: return "Loading";
        case EngineState::Ready: return "Ready";
        case EngineState::Running: return "Running";
        case EngineState::Error: return "Error";
    }
    return "?";
}

namespace {

// 한 번에 Vosk 에 넘기는 양. 16kHz 기준 100ms — 부분 결과가 체감상 즉시 나오고
// 호출 부담도 적은 지점.
constexpr int kChunkMillis = 100;

// JSON 결과 한 줄에서 Transcript 를 뽑는다.
Transcript parseResult(const std::string& payload, bool isFinal) {
    Transcript out;
    out.isFinal = isFinal;

    json::Value root;
    std::string err;
    if (!json::parse(payload, &root, &err)) return out;

    // max_alternatives > 0 이면 {"alternatives":[{"text":...}]} 형태로 온다.
    const json::Value* alternatives = root.find("alternatives");
    if (alternatives && alternatives->type == json::Value::Type::Array &&
        !alternatives->array.empty()) {
        const json::Value& best = alternatives->array.front();
        out.text = best.stringOr("text");
        return out;
    }

    out.text = isFinal ? root.stringOr("text") : root.stringOr("partial");

    const json::Value* words = root.find("result");
    if (words && words->type == json::Value::Type::Array) {
        for (const json::Value& w : words->array) {
            Word word;
            word.text = w.stringOr("word");
            word.start = w.numberOr("start");
            word.end = w.numberOr("end");
            word.conf = w.numberOr("conf");
            if (!word.text.empty()) out.words.push_back(std::move(word));
        }
    }
    return out;
}

// 소리가 0 을 가로지르는 빈도. 말소리는 낮고, 쉭쉭거리는 잡음은 높다.
float zeroCrossingRate(const int16_t* samples, int count) {
    if (count < 2) return 0.0f;
    int crossings = 0;
    for (int i = 1; i < count; ++i) {
        if ((samples[i - 1] < 0) != (samples[i] < 0)) ++crossings;
    }
    return static_cast<float>(crossings) / static_cast<float>(count - 1);
}

float rmsLevel(const int16_t* samples, int count) {
    if (count <= 0) return 0.0f;
    double sum = 0.0;
    for (int i = 0; i < count; ++i) {
        const double v = static_cast<double>(samples[i]) / 32768.0;
        sum += v * v;
    }
    return static_cast<float>(std::sqrt(sum / static_cast<double>(count)));
}

}  // namespace

struct SttEngine::Impl {
    VoskLibrary lib;
    VoskModel* model = nullptr;
    EngineConfig config;

    std::thread worker;
    std::atomic<bool> stopRequested{false};
    // 인식 중에도 켜고 끌 수 있어야 해서 config 와 따로 둔다 (워커가 읽는다)
    std::atomic<int> partialMode{static_cast<int>(PartialMode::Stable)};
    std::atomic<bool> running{false};
    std::shared_ptr<AudioSource> source;

    mutable std::mutex stateMutex;
    EngineState state = EngineState::Unloaded;
    std::string error;
    std::vector<std::string> unknownWords;  // 모델이 모르는 낱말 (문법에 못 쓴다)
    std::vector<std::string> usableDecoys;  // 모델이 아는 미끼 낱말만 추려 둔 것
    bool modelKnowsUnknownToken = false;

    PartialCallback onPartial;
    FinalCallback onFinal;
    StateCallback onState;
    LevelCallback onLevel;

    void setState(EngineState s, const std::string& message) {
        StateCallback cb;
        {
            std::lock_guard<std::mutex> lock(stateMutex);
            state = s;
            if (s == EngineState::Error) error = message;
            cb = onState;
        }
        if (cb) cb(s, message);
    }

    void workerLoop();
};

void SttEngine::Impl::workerLoop() {
    const int chunkSamples = std::max(160, config.sampleRate * kChunkMillis / 1000);

    // 받을 말이 정해져 있으면 문법 인식기로 만든다. 그러면 인식기가 그 말들만
    // 후보로 두어, 아무 소리에나 비슷한 낱말을 붙이는 일이 크게 줄어든다.
    VoskRecognizer* rec = nullptr;
    const std::string grammar =
        buildGrammarJson(config.vocabulary, usableDecoys, modelKnowsUnknownToken);
    if (!grammar.empty() && lib.recognizer_new_grm) {
        rec = lib.recognizer_new_grm(model, static_cast<float>(config.sampleRate),
                                     grammar.c_str());
    }
    // 문법을 못 쓰는 모델이면 보통 인식기로 만들고, 결과를 목록으로 거른다.
    if (!rec) rec = lib.recognizer_new(model, static_cast<float>(config.sampleRate));
    if (!rec) {
        running = false;
        setState(EngineState::Error, "vosk_recognizer_new failed");
        return;
    }
    // 신뢰도로 낱말을 거르려면 낱말 정보가 필요하다. 그래서 사용자가 withWords 를
    // 끄더라도 내부적으로는 켜 두고, Transcript 에 담을지만 따로 정한다.
    const bool needWords =
        config.withWords || config.minConfidence > 0.0f || !config.vocabulary.empty();
    if (needWords && lib.recognizer_set_words) lib.recognizer_set_words(rec, 1);
    if (config.withWords && lib.recognizer_set_partial_words)
        lib.recognizer_set_partial_words(rec, 1);
    if (config.maxAlternatives > 0 && lib.recognizer_set_max_alternatives)
        lib.recognizer_set_max_alternatives(rec, config.maxAlternatives);

    std::vector<int16_t> buffer(static_cast<size_t>(chunkSamples));
    std::string lastPartialRaw;    // 인식기가 준 그대로 (안정 접두사 계산용)
    std::string lastPartialShown;  // 실제로 내보낸 것
    std::string failure;
    bool reachedEnd = false;

    SpeechGate gate(config.silenceThreshold);
    int voicedMillis = 0;

    // 덩어리마다 "목소리였나" 를 적어 둔다. 인식된 낱말의 시각과 맞춰 보면
    // "그 시간 동안 정말 말하고 있었는지" 를 확인할 수 있다.
    std::vector<uint8_t> voicedChunks;
    const double chunkSeconds = static_cast<double>(kChunkMillis) / 1000.0;

    // 낱말이 차지한 시간 가운데 실제로 목소리였던 비율
    const auto voicedFraction = [&](double start, double end) {
        if (voicedChunks.empty() || end <= start) return 1.0;
        const size_t first = static_cast<size_t>(start / chunkSeconds);
        const size_t last = std::min(voicedChunks.size(),
                                     static_cast<size_t>(end / chunkSeconds) + 1);
        if (first >= last) return 1.0;
        size_t voiced = 0;
        for (size_t i = first; i < last; ++i) voiced += voicedChunks[i];
        return static_cast<double>(voiced) / static_cast<double>(last - first);
    };

    // 이 낱말을 사람이 실제로 말한 것으로 볼 수 있나?
    const auto looksSpoken = [&](const Word& word) {
        const double seconds = word.end - word.start;
        if (config.maxWordSeconds > 0.0 && seconds > config.maxWordSeconds) return false;
        if (config.minVoicedFraction > 0.0f &&
            voicedFraction(word.start, word.end) <
                static_cast<double>(config.minVoicedFraction))
            return false;
        return true;
    };

    // 이 구간에 사람이 말한 흔적이 있었나?
    const auto heardSpeech = [&] {
        return !config.gateSilence || voicedMillis >= config.minSpeechMillis;
    };

    // 결과를 내보내기 전 거치는 손질: 신뢰도 거르기 → 낱말 정보 정리
    const auto refine = [&](const Transcript& raw) {
        Transcript result = filterByConfidence(raw, config.minConfidence);
        // 문법을 썼더라도 "[unk]" 가 섞여 오므로 여기서 한 번 더 거른다.
        return keepOnlyVocabulary(result, config.vocabulary);
    };

    // 받을 말을 한정했다면 **낱말 하나가 사건 하나**다. "퇴근 출근" 처럼 한 번에
    // 두 개가 잡혀도 각각 따로 올려 준다 — 받는 쪽에서 언제 무엇이 들렸는지
    // 그대로 셀 수 있어야 하기 때문이다. 자유 받아쓰기일 때는 문장 그대로 둔다.
    const auto emitFinal = [&](const Transcript& result) {
        if (!onFinal || result.text.empty()) return;

        if (config.vocabulary.empty()) {
            Transcript out = result;
            if (!config.withWords) out.words.clear();
            onFinal(out);
            return;
        }

        if (!result.words.empty()) {
            for (const Word& word : result.words) {
                if (!looksSpoken(word)) continue;  // 소음이 낱말로 둔갑한 것
                Transcript one;
                one.isFinal = true;
                one.text = word.text;
                if (config.withWords) one.words.push_back(word);
                onFinal(one);
            }
            return;
        }

        // 낱말 정보가 없으면 글자를 쪼갠다.
        for (const std::string& word : splitWords(result.text)) {
            Transcript one;
            one.isFinal = true;
            one.text = word;
            onFinal(one);
        }
    };

    const auto emitPartial = [&](const std::string& text) {
        if (text == lastPartialShown) return;
        lastPartialShown = text;
        if (onPartial) onPartial(text);
    };

    while (!stopRequested.load()) {
        const int n = source->read(buffer.data(), chunkSamples);
        if (n < 0) {
            failure = "audio read failed on " + source->name();
            break;
        }
        if (n == 0) {
            reachedEnd = true;
            break;
        }

        const float level = rmsLevel(buffer.data(), n);
        if (onLevel) onLevel(level);

        const bool voiced = gate.feed(level, zeroCrossingRate(buffer.data(), n),
                                      config.maxZeroCrossingRate);
        voicedChunks.push_back(voiced ? 1 : 0);
        if (voiced) voicedMillis += n * 1000 / config.sampleRate;

        if (lib.recognizer_accept_waveform_s(rec, buffer.data(), n)) {
            const char* payload = lib.recognizer_result(rec);
            const Transcript result = refine(parseResult(payload ? payload : "{}", true));
            const bool keep = heardSpeech() && !result.text.empty();

            lastPartialRaw.clear();
            emitPartial(std::string());
            voicedMillis = 0;  // 구간이 끝났다

            if (keep) emitFinal(result);
        } else if (static_cast<PartialMode>(partialMode.load()) != PartialMode::Off) {
            // 아직 사람 목소리가 없었다면 진행 중 추측도 보여 주지 않는다.
            if (!heardSpeech()) continue;

            const char* payload = lib.recognizer_partial_result(rec);
            Transcript partial = parseResult(payload ? payload : "{}", false);
            partial = keepOnlyVocabulary(partial, config.vocabulary);
            if (partial.text == lastPartialRaw) continue;

            const std::string shown =
                static_cast<PartialMode>(partialMode.load()) == PartialMode::Raw
                                          ? partial.text
                                          : stableCommonPrefix(lastPartialRaw, partial.text);
            lastPartialRaw = partial.text;
            emitPartial(shown);
        }
    }

    // 남은 오디오를 비워 마지막 문장을 받아낸다.
    if (failure.empty()) {
        const char* payload = lib.recognizer_final_result(rec);
        const Transcript result = refine(parseResult(payload ? payload : "{}", true));
        if (heardSpeech()) emitFinal(result);
    }
    emitPartial(std::string());

    lib.recognizer_free(rec);
    source->close();
    running = false;

    if (!failure.empty()) {
        setState(EngineState::Error, failure);
    } else {
        setState(EngineState::Ready, reachedEnd ? "finished" : "stopped");
    }
}

SttEngine::SttEngine() : impl_(new Impl()) {}

SttEngine::~SttEngine() {
    stop();
    unloadModel();
}

void SttEngine::onPartial(PartialCallback cb) { impl_->onPartial = std::move(cb); }
void SttEngine::onFinal(FinalCallback cb) { impl_->onFinal = std::move(cb); }
void SttEngine::onState(StateCallback cb) { impl_->onState = std::move(cb); }
void SttEngine::onLevel(LevelCallback cb) { impl_->onLevel = std::move(cb); }

bool SttEngine::loadModel(const EngineConfig& config, std::string* err) {
    if (impl_->running.load()) {
        if (err) *err = "cannot load a model while recognition is running";
        return false;
    }
    unloadModel();

    EngineConfig cfg = config;
    if (cfg.sampleRate <= 0) cfg.sampleRate = 16000;
    if (cfg.modelPath.empty()) {
        cfg.modelPath = findDefaultModel();
        if (cfg.modelPath.empty()) {
            const std::string message =
                "no Vosk model found; set EngineConfig::modelPath or KSTT_MODEL";
            if (err) *err = message;
            impl_->setState(EngineState::Error, message);
            return false;
        }
    }
    if (!isDirectory(cfg.modelPath)) {
        const std::string message = "model directory not found: " + cfg.modelPath;
        if (err) *err = message;
        impl_->setState(EngineState::Error, message);
        return false;
    }

    impl_->setState(EngineState::Loading, cfg.modelPath);

    std::string libError;
    if (!impl_->lib.load(cfg.voskLibPath, &libError)) {
        if (err) *err = libError;
        impl_->setState(EngineState::Error, libError);
        return false;
    }
    if (impl_->lib.set_log_level) impl_->lib.set_log_level(cfg.logLevel);

    impl_->model = impl_->lib.model_new(cfg.modelPath.c_str());
    if (!impl_->model) {
        const std::string message = "vosk_model_new failed for " + cfg.modelPath;
        impl_->lib.unload();
        if (err) *err = message;
        impl_->setState(EngineState::Error, message);
        return false;
    }

    // 문법으로 쓰려면 모델이 그 낱말을 알아야 한다. 모르는 것이 있으면 알려 준다.
    // 미끼 낱말도 같은 기준으로 추려 둔다 — 모르는 것을 넘기면 Vosk 가 경고만 내고
    // 무시하므로, 미리 떨어내는 편이 깔끔하다.
    std::vector<std::string> unknown;
    std::vector<std::string> decoys;
    bool knowsUnknownToken = false;
    if (!cfg.vocabulary.empty() && impl_->lib.model_find_word) {
        const auto known = [&](const std::string& word) {
            return impl_->lib.model_find_word(impl_->model, word.c_str()) >= 0;
        };
        for (const std::string& word : cfg.vocabulary) {
            if (!known(word)) unknown.push_back(word);
        }
        knowsUnknownToken = known("[unk]");
        for (const std::string& decoy : decoyWords()) {
            if (known(decoy)) decoys.push_back(decoy);
        }
    }

    impl_->config = cfg;
    impl_->partialMode = static_cast<int>(cfg.partialMode);
    {
        std::lock_guard<std::mutex> lock(impl_->stateMutex);
        impl_->unknownWords = unknown;
    }
    impl_->usableDecoys = std::move(decoys);
    impl_->modelKnowsUnknownToken = knowsUnknownToken;
    impl_->setState(EngineState::Ready, cfg.modelPath);
    return true;
}

void SttEngine::unloadModel() {
    stop();
    if (impl_->model) {
        impl_->lib.model_free(impl_->model);
        impl_->model = nullptr;
    }
    impl_->lib.unload();
    {
        std::lock_guard<std::mutex> lock(impl_->stateMutex);
        if (impl_->state != EngineState::Error) impl_->state = EngineState::Unloaded;
    }
}

bool SttEngine::isModelLoaded() const { return impl_->model != nullptr; }

void SttEngine::setVocabulary(std::vector<std::string> words) {
    if (impl_->running.load()) return;  // 인식 중에는 바꾸지 않는다
    impl_->config.vocabulary = std::move(words);
}

std::vector<std::string> SttEngine::unknownWords() const {
    std::lock_guard<std::mutex> lock(impl_->stateMutex);
    return impl_->unknownWords;
}

void SttEngine::setPartialMode(PartialMode mode) {
    impl_->partialMode = static_cast<int>(mode);
}

PartialMode SttEngine::partialMode() const {
    return static_cast<PartialMode>(impl_->partialMode.load());
}

const EngineConfig& SttEngine::config() const { return impl_->config; }

bool SttEngine::start(std::shared_ptr<AudioSource> source, std::string* err) {
    if (!impl_->model) {
        if (err) *err = "model is not loaded";
        return false;
    }
    if (impl_->running.load()) {
        if (err) *err = "recognition is already running";
        return false;
    }
    if (!source) {
        if (err) *err = "audio source is null";
        return false;
    }

    // 앞선 실행의 스레드가 스스로 끝났더라도 합류는 해 두어야 한다.
    if (impl_->worker.joinable()) impl_->worker.join();

    std::string openError;
    if (!source->open(impl_->config.sampleRate, &openError)) {
        if (err) *err = openError;
        impl_->setState(EngineState::Error, openError);
        return false;
    }

    impl_->source = std::move(source);
    impl_->stopRequested = false;
    impl_->running = true;
    impl_->setState(EngineState::Running, impl_->source->name());
    impl_->worker = std::thread([this] { impl_->workerLoop(); });
    return true;
}

void SttEngine::stop() {
    if (!impl_->worker.joinable()) {
        impl_->running = false;
        return;
    }
    impl_->stopRequested = true;
    if (impl_->source) impl_->source->cancel();
    impl_->worker.join();
    impl_->source.reset();
    impl_->running = false;
}

bool SttEngine::isRunning() const { return impl_->running.load(); }

EngineState SttEngine::state() const {
    std::lock_guard<std::mutex> lock(impl_->stateMutex);
    return impl_->state;
}

std::string SttEngine::lastError() const {
    std::lock_guard<std::mutex> lock(impl_->stateMutex);
    return impl_->error;
}

std::string SttEngine::voskLibraryPath() const { return impl_->lib.path(); }

std::string SttEngine::findVoskLibrary() {
    for (const std::string& candidate : voskLibraryCandidates()) {
        if (isFile(candidate)) return candidate;
    }
    return {};
}

std::string SttEngine::findDefaultModel() {
    const std::vector<std::string> candidates = modelCandidates();
    return candidates.empty() ? std::string() : candidates.front();
}

std::vector<std::string> SttEngine::searchRoots() { return kstt::searchRoots(); }

}  // namespace kstt
