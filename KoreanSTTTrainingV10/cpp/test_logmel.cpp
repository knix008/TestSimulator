#include "logmel.hpp"
#include "wav_io.hpp"

#include <filesystem>
#include <iostream>

namespace {

int run(const std::filesystem::path& model_dir, const std::filesystem::path& wav_path, const std::filesystem::path& out_path) {
    const kws::Frontend frontend = kws::load_frontend(model_dir);
    const kws::WavData audio = kws::read_wav(wav_path);
    if (audio.sample_rate != frontend.sample_rate) {
        throw std::runtime_error("WAV 샘플레이트가 모델과 다릅니다. 16 kHz 모노 파일이어야 합니다.");
    }
    const std::vector<float> features = kws::waveform_to_logmel(frontend, audio.samples);
    std::ofstream out(out_path, std::ios::binary);
    if (!out) {
        throw std::runtime_error("특징 파일을 쓸 수 없습니다.");
    }
    out.write(reinterpret_cast<const char*>(features.data()), static_cast<std::streamsize>(features.size() * sizeof(float)));
    if (!out) {
        throw std::runtime_error("특징 파일을 쓰지 못했습니다.");
    }
    std::cout << features.size() << "\n";
    return 0;
}

}  // namespace

#if defined(_WIN32) && defined(_MSC_VER)
#include <windows.h>
int wmain(int argc, wchar_t** argv) {
    SetConsoleOutputCP(CP_UTF8);
    if (argc != 4) {
        std::cerr << "사용법: test_logmel <모델폴더> <wav> <출력.bin>\n";
        return 2;
    }
    try {
        return run(argv[1], argv[2], argv[3]);
    } catch (const std::exception& exc) {
        std::cerr << exc.what() << "\n";
        return 1;
    }
}
#else
int main(int argc, char** argv) {
    if (argc != 4) {
        std::cerr << "usage: test_logmel <model_dir> <wav> <out.bin>\n";
        return 2;
    }
    try {
        return run(argv[1], argv[2], argv[3]);
    } catch (const std::exception& exc) {
        std::cerr << exc.what() << "\n";
        return 1;
    }
}
#endif
