#include "app_window.h"

#include <algorithm>
#include <cmath>
#include <cstring>
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
    gtk_window_set_default_size(GTK_WINDOW(window_), 760, 620);
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
                         static_cast<AppWindow*>(self)->stopRecognition();
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

    refreshDevices();

    // 모델 경로 기본값: 자동 탐색 결과
    const std::string found = SttEngine::findDefaultModel();
    if (!found.empty()) gtk_editable_set_text(GTK_EDITABLE(modelEntry_), found.c_str());

    syncButtons();
    loadModelAsync();
}

AppWindow::~AppWindow() {
    *alive_ = false;
    engine_.stop();
    if (loader_.joinable()) loader_.join();
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
    if (!engine_.isModelLoaded()) {
        setStatus("먼저 모델을 적재하세요.", true);
        return;
    }
    engine_.setVocabulary(parseVocabulary(gtk_editable_get_text(GTK_EDITABLE(vocabEntry_))));
    const guint selected = gtk_drop_down_get_selected(GTK_DROP_DOWN(deviceDropdown_));
    int deviceId = -1;
    if (selected != GTK_INVALID_LIST_POSITION && static_cast<size_t>(selected) < devices_.size())
        deviceId = devices_[selected].id;

    std::string err;
    if (!engine_.start(platform::createMicrophone(deviceId), &err)) {
        setStatus(err, true);
        showError(GTK_WINDOW(window_), "마이크를 열 수 없습니다.\n\n" + err);
        return;
    }
    syncButtons();
}

void AppWindow::startWavFile(const std::string& path) {
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
    if (!engine_.isRunning()) return;
    setStatus("중지 중…");
    engine_.stop();
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

void AppWindow::syncButtons() {
    const bool running = engine_.isRunning();
    const bool ready = engine_.isModelLoaded() && !loading_;

    gtk_widget_set_sensitive(startButton_, ready && !running);
    gtk_widget_set_sensitive(stopButton_, running);
    gtk_widget_set_sensitive(wavButton_, ready && !running);
    gtk_widget_set_sensitive(reloadButton_, !loading_ && !running);
    gtk_widget_set_sensitive(modelEntry_, !loading_ && !running);
    gtk_widget_set_sensitive(vocabEntry_, !loading_ && !running);
    gtk_widget_set_sensitive(deviceDropdown_, !running);
}

}  // namespace kstt::gui
