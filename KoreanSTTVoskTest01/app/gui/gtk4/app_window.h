// app/gtk4/app_window.h
//
// GTK4 주 창. 이 파일(과 app_window.cpp)에는 음성 인식 로직이 전혀 없다. 창은
// kstt::SttEngine 의 공개 API 만 부르고, 엔진이 워커 스레드에서 올려주는 콜백을
// GTK 주 루프로 넘겨 위젯에 반영하는 일만 한다.
#pragma once

#include <gtk/gtk.h>

#include <atomic>
#include <map>
#include <functional>
#include <memory>
#include <string>
#include <thread>
#include <vector>

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
    GtkWidget* buildControls();
    GtkWidget* buildTranscript();

    // --- 동작 ---
    void loadModelAsync();
    void startMicrophone();
    void startWavFile(const std::string& path);
    void stopRecognition();
    void refreshDevices();
    void chooseModelFolder();
    void chooseWavFile();
    void saveTranscript();
    void clearTranscript();
    void maybeRunSmokeFile();

    // --- 표시 갱신 ---
    void setStatus(const std::string& text, bool isError = false);
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
    GtkWidget* partialLabel_ = nullptr;
    GtkWidget* tallyLabel_ = nullptr;
    GtkWidget* spinner_ = nullptr;
    GtkTextBuffer* transcriptBuffer_ = nullptr;
    GtkWidget* transcriptView_ = nullptr;

    SttEngine engine_;
    std::vector<AudioDevice> devices_;
    std::thread loader_;
    bool loading_ = false;
    bool smokeStarted_ = false;
    std::map<std::string, int> tally_;  // 받은 말마다 몇 번

    // 콜백이 떠 있는 동안 창이 사라져도 안전하도록 쓰는 생존 표식
    std::shared_ptr<std::atomic<bool>> alive_ = std::make_shared<std::atomic<bool>>(true);
};

}  // namespace kstt::gui
