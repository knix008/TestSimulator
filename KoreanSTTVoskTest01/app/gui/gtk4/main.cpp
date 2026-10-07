// app/gtk4/main.cpp
//
// GTK4 프런트엔드 진입점.
#include <gtk/gtk.h>

#include <cstdio>
#include <cstring>
#include <memory>
#include <string>

#include "app_window.h"
#include "kstt/platform/audio_input.h"
#include "kstt/stt_engine.h"

namespace {

std::unique_ptr<kstt::gui::AppWindow> g_window;

void onActivate(GtkApplication* app, gpointer) {
    if (!g_window) g_window = std::make_unique<kstt::gui::AppWindow>(app);
    g_window->present();
}

}  // namespace

int main(int argc, char** argv) {
    // 우리 쪽 인자는 GTK 에 넘기지 않고 환경변수로 코어에 전달한다.
    // (GTK 가 모르는 옵션을 받으면 그대로 오류를 내기 때문)
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--model") == 0 && i + 1 < argc) {
            g_setenv("KSTT_MODEL", argv[++i], TRUE);
        } else if (std::strcmp(argv[i], "--lib") == 0 && i + 1 < argc) {
            g_setenv("KSTT_VOSK_LIB", argv[++i], TRUE);
        } else if (std::strcmp(argv[i], "-h") == 0 || std::strcmp(argv[i], "--help") == 0) {
            std::printf(
                "사용법: %s [--model <모델 디렉터리>] [--lib <libvosk 경로>]\n"
                "\n"
                "GUI 창이 열립니다. 모델 경로는 창 안에서도 바꿀 수 있습니다.\n"
                "오디오 백엔드: %s\n",
                argv[0], kstt::platform::backendName());
            return 0;
        }
    }

    GtkApplication* app =
        gtk_application_new("io.github.koreanstt.vosk", G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(app, "activate", G_CALLBACK(onActivate), nullptr);

    // 창·작업 표시줄 아이콘: assets/icons 를 아이콘 테마 경로에 더해 두고
    // 이름으로 찾아 쓰게 한다 (Windows 에서는 실행 파일의 리소스 아이콘도 쓰인다).
    for (const std::string& root : kstt::SttEngine::searchRoots()) {
        const std::string icons = root + "/assets/icons";
        if (!g_file_test(icons.c_str(), G_FILE_TEST_IS_DIR)) continue;
        gtk_icon_theme_add_search_path(gtk_icon_theme_get_for_display(gdk_display_get_default()),
                                       icons.c_str());
        break;
    }

    // GTK 에는 프로그램 이름만 넘긴다.
    char* onlyProgramName[] = {argv[0], nullptr};
    const int status = g_application_run(G_APPLICATION(app), 1, onlyProgramName);

    g_window.reset();  // 엔진을 멈추고 모델을 해제한다
    g_object_unref(app);
    return status;
}
