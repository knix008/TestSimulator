cmake_minimum_required(VERSION 3.16)
project(FaceAlgorithm VERSION 0.0.1 LANGUAGES CXX)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Set build type if not specified
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler-specific options
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra")
    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -g -O0")
    else()
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3")
    endif()
endif()

# Find required packages
find_package(OpenCV REQUIRED)
find_package(PkgConfig REQUIRED)

# Find GTK3 (optional for GUI)
find_package(PkgConfig REQUIRED)
pkg_check_modules(GTK3 QUIET gtk+-3.0)
if(GTK3_FOUND)
    message(STATUS "GTK3 found - GUI support enabled")
    set(BUILD_GUI ON)
else()
    message(STATUS "GTK3 not found - GUI support disabled")
    set(BUILD_GUI OFF)
endif()

# Find OpenBLAS (optional)
pkg_check_modules(OPENBLAS openblas)

# Mock headers are now in include/ directory

# Include directories
include_directories(${OpenCV_INCLUDE_DIRS})
if(OPENBLAS_FOUND)
    include_directories(${OPENBLAS_INCLUDE_DIRS})
endif()
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/source)

# Create the console executable
add_executable(face_recognition_engine source/main.cpp)

# Create the GUI executable (if GTK is available)
if(BUILD_GUI)
    add_executable(face_recognition_gui source/main_gtk_gui.cpp)
endif()

# Link libraries for console app
target_link_libraries(face_recognition_engine
    ${OpenCV_LIBS}
    ${CMAKE_CURRENT_SOURCE_DIR}/vaengine/install/lib/librknnrt.so
    ${CMAKE_CURRENT_SOURCE_DIR}/vaengine/install/lib/libvaengine.so
)

# Link libraries for GUI app (if available)
if(BUILD_GUI)
    target_link_libraries(face_recognition_gui
        ${GTK3_LIBRARIES}
        ${OpenCV_LIBS}
        ${CMAKE_CURRENT_SOURCE_DIR}/vaengine/install/lib/librknnrt.so
        ${CMAKE_CURRENT_SOURCE_DIR}/vaengine/install/lib/libvaengine.so
    )
    target_include_directories(face_recognition_gui PRIVATE ${GTK3_INCLUDE_DIRS})
    target_compile_options(face_recognition_gui PRIVATE ${GTK3_CFLAGS_OTHER})
endif()

# Link OpenBLAS if found
if(OPENBLAS_FOUND)
    target_link_libraries(face_recognition_engine ${OPENBLAS_LIBRARIES})
    if(BUILD_GUI)
        target_link_libraries(face_recognition_gui ${OPENBLAS_LIBRARIES})
    endif()
endif()

# Set RPATH for runtime library loading
set_target_properties(face_recognition_engine PROPERTIES
    INSTALL_RPATH_USE_LINK_PATH TRUE
    INSTALL_RPATH "${CMAKE_INSTALL_PREFIX}/lib"
)

if(BUILD_GUI)
    set_target_properties(face_recognition_gui PROPERTIES
        INSTALL_RPATH_USE_LINK_PATH TRUE
        INSTALL_RPATH "${CMAKE_INSTALL_PREFIX}/lib"
    )
endif()

# Installation rules
if(BUILD_GUI)
    install(TARGETS face_recognition_engine face_recognition_gui
        RUNTIME DESTINATION bin
    )
else()
    install(TARGETS face_recognition_engine
        RUNTIME DESTINATION bin
    )
endif()

# Install pre-built libraries
install(DIRECTORY vaengine/install/lib/
    DESTINATION lib
    FILES_MATCHING PATTERN "*.so*"
)

# Install pre-built binaries
install(DIRECTORY vaengine/install/bin/
    DESTINATION bin
    FILES_MATCHING PATTERN "*"
    PERMISSIONS OWNER_READ OWNER_WRITE OWNER_EXECUTE GROUP_READ GROUP_EXECUTE WORLD_READ WORLD_EXECUTE
)

# Print configuration summary
message(STATUS "FaceAlgorithm Configuration Summary:")
message(STATUS "  Version: ${PROJECT_VERSION}")
message(STATUS "  Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  C++ standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "  OpenCV version: ${OpenCV_VERSION}")
message(STATUS "  OpenCV include dirs: ${OpenCV_INCLUDE_DIRS}")
message(STATUS "  OpenCV libraries: ${OpenCV_LIBS}")
if(OPENBLAS_FOUND)
    message(STATUS "  OpenBLAS libraries: ${OPENBLAS_LIBRARIES}")
else()
    message(STATUS "  OpenBLAS: Not found (using system libraries)")
endif()
message(STATUS "  Install prefix: ${CMAKE_INSTALL_PREFIX}")
