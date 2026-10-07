// tests/test_core.cpp
//
// 코어 단위시험. 이 실행 파일은 kstt_core 만 링크한다 — GUI도, 마이크 코드도
// 끌어오지 않는다. 그래서 "GUI 와 STT 가 분리되어 있다"가 말이 아니라 빌드로
// 증명된다.
//
// 모델과 libvosk 가 있으면 끝에서 실제 인식까지 돌려 본다. 없으면 그 항목만
// 건너뛴다.
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <memory>
#include <filesystem>
#include <string>
#include <thread>
#include <vector>

#include "kstt/stt_engine.h"
#include "kstt/text_width.h"
#include "kstt/wav_file.h"
#include "../core/src/json_light.h"
#include "kstt/vocabulary.h"
#include "../core/src/word_filter.h"

#if defined(_WIN32)
#include <windows.h>
#endif

namespace fs = std::filesystem;

// M_PI 는 표준이 아니므로 직접 둔다.
constexpr double kPi = 3.14159265358979323846;

namespace {

int g_passed = 0;
int g_failed = 0;
int g_skipped = 0;
std::string g_currentTest;

void startTest(const char* name) {
    g_currentTest = name;
    // 한글은 한 글자가 두 칸이므로 보이는 폭으로 칸을 맞춘다.
    std::printf("  %s ", kstt::padRight(name, 56).c_str());
    std::fflush(stdout);
}

void endTest() {
    if (g_currentTest.empty()) return;
    std::printf("통과\n");
    ++g_passed;
    g_currentTest.clear();
}

void failTest(const std::string& reason) {
    std::printf("실패\n      → %s\n", reason.c_str());
    ++g_failed;
    g_currentTest.clear();
}

void skipTest(const std::string& reason) {
    std::printf("건너뜀\n      → %s\n", reason.c_str());
    ++g_skipped;
    g_currentTest.clear();
}

#define CHECK(cond, message)                     \
    do {                                         \
        if (!(cond)) {                           \
            failTest(message);                   \
            return;                              \
        }                                        \
    } while (false)

// ---------------------------------------------------------------- JSON

void testJsonBasics() {
    startTest("JSON: 객체·문자열·숫자·배열");
    kstt::json::Value root;
    std::string err;
    const std::string text =
        R"({"text":"hello","conf":0.875,"words":[{"word":"a","start":0.1},{"word":"b"}],)"
        R"("flag":true,"nothing":null})";
    CHECK(kstt::json::parse(text, &root, &err), "파싱 실패: " + err);
    CHECK(root.stringOr("text") == "hello", "text 값이 다르다");
    CHECK(std::fabs(root.numberOr("conf") - 0.875) < 1e-9, "conf 값이 다르다");
    const kstt::json::Value* words = root.find("words");
    CHECK(words && words->array.size() == 2, "words 배열 크기가 다르다");
    CHECK(words->array[0].stringOr("word") == "a", "words[0].word 가 다르다");
    const kstt::json::Value* flag = root.find("flag");
    CHECK(flag && flag->boolean, "flag 가 true 가 아니다");
    const kstt::json::Value* nothing = root.find("nothing");
    CHECK(nothing && nothing->type == kstt::json::Value::Type::Null, "null 이 아니다");
    endTest();
}

void testJsonKorean() {
    startTest("JSON: 한글 UTF-8 과 \\u 이스케이프");
    kstt::json::Value root;
    std::string err;
    // Vosk 는 보통 UTF-8 을 그대로 내보내지만, \u 로 오는 경우도 받아야 한다.
    const std::string text = R"({"a":"안녕하세요","b":"\uc548\ub155\ud558\uc138\uc694"})";
    CHECK(kstt::json::parse(text, &root, &err), "파싱 실패: " + err);
    CHECK(root.stringOr("a") == "안녕하세요", "직접 UTF-8 이 깨졌다");
    CHECK(root.stringOr("b") == "안녕하세요",
          "\\u 이스케이프 디코딩이 틀렸다: " + root.stringOr("b"));
    endTest();
}

void testJsonEscapesAndErrors() {
    startTest("JSON: 이스케이프와 잘못된 입력 거부");
    kstt::json::Value root;
    std::string err;
    CHECK(kstt::json::parse(R"({"s":"a\"b\\c\nd\t"})", &root, &err), "이스케이프 파싱 실패");
    CHECK(root.stringOr("s") == "a\"b\\c\nd\t", "이스케이프 결과가 다르다");

    CHECK(!kstt::json::parse(R"({"a":})", &root, &err), "깨진 JSON 을 받아들였다");
    CHECK(!kstt::json::parse(R"({"a":1} trailing)", &root, &err), "꼬리 문자를 받아들였다");
    CHECK(!kstt::json::parse(R"({"a":"unterminated)", &root, &err), "끊긴 문자열을 받아들였다");
    endTest();
}

// ---------------------------------------------------------------- WAV

std::vector<int16_t> makeTone(int sampleRate, double seconds, double hz, double amplitude) {
    const size_t count = static_cast<size_t>(static_cast<double>(sampleRate) * seconds);
    std::vector<int16_t> samples(count);
    for (size_t i = 0; i < count; ++i) {
        const double t = static_cast<double>(i) / static_cast<double>(sampleRate);
        samples[i] = static_cast<int16_t>(amplitude * 32767.0 * std::sin(2.0 * kPi * hz * t));
    }
    return samples;
}

// 아주 작은 잡음 (조용한 방의 마이크 입력 정도)
std::vector<int16_t> makeNoise(int sampleRate, double seconds, double amplitude) {
    const size_t count = static_cast<size_t>(static_cast<double>(sampleRate) * seconds);
    std::vector<int16_t> samples(count);
    unsigned int seed = 12345;  // 늘 같은 잡음이 나오도록 고정
    for (size_t i = 0; i < count; ++i) {
        seed = seed * 1103515245u + 12345u;
        const double r = static_cast<double>((seed >> 16) & 0x7FFF) / 16384.0 - 1.0;
        samples[i] = static_cast<int16_t>(amplitude * 32767.0 * r);
    }
    return samples;
}

fs::path tempDir() {
    const fs::path dir = fs::temp_directory_path() / "kstt-tests";
    std::error_code ec;
    fs::create_directories(dir, ec);
    return dir;
}

void testWavRoundTrip() {
    startTest("WAV: 쓰기→읽기 왕복이 표본을 보존한다");
    const std::vector<int16_t> tone = makeTone(16000, 0.25, 440.0, 0.5);
    const std::string path = (tempDir() / "tone16k.wav").string();
    std::string err;
    CHECK(kstt::writeWav16(path, tone.data(), tone.size(), 16000, &err), "쓰기 실패: " + err);

    std::vector<int16_t> read;
    int rate = 0;
    int channels = 0;
    CHECK(kstt::readWav16Mono(path, &read, &rate, &channels, 0, &err), "읽기 실패: " + err);
    CHECK(rate == 16000, "표본율이 다르다: " + std::to_string(rate));
    CHECK(channels == 1, "채널 수가 다르다: " + std::to_string(channels));
    CHECK(read.size() == tone.size(),
          "표본 수가 다르다: " + std::to_string(read.size()) + " vs " +
              std::to_string(tone.size()));
    CHECK(std::memcmp(read.data(), tone.data(), tone.size() * sizeof(int16_t)) == 0,
          "표본 내용이 다르다");
    endTest();
}

void testWavResample() {
    startTest("WAV: 8kHz 를 16kHz 로 변환하면 길이가 두 배");
    const std::vector<int16_t> tone = makeTone(8000, 0.5, 300.0, 0.4);
    const std::string path = (tempDir() / "tone8k.wav").string();
    std::string err;
    CHECK(kstt::writeWav16(path, tone.data(), tone.size(), 8000, &err), "쓰기 실패: " + err);

    std::vector<int16_t> read;
    int rate = 0;
    CHECK(kstt::readWav16Mono(path, &read, &rate, nullptr, 16000, &err), "읽기 실패: " + err);
    CHECK(rate == 8000, "원본 표본율 보고가 틀렸다");
    const size_t expected = tone.size() * 2;
    CHECK(read.size() + 2 >= expected && read.size() <= expected + 2,
          "변환 후 길이가 이상하다: " + std::to_string(read.size()) + " (기대 " +
              std::to_string(expected) + ")");
    endTest();
}

void testWavNotAWavFile() {
    startTest("WAV: WAV 가 아닌 파일은 분명한 오류를 낸다");
    const std::string path = (tempDir() / "garbage.bin").string();
    std::FILE* file = std::fopen(path.c_str(), "wb");
    CHECK(file != nullptr, "임시 파일을 만들 수 없다");
    std::fputs("this is definitely not a wav file", file);
    std::fclose(file);

    std::vector<int16_t> read;
    std::string err;
    CHECK(!kstt::readWav16Mono(path, &read, nullptr, nullptr, 16000, &err),
          "WAV 가 아닌 파일을 받아들였다");
    CHECK(err.find("RIFF") != std::string::npos, "오류 메시지가 불친절하다: " + err);
    endTest();
}

void testWavFileSourceStreaming() {
    startTest("AudioSource: WAV 소스가 전량을 내보내고 EOF 를 알린다");
    const std::vector<int16_t> tone = makeTone(16000, 0.3, 200.0, 0.3);
    const std::string path = (tempDir() / "stream.wav").string();
    std::string err;
    CHECK(kstt::writeWav16(path, tone.data(), tone.size(), 16000, &err), "쓰기 실패: " + err);

    kstt::WavFileSource source(path);
    CHECK(source.open(16000, &err), "열기 실패: " + err);
    CHECK(!source.isLive(), "파일 소스는 isLive() 가 false 여야 한다");

    std::vector<int16_t> chunk(1600);
    size_t total = 0;
    int reads = 0;
    while (true) {
        const int n = source.read(chunk.data(), static_cast<int>(chunk.size()));
        CHECK(n >= 0, "read 가 오류를 냈다");
        if (n == 0) break;
        total += static_cast<size_t>(n);
        if (++reads > 1000) {
            failTest("read 가 끝나지 않는다");
            return;
        }
    }
    CHECK(total == tone.size(),
          "읽은 표본 수가 다르다: " + std::to_string(total) + " vs " +
              std::to_string(tone.size()));
    CHECK(std::fabs(source.durationSeconds() - 0.3) < 0.01,
          "길이 계산이 틀렸다: " + std::to_string(source.durationSeconds()));
    source.close();
    endTest();
}

void testWavFileSourceCancel() {
    startTest("AudioSource: cancel() 이 스트림을 즉시 끝낸다");
    const std::vector<int16_t> tone = makeTone(16000, 1.0, 200.0, 0.3);
    const std::string path = (tempDir() / "cancel.wav").string();
    std::string err;
    CHECK(kstt::writeWav16(path, tone.data(), tone.size(), 16000, &err), "쓰기 실패: " + err);

    kstt::WavFileSource source(path);
    CHECK(source.open(16000, &err), "열기 실패: " + err);
    std::vector<int16_t> chunk(1600);
    CHECK(source.read(chunk.data(), static_cast<int>(chunk.size())) > 0, "첫 읽기가 비었다");
    source.cancel();
    CHECK(source.read(chunk.data(), static_cast<int>(chunk.size())) == 0,
          "cancel 후에도 데이터를 내보낸다");
    endTest();
}

// ------------------------------------------------- 말하지 않은 것 걸러내기

void testStablePrefix() {
    startTest("걸러내기: 진행 중 추측의 안정된 앞부분만 남긴다");
    CHECK(kstt::stableCommonPrefix("오늘 날씨가 참 좋 습니까", "오늘 날씨가 참 초") ==
              "오늘 날씨가 참",
          "공통 앞부분이 틀렸다: " +
              kstt::stableCommonPrefix("오늘 날씨가 참 좋 습니까", "오늘 날씨가 참 초"));
    CHECK(kstt::stableCommonPrefix("", "안녕").empty(), "첫 추측은 아직 보여 주지 않는다");
    CHECK(kstt::stableCommonPrefix("안녕 하세요", "안녕 하세요") == "안녕 하세요",
          "같은 추측이면 전부 안정된 것이다");
    CHECK(kstt::stableCommonPrefix("가 나 다", "라 마").empty(),
          "앞부분이 통째로 바뀌면 보여 줄 것이 없다");
    CHECK(kstt::stableCommonPrefix("가 나", "가 나 다 라") == "가 나",
          "길어진 쪽에서 공통 부분만 남아야 한다");
    endTest();
}

void testConfidenceFilter() {
    startTest("걸러내기: 신뢰도 낮은 낱말을 결과에서 뺀다");
    kstt::Transcript raw;
    raw.isFinal = true;
    raw.text = "음성 인식 시험 입니다";
    raw.words = {{"음성", 0.0, 0.5, 0.95},
                 {"인식", 0.5, 1.0, 0.90},
                 {"시험", 1.0, 1.5, 0.30},
                 {"입니다", 1.5, 2.0, 0.80}};

    const kstt::Transcript filtered = kstt::filterByConfidence(raw, 0.4f);
    CHECK(filtered.text == "음성 인식 입니다", "거른 결과가 다르다: " + filtered.text);
    CHECK(filtered.words.size() == 3, "남은 낱말 수가 다르다");
    CHECK(filtered.isFinal, "isFinal 이 보존되지 않았다");

    const kstt::Transcript untouched = kstt::filterByConfidence(raw, 0.0f);
    CHECK(untouched.text == raw.text, "임계값 0 이면 손대지 않아야 한다");

    kstt::Transcript noWords;
    noWords.text = "낱말 정보 없음";
    CHECK(kstt::filterByConfidence(noWords, 0.9f).text == noWords.text,
          "신뢰도를 모르면 손대지 않아야 한다");
    endTest();
}

void testSpeechGate() {
    startTest("걸러내기: 잡음 바닥을 좇아 사람 목소리만 통과시킨다");
    kstt::SpeechGate gate;

    // 조용한 방: 작은 잡음이 이어진다 → 통과하면 안 된다
    int voicedInQuiet = 0;
    for (int i = 0; i < 50; ++i) {
        if (gate.feed(0.003f)) ++voicedInQuiet;
    }
    CHECK(voicedInQuiet == 0,
          "잡음을 목소리로 세었다: " + std::to_string(voicedInQuiet) + "회");

    // 말소리: 훨씬 큰 소리 → 통과해야 한다
    int voicedInSpeech = 0;
    for (int i = 0; i < 10; ++i) {
        if (gate.feed(0.12f)) ++voicedInSpeech;
    }
    CHECK(voicedInSpeech == 10,
          "목소리를 놓쳤다: " + std::to_string(voicedInSpeech) + "/10");

    // 고정 문턱을 주면 그대로 쓴다
    kstt::SpeechGate fixed(0.05f);
    CHECK(!fixed.feed(0.04f), "고정 문턱 아래인데 통과했다");
    CHECK(fixed.feed(0.06f), "고정 문턱 위인데 막혔다");

    // 영교차율이 높은 소리(쉭쉭거리는 잡음)는 충분히 커도 말소리로 치지 않는다
    kstt::SpeechGate hiss;
    int passedHiss = 0;
    for (int i = 0; i < 10; ++i) {
        if (hiss.feed(0.20f, 0.52f /* 잡음다운 영교차율 */, 0.35f)) ++passedHiss;
    }
    CHECK(passedHiss == 0, "쉭쉭거리는 잡음이 통과했다: " + std::to_string(passedHiss));

    kstt::SpeechGate voice;
    int passedVoice = 0;
    for (int i = 0; i < 10; ++i) {
        if (voice.feed(0.20f, 0.12f /* 말소리다운 영교차율 */, 0.35f)) ++passedVoice;
    }
    CHECK(passedVoice == 10, "말소리가 막혔다: " + std::to_string(passedVoice) + "/10");
    endTest();
}

void testVocabularyParsing() {
    startTest("한정: 목록 적기와 문법 JSON 만들기");
    const std::vector<std::string> parsed = kstt::parseVocabulary(" 출근, 퇴근 ,출근 ");
    CHECK(parsed.size() == 2, "중복이 지워지지 않았다: " + std::to_string(parsed.size()));
    CHECK(parsed[0] == "출근" && parsed[1] == "퇴근", "읽은 말이 다르다");
    CHECK(kstt::formatVocabulary(parsed) == "출근, 퇴근",
          "보여 주는 모양이 다르다: " + kstt::formatVocabulary(parsed));

    const std::string grammar = kstt::buildGrammarJson(parsed);
    CHECK(grammar == "[\"출근\",\"퇴근\"]", "문법 JSON 이 다르다: " + grammar);
    CHECK(kstt::buildGrammarJson({}).empty(), "빈 목록은 문법을 만들지 않아야 한다");

    // 미끼는 뒤에 붙고, 겹치는 것은 한 번만 들어간다
    const std::string withDecoys = kstt::buildGrammarJson(parsed, {"회의", "출근"}, false);
    CHECK(withDecoys == "[\"출근\",\"퇴근\",\"회의\"]",
          "미끼를 넣은 문법이 다르다: " + withDecoys);

    // 모델이 [unk] 를 알 때만 붙인다
    const std::string withUnknown = kstt::buildGrammarJson(parsed, {}, true);
    CHECK(withUnknown == "[\"출근\",\"퇴근\",\"[unk]\"]",
          "[unk] 를 넣은 문법이 다르다: " + withUnknown);

    CHECK(kstt::decoyWords().size() > 100,
          "미끼 낱말이 너무 적다: " + std::to_string(kstt::decoyWords().size()));
    for (const std::string& decoy : kstt::decoyWords()) {
        CHECK(decoy != "출근" && decoy != "퇴근",
              "받을 말이 미끼에 들어 있다: " + decoy);
    }

    const std::vector<std::string>& preset = kstt::defaultVocabulary();
    CHECK(preset.size() == 2 && preset[0] == "출근" && preset[1] == "퇴근",
          "기본 목록이 출근·퇴근이 아니다");
    endTest();
}

void testVocabularyFilter() {
    startTest("한정: 목록에 없는 낱말은 결과에서 뺀다");
    kstt::Transcript raw;
    raw.isFinal = true;
    raw.text = "그 출근 [unk] 합니다";
    raw.words = {{"그", 0.0, 0.2, 1.0},
                 {"출근", 0.2, 0.8, 1.0},
                 {"[unk]", 0.8, 1.0, 1.0},
                 {"합니다", 1.0, 1.4, 1.0}};

    const kstt::Transcript kept = kstt::keepOnlyVocabulary(raw, {"출근", "퇴근"});
    CHECK(kept.text == "출근", "거른 결과가 다르다: " + kept.text);
    CHECK(kept.words.size() == 1, "남은 낱말 수가 다르다");

    // 낱말 정보가 없을 때도 text 를 쪼개 거른다
    kstt::Transcript textOnly;
    textOnly.text = "퇴근 했습니다";
    CHECK(kstt::keepOnlyVocabulary(textOnly, {"출근", "퇴근"}).text == "퇴근",
          "text 만 있을 때 거르기가 틀렸다");

    // 목록이 비면 손대지 않는다
    CHECK(kstt::keepOnlyVocabulary(raw, {}).text == raw.text,
          "목록이 비었는데 결과를 고쳤다");

    // 하나도 안 남으면 빈 결과 — 부르는 쪽이 버린다
    kstt::Transcript unrelated;
    unrelated.text = "오늘 날씨가 좋습니다";
    CHECK(kstt::keepOnlyVocabulary(unrelated, {"출근", "퇴근"}).text.empty(),
          "관계없는 말이 남았다");
    endTest();
}

// ---------------------------------------------------------------- 엔진

void testEngineRejectsBadModel() {
    startTest("엔진: 없는 모델 경로를 거부하고 상태를 Error 로");
    kstt::SttEngine engine;
    kstt::EngineConfig config;
    config.modelPath = (tempDir() / "no-such-model-dir").string();
    std::string err;
    CHECK(!engine.loadModel(config, &err), "없는 경로를 받아들였다");
    CHECK(!err.empty(), "오류 메시지가 비었다");
    CHECK(engine.state() == kstt::EngineState::Error, "상태가 Error 가 아니다");
    CHECK(!engine.isModelLoaded(), "모델이 적재된 것으로 보고한다");
    endTest();
}

void testEngineRejectsStartWithoutModel() {
    startTest("엔진: 모델 없이 start() 하면 거부한다");
    kstt::SttEngine engine;
    std::string err;
    const auto source = std::make_shared<kstt::WavFileSource>("does-not-matter.wav");
    CHECK(!engine.start(source, &err), "모델 없이 시작되었다");
    CHECK(!err.empty(), "오류 메시지가 비었다");
    CHECK(!engine.isRunning(), "실행 중으로 보고한다");
    endTest();
}

void testPathDiscovery() {
    startTest("탐색: 탐색 뿌리가 비어 있지 않다");
    const std::vector<std::string> roots = kstt::SttEngine::searchRoots();
    CHECK(!roots.empty(), "탐색 뿌리가 비었다");
    endTest();
}

// 받을 말을 한정했을 때 실제로 그 말만 나오는지
void testEndToEndVocabulary(const std::string& sampleDir) {
    startTest("종단: 받을 말을 한정하면 그 말만 받아쓴다");

    if (kstt::SttEngine::findVoskLibrary().empty() ||
        kstt::SttEngine::findDefaultModel().empty()) {
        skipTest("모델 또는 libvosk 없음");
        return;
    }

    const fs::path chulgeun = fs::path(sampleDir) / "sample-chulgeun.wav";
    const fs::path toegeun = fs::path(sampleDir) / "sample-toegeun.wav";
    const fs::path other = fs::path(sampleDir) / "sample-ko.wav";
    if (!fs::exists(chulgeun) || !fs::exists(toegeun)) {
        skipTest("출근/퇴근 시험 음원이 없음 (scripts/make_sample_wav 로 만들 수 있다)");
        return;
    }

    kstt::SttEngine engine;
    kstt::EngineConfig config;
    config.vocabulary = kstt::defaultVocabulary();
    std::string err;
    CHECK(engine.loadModel(config, &err), "모델 적재 실패: " + err);
    CHECK(engine.unknownWords().empty(),
          "모델이 모르는 말이 있다: " + kstt::formatVocabulary(engine.unknownWords()));

    const auto transcribe = [&](const fs::path& wav) {
        std::string heard;
        engine.onFinal([&](const kstt::Transcript& result) {
            if (result.text.empty()) return;
            if (!heard.empty()) heard += " ";
            heard += result.text;
        });
        std::string startError;
        if (!engine.start(std::make_shared<kstt::WavFileSource>(wav.string()), &startError))
            return std::string("[시작 실패] ") + startError;
        for (int i = 0; i < 400 && engine.isRunning(); ++i)
            std::this_thread::sleep_for(std::chrono::milliseconds(25));
        engine.stop();
        return heard;
    };

    const std::string heardChulgeun = transcribe(chulgeun);
    const std::string heardToegeun = transcribe(toegeun);
    CHECK(heardChulgeun == "출근", "\"출근\" 을 \"" + heardChulgeun + "\" 로 받았다");
    CHECK(heardToegeun == "퇴근", "\"퇴근\" 을 \"" + heardToegeun + "\" 로 받았다");

    // 목록에 없는 말은 아무것도 남기지 않아야 한다
    if (fs::exists(other)) {
        const std::string heardOther = transcribe(other);
        CHECK(heardOther.empty(),
              "관계없는 문장에서 \"" + heardOther + "\" 가 나왔다");
    }

    std::printf("\n      \"출근\"→\"%s\", \"퇴근\"→\"%s\"\n      ", heardChulgeun.c_str(),
                heardToegeun.c_str());
    endTest();
}

// 모델과 라이브러리가 있을 때만 도는 종단 시험 — 잡음만 있는 음원
void testEndToEndSilenceIsIgnored() {
    startTest("종단: 잡음만 있는 음원에서는 아무것도 받아쓰지 않는다");

    if (kstt::SttEngine::findVoskLibrary().empty() ||
        kstt::SttEngine::findDefaultModel().empty()) {
        skipTest("모델 또는 libvosk 없음");
        return;
    }

    const std::vector<int16_t> noise = makeNoise(16000, 4.0, 0.004);
    const std::string path = (tempDir() / "noise.wav").string();
    std::string err;
    CHECK(kstt::writeWav16(path, noise.data(), noise.size(), 16000, &err), "쓰기 실패: " + err);

    const auto countFinals = [&](bool gate, int* out) {
        kstt::SttEngine engine;
        kstt::EngineConfig config;
        config.gateSilence = gate;
        std::string loadError;
        if (!engine.loadModel(config, &loadError)) return loadError;

        int finals = 0;
        std::string heard;
        engine.onFinal([&](const kstt::Transcript& result) {
            if (result.text.empty()) return;
            ++finals;
            heard += result.text + " ";
        });
        std::string startError;
        if (!engine.start(std::make_shared<kstt::WavFileSource>(path), &startError))
            return startError;
        for (int i = 0; i < 400 && engine.isRunning(); ++i)
            std::this_thread::sleep_for(std::chrono::milliseconds(25));
        engine.stop();
        *out = finals;
        return std::string();
    };

    int withoutGate = 0;
    int withGate = 0;
    std::string failure = countFinals(false, &withoutGate);
    CHECK(failure.empty(), "게이트 없이 실행 실패: " + failure);
    failure = countFinals(true, &withGate);
    CHECK(failure.empty(), "게이트 켜고 실행 실패: " + failure);

    CHECK(withGate == 0, "잡음에서 " + std::to_string(withGate) + "건을 받아썼다");
    std::printf("\n      게이트 끄면 %d건 → 켜면 %d건\n      ", withoutGate, withGate);
    endTest();
}

// 모델·라이브러리·시험 음원이 모두 있을 때만 도는 종단 시험
void testEndToEndRecognition(const std::string& wavPath) {
    startTest("종단: WAV 한국어 음원을 실제로 인식한다");

    const std::string library = kstt::SttEngine::findVoskLibrary();
    if (library.empty()) {
        skipTest("libvosk 를 찾을 수 없음 (scripts/fetch_deps 를 먼저 실행)");
        return;
    }
    const std::string model = kstt::SttEngine::findDefaultModel();
    if (model.empty()) {
        skipTest("Vosk 모델을 찾을 수 없음 (scripts/fetch_deps 를 먼저 실행)");
        return;
    }
    if (wavPath.empty() || !fs::exists(wavPath)) {
        skipTest("시험 음원이 없음 (tests/data/sample-ko.wav 또는 인자로 지정)");
        return;
    }

    kstt::SttEngine engine;
    kstt::EngineConfig config;
    config.withWords = true;
    std::string err;
    CHECK(engine.loadModel(config, &err), "모델 적재 실패: " + err);

    std::string transcript;
    int finals = 0;
    int partials = 0;
    engine.onFinal([&](const kstt::Transcript& result) {
        if (result.text.empty()) return;
        ++finals;
        if (!transcript.empty()) transcript += " ";
        transcript += result.text;
    });
    engine.onPartial([&](const std::string& text) {
        if (!text.empty()) ++partials;
    });

    CHECK(engine.start(std::make_shared<kstt::WavFileSource>(wavPath), &err),
          "인식 시작 실패: " + err);
    for (int i = 0; i < 600 && engine.isRunning(); ++i)
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    engine.stop();

    CHECK(engine.state() != kstt::EngineState::Error, "엔진이 오류로 끝났다: " + engine.lastError());
    CHECK(finals > 0, "최종 결과가 하나도 없다");
    CHECK(!transcript.empty(), "인식 결과가 비었다");
    std::printf("\n      인식: \"%s\" (최종 %d건, 부분 %d건)\n      ", transcript.c_str(), finals,
                partials);
    endTest();
}

}  // namespace

int main(int argc, char** argv) {
#if defined(_WIN32)
    SetConsoleOutputCP(CP_UTF8);  // 한글 출력을 위해
#endif

    std::string sampleDir;
    std::string wavPath = argc > 1 ? argv[1] : std::string();
    if (wavPath.empty()) {
        for (const std::string& root : kstt::SttEngine::searchRoots()) {
            const fs::path candidate = fs::path(root) / "tests" / "data" / "sample-ko.wav";
            if (fs::exists(candidate)) {
                wavPath = candidate.string();
                sampleDir = candidate.parent_path().string();
                break;
            }
        }
    }

    if (sampleDir.empty() && !wavPath.empty())
        sampleDir = fs::path(wavPath).parent_path().string();

    std::printf("\nkstt 코어 시험\n\n");
    std::printf("[JSON]\n");
    testJsonBasics();
    testJsonKorean();
    testJsonEscapesAndErrors();

    std::printf("\n[WAV / AudioSource]\n");
    testWavRoundTrip();
    testWavResample();
    testWavNotAWavFile();
    testWavFileSourceStreaming();
    testWavFileSourceCancel();

    std::printf("\n[걸러내기]\n");
    testStablePrefix();
    testConfidenceFilter();
    testSpeechGate();

    testVocabularyParsing();
    testVocabularyFilter();

    std::printf("\n[엔진]\n");
    testEngineRejectsBadModel();
    testEngineRejectsStartWithoutModel();
    testPathDiscovery();

    std::printf("\n[종단]\n");
    testEndToEndRecognition(wavPath);
    testEndToEndSilenceIsIgnored();
    testEndToEndVocabulary(sampleDir);

    std::printf("\n요약: 통과 %d · 실패 %d · 건너뜀 %d\n\n", g_passed, g_failed, g_skipped);
    return g_failed == 0 ? 0 : 1;
}
