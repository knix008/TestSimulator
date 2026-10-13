#include "app_window.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <functional>
#include <utility>

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <powrprof.h>
#include <psapi.h>
#elif defined(__APPLE__)
#include <mach/mach.h>
#include <sys/sysctl.h>
#include <unistd.h>
#else
#include <sys/resource.h>
#include <unistd.h>
#endif

#include <chrono>

#include "kstt/platform/audio_input.h"
#include "kstt/vocabulary.h"
#include "kstt/wav_file.h"

namespace kstt::gui {
namespace {

// 버튼에 아이콘+글자를 같이 넣는다 (GTK 기본 아이콘 이름만 쓴다).
GtkWidget* makeButton(const char* iconName, const char* label, const char* cssClass) {
    GtkWidget* button = gtk_button_new();
    GtkWidget* box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_box_append(GTK_BOX(box), gtk_image_new_from_icon_name(iconName));
    gtk_box_append(GTK_BOX(box), gtk_label_new(label));
    gtk_button_set_child(GTK_BUTTON(button), box);
    if (cssClass) gtk_widget_add_css_class(button, cssClass);
    return button;
}

void applyCss() {
    static const char* kCss =
        ".kstt-partial { font-style: italic; opacity: 0.7; }\n"
        ".kstt-statusbar {\n"
        "  background-color: alpha(@theme_fg_color, 0.06);\n"
        "  border-top: 1px solid alpha(@theme_fg_color, 0.28);\n"
        "  padding: 5px 10px;\n"
        "  min-height: 30px;\n"
        "}\n"
        ".kstt-statusbar label { font-size: 0.92em; }\n"
        ".kstt-status-pane {\n"
        "  border-left: 1px solid alpha(@theme_fg_color, 0.22);\n"
        "  padding-left: 10px;\n"
        "  margin-left: 10px;\n"
        "}\n"
        ".kstt-status-error { color: #b00020; }\n"
        ".kstt-transcript { font-size: 1.05em; }\n"
        ".kstt-transcript text { padding: 8px; }\n";
    GtkCssProvider* provider = gtk_css_provider_new();
    gtk_css_provider_load_from_string(provider, kCss);
    gtk_style_context_add_provider_for_display(gdk_display_get_default(),
                                               GTK_STYLE_PROVIDER(provider),
                                               GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    g_object_unref(provider);
}

// 메시지 대화상자 하나 띄우기 (GTK4: GtkAlertDialog)
void showError(GtkWindow* parent, const std::string& message) {
    GtkAlertDialog* dialog = gtk_alert_dialog_new("%s", message.c_str());
    gtk_alert_dialog_show(dialog, parent);
    g_object_unref(dialog);
}

// 경로에서 마지막 이름만 (상태줄을 짧게 유지하려고)
std::string baseName(const std::string& path) {
    const size_t cut = path.find_last_of("/\\");
    return cut == std::string::npos ? path : path.substr(cut + 1);
}

std::string formatByteSize(std::uintmax_t bytes) {
    char buffer[80];
    if (bytes < 1024) {
        std::snprintf(buffer, sizeof(buffer), "%llu 바이트",
                      static_cast<unsigned long long>(bytes));
    } else if (bytes < 1024ull * 1024ull) {
        std::snprintf(buffer, sizeof(buffer), "%.1f KB (%llu 바이트)",
                      static_cast<double>(bytes) / 1024.0, static_cast<unsigned long long>(bytes));
    } else {
        std::snprintf(buffer, sizeof(buffer), "%.2f MB (%llu 바이트)",
                      static_cast<double>(bytes) / (1024.0 * 1024.0),
                      static_cast<unsigned long long>(bytes));
    }
    return buffer;
}

std::string timeStamp() {
    GDateTime* now = g_date_time_new_now_local();
    char* text = g_date_time_format(now, "%H:%M:%S");
    std::string out = text ? text : "";
    g_free(text);
    g_date_time_unref(now);
    return out;
}

}  // namespace

AppWindow::AppWindow(GtkApplication* app) : app_(app) {
    applyCss();

    window_ = gtk_application_window_new(app);
    gtk_window_set_title(GTK_WINDOW(window_), "한국어 음성 인식 (Vosk)");
    gtk_window_set_default_size(GTK_WINDOW(window_), 820, 780);
    // assets/icons/hicolor/... 에 넣어 둔 아이콘 (main.cpp 가 경로를 등록한다)
    gtk_window_set_icon_name(GTK_WINDOW(window_), "korean-stt");

    GtkWidget* header = gtk_header_bar_new();
    GtkWidget* titleLabel = gtk_label_new("한국어 음성 인식");
    gtk_widget_add_css_class(titleLabel, "title");
    gtk_header_bar_set_title_widget(GTK_HEADER_BAR(header), titleLabel);
    spinner_ = gtk_spinner_new();
    gtk_header_bar_pack_end(GTK_HEADER_BAR(header), spinner_);
    gtk_window_set_titlebar(GTK_WINDOW(window_), header);

    GtkWidget* outer = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_window_set_child(GTK_WINDOW(window_), outer);

    GtkWidget* root = gtk_box_new(GTK_ORIENTATION_VERTICAL, 12);
    gtk_widget_set_margin_top(root, 12);
    gtk_widget_set_margin_bottom(root, 8);
    gtk_widget_set_margin_start(root, 12);
    gtk_widget_set_margin_end(root, 12);
    gtk_widget_set_vexpand(root, TRUE);
    gtk_box_append(GTK_BOX(outer), root);

    gtk_box_append(GTK_BOX(root), buildSettings());
    gtk_box_append(GTK_BOX(root), buildKeywords());
    gtk_box_append(GTK_BOX(root), buildControls());

    GtkWidget* transcript = buildTranscript();
    gtk_widget_set_vexpand(transcript, TRUE);
    gtk_box_append(GTK_BOX(root), transcript);

    partialLabel_ = gtk_label_new("");
    gtk_widget_add_css_class(partialLabel_, "kstt-partial");
    gtk_label_set_xalign(GTK_LABEL(partialLabel_), 0.0f);
    gtk_label_set_ellipsize(GTK_LABEL(partialLabel_), PANGO_ELLIPSIZE_START);
    gtk_box_append(GTK_BOX(root), partialLabel_);

    GtkWidget* statusBar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 0);
    gtk_widget_add_css_class(statusBar, "kstt-statusbar");
    statusLabel_ = gtk_label_new("준비 중…");
    gtk_label_set_xalign(GTK_LABEL(statusLabel_), 0.0f);
    gtk_label_set_ellipsize(GTK_LABEL(statusLabel_), PANGO_ELLIPSIZE_END);
    gtk_widget_set_hexpand(statusLabel_, TRUE);
    gtk_box_append(GTK_BOX(statusBar), statusLabel_);
    const auto pane = [&](const char* text) {
        GtkWidget* label = gtk_label_new(text);
        gtk_widget_add_css_class(label, "kstt-status-pane");
        gtk_label_set_xalign(GTK_LABEL(label), 0.0f);
        gtk_box_append(GTK_BOX(statusBar), label);
        return label;
    };
    statusMemLabel_ = pane("메모리 …");
    cpuLabel_ = pane("CPU …");
    statusCoresLabel_ = pane("…코어");
    statusClockLabel_ = pane("… GHz");
    gtk_box_append(GTK_BOX(outer), statusBar);

    g_signal_connect(window_, "close-request", G_CALLBACK(+[](GtkWindow* window,
                                                              gpointer self) -> gboolean {
                         auto* app = static_cast<AppWindow*>(self);
                         app->setResourceMonitor(false);
                         app->alive_->store(false);
                         app->stopRecognition();
                         (void)window;
                         return FALSE;  // 계속 진행해 창을 닫는다
                     }),
                     this);

    // --- 엔진 콜백: 모두 워커 스레드에서 불린다 → 주 루프로 넘긴다 ---
    engine_.onPartial([this](const std::string& text) {
        postToMain([this, text] { setPartial(text); });
    });
    engine_.onFinal([this](const Transcript& result) {
        postToMain([this, result] { appendFinal(result); });
    });
    engine_.onLevel([this](float rms) {
        postToMain([this, rms] {
            // RMS 는 작은 값에 몰려 있어 보기 좋게 눌러 펴 준다.
            const double shaped = std::min(1.0, std::sqrt(static_cast<double>(rms)) * 1.6);
            gtk_level_bar_set_value(GTK_LEVEL_BAR(levelBar_), shaped);
        });
    });
    engine_.onState([this](EngineState state, const std::string& message) {
        postToMain([this, state, message] {
            switch (state) {
                case EngineState::Running:
                    setStatus("인식 중 — " + message);
                    break;
                case EngineState::Ready:
                    setStatus(message == "finished" ? "인식이 끝났습니다."
                                                    : "대기 중 (모델 준비됨)");
                    gtk_level_bar_set_value(GTK_LEVEL_BAR(levelBar_), 0.0);
                    setPartial(std::string());
                    break;
                case EngineState::Error:
                    setStatus(message, true);
                    gtk_level_bar_set_value(GTK_LEVEL_BAR(levelBar_), 0.0);
                    break;
                default:
                    break;
            }
            syncButtons();
        });
    });

    keywordListener_.onResult([this](const std::string& word) {
        postToMain([this, word] {
            if (word.empty()) return;
            Transcript result;
            result.text = word;
            result.isFinal = true;
            appendFinal(result);
        });
    });
    keywordListener_.onLevel([this](float rms) {
        postToMain([this, rms] {
            const double shaped = std::min(1.0, std::sqrt(static_cast<double>(rms)) * 1.6);
            gtk_level_bar_set_value(GTK_LEVEL_BAR(levelBar_), shaped);
        });
    });
    keywordListener_.onState([this](bool running, const std::string& message, bool error) {
        postToMain([this, running, message, error] {
            if (error) {
                setStatus(message, true);
            } else if (running) {
                setStatus("인식 중 — 키워드 · " + message);
            } else {
                setStatus("인식이 끝났습니다.");
                gtk_level_bar_set_value(GTK_LEVEL_BAR(levelBar_), 0.0);
                setPartial(std::string());
            }
            syncButtons();
        });
    });

    refreshDevices();

    // 모델 경로 기본값: 자동 탐색 결과
    const std::string found = SttEngine::findDefaultModel();
    if (!found.empty()) gtk_editable_set_text(GTK_EDITABLE(modelEntry_), found.c_str());

    syncButtons();
    prepareKeywords();
    setResourceMonitor(true);
    if (!keywordReady_) loadModelAsync();
}

AppWindow::~AppWindow() {
    *alive_ = false;
    setResourceMonitor(false);
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
}

void AppWindow::present() { gtk_window_present(GTK_WINDOW(window_)); }

GtkWidget* AppWindow::buildSettings() {
    GtkWidget* frame = gtk_frame_new("설정");
    GtkWidget* grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 8);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 8);
    gtk_widget_set_margin_top(grid, 10);
    gtk_widget_set_margin_bottom(grid, 10);
    gtk_widget_set_margin_start(grid, 10);
    gtk_widget_set_margin_end(grid, 10);
    gtk_frame_set_child(GTK_FRAME(frame), grid);

    GtkWidget* modelLabel = gtk_label_new("모델");
    gtk_label_set_xalign(GTK_LABEL(modelLabel), 0.0f);
    gtk_grid_attach(GTK_GRID(grid), modelLabel, 0, 0, 1, 1);

    modelEntry_ = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(modelEntry_),
                                   "Vosk 한국어 모델 디렉터리 (예: models/vosk-model-small-ko-0.22)");
    gtk_widget_set_hexpand(modelEntry_, TRUE);
    gtk_grid_attach(GTK_GRID(grid), modelEntry_, 1, 0, 1, 1);

    GtkWidget* browse = gtk_button_new_with_label("찾아보기…");
    g_signal_connect(browse, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->chooseModelFolder();
                     }),
                     this);
    gtk_grid_attach(GTK_GRID(grid), browse, 2, 0, 1, 1);

    reloadButton_ = gtk_button_new_with_label("모델 적재");
    g_signal_connect(reloadButton_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->loadModelAsync();
                     }),
                     this);
    gtk_grid_attach(GTK_GRID(grid), reloadButton_, 3, 0, 1, 1);

    GtkWidget* vocabLabel = gtk_label_new("받는 말");
    gtk_label_set_xalign(GTK_LABEL(vocabLabel), 0.0f);
    gtk_grid_attach(GTK_GRID(grid), vocabLabel, 0, 1, 1, 1);

    vocabEntry_ = gtk_entry_new();
    gtk_editable_set_text(GTK_EDITABLE(vocabEntry_),
                          formatVocabulary(defaultVocabulary()).c_str());
    gtk_entry_set_placeholder_text(GTK_ENTRY(vocabEntry_),
                                   "쉼표로 구분. 비우면 들리는 대로 모두 받아씁니다");
    gtk_widget_set_tooltip_text(vocabEntry_,
                                "이 말들만 받아씁니다. 비우면 자유 받아쓰기가 됩니다.");
    gtk_widget_set_hexpand(vocabEntry_, TRUE);
    gtk_grid_attach(GTK_GRID(grid), vocabEntry_, 1, 1, 3, 1);

    GtkWidget* deviceLabel = gtk_label_new("입력");
    gtk_label_set_xalign(GTK_LABEL(deviceLabel), 0.0f);
    gtk_grid_attach(GTK_GRID(grid), deviceLabel, 0, 2, 1, 1);

    deviceDropdown_ = gtk_drop_down_new(nullptr, nullptr);
    gtk_widget_set_hexpand(deviceDropdown_, TRUE);
    gtk_grid_attach(GTK_GRID(grid), deviceDropdown_, 1, 2, 2, 1);

    GtkWidget* refresh = gtk_button_new_from_icon_name("view-refresh-symbolic");
    gtk_widget_set_tooltip_text(refresh, "장치 목록 새로 고침");
    g_signal_connect(refresh, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->refreshDevices();
                     }),
                     this);
    gtk_widget_set_halign(refresh, GTK_ALIGN_START);
    gtk_grid_attach(GTK_GRID(grid), refresh, 3, 2, 1, 1);

    return frame;
}

GtkWidget* AppWindow::buildKeywords() {
    GtkWidget* frame = gtk_frame_new("키워드");
    GtkWidget* grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(grid), 8);
    gtk_grid_set_column_spacing(GTK_GRID(grid), 8);
    gtk_widget_set_margin_top(grid, 10);
    gtk_widget_set_margin_bottom(grid, 10);
    gtk_widget_set_margin_start(grid, 10);
    gtk_widget_set_margin_end(grid, 10);
    gtk_frame_set_child(GTK_FRAME(frame), grid);

    keywordList_ = gtk_list_box_new();
    gtk_widget_set_size_request(keywordList_, 160, -1);
    gtk_widget_add_css_class(keywordList_, "boxed-list");
    keywordScroller_ = gtk_scrolled_window_new();
    gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(keywordScroller_), keywordList_);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(keywordScroller_), GTK_POLICY_NEVER,
                                   GTK_POLICY_AUTOMATIC);
    gtk_scrolled_window_set_propagate_natural_height(GTK_SCROLLED_WINDOW(keywordScroller_), TRUE);
    gtk_widget_set_vexpand(keywordScroller_, FALSE);
    gtk_grid_attach(GTK_GRID(grid), keywordScroller_, 0, 0, 1, 2);

    GtkWidget* orderBox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    keywordUp_ = gtk_button_new_with_label("위로");
    keywordDown_ = gtk_button_new_with_label("아래로");
    gtk_widget_set_hexpand(keywordUp_, TRUE);
    gtk_widget_set_hexpand(keywordDown_, TRUE);
    g_signal_connect(keywordUp_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->moveKeyword(-1);
                     }),
                     this);
    g_signal_connect(keywordDown_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->moveKeyword(1);
                     }),
                     this);
    gtk_box_append(GTK_BOX(orderBox), keywordUp_);
    gtk_box_append(GTK_BOX(orderBox), keywordDown_);
    gtk_grid_attach(GTK_GRID(grid), orderBox, 0, 2, 1, 1);
    g_signal_connect(keywordList_, "row-selected",
                     G_CALLBACK(+[](GtkListBox*, GtkListBoxRow*, gpointer self) {
                         static_cast<AppWindow*>(self)->syncButtons();
                     }),
                     this);

    keywordEntry_ = gtk_entry_new();
    gtk_entry_set_placeholder_text(GTK_ENTRY(keywordEntry_), "추가할 말");
    gtk_widget_set_hexpand(keywordEntry_, TRUE);
    gtk_grid_attach(GTK_GRID(grid), keywordEntry_, 1, 0, 1, 1);

    keywordAdd_ = gtk_button_new_with_label("추가");
    g_signal_connect(keywordAdd_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->addKeyword();
                     }),
                     this);
    gtk_grid_attach(GTK_GRID(grid), keywordAdd_, 2, 0, 1, 1);

    keywordRemove_ = gtk_button_new_with_label("삭제");
    g_signal_connect(keywordRemove_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->removeKeyword();
                     }),
                     this);
    gtk_grid_attach(GTK_GRID(grid), keywordRemove_, 3, 0, 1, 1);

    GtkWidget* actions = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);
    gtk_widget_set_hexpand(actions, TRUE);
    keywordRecord_ = gtk_button_new_with_label("녹음");
    keywordImport_ = gtk_button_new_with_label("음원 넣기");
    keywordTrain_ = gtk_button_new_with_label("학습");
    keywordExport_ = gtk_button_new_with_label("장치에 저장…");
    keywordOpen_ = gtk_button_new_with_label("모델 열기…");
    g_signal_connect(keywordRecord_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->recordKeyword();
                     }),
                     this);
    g_signal_connect(keywordImport_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->importKeywordFiles();
                     }),
                     this);
    g_signal_connect(keywordTrain_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->trainKeywords();
                     }),
                     this);
    g_signal_connect(keywordExport_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->exportKeywordModel();
                     }),
                     this);
    g_signal_connect(keywordOpen_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->openKeywordModel();
                     }),
                     this);
    gtk_box_append(GTK_BOX(actions), keywordRecord_);
    gtk_box_append(GTK_BOX(actions), keywordImport_);
    gtk_box_append(GTK_BOX(actions), keywordTrain_);
    gtk_box_append(GTK_BOX(actions), keywordExport_);
    gtk_box_append(GTK_BOX(actions), keywordOpen_);
    gtk_grid_attach(GTK_GRID(grid), actions, 1, 1, 3, 1);

    keywordCheck_ = gtk_check_button_new_with_label("키워드 모델로 인식");
    g_signal_connect(keywordCheck_, "toggled", G_CALLBACK(+[](GtkCheckButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->onKeywordToggled();
                     }),
                     this);
    gtk_grid_attach(GTK_GRID(grid), keywordCheck_, 1, 2, 1, 1);

    keywordInfo_ = gtk_label_new("녹음은 keyword-workspace 에 쌓입니다");
    gtk_label_set_xalign(GTK_LABEL(keywordInfo_), 0.0f);
    gtk_label_set_ellipsize(GTK_LABEL(keywordInfo_), PANGO_ELLIPSIZE_END);
    gtk_widget_set_hexpand(keywordInfo_, TRUE);
    gtk_grid_attach(GTK_GRID(grid), keywordInfo_, 2, 2, 1, 1);

    keywordReset_ = gtk_button_new_with_label("초기화");
    g_signal_connect(keywordReset_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->resetKeywordTraining();
                     }),
                     this);
    gtk_grid_attach(GTK_GRID(grid), keywordReset_, 3, 2, 1, 1);

    return frame;
}

GtkWidget* AppWindow::buildControls() {
    GtkWidget* box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 8);

    startButton_ = makeButton("media-record-symbolic", "인식 시작", "suggested-action");
    g_signal_connect(startButton_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->startMicrophone();
                     }),
                     this);
    gtk_box_append(GTK_BOX(box), startButton_);

    stopButton_ = makeButton("media-playback-stop-symbolic", "중지", "destructive-action");
    g_signal_connect(stopButton_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->stopRecognition();
                     }),
                     this);
    gtk_box_append(GTK_BOX(box), stopButton_);

    wavButton_ = makeButton("audio-x-generic-symbolic", "WAV 파일 인식…", nullptr);
    g_signal_connect(wavButton_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->chooseWavFile();
                     }),
                     this);
    gtk_box_append(GTK_BOX(box), wavButton_);

    // 진행 중 추측을 보여 줄지. 끄면 확정된 문장만 쌓인다.
    partialCheck_ = gtk_check_button_new_with_label("진행 중 표시");
    gtk_check_button_set_active(GTK_CHECK_BUTTON(partialCheck_), TRUE);
    gtk_widget_set_margin_start(partialCheck_, 6);
    g_signal_connect(partialCheck_, "toggled", G_CALLBACK(+[](GtkCheckButton* check,
                                                              gpointer self) {
                         auto* window = static_cast<AppWindow*>(self);
                         const bool show = gtk_check_button_get_active(check);
                         window->engine_.setPartialMode(show ? PartialMode::Stable
                                                             : PartialMode::Off);
                         if (!show) window->setPartial(std::string());
                     }),
                     this);
    gtk_box_append(GTK_BOX(box), partialCheck_);

    GtkWidget* levelLabel = gtk_label_new("입력 레벨");
    gtk_widget_set_margin_start(levelLabel, 12);
    gtk_widget_add_css_class(levelLabel, "kstt-status");
    gtk_box_append(GTK_BOX(box), levelLabel);

    levelBar_ = gtk_level_bar_new_for_interval(0.0, 1.0);
    gtk_level_bar_set_mode(GTK_LEVEL_BAR(levelBar_), GTK_LEVEL_BAR_MODE_CONTINUOUS);
    gtk_widget_set_hexpand(levelBar_, TRUE);
    gtk_widget_set_valign(levelBar_, GTK_ALIGN_CENTER);
    gtk_box_append(GTK_BOX(box), levelBar_);

    return box;
}

GtkWidget* AppWindow::buildTranscript() {
    GtkWidget* frame = gtk_frame_new(nullptr);
    GtkWidget* box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
    gtk_frame_set_child(GTK_FRAME(frame), box);

    GtkWidget* bar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 6);
    gtk_widget_set_margin_top(bar, 6);
    gtk_widget_set_margin_bottom(bar, 6);
    gtk_widget_set_margin_start(bar, 6);
    gtk_widget_set_margin_end(bar, 6);

    GtkWidget* title = gtk_label_new("인식 결과");
    gtk_widget_add_css_class(title, "heading");
    gtk_label_set_xalign(GTK_LABEL(title), 0.0f);
    gtk_widget_set_hexpand(title, TRUE);
    gtk_box_append(GTK_BOX(bar), title);

    tallyLabel_ = gtk_label_new("");
    gtk_widget_add_css_class(tallyLabel_, "kstt-status");
    gtk_label_set_xalign(GTK_LABEL(tallyLabel_), 0.0f);
    gtk_box_append(GTK_BOX(bar), tallyLabel_);

    GtkWidget* report = gtk_button_new_with_label("리포트");
    g_signal_connect(report, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->writeReport();
                     }),
                     this);
    gtk_box_append(GTK_BOX(bar), report);

    GtkWidget* clear = gtk_button_new_with_label("지우기");
    g_signal_connect(clear, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->clearTranscript();
                     }),
                     this);
    gtk_box_append(GTK_BOX(bar), clear);

    GtkWidget* save = gtk_button_new_with_label("저장…");
    g_signal_connect(save, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->saveTranscript();
                     }),
                     this);
    gtk_box_append(GTK_BOX(bar), save);

    gtk_box_append(GTK_BOX(box), bar);
    gtk_box_append(GTK_BOX(box), gtk_separator_new(GTK_ORIENTATION_HORIZONTAL));

    GtkWidget* scroller = gtk_scrolled_window_new();
    gtk_widget_set_vexpand(scroller, TRUE);
    transcriptView_ = gtk_text_view_new();
    gtk_text_view_set_editable(GTK_TEXT_VIEW(transcriptView_), FALSE);
    gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(transcriptView_), GTK_WRAP_WORD_CHAR);
    gtk_text_view_set_left_margin(GTK_TEXT_VIEW(transcriptView_), 8);
    gtk_text_view_set_right_margin(GTK_TEXT_VIEW(transcriptView_), 8);
    gtk_text_view_set_top_margin(GTK_TEXT_VIEW(transcriptView_), 8);
    gtk_widget_add_css_class(transcriptView_, "kstt-transcript");
    transcriptBuffer_ = gtk_text_view_get_buffer(GTK_TEXT_VIEW(transcriptView_));
    gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(scroller), transcriptView_);
    gtk_box_append(GTK_BOX(box), scroller);

    return frame;
}

void AppWindow::postToMain(std::function<void()> work) {
    struct Task {
        std::function<void()> work;
        std::shared_ptr<std::atomic<bool>> alive;
    };
    auto* task = new Task{std::move(work), alive_};
    g_idle_add_full(
        G_PRIORITY_DEFAULT_IDLE,
        +[](gpointer data) -> gboolean {
            auto* t = static_cast<Task*>(data);
            if (t->alive->load()) t->work();
            return G_SOURCE_REMOVE;
        },
        task, +[](gpointer data) { delete static_cast<Task*>(data); });
}

void AppWindow::loadModelAsync() {
    if (loading_ || engine_.isRunning()) return;
    if (loader_.joinable()) loader_.join();
    if (wantKeyword()) {
        suppressKeywordToggle_ = true;
        gtk_check_button_set_active(GTK_CHECK_BUTTON(keywordCheck_), FALSE);
        suppressKeywordToggle_ = false;
    }

    EngineConfig config;
    config.modelPath = gtk_editable_get_text(GTK_EDITABLE(modelEntry_));
    config.withWords = false;
    config.vocabulary = parseVocabulary(gtk_editable_get_text(GTK_EDITABLE(vocabEntry_)));

    loading_ = true;
    gtk_spinner_start(GTK_SPINNER(spinner_));
    setStatus("모델을 적재합니다… (수 초 걸릴 수 있습니다)");
    syncButtons();

    loader_ = std::thread([this, config] {
        std::string err;
        const bool ok = engine_.loadModel(config, &err);
        const std::string modelPath = engine_.config().modelPath;
        const std::string libPath = engine_.voskLibraryPath();
        postToMain([this, ok, err, modelPath, libPath] {
            loading_ = false;
            gtk_spinner_stop(GTK_SPINNER(spinner_));
            if (ok) {
                gtk_editable_set_text(GTK_EDITABLE(modelEntry_), modelPath.c_str());
                // 상태줄은 이름만 짧게, 전체 경로는 툴팁으로 보여 준다.
                setStatus("준비됨 · 모델 " + baseName(modelPath) + " · " + baseName(libPath));
                gtk_widget_set_tooltip_text(
                    statusLabel_, ("모델: " + modelPath + "\nVosk: " + libPath).c_str());
                maybeRunSmokeFile();
            } else {
                setStatus(err, true);
            }
            syncButtons();
        });
    });
}

void AppWindow::startMicrophone() {
    if (wantKeyword()) {
        startKeywordSource(platform::createMicrophone(selectedDeviceId()));
        return;
    }
    if (!engine_.isModelLoaded()) {
        setStatus("먼저 모델을 적재하세요.", true);
        return;
    }
    engine_.setVocabulary(parseVocabulary(gtk_editable_get_text(GTK_EDITABLE(vocabEntry_))));
    std::string err;
    if (!engine_.start(platform::createMicrophone(selectedDeviceId()), &err)) {
        setStatus(err, true);
        showError(GTK_WINDOW(window_), "마이크를 열 수 없습니다.\n\n" + err);
        return;
    }
    syncButtons();
}

void AppWindow::startWavFile(const std::string& path) {
    if (wantKeyword()) {
        GtkTextIter end;
        gtk_text_buffer_get_end_iter(transcriptBuffer_, &end);
        const std::string header = "── " + path + " ──\n";
        gtk_text_buffer_insert(transcriptBuffer_, &end, header.c_str(), -1);
        startKeywordSource(std::make_shared<WavFileSource>(path));
        return;
    }
    if (!engine_.isModelLoaded()) {
        setStatus("먼저 모델을 적재하세요.", true);
        return;
    }
    engine_.setVocabulary(parseVocabulary(gtk_editable_get_text(GTK_EDITABLE(vocabEntry_))));
    std::string err;
    auto source = std::make_shared<WavFileSource>(path);
    if (!engine_.start(source, &err)) {
        setStatus(err, true);
        showError(GTK_WINDOW(window_), "WAV 파일을 인식할 수 없습니다.\n\n" + err);
        return;
    }
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(transcriptBuffer_, &end);
    const std::string header = "── " + path + " ──\n";
    gtk_text_buffer_insert(transcriptBuffer_, &end, header.c_str(), -1);
    syncButtons();
}

// KSTT_SMOKE_WAV 가 가리키는 WAV 를 모델 적재 직후 자동으로 인식한다.
// GUI 를 손으로 누르지 않고도 인식 경로 전체를 확인하려고 둔 점검용 통로다.
void AppWindow::maybeRunSmokeFile() {
    const char* path = g_getenv("KSTT_SMOKE_WAV");
    if (!path || !*path || smokeStarted_) return;
    smokeStarted_ = true;
    startWavFile(path);
}

void AppWindow::stopRecognition() {
    if (recording_) {
        recordCancel_.store(true);
        std::lock_guard<std::mutex> lock(captureMutex_);
        if (captureSource_) captureSource_->cancel();
    }
    if (keywordListener_.isRunning()) {
        setStatus("중지 중…");
        keywordListener_.stop();
    }
    if (engine_.isRunning()) {
        setStatus("중지 중…");
        engine_.stop();
    }
    syncButtons();
}

void AppWindow::refreshDevices() {
    devices_ = platform::inputDevices();

    std::vector<const char*> labels;
    labels.reserve(devices_.size() + 1);
    for (const AudioDevice& device : devices_) labels.push_back(device.name.c_str());
    labels.push_back(nullptr);

    GtkStringList* model = gtk_string_list_new(labels.data());
    gtk_drop_down_set_model(GTK_DROP_DOWN(deviceDropdown_), G_LIST_MODEL(model));
    g_object_unref(model);
    if (!devices_.empty()) gtk_drop_down_set_selected(GTK_DROP_DOWN(deviceDropdown_), 0);
}

void AppWindow::chooseModelFolder() {
    GtkFileDialog* dialog = gtk_file_dialog_new();
    gtk_file_dialog_set_title(dialog, "Vosk 모델 디렉터리 선택");
    gtk_file_dialog_select_folder(
        dialog, GTK_WINDOW(window_), nullptr,
        +[](GObject* source, GAsyncResult* result, gpointer self) {
            GError* error = nullptr;
            GFile* folder = gtk_file_dialog_select_folder_finish(GTK_FILE_DIALOG(source), result,
                                                                 &error);
            if (folder) {
                char* path = g_file_get_path(folder);
                auto* window = static_cast<AppWindow*>(self);
                if (path) {
                    gtk_editable_set_text(GTK_EDITABLE(window->modelEntry_), path);
                    g_free(path);
                    window->loadModelAsync();
                }
                g_object_unref(folder);
            }
            if (error) g_error_free(error);
        },
        this);
    g_object_unref(dialog);
}

void AppWindow::chooseWavFile() {
    GtkFileDialog* dialog = gtk_file_dialog_new();
    gtk_file_dialog_set_title(dialog, "인식할 WAV 파일 선택");

    GtkFileFilter* filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "WAV 음원 (16비트 PCM)");
    gtk_file_filter_add_pattern(filter, "*.wav");
    GListStore* filters = g_list_store_new(GTK_TYPE_FILE_FILTER);
    g_list_store_append(filters, filter);
    gtk_file_dialog_set_filters(dialog, G_LIST_MODEL(filters));
    g_object_unref(filter);
    g_object_unref(filters);

    gtk_file_dialog_open(
        dialog, GTK_WINDOW(window_), nullptr,
        +[](GObject* source, GAsyncResult* result, gpointer self) {
            GError* error = nullptr;
            GFile* file = gtk_file_dialog_open_finish(GTK_FILE_DIALOG(source), result, &error);
            if (file) {
                char* path = g_file_get_path(file);
                if (path) {
                    static_cast<AppWindow*>(self)->startWavFile(path);
                    g_free(path);
                }
                g_object_unref(file);
            }
            if (error) g_error_free(error);
        },
        this);
    g_object_unref(dialog);
}

std::string AppWindow::buildReport() {
    updateResourceLabel();

    const auto add = [](std::string* out, const std::string& label, const std::string& value) {
        *out += label;
        *out += ": ";
        *out += value;
        *out += "\n";
    };
    const auto num = [](double value, int digits) {
        char buffer[32];
        std::snprintf(buffer, sizeof(buffer), digits == 0 ? "%.0f" : (digits == 1 ? "%.1f" : "%.2f"),
                      value);
        return std::string(buffer);
    };
    const auto mem = [](unsigned long long bytes) {
        char buffer[64];
        if (bytes >= 1024ull * 1024ull * 1024ull) {
            std::snprintf(buffer, sizeof(buffer), "%.2f GB (%llu 바이트)",
                          static_cast<double>(bytes) / (1024.0 * 1024.0 * 1024.0), bytes);
        } else {
            std::snprintf(buffer, sizeof(buffer), "%.1f MB (%llu 바이트)",
                          static_cast<double>(bytes) / (1024.0 * 1024.0), bytes);
        }
        return std::string(buffer);
    };
    const auto clock = [](unsigned long long hz) {
        char buffer[80];
        if (hz >= 1000000000ull) {
            std::snprintf(buffer, sizeof(buffer), "%llu Hz (%.2f GHz)", hz,
                          static_cast<double>(hz) / 1000000000.0);
        } else if (hz >= 1000000ull) {
            std::snprintf(buffer, sizeof(buffer), "%llu Hz (%.2f MHz)", hz,
                          static_cast<double>(hz) / 1000000.0);
        } else {
            std::snprintf(buffer, sizeof(buffer), "%llu Hz", hz);
        }
        return std::string(buffer);
    };

    GDateTime* now = g_date_time_new_now_local();
    char* stampText = g_date_time_format(now, "%Y-%m-%d %H:%M:%S");
    const std::string stamp = stampText ? stampText : "";
    g_free(stampText);
    g_date_time_unref(now);

    const unsigned cores = logicalCoreCount();
    const unsigned physical = physicalCoreCount();
#if defined(_WIN32)
    const std::uint64_t nowMs = GetTickCount64();
#else
    const std::uint64_t nowMs = static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch())
            .count());
#endif
    const unsigned long long totalSec =
        resourceStartMs_ == 0 || nowMs < resourceStartMs_ ? 0 : (nowMs - resourceStartMs_) / 1000;
    char elapsed[96];
    std::snprintf(elapsed, sizeof(elapsed), "%llu시간 %llu분 %llu초 (표본 %d회, 0.5초 간격)",
                  totalSec / 3600, (totalSec / 60) % 60, totalSec % 60, resourceSamples_);

    std::string text = "한국어 음성 인식 보고서\n";
    add(&text, "작성 시각", stamp);
    add(&text, "측정 구간", elapsed);
    text += "\n[시스템]\n";
    add(&text, "논리 프로세서", std::to_string(cores));
    add(&text, "물리 코어", physical == 0 ? "확인하지 못함" : std::to_string(physical));
    if (lastCurrentHz_ > 0)
        add(&text, "현재 클록", clock(lastCurrentHz_) + " (논리 프로세서 중 가장 높음)");
    if (lastLowestHz_ > 0 && lastLowestHz_ != lastCurrentHz_)
        add(&text, "현재 클록 (가장 낮음)", clock(lastLowestHz_));
    if (lastMaxHz_ > 0) add(&text, "최대 클록", clock(lastMaxHz_));

#if defined(_WIN32)
    MEMORYSTATUSEX system = {};
    system.dwLength = sizeof(system);
    if (GlobalMemoryStatusEx(&system)) {
        add(&text, "시스템 메모리", mem(system.ullTotalPhys));
        add(&text, "사용 가능 메모리", mem(system.ullAvailPhys));
        add(&text, "시스템 메모리 사용률", std::to_string(system.dwMemoryLoad) + " %");
    }
#elif defined(__APPLE__)
    unsigned long long totalMem = 0;
    std::size_t length = sizeof(totalMem);
    if (sysctlbyname("hw.memsize", &totalMem, &length, nullptr, 0) == 0 && totalMem > 0)
        add(&text, "시스템 메모리", mem(totalMem));
#else
    if (std::FILE* file = std::fopen("/proc/meminfo", "r")) {
        char buffer[256];
        unsigned long long totalKb = 0;
        unsigned long long availKb = 0;
        while (std::fgets(buffer, sizeof(buffer), file)) {
            unsigned long long kb = 0;
            if (std::sscanf(buffer, "MemTotal: %llu", &kb) == 1) totalKb = kb;
            if (std::sscanf(buffer, "MemAvailable: %llu", &kb) == 1) availKb = kb;
        }
        std::fclose(file);
        if (totalKb > 0) add(&text, "시스템 메모리", mem(totalKb * 1024ull));
        if (availKb > 0) add(&text, "사용 가능 메모리", mem(availKb * 1024ull));
    }
#endif

    text += "\n[이 프로세스 — 현재]\n";
    add(&text, "메모리 (작업 집합)", lastWorkingSet_ > 0 ? mem(lastWorkingSet_) : "확인하지 못함");
    if (lastPeakWorkingSet_ > 0) add(&text, "최대 작업 집합", mem(lastPeakWorkingSet_));
    if (lastPrivateBytes_ > 0) add(&text, "전용 메모리", mem(lastPrivateBytes_));
    if (lastCpuValid_) {
        add(&text, "CPU 점유율", num(lastCpuPercent_, 1) + " %");
        add(&text, "사용 중인 코어", num(lastCoresUsed_, 1) + " / " + std::to_string(cores));
        text += "코어 계산: CPU 점유율 × 논리 프로세서 / 100. 100% 는 논리 프로세서를 모두 쓰는 상태.\n";
    } else {
        add(&text, "CPU 점유율", "아직 측정 전");
        add(&text, "사용 중인 코어", "아직 측정 전");
    }

#if defined(_WIN32)
    FILETIME creation, exitTime, kernel, user;
    if (GetProcessTimes(GetCurrentProcess(), &creation, &exitTime, &kernel, &user)) {
        const auto seconds = [](const FILETIME& fileTime) {
            ULARGE_INTEGER value;
            value.LowPart = fileTime.dwLowDateTime;
            value.HighPart = fileTime.dwHighDateTime;
            return static_cast<double>(value.QuadPart) / 10000000.0;
        };
        add(&text, "프로세스 CPU 시간 (사용자)", num(seconds(user), 2) + " 초");
        add(&text, "프로세스 CPU 시간 (커널)", num(seconds(kernel), 2) + " 초");
    }
#else
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        const double userSec = usage.ru_utime.tv_sec + usage.ru_utime.tv_usec / 1000000.0;
        const double kernelSec = usage.ru_stime.tv_sec + usage.ru_stime.tv_usec / 1000000.0;
        add(&text, "프로세스 CPU 시간 (사용자)", num(userSec, 2) + " 초");
        add(&text, "프로세스 CPU 시간 (커널)", num(kernelSec, 2) + " 초");
    }
#endif

    text += "\n[이 프로세스 — 측정 구간]\n";
    if (resourceSamples_ > 0) {
        const double average = cpuSum_ / static_cast<double>(resourceSamples_);
        const double averageCores = average / 100.0 * static_cast<double>(cores);
        add(&text, "평균 CPU 점유율", num(average, 1) + " %");
        add(&text, "최대 CPU 점유율", num(cpuPeak_, 1) + " %");
        add(&text, "평균 사용 코어", num(averageCores, 1) + " / " + std::to_string(cores));
        add(&text, "최대 사용 코어", num(coresUsedPeak_, 1) + " / " + std::to_string(cores));
    } else {
        add(&text, "평균 CPU 점유율", "아직 측정 전");
    }
    if (memorySessionPeak_ > 0) add(&text, "최대 메모리 (작업 집합)", mem(memorySessionPeak_));
    if (clockPeakHz_ > 0) add(&text, "최고 클록", clock(clockPeakHz_));

    text += "\n[인식]\n";
    std::string activity = "대기";
    if (training_)
        activity = "학습 중";
    else if (recording_)
        activity = "키워드 녹음 중";
    else if (keywordListener_.isRunning())
        activity = "인식 중 (키워드 모델)";
    else if (engine_.isRunning())
        activity = "인식 중 (Vosk)";
    else if (loading_)
        activity = "모델 적재 중";
    else if (engine_.isModelLoaded())
        activity = "대기 (모델 준비됨)";
    add(&text, "상태", activity);
    add(&text, "키워드 모델로 인식",
        gtk_check_button_get_active(GTK_CHECK_BUTTON(keywordCheck_)) ? "켜짐" : "꺼짐");
    add(&text, "창의 모델 경로", gtk_editable_get_text(GTK_EDITABLE(modelEntry_)));
    add(&text, "창의 받는 말", gtk_editable_get_text(GTK_EDITABLE(vocabEntry_)));

    const guint deviceIndex = gtk_drop_down_get_selected(GTK_DROP_DOWN(deviceDropdown_));
    std::string deviceName = "(선택 없음)";
    if (deviceIndex != GTK_INVALID_LIST_POSITION && deviceIndex < devices_.size()) {
        deviceName = devices_[deviceIndex].name + " (번호 " + std::to_string(devices_[deviceIndex].id) +
                     ")";
    }
    add(&text, "입력 장치", deviceName);

    if (engine_.isModelLoaded()) {
        const EngineConfig& config = engine_.config();
        add(&text, "적재된 모델", config.modelPath);
        add(&text, "libvosk", engine_.voskLibraryPath());
        add(&text, "표본율", std::to_string(config.sampleRate) + " Hz");
        const std::string words = formatVocabulary(config.vocabulary);
        add(&text, "적재된 받는 말", words.empty() ? "(한정 없음)" : words);
        const std::vector<std::string> unknown = engine_.unknownWords();
        add(&text, "모델이 모르는 말", unknown.empty() ? "없음" : formatVocabulary(unknown));
        add(&text, "무음 거르기", config.gateSilence ? "켜짐" : "꺼짐");
        add(&text, "유성음 RMS 기준",
            config.silenceThreshold <= 0.0f ? "자동" : num(config.silenceThreshold, 2));
        add(&text, "최소 발화", std::to_string(config.minSpeechMillis) + " ms");
        add(&text, "최소 신뢰도", num(config.minConfidence, 2));
        add(&text, "최대 영교차율", num(config.maxZeroCrossingRate, 2));
        add(&text, "최소 발화 비율", num(config.minVoicedFraction, 2));
        add(&text, "최대 낱말 길이", num(config.maxWordSeconds, 1) + " 초");
    } else {
        add(&text, "Vosk 모델", "아직 적재되지 않음");
    }

    text += "\n[키워드 모델]\n";
    add(&text, "작업 폴더", workspace_.root());
    add(&text, "모델 파일", workspace_.modelPath());
    std::error_code sizeError;
    const auto modelBytes =
        std::filesystem::file_size(std::filesystem::u8path(workspace_.modelPath()), sizeError);
    add(&text, "모델 파일 크기", sizeError ? "파일 없음" : formatByteSize(modelBytes));
    add(&text, "키워드 표본율", std::to_string(kKeywordSampleRate) + " Hz");
    add(&text, "특징 차원", std::to_string(kKeywordFeatDim));
    if (keywordReady_) {
        add(&text, "학습된 말", keywordModel_.summary());
        for (const KeywordClass& cls : keywordModel_.classes()) {
            add(&text, cls.word,
                "녹음 " + std::to_string(cls.exemplars.size()) + "개, 작업 폴더 " +
                    std::to_string(workspace_.sampleCount(cls.word)) + "개, 문턱 " +
                    num(cls.threshold, 2));
        }
    } else {
        add(&text, "학습된 모델", "없음");
        for (const std::string& word : workspace_.words()) {
            add(&text, word, "폴더 음원 " + std::to_string(workspace_.sampleCount(word)) + "개");
        }
    }

    text += "\n[인식 집계]\n";
    if (tally_.empty()) {
        text += "아직 없음\n";
    } else {
        int total = 0;
        for (const auto& [word, count] : tally_) {
            add(&text, word, std::to_string(count) + "회");
            total += count;
        }
        add(&text, "합계", std::to_string(total) + "회");
    }
    return text;
}

void AppWindow::writeReport() {
    pendingReport_ = buildReport();
    GDateTime* now = g_date_time_new_now_local();
    char* name = g_date_time_format(now, "보고서-%Y%m%d-%H%M%S.txt");
    g_date_time_unref(now);

    GtkFileDialog* dialog = gtk_file_dialog_new();
    gtk_file_dialog_set_title(dialog, "보고서 저장");
    gtk_file_dialog_set_initial_name(dialog, name ? name : "보고서.txt");
    g_free(name);
    gtk_file_dialog_save(
        dialog, GTK_WINDOW(window_), nullptr,
        +[](GObject* source, GAsyncResult* result, gpointer self) {
            GError* error = nullptr;
            GFile* file = gtk_file_dialog_save_finish(GTK_FILE_DIALOG(source), result, &error);
            auto* window = static_cast<AppWindow*>(self);
            if (file) {
                const std::string body = std::string("\xEF\xBB\xBF") + window->pendingReport_;
                GError* writeError = nullptr;
                if (!g_file_replace_contents(file, body.data(), body.size(), nullptr, FALSE,
                                             G_FILE_CREATE_NONE, nullptr, nullptr, &writeError)) {
                    window->setStatus(writeError ? writeError->message : "보고서를 저장할 수 없습니다.",
                                      true);
                    if (writeError) g_error_free(writeError);
                } else {
                    char* path = g_file_get_path(file);
                    const std::string saved = path ? path : "";
                    g_free(path);
                    std::error_code sizeError;
                    const auto bytes = std::filesystem::file_size(
                        std::filesystem::u8path(saved), sizeError);
                    const std::string sizeText =
                        sizeError ? "크기를 확인하지 못했습니다." : formatByteSize(bytes);
                    const std::string detail = "저장 경로\n" + saved + "\n\n파일 크기\n" + sizeText +
                                               "\n\n" + window->pendingReport_;
                    window->setStatus("보고서를 저장했습니다: " + saved);
                    GtkAlertDialog* alert = gtk_alert_dialog_new("%s", "보고서를 저장했습니다.");
                    gtk_alert_dialog_set_detail(alert, detail.c_str());
                    gtk_alert_dialog_show(alert, GTK_WINDOW(window->window_));
                    g_object_unref(alert);
                }
                g_object_unref(file);
            }
            if (error) g_error_free(error);
        },
        this);
    g_object_unref(dialog);
}

void AppWindow::saveTranscript() {
    GtkFileDialog* dialog = gtk_file_dialog_new();
    gtk_file_dialog_set_title(dialog, "인식 결과 저장");
    gtk_file_dialog_set_initial_name(dialog, "인식결과.txt");
    gtk_file_dialog_save(
        dialog, GTK_WINDOW(window_), nullptr,
        +[](GObject* source, GAsyncResult* result, gpointer self) {
            GError* error = nullptr;
            GFile* file = gtk_file_dialog_save_finish(GTK_FILE_DIALOG(source), result, &error);
            auto* window = static_cast<AppWindow*>(self);
            if (file) {
                GtkTextIter start;
                GtkTextIter end;
                gtk_text_buffer_get_bounds(window->transcriptBuffer_, &start, &end);
                char* text = gtk_text_buffer_get_text(window->transcriptBuffer_, &start, &end,
                                                      FALSE);
                GError* writeError = nullptr;
                if (!g_file_replace_contents(file, text ? text : "", text ? strlen(text) : 0,
                                             nullptr, FALSE, G_FILE_CREATE_NONE, nullptr, nullptr,
                                             &writeError)) {
                    window->setStatus(writeError ? writeError->message : "저장 실패", true);
                } else {
                    char* path = g_file_get_path(file);
                    window->setStatus(std::string("저장했습니다: ") + (path ? path : ""));
                    g_free(path);
                }
                if (writeError) g_error_free(writeError);
                g_free(text);
                g_object_unref(file);
            }
            if (error) g_error_free(error);
        },
        this);
    g_object_unref(dialog);
}

void AppWindow::clearTranscript() {
    gtk_text_buffer_set_text(transcriptBuffer_, "", -1);
    setPartial(std::string());
    tally_.clear();
    updateTally();
}

// 받은 말마다 몇 번씩 들렸는지 — "출근 2회 · 퇴근 1회"
void AppWindow::updateTally() {
    std::string text;
    for (const auto& [word, count] : tally_) {
        if (!text.empty()) text += "  ·  ";
        text += word + " " + std::to_string(count) + "회";
    }
    gtk_label_set_text(GTK_LABEL(tallyLabel_), text.c_str());
}

void AppWindow::setResourceMonitor(bool on) {
    if (cpuMonitor_ == on) return;
    cpuMonitor_ = on;
    cpuHaveSample_ = false;
    if (on) {
#if defined(_WIN32)
        resourceStartMs_ = GetTickCount64();
#else
        resourceStartMs_ = static_cast<std::uint64_t>(
            std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now().time_since_epoch())
                .count());
#endif
        double unused = 0.0;
        sampleProcessCpu(&unused);
        updateResourceLabel();
        cpuTimer_ = g_timeout_add(500, +[](gpointer self) -> gboolean {
            auto* window = static_cast<AppWindow*>(self);
            if (!window->alive_->load() || !window->cpuMonitor_) return G_SOURCE_REMOVE;
            window->updateResourceLabel();
            return G_SOURCE_CONTINUE;
        }, this);
    } else if (cpuTimer_ != 0) {
        g_source_remove(cpuTimer_);
        cpuTimer_ = 0;
    }
}

void AppWindow::updateResourceLabel() {
    double percent = 0.0;
    const bool haveCpu = sampleProcessCpu(&percent);
    unsigned long long bytes = 0;
    const bool haveMemory = sampleProcessMemory(&bytes);
    const unsigned cores = logicalCoreCount();
    char memory[32];
    if (!haveMemory) {
        std::snprintf(memory, sizeof(memory), "메모리 …");
    } else if (bytes >= 1024ull * 1024ull * 1024ull) {
        std::snprintf(memory, sizeof(memory), "메모리 %.1f GB",
                      static_cast<double>(bytes) / (1024.0 * 1024.0 * 1024.0));
    } else {
        std::snprintf(memory, sizeof(memory), "메모리 %.1f MB",
                      static_cast<double>(bytes) / (1024.0 * 1024.0));
    }
    const bool haveClock = sampleCpuClock();
    char clockText[32];
    if (haveClock && lastCurrentHz_ >= 1000000000ull) {
        std::snprintf(clockText, sizeof(clockText), "%.2f GHz",
                      static_cast<double>(lastCurrentHz_) / 1000000000.0);
    } else if (haveClock) {
        std::snprintf(clockText, sizeof(clockText), "%llu Hz", lastCurrentHz_);
    } else {
        std::snprintf(clockText, sizeof(clockText), "… GHz");
    }
    char cpuText[32];
    char coresText[32];
    if (haveCpu) {
        double used = percent / 100.0 * static_cast<double>(cores);
        if (used > static_cast<double>(cores)) used = static_cast<double>(cores);
        lastCpuValid_ = true;
        lastCpuPercent_ = percent;
        lastCoresUsed_ = used;
        cpuSum_ += percent;
        ++resourceSamples_;
        if (percent > cpuPeak_) cpuPeak_ = percent;
        if (used > coresUsedPeak_) coresUsedPeak_ = used;
        std::snprintf(cpuText, sizeof(cpuText), "CPU %.1f%%", percent);
        std::snprintf(coresText, sizeof(coresText), "%.1f/%u코어", used, cores);
    } else {
        std::snprintf(cpuText, sizeof(cpuText), "CPU …");
        std::snprintf(coresText, sizeof(coresText), "…/%u코어", cores);
    }
    if (haveMemory) {
        lastWorkingSet_ = bytes;
        if (bytes > memorySessionPeak_) memorySessionPeak_ = bytes;
    }
    if (statusMemLabel_) gtk_label_set_text(GTK_LABEL(statusMemLabel_), memory);
    if (cpuLabel_) gtk_label_set_text(GTK_LABEL(cpuLabel_), cpuText);
    if (statusCoresLabel_) gtk_label_set_text(GTK_LABEL(statusCoresLabel_), coresText);
    if (statusClockLabel_) gtk_label_set_text(GTK_LABEL(statusClockLabel_), clockText);
    pollSampleCounts();
}

bool AppWindow::sampleProcessMemory(unsigned long long* bytes) {
#if defined(_WIN32)
    PROCESS_MEMORY_COUNTERS_EX counters = {};
    counters.cb = sizeof(counters);
    if (!GetProcessMemoryInfo(GetCurrentProcess(),
                              reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&counters),
                              sizeof(counters)))
        return false;
    lastPeakWorkingSet_ = counters.PeakWorkingSetSize;
    lastPrivateBytes_ = counters.PrivateUsage;
    if (bytes) *bytes = counters.WorkingSetSize;
    return true;
#elif defined(__APPLE__)
    mach_task_basic_info info;
    mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
    if (task_info(mach_task_self(), MACH_TASK_BASIC_INFO, reinterpret_cast<task_info_t>(&info),
                  &count) != KERN_SUCCESS)
        return false;
    lastPeakWorkingSet_ = info.resident_size_max;
    if (bytes) *bytes = info.resident_size;
    return true;
#else
    std::FILE* file = std::fopen("/proc/self/status", "r");
    if (!file) return false;
    char buffer[256];
    unsigned long rssKb = 0;
    unsigned long hwmKb = 0;
    bool found = false;
    while (std::fgets(buffer, sizeof(buffer), file)) {
        unsigned long kb = 0;
        if (std::sscanf(buffer, "VmRSS: %lu", &kb) == 1) {
            rssKb = kb;
            found = true;
        } else if (std::sscanf(buffer, "VmHWM: %lu", &kb) == 1) {
            hwmKb = kb;
        }
    }
    std::fclose(file);
    if (!found) return false;
    lastPeakWorkingSet_ = static_cast<unsigned long long>(hwmKb) * 1024ull;
    if (bytes) *bytes = static_cast<unsigned long long>(rssKb) * 1024ull;
    return true;
#endif
}

unsigned AppWindow::logicalCoreCount() {
    if (logicalCores_ == 0) {
#if defined(_WIN32)
        const DWORD count = GetActiveProcessorCount(ALL_PROCESSOR_GROUPS);
        logicalCores_ = count == 0 ? 1u : count;
#else
        const long count = sysconf(_SC_NPROCESSORS_ONLN);
        logicalCores_ = count < 1 ? 1u : static_cast<unsigned>(count);
#endif
    }
    return logicalCores_;
}

unsigned AppWindow::physicalCoreCount() {
    if (physicalCoresKnown_) return physicalCores_;
    physicalCoresKnown_ = true;
#if defined(_WIN32)
    DWORD bytes = 0;
    GetLogicalProcessorInformation(nullptr, &bytes);
    if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || bytes == 0) return 0;
    std::vector<SYSTEM_LOGICAL_PROCESSOR_INFORMATION> info(
        bytes / sizeof(SYSTEM_LOGICAL_PROCESSOR_INFORMATION));
    if (!GetLogicalProcessorInformation(info.data(), &bytes)) return 0;
    unsigned count = 0;
    const std::size_t n = bytes / sizeof(SYSTEM_LOGICAL_PROCESSOR_INFORMATION);
    for (std::size_t i = 0; i < n && i < info.size(); ++i) {
        if (info[i].Relationship == RelationProcessorCore) ++count;
    }
    physicalCores_ = count;
#elif defined(__APPLE__)
    int physical = 0;
    std::size_t length = sizeof(physical);
    if (sysctlbyname("hw.physicalcpu", &physical, &length, nullptr, 0) == 0 && physical > 0)
        physicalCores_ = static_cast<unsigned>(physical);
#else
    std::FILE* file = std::fopen("/proc/cpuinfo", "r");
    if (file) {
        char buffer[256];
        int physicalId = -1;
        int coreId = -1;
        std::vector<std::pair<int, int>> seen;
        const auto consider = [&]() {
            if (physicalId < 0 || coreId < 0) return;
            const std::pair<int, int> key{physicalId, coreId};
            if (std::find(seen.begin(), seen.end(), key) == seen.end()) seen.push_back(key);
            physicalId = -1;
            coreId = -1;
        };
        while (std::fgets(buffer, sizeof(buffer), file)) {
            int value = 0;
            if (std::sscanf(buffer, "physical id : %d", &value) == 1) {
                consider();
                physicalId = value;
            } else if (std::sscanf(buffer, "core id : %d", &value) == 1) {
                coreId = value;
            } else if (buffer[0] == '\n') {
                consider();
            }
        }
        consider();
        std::fclose(file);
        physicalCores_ = static_cast<unsigned>(seen.size());
    }
#endif
    return physicalCores_;
}

bool AppWindow::sampleCpuClock() {
#if defined(_WIN32)
    struct CpuPowerInfo {
        ULONG number;
        ULONG maxMhz;
        ULONG currentMhz;
        ULONG mhzLimit;
        ULONG maxIdleState;
        ULONG currentIdleState;
    };
    const auto read = [this](unsigned count) {
        if (count == 0) return false;
        std::vector<CpuPowerInfo> cpus(count);
        const ULONG bytes = static_cast<ULONG>(cpus.size() * sizeof(CpuPowerInfo));
        if (CallNtPowerInformation(ProcessorInformation, nullptr, 0, cpus.data(), bytes) != 0)
            return false;
        ULONG high = 0;
        ULONG low = ~0u;
        ULONG maxMhz = 0;
        for (const CpuPowerInfo& cpu : cpus) {
            if (cpu.currentMhz > high) high = cpu.currentMhz;
            if (cpu.currentMhz > 0 && cpu.currentMhz < low) low = cpu.currentMhz;
            if (cpu.maxMhz > maxMhz) maxMhz = cpu.maxMhz;
        }
        if (high == 0) return false;
        lastCurrentHz_ = static_cast<unsigned long long>(high) * 1000000ull;
        lastLowestHz_ = static_cast<unsigned long long>(low) * 1000000ull;
        lastMaxHz_ = static_cast<unsigned long long>(maxMhz) * 1000000ull;
        if (lastCurrentHz_ > clockPeakHz_) clockPeakHz_ = lastCurrentHz_;
        return true;
    };
    SYSTEM_INFO info = {};
    GetSystemInfo(&info);
    if (read(info.dwNumberOfProcessors)) return true;
    return read(logicalCoreCount());
#elif defined(__APPLE__)
    std::uint64_t current = 0;
    std::uint64_t maximum = 0;
    std::size_t length = sizeof(current);
    const bool haveCurrent = sysctlbyname("hw.cpufrequency", &current, &length, nullptr, 0) == 0 &&
                             current > 0;
    length = sizeof(maximum);
    const bool haveMax =
        sysctlbyname("hw.cpufrequency_max", &maximum, &length, nullptr, 0) == 0 && maximum > 0;
    if (!haveCurrent && !haveMax) return false;
    lastCurrentHz_ = haveCurrent ? current : maximum;
    lastLowestHz_ = lastCurrentHz_;
    lastMaxHz_ = haveMax ? maximum : lastCurrentHz_;
    if (lastCurrentHz_ > clockPeakHz_) clockPeakHz_ = lastCurrentHz_;
    return true;
#else
    unsigned long long high = 0;
    unsigned long long low = ~0ull;
    unsigned long long maxHz = 0;
    const unsigned cores = logicalCoreCount();
    for (unsigned i = 0; i < cores; ++i) {
        char path[128];
        std::snprintf(path, sizeof(path),
                      "/sys/devices/system/cpu/cpu%u/cpufreq/scaling_cur_freq", i);
        if (std::FILE* file = std::fopen(path, "r")) {
            unsigned long khz = 0;
            if (std::fscanf(file, "%lu", &khz) == 1 && khz > 0) {
                const unsigned long long hz = static_cast<unsigned long long>(khz) * 1000ull;
                if (hz > high) high = hz;
                if (hz < low) low = hz;
            }
            std::fclose(file);
        }
        std::snprintf(path, sizeof(path),
                      "/sys/devices/system/cpu/cpu%u/cpufreq/cpuinfo_max_freq", i);
        if (std::FILE* file = std::fopen(path, "r")) {
            unsigned long khz = 0;
            if (std::fscanf(file, "%lu", &khz) == 1 && khz > 0) {
                const unsigned long long hz = static_cast<unsigned long long>(khz) * 1000ull;
                if (hz > maxHz) maxHz = hz;
            }
            std::fclose(file);
        }
    }
    if (high == 0) {
        if (std::FILE* file = std::fopen("/proc/cpuinfo", "r")) {
            char buffer[256];
            while (std::fgets(buffer, sizeof(buffer), file)) {
                double mhz = 0.0;
                if (std::sscanf(buffer, "cpu MHz : %lf", &mhz) == 1 && mhz > 0.0) {
                    const unsigned long long hz = static_cast<unsigned long long>(mhz * 1000000.0);
                    if (hz > high) high = hz;
                    if (hz < low) low = hz;
                }
            }
            std::fclose(file);
        }
    }
    if (high == 0) return false;
    lastCurrentHz_ = high;
    lastLowestHz_ = low == ~0ull ? high : low;
    lastMaxHz_ = maxHz;
    if (lastCurrentHz_ > clockPeakHz_) clockPeakHz_ = lastCurrentHz_;
    return true;
#endif
}

bool AppWindow::sampleProcessCpu(double* percent) {
#if defined(_WIN32)
    FILETIME creation, exitTime, kernel, user;
    if (!GetProcessTimes(GetCurrentProcess(), &creation, &exitTime, &kernel, &user)) return false;
    ULARGE_INTEGER kernelTime;
    ULARGE_INTEGER userTime;
    kernelTime.LowPart = kernel.dwLowDateTime;
    kernelTime.HighPart = kernel.dwHighDateTime;
    userTime.LowPart = user.dwLowDateTime;
    userTime.HighPart = user.dwHighDateTime;
    const std::uint64_t proc = kernelTime.QuadPart + userTime.QuadPart;
    const std::uint64_t wall = GetTickCount64() * 10000ull;
    const DWORD coreCount = GetActiveProcessorCount(ALL_PROCESSOR_GROUPS);
    const double cores = coreCount == 0 ? 1.0 : static_cast<double>(coreCount);
#else
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) != 0) return false;
    const std::uint64_t proc =
        (static_cast<std::uint64_t>(usage.ru_utime.tv_sec) + usage.ru_stime.tv_sec) * 10000000ull +
        (static_cast<std::uint64_t>(usage.ru_utime.tv_usec) + usage.ru_stime.tv_usec) * 10ull;
    const auto now = std::chrono::steady_clock::now().time_since_epoch();
    const std::uint64_t wall =
        static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(now).count() /
                                   100);
    const double cores = static_cast<double>(std::max(1L, sysconf(_SC_NPROCESSORS_ONLN)));
#endif
    bool ready = false;
    if (cpuHaveSample_ && wall > cpuWallNs_ && proc >= cpuProcNs_) {
        const double used = static_cast<double>(proc - cpuProcNs_);
        const double elapsed = static_cast<double>(wall - cpuWallNs_);
        double value = used / elapsed / cores * 100.0;
        if (value < 0.0) value = 0.0;
        if (value > 100.0) value = 100.0;
        if (percent) *percent = value;
        ready = true;
    }
    cpuHaveSample_ = true;
    cpuWallNs_ = wall;
    cpuProcNs_ = proc;
    return ready;
}

void AppWindow::setStatus(const std::string& text, bool isError) {
    gtk_label_set_text(GTK_LABEL(statusLabel_), text.c_str());
    if (isError)
        gtk_widget_add_css_class(statusLabel_, "kstt-status-error");
    else
        gtk_widget_remove_css_class(statusLabel_, "kstt-status-error");
}

void AppWindow::appendFinal(const Transcript& result) {
    if (result.text.empty()) return;
    ++tally_[result.text];
    updateTally();
    GtkTextIter end;
    gtk_text_buffer_get_end_iter(transcriptBuffer_, &end);
    const std::string line = "[" + timeStamp() + "] " + result.text + "\n";
    gtk_text_buffer_insert(transcriptBuffer_, &end, line.c_str(), -1);

    // 늘 마지막 줄이 보이게 따라 내린다.
    gtk_text_buffer_get_end_iter(transcriptBuffer_, &end);
    GtkTextMark* mark = gtk_text_buffer_create_mark(transcriptBuffer_, nullptr, &end, FALSE);
    gtk_text_view_scroll_to_mark(GTK_TEXT_VIEW(transcriptView_), mark, 0.0, FALSE, 0.0, 0.0);
    gtk_text_buffer_delete_mark(transcriptBuffer_, mark);
}

void AppWindow::setPartial(const std::string& text) {
    gtk_label_set_text(GTK_LABEL(partialLabel_), text.empty() ? "" : ("… " + text).c_str());
}

bool AppWindow::wantKeyword() const {
    return keywordCheck_ && gtk_check_button_get_active(GTK_CHECK_BUTTON(keywordCheck_));
}

int AppWindow::selectedDeviceId() const {
    const guint selected = gtk_drop_down_get_selected(GTK_DROP_DOWN(deviceDropdown_));
    if (selected != GTK_INVALID_LIST_POSITION && static_cast<size_t>(selected) < devices_.size())
        return devices_[selected].id;
    return -1;
}

std::string AppWindow::selectedKeyword() const {
    GtkListBoxRow* row = gtk_list_box_get_selected_row(GTK_LIST_BOX(keywordList_));
    if (!row) return {};
    const int index = gtk_list_box_row_get_index(row);
    const std::vector<std::string> words = workspace_.words();
    if (index < 0 || static_cast<size_t>(index) >= words.size()) return {};
    return words[static_cast<size_t>(index)];
}

void AppWindow::prepareKeywords() {
    std::string err;
    if (!workspace_.prepare(&err)) {
        setStatus(err, true);
        refreshKeywordList();
        return;
    }
    if (keywordModel_.load(workspace_.modelPath(), &err)) {
        keywordReady_ = true;
        adoptTrainedModel();
    }
    refreshKeywordList();
}

void AppWindow::fitKeywordList() {
    if (!keywordList_ || !keywordScroller_) return;
    int minimum = 0;
    int natural = 0;
    gtk_widget_measure(keywordList_, GTK_ORIENTATION_VERTICAL, 160, &minimum, &natural, nullptr,
                       nullptr);
    const int height = std::max(minimum, natural);
    if (height <= 0) return;
    gtk_scrolled_window_set_min_content_height(GTK_SCROLLED_WINDOW(keywordScroller_), height);
}

void AppWindow::refreshKeywordList() {
    int previous = 0;
    if (GtkListBoxRow* row = gtk_list_box_get_selected_row(GTK_LIST_BOX(keywordList_)))
        previous = gtk_list_box_row_get_index(row);
    while (GtkListBoxRow* row = gtk_list_box_get_row_at_index(GTK_LIST_BOX(keywordList_), 0))
        gtk_list_box_remove(GTK_LIST_BOX(keywordList_), GTK_WIDGET(row));

    const std::vector<std::string> words = workspace_.words();
    for (const std::string& word : words) {
        const std::string line = word + "    음원 " + std::to_string(workspace_.sampleCount(word)) + "개";
        GtkWidget* label = gtk_label_new(line.c_str());
        gtk_label_set_xalign(GTK_LABEL(label), 0.0f);
        gtk_widget_set_margin_start(label, 8);
        gtk_widget_set_margin_end(label, 8);
        gtk_widget_set_margin_top(label, 2);
        gtk_widget_set_margin_bottom(label, 2);
        gtk_list_box_append(GTK_LIST_BOX(keywordList_), label);
    }
    if (!words.empty()) {
        if (previous < 0 || previous >= static_cast<int>(words.size())) previous = 0;
        if (GtkListBoxRow* row =
                gtk_list_box_get_row_at_index(GTK_LIST_BOX(keywordList_), previous))
            gtk_list_box_select_row(GTK_LIST_BOX(keywordList_), row);
    }
    fitKeywordList();
    sampleWatch_.clear();
    for (const std::string& word : words) {
        sampleWatch_ += word;
        sampleWatch_.push_back('\t');
        sampleWatch_ += std::to_string(workspace_.sampleCount(word));
        sampleWatch_.push_back('\n');
    }
    const std::string info = keywordReady_ ? "모델 있음 · " + keywordModel_.summary()
                                           : "녹음은 keyword-workspace 에 쌓입니다";
    gtk_label_set_text(GTK_LABEL(keywordInfo_), info.c_str());
}

void AppWindow::addKeyword() {
    std::string err;
    if (!workspace_.addWord(gtk_editable_get_text(GTK_EDITABLE(keywordEntry_)), &err)) {
        setStatus(err, true);
        return;
    }
    gtk_editable_set_text(GTK_EDITABLE(keywordEntry_), "");
    refreshKeywordList();
    const int last = static_cast<int>(workspace_.words().size()) - 1;
    if (last >= 0) {
        if (GtkListBoxRow* row = gtk_list_box_get_row_at_index(GTK_LIST_BOX(keywordList_), last))
            gtk_list_box_select_row(GTK_LIST_BOX(keywordList_), row);
    }
    setStatus("말을 넣었습니다. 그 말을 여러 번 녹음한 뒤 학습하세요.");
}

void AppWindow::removeKeyword() {
    const std::string word = selectedKeyword();
    if (word.empty()) {
        setStatus("지울 말을 고르세요.", true);
        return;
    }
    GtkAlertDialog* dialog = gtk_alert_dialog_new("\"%s\" 와 그 녹음을 지울까요?", word.c_str());
    const char* buttons[] = {"삭제", "취소", nullptr};
    gtk_alert_dialog_set_buttons(dialog, buttons);
    gtk_alert_dialog_set_cancel_button(dialog, 1);
    gtk_alert_dialog_set_default_button(dialog, 0);
    auto* owned = new std::string(word);
    gtk_alert_dialog_choose(
        dialog, GTK_WINDOW(window_), nullptr,
        +[](GObject* source, GAsyncResult* result, gpointer data) {
            auto* pair = static_cast<std::pair<AppWindow*, std::string*>*>(data);
            GError* error = nullptr;
            const int choice =
                gtk_alert_dialog_choose_finish(GTK_ALERT_DIALOG(source), result, &error);
            if (!error && choice == 0 && pair->first->alive_->load()) {
                std::string err;
                if (!pair->first->workspace_.removeWord(*pair->second, &err)) {
                    pair->first->setStatus(err, true);
                } else {
                    pair->first->refreshKeywordList();
                    pair->first->setStatus("\"" + *pair->second +
                                           "\" 를 뺐습니다. 장치에 반영하려면 다시 학습하세요.");
                }
            }
            if (error) g_error_free(error);
            delete pair->second;
            delete pair;
        },
        new std::pair<AppWindow*, std::string*>(this, owned));
    g_object_unref(dialog);
}

void AppWindow::moveKeyword(int delta) {
    if (recording_ || training_ || engine_.isRunning() || keywordListener_.isRunning()) return;
    GtkListBoxRow* row = gtk_list_box_get_selected_row(GTK_LIST_BOX(keywordList_));
    if (!row) {
        setStatus("순서를 바꿀 말을 고르세요.", true);
        return;
    }
    const int selected = gtk_list_box_row_get_index(row);
    std::string err;
    if (!workspace_.moveWord(static_cast<std::size_t>(selected), delta, &err)) {
        setStatus(err, true);
        return;
    }
    if (keywordReady_) {
        keywordModel_.orderLike(workspace_.words());
        if (!keywordModel_.save(workspace_.modelPath(), &err)) {
            refreshKeywordList();
            setStatus(err, true);
            syncButtons();
            return;
        }
    }
    refreshKeywordList();
    const int next = selected + delta;
    if (GtkListBoxRow* moved =
            gtk_list_box_get_row_at_index(GTK_LIST_BOX(keywordList_), next))
        gtk_list_box_select_row(GTK_LIST_BOX(keywordList_), moved);
    const std::vector<std::string> words = workspace_.words();
    if (next >= 0 && static_cast<std::size_t>(next) < words.size()) {
        setStatus("\"" + words[static_cast<std::size_t>(next)] + "\" 을 " +
                  (delta < 0 ? "위로" : "아래로") + " 옮겼습니다.");
    }
    syncButtons();
}

void AppWindow::pollSampleCounts() {
    if (!keywordList_ || recording_ || training_) return;
    std::string watch;
    for (const std::string& word : workspace_.words()) {
        watch += word;
        watch.push_back('\t');
        watch += std::to_string(workspace_.sampleCount(word));
        watch.push_back('\n');
    }
    if (watch == sampleWatch_) return;
    refreshKeywordList();
}

void AppWindow::importKeywordFiles() {
    const std::string word = selectedKeyword();
    if (word.empty()) {
        setStatus("음원을 넣을 말을 고르세요.", true);
        return;
    }
    if (recording_ || training_ || engine_.isRunning() || keywordListener_.isRunning()) return;

    GtkFileDialog* dialog = gtk_file_dialog_new();
    gtk_file_dialog_set_title(dialog, "학습에 넣을 WAV 음원");
    gtk_file_dialog_set_modal(dialog, TRUE);
    GtkFileFilter* filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "WAV 음원");
    gtk_file_filter_add_pattern(filter, "*.wav");
    gtk_file_filter_add_pattern(filter, "*.WAV");
    GListStore* filters = g_list_store_new(GTK_TYPE_FILE_FILTER);
    g_list_store_append(filters, filter);
    gtk_file_dialog_set_filters(dialog, G_LIST_MODEL(filters));
    g_object_unref(filter);
    g_object_unref(filters);
    auto* owned = new std::string(word);
    gtk_file_dialog_open_multiple(
        dialog, GTK_WINDOW(window_), nullptr,
        +[](GObject* source, GAsyncResult* result, gpointer data) {
            auto* pair = static_cast<std::pair<AppWindow*, std::string*>*>(data);
            GError* error = nullptr;
            GListModel* files =
                gtk_file_dialog_open_multiple_finish(GTK_FILE_DIALOG(source), result, &error);
            if (files && pair->first->alive_->load()) {
                int added = 0;
                std::string err;
                const guint count = g_list_model_get_n_items(files);
                for (guint i = 0; i < count; ++i) {
                    GFile* file = G_FILE(g_list_model_get_item(files, i));
                    char* path = g_file_get_path(file);
                    if (path && pair->first->workspace_.importSample(*pair->second, path, &err))
                        ++added;
                    g_free(path);
                    g_object_unref(file);
                }
                pair->first->refreshKeywordList();
                if (added == 0) {
                    pair->first->setStatus(err.empty() ? "음원을 넣지 못했습니다." : err, true);
                } else {
                    pair->first->setStatus("\"" + *pair->second + "\" 에 음원 " +
                                           std::to_string(added) + "개를 넣었습니다. 학습에 바로 씁니다.");
                }
                pair->first->syncButtons();
                g_object_unref(files);
            }
            if (error) g_error_free(error);
            delete pair->second;
            delete pair;
        },
        new std::pair<AppWindow*, std::string*>(this, owned));
    g_object_unref(dialog);
}

void AppWindow::recordKeyword() {
    const std::string word = selectedKeyword();
    if (word.empty()) {
        setStatus("녹음할 말을 고르세요.", true);
        return;
    }
    if (recording_ || training_ || engine_.isRunning() || keywordListener_.isRunning()) return;
    if (recordThread_.joinable()) recordThread_.join();

    const int deviceId = selectedDeviceId();
    recordCancel_.store(false);
    recording_ = true;
    setStatus("\"" + word + "\" 를 말한 뒤 잠시 멈추세요.");
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
                postToMain([this, rms] {
                    const double shaped = std::min(1.0, std::sqrt(static_cast<double>(rms)) * 1.6);
                    gtk_level_bar_set_value(GTK_LEVEL_BAR(levelBar_), shaped);
                });
            },
            &recordCancel_);
        bool ok = captured;
        if (ok) {
            const std::string path = workspace_.allocateSamplePath(word);
            ok = writeWav16(path, samples.data(), samples.size(), kKeywordSampleRate, &err);
        }
        const std::string message = ok ? "\"" + word + "\" 녹음을 저장했습니다." : err;
        postToMain([this, ok, message] {
            recording_ = false;
            {
                std::lock_guard<std::mutex> lock(captureMutex_);
                captureSource_.reset();
            }
            gtk_level_bar_set_value(GTK_LEVEL_BAR(levelBar_), 0.0);
            refreshKeywordList();
            setStatus(message, !ok);
            syncButtons();
        });
    });
}

void AppWindow::trainKeywords() {
    if (recording_ || training_ || engine_.isRunning() || keywordListener_.isRunning()) return;
    if (trainThread_.joinable()) trainThread_.join();
    training_ = true;
    setStatus("학습합니다…");
    syncButtons();

    trainThread_ = std::thread([this] {
        KeywordModel trained;
        KeywordTrainReport report;
        std::string err;
        const bool trainedOk = trainKeywordModel(workspace_, &trained, &report, &err);
        std::string message = err;
        bool ok = trainedOk && trained.save(workspace_.modelPath(), &err);
        if (trainedOk && ok) {
            const std::string savedPath = workspace_.modelPath();
            std::error_code sizeError;
            const auto bytes =
                std::filesystem::file_size(std::filesystem::u8path(savedPath), sizeError);
            const std::string sizeText =
                sizeError ? "크기를 확인하지 못했습니다." : formatByteSize(bytes);
            std::string learned;
            for (const KeywordClass& cls : trained.classes_) {
                if (!learned.empty()) learned += "\n";
                learned += cls.word + "    녹음 " + std::to_string(cls.exemplars.size()) + "개";
            }
            const std::string skipped = report.skippedWords.empty()
                                            ? "없음"
                                            : formatVocabulary(report.skippedWords);
            message = "저장 경로\n" + savedPath + "\n\n파일 크기\n" + sizeText + "\n\n학습된 말  " +
                      std::to_string(report.words) + "개 · 녹음 " + std::to_string(report.samples) +
                      "개\n" + learned + "\n\n표본율\n" + std::to_string(kKeywordSampleRate) +
                      " Hz\n\n넣지 못한 말\n" + skipped + "\n\n쓰지 못한 음원\n" +
                      (report.unreadableFiles.empty() ? "없음"
                                                      : formatVocabulary(report.unreadableFiles)) +
                      "\n\n이 프로그램도 이제 이 학습 모델로 인식합니다.\n"
                      "이 파일을 장치에 복사하면 같은 말을 인식합니다.";
        } else if (trainedOk) {
            message = err;
            ok = false;
        }
        postToMain([this, ok, message] {
            training_ = false;
            if (ok) {
                std::string loadError;
                keywordReady_ = keywordModel_.load(workspace_.modelPath(), &loadError);
                if (keywordReady_) adoptTrainedModel();
                std::string detail = message;
                if (!keywordReady_) {
                    detail += "\n\n모델을 다시 읽지 못했습니다.\n" + loadError;
                    setStatus(loadError, true);
                }
                GtkAlertDialog* dialog = gtk_alert_dialog_new("%s", "학습이 완료되었습니다.");
                gtk_alert_dialog_set_detail(dialog, detail.c_str());
                gtk_alert_dialog_show(dialog, GTK_WINDOW(window_));
                g_object_unref(dialog);
            } else {
                setStatus(message, true);
                GtkAlertDialog* dialog = gtk_alert_dialog_new("%s", "학습에 실패했습니다.");
                gtk_alert_dialog_set_detail(dialog, message.c_str());
                gtk_alert_dialog_show(dialog, GTK_WINDOW(window_));
                g_object_unref(dialog);
            }
            refreshKeywordList();
            syncButtons();
        });
    });
}

void AppWindow::resetKeywordTraining() {
    if (recording_ || training_ || engine_.isRunning() || keywordListener_.isRunning()) return;
    GtkAlertDialog* dialog = gtk_alert_dialog_new("%s", "학습 데이터를 초기화할까요?");
    gtk_alert_dialog_set_detail(dialog,
                                "말 목록은 그대로 둡니다.\n"
                                "녹음과 이 폴더의 학습 모델(model.kmodel)을 지웁니다.\n"
                                "다른 곳에 저장해 둔 파일은 그대로입니다.");
    const char* buttons[] = {"초기화", "취소", nullptr};
    gtk_alert_dialog_set_buttons(dialog, buttons);
    gtk_alert_dialog_set_cancel_button(dialog, 1);
    gtk_alert_dialog_set_default_button(dialog, 1);
    gtk_alert_dialog_choose(
        dialog, GTK_WINDOW(window_), nullptr,
        +[](GObject* source, GAsyncResult* result, gpointer data) {
            auto* window = static_cast<AppWindow*>(data);
            GError* error = nullptr;
            const int choice =
                gtk_alert_dialog_choose_finish(GTK_ALERT_DIALOG(source), result, &error);
            if (!error && choice == 0 && window->alive_->load()) {
                std::string err;
                if (!window->workspace_.resetTraining(&err)) {
                    window->setStatus(err, true);
                } else {
                    window->keywordModel_ = KeywordModel{};
                    window->keywordReady_ = false;
                    window->suppressKeywordToggle_ = true;
                    gtk_check_button_set_active(GTK_CHECK_BUTTON(window->keywordCheck_), FALSE);
                    window->suppressKeywordToggle_ = false;
                    window->refreshKeywordList();
                    if (!window->engine_.isModelLoaded() && !window->loading_)
                        window->loadModelAsync();
                    window->setStatus(
                        "학습 데이터를 지웠습니다. 말은 그대로입니다. 다시 녹음한 뒤 학습하세요.");
                    window->syncButtons();
                }
            }
            if (error) g_error_free(error);
        },
        this);
    g_object_unref(dialog);
}

void AppWindow::exportKeywordModel() {
    if (!keywordReady_) {
        setStatus("내보낼 모델이 없습니다. 먼저 학습하거나 모델 파일을 여세요.", true);
        return;
    }
    GtkFileDialog* dialog = gtk_file_dialog_new();
    gtk_file_dialog_set_title(dialog, "장치에 넣을 키워드 모델 저장");
    gtk_file_dialog_set_initial_name(dialog, "keywords.kmodel");
    GtkFileFilter* filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "키워드 모델");
    gtk_file_filter_add_pattern(filter, "*.kmodel");
    GListStore* filters = g_list_store_new(GTK_TYPE_FILE_FILTER);
    g_list_store_append(filters, filter);
    gtk_file_dialog_set_filters(dialog, G_LIST_MODEL(filters));
    g_object_unref(filter);
    g_object_unref(filters);
    gtk_file_dialog_save(
        dialog, GTK_WINDOW(window_), nullptr,
        +[](GObject* source, GAsyncResult* result, gpointer self) {
            GError* error = nullptr;
            GFile* file = gtk_file_dialog_save_finish(GTK_FILE_DIALOG(source), result, &error);
            auto* window = static_cast<AppWindow*>(self);
            if (file && window->alive_->load()) {
                char* path = g_file_get_path(file);
                std::string err;
                if (!path || !window->keywordModel_.save(path, &err))
                    window->setStatus(err.empty() ? "저장할 수 없습니다." : err, true);
                else
                    window->setStatus(std::string("장치에 넣을 파일을 저장했습니다. 이 파일만 "
                                                  "복사하면 됩니다: ") +
                                      path);
                g_free(path);
                g_object_unref(file);
            }
            if (error) g_error_free(error);
        },
        this);
    g_object_unref(dialog);
}

void AppWindow::openKeywordModel() {
    GtkFileDialog* dialog = gtk_file_dialog_new();
    gtk_file_dialog_set_title(dialog, "키워드 모델 열기");
    GtkFileFilter* filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "키워드 모델");
    gtk_file_filter_add_pattern(filter, "*.kmodel");
    GListStore* filters = g_list_store_new(GTK_TYPE_FILE_FILTER);
    g_list_store_append(filters, filter);
    gtk_file_dialog_set_filters(dialog, G_LIST_MODEL(filters));
    g_object_unref(filter);
    g_object_unref(filters);
    gtk_file_dialog_open(
        dialog, GTK_WINDOW(window_), nullptr,
        +[](GObject* source, GAsyncResult* result, gpointer self) {
            GError* error = nullptr;
            GFile* file = gtk_file_dialog_open_finish(GTK_FILE_DIALOG(source), result, &error);
            auto* window = static_cast<AppWindow*>(self);
            if (file && window->alive_->load()) {
                char* path = g_file_get_path(file);
                KeywordModel loaded;
                std::string err;
                if (!path || !loaded.load(path, &err)) {
                    window->setStatus(err.empty() ? "모델을 열 수 없습니다." : err, true);
                } else {
                    window->keywordModel_ = std::move(loaded);
                    window->keywordReady_ = true;
                    window->refreshKeywordList();
                    window->adoptTrainedModel();
                }
                g_free(path);
                g_object_unref(file);
            }
            if (error) g_error_free(error);
        },
        this);
    g_object_unref(dialog);
}

void AppWindow::adoptTrainedModel() {
    if (keywordCheck_) {
        suppressKeywordToggle_ = true;
        gtk_check_button_set_active(GTK_CHECK_BUTTON(keywordCheck_), TRUE);
        suppressKeywordToggle_ = false;
    }
    engine_.unloadModel();
    if (keywordReady_) setStatus("학습 모델로 인식합니다 · " + keywordModel_.summary());
    syncButtons();
}

void AppWindow::onKeywordToggled() {
    if (suppressKeywordToggle_) return;
    if (wantKeyword()) {
        if (!keywordReady_) {
            suppressKeywordToggle_ = true;
            gtk_check_button_set_active(GTK_CHECK_BUTTON(keywordCheck_), FALSE);
            suppressKeywordToggle_ = false;
            setStatus("학습된 모델이 없습니다. 먼저 학습하거나 모델 파일을 여세요.", true);
        } else {
            adoptTrainedModel();
        }
    } else if (!loading_) {
        loadModelAsync();
    }
    syncButtons();
}

void AppWindow::startKeywordSource(const std::shared_ptr<AudioSource>& source) {
    if (!keywordReady_) {
        setStatus("키워드 모델이 없습니다. 학습하거나 모델 파일을 여세요.", true);
        return;
    }
    std::string err;
    if (!keywordListener_.start(source, keywordModel_, &err)) {
        setStatus(err, true);
        showError(GTK_WINDOW(window_), "키워드 인식을 시작하지 못했습니다.\n\n" + err);
        return;
    }
    syncButtons();
}

void AppWindow::syncButtons() {
    const bool keywordRunning = keywordListener_.isRunning();
    const bool running = engine_.isRunning() || keywordRunning || recording_;
    const bool busy = running || training_ || loading_;
    const bool ready = wantKeyword() ? (keywordReady_ && !training_ && !recording_)
                                     : (engine_.isModelLoaded() && !loading_ && !recording_);

    gtk_widget_set_sensitive(startButton_, ready && !running && !training_);
    gtk_widget_set_sensitive(stopButton_, running);
    gtk_widget_set_sensitive(wavButton_, ready && !running && !training_);
    gtk_widget_set_sensitive(reloadButton_, !busy);
    gtk_widget_set_sensitive(modelEntry_, !busy);
    gtk_widget_set_sensitive(vocabEntry_, !busy);
    gtk_widget_set_sensitive(deviceDropdown_, !running);
    if (!keywordList_) return;
    gtk_widget_set_sensitive(keywordList_, !busy);
    gtk_widget_set_sensitive(keywordEntry_, !busy);
    gtk_widget_set_sensitive(keywordAdd_, !busy);
    gtk_widget_set_sensitive(keywordRemove_, !busy);
    int selected = -1;
    int count = 0;
    if (keywordList_) {
        if (GtkListBoxRow* row = gtk_list_box_get_selected_row(GTK_LIST_BOX(keywordList_)))
            selected = gtk_list_box_row_get_index(row);
        while (gtk_list_box_get_row_at_index(GTK_LIST_BOX(keywordList_), count)) ++count;
    }
    if (keywordUp_) gtk_widget_set_sensitive(keywordUp_, !busy && selected > 0);
    if (keywordDown_)
        gtk_widget_set_sensitive(keywordDown_, !busy && selected >= 0 && selected + 1 < count);
    gtk_widget_set_sensitive(keywordRecord_, !busy);
    if (keywordImport_) gtk_widget_set_sensitive(keywordImport_, !busy);
    gtk_widget_set_sensitive(keywordTrain_, !busy);
    gtk_widget_set_sensitive(keywordReset_, !busy);
    gtk_widget_set_sensitive(keywordExport_, keywordReady_ && !busy);
    gtk_widget_set_sensitive(keywordOpen_, !busy);
    gtk_widget_set_sensitive(keywordCheck_, !running && !recording_);
}

}  // namespace kstt::gui
