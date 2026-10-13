// app/gui/windows/main_window.h
//
// Windows 네이티브 GUI (Win32 + 공용 컨트롤). GTK 판과 똑같이, 이 파일에는 음성
// 인식 로직이 한 줄도 없다. kstt::SttEngine 의 공개 API 만 부르고, 워커 스레드에서
// 올라오는 콜백을 PostMessage 로 UI 스레드에 넘겨 창에 반영할 뿐이다.
//
// GTK4 판(app/gui/gtk4)과 기능은 같다. 이쪽은 MSYS2/GTK 런타임 없이 exe 와
// libvosk.dll 만으로 도는 것이 장점이다.
#pragma once

#include <windows.h>

#include <atomic>
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

class MainWindow {
public:
    explicit MainWindow(HINSTANCE instance);
    ~MainWindow();

    bool create();
    void show(int showCommand);
    HWND handle() const { return window_; }

private:
    static LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam);
    LRESULT handleMessage(UINT message, WPARAM wParam, LPARAM lParam);

    // --- 만들기·배치 ---
    void createControls();
    void layout();
    int scaled(int value) const;

    // --- 동작 ---
    void loadModelAsync();
    void startMicrophone();
    void startWavFile(const std::wstring& path);
    void stopRecognition();
    void prepareKeywords();
    void refreshKeywordList();
    void addKeyword();
    void removeKeyword();
    void recordKeyword();
    void trainKeywords();
    void exportKeywordModel();
    void openKeywordModel();
    void startKeywordSource(const std::shared_ptr<AudioSource>& source);
    bool wantKeyword() const;
    int selectedDeviceId() const;
    std::string selectedKeyword() const;
    void refreshDevices();
    void chooseModelFolder();
    void chooseWavFile();
    void saveTranscript();
    void clearTranscript();
    void maybeRunSmokeFile();

    // --- 표시 ---
    void setStatus(const std::wstring& text, bool isError = false);
    void appendTranscript(const std::wstring& text);
    void setPartial(const std::wstring& text);
    void updateTally();
    void syncButtons();

    HINSTANCE instance_ = nullptr;
    HWND window_ = nullptr;
    HWND modelEdit_ = nullptr;
    HWND vocabEdit_ = nullptr;
    HWND browseButton_ = nullptr;
    HWND loadButton_ = nullptr;
    HWND deviceCombo_ = nullptr;
    HWND refreshButton_ = nullptr;
    HWND startButton_ = nullptr;
    HWND stopButton_ = nullptr;
    HWND wavButton_ = nullptr;
    HWND partialCheck_ = nullptr;
    HWND levelBar_ = nullptr;
    HWND statusLabel_ = nullptr;
    HWND transcriptEdit_ = nullptr;
    HWND clearButton_ = nullptr;
    HWND saveButton_ = nullptr;
    HWND partialLabel_ = nullptr;
    HWND sizeGrip_ = nullptr;
    HWND tallyLabel_ = nullptr;
    HWND keywordLabel_ = nullptr;
    HWND keywordList_ = nullptr;
    HWND keywordEdit_ = nullptr;
    HWND keywordAdd_ = nullptr;
    HWND keywordRemove_ = nullptr;
    HWND keywordRecord_ = nullptr;
    HWND keywordTrain_ = nullptr;
    HWND keywordExport_ = nullptr;
    HWND keywordOpen_ = nullptr;
    HWND keywordCheck_ = nullptr;
    HWND keywordInfo_ = nullptr;
    std::vector<HWND> labels_;

    HFONT font_ = nullptr;
    HBRUSH background_ = nullptr;
    UINT dpi_ = 96;

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
    bool recording_ = false;
    bool training_ = false;
    std::vector<AudioDevice> devices_;
    std::thread loader_;
    bool loading_ = false;
    bool statusIsError_ = false;
    bool smokeStarted_ = false;
    std::map<std::wstring, int> tally_;  // 받은 말마다 몇 번

    // 콜백이 창에 메시지를 보내도 되는 동안만 참. 멈출 때 먼저 내린다.
    std::atomic<bool> accepting_{true};
};

}  // namespace kstt::gui
