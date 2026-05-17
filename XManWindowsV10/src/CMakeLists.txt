# 소스 파일 수집
file(GLOB_RECURSE SOURCES 
    "${CMAKE_CURRENT_SOURCE_DIR}/*.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/*.c"
)

# 실행 파일 생성
add_executable(XManWindowsV10 ${SOURCES})

# 링크 라이브러리
target_link_libraries(XManWindowsV10
    PRIVATE
        ws2_32      # Winsock2
        d3d11       # DirectX 11
        dxgi        # DXGI
        d3dcompiler # Shader compiler
        user32      # Win32 User
        gdi32       # GDI
        comctl32    # Common Controls (ServerGUI)
)

# 컴파일 옵션
if(MSVC)
    target_compile_options(XManWindowsV10 PRIVATE 
        /W4 
        /WX-
        /utf-8          # Use UTF-8 encoding
        /wd4819         # Disable C4819 (code page) warning
    )
else()
    target_compile_options(XManWindowsV10 PRIVATE -Wall -Wextra)
endif()

# 포함 디렉토리
target_include_directories(XManWindowsV10 
    PRIVATE 
        ${CMAKE_SOURCE_DIR}/include
)
