#include "logmel.hpp"
#include "wav_io.hpp"

#include <onnxruntime_cxx_api.h>

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cwchar>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <vector>

#ifdef _WIN32
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif

namespace {

int run(const std::filesystem::path& model_dir, const std::filesystem::path& wav_path, float threshold) {
    if (!std::filesystem::is_directory(model_dir)) {
        throw std::runtime_error("모델 폴더가 아닙니다. command_kws.onnx가 들어 있는 폴더를 지정하세요.");
    }
    const kws::Frontend frontend = kws::load_frontend(model_dir);
    const kws::WavData audio = kws::read_wav(wav_path);
    if (audio.sample_rate != frontend.sample_rate) {
        throw std::runtime_error("WAV 샘플레이트가 모델과 다릅니다. 16 kHz로 저장된 파일을 사용하세요.");
    }
    std::vector<float> features = kws::waveform_to_logmel(frontend, audio.samples);
    const size_t expected = static_cast<size_t>(frontend.n_mels * frontend.n_frames);
    if (features.size() != expected) {
        throw std::runtime_error("특징 길이가 모델 입력과 다릅니다.");
    }

    Ort::Env env(ORT_LOGGING_LEVEL_WARNING, "kws");
    Ort::SessionOptions options;
    options.SetIntraOpNumThreads(1);
    options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
    const auto model_path = model_dir / "command_kws.onnx";
#ifdef _WIN32
    Ort::Session session(env, model_path.wstring().c_str(), options);
#else
    Ort::Session session(env, model_path.string().c_str(), options);
#endif

    const std::vector<int64_t> shape = {1, 1, frontend.n_mels, frontend.n_frames};
    Ort::MemoryInfo memory = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    Ort::Value input = Ort::Value::CreateTensor<float>(
        memory, features.data(), features.size(), shape.data(), shape.size());
    const char* input_names[] = {frontend.input_name.c_str()};
    const char* output_names[] = {frontend.output_name.c_str()};
    auto outputs = session.Run(Ort::RunOptions{nullptr}, input_names, &input, 1, output_names, 1);
    const auto info = outputs[0].GetTensorTypeAndShapeInfo();
    int64_t count = 1;
    for (int64_t dim : info.GetShape()) {
        count *= dim;
    }
    if (count != static_cast<int64_t>(frontend.labels.size())) {
        throw std::runtime_error("ONNX 출력 개수가 클래스 수와 다릅니다.");
    }
    const float* logits = outputs[0].GetTensorData<float>();

    std::vector<double> probs(static_cast<size_t>(count));
    double max_logit = logits[0];
    for (int64_t i = 1; i < count; ++i) {
        max_logit = std::max(max_logit, static_cast<double>(logits[i]));
    }
    double sum = 0.0;
    for (int64_t i = 0; i < count; ++i) {
        probs[static_cast<size_t>(i)] = std::exp(static_cast<double>(logits[i]) - max_logit);
        sum += probs[static_cast<size_t>(i)];
    }
    for (double& prob : probs) {
        prob /= sum;
    }

    int top = 0;
    int nearest = 0;
    double near_prob = -1.0;
    for (int i = 0; i < static_cast<int>(probs.size()); ++i) {
        if (probs[static_cast<size_t>(i)] > probs[static_cast<size_t>(top)]) {
            top = i;
        }
        if (i == frontend.silence_index) {
            continue;
        }
        if (probs[static_cast<size_t>(i)] > near_prob) {
            near_prob = probs[static_cast<size_t>(i)];
            nearest = i;
        }
    }
    const bool accepted = top != frontend.silence_index && probs[static_cast<size_t>(top)] >= static_cast<double>(threshold);

    std::cout << std::fixed << std::setprecision(3);
    if (accepted) {
        std::cout << "결과: " << frontend.labels[static_cast<size_t>(top)] << "\n";
        std::cout << "신뢰도: " << probs[static_cast<size_t>(top)] << "\n";
    } else {
        std::cout << "결과: 대기\n";
        std::cout << "가장 가까운 명령: " << frontend.labels[static_cast<size_t>(nearest)]
                  << "  " << near_prob << "\n";
    }
    for (size_t i = 0; i < frontend.labels.size(); ++i) {
        std::cout << frontend.labels[i] << "\t" << probs[i] << "\n";
    }
    std::cout << "ACCEPTED=" << (accepted ? 1 : 0) << "\n";
    std::cout << "LABEL=" << (accepted ? frontend.labels[static_cast<size_t>(top)] : "대기") << "\n";
    std::cout << "TOP_LABEL=" << frontend.labels[static_cast<size_t>(top)] << "\n";
    std::cout << "TOP_CONFIDENCE=" << probs[static_cast<size_t>(top)] << "\n";
    return 0;
}

}  // namespace

#if defined(_WIN32) && defined(_MSC_VER)
int wmain(int argc, wchar_t** argv) {
    SetConsoleOutputCP(CP_UTF8);
    if (argc < 3) {
        std::cerr << "사용법: kws_infer <모델폴더> <wav파일> [임계값]\n";
        std::cerr << "예: kws_infer models\\latest 명령.wav 0.70\n";
        return 2;
    }
    try {
        const float threshold = argc >= 4 ? static_cast<float>(std::wcstof(argv[3], nullptr)) : 0.70f;
        return run(argv[1], argv[2], threshold);
    } catch (const Ort::Exception& exc) {
        std::cerr << "ONNX 오류: " << exc.what() << "\n";
        return 1;
    } catch (const std::exception& exc) {
        std::cerr << exc.what() << "\n";
        return 1;
    }
}
#else
int main(int argc, char** argv) {
    if (argc < 3) {
        std::cerr << "usage: kws_infer <model_dir> <wav> [threshold]\n";
        return 2;
    }
    try {
        const float threshold = argc >= 4 ? std::strtof(argv[3], nullptr) : 0.70f;
        return run(argv[1], argv[2], threshold);
    } catch (const Ort::Exception& exc) {
        std::cerr << "ONNX error: " << exc.what() << "\n";
        return 1;
    } catch (const std::exception& exc) {
        std::cerr << exc.what() << "\n";
        return 1;
    }
}
#endif
