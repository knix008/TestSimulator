#include "app_window.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <functional>
#include <utility>

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
        ".kstt-status { font-size: 0.9em; opacity: 0.8; }\n"
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

    GtkWidget* root = gtk_box_new(GTK_ORIENTATION_VERTICAL, 12);
    gtk_widget_set_margin_top(root, 12);
    gtk_widget_set_margin_bottom(root, 12);
    gtk_widget_set_margin_start(root, 12);
    gtk_widget_set_margin_end(root, 12);
    gtk_window_set_child(GTK_WINDOW(window_), root);

    gtk_box_append(GTK_BOX(root), buildSettings());
    gtk_box_append(GTK_BOX(root), buildKeywords());
    gtk_box_append(GTK_BOX(root), buildControls());

    statusLabel_ = gtk_label_new("준비 중…");
    gtk_widget_add_css_class(statusLabel_, "kstt-status");
    gtk_label_set_xalign(GTK_LABEL(statusLabel_), 0.0f);
    gtk_label_set_wrap(GTK_LABEL(statusLabel_), TRUE);
    gtk_box_append(GTK_BOX(root), statusLabel_);

    GtkWidget* transcript = buildTranscript();
    gtk_widget_set_vexpand(transcript, TRUE);
    gtk_box_append(GTK_BOX(root), transcript);

    partialLabel_ = gtk_label_new("");
    gtk_widget_add_css_class(partialLabel_, "kstt-partial");
    gtk_label_set_xalign(GTK_LABEL(partialLabel_), 0.0f);
    gtk_label_set_ellipsize(GTK_LABEL(partialLabel_), PANGO_ELLIPSIZE_START);
    gtk_box_append(GTK_BOX(root), partialLabel_);

    g_signal_connect(window_, "close-request", G_CALLBACK(+[](GtkWindow* window,
                                                              gpointer self) -> gboolean {
                         auto* app = static_cast<AppWindow*>(self);
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
    loadModelAsync();
}

AppWindow::~AppWindow() {
    *alive_ = false;
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
    gtk_widget_set_size_request(keywordList_, 160, 96);
    gtk_widget_add_css_class(keywordList_, "boxed-list");
    GtkWidget* scroller = gtk_scrolled_window_new();
    gtk_scrolled_window_set_child(GTK_SCROLLED_WINDOW(scroller), keywordList_);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroller), GTK_POLICY_NEVER,
                                   GTK_POLICY_AUTOMATIC);
    gtk_scrolled_window_set_min_content_height(GTK_SCROLLED_WINDOW(scroller), 96);
    gtk_widget_set_vexpand(scroller, FALSE);
    gtk_grid_attach(GTK_GRID(grid), scroller, 0, 0, 1, 3);

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
    keywordTrain_ = gtk_button_new_with_label("학습");
    keywordExport_ = gtk_button_new_with_label("장치에 저장…");
    keywordOpen_ = gtk_button_new_with_label("모델 열기…");
    g_signal_connect(keywordRecord_, "clicked", G_CALLBACK(+[](GtkButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->recordKeyword();
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
    gtk_box_append(GTK_BOX(actions), keywordTrain_);
    gtk_box_append(GTK_BOX(actions), keywordExport_);
    gtk_box_append(GTK_BOX(actions), keywordOpen_);
    gtk_grid_attach(GTK_GRID(grid), actions, 1, 1, 3, 1);

    keywordCheck_ = gtk_check_button_new_with_label("키워드 모델로 인식");
    g_signal_connect(keywordCheck_, "toggled", G_CALLBACK(+[](GtkCheckButton*, gpointer self) {
                         static_cast<AppWindow*>(self)->syncButtons();
                     }),
                     this);
    gtk_grid_attach(GTK_GRID(grid), keywordCheck_, 1, 2, 1, 1);

    keywordInfo_ = gtk_label_new("녹음은 keyword-workspace 에 쌓입니다");
    gtk_label_set_xalign(GTK_LABEL(keywordInfo_), 0.0f);
    gtk_label_set_ellipsize(GTK_LABEL(keywordInfo_), PANGO_ELLIPSIZE_END);
    gtk_widget_set_hexpand(keywordInfo_, TRUE);
    gtk_grid_attach(GTK_GRID(grid), keywordInfo_, 2, 2, 2, 1);

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

void AppWindow::setStatus(const std::string& text, bool isError) {
    gtk_label_set_text(GTK_LABEL(statusLabel_), text.c_str());
    if (isError)
        gtk_widget_add_css_class(statusLabel_, "error");
    else
        gtk_widget_remove_css_class(statusLabel_, "error");
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
        gtk_check_button_set_active(GTK_CHECK_BUTTON(keywordCheck_), TRUE);
    }
    refreshKeywordList();
}

void AppWindow::refreshKeywordList() {
    int previous = 0;
    if (GtkListBoxRow* row = gtk_list_box_get_selected_row(GTK_LIST_BOX(keywordList_)))
        previous = gtk_list_box_row_get_index(row);
    while (GtkListBoxRow* row = gtk_list_box_get_row_at_index(GTK_LIST_BOX(keywordList_), 0))
        gtk_list_box_remove(GTK_LIST_BOX(keywordList_), GTK_WIDGET(row));

    const std::vector<std::string> words = workspace_.words();
    for (const std::string& word : words) {
        const std::string line = word + "   " + std::to_string(workspace_.sampleCount(word)) + "개";
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
                      " Hz\n\n넣지 못한 말\n" + skipped +
                      "\n\n이 파일을 장치에 복사하면 같은 말을 인식합니다.";
        } else if (trainedOk) {
            message = err;
            ok = false;
        }
        postToMain([this, ok, message] {
            training_ = false;
            if (ok) {
                std::string loadError;
                keywordReady_ = keywordModel_.load(workspace_.modelPath(), &loadError);
                if (keywordReady_)
                    gtk_check_button_set_active(GTK_CHECK_BUTTON(keywordCheck_), TRUE);
                std::string detail = message;
                if (!keywordReady_) detail += "\n\n모델을 다시 읽지 못했습니다.\n" + loadError;
                setStatus(keywordReady_ ? "학습 완료 · " + baseName(workspace_.modelPath())
                                        : loadError,
                          !keywordReady_);
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
                    gtk_check_button_set_active(GTK_CHECK_BUTTON(window->keywordCheck_), TRUE);
                    window->refreshKeywordList();
                    window->setStatus("키워드 모델을 열었습니다 · " + window->keywordModel_.summary());
                    window->syncButtons();
                }
                g_free(path);
                g_object_unref(file);
            }
            if (error) g_error_free(error);
        },
        this);
    g_object_unref(dialog);
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
    gtk_widget_set_sensitive(keywordRecord_, !busy);
    gtk_widget_set_sensitive(keywordTrain_, !busy);
    gtk_widget_set_sensitive(keywordExport_, keywordReady_ && !busy);
    gtk_widget_set_sensitive(keywordOpen_, !busy);
    gtk_widget_set_sensitive(keywordCheck_, !running && !recording_);
}

}  // namespace kstt::gui
