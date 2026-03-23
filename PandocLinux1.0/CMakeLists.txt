cmake_minimum_required(VERSION 3.10)
project(PandocLinux VERSION 1.0 LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# GTK3 패키지 탐색
find_package(PkgConfig REQUIRED)
pkg_check_modules(GTK3 REQUIRED gtk+-3.0)

add_executable(pandoc-linux main.c)

target_include_directories(pandoc-linux PRIVATE ${GTK3_INCLUDE_DIRS})
target_link_libraries(pandoc-linux PRIVATE ${GTK3_LIBRARIES})
target_compile_options(pandoc-linux PRIVATE ${GTK3_CFLAGS_OTHER})

# 스레드 지원
find_package(Threads REQUIRED)
target_link_libraries(pandoc-linux PRIVATE Threads::Threads)

install(TARGETS pandoc-linux DESTINATION bin)
