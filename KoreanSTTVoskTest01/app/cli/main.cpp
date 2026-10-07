// app/cli/main.cpp
//
// 콘솔 프런트엔드. GUI 와 완전히 같은 코어 API 만 쓴다 — 이 파일에 GUI 코드가
// 한 줄도 없고, GUI 쪽에도 인식 로직이 한 줄도 없다는 것이 분리의 증거다.
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "kstt/platform/audio_input.h"
#include "kstt/stt_engine.h"
#include "kstt/text_width.h"
#include "kstt/vocabulary.h"
#include "kstt/wav_file.h"

#if defined(_WIN32)
#include <windows.h>
#endif

namespace {

void enableUtf8Console() {
#if defined(_WIN32)
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCP(CP_UTF8);
#endif
}

#if defined(_WIN32)
// Windows 의 char** argv 는 ANSI 코드페이지(한국어 Windows 는 949)로 들어온다.
// 그래서 --vocab "출근,퇴근" 이나 한글이 든 경로가 깨진다. 진짜 명령줄을
// 와이드로 받아 UTF-8 로 바꿔 쓴다.
std::vector<std::string> utf8Arguments() {
    std::vector<std::string> args;
    int count = 0;
    LPWSTR* wide = CommandLineToArgvW(GetCommandLineW(), &count);
    if (!wide) return args;
    for (int i = 0; i < count; ++i) {
        const int n = WideCharToMultiByte(CP_UTF8, 0, wide[i], -1, nullptr, 0, nullptr, nullptr);
        std::string arg(static_cast<size_t>(n > 0 ? n - 1 : 0), '\0');
        if (n > 1)
            WideCharToMultiByte(CP_UTF8, 0, wide[i], -1, arg.data(), n, nullptr, nullptr);
        args.push_back(std::move(arg));
    }
    LocalFree(wide);
    return args;
}
#endif

void printUsage(const char* argv0) {
    std::printf(
        "사용법: %s [옵션]\n"
        "\n"
        "  --model <디렉터리>   Vosk 한국어 모델 경로 (생략하면 자동 탐색)\n"
        "  --lib <경로>         libvosk 경로 (생략하면 자동 탐색)\n"
        "  --wav <파일>         WAV 파일을 인식 (마이크 대신)\n"
        "  --device <번호>      마이크 장치 번호 (기본: 시스템 기본 장치)\n"
        "  --list-devices       입력 장치 목록만 출력하고 끝낸다\n"
        "  --seconds <초>       마이크 인식 시간 (생략하면 Enter 를 누를 때까지)\n"
        "  --rate <Hz>          표본율 (기본 16000)\n"
        "  --words              낱말 단위 시각·신뢰도까지 출력\n"
        "\n"
        "  말하지 않은 것을 받아쓰지 않기 위한 설정:\n"
        "  --no-gate            무음·잡음 구간 걸러내기를 끈다\n"
        "  --silence <0..1>     유성음 판정 RMS 기준 (기본: 잡음 바닥에서 자동)\n"
        "  --min-speech <ms>    결과로 인정할 최소 발화 길이 (기본 200)\n"
        "  --min-conf <0..1>    이 신뢰도 미만 낱말은 버린다 (기본 0.4, 0 이면 끔)\n"
        "  --max-zcr <0..1>     영교차율이 이보다 높으면 잡음으로 본다 (기본 0.35, 1 이면 끔)\n"
        "  --min-voiced <0..1>  낱말 구간에서 실제 발화가 차지해야 할 비율 (기본 0.6)\n"
        "  --max-word <초>      낱말 하나가 이보다 길면 버린다 (기본 2.0, 0 이면 끔)\n"
        "  --partial <모드>     진행 중 표시: off | stable(기본) | raw\n"
        "  --vocab \"말1,말2\"    받아쓸 말을 이 목록으로 한정 (기본: 출근, 퇴근)\n"
        "  --free               한정하지 않고 자유 받아쓰기\n"
        "  --paths              모델/라이브러리 탐색 경로를 보여준다\n"
        "  -h, --help           이 도움말\n",
        argv0);
}

struct Options {
    std::string modelPath;
    std::string libPath;
    std::string wavPath;
    int device = -1;
    int seconds = 0;
    int rate = 16000;
    bool listDevices = false;
    bool words = false;
    bool showPaths = false;
    bool help = false;

    bool gateSilence = true;
    float silence = 0.0f;
    int minSpeech = 200;
    float minConfidence = 0.4f;
    float maxZcr = 0.35f;
    float minVoiced = 0.6f;
    double maxWordSeconds = 2.0;
    kstt::PartialMode partialMode = kstt::PartialMode::Stable;
    std::vector<std::string> vocabulary = kstt::defaultVocabulary();
};

bool parseOptions(int argc, char** argv, Options* out, std::string* err) {
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        const auto next = [&](std::string* slot) {
            if (i + 1 >= argc) {
                *err = arg + " 뒤에 값이 필요합니다";
                return false;
            }
            *slot = argv[++i];
            return true;
        };

        if (arg == "-h" || arg == "--help") {
            out->help = true;
        } else if (arg == "--list-devices") {
            out->listDevices = true;
        } else if (arg == "--words") {
            out->words = true;
        } else if (arg == "--paths") {
            out->showPaths = true;
        } else if (arg == "--model") {
            if (!next(&out->modelPath)) return false;
        } else if (arg == "--lib") {
            if (!next(&out->libPath)) return false;
        } else if (arg == "--wav") {
            if (!next(&out->wavPath)) return false;
        } else if (arg == "--device") {
            std::string value;
            if (!next(&value)) return false;
            out->device = std::atoi(value.c_str());
        } else if (arg == "--seconds") {
            std::string value;
            if (!next(&value)) return false;
            out->seconds = std::atoi(value.c_str());
        } else if (arg == "--rate") {
            std::string value;
            if (!next(&value)) return false;
            out->rate = std::atoi(value.c_str());
        } else if (arg == "--max-zcr") {
            std::string value;
            if (!next(&value)) return false;
            out->maxZcr = static_cast<float>(std::atof(value.c_str()));
        } else if (arg == "--min-voiced") {
            std::string value;
            if (!next(&value)) return false;
            out->minVoiced = static_cast<float>(std::atof(value.c_str()));
        } else if (arg == "--max-word") {
            std::string value;
            if (!next(&value)) return false;
            out->maxWordSeconds = std::atof(value.c_str());
        } else if (arg == "--vocab") {
            std::string value;
            if (!next(&value)) return false;
            out->vocabulary = kstt::parseVocabulary(value);
        } else if (arg == "--free") {
            out->vocabulary.clear();
        } else if (arg == "--no-gate") {
            out->gateSilence = false;
        } else if (arg == "--silence") {
            std::string value;
            if (!next(&value)) return false;
            out->silence = static_cast<float>(std::atof(value.c_str()));
        } else if (arg == "--min-speech") {
            std::string value;
            if (!next(&value)) return false;
            out->minSpeech = std::atoi(value.c_str());
        } else if (arg == "--min-conf") {
            std::string value;
            if (!next(&value)) return false;
            out->minConfidence = static_cast<float>(std::atof(value.c_str()));
        } else if (arg == "--partial") {
            std::string value;
            if (!next(&value)) return false;
            if (value == "off") {
                out->partialMode = kstt::PartialMode::Off;
            } else if (value == "stable") {
                out->partialMode = kstt::PartialMode::Stable;
            } else if (value == "raw") {
                out->partialMode = kstt::PartialMode::Raw;
            } else {
                *err = "--partial 는 off / stable / raw 중 하나여야 합니다";
                return false;
            }
        } else {
            *err = "알 수 없는 옵션: " + arg;
            return false;
        }
    }
    return true;
}

}  // namespace

int main(int argc, char** argv) {
    enableUtf8Console();

#if defined(_WIN32)
    // 한글 인자가 깨지지 않도록 UTF-8 로 다시 만든 argv 를 쓴다.
    const std::vector<std::string> utf8Args = utf8Arguments();
    std::vector<char*> argvStorage;
    for (const std::string& arg : utf8Args)
        argvStorage.push_back(const_cast<char*>(arg.c_str()));
    if (!argvStorage.empty()) {
        argc = static_cast<int>(argvStorage.size());
        argv = argvStorage.data();
    }
#endif

    Options options;
    std::string parseError;
    if (!parseOptions(argc, argv, &options, &parseError)) {
        std::fprintf(stderr, "%s\n\n", parseError.c_str());
        printUsage(argv[0]);
        return 2;
    }
    if (options.help) {
        printUsage(argv[0]);
        return 0;
    }

    if (options.showPaths) {
        std::printf("오디오 백엔드 : %s\n", kstt::platform::backendName());
        std::printf("libvosk       : %s\n",
                    kstt::SttEngine::findVoskLibrary().empty()
                        ? "(못 찾음)"
                        : kstt::SttEngine::findVoskLibrary().c_str());
        const std::string model = kstt::SttEngine::findDefaultModel();
        std::printf("모델          : %s\n", model.empty() ? "(못 찾음)" : model.c_str());
        std::printf("탐색 뿌리     :\n");
        for (const std::string& root : kstt::SttEngine::searchRoots())
            std::printf("  %s\n", root.c_str());
        return 0;
    }

    if (options.listDevices) {
        std::printf("입력 장치 (%s)\n", kstt::platform::backendName());
        for (const kstt::AudioDevice& device : kstt::platform::inputDevices())
            std::printf("  %3d  %s\n", device.id, device.name.c_str());
        return 0;
    }

    kstt::EngineConfig config;
    config.modelPath = options.modelPath;
    config.voskLibPath = options.libPath;
    config.sampleRate = options.rate;
    config.withWords = options.words;
    config.gateSilence = options.gateSilence;
    config.silenceThreshold = options.silence;
    config.minSpeechMillis = options.minSpeech;
    config.minConfidence = options.minConfidence;
    config.maxZeroCrossingRate = options.maxZcr;
    config.minVoicedFraction = options.minVoiced;
    config.maxWordSeconds = options.maxWordSeconds;
    config.partialMode = options.partialMode;
    config.vocabulary = options.vocabulary;

    kstt::SttEngine engine;

    std::mutex printMutex;
    bool partialShown = false;

    engine.onPartial([&](const std::string& text) {
        std::lock_guard<std::mutex> lock(printMutex);
        if (text.empty()) {
            if (partialShown) {
                std::printf("\r%-78s\r", "");
                partialShown = false;
            }
            return;
        }
        std::printf("\r  … %-74.74s", text.c_str());
        std::fflush(stdout);
        partialShown = true;
    });

    engine.onFinal([&](const kstt::Transcript& result) {
        std::lock_guard<std::mutex> lock(printMutex);
        if (partialShown) {
            std::printf("\r%-78s\r", "");
            partialShown = false;
        }
        std::printf("  > %s\n", result.text.c_str());
        for (const kstt::Word& word : result.words)
            std::printf("      [%6.2f-%6.2f] %-16s conf %.2f\n", word.start, word.end,
                        word.text.c_str(), word.conf);
        std::fflush(stdout);
    });

    engine.onState([&](kstt::EngineState state, const std::string& message) {
        if (state != kstt::EngineState::Error) return;
        std::lock_guard<std::mutex> lock(printMutex);
        std::fprintf(stderr, "\n오류: %s\n", message.c_str());
    });

    std::string err;
    std::printf("모델을 적재합니다...\n");
    const auto loadStart = std::chrono::steady_clock::now();
    if (!engine.loadModel(config, &err)) {
        std::fprintf(stderr, "모델 적재 실패: %s\n", err.c_str());
        return 1;
    }
    const double loadSeconds =
        std::chrono::duration<double>(std::chrono::steady_clock::now() - loadStart).count();
    std::printf("모델 : %s\n", engine.config().modelPath.c_str());
    std::printf("Vosk : %s (%.1f초)\n", engine.voskLibraryPath().c_str(), loadSeconds);
    if (options.vocabulary.empty()) {
        std::printf("받는 말: (한정 없음 — 자유 받아쓰기)\n\n");
    } else {
        std::printf("받는 말: %s\n",
                    kstt::formatVocabulary(options.vocabulary).c_str());
        const std::vector<std::string> unknown = engine.unknownWords();
        if (!unknown.empty()) {
            std::fprintf(stderr,
                         "경고: 모델이 모르는 말이 있어 그 말은 인식되지 않습니다: %s\n",
                         kstt::formatVocabulary(unknown).c_str());
        }
        std::printf("\n");
    }

    std::shared_ptr<kstt::AudioSource> source;
    if (!options.wavPath.empty()) {
        source = std::make_shared<kstt::WavFileSource>(options.wavPath);
    } else {
        source = kstt::platform::createMicrophone(options.device);
    }

    if (!engine.start(source, &err)) {
        std::fprintf(stderr, "인식 시작 실패: %s\n", err.c_str());
        return 1;
    }

    if (!source->isLive()) {
        std::printf("파일 인식 중: %s\n", source->name().c_str());
        while (engine.isRunning()) std::this_thread::sleep_for(std::chrono::milliseconds(50));
    } else if (options.seconds > 0) {
        std::printf("%s 에서 %d초 동안 듣습니다...\n", source->name().c_str(), options.seconds);
        const auto deadline =
            std::chrono::steady_clock::now() + std::chrono::seconds(options.seconds);
        while (engine.isRunning() && std::chrono::steady_clock::now() < deadline)
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
    } else {
        std::printf("%s 에서 듣습니다. 끝내려면 Enter.\n", source->name().c_str());
        std::string line;
        std::getline(std::cin, line);
    }

    engine.stop();
    std::printf("\n끝났습니다.\n");
    return engine.state() == kstt::EngineState::Error ? 1 : 0;
}
