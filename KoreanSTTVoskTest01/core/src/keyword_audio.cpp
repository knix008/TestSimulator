#include "keyword_audio.h"

#include <algorithm>
#include <cmath>
#include <cstddef>

namespace kstt {
namespace {

constexpr float kPi = 3.14159265358979323846f;
constexpr int kFrame = 400;  // 25ms @ 16kHz
constexpr int kHop = 160;    // 10ms
constexpr int kFft = 512;
constexpr int kMel = 26;
constexpr int kHopSamples = 320;  // 말 경계는 20ms 단위
constexpr int kPreRoll = 1600;
constexpr int kMinSpeech = 3200;
constexpr int kTrailSilence = 6400;
constexpr int kKeepTail = 800;
constexpr int kMaxSpeech = 16000 * 3;

void fft(float* re, float* im) {
    for (int i = 1, j = 0; i < kFft; ++i) {
        int bit = kFft >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            std::swap(re[i], re[j]);
            std::swap(im[i], im[j]);
        }
    }
    for (int len = 2; len <= kFft; len <<= 1) {
        const float angle = -2.0f * kPi / static_cast<float>(len);
        const float wlenRe = std::cos(angle);
        const float wlenIm = std::sin(angle);
        for (int i = 0; i < kFft; i += len) {
            float wRe = 1.0f;
            float wIm = 0.0f;
            for (int j = 0; j < len / 2; ++j) {
                const float uRe = re[i + j];
                const float uIm = im[i + j];
                const int v = i + j + len / 2;
                const float vRe = re[v] * wRe - im[v] * wIm;
                const float vIm = re[v] * wIm + im[v] * wRe;
                re[i + j] = uRe + vRe;
                im[i + j] = uIm + vIm;
                re[v] = uRe - vRe;
                im[v] = uIm - vIm;
                const float nextRe = wRe * wlenRe - wIm * wlenIm;
                wIm = wRe * wlenIm + wIm * wlenRe;
                wRe = nextRe;
            }
        }
    }
}

float hzToMel(float hz) { return 2595.0f * std::log10(1.0f + hz / 700.0f); }

float melToHz(float mel) { return 700.0f * (std::pow(10.0f, mel / 2595.0f) - 1.0f); }

const std::vector<float>& melWeights() {
    static const std::vector<float> weights = [] {
        constexpr int bins = kFft / 2 + 1;
        std::vector<float> edge(static_cast<std::size_t>(kMel + 2));
        const float melMin = hzToMel(0.0f);
        const float melMax = hzToMel(static_cast<float>(kKeywordSampleRate) / 2.0f);
        for (int i = 0; i < kMel + 2; ++i) {
            const float mel = melMin + (melMax - melMin) * static_cast<float>(i) / (kMel + 1);
            edge[static_cast<std::size_t>(i)] =
                melToHz(mel) / static_cast<float>(kKeywordSampleRate) * kFft;
        }
        std::vector<float> w(static_cast<std::size_t>(kMel * bins), 0.0f);
        for (int m = 0; m < kMel; ++m) {
            const float left = edge[static_cast<std::size_t>(m)];
            const float mid = edge[static_cast<std::size_t>(m + 1)];
            const float right = edge[static_cast<std::size_t>(m + 2)];
            for (int k = 0; k < bins; ++k) {
                const float bin = static_cast<float>(k);
                float weight = 0.0f;
                if (bin >= left && bin <= mid && mid > left)
                    weight = (bin - left) / (mid - left);
                else if (bin >= mid && bin <= right && right > mid)
                    weight = (right - bin) / (right - mid);
                w[static_cast<std::size_t>(m * bins + k)] = weight;
            }
        }
        return w;
    }();
    return weights;
}

float rmsOf(const std::int16_t* samples, int count) {
    if (count <= 0) return 0.0f;
    double sum = 0.0;
    for (int i = 0; i < count; ++i) {
        const double v = static_cast<double>(samples[i]) / 32768.0;
        sum += v * v;
    }
    return static_cast<float>(std::sqrt(sum / count));
}

}  // namespace

bool embedKeyword(const std::int16_t* samples, std::size_t count, float out[kKeywordFeatDim]) {
    if (!samples || count < static_cast<std::size_t>(kFrame) || !out) return false;

    std::vector<float> wave(count);
    for (std::size_t i = 0; i < count; ++i)
        wave[i] = static_cast<float>(samples[i]) / 32768.0f;
    for (std::size_t i = wave.size(); i-- > 1;) wave[i] -= 0.97f * wave[i - 1];

    const int nFrames = 1 + (static_cast<int>(wave.size()) - kFrame) / kHop;
    if (nFrames < 4) return false;

    float window[kFrame];
    for (int i = 0; i < kFrame; ++i)
        window[i] = 0.54f - 0.46f * std::cos(2.0f * kPi * static_cast<float>(i) / (kFrame - 1));

    const std::vector<float>& mel = melWeights();
    constexpr int bins = kFft / 2 + 1;
    constexpr int kSlices = 4;
    static_assert(kSlices * kMel == kKeywordFeatDim, "특징 차원이 시간 조각과 맞지 않습니다");
    struct Frame {
        float band[kMel];
        float energy;
    };
    std::vector<Frame> frames(static_cast<std::size_t>(nFrames));

    float re[kFft];
    float im[kFft];
    for (int f = 0; f < nFrames; ++f) {
        const float* src = wave.data() + static_cast<std::size_t>(f * kHop);
        double energy = 0.0;
        for (int i = 0; i < kFft; ++i) {
            re[i] = 0.0f;
            im[i] = 0.0f;
        }
        for (int i = 0; i < kFrame; ++i) {
            energy += static_cast<double>(src[i]) * src[i];
            re[i] = src[i] * window[i];
        }
        fft(re, im);
        Frame& frame = frames[static_cast<std::size_t>(f)];
        frame.energy = static_cast<float>(energy / kFrame);
        double bandMean = 0.0;
        for (int m = 0; m < kMel; ++m) {
            double acc = 0.0;
            const float* row = mel.data() + static_cast<std::size_t>(m * bins);
            for (int k = 0; k < bins; ++k)
                acc += static_cast<double>(row[k]) * (re[k] * re[k] + im[k] * im[k]);
            frame.band[m] = std::log(std::max(acc, 1e-10));
            bandMean += frame.band[m];
        }
        bandMean /= kMel;
        // 마이크 크기·거리는 빼고, 어느 띠가 큰지만 남긴다.
        for (int m = 0; m < kMel; ++m)
            frame.band[m] = static_cast<float>(frame.band[m] - bandMean);
    }

    float maxEnergy = 0.0f;
    for (const Frame& frame : frames) maxEnergy = std::max(maxEnergy, frame.energy);
    if (maxEnergy < 1e-8f) return false;
    const float cut = maxEnergy * 0.08f;
    int begin = 0;
    int end = nFrames;
    while (begin < end && frames[static_cast<std::size_t>(begin)].energy < cut) ++begin;
    while (end > begin && frames[static_cast<std::size_t>(end - 1)].energy < cut) --end;
    const int n = end - begin;
    if (n < 4) return false;

    for (int i = 0; i < kKeywordFeatDim; ++i) out[i] = 0.0f;
    int sliceCount[kSlices] = {};
    for (int i = 0; i < n; ++i) {
        const int slice = std::min(kSlices - 1, i * kSlices / n);
        ++sliceCount[slice];
        float* dest = out + slice * kMel;
        const float* band = frames[static_cast<std::size_t>(begin + i)].band;
        for (int m = 0; m < kMel; ++m) dest[m] += band[m];
    }
    for (int slice = 0; slice < kSlices; ++slice) {
        if (sliceCount[slice] <= 0) continue;
        float* dest = out + slice * kMel;
        for (int m = 0; m < kMel; ++m)
            dest[m] /= static_cast<float>(sliceCount[slice]);
    }

    double norm = 0.0;
    for (int i = 0; i < kKeywordFeatDim; ++i) norm += static_cast<double>(out[i]) * out[i];
    norm = std::sqrt(norm);
    if (norm < 1e-6) return false;
    for (int i = 0; i < kKeywordFeatDim; ++i)
        out[i] = static_cast<float>(static_cast<double>(out[i]) / norm);
    return true;
}

void SpeechSegmenter::push(const std::int16_t* data, int count,
                           std::vector<std::vector<std::int16_t>>* ready) {
    if (!data || count <= 0 || !ready) return;
    pending_.insert(pending_.end(), data, data + count);
    while (static_cast<int>(pending_.size()) >= kHopSamples) {
        consumeHop(pending_.data(), kHopSamples, ready);
        pending_.erase(pending_.begin(), pending_.begin() + kHopSamples);
    }
}

void SpeechSegmenter::flush(std::vector<std::vector<std::int16_t>>* ready) {
    if (!ready) return;
    if (inSpeech_ && !pending_.empty()) {
        buffer_.insert(buffer_.end(), pending_.begin(), pending_.end());
        speechSamples_ += static_cast<int>(pending_.size());
    }
    pending_.clear();
    if (inSpeech_ && speechSamples_ >= kMinSpeech) emit(ready);
    inSpeech_ = false;
    speechSamples_ = 0;
    silenceSamples_ = 0;
    buffer_.clear();
}

void SpeechSegmenter::consumeHop(const std::int16_t* frame, int count,
                                 std::vector<std::vector<std::int16_t>>* ready) {
    rms_ = rmsOf(frame, count);
    const float threshold = std::max(0.012f, std::min(0.08f, noise_ * 2.8f));
    const bool voiced = rms_ >= threshold;
    if (!inSpeech_) {
        if (!voiced) {
            noise_ = std::min(0.05f, noise_ * 0.95f + rms_ * 0.05f);
            buffer_.insert(buffer_.end(), frame, frame + count);
            if (static_cast<int>(buffer_.size()) > kPreRoll) {
                buffer_.erase(buffer_.begin(),
                              buffer_.begin() + (static_cast<int>(buffer_.size()) - kPreRoll));
            }
            return;
        }
        inSpeech_ = true;
        speechSamples_ = 0;
        silenceSamples_ = 0;
    }
    buffer_.insert(buffer_.end(), frame, frame + count);
    if (voiced) {
        speechSamples_ += count;
        silenceSamples_ = 0;
    } else {
        silenceSamples_ += count;
    }
    const bool longEnough = speechSamples_ >= kMinSpeech;
    const bool ended = longEnough && silenceSamples_ >= kTrailSilence;
    const bool tooLong = speechSamples_ >= kMaxSpeech;
    if (ended || tooLong) emit(ready);
}

void SpeechSegmenter::emit(std::vector<std::vector<std::int16_t>>* ready) {
    int drop = silenceSamples_ - kKeepTail;
    if (drop < 0) drop = 0;
    if (drop > static_cast<int>(buffer_.size())) drop = static_cast<int>(buffer_.size());
    buffer_.resize(buffer_.size() - static_cast<std::size_t>(drop));
    if (static_cast<int>(buffer_.size()) >= kMinSpeech) ready->push_back(std::move(buffer_));
    buffer_.clear();
    inSpeech_ = false;
    speechSamples_ = 0;
    silenceSamples_ = 0;
}

}  // namespace kstt
