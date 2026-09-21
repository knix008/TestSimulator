cmake_minimum_required(VERSION 3.10)
project(mmon-agent C)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)

add_executable(mmon-agent
    src/mmon_protocol.c
    src/main.c
)

if(WIN32)
    target_sources(mmon-agent PRIVATE src/platform_win.c src/win_service.c)
    target_link_libraries(mmon-agent PRIVATE ws2_32 iphlpapi psapi advapi32)
    set_target_properties(mmon-agent PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_SOURCE_DIR}/dist/windows"
        RUNTIME_OUTPUT_DIRECTORY_DEBUG "${CMAKE_SOURCE_DIR}/dist/windows"
        OUTPUT_NAME "mmon-agent")
else()
    target_sources(mmon-agent PRIVATE src/platform_posix.c)
endif()

target_include_directories(mmon-agent PRIVATE include)

if(MSVC)
    target_compile_definitions(mmon-agent PRIVATE _CRT_SECURE_NO_WARNINGS)
    target_compile_options(mmon-agent PRIVATE /W3)
else()
    target_compile_options(mmon-agent PRIVATE -Wall -Wextra -Wpedantic)
endif()

install(TARGETS mmon-agent RUNTIME DESTINATION bin)
