#include "main_window.h"

#include <commctrl.h>
#include <commdlg.h>
#include <psapi.h>
#include <shlobj.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <filesystem>

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
    kMsgRecordDone,            // WPARAM: 성공 여부, LPARAM: new std::wstring*
    kMsgTrainDone,             // WPARAM: 성공 여부, LPARAM: new std::wstring*
    kMsgKeywordState,          // WPARAM: 1 듣는 중, 2 끝, 3 오류. LPARAM: new std::wstring*
    kMsgLast = WM_APP + 12,
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
    kIdKeywordList = 1100,
    kIdKeywordEdit,
    kIdKeywordAdd,
    kIdKeywordRemove,
    kIdKeywordRecord,
    kIdKeywordTrain,
    kIdKeywordExport,
    kIdKeywordOpen,
    kIdKeywordUse,
};

const wchar_t* kWindowClass = L"KsttMainWindow";
constexpr UINT_PTR kCpuTimerId = 1;
const wchar_t* kSizeGripClass = L"KsttSizeGrip";

// 우측 하단의 크기 조절 표시. 창 배경과 구분되는 점으로 그리고, 누르면
// 창의 오른쪽 아래 모서리를 끄는 것과 같게 동작한다.
LRESULT CALLBACK sizeGripProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
        case WM_ERASEBKGND:
            return 1;
        case WM_PAINT: {
            PAINTSTRUCT paint;
            HDC dc = BeginPaint(window, &paint);
            RECT rect;
            GetClientRect(window, &rect);
            FillRect(dc, &rect, GetSysColorBrush(COLOR_BTNFACE));

            const int rows = 4;
            const int span = std::min(rect.right, rect.bottom);
            const int step = std::max(4, (span - 2) / (rows + 1));
            const int dot = std::max(2, step * 2 / 3);
            const COLORREF face = GetSysColor(COLOR_BTNFACE);
            const int luminance = GetRValue(face) * 3 + GetGValue(face) * 6 + GetBValue(face);
            const COLORREF shadow = luminance > 380 ? RGB(55, 55, 55) : RGB(240, 240, 240);
            const COLORREF highlight = luminance > 380 ? RGB(255, 255, 255) : RGB(20, 20, 20);
            HBRUSH shadowBrush = CreateSolidBrush(shadow);
            HBRUSH highlightBrush = CreateSolidBrush(highlight);
            for (int row = 0; row < rows; ++row) {
                for (int col = 0; col <= row; ++col) {
                    const int x = rect.right - step * (row - col + 1);
                    const int y = rect.bottom - step * (col + 1);
                    RECT light{x + 1, y + 1, x + 1 + dot, y + 1 + dot};
                    RECT mark{x, y, x + dot, y + dot};
                    FillRect(dc, &light, highlightBrush);
                    FillRect(dc, &mark, shadowBrush);
                }
            }
            DeleteObject(highlightBrush);
            DeleteObject(shadowBrush);
            EndPaint(window, &paint);
            return 0;
        }
        case WM_SETCURSOR:
            SetCursor(LoadCursorW(nullptr, IDC_SIZENWSE));
            return TRUE;
        case WM_LBUTTONDOWN: {
            POINT point;
            GetCursorPos(&point);
            ReleaseCapture();
            SendMessageW(GetParent(window), WM_NCLBUTTONDOWN, HTBOTTOMRIGHT,
                         MAKELPARAM(point.x, point.y));
            return 0;
        }
        default:
            return DefWindowProcW(window, message, wParam, lParam);
    }
}

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

std::wstring formatByteSize(std::uintmax_t bytes) {
    wchar_t buffer[80];
    if (bytes < 1024) {
        swprintf(buffer, 80, L"%llu 바이트", static_cast<unsigned long long>(bytes));
    } else if (bytes < 1024ull * 1024ull) {
        swprintf(buffer, 80, L"%.1f KB (%llu 바이트)",
                 static_cast<double>(bytes) / 1024.0, static_cast<unsigned long long>(bytes));
    } else {
        swprintf(buffer, 80, L"%.2f MB (%llu 바이트)",
                 static_cast<double>(bytes) / (1024.0 * 1024.0),
                 static_cast<unsigned long long>(bytes));
    }
    return buffer;
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
    recordCancel_.store(true);
    engine_.stop();
    keywordListener_.stop();
    if (loader_.joinable()) loader_.join();
    if (recordThread_.joinable()) recordThread_.join();
    if (trainThread_.joinable()) trainThread_.join();
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

    WNDCLASSW gripClass = {};
    gripClass.lpfnWndProc = sizeGripProc;
    gripClass.hInstance = instance_;
    gripClass.hCursor = LoadCursorW(nullptr, IDC_SIZENWSE);
    gripClass.hbrBackground = background_;
    gripClass.lpszClassName = kSizeGripClass;
    RegisterClassW(&gripClass);

    window_ = CreateWindowExW(0, kWindowClass, L"한국어 음성 인식 (Vosk)",
                              WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 820, 780,
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
            prepareKeywords();
            loadModelAsync();
            return 0;

        case WM_SIZE:
            layout();
            return 0;

        case WM_GETMINMAXINFO: {
            auto* info = reinterpret_cast<MINMAXINFO*>(lParam);
            info->ptMinTrackSize.x = scaled(720);
            info->ptMinTrackSize.y = scaled(640);
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
                case kIdKeywordAdd: addKeyword(); return 0;
                case kIdKeywordRemove: removeKeyword(); return 0;
                case kIdKeywordRecord: recordKeyword(); return 0;
                case kIdKeywordTrain: trainKeywords(); return 0;
                case kIdKeywordExport: exportKeywordModel(); return 0;
                case kIdKeywordOpen: openKeywordModel(); return 0;
                case kIdKeywordUse: syncButtons(); return 0;
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

        case kMsgRecordDone: {
            std::unique_ptr<std::wstring> text(reinterpret_cast<std::wstring*>(lParam));
            recording_ = false;
            {
                std::lock_guard<std::mutex> lock(captureMutex_);
                captureSource_.reset();
            }
            SendMessageW(levelBar_, PBM_SETPOS, 0, 0);
            refreshKeywordList();
            setStatus(*text, wParam == 0);
            syncButtons();
            return 0;
        }

        case kMsgTrainDone: {
            std::unique_ptr<std::wstring> text(reinterpret_cast<std::wstring*>(lParam));
            training_ = false;
            if (wParam) {
                std::string err;
                keywordReady_ = keywordModel_.load(workspace_.modelPath(), &err);
                if (keywordReady_) SendMessageW(keywordCheck_, BM_SETCHECK, BST_CHECKED, 0);
                if (keywordReady_) {
                    setStatus(L"학습 완료 · " + baseName(toWide(workspace_.modelPath())));
                } else {
                    setStatus(toWide(err), true);
                }
                std::wstring body = *text;
                if (!keywordReady_) body += L"\r\n\r\n모델을 다시 읽지 못했습니다.\r\n" + toWide(err);
                MessageBoxW(window_, body.c_str(), L"학습 완료", MB_OK | MB_ICONINFORMATION);
            } else {
                setStatus(*text, true);
                MessageBoxW(window_, text->c_str(), L"학습 실패", MB_OK | MB_ICONWARNING);
            }
            refreshKeywordList();
            syncButtons();
            return 0;
        }

        case kMsgKeywordState: {
            std::unique_ptr<std::wstring> text(reinterpret_cast<std::wstring*>(lParam));
            if (wParam == 1) {
                setStatus(L"인식 중 — 키워드 · " + *text);
            } else if (wParam == 3) {
                setStatus(*text, true);
                SendMessageW(levelBar_, PBM_SETPOS, 0, 0);
            } else {
                setStatus(L"인식이 끝났습니다.");
                SendMessageW(levelBar_, PBM_SETPOS, 0, 0);
                setPartial(L"");
            }
            syncButtons();
            return 0;
        }

        case WM_TIMER:
            if (wParam == kCpuTimerId) {
                updateResourceLabel();
                return 0;
            }
            break;

        case WM_CLOSE:
            setResourceMonitor(false);
            // 콜백부터 끊고 워커를 합류시킨 뒤, 이미 보내진 메시지를 비운다.
            accepting_ = false;
            recordCancel_.store(true);
            {
                std::lock_guard<std::mutex> lock(captureMutex_);
                if (captureSource_) captureSource_->cancel();
            }
            engine_.stop();
            keywordListener_.stop();
            if (loader_.joinable()) loader_.join();
            if (recordThread_.joinable()) recordThread_.join();
            if (trainThread_.joinable()) trainThread_.join();
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

    keywordLabel_ = make(L"STATIC", L"키워드", SS_LEFT | SS_CENTERIMAGE, 0);
    keywordList_ = make(L"LISTBOX", L"",
                        WS_TABSTOP | WS_VSCROLL | WS_BORDER | LBS_NOTIFY | LBS_NOINTEGRALHEIGHT,
                        kIdKeywordList);
    keywordEdit_ = make(L"EDIT", L"", WS_BORDER | WS_TABSTOP | ES_AUTOHSCROLL, kIdKeywordEdit);
    SendMessageW(keywordEdit_, EM_SETCUEBANNER, TRUE,
                 reinterpret_cast<LPARAM>(L"추가할 말"));
    keywordAdd_ = make(L"BUTTON", L"추가", WS_TABSTOP | BS_PUSHBUTTON, kIdKeywordAdd);
    keywordRemove_ = make(L"BUTTON", L"삭제", WS_TABSTOP | BS_PUSHBUTTON, kIdKeywordRemove);
    keywordRecord_ = make(L"BUTTON", L"녹음", WS_TABSTOP | BS_PUSHBUTTON, kIdKeywordRecord);
    keywordTrain_ = make(L"BUTTON", L"학습", WS_TABSTOP | BS_PUSHBUTTON, kIdKeywordTrain);
    keywordExport_ = make(L"BUTTON", L"장치에 저장…", WS_TABSTOP | BS_PUSHBUTTON, kIdKeywordExport);
    keywordOpen_ = make(L"BUTTON", L"모델 열기…", WS_TABSTOP | BS_PUSHBUTTON, kIdKeywordOpen);
    keywordCheck_ =
        make(L"BUTTON", L"키워드 모델로 인식", WS_TABSTOP | BS_AUTOCHECKBOX, kIdKeywordUse);
    keywordInfo_ = make(L"STATIC", L"", SS_LEFT | SS_CENTERIMAGE | SS_ENDELLIPSIS, 0);

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

    statusLabel_ = make(L"STATIC", L"준비 중…", SS_LEFT | SS_CENTERIMAGE | SS_ENDELLIPSIS, 0);
    cpuLabel_ = make(L"STATIC", L"메모리 … · CPU …", SS_RIGHT | SS_CENTERIMAGE, 0);

    labels_.push_back(make(L"STATIC", L"인식 결과", SS_LEFT | SS_CENTERIMAGE, 0));
    clearButton_ = make(L"BUTTON", L"지우기", WS_TABSTOP | BS_PUSHBUTTON, kIdClear);
    saveButton_ = make(L"BUTTON", L"저장…", WS_TABSTOP | BS_PUSHBUTTON, kIdSave);
    transcriptEdit_ = make(L"EDIT", L"",
                           WS_BORDER | WS_TABSTOP | WS_VSCROLL | ES_MULTILINE | ES_READONLY |
                               ES_AUTOVSCROLL,
                           0);

    tallyLabel_ = make(L"STATIC", L"", SS_LEFT | SS_CENTERIMAGE, 0);
    partialLabel_ = make(L"STATIC", L"", SS_LEFT | SS_PATHELLIPSIS, 0);
    sizeGrip_ = CreateWindowExW(0, kSizeGripClass, L"", WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS, 0,
                                0, 0, 0, window_, nullptr, instance_, nullptr);
    setResourceMonitor(true);

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

    keywordListener_.onResult([this](const std::string& word) {
        if (!accepting_.load() || word.empty()) return;
        PostMessageW(window_, kMsgFinal, 0, reinterpret_cast<LPARAM>(new std::wstring(toWide(word))));
    });
    keywordListener_.onLevel([this](float rms) {
        if (!accepting_.load()) return;
        const double shaped = std::min(1.0, std::sqrt(static_cast<double>(rms)) * 1.6);
        PostMessageW(window_, kMsgLevel, static_cast<WPARAM>(shaped * 1000.0), 0);
    });
    keywordListener_.onState([this](bool running, const std::string& message, bool error) {
        if (!accepting_.load()) return;
        const WPARAM code = error ? 3 : (running ? 1 : 2);
        PostMessageW(window_, kMsgKeywordState, code,
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

    // 키워드: 말 목록, 녹음, 학습, 장치로 옮길 파일
    {
        const int band = rowHeight * 3 + gap * 2;
        const int listWidth = scaled(168);
        place(keywordLabel_, margin, y, scaled(52), rowHeight);
        place(keywordList_, margin + scaled(52) + gap, y, listWidth, band);
        int bx = margin + scaled(52) + gap + listWidth + gap;
        const int addWidth = scaled(64);
        const int removeWidth = scaled(64);
        const int editWidth = std::max(scaled(40), right - bx - addWidth - removeWidth - gap * 2);
        place(keywordEdit_, bx, y, editWidth, rowHeight);
        place(keywordAdd_, bx + editWidth + gap, y, addWidth, rowHeight);
        place(keywordRemove_, right - removeWidth, y, removeWidth, rowHeight);

        const int y2 = y + rowHeight + gap;
        const int buttonCount = 4;
        const int buttonGap = gap;
        const int buttonsWidth = right - bx;
        const int each = std::max(scaled(64), (buttonsWidth - buttonGap * (buttonCount - 1)) / buttonCount);
        place(keywordRecord_, bx, y2, each, rowHeight);
        place(keywordTrain_, bx + (each + buttonGap), y2, each, rowHeight);
        place(keywordExport_, bx + (each + buttonGap) * 2, y2, each, rowHeight);
        place(keywordOpen_, bx + (each + buttonGap) * 3, y2, each, rowHeight);

        const int y3 = y2 + rowHeight + gap;
        const int checkWidth = scaled(150);
        place(keywordCheck_, bx, y3, checkWidth, rowHeight);
        place(keywordInfo_, bx + checkWidth + gap, y3,
              std::max(scaled(40), right - (bx + checkWidth + gap)), rowHeight);
        y += band + gap;
    }

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

    // 4행: 상태. 오른쪽은 이 프로세스의 메모리와 CPU 점유율.
    const int statusHeight = scaled(20);
    const int cpuWidth = scaled(248);
    if (cpuLabel_) place(cpuLabel_, right - cpuWidth, y, cpuWidth, statusHeight);
    const int statusWidth = right - margin - cpuWidth - gap;
    place(statusLabel_, margin, y, std::max(scaled(40), statusWidth), statusHeight);
    y += statusHeight + gap;

    // 5행: 인식 결과 머리말 + 단추
    const int smallButton = scaled(72);
    place(labels_[5], margin, y, scaled(80), rowHeight);
    place(tallyLabel_, margin + scaled(84), y, right - margin - scaled(240), rowHeight);
    place(clearButton_, right - smallButton * 2 - gap, y, smallButton, rowHeight);
    place(saveButton_, right - smallButton, y, smallButton, rowHeight);
    y += rowHeight + scaled(4);

    // 6행: 결과 + 진행 중 한 줄. 우측 하단은 크기 조절 표시에 양보한다.
    const int partialHeight = scaled(20);
    const bool showGrip = sizeGrip_ && !IsZoomed(window_);
    const int gripSize = scaled(22);
    const int footer = std::max(margin + partialHeight, showGrip ? gripSize : 0);
    const int editHeight = client.bottom - footer - gap - y;
    place(transcriptEdit_, margin, y, right - margin, std::max(scaled(60), editHeight));
    const int partialLabelWidth =
        client.right - margin - (showGrip ? gripSize + gap : margin);
    place(partialLabel_, margin, client.bottom - footer + (footer - partialHeight) / 2,
          std::max(scaled(40), partialLabelWidth), partialHeight);
    if (sizeGrip_) {
        if (showGrip) {
            SetWindowPos(sizeGrip_, HWND_TOP, client.right - gripSize, client.bottom - gripSize,
                         gripSize, gripSize, SWP_SHOWWINDOW);
        } else {
            ShowWindow(sizeGrip_, SW_HIDE);
        }
    }
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
    if (wantKeyword()) {
        startKeywordSource(platform::createMicrophone(selectedDeviceId()));
        return;
    }
    if (!engine_.isModelLoaded()) {
        setStatus(L"먼저 모델을 적재하세요.", true);
        return;
    }
    engine_.setVocabulary(parseVocabulary(toUtf8(editText(vocabEdit_))));
    std::string err;
    if (!engine_.start(platform::createMicrophone(selectedDeviceId()), &err)) {
        const std::wstring message = toWide(err);
        setStatus(message, true);
        MessageBoxW(window_, (L"마이크를 열 수 없습니다.\n\n" + message).c_str(),
                    L"한국어 음성 인식", MB_OK | MB_ICONWARNING);
        return;
    }
    syncButtons();
}

void MainWindow::startWavFile(const std::wstring& path) {
    if (wantKeyword()) {
        appendTranscript(L"── " + path + L" ──\r\n");
        startKeywordSource(std::make_shared<WavFileSource>(toUtf8(path)));
        return;
    }
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
    if (recording_) {
        recordCancel_.store(true);
        std::lock_guard<std::mutex> lock(captureMutex_);
        if (captureSource_) captureSource_->cancel();
    }
    if (keywordListener_.isRunning()) {
        setStatus(L"중지 중…");
        keywordListener_.stop();
    }
    if (engine_.isRunning()) {
        setStatus(L"중지 중…");
        engine_.stop();
    }
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

void MainWindow::setResourceMonitor(bool on) {
    if (cpuMonitor_ == on) return;
    cpuMonitor_ = on;
    cpuHaveSample_ = false;
    if (on) {
        double unused = 0.0;
        sampleProcessCpu(&unused);
        updateResourceLabel();
        SetTimer(window_, kCpuTimerId, 500, nullptr);
        ShowWindow(cpuLabel_, SW_SHOW);
    } else {
        KillTimer(window_, kCpuTimerId);
        ShowWindow(cpuLabel_, SW_HIDE);
        SetWindowTextW(cpuLabel_, L"");
    }
    if (window_) layout();
}

void MainWindow::updateResourceLabel() {
    double percent = 0.0;
    const bool haveCpu = sampleProcessCpu(&percent);
    unsigned long long bytes = 0;
    const bool haveMemory = sampleProcessMemory(&bytes);
    wchar_t memory[32];
    if (!haveMemory) {
        swprintf(memory, 32, L"메모리 …");
    } else if (bytes >= 1024ull * 1024ull * 1024ull) {
        swprintf(memory, 32, L"메모리 %.1f GB",
                 static_cast<double>(bytes) / (1024.0 * 1024.0 * 1024.0));
    } else {
        swprintf(memory, 32, L"메모리 %.1f MB", static_cast<double>(bytes) / (1024.0 * 1024.0));
    }
    wchar_t line[80];
    if (haveCpu)
        swprintf(line, 80, L"%s · CPU %.1f%%", memory, percent);
    else
        swprintf(line, 80, L"%s · CPU …", memory);
    SetWindowTextW(cpuLabel_, line);
}

bool MainWindow::sampleProcessMemory(unsigned long long* bytes) {
    PROCESS_MEMORY_COUNTERS counters = {};
    counters.cb = sizeof(counters);
    if (!GetProcessMemoryInfo(GetCurrentProcess(), &counters, sizeof(counters))) return false;
    if (bytes) *bytes = counters.WorkingSetSize;
    return true;
}

bool MainWindow::sampleProcessCpu(double* percent) {
    FILETIME creation, exitTime, kernel, user;
    if (!GetProcessTimes(GetCurrentProcess(), &creation, &exitTime, &kernel, &user)) return false;
    ULARGE_INTEGER kernelTime;
    ULARGE_INTEGER userTime;
    kernelTime.LowPart = kernel.dwLowDateTime;
    kernelTime.HighPart = kernel.dwHighDateTime;
    userTime.LowPart = user.dwLowDateTime;
    userTime.HighPart = user.dwHighDateTime;
    const ULONGLONG proc = kernelTime.QuadPart + userTime.QuadPart;
    const ULONGLONG wall = GetTickCount64();
    bool ready = false;
    if (cpuHaveSample_ && wall > cpuWallMs_ && proc >= cpuProc100ns_) {
        const DWORD coreCount = GetActiveProcessorCount(ALL_PROCESSOR_GROUPS);
        const double cores = coreCount == 0 ? 1.0 : static_cast<double>(coreCount);
        const double usedMs = static_cast<double>(proc - cpuProc100ns_) / 10000.0;
        const double wallMs = static_cast<double>(wall - cpuWallMs_);
        double value = usedMs / wallMs / cores * 100.0;
        if (value < 0.0) value = 0.0;
        if (value > 100.0) value = 100.0;
        if (percent) *percent = value;
        ready = true;
    }
    cpuHaveSample_ = true;
    cpuWallMs_ = wall;
    cpuProc100ns_ = proc;
    return ready;
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

bool MainWindow::wantKeyword() const {
    return keywordCheck_ &&
           SendMessageW(keywordCheck_, BM_GETCHECK, 0, 0) == BST_CHECKED;
}

int MainWindow::selectedDeviceId() const {
    const int selected = static_cast<int>(SendMessageW(deviceCombo_, CB_GETCURSEL, 0, 0));
    if (selected >= 0 && static_cast<size_t>(selected) < devices_.size())
        return devices_[static_cast<size_t>(selected)].id;
    return -1;
}

std::string MainWindow::selectedKeyword() const {
    const int selected = static_cast<int>(SendMessageW(keywordList_, LB_GETCURSEL, 0, 0));
    const std::vector<std::string> words = workspace_.words();
    if (selected < 0 || static_cast<size_t>(selected) >= words.size()) return {};
    return words[static_cast<size_t>(selected)];
}

void MainWindow::prepareKeywords() {
    std::string err;
    if (!workspace_.prepare(&err)) {
        setStatus(toWide(err), true);
        refreshKeywordList();
        return;
    }
    if (keywordModel_.load(workspace_.modelPath(), &err)) {
        keywordReady_ = true;
        SendMessageW(keywordCheck_, BM_SETCHECK, BST_CHECKED, 0);
    }
    refreshKeywordList();
}

void MainWindow::refreshKeywordList() {
    const int previous = static_cast<int>(SendMessageW(keywordList_, LB_GETCURSEL, 0, 0));
    SendMessageW(keywordList_, LB_RESETCONTENT, 0, 0);
    const std::vector<std::string> words = workspace_.words();
    for (const std::string& word : words) {
        const std::wstring line = toWide(word) + L"   " +
                                  std::to_wstring(workspace_.sampleCount(word)) + L"개";
        SendMessageW(keywordList_, LB_ADDSTRING, 0, reinterpret_cast<LPARAM>(line.c_str()));
    }
    if (!words.empty()) {
        const int next = previous >= 0 && previous < static_cast<int>(words.size()) ? previous : 0;
        SendMessageW(keywordList_, LB_SETCURSEL, static_cast<WPARAM>(next), 0);
    }
    std::wstring info = L"녹음은 keyword-workspace 에 쌓입니다";
    if (keywordReady_) info = L"모델 있음 · " + toWide(keywordModel_.summary());
    SetWindowTextW(keywordInfo_, info.c_str());
}

void MainWindow::addKeyword() {
    std::string err;
    if (!workspace_.addWord(toUtf8(editText(keywordEdit_)), &err)) {
        setStatus(toWide(err), true);
        return;
    }
    SetWindowTextW(keywordEdit_, L"");
    refreshKeywordList();
    const int last = static_cast<int>(workspace_.words().size()) - 1;
    if (last >= 0) SendMessageW(keywordList_, LB_SETCURSEL, static_cast<WPARAM>(last), 0);
    setStatus(L"말을 넣었습니다. 그 말을 여러 번 녹음한 뒤 학습하세요.");
}

void MainWindow::removeKeyword() {
    const std::string word = selectedKeyword();
    if (word.empty()) {
        setStatus(L"지울 말을 고르세요.", true);
        return;
    }
    const std::wstring wide = toWide(word);
    if (MessageBoxW(window_,
                    (L"\"" + wide + L"\" 와 그 녹음을 지울까요?\n다시 인식에서 빼려면 학습도 다시 해야 합니다.")
                        .c_str(),
                    L"말 삭제", MB_YESNO | MB_ICONQUESTION) != IDYES)
        return;
    std::string err;
    if (!workspace_.removeWord(word, &err)) {
        setStatus(toWide(err), true);
        return;
    }
    refreshKeywordList();
    setStatus(L"\"" + wide + L"\" 를 뺐습니다. 장치에 반영하려면 다시 학습하세요.");
}

void MainWindow::recordKeyword() {
    const std::string word = selectedKeyword();
    if (word.empty()) {
        setStatus(L"녹음할 말을 고르세요.", true);
        return;
    }
    if (recording_ || training_ || engine_.isRunning() || keywordListener_.isRunning()) return;
    if (recordThread_.joinable()) recordThread_.join();

    const int deviceId = selectedDeviceId();
    recordCancel_.store(false);
    recording_ = true;
    setStatus(L"\"" + toWide(word) + L"\" 를 말한 뒤 잠시 멈추세요.");
    syncButtons();

    recordThread_ = std::thread([this, word, deviceId] {
        auto source = platform::createMicrophone(deviceId);
        {
            std::lock_guard<std::mutex> lock(captureMutex_);
            captureSource_ = source;
        }
        std::vector<std::int16_t> samples;
        std::string err;
        const bool captured = captureUtterance(
            *source, &samples, &err,
            [this](float rms) {
                if (!accepting_.load()) return;
                const double shaped = std::min(1.0, std::sqrt(static_cast<double>(rms)) * 1.6);
                PostMessageW(window_, kMsgLevel, static_cast<WPARAM>(shaped * 1000.0), 0);
            },
            &recordCancel_);
        bool ok = captured;
        if (ok) {
            const std::string path = workspace_.allocateSamplePath(word);
            ok = writeWav16(path, samples.data(), samples.size(), kKeywordSampleRate, &err);
        }
        if (!accepting_.load()) return;
        std::wstring message = ok ? (L"\"" + toWide(word) + L"\" 녹음을 저장했습니다.") : toWide(err);
        PostMessageW(window_, kMsgRecordDone, ok ? 1 : 0,
                     reinterpret_cast<LPARAM>(new std::wstring(std::move(message))));
    });
}

void MainWindow::trainKeywords() {
    if (recording_ || training_ || engine_.isRunning() || keywordListener_.isRunning()) return;
    if (trainThread_.joinable()) trainThread_.join();
    training_ = true;
    setStatus(L"학습합니다…");
    syncButtons();

    trainThread_ = std::thread([this] {
        KeywordModel trained;
        KeywordTrainReport report;
        std::string err;
        const bool ok = trainKeywordModel(workspace_, &trained, &report, &err);
        std::wstring message;
        if (ok) {
            if (!trained.save(workspace_.modelPath(), &err)) {
                message = toWide(err);
                if (accepting_.load()) {
                    PostMessageW(window_, kMsgTrainDone, 0,
                                 reinterpret_cast<LPARAM>(new std::wstring(std::move(message))));
                }
                return;
            }
            const std::string savedPath = workspace_.modelPath();
            std::error_code sizeError;
            const auto bytes = std::filesystem::file_size(std::filesystem::u8path(savedPath), sizeError);
            const std::wstring sizeText =
                sizeError ? L"크기를 확인하지 못했습니다." : formatByteSize(bytes);
            std::wstring learned;
            for (const KeywordClass& cls : trained.classes_) {
                if (!learned.empty()) learned += L"\r\n";
                learned += toWide(cls.word) + L"    녹음 " +
                           std::to_wstring(cls.exemplars.size()) + L"개";
            }
            const std::wstring skipped =
                report.skippedWords.empty() ? L"없음" : toWide(formatVocabulary(report.skippedWords));
            message = L"학습이 완료되었습니다.\r\n\r\n"
                      L"저장 경로\r\n" +
                      toWide(savedPath) + L"\r\n\r\n"
                      L"파일 크기\r\n" +
                      sizeText + L"\r\n\r\n"
                      L"학습된 말  " +
                      std::to_wstring(report.words) + L"개 · 녹음 " +
                      std::to_wstring(report.samples) + L"개\r\n" +
                      learned + L"\r\n\r\n"
                      L"표본율\r\n" +
                      std::to_wstring(kKeywordSampleRate) + L" Hz\r\n\r\n"
                      L"넣지 못한 말\r\n" +
                      skipped + L"\r\n\r\n"
                      L"이 파일을 장치에 복사하면 같은 말을 인식합니다.";
        } else {
            message = toWide(err);
        }
        if (!accepting_.load()) return;
        PostMessageW(window_, kMsgTrainDone, ok ? 1 : 0,
                     reinterpret_cast<LPARAM>(new std::wstring(std::move(message))));
    });
}

void MainWindow::exportKeywordModel() {
    if (!keywordReady_) {
        setStatus(L"내보낼 모델이 없습니다. 먼저 학습하거나 모델 파일을 여세요.", true);
        return;
    }
    wchar_t path[MAX_PATH] = L"keywords.kmodel";
    OPENFILENAMEW dialog = {};
    dialog.lStructSize = sizeof(dialog);
    dialog.hwndOwner = window_;
    dialog.lpstrFilter = L"키워드 모델\0*.kmodel\0모든 파일\0*.*\0";
    dialog.lpstrFile = path;
    dialog.nMaxFile = MAX_PATH;
    dialog.lpstrDefExt = L"kmodel";
    dialog.lpstrTitle = L"장치에 넣을 키워드 모델 저장";
    dialog.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    if (!GetSaveFileNameW(&dialog)) return;

    std::string err;
    if (!keywordModel_.save(toUtf8(path), &err)) {
        setStatus(toWide(err), true);
        return;
    }
    setStatus(L"장치에 넣을 파일을 저장했습니다. 이 파일만 복사하면 됩니다: " + std::wstring(path));
}

void MainWindow::openKeywordModel() {
    wchar_t path[MAX_PATH] = {0};
    OPENFILENAMEW dialog = {};
    dialog.lStructSize = sizeof(dialog);
    dialog.hwndOwner = window_;
    dialog.lpstrFilter = L"키워드 모델\0*.kmodel\0모든 파일\0*.*\0";
    dialog.lpstrFile = path;
    dialog.nMaxFile = MAX_PATH;
    dialog.lpstrTitle = L"키워드 모델 열기";
    dialog.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
    if (!GetOpenFileNameW(&dialog)) return;

    KeywordModel loaded;
    std::string err;
    if (!loaded.load(toUtf8(path), &err)) {
        setStatus(toWide(err), true);
        return;
    }
    keywordModel_ = std::move(loaded);
    keywordReady_ = true;
    SendMessageW(keywordCheck_, BM_SETCHECK, BST_CHECKED, 0);
    refreshKeywordList();
    setStatus(L"키워드 모델을 열었습니다 · " + toWide(keywordModel_.summary()));
    syncButtons();
}

void MainWindow::startKeywordSource(const std::shared_ptr<AudioSource>& source) {
    if (!keywordReady_) {
        setStatus(L"키워드 모델이 없습니다. 학습하거나 모델 파일을 여세요.", true);
        return;
    }
    std::string err;
    if (!keywordListener_.start(source, keywordModel_, &err)) {
        setStatus(toWide(err), true);
        MessageBoxW(window_, (L"키워드 인식을 시작하지 못했습니다.\n\n" + toWide(err)).c_str(),
                    L"한국어 음성 인식", MB_OK | MB_ICONWARNING);
        return;
    }
    syncButtons();
}

void MainWindow::syncButtons() {
    const bool keywordRunning = keywordListener_.isRunning();
    const bool running = engine_.isRunning() || keywordRunning || recording_;
    const bool busy = running || training_ || loading_;
    const bool ready = wantKeyword() ? (keywordReady_ && !training_ && !recording_)
                                     : (engine_.isModelLoaded() && !loading_ && !recording_);

    EnableWindow(startButton_, ready && !running && !training_);
    EnableWindow(stopButton_, running);
    EnableWindow(wavButton_, ready && !running && !training_);
    EnableWindow(loadButton_, !busy);
    EnableWindow(browseButton_, !busy);
    EnableWindow(modelEdit_, !busy);
    EnableWindow(vocabEdit_, !busy);
    EnableWindow(deviceCombo_, !running);
    EnableWindow(keywordList_, !busy);
    EnableWindow(keywordEdit_, !busy);
    EnableWindow(keywordAdd_, !busy);
    EnableWindow(keywordRemove_, !busy);
    EnableWindow(keywordRecord_, !busy);
    EnableWindow(keywordTrain_, !busy && !recording_);
    EnableWindow(keywordExport_, keywordReady_ && !busy);
    EnableWindow(keywordOpen_, !busy);
    EnableWindow(keywordCheck_, !running && !recording_);
}

}  // namespace kstt::gui
