#!/bin/bash

# Face Recognition GUI Launcher
# This script launches the GUI application with proper environment setup

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

# Check if GUI executable exists
if [ ! -f "$BUILD_DIR/face_recognition_gui" ]; then
    print_info "GUI executable not found. Building first..."
    cd "$SCRIPT_DIR"
    
    # Try to build with CMake directly
    print_info "Building with CMake..."
    rm -rf build
    mkdir build
    cd build
    cmake .. && make -j$(nproc)
    
    if [ $? -ne 0 ]; then
        print_error "Build failed. Please check the build output."
        exit 1
    fi
    
    # Check if GUI was built
    if [ ! -f "face_recognition_gui" ]; then
        print_warning "GUI executable was not built. This usually means GTK3 is not installed."
        print_info "Available options:"
        print_info "1. Install GTK3 to enable GUI support:"
        print_info "   sudo apt install libgtk-3-dev libgdk-pixbuf2.0-dev"
        print_info "2. Use the console application instead:"
        print_info "   ./build/face_recognition_engine"
        exit 1
    fi
    
    print_success "Build completed successfully."
fi

# Set library path for runtime
export LD_LIBRARY_PATH="$SCRIPT_DIR/vaengine/install/lib:$LD_LIBRARY_PATH"

# Launch the GUI application
print_info "Starting Face Recognition GUI..."
cd "$BUILD_DIR"
./face_recognition_gui "$@"
