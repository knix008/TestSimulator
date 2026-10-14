#pragma once

// Python kws/features.py 와 같은 로그멜 특징.
// 파일 이름과 frontend.txt 키는 kws/paths.py, kws/features.py 와 맞춘다.
// 순서는 DC 제거, pre-emphasis, 피크 정규화, 해닝 창 FFT, 멜 필터, 로그, 정규화.

#include <algorithm>
#include <cmath>
#include <complex>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace kws {

struct Frontend {
    int version = 0;
    int sample_rate = 16000;
    int n_samples = 16000;
    int n_fft = 512;
    int win_length = 400;
    int hop_length = 160;
    int n_mels = 40;
    int n_frames = 98;
    int n_freqs = 257;
    float log_eps = 1e-6f;
    float preemphasis = 0.97f;
    float peak_target = 0.9f;
    float peak_min = 0.01f;
    int silence_index = -1;
    std::string input_name = "logmel";
    std::string output_name = "logits";
    std::vector<std::string> labels;
    std::vector<float> window;
    std::vector<float> mel;
    std::vector<float> mean;
    std::vector<float> stddev;
};

inline std::string trim_copy(std::string text) {
    while (!text.empty() && (text.back() == '\r' || text.back() == ' ' || text.back() == '\t')) {
        text.pop_back();
    }
    size_t start = 0;
    while (start < text.size() && (text[start] == ' ' || text[start] == '\t')) {
        ++start;
    }
    return text.substr(start);
}

inline std::string read_text(const std::filesystem::path& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        throw std::runtime_error("파일을 열 수 없습니다: " + path.filename().string());
    }
    std::ostringstream buffer;
    buffer << in.rdbuf();
    return buffer.str();
}

inline std::vector<float> read_f32(const std::filesystem::path& path, size_t expected, const char* name) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        throw std::runtime_error(std::string(name) + " 파일을 열 수 없습니다.");
    }
    in.seekg(0, std::ios::end);
    const auto bytes = static_cast<std::streamoff>(in.tellg());
    if (bytes != static_cast<std::streamoff>(expected * sizeof(float))) {
        throw std::runtime_error(std::string(name) + " 크기가 frontend.txt와 맞지 않습니다.");
    }
    in.seekg(0, std::ios::beg);
    std::vector<float> data(expected);
    in.read(reinterpret_cast<char*>(data.data()), static_cast<std::streamsize>(bytes));
    if (!in) {
        throw std::runtime_error(std::string(name) + " 파일을 읽지 못했습니다.");
    }
    return data;
}

inline Frontend load_frontend(const std::filesystem::path& model_dir) {
    const std::string text = read_text(model_dir / "frontend.txt");
    std::map<std::string, std::string> values;
    std::istringstream lines(text);
    std::string line;
    while (std::getline(lines, line)) {
        line = trim_copy(line);
        if (line.empty() || line[0] == '#') {
            continue;
        }
        const auto split = line.find('=');
        if (split == std::string::npos) {
            continue;
        }
        values[trim_copy(line.substr(0, split))] = trim_copy(line.substr(split + 1));
    }
    auto require = [&](const std::string& key) {
        const auto found = values.find(key);
        if (found == values.end()) {
            throw std::runtime_error("frontend.txt에 " + key + " 항목이 없습니다.");
        }
        return found->second;
    };

    Frontend frontend;
    frontend.version = std::stoi(require("version"));
    if (frontend.version != 1) {
        throw std::runtime_error("지원하지 않는 특징 버전입니다.");
    }
    frontend.sample_rate = std::stoi(require("sample_rate"));
    frontend.n_samples = std::stoi(require("n_samples"));
    frontend.n_fft = std::stoi(require("n_fft"));
    frontend.win_length = std::stoi(require("win_length"));
    frontend.hop_length = std::stoi(require("hop_length"));
    frontend.n_mels = std::stoi(require("n_mels"));
    frontend.n_frames = std::stoi(require("n_frames"));
    frontend.n_freqs = std::stoi(require("n_freqs"));
    frontend.log_eps = std::stof(require("log_eps"));
    frontend.preemphasis = std::stof(require("preemphasis"));
    frontend.peak_target = std::stof(require("peak_target"));
    frontend.peak_min = std::stof(require("peak_min"));
    frontend.silence_index = std::stoi(require("silence_index"));
    frontend.input_name = require("input_name");
    frontend.output_name = require("output_name");

    const int expected_frames = (frontend.n_samples - frontend.win_length) / frontend.hop_length + 1;
    if (frontend.n_frames != expected_frames || frontend.n_freqs != frontend.n_fft / 2 + 1) {
        throw std::runtime_error("frontend.txt의 프레임 설정이 올바르지 않습니다.");
    }
    const int need = (frontend.n_frames - 1) * frontend.hop_length + frontend.win_length;
    if (need > frontend.n_samples) {
        throw std::runtime_error("프레임 범위가 파형 길이를 넘습니다.");
    }

    const std::string label_text = read_text(model_dir / "labels.txt");
    std::istringstream label_lines(label_text);
    while (std::getline(label_lines, line)) {
        line = trim_copy(line);
        if (!line.empty()) {
            frontend.labels.push_back(line);
        }
    }
    if (frontend.labels.empty() || frontend.silence_index < 0 ||
        frontend.silence_index >= static_cast<int>(frontend.labels.size())) {
        throw std::runtime_error("labels.txt 또는 silence_index가 올바르지 않습니다.");
    }

    frontend.window = read_f32(model_dir / "window.bin", static_cast<size_t>(frontend.win_length), "window.bin");
    frontend.mel = read_f32(
        model_dir / "mel_filters.bin",
        static_cast<size_t>(frontend.n_mels) * static_cast<size_t>(frontend.n_freqs),
        "mel_filters.bin");
    auto norm = read_f32(model_dir / "norm.bin", static_cast<size_t>(frontend.n_mels) * 2, "norm.bin");
    frontend.mean.assign(norm.begin(), norm.begin() + frontend.n_mels);
    frontend.stddev.assign(norm.begin() + frontend.n_mels, norm.end());
    return frontend;
}

inline void fft(std::vector<std::complex<float>>& data) {
    const size_t n = data.size();
    for (size_t i = 1, j = 0; i < n; ++i) {
        size_t bit = n >> 1;
        for (; j & bit; bit >>= 1) {
            j ^= bit;
        }
        j ^= bit;
        if (i < j) {
            std::swap(data[i], data[j]);
        }
    }
    constexpr double pi = 3.14159265358979323846;
    for (size_t len = 2; len <= n; len <<= 1) {
        const double angle = -2.0 * pi / static_cast<double>(len);
        for (size_t i = 0; i < n; i += len) {
            for (size_t j = 0; j < len / 2; ++j) {
                const double theta = angle * static_cast<double>(j);
                const std::complex<float> w(
                    static_cast<float>(std::cos(theta)),
                    static_cast<float>(std::sin(theta)));
                const std::complex<float> u = data[i + j];
                const std::complex<float> v = data[i + j + len / 2] * w;
                data[i + j] = u + v;
                data[i + j + len / 2] = u - v;
            }
        }
    }
}

inline std::vector<float> fit_length(const std::vector<float>& wav, int n_samples, int step) {
    if (n_samples <= 0) {
        throw std::runtime_error("샘플 수가 올바르지 않습니다.");
    }
    if (step <= 0) {
        step = 1;
    }
    if (wav.empty()) {
        return std::vector<float>(static_cast<size_t>(n_samples), 0.f);
    }
    if (static_cast<int>(wav.size()) < n_samples) {
        std::vector<float> out(static_cast<size_t>(n_samples), 0.f);
        const int start = (n_samples - static_cast<int>(wav.size())) / 2;
        std::copy(wav.begin(), wav.end(), out.begin() + start);
        return out;
    }
    if (static_cast<int>(wav.size()) == n_samples) {
        return wav;
    }
    const int limit = static_cast<int>(wav.size()) - n_samples;
    int best_start = 0;
    double best_energy = -1.0;
    for (int start = 0;;) {
        double energy = 0.0;
        for (int i = 0; i < n_samples; ++i) {
            const double value = wav[static_cast<size_t>(start + i)];
            energy += value * value;
        }
        if (energy > best_energy) {
            best_energy = energy;
            best_start = start;
        }
        if (start == limit) {
            break;
        }
        start += step;
        if (start > limit) {
            start = limit;
        }
    }
    return std::vector<float>(wav.begin() + best_start, wav.begin() + best_start + n_samples);
}

inline std::vector<float> remove_dc(const std::vector<float>& wav) {
    if (wav.empty()) {
        return wav;
    }
    double sum = 0.0;
    for (float value : wav) {
        sum += static_cast<double>(value);
    }
    const float mean = static_cast<float>(sum / static_cast<double>(wav.size()));
    std::vector<float> out(wav.size());
    for (size_t i = 0; i < wav.size(); ++i) {
        out[i] = wav[i] - mean;
    }
    return out;
}

inline std::vector<float> apply_preemphasis(const std::vector<float>& wav, float coefficient) {
    if (wav.empty() || coefficient == 0.f) {
        return wav;
    }
    std::vector<float> out(wav.size());
    out[0] = wav[0];
    for (size_t i = 1; i < wav.size(); ++i) {
        out[i] = wav[i] - coefficient * wav[i - 1];
    }
    return out;
}

inline std::vector<float> peak_normalize(std::vector<float> wav, float target, float minimum) {
    float peak = 0.f;
    for (float value : wav) {
        peak = std::max(peak, std::fabs(value));
    }
    if (peak >= minimum && peak > 0.f) {
        const float gain = static_cast<float>(static_cast<double>(target) / static_cast<double>(peak));
        for (float& value : wav) {
            value *= gain;
        }
    }
    for (float& value : wav) {
        value = std::clamp(value, -1.f, 1.f);
    }
    return wav;
}

inline std::vector<float> waveform_to_logmel(const Frontend& frontend, const std::vector<float>& mono) {
    auto wav = fit_length(mono, frontend.n_samples, frontend.hop_length);
    wav = remove_dc(wav);
    wav = apply_preemphasis(wav, frontend.preemphasis);
    wav = peak_normalize(std::move(wav), frontend.peak_target, frontend.peak_min);

    std::vector<float> output(static_cast<size_t>(frontend.n_mels * frontend.n_frames), 0.f);
    std::vector<std::complex<float>> spectrum(static_cast<size_t>(frontend.n_fft));
    std::vector<float> power(static_cast<size_t>(frontend.n_freqs));
    for (int frame = 0; frame < frontend.n_frames; ++frame) {
        const int start = frame * frontend.hop_length;
        for (int i = 0; i < frontend.n_fft; ++i) {
            float sample = 0.f;
            if (i < frontend.win_length) {
                sample = wav[static_cast<size_t>(start + i)] * frontend.window[static_cast<size_t>(i)];
            }
            spectrum[static_cast<size_t>(i)] = {sample, 0.f};
        }
        fft(spectrum);
        for (int bin = 0; bin < frontend.n_freqs; ++bin) {
            const float real = spectrum[static_cast<size_t>(bin)].real();
            const float imag = spectrum[static_cast<size_t>(bin)].imag();
            power[static_cast<size_t>(bin)] = real * real + imag * imag;
        }
        for (int mel = 0; mel < frontend.n_mels; ++mel) {
            double acc = 0.0;
            const float* weights = frontend.mel.data() + static_cast<size_t>(mel * frontend.n_freqs);
            for (int bin = 0; bin < frontend.n_freqs; ++bin) {
                acc += static_cast<double>(weights[bin]) * static_cast<double>(power[static_cast<size_t>(bin)]);
            }
            const float logged = static_cast<float>(std::log(acc + static_cast<double>(frontend.log_eps)));
            const float norm = (logged - frontend.mean[static_cast<size_t>(mel)]) / frontend.stddev[static_cast<size_t>(mel)];
            output[static_cast<size_t>(mel * frontend.n_frames + frame)] = norm;
        }
    }
    return output;
}

}  // namespace kws
