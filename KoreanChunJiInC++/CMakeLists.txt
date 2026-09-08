cmake_minimum_required(VERSION 3.16)
project(chunjiin C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

if(NOT WIN32)
    message(FATAL_ERROR "이 프로젝트는 Windows 전용입니다.")
endif()

# src/chunjiin.c 는 "../include/chunjiin.h" 로 헤더를 참조한다.
include_directories(${CMAKE_SOURCE_DIR}/include)

set(ENGINE_SOURCES
    src/chunjiin.c
    src/input.c
)

# ---- 응용 프로그램 -------------------------------------------------
add_executable(chunjiin WIN32
    ${ENGINE_SOURCES}
    src/main.c
    src/app.rc
)
target_link_libraries(chunjiin PRIVATE comdlg32 comctl32 gdi32 dwmapi advapi32)

# ---- 자소 조합 검증 ------------------------------------------------
add_executable(test_engine
    ${ENGINE_SOURCES}
    tests/test_engine.c
)

enable_testing()
add_test(NAME engine COMMAND test_engine)

# ---- 설치 프로그램 -------------------------------------------------
# installer/setup.rc 가 build/chunjiin.exe 를 리소스로 품기 때문에,
# 먼저 응용 프로그램을 그 자리에 복사한 뒤 빌드한다.
# 실행 파일은 찾기 쉽게 저장소 루트에도 둔다.
add_custom_command(TARGET chunjiin POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_SOURCE_DIR}/build
    COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:chunjiin>
            ${CMAKE_SOURCE_DIR}/build/chunjiin.exe
    COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:chunjiin>
            ${CMAKE_SOURCE_DIR}/chunjiin.exe
    COMMENT "build/ 와 루트로 chunjiin.exe 복사"
)

add_executable(chunjiin_setup WIN32
    installer/setup.c
    installer/setup.rc
)
target_include_directories(chunjiin_setup PRIVATE ${CMAKE_SOURCE_DIR}/installer)
target_link_libraries(chunjiin_setup PRIVATE ole32 uuid shell32 comctl32 advapi32)
set_target_properties(chunjiin_setup PROPERTIES OUTPUT_NAME "chunjiin-setup")
add_dependencies(chunjiin_setup chunjiin)

# 설치 파일은 찾기 쉽게 저장소 루트에도 둔다.
add_custom_command(TARGET chunjiin_setup POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:chunjiin_setup>
            ${CMAKE_SOURCE_DIR}/chunjiin-setup.exe
    COMMENT "설치 파일을 루트로 복사"
)
