cmake_minimum_required(VERSION 3.16)
project(TTSSimulator VERSION 1.0 LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

find_package(PkgConfig REQUIRED)

pkg_check_modules(GTK3      REQUIRED gtk+-3.0)
pkg_check_modules(ESPEAK    REQUIRED espeak-ng)
pkg_check_modules(GST       REQUIRED gstreamer-1.0)
pkg_check_modules(GST_AUDIO REQUIRED gstreamer-audio-1.0)
pkg_check_modules(GST_APP   REQUIRED gstreamer-app-1.0)
pkg_check_modules(SNDFILE   REQUIRED sndfile)

find_library(LAME_LIB mp3lame REQUIRED)

set(SOURCES
    src/main.c          # Entry point only
    src/app.c           # GTK-free: engine mgmt, synthesis thread, playback
    src/tts_engine.c    # GTK-free: AudioData helpers
    src/tts_espeak.c    # GTK-free: eSpeak-NG engine
    src/tts_festival.c  # GTK-free: Festival engine (optional)
    src/tts_piper.c     # GTK-free: Piper TTS engine (optional)
    src/audio_player.c  # GTK-free: GStreamer playback
    src/file_saver.c    # GTK-free: WAV/MP3 export
    src/ui.c            # GTK: all widgets and signal handlers
    src/waveform_widget.c  # GTK: Cairo waveform drawing area
)

add_executable(tts_simulator ${SOURCES})

target_include_directories(tts_simulator PRIVATE
    ${GTK3_INCLUDE_DIRS}
    ${ESPEAK_INCLUDE_DIRS}
    ${GST_INCLUDE_DIRS}
    ${GST_AUDIO_INCLUDE_DIRS}
    ${GST_APP_INCLUDE_DIRS}
    ${SNDFILE_INCLUDE_DIRS}
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_compile_options(tts_simulator PRIVATE
    ${GTK3_CFLAGS_OTHER}
    ${ESPEAK_CFLAGS_OTHER}
    ${GST_CFLAGS_OTHER}
    -Wall -Wextra -Wno-unused-parameter
)

target_link_libraries(tts_simulator
    ${GTK3_LIBRARIES}
    ${ESPEAK_LIBRARIES}
    ${GST_LIBRARIES}
    ${GST_AUDIO_LIBRARIES}
    ${GST_APP_LIBRARIES}
    ${SNDFILE_LIBRARIES}
    ${LAME_LIB}
    m
    pthread
)

target_link_directories(tts_simulator PRIVATE
    ${GTK3_LIBRARY_DIRS}
    ${ESPEAK_LIBRARY_DIRS}
    ${GST_LIBRARY_DIRS}
    ${SNDFILE_LIBRARY_DIRS}
)

install(TARGETS tts_simulator RUNTIME DESTINATION bin)
