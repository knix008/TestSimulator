#include "kstt/keyword_model.h"

#include "keyword_audio.h"
#include "kstt/audio_source.h"
#include "kstt/vocabulary.h"
#include "kstt/wav_file.h"
#include "paths.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>

namespace kstt {
namespace {

namespace fs = std::filesystem;

constexpr char kMagic[8] = {'K', 'S', 'T', 'T', 'K', 'W', '0', '1'};

fs::path fsPath(const std::string& utf8) {
#if defined(_WIN32)
    return fs::u8path(utf8);
#else
    return fs::path(utf8);
#endif
}

std::string pathUtf8(const fs::path& path) {
    const auto utf8 = path.u8string();
    return std::string(utf8.begin(), utf8.end());
}

std::string trimCopy(std::string text) {
    while (!text.empty() &&
           (text.back() == ' ' || text.back() == '\t' || text.back() == '\r' || text.back() == '\n'))
        text.pop_back();
    std::size_t i = 0;
    while (i < text.size() && (text[i] == ' ' || text[i] == '\t')) ++i;
    return text.substr(i);
}

bool validWord(const std::string& word, std::string* err) {
    if (word.empty()) {
        if (err) *err = "말이 비어 있습니다.";
        return false;
    }
    if (word.size() > 48) {
        if (err) *err = "말이 너무 깁니다.";
        return false;
    }
    if (word == "." || word == "..") {
        if (err) *err = "그 이름은 쓸 수 없습니다.";
        return false;
    }
    for (unsigned char c : word) {
        if (c < 0x20) {
            if (err) *err = "말에는 제어 문자를 넣을 수 없습니다.";
            return false;
        }
    }
    if (word.find_first_of("\\/:*?\"<>|") != std::string::npos) {
        if (err) *err = "말에는 \\ / : * ? \" < > | 를 넣을 수 없습니다.";
        return false;
    }
    return true;
}

std::uint32_t readU32(const unsigned char* p) {
    return static_cast<std::uint32_t>(p[0]) | (static_cast<std::uint32_t>(p[1]) << 8) |
           (static_cast<std::uint32_t>(p[2]) << 16) | (static_cast<std::uint32_t>(p[3]) << 24);
}

void appendU32(std::vector<unsigned char>* out, std::uint32_t value) {
    out->push_back(static_cast<unsigned char>(value & 0xFF));
    out->push_back(static_cast<unsigned char>((value >> 8) & 0xFF));
    out->push_back(static_cast<unsigned char>((value >> 16) & 0xFF));
    out->push_back(static_cast<unsigned char>((value >> 24) & 0xFF));
}

void appendF32(std::vector<unsigned char>* out, float value) {
    std::uint32_t bits = 0;
    std::memcpy(&bits, &value, sizeof(bits));
    appendU32(out, bits);
}

std::uint32_t crc32(const unsigned char* data, std::size_t count) {
    std::uint32_t crc = 0xFFFFFFFFu;
    for (std::size_t i = 0; i < count; ++i) {
        crc ^= data[i];
        for (int bit = 0; bit < 8; ++bit)
            crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
    }
    return ~crc;
}

float cosineDistance(const float* a, const float* b) {
    double dot = 0.0;
    for (int i = 0; i < kKeywordFeatDim; ++i)
        dot += static_cast<double>(a[i]) * b[i];
    if (dot > 1.0) dot = 1.0;
    if (dot < -1.0) dot = -1.0;
    return static_cast<float>(1.0 - dot);
}

float classThreshold(const KeywordClass& cls) {
    if (cls.exemplars.size() < 2) return 0.32f;
    float widest = 0.0f;
    for (std::size_t i = 0; i < cls.exemplars.size(); ++i) {
        float nearest = 2.0f;
        for (std::size_t j = 0; j < cls.exemplars.size(); ++j) {
            if (i == j) continue;
            nearest = std::min(nearest, cosineDistance(cls.exemplars[i].data(),
                                                       cls.exemplars[j].data()));
        }
        widest = std::max(widest, nearest);
    }
    const float scaled = widest * 1.8f + 0.04f;
    return std::clamp(scaled, 0.12f, 0.50f);
}

bool readAll(const fs::path& path, std::vector<unsigned char>* out, std::string* err) {
    std::ifstream file(path, std::ios::binary);
    if (!file) {
        if (err) *err = "모델 파일을 열 수 없습니다.";
        return false;
    }
    file.seekg(0, std::ios::end);
    const std::streamoff size = file.tellg();
    if (size < 28 || size > 32 * 1024 * 1024) {
        if (err) *err = "모델 파일 크기가 맞지 않습니다.";
        return false;
    }
    file.seekg(0);
    out->resize(static_cast<std::size_t>(size));
    file.read(reinterpret_cast<char*>(out->data()), size);
    if (!file) {
        if (err) *err = "모델 파일을 읽지 못했습니다.";
        return false;
    }
    return true;
}

}  // namespace

bool KeywordModel::empty() const {
    for (const KeywordClass& cls : classes_) {
        if (!cls.exemplars.empty()) return false;
    }
    return true;
}

std::vector<std::string> KeywordModel::words() const {
    std::vector<std::string> names;
    names.reserve(classes_.size());
    for (const KeywordClass& cls : classes_) names.push_back(cls.word);
    return names;
}

std::string KeywordModel::summary() const { return formatVocabulary(words()); }

KeywordHit KeywordModel::match(const std::int16_t* samples, std::size_t count) const {
    KeywordHit hit;
    float features[kKeywordFeatDim];
    if (!embedKeyword(samples, count, features)) return hit;
    hit.hasVoice = true;
    if (empty()) return hit;

    float best = 2.0f;
    float second = 2.0f;
    const KeywordClass* bestClass = nullptr;
    for (const KeywordClass& cls : classes_) {
        float nearest = 2.0f;
        for (const auto& exemplar : cls.exemplars)
            nearest = std::min(nearest, cosineDistance(features, exemplar.data()));
        if (nearest < best) {
            second = best;
            best = nearest;
            bestClass = &cls;
        } else if (nearest < second) {
            second = nearest;
        }
    }
    hit.distance = best;
    if (!bestClass) return hit;
    if (best > bestClass->threshold) return hit;
    if (second < best + 0.02f) return hit;
    hit.word = bestClass->word;
    return hit;
}

bool KeywordModel::save(const std::string& path, std::string* err) const {
    if (empty()) {
        if (err) *err = "저장할 키워드 모델이 없습니다. 먼저 학습하세요.";
        return false;
    }
    std::vector<unsigned char> bytes;
    bytes.insert(bytes.end(), kMagic, kMagic + 8);
    appendU32(&bytes, kKeywordModelVersion);
    appendU32(&bytes, static_cast<std::uint32_t>(kKeywordSampleRate));
    appendU32(&bytes, static_cast<std::uint32_t>(kKeywordFeatDim));
    appendU32(&bytes, static_cast<std::uint32_t>(classes_.size()));
    for (const KeywordClass& cls : classes_) {
        appendU32(&bytes, static_cast<std::uint32_t>(cls.word.size()));
        bytes.insert(bytes.end(), cls.word.begin(), cls.word.end());
        appendF32(&bytes, cls.threshold);
        appendU32(&bytes, static_cast<std::uint32_t>(cls.exemplars.size()));
        for (const auto& exemplar : cls.exemplars) {
            for (float value : exemplar) appendF32(&bytes, value);
        }
    }
    appendU32(&bytes, crc32(bytes.data(), bytes.size()));

    const fs::path filePath = fsPath(path);
    std::error_code ec;
    if (filePath.has_parent_path()) fs::create_directories(filePath.parent_path(), ec);
    std::ofstream file(filePath, std::ios::binary | std::ios::trunc);
    if (!file) {
        if (err) *err = "모델 파일을 만들 수 없습니다: " + path;
        return false;
    }
    file.write(reinterpret_cast<const char*>(bytes.data()),
               static_cast<std::streamsize>(bytes.size()));
    if (!file) {
        if (err) *err = "모델 파일을 쓰지 못했습니다: " + path;
        return false;
    }
    return true;
}

bool KeywordModel::load(const std::string& path, std::string* err) {
    std::vector<unsigned char> bytes;
    if (!readAll(fsPath(path), &bytes, err)) return false;
    if (bytes.size() < 28 || std::memcmp(bytes.data(), kMagic, 8) != 0) {
        if (err) *err = "키워드 모델 파일이 아닙니다.";
        return false;
    }
    const std::uint32_t stored = readU32(bytes.data() + bytes.size() - 4);
    const std::uint32_t actual = crc32(bytes.data(), bytes.size() - 4);
    if (stored != actual) {
        if (err) *err = "모델 파일이 손상되었습니다. 다시 복사하세요.";
        return false;
    }
    std::size_t cursor = 8;
    const auto takeU32 = [&](std::uint32_t* value) {
        if (cursor + 4 > bytes.size() - 4) return false;
        *value = readU32(bytes.data() + cursor);
        cursor += 4;
        return true;
    };
    std::uint32_t version = 0, rate = 0, dim = 0, classCount = 0;
    if (!takeU32(&version) || !takeU32(&rate) || !takeU32(&dim) || !takeU32(&classCount)) {
        if (err) *err = "모델 파일이 잘렸습니다.";
        return false;
    }
    if (version != kKeywordModelVersion || rate != static_cast<std::uint32_t>(kKeywordSampleRate) ||
        dim != static_cast<std::uint32_t>(kKeywordFeatDim) || classCount == 0 || classCount > 256) {
        if (err) *err = "이 프로그램이 읽지 못하는 키워드 모델입니다.";
        return false;
    }

    std::vector<KeywordClass> loaded;
    loaded.reserve(classCount);
    for (std::uint32_t c = 0; c < classCount; ++c) {
        std::uint32_t nameBytes = 0, exemplarCount = 0;
        if (!takeU32(&nameBytes) || nameBytes == 0 || nameBytes > 256 ||
            cursor + nameBytes > bytes.size() - 4) {
            if (err) *err = "모델 안의 말 이름이 깨졌습니다.";
            return false;
        }
        KeywordClass cls;
        cls.word.assign(reinterpret_cast<const char*>(bytes.data() + cursor), nameBytes);
        cursor += nameBytes;
        std::uint32_t bits = 0;
        if (!takeU32(&bits) || !takeU32(&exemplarCount) || exemplarCount == 0 ||
            exemplarCount > 4096) {
            if (err) *err = "모델 안의 학습 값이 깨졌습니다.";
            return false;
        }
        std::memcpy(&cls.threshold, &bits, sizeof(cls.threshold));
        if (!(cls.threshold > 0.0f) || cls.threshold > 2.0f) {
            if (err) *err = "모델의 판정 기준이 깨졌습니다.";
            return false;
        }
        cls.exemplars.resize(exemplarCount);
        for (std::uint32_t e = 0; e < exemplarCount; ++e) {
            for (int i = 0; i < kKeywordFeatDim; ++i) {
                if (!takeU32(&bits)) {
                    if (err) *err = "모델 파일이 잘렸습니다.";
                    return false;
                }
                float value = 0.0f;
                std::memcpy(&value, &bits, sizeof(value));
                if (!std::isfinite(value)) {
                    if (err) *err = "모델 안의 학습 값이 깨졌습니다.";
                    return false;
                }
                cls.exemplars[e][static_cast<std::size_t>(i)] = value;
            }
        }
        loaded.push_back(std::move(cls));
    }
    if (cursor != bytes.size() - 4) {
        if (err) *err = "모델 파일에 남는 데이터가 있습니다.";
        return false;
    }
    classes_ = std::move(loaded);
    return true;
}

std::string KeywordWorkspace::defaultRoot() { return joinPath(executableDir(), "keyword-workspace"); }

KeywordWorkspace::KeywordWorkspace(std::string root) : root_(std::move(root)) {}

std::string KeywordWorkspace::modelPath() const { return joinPath(root_, "model.kmodel"); }

std::string KeywordWorkspace::samplesDir(const std::string& word) const {
    return joinPath(joinPath(root_, "samples"), word);
}

bool KeywordWorkspace::writeWords(const std::vector<std::string>& words, std::string* err) const {
    std::ostringstream text;
    for (const std::string& word : words) text << word << '\n';
    const std::string body = text.str();
    std::ofstream file(fsPath(joinPath(root_, "words.txt")), std::ios::binary | std::ios::trunc);
    if (!file) {
        if (err) *err = "말 목록을 저장할 수 없습니다.";
        return false;
    }
    file.write(body.data(), static_cast<std::streamsize>(body.size()));
    return static_cast<bool>(file);
}

bool KeywordWorkspace::prepare(std::string* err) {
    std::error_code ec;
    fs::create_directories(fsPath(joinPath(root_, "samples")), ec);
    if (ec) {
        if (err) *err = "학습 폴더를 만들 수 없습니다: " + root_;
        return false;
    }
    std::vector<std::string> list = words();
    if (list.empty()) list = defaultVocabulary();
    for (const std::string& word : list) {
        fs::create_directories(fsPath(samplesDir(word)), ec);
        if (ec) {
            if (err) *err = "말 폴더를 만들 수 없습니다: " + word;
            return false;
        }
    }
    if (!isFile(joinPath(root_, "words.txt"))) return writeWords(list, err);
    return true;
}

std::vector<std::string> KeywordWorkspace::words() const {
    std::vector<std::string> list;
    std::ifstream file(fsPath(joinPath(root_, "words.txt")), std::ios::binary);
    if (!file) return list;
    std::string line;
    while (std::getline(file, line)) {
        line = trimCopy(std::move(line));
        if (line.empty()) continue;
        if (std::find(list.begin(), list.end(), line) == list.end()) list.push_back(std::move(line));
    }
    return list;
}

int KeywordWorkspace::sampleCount(const std::string& word) const {
    const fs::path dir = fsPath(samplesDir(word));
    std::error_code ec;
    if (!fs::is_directory(dir, ec)) return 0;
    int count = 0;
    for (const fs::directory_entry& entry : fs::directory_iterator(dir, ec)) {
        if (ec || !entry.is_regular_file()) continue;
        std::string ext = pathUtf8(entry.path().extension());
        for (char& c : ext) {
            if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
        }
        if (ext == ".wav") ++count;
    }
    return count;
}

bool KeywordWorkspace::addWord(const std::string& word, std::string* err) {
    const std::string trimmed = trimCopy(word);
    if (!validWord(trimmed, err)) return false;
    std::vector<std::string> list = words();
    if (std::find(list.begin(), list.end(), trimmed) != list.end()) {
        if (err) *err = "이미 있는 말입니다.";
        return false;
    }
    std::error_code ec;
    fs::create_directories(fsPath(samplesDir(trimmed)), ec);
    if (ec) {
        if (err) *err = "말 폴더를 만들 수 없습니다.";
        return false;
    }
    list.push_back(trimmed);
    return writeWords(list, err);
}

bool KeywordWorkspace::removeWord(const std::string& word, std::string* err) {
    std::vector<std::string> list = words();
    const auto found = std::find(list.begin(), list.end(), word);
    if (found == list.end()) {
        if (err) *err = "목록에 없는 말입니다.";
        return false;
    }
    list.erase(found);
    std::error_code ec;
    fs::remove_all(fsPath(samplesDir(word)), ec);
    return writeWords(list, err);
}

std::string KeywordWorkspace::allocateSamplePath(const std::string& word) const {
    const fs::path dir = fsPath(samplesDir(word));
    for (int i = 1; i < 10000; ++i) {
        char name[16];
        std::snprintf(name, sizeof(name), "%04d.wav", i);
        const fs::path path = dir / name;
        std::error_code ec;
        if (!fs::exists(path, ec)) return pathUtf8(path);
    }
    return pathUtf8(dir / "9999.wav");
}

bool trainKeywordModel(const KeywordWorkspace& workspace, KeywordModel* model,
                       KeywordTrainReport* report, std::string* err) {
    if (!model) {
        if (err) *err = "모델을 받을 곳이 없습니다.";
        return false;
    }
    KeywordTrainReport local;
    KeywordModel trained;
    for (const std::string& word : workspace.words()) {
        const fs::path dir = fsPath(workspace.samplesDir(word));
        std::error_code ec;
        std::vector<fs::path> files;
        if (fs::is_directory(dir, ec)) {
            for (const fs::directory_entry& entry : fs::directory_iterator(dir, ec)) {
                if (ec || !entry.is_regular_file()) continue;
                std::string ext = pathUtf8(entry.path().extension());
                for (char& c : ext) {
                    if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
                }
                if (ext == ".wav") files.push_back(entry.path());
            }
        }
        std::sort(files.begin(), files.end());
        KeywordClass cls;
        cls.word = word;
        for (const fs::path& file : files) {
            std::vector<std::int16_t> samples;
            std::string readError;
            if (!readWav16Mono(pathUtf8(file), &samples, nullptr, nullptr, kKeywordSampleRate,
                               &readError))
                continue;
            std::array<float, kKeywordFeatDim> features{};
            if (!embedKeyword(samples.data(), samples.size(), features.data())) continue;
            cls.exemplars.push_back(features);
        }
        if (cls.exemplars.empty()) {
            local.skippedWords.push_back(word);
            continue;
        }
        cls.threshold = classThreshold(cls);
        local.samples += static_cast<int>(cls.exemplars.size());
        trained.classes_.push_back(std::move(cls));
    }
    local.words = static_cast<int>(trained.classes_.size());
    if (report) *report = local;
    if (trained.empty()) {
        if (err)
            *err = "학습할 녹음이 없습니다. 말마다 한 번 이상 녹음한 뒤 다시 학습하세요.";
        return false;
    }
    *model = std::move(trained);
    return true;
}

bool captureUtterance(AudioSource& source, std::vector<std::int16_t>* samples, std::string* err,
                      const std::function<void(float rms)>& onLevel, const std::atomic<bool>* cancel) {
    if (!samples) {
        if (err) *err = "녹음을 받을 곳이 없습니다.";
        return false;
    }
    samples->clear();
    if (!source.open(kKeywordSampleRate, err)) return false;

    SpeechSegmenter segmenter;
    std::int16_t chunk[1600];
    std::vector<std::vector<std::int16_t>> ready;
    const auto started = std::chrono::steady_clock::now();
    bool cancelled = false;
    while (ready.empty()) {
        if (cancel && cancel->load()) {
            cancelled = true;
            source.cancel();
            break;
        }
        if (std::chrono::steady_clock::now() - started > std::chrono::seconds(10)) break;
        const int n = source.read(chunk, 1600);
        if (n < 0) {
            source.close();
            if (err) *err = "마이크를 읽지 못했습니다.";
            return false;
        }
        if (n == 0) {
            segmenter.flush(&ready);
            break;
        }
        segmenter.push(chunk, n, &ready);
        if (onLevel) onLevel(segmenter.rms());
        if (!ready.empty()) break;
    }
    source.close();
    if (cancelled) {
        if (err) *err = "녹음을 취소했습니다.";
        return false;
    }
    if (ready.empty()) {
        if (err) *err = "말이 들리지 않았습니다. 마이크를 확인하고 다시 녹음하세요.";
        return false;
    }
    *samples = std::move(ready.front());
    return true;
}

}  // namespace kstt
