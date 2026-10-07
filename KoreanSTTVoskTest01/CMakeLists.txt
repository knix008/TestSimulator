cmake_minimum_required(VERSION 3.16)
project(KoreanSttVosk VERSION 1.0.0 LANGUAGES CXX)

# ---------------------------------------------------------------------------
# 타깃 구조 (분리가 빌드로 강제된다)
#
#   kstt_core        플랫폼·GUI 무관 STT 코어. Vosk 를 런타임에 동적 적재한다.
#                    GTK 도, 오디오 API 도 링크하지 않는다.
#   kstt_audio       OS별 마이크 캡처 (waveIn / ALSA / CoreAudio).
#   kstt-cli         콘솔 프런트엔드        = core + audio
#   kstt-gui-native  OS 네이티브 GUI        = core + audio + (Win32 / Cocoa)
#   kstt-gui-gtk4    이식 가능한 GTK4 GUI   = core + audio + gtk4
#   kstt-tests       코어 시험              = core 만 (GUI/오디오 없이 돈다)
#
# GUI 는 OS별로 갈라져 있다. 코어와 오디오는 그대로 두고 GUI 디렉터리만 고른다:
#   app/gui/windows   Win32 + 공용 컨트롤 (외부 의존성 0)
#   app/gui/macos     Cocoa (Objective-C++)
#   app/gui/gtk4      GTK4 (Windows·Linux·macOS 공통)
#
# KSTT_GUI 로 무엇을 빌드할지 고른다:
#   native (기본)  그 OS 의 네이티브 GUI. Linux 는 네이티브가 곧 GTK4.
#   gtk4           어느 OS에서나 GTK4 판
#   all            둘 다 (Linux 에서는 GTK4 하나)
#   none           GUI 없이
# ---------------------------------------------------------------------------

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "빌드 종류" FORCE)
endif()

set(KSTT_GUI "native" CACHE STRING "빌드할 GUI: native / gtk4 / all / none")
set_property(CACHE KSTT_GUI PROPERTY STRINGS native gtk4 all none)
option(KSTT_BUILD_CLI "콘솔 프런트엔드를 빌드한다" ON)
option(KSTT_BUILD_TESTS "코어 시험을 빌드한다" ON)

# 실행 파일과 거기에 딸린 공유 라이브러리는 프로젝트 루트에 둔다.
# (중간 산출물 .o/.a 는 build/ 안에 남는다)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR})
# Visual Studio·Xcode 처럼 구성별 하위 폴더를 만드는 생성기에서도 루트로 모은다.
foreach(config ${CMAKE_CONFIGURATION_TYPES})
    string(TOUPPER ${config} config_upper)
    set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_${config_upper} ${CMAKE_CURRENT_SOURCE_DIR})
endforeach()

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(-Wall -Wextra -Wno-unused-parameter)
endif()

# ---------------------------------------------------------------------------
# kstt_core
# ---------------------------------------------------------------------------
add_library(kstt_core STATIC
    core/src/stt_engine.cpp
    core/src/vosk_bind.cpp
    core/src/json_light.cpp
    core/src/paths.cpp
    core/src/text_width.cpp
    core/src/wav_file.cpp
    core/src/vocabulary.cpp
    core/src/word_filter.cpp
)
target_include_directories(kstt_core PUBLIC core/include)
target_include_directories(kstt_core PRIVATE core/src)

find_package(Threads REQUIRED)
target_link_libraries(kstt_core PUBLIC Threads::Threads)

if(UNIX AND NOT APPLE)
    # dlopen/dlsym
    target_link_libraries(kstt_core PUBLIC ${CMAKE_DL_LIBS})
endif()

# ---------------------------------------------------------------------------
# kstt_audio — OS별 마이크 캡처
# ---------------------------------------------------------------------------
if(WIN32)
    set(KSTT_AUDIO_SOURCES platform/windows/wave_in_source.cpp)
elseif(APPLE)
    set(KSTT_AUDIO_SOURCES platform/macos/coreaudio_source.cpp)
else()
    set(KSTT_AUDIO_SOURCES platform/linux/alsa_source.cpp)
endif()

add_library(kstt_audio STATIC ${KSTT_AUDIO_SOURCES})
target_include_directories(kstt_audio PUBLIC platform/include)
target_link_libraries(kstt_audio PUBLIC kstt_core)

if(WIN32)
    target_link_libraries(kstt_audio PUBLIC winmm)
elseif(APPLE)
    target_link_libraries(kstt_audio PUBLIC
        "-framework AudioToolbox" "-framework CoreAudio" "-framework CoreFoundation")
else()
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(ALSA REQUIRED IMPORTED_TARGET alsa)
    target_link_libraries(kstt_audio PUBLIC PkgConfig::ALSA)
endif()

# ---------------------------------------------------------------------------
# 콘솔 프런트엔드
# ---------------------------------------------------------------------------
if(KSTT_BUILD_CLI)
    set(KSTT_CLI_SOURCES app/cli/main.cpp)
    if(WIN32)
        enable_language(RC)
        list(APPEND KSTT_CLI_SOURCES app/app_icon.rc)
    endif()
    add_executable(kstt-cli ${KSTT_CLI_SOURCES})
    target_link_libraries(kstt-cli PRIVATE kstt_core kstt_audio)
endif()

# ---------------------------------------------------------------------------
# GUI 프런트엔드 (OS별로 분리)
# ---------------------------------------------------------------------------
set(KSTT_WANT_NATIVE OFF)
set(KSTT_WANT_GTK4 OFF)
if(KSTT_GUI STREQUAL "native")
    set(KSTT_WANT_NATIVE ON)
elseif(KSTT_GUI STREQUAL "gtk4")
    set(KSTT_WANT_GTK4 ON)
elseif(KSTT_GUI STREQUAL "all")
    set(KSTT_WANT_NATIVE ON)
    set(KSTT_WANT_GTK4 ON)
elseif(NOT KSTT_GUI STREQUAL "none")
    message(FATAL_ERROR
        "KSTT_GUI 는 native / gtk4 / all / none 중 하나여야 합니다 (받은 값: ${KSTT_GUI})")
endif()

# Linux 에는 따로 네이티브 툴킷을 두지 않는다 — 그쪽에서는 GTK4 가 네이티브다.
if(KSTT_WANT_NATIVE AND NOT WIN32 AND NOT APPLE)
    set(KSTT_WANT_NATIVE OFF)
    set(KSTT_WANT_GTK4 ON)
endif()

set(KSTT_GUI_TARGETS "")

# --- Windows 네이티브 (Win32) ---
if(KSTT_WANT_NATIVE AND WIN32)
    enable_language(RC)
    # 매니페스트가 app.rc 옆 상대 경로로 들어가므로 그 폴더를 리소스 포함 경로에 둔다.
    set(CMAKE_RC_FLAGS
        "${CMAKE_RC_FLAGS} -I${CMAKE_CURRENT_SOURCE_DIR}/app/gui/windows -I${CMAKE_CURRENT_SOURCE_DIR}/app")
    add_executable(kstt-gui-native WIN32
        app/gui/windows/main.cpp
        app/gui/windows/main_window.cpp
        app/gui/windows/app.rc
    )
    target_link_libraries(kstt-gui-native PRIVATE
        kstt_core kstt_audio comctl32 comdlg32 shell32 ole32)
    # UNICODE: Win32 API 의 W 판을 쓴다 (한글 경로·장치 이름이 깨지지 않게).
    # _WIN32_WINNT 0x0A00: DPI 관련 함수(GetDpiForWindow 등)가 헤더에서 열린다.
    target_compile_definitions(kstt-gui-native PRIVATE
        UNICODE _UNICODE WINVER=0x0A00 _WIN32_WINNT=0x0A00)
    # -municode: 진입점을 wWinMain 으로 (명령줄 인자를 와이드로 받는다)
    target_link_options(kstt-gui-native PRIVATE -municode)
    list(APPEND KSTT_GUI_TARGETS kstt-gui-native)
    set(KSTT_NATIVE_GUI_NAME "Win32")
endif()

# --- macOS 네이티브 (Cocoa) ---
if(KSTT_WANT_NATIVE AND APPLE)
    enable_language(OBJCXX)
    set(KSTT_MACOS_ICON ${CMAKE_CURRENT_SOURCE_DIR}/assets/icon.icns)
    set_source_files_properties(${KSTT_MACOS_ICON} PROPERTIES
        MACOSX_PACKAGE_LOCATION "Resources")
    add_executable(kstt-gui-native MACOSX_BUNDLE
        app/gui/macos/main.mm ${KSTT_MACOS_ICON})
    target_link_libraries(kstt-gui-native PRIVATE kstt_core kstt_audio
        "-framework Cocoa" "-framework Foundation")
    set_target_properties(kstt-gui-native PROPERTIES
        MACOSX_BUNDLE_ICON_FILE "icon.icns"
        MACOSX_BUNDLE_BUNDLE_NAME "KoreanSTT"
        MACOSX_BUNDLE_GUI_IDENTIFIER "io.github.koreanstt.vosk"
        MACOSX_BUNDLE_BUNDLE_VERSION "${PROJECT_VERSION}"
        MACOSX_BUNDLE_SHORT_VERSION_STRING "${PROJECT_VERSION}"
        MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/app/gui/macos/Info.plist.in")
    list(APPEND KSTT_GUI_TARGETS kstt-gui-native)
    set(KSTT_NATIVE_GUI_NAME "Cocoa")
endif()

# --- 이식 가능한 GTK4 ---
if(KSTT_WANT_GTK4)
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(GTK4 IMPORTED_TARGET gtk4)
    if(GTK4_FOUND)
        set(KSTT_GTK_SOURCES app/gui/gtk4/main.cpp app/gui/gtk4/app_window.cpp)
        if(WIN32)
            enable_language(RC)
            list(APPEND KSTT_GTK_SOURCES app/app_icon.rc)
        endif()
        add_executable(kstt-gui-gtk4 ${KSTT_GTK_SOURCES})
        target_link_libraries(kstt-gui-gtk4 PRIVATE kstt_core kstt_audio PkgConfig::GTK4)
        if(WIN32)
            # 콘솔 창 없이 띄운다 (MinGW 가 WinMain 다리를 놓아 준다)
            target_link_options(kstt-gui-gtk4 PRIVATE -mwindows)
        endif()
        list(APPEND KSTT_GUI_TARGETS kstt-gui-gtk4)
    else()
        message(WARNING
            "GTK4 를 찾지 못해 GTK4 GUI 를 건너뜁니다. "
            "fetch_deps 스크립트의 안내대로 GTK4 개발 패키지를 설치하세요.")
    endif()
endif()

# 실행 스크립트가 찾는 이름(kstt-gui)으로 기본 GUI 를 하나 더 둔다.
if(KSTT_GUI_TARGETS AND NOT APPLE)
    list(GET KSTT_GUI_TARGETS 0 KSTT_DEFAULT_GUI)
    add_custom_command(TARGET ${KSTT_DEFAULT_GUI} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            $<TARGET_FILE:${KSTT_DEFAULT_GUI}>
            ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/kstt-gui${CMAKE_EXECUTABLE_SUFFIX}
        # 빌드 도구가 그대로 찍는 문구라, 콘솔 코드페이지를 타지 않게 ASCII 로 둔다.
        COMMENT "Copying ${KSTT_DEFAULT_GUI} to kstt-gui")
endif()

# ---------------------------------------------------------------------------
# 시험
# ---------------------------------------------------------------------------
if(KSTT_BUILD_TESTS)
    # 일부러 kstt_core 만 링크한다 — 코어가 정말 GUI/오디오와 무관한지 확인한다.
    add_executable(kstt-tests tests/test_core.cpp)
    target_link_libraries(kstt-tests PRIVATE kstt_core)
    enable_testing()
    add_test(NAME kstt-core COMMAND kstt-tests)
endif()

# ---------------------------------------------------------------------------
# libvosk 를 실행 파일 옆에 둔다 (Windows 는 DLL 이 같은 폴더에 있어야 한다).
#
# libvosk 만 복사한다. 배포 꾸러미에 같이 들어 있는 libstdc++/libgcc/libwinpthread
# 는 2022년 MinGW 것이라, 지금 쓰는 g++ 로 만든 실행 파일 옆에 두면 그쪽을 먼저
# 집어 들어 프로그램이 조용히 죽는다. 새 런타임은 아래로 호환되므로 컴파일러가
# 쓰는 런타임을 그대로 쓰는 것이 맞다.
# ---------------------------------------------------------------------------
file(GLOB KSTT_VOSK_DIRS ${CMAKE_CURRENT_SOURCE_DIR}/third_party/vosk*)
foreach(dir ${KSTT_VOSK_DIRS})
    if(IS_DIRECTORY ${dir})
        file(GLOB KSTT_VOSK_RUNTIME
            ${dir}/libvosk.dll ${dir}/libvosk.so ${dir}/libvosk.so.*
            ${dir}/libvosk.dylib)
        foreach(lib ${KSTT_VOSK_RUNTIME})
            file(COPY ${lib} DESTINATION ${CMAKE_RUNTIME_OUTPUT_DIRECTORY})
        endforeach()
    endif()
endforeach()

# ---------------------------------------------------------------------------
# Windows: MinGW 런타임 DLL 을 실행 파일 옆에 둔다.
#
# libvosk.dll 자체가 libstdc++/libgcc/libwinpthread 를 가져다 쓰기 때문에, 이 셋은
# 어느 쪽이든 있어야 한다. Vosk 꾸러미에 든 2022년판 대신 **지금 쓰는 컴파일러의**
# 런타임을 복사한다 (새 런타임은 아래로 호환되므로 둘 다 이걸로 돈다).
# 이렇게 하면 네이티브 GUI 는 build/bin 폴더만으로 실행된다.
# ---------------------------------------------------------------------------
if(WIN32 AND CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    get_filename_component(KSTT_COMPILER_BIN ${CMAKE_CXX_COMPILER} DIRECTORY)
    foreach(runtime libstdc++-6.dll libgcc_s_seh-1.dll libwinpthread-1.dll)
        if(EXISTS ${KSTT_COMPILER_BIN}/${runtime})
            file(COPY ${KSTT_COMPILER_BIN}/${runtime}
                 DESTINATION ${CMAKE_RUNTIME_OUTPUT_DIRECTORY})
        endif()
    endforeach()
endif()

message(STATUS "")
message(STATUS "KoreanSttVosk 구성")
message(STATUS "  컴파일러      : ${CMAKE_CXX_COMPILER_ID} ${CMAKE_CXX_COMPILER_VERSION}")
message(STATUS "  빌드 종류     : ${CMAKE_BUILD_TYPE}")
message(STATUS "  GUI 선택      : ${KSTT_GUI}")
if(KSTT_NATIVE_GUI_NAME)
    message(STATUS "  네이티브 GUI  : ${KSTT_NATIVE_GUI_NAME}")
endif()
if(GTK4_FOUND)
    message(STATUS "  GTK4          : ${GTK4_VERSION}")
endif()
message(STATUS "  GUI 타깃      : ${KSTT_GUI_TARGETS}")
message(STATUS "  출력          : ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}")
message(STATUS "")
