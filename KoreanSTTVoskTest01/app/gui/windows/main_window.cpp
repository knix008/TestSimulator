#include "main_window.h"

#include <commctrl.h>
#include <commdlg.h>
#include <shlobj.h>

#include <algorithm>
#include <cmath>

#include "kstt/platform/audio_input.h"
#include "kstt/vocabulary.h"
#include "kstt/wav_file.h"

namespace kstt::gui {
namespace {

// 워커 스레드 → UI 스레드로 넘기는 메시지들
enum : UINT {
    kMsgPartial = WM_APP + 1,  // LPARAM: new std::wstring*
    kMsgFinal,                 // LPARAM: new std::wstring*
    kMsgState,                 // WPARAM: EngineState, LPARAM: new std::wstring*
    kMsgLevel,                 // WPARAM: 0..1000
    kMsgModelLoaded,           // WPARAM: 성공 여부, LPARAM: new std::wstring* (메시지)
    kMsgLast = WM_APP + 9,
};

enum : int {
    kIdModelEdit = 1001,
    kIdVocabEdit,
    kIdBrowse,
    kIdLoad,
    kIdDevice,
    kIdRefresh,
    kIdStart,
    kIdStop,
    kIdWav,
    kIdPartial,
    kIdClear,
    kIdSave,
};

const wchar_t* kWindowClass = L"KsttMainWindow";

std::wstring toWide(const std::string& utf8) {
    if (utf8.empty()) return {};
    const int n = MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()),
                                      nullptr, 0);
    std::wstring out(static_cast<size_t>(n), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), out.data(), n);
    return out;
}

std::string toUtf8(const std::wstring& wide) {
    if (wide.empty()) return {};
    const int n = WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()),
                                      nullptr, 0, nullptr, nullptr);
    std::string out(static_cast<size_t>(n), '\0');
    WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), out.data(), n,
                        nullptr, nullptr);
    return out;
}

std::wstring editText(HWND edit) {
    const int length = GetWindowTextLengthW(edit);
    if (length <= 0) return {};
    std::wstring text(static_cast<size_t>(length), L'\0');
    GetWindowTextW(edit, text.data(), length + 1);
    return text;
}

// 경로에서 마지막 이름만 (상태줄을 짧게 유지하려고)
std::wstring baseName(const std::wstring& path) {
    const size_t cut = path.find_last_of(L"/\\");
    return cut == std::wstring::npos ? path : path.substr(cut + 1);
}

std::wstring timeStamp() {
    SYSTEMTIME now;
    GetLocalTime(&now);
    wchar_t buffer[16];
    swprintf(buffer, 16, L"%02d:%02d:%02d", now.wHour, now.wMinute, now.wSecond);
    return buffer;
}

// 창이 죽은 뒤 도착할 메시지가 들고 있는 문자열을 새지 않게 비운다.
void drainPostedMessages(HWND window) {
    MSG message;
    while (PeekMessageW(&message, window, WM_APP, kMsgLast, PM_REMOVE)) {
        if (message.lParam) delete reinterpret_cast<std::wstring*>(message.lParam);
    }
}

}  // namespace

MainWindow::MainWindow(HINSTANCE instance) : instance_(instance) {
    background_ = GetSysColorBrush(COLOR_BTNFACE);
}

MainWindow::~MainWindow() {
    accepting_ = false;
    engine_.stop();
    if (loader_.joinable()) loader_.join();
    if (font_) DeleteObject(font_);
}

int MainWindow::scaled(int value) const {
    return MulDiv(value, static_cast<int>(dpi_), 96);
}

bool MainWindow::create() {
    WNDCLASSEXW windowClass = {};
    windowClass.cbSize = sizeof(windowClass);
    windowClass.lpfnWndProc = &MainWindow::windowProc;
    windowClass.hInstance = instance_;
    windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    windowClass.hbrBackground = background_;
    windowClass.lpszClassName = kWindowClass;
    // 리소스에 심어 둔 아이콘 (실행 파일·작업 표시줄·창 모두 이것을 쓴다)
    windowClass.hIcon = LoadIconW(instance_, MAKEINTRESOURCEW(1));
    windowClass.hIconSm = LoadIconW(instance_, MAKEINTRESOURCEW(1));
    if (!windowClass.hIcon) windowClass.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
    if (!RegisterClassExW(&windowClass)) return false;

    window_ = CreateWindowExW(0, kWindowClass, L"한국어 음성 인식 (Vosk)",
                              WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 760, 620,
                              nullptr, nullptr, instance_, this);
    return window_ != nullptr;
}

void MainWindow::show(int showCommand) {
    ShowWindow(window_, showCommand);
    UpdateWindow(window_);
}

LRESULT CALLBACK MainWindow::windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    MainWindow* self = nullptr;
    if (message == WM_NCCREATE) {
        auto* create = reinterpret_cast<CREATESTRUCTW*>(lParam);
        self = static_cast<MainWindow*>(create->lpCreateParams);
        self->window_ = window;
        SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
    } else {
        self = reinterpret_cast<MainWindow*>(GetWindowLongPtrW(window, GWLP_USERDATA));
    }
    if (!self) return DefWindowProcW(window, message, wParam, lParam);
    return self->handleMessage(message, wParam, lParam);
}

LRESULT MainWindow::handleMessage(UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
        case WM_CREATE:
            dpi_ = GetDpiForWindow(window_);
            createControls();
            refreshDevices();
            // 모델 경로 기본값: 자동 탐색 결과
            {
                const std::string found = SttEngine::findDefaultModel();
                if (!found.empty()) SetWindowTextW(modelEdit_, toWide(found).c_str());
            }
            syncButtons();
            loadModelAsync();
            return 0;

        case WM_SIZE:
            layout();
            return 0;

        case WM_GETMINMAXINFO: {
            auto* info = reinterpret_cast<MINMAXINFO*>(lParam);
            info->ptMinTrackSize.x = scaled(640);
            info->ptMinTrackSize.y = scaled(460);
            return 0;
        }

        case WM_DPICHANGED: {
            dpi_ = HIWORD(wParam);
            const RECT* suggested = reinterpret_cast<const RECT*>(lParam);
            SetWindowPos(window_, nullptr, suggested->left, suggested->top,
                         suggested->right - suggested->left, suggested->bottom - suggested->top,
                         SWP_NOZORDER | SWP_NOACTIVATE);
            layout();
            return 0;
        }

        case WM_CTLCOLORSTATIC: {
            auto dc = reinterpret_cast<HDC>(wParam);
            const HWND control = reinterpret_cast<HWND>(lParam);
            // 읽기 전용 편집기도 이 메시지를 보낸다. 결과 영역은 읽을 거리라
            // 창 색(보통 흰색)으로 두어 문서처럼 보이게 한다.
            if (control == transcriptEdit_) {
                SetBkColor(dc, GetSysColor(COLOR_WINDOW));
                SetTextColor(dc, GetSysColor(COLOR_WINDOWTEXT));
                return reinterpret_cast<LRESULT>(GetSysColorBrush(COLOR_WINDOW));
            }
            SetBkMode(dc, TRANSPARENT);
            if (control == statusLabel_ && statusIsError_)
                SetTextColor(dc, RGB(176, 0, 32));
            else if (control == partialLabel_)
                SetTextColor(dc, GetSysColor(COLOR_GRAYTEXT));
            else
                SetTextColor(dc, GetSysColor(COLOR_WINDOWTEXT));
            return reinterpret_cast<LRESULT>(background_);
        }

        case WM_COMMAND:
            switch (LOWORD(wParam)) {
                case kIdBrowse: chooseModelFolder(); return 0;
                case kIdLoad: loadModelAsync(); return 0;
                case kIdRefresh: refreshDevices(); return 0;
                case kIdStart: startMicrophone(); return 0;
                case kIdStop: stopRecognition(); return 0;
                case kIdWav: chooseWavFile(); return 0;
                case kIdPartial: {
                    const bool show =
                        SendMessageW(partialCheck_, BM_GETCHECK, 0, 0) == BST_CHECKED;
                    engine_.setPartialMode(show ? PartialMode::Stable : PartialMode::Off);
                    if (!show) setPartial(L"");
                    return 0;
                }
                case kIdClear: clearTranscript(); return 0;
                case kIdSave: saveTranscript(); return 0;
            }
            return 0;

        // ---------------- 워커 스레드에서 온 메시지들 ----------------
        case kMsgPartial: {
            std::unique_ptr<std::wstring> text(reinterpret_cast<std::wstring*>(lParam));
            setPartial(*text);
            return 0;
        }

        case kMsgFinal: {
            std::unique_ptr<std::wstring> text(reinterpret_cast<std::wstring*>(lParam));
            appendTranscript(L"[" + timeStamp() + L"] " + *text + L"\r\n");
            ++tally_[*text];
            updateTally();
            return 0;
        }

        case kMsgLevel:
            SendMessageW(levelBar_, PBM_SETPOS, wParam, 0);
            return 0;

        case kMsgState: {
            std::unique_ptr<std::wstring> text(reinterpret_cast<std::wstring*>(lParam));
            const auto state = static_cast<EngineState>(wParam);
            switch (state) {
                case EngineState::Running:
                    setStatus(L"인식 중 — " + *text);
                    break;
                case EngineState::Ready:
                    setStatus(*text == L"finished" ? L"인식이 끝났습니다." : L"대기 중 (모델 준비됨)");
                    SendMessageW(levelBar_, PBM_SETPOS, 0, 0);
                    setPartial(L"");
                    break;
                case EngineState::Error:
                    setStatus(*text, true);
                    SendMessageW(levelBar_, PBM_SETPOS, 0, 0);
                    break;
                default:
                    break;
            }
            syncButtons();
            return 0;
        }

        case kMsgModelLoaded: {
            std::unique_ptr<std::wstring> text(reinterpret_cast<std::wstring*>(lParam));
            loading_ = false;
            if (wParam) {
                setStatus(*text);
                maybeRunSmokeFile();
            } else {
                setStatus(*text, true);
            }
            syncButtons();
            return 0;
        }

        case WM_CLOSE:
            // 콜백부터 끊고 워커를 합류시킨 뒤, 이미 보내진 메시지를 비운다.
            accepting_ = false;
            engine_.stop();
            if (loader_.joinable()) loader_.join();
            drainPostedMessages(window_);
            DestroyWindow(window_);
            return 0;

        case WM_DESTROY:
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcW(window_, message, wParam, lParam);
}

void MainWindow::createControls() {
    // 시스템 UI 글꼴 (한글이 맑은 고딕으로 제대로 나온다)
    NONCLIENTMETRICSW metrics = {};
    metrics.cbSize = sizeof(metrics);
    if (SystemParametersInfoForDpi(SPI_GETNONCLIENTMETRICS, sizeof(metrics), &metrics, 0, dpi_))
        font_ = CreateFontIndirectW(&metrics.lfMessageFont);
    if (!font_) font_ = static_cast<HFONT>(GetStockObject(DEFAULT_GUI_FONT));

    const auto make = [&](const wchar_t* className, const wchar_t* text, DWORD style, int id) {
        HWND control = CreateWindowExW(0, className, text, WS_CHILD | WS_VISIBLE | style, 0, 0, 0,
                                       0, window_, reinterpret_cast<HMENU>(static_cast<INT_PTR>(id)),
                                       instance_, nullptr);
        SendMessageW(control, WM_SETFONT, reinterpret_cast<WPARAM>(font_), TRUE);
        return control;
    };

    labels_.push_back(make(L"STATIC", L"모델", SS_LEFT | SS_CENTERIMAGE, 0));
    modelEdit_ = make(L"EDIT", L"", WS_BORDER | WS_TABSTOP | ES_AUTOHSCROLL, kIdModelEdit);
    browseButton_ = make(L"BUTTON", L"찾아보기…", WS_TABSTOP | BS_PUSHBUTTON, kIdBrowse);
    loadButton_ = make(L"BUTTON", L"모델 적재", WS_TABSTOP | BS_PUSHBUTTON, kIdLoad);

    labels_.push_back(make(L"STATIC", L"받는 말", SS_LEFT | SS_CENTERIMAGE, 0));
    vocabEdit_ = make(L"EDIT", L"", WS_BORDER | WS_TABSTOP | ES_AUTOHSCROLL, kIdVocabEdit);
    SetWindowTextW(vocabEdit_, toWide(formatVocabulary(defaultVocabulary())).c_str());
    labels_.push_back(make(L"STATIC",
                           L"쉼표로 구분. 비우면 들리는 대로 모두 받아씁니다.",
                           SS_LEFT | SS_CENTERIMAGE, 0));

    labels_.push_back(make(L"STATIC", L"입력", SS_LEFT | SS_CENTERIMAGE, 0));
    deviceCombo_ = make(L"COMBOBOX", L"", WS_TABSTOP | WS_VSCROLL | CBS_DROPDOWNLIST, kIdDevice);
    refreshButton_ = make(L"BUTTON", L"새로 고침", WS_TABSTOP | BS_PUSHBUTTON, kIdRefresh);

    startButton_ = make(L"BUTTON", L"● 인식 시작", WS_TABSTOP | BS_DEFPUSHBUTTON, kIdStart);
    stopButton_ = make(L"BUTTON", L"■ 중지", WS_TABSTOP | BS_PUSHBUTTON, kIdStop);
    wavButton_ = make(L"BUTTON", L"WAV 파일 인식…", WS_TABSTOP | BS_PUSHBUTTON, kIdWav);

    // 진행 중 추측을 보여 줄지. 끄면 확정된 문장만 쌓인다.
    partialCheck_ = make(L"BUTTON", L"진행 중 표시", WS_TABSTOP | BS_AUTOCHECKBOX, kIdPartial);
    SendMessageW(partialCheck_, BM_SETCHECK, BST_CHECKED, 0);

    labels_.push_back(make(L"STATIC", L"입력 레벨", SS_RIGHT | SS_CENTERIMAGE, 0));
    levelBar_ = make(PROGRESS_CLASSW, L"", PBS_SMOOTH, 0);
    SendMessageW(levelBar_, PBM_SETRANGE32, 0, 1000);

    statusLabel_ = make(L"STATIC", L"준비 중…", SS_LEFT | SS_ENDELLIPSIS, 0);

    labels_.push_back(make(L"STATIC", L"인식 결과", SS_LEFT | SS_CENTERIMAGE, 0));
    clearButton_ = make(L"BUTTON", L"지우기", WS_TABSTOP | BS_PUSHBUTTON, kIdClear);
    saveButton_ = make(L"BUTTON", L"저장…", WS_TABSTOP | BS_PUSHBUTTON, kIdSave);
    transcriptEdit_ = make(L"EDIT", L"",
                           WS_BORDER | WS_TABSTOP | WS_VSCROLL | ES_MULTILINE | ES_READONLY |
                               ES_AUTOVSCROLL,
                           0);

    tallyLabel_ = make(L"STATIC", L"", SS_LEFT | SS_CENTERIMAGE, 0);
    partialLabel_ = make(L"STATIC", L"", SS_LEFT | SS_PATHELLIPSIS, 0);

    // --- 엔진 콜백: 워커 스레드에서 불린다 → UI 스레드로 넘긴다 ---
    engine_.onPartial([this](const std::string& text) {
        if (!accepting_.load()) return;
        PostMessageW(window_, kMsgPartial, 0,
                     reinterpret_cast<LPARAM>(new std::wstring(toWide(text))));
    });
    engine_.onFinal([this](const Transcript& result) {
        if (!accepting_.load() || result.text.empty()) return;
        PostMessageW(window_, kMsgFinal, 0,
                     reinterpret_cast<LPARAM>(new std::wstring(toWide(result.text))));
    });
    engine_.onLevel([this](float rms) {
        if (!accepting_.load()) return;
        // RMS 는 작은 값에 몰려 있어 보기 좋게 눌러 펴 준다.
        const double shaped = std::min(1.0, std::sqrt(static_cast<double>(rms)) * 1.6);
        PostMessageW(window_, kMsgLevel, static_cast<WPARAM>(shaped * 1000.0), 0);
    });
    engine_.onState([this](EngineState state, const std::string& message) {
        if (!accepting_.load()) return;
        PostMessageW(window_, kMsgState, static_cast<WPARAM>(state),
                     reinterpret_cast<LPARAM>(new std::wstring(toWide(message))));
    });
}

void MainWindow::layout() {
    RECT client;
    GetClientRect(window_, &client);

    const int margin = scaled(12);
    const int gap = scaled(8);
    const int rowHeight = scaled(26);
    const int labelWidth = scaled(44);
    const int buttonWidth = scaled(96);
    const int right = client.right - margin;

    const auto place = [](HWND control, int x, int y, int w, int h) {
        if (control) MoveWindow(control, x, y, w, h, TRUE);
    };

    int y = margin;

    // 1행: 모델
    int x = margin;
    place(labels_[0], x, y, labelWidth, rowHeight);
    x += labelWidth + gap;
    const int editWidth = right - x - (buttonWidth + gap) * 2;
    place(modelEdit_, x, y, std::max(scaled(80), editWidth), rowHeight);
    x = right - (buttonWidth + gap) - buttonWidth;
    place(browseButton_, x, y, buttonWidth, rowHeight);
    place(loadButton_, right - buttonWidth, y, buttonWidth, rowHeight);
    y += rowHeight + gap;

    // 2행: 받는 말
    x = margin;
    place(labels_[1], x, y, scaled(56), rowHeight);
    x += scaled(56) + gap;
    const int vocabWidth = scaled(220);
    place(vocabEdit_, x, y, vocabWidth, rowHeight);
    x += vocabWidth + gap;
    place(labels_[2], x, y, std::max(scaled(80), right - x), rowHeight);
    y += rowHeight + gap;

    // 3행: 입력 장치
    x = margin;
    place(labels_[3], x, y, labelWidth, rowHeight);
    x += labelWidth + gap;
    // 콤보는 드롭다운 목록 높이까지 포함해 크기를 준다.
    const int comboWidth = right - x - buttonWidth - gap;
    if (deviceCombo_)
        MoveWindow(deviceCombo_, x, y, std::max(scaled(80), comboWidth), rowHeight + scaled(200),
                   TRUE);
    place(refreshButton_, right - buttonWidth, y, buttonWidth, rowHeight);
    y += rowHeight + gap + scaled(4);

    // 3행: 조작 단추 + 레벨
    x = margin;
    const int startWidth = scaled(110);
    const int stopWidth = scaled(80);
    const int wavWidth = scaled(140);
    place(startButton_, x, y, startWidth, rowHeight);
    x += startWidth + gap;
    place(stopButton_, x, y, stopWidth, rowHeight);
    x += stopWidth + gap;
    place(wavButton_, x, y, wavWidth, rowHeight);
    x += wavWidth + gap;
    const int partialWidth = scaled(110);
    place(partialCheck_, x, y, partialWidth, rowHeight);
    x += partialWidth + gap;
    const int levelLabelWidth = scaled(64);
    place(labels_[4], x, y, levelLabelWidth, rowHeight);
    x += levelLabelWidth + gap;
    place(levelBar_, x, y + scaled(6), std::max(scaled(40), right - x), rowHeight - scaled(12));
    y += rowHeight + gap;

    // 4행: 상태
    const int statusHeight = scaled(20);
    place(statusLabel_, margin, y, right - margin, statusHeight);
    y += statusHeight + gap;

    // 5행: 인식 결과 머리말 + 단추
    const int smallButton = scaled(72);
    place(labels_[5], margin, y, scaled(80), rowHeight);
    place(tallyLabel_, margin + scaled(84), y, right - margin - scaled(240), rowHeight);
    place(clearButton_, right - smallButton * 2 - gap, y, smallButton, rowHeight);
    place(saveButton_, right - smallButton, y, smallButton, rowHeight);
    y += rowHeight + scaled(4);

    // 6행: 결과 + 진행 중 한 줄
    const int partialHeight = scaled(20);
    const int editHeight = client.bottom - margin - partialHeight - gap - y;
    place(transcriptEdit_, margin, y, right - margin, std::max(scaled(60), editHeight));
    place(partialLabel_, margin, client.bottom - margin - partialHeight, right - margin,
          partialHeight);
}

void MainWindow::loadModelAsync() {
    if (loading_ || engine_.isRunning()) return;
    if (loader_.joinable()) loader_.join();

    EngineConfig config;
    config.modelPath = toUtf8(editText(modelEdit_));
    config.vocabulary = parseVocabulary(toUtf8(editText(vocabEdit_)));

    loading_ = true;
    setStatus(L"모델을 적재합니다… (수 초 걸릴 수 있습니다)");
    syncButtons();

    loader_ = std::thread([this, config] {
        std::string err;
        const bool ok = engine_.loadModel(config, &err);
        const std::wstring modelPath = toWide(engine_.config().modelPath);
        const std::wstring libPath = toWide(engine_.voskLibraryPath());
        if (!accepting_.load()) return;

        std::wstring message;
        if (ok) {
            SetWindowTextW(modelEdit_, modelPath.c_str());
            message = L"준비됨 · 모델 " + baseName(modelPath) + L" · " + baseName(libPath);
        } else {
            message = toWide(err);
        }
        PostMessageW(window_, kMsgModelLoaded, ok ? 1 : 0,
                     reinterpret_cast<LPARAM>(new std::wstring(message)));
    });
}

void MainWindow::startMicrophone() {
    if (!engine_.isModelLoaded()) {
        setStatus(L"먼저 모델을 적재하세요.", true);
        return;
    }
    engine_.setVocabulary(parseVocabulary(toUtf8(editText(vocabEdit_))));
    const int selected = static_cast<int>(SendMessageW(deviceCombo_, CB_GETCURSEL, 0, 0));
    int deviceId = -1;
    if (selected >= 0 && static_cast<size_t>(selected) < devices_.size())
        deviceId = devices_[static_cast<size_t>(selected)].id;

    std::string err;
    if (!engine_.start(platform::createMicrophone(deviceId), &err)) {
        const std::wstring message = toWide(err);
        setStatus(message, true);
        MessageBoxW(window_, (L"마이크를 열 수 없습니다.\n\n" + message).c_str(),
                    L"한국어 음성 인식", MB_OK | MB_ICONWARNING);
        return;
    }
    syncButtons();
}

void MainWindow::startWavFile(const std::wstring& path) {
    if (!engine_.isModelLoaded()) {
        setStatus(L"먼저 모델을 적재하세요.", true);
        return;
    }
    engine_.setVocabulary(parseVocabulary(toUtf8(editText(vocabEdit_))));
    std::string err;
    if (!engine_.start(std::make_shared<WavFileSource>(toUtf8(path)), &err)) {
        const std::wstring message = toWide(err);
        setStatus(message, true);
        MessageBoxW(window_, (L"WAV 파일을 인식할 수 없습니다.\n\n" + message).c_str(),
                    L"한국어 음성 인식", MB_OK | MB_ICONWARNING);
        return;
    }
    appendTranscript(L"── " + path + L" ──\r\n");
    syncButtons();
}

void MainWindow::stopRecognition() {
    if (!engine_.isRunning()) return;
    setStatus(L"중지 중…");
    engine_.stop();
    syncButtons();
}

void MainWindow::refreshDevices() {
    devices_ = platform::inputDevices();
    SendMessageW(deviceCombo_, CB_RESETCONTENT, 0, 0);
    for (const AudioDevice& device : devices_) {
        SendMessageW(deviceCombo_, CB_ADDSTRING, 0,
                     reinterpret_cast<LPARAM>(toWide(device.name).c_str()));
    }
    if (!devices_.empty()) SendMessageW(deviceCombo_, CB_SETCURSEL, 0, 0);
}

void MainWindow::chooseModelFolder() {
    wchar_t folder[MAX_PATH] = {0};
    BROWSEINFOW info = {};
    info.hwndOwner = window_;
    info.lpszTitle = L"Vosk 모델 디렉터리 선택";
    info.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;
    PIDLIST_ABSOLUTE id = SHBrowseForFolderW(&info);
    if (!id) return;
    const bool ok = SHGetPathFromIDListW(id, folder) != FALSE;
    CoTaskMemFree(id);
    if (!ok) return;
    SetWindowTextW(modelEdit_, folder);
    loadModelAsync();
}

void MainWindow::chooseWavFile() {
    wchar_t path[MAX_PATH] = {0};
    OPENFILENAMEW dialog = {};
    dialog.lStructSize = sizeof(dialog);
    dialog.hwndOwner = window_;
    dialog.lpstrFilter = L"WAV 음원 (16비트 PCM)\0*.wav\0모든 파일\0*.*\0";
    dialog.lpstrFile = path;
    dialog.nMaxFile = MAX_PATH;
    dialog.lpstrTitle = L"인식할 WAV 파일 선택";
    dialog.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    if (GetOpenFileNameW(&dialog)) startWavFile(path);
}

void MainWindow::saveTranscript() {
    wchar_t path[MAX_PATH] = L"인식결과.txt";
    OPENFILENAMEW dialog = {};
    dialog.lStructSize = sizeof(dialog);
    dialog.hwndOwner = window_;
    dialog.lpstrFilter = L"텍스트 파일\0*.txt\0모든 파일\0*.*\0";
    dialog.lpstrFile = path;
    dialog.nMaxFile = MAX_PATH;
    dialog.lpstrDefExt = L"txt";
    dialog.lpstrTitle = L"인식 결과 저장";
    dialog.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    if (!GetSaveFileNameW(&dialog)) return;

    const std::string utf8 = toUtf8(editText(transcriptEdit_));
    HANDLE file = CreateFileW(path, GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                              FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) {
        setStatus(L"저장할 수 없습니다: " + std::wstring(path), true);
        return;
    }
    // 메모장에서도 한글이 깨지지 않도록 UTF-8 BOM 을 붙인다.
    const unsigned char bom[3] = {0xEF, 0xBB, 0xBF};
    DWORD written = 0;
    WriteFile(file, bom, 3, &written, nullptr);
    WriteFile(file, utf8.data(), static_cast<DWORD>(utf8.size()), &written, nullptr);
    CloseHandle(file);
    setStatus(L"저장했습니다: " + std::wstring(path));
}

void MainWindow::clearTranscript() {
    SetWindowTextW(transcriptEdit_, L"");
    setPartial(L"");
    tally_.clear();
    updateTally();
}

// 받은 말마다 몇 번씩 들렸는지 — "출근 2회 · 퇴근 1회"
void MainWindow::updateTally() {
    std::wstring text;
    for (const auto& [word, count] : tally_) {
        if (!text.empty()) text += L" · ";
        text += word + L" " + std::to_wstring(count) + L"회";
    }
    SetWindowTextW(tallyLabel_, text.c_str());
}

void MainWindow::maybeRunSmokeFile() {
    // KSTT_SMOKE_WAV 가 가리키는 WAV 를 모델 적재 직후 자동으로 인식한다.
    // GUI 를 손으로 누르지 않고도 인식 경로 전체를 확인하려고 둔 점검용 통로다.
    wchar_t path[MAX_PATH] = {0};
    if (smokeStarted_) return;
    if (GetEnvironmentVariableW(L"KSTT_SMOKE_WAV", path, MAX_PATH) == 0) return;
    smokeStarted_ = true;
    startWavFile(path);
}

void MainWindow::setStatus(const std::wstring& text, bool isError) {
    statusIsError_ = isError;
    SetWindowTextW(statusLabel_, text.c_str());
    InvalidateRect(statusLabel_, nullptr, TRUE);
}

void MainWindow::appendTranscript(const std::wstring& text) {
    const int length = GetWindowTextLengthW(transcriptEdit_);
    SendMessageW(transcriptEdit_, EM_SETSEL, static_cast<WPARAM>(length),
                 static_cast<LPARAM>(length));
    SendMessageW(transcriptEdit_, EM_REPLACESEL, FALSE, reinterpret_cast<LPARAM>(text.c_str()));
    SendMessageW(transcriptEdit_, EM_SCROLLCARET, 0, 0);
}

void MainWindow::setPartial(const std::wstring& text) {
    SetWindowTextW(partialLabel_, text.empty() ? L"" : (L"… " + text).c_str());
}

void MainWindow::syncButtons() {
    const bool running = engine_.isRunning();
    const bool ready = engine_.isModelLoaded() && !loading_;

    EnableWindow(startButton_, ready && !running);
    EnableWindow(stopButton_, running);
    EnableWindow(wavButton_, ready && !running);
    EnableWindow(loadButton_, !loading_ && !running);
    EnableWindow(browseButton_, !loading_ && !running);
    EnableWindow(modelEdit_, !loading_ && !running);
    EnableWindow(vocabEdit_, !loading_ && !running);
    EnableWindow(deviceCombo_, !running);
}

}  // namespace kstt::gui
