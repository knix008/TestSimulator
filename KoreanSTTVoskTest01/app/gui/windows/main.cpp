// app/gui/windows/main.cpp
//
// Windows 네이티브 GUI 진입점.
#include <windows.h>

#include <commctrl.h>

#include <memory>

#include "main_window.h"

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR commandLine, int showCommand) {
    // --model / --lib 는 환경변수로 코어에 넘긴다 (GUI 는 창에서 바꿀 수 있다).
    int argc = 0;
    if (LPWSTR* argv = CommandLineToArgvW(commandLine, &argc)) {
        for (int i = 0; i < argc; ++i) {
            if (lstrcmpW(argv[i], L"--model") == 0 && i + 1 < argc)
                SetEnvironmentVariableW(L"KSTT_MODEL", argv[++i]);
            else if (lstrcmpW(argv[i], L"--lib") == 0 && i + 1 < argc)
                SetEnvironmentVariableW(L"KSTT_VOSK_LIB", argv[++i]);
        }
        LocalFree(argv);
    }

    SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    INITCOMMONCONTROLSEX controls = {};
    controls.dwSize = sizeof(controls);
    controls.dwICC = ICC_STANDARD_CLASSES | ICC_PROGRESS_CLASS | ICC_BAR_CLASSES;
    InitCommonControlsEx(&controls);

    auto window = std::make_unique<kstt::gui::MainWindow>(instance);
    if (!window->create()) {
        MessageBoxW(nullptr, L"창을 만들 수 없습니다.", L"한국어 음성 인식", MB_OK | MB_ICONERROR);
        return 1;
    }
    window->show(showCommand);

    MSG message;
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
        if (IsDialogMessageW(window->handle(), &message)) continue;  // Tab 이동 지원
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }

    window.reset();  // 엔진을 멈추고 모델을 해제한다
    return static_cast<int>(message.wParam);
}
