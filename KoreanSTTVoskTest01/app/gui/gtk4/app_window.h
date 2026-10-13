// app/gtk4/app_window.h
//
// GTK4 주 창. 이 파일(과 app_window.cpp)에는 음성 인식 로직이 전혀 없다. 창은
// kstt::SttEngine 의 공개 API 만 부르고, 엔진이 워커 스레드에서 올려주는 콜백을
// GTK 주 루프로 넘겨 위젯에 반영하는 일만 한다.
#pragma once

#include <gtk/gtk.h>

#include <atomic>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "kstt/audio_source.h"
#include "kstt/keyword_listener.h"
#include "kstt/keyword_model.h"
#include "kstt/stt_engine.h"
#include "kstt/types.h"

namespace kstt::gui {

class AppWindow {
public:
    explicit AppWindow(GtkApplication* app);
    ~AppWindow();

    void present();

private:
    // --- 위젯 만들기 ---
    GtkWidget* buildSettings();
    GtkWidget* buildKeywords();
    GtkWidget* buildControls();
    GtkWidget* buildTranscript();

    // --- 동작 ---
    void loadModelAsync();
    void startMicrophone();
    void startWavFile(const std::string& path);
    void stopRecognition();
    void prepareKeywords();
    void refreshKeywordList();
    void fitKeywordList();
    void addKeyword();
    void removeKeyword();
    void moveKeyword(int delta);
    void recordKeyword();
    void importKeywordFiles();
    void pollSampleCounts();
    void trainKeywords();
    void resetKeywordTraining();
    void exportKeywordModel();
    void openKeywordModel();
    void startKeywordSource(const std::shared_ptr<AudioSource>& source);
    void adoptTrainedModel();
    void onKeywordToggled();
    bool wantKeyword() const;
    int selectedDeviceId() const;
    std::string selectedKeyword() const;
    void refreshDevices();
    void chooseModelFolder();
    void chooseWavFile();
    void saveTranscript();
    void writeReport();
    void clearTranscript();
    void maybeRunSmokeFile();

    // --- 표시 갱신 ---
    void setStatus(const std::string& text, bool isError = false);
    void setResourceMonitor(bool on);
    bool sampleProcessCpu(double* percent);
    bool sampleProcessMemory(unsigned long long* bytes);
    bool sampleCpuClock();
    unsigned logicalCoreCount();
    unsigned physicalCoreCount();
    std::string buildReport();
    void updateResourceLabel();
    void appendFinal(const Transcript& result);
    void setPartial(const std::string& text);
    void updateTally();
    void syncButtons();

    // 워커 스레드에서 온 일을 GTK 주 루프로 넘긴다.
    void postToMain(std::function<void()> work);

    GtkApplication* app_ = nullptr;
    GtkWidget* window_ = nullptr;
    GtkWidget* modelEntry_ = nullptr;
    GtkWidget* vocabEntry_ = nullptr;
    GtkWidget* deviceDropdown_ = nullptr;
    GtkWidget* startButton_ = nullptr;
    GtkWidget* stopButton_ = nullptr;
    GtkWidget* wavButton_ = nullptr;
    GtkWidget* partialCheck_ = nullptr;
    GtkWidget* reloadButton_ = nullptr;
    GtkWidget* levelBar_ = nullptr;
    GtkWidget* statusLabel_ = nullptr;
    GtkWidget* statusMemLabel_ = nullptr;
    GtkWidget* cpuLabel_ = nullptr;
    GtkWidget* statusCoresLabel_ = nullptr;
    GtkWidget* statusClockLabel_ = nullptr;
    unsigned cpuTimer_ = 0;
    bool cpuMonitor_ = false;
    bool cpuHaveSample_ = false;
    bool lastCpuValid_ = false;
    std::uint64_t cpuWallNs_ = 0;
    std::uint64_t cpuProcNs_ = 0;
    std::uint64_t resourceStartMs_ = 0;
    unsigned logicalCores_ = 0;
    unsigned physicalCores_ = 0;
    bool physicalCoresKnown_ = false;
    int resourceSamples_ = 0;
    double cpuSum_ = 0.0;
    double cpuPeak_ = 0.0;
    double lastCpuPercent_ = 0.0;
    double lastCoresUsed_ = 0.0;
    double coresUsedPeak_ = 0.0;
    unsigned long long lastWorkingSet_ = 0;
    unsigned long long lastPeakWorkingSet_ = 0;
    unsigned long long lastPrivateBytes_ = 0;
    unsigned long long memorySessionPeak_ = 0;
    unsigned long long lastCurrentHz_ = 0;
    unsigned long long lastLowestHz_ = 0;
    unsigned long long lastMaxHz_ = 0;
    unsigned long long clockPeakHz_ = 0;
    std::string pendingReport_;
    GtkWidget* partialLabel_ = nullptr;
    GtkWidget* tallyLabel_ = nullptr;
    GtkWidget* spinner_ = nullptr;
    GtkTextBuffer* transcriptBuffer_ = nullptr;
    GtkWidget* transcriptView_ = nullptr;
    GtkWidget* keywordList_ = nullptr;
    GtkWidget* keywordScroller_ = nullptr;
    GtkWidget* keywordEntry_ = nullptr;
    GtkWidget* keywordAdd_ = nullptr;
    GtkWidget* keywordRemove_ = nullptr;
    GtkWidget* keywordUp_ = nullptr;
    GtkWidget* keywordDown_ = nullptr;
    GtkWidget* keywordRecord_ = nullptr;
    GtkWidget* keywordImport_ = nullptr;
    GtkWidget* keywordTrain_ = nullptr;
    GtkWidget* keywordReset_ = nullptr;
    GtkWidget* keywordExport_ = nullptr;
    GtkWidget* keywordOpen_ = nullptr;
    GtkWidget* keywordCheck_ = nullptr;
    GtkWidget* keywordInfo_ = nullptr;

    SttEngine engine_;
    KeywordWorkspace workspace_{KeywordWorkspace::defaultRoot()};
    KeywordModel keywordModel_;
    KeywordListener keywordListener_;
    std::thread recordThread_;
    std::thread trainThread_;
    std::shared_ptr<AudioSource> captureSource_;
    std::mutex captureMutex_;
    std::atomic<bool> recordCancel_{false};
    bool keywordReady_ = false;
    std::string sampleWatch_;
    bool suppressKeywordToggle_ = false;
    bool recording_ = false;
    bool training_ = false;
    std::vector<AudioDevice> devices_;
    std::thread loader_;
    bool loading_ = false;
    bool smokeStarted_ = false;
    std::map<std::string, int> tally_;  // 받은 말마다 몇 번

    // 콜백이 떠 있는 동안 창이 사라져도 안전하도록 쓰는 생존 표식
    std::shared_ptr<std::atomic<bool>> alive_ = std::make_shared<std::atomic<bool>>(true);
};

}  // namespace kstt::gui
