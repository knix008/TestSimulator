#!/bin/bash

# Face Recognition Engine Launcher
# This script launches the console application with proper environment setup

# Set the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if executable exists
if [ ! -f "$BUILD_DIR/face_recognition_engine" ]; then
    print_info "Executable not found. Building first..."
    cd "$SCRIPT_DIR"

    # Try to build with build.sh if available
    if [ -f "build.sh" ]; then
        ./build.sh
    else
        # Fallback to direct CMake build
        print_info "Building with CMake..."
        rm -rf build
        mkdir build
        cd build
        cmake .. && make -j$(nproc)
    fi

    if [ $? -ne 0 ]; then
        print_error "Build failed. Please check the build output."
        exit 1
    fi

    if [ ! -f "$BUILD_DIR/face_recognition_engine" ]; then
        print_error "Build completed but executable not found."
        exit 1
    fi

    print_success "Build completed successfully."
fi

# Set library path for runtime
# Note: We exclude libopenblas.so to avoid conflicts with system LAPACK
# Create a temporary directory with only the libraries we need
TEMP_LIB_DIR=$(mktemp -d)
trap "rm -rf $TEMP_LIB_DIR" EXIT

# Copy only the libraries we need (not OpenBLAS)
for lib in "$SCRIPT_DIR/vaengine/install/lib"/*.so*; do
    libname=$(basename "$lib")
    if [[ ! "$libname" =~ ^libopenblas ]]; then
        cp -P "$lib" "$TEMP_LIB_DIR/"
    fi
done

export LD_LIBRARY_PATH="$TEMP_LIB_DIR:$LD_LIBRARY_PATH"

# Launch the console application
print_info "Starting Face Recognition Engine..."
cd "$BUILD_DIR"
./face_recognition_engine "$@"
