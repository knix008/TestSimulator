#!/bin/bash

# FaceAlgorithm Build Script
# This script automates the CMake build process

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
BUILD_TYPE="Release"
BUILD_DIR="build"
INSTALL_PREFIX="/usr/local"
CLEAN_BUILD=false
VERBOSE=false
SKIP_DEPS=false

# Get the absolute path of the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to print colored output
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

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -t, --type TYPE        Build type (Debug|Release) [default: Release]"
    echo "  -d, --dir DIR          Build directory [default: build]"
    echo "  -p, --prefix PREFIX    Install prefix [default: /usr/local]"
    echo "  -c, --clean            Clean build directory before building"
    echo "  -v, --verbose          Verbose output"
    echo "  -s, --skip-deps        Skip automatic dependency installation"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                     # Build with default settings (auto-install deps)"
    echo "  $0 -t Debug -c         # Clean debug build"
    echo "  $0 -d build_debug -t Debug  # Custom build directory"
    echo "  $0 --skip-deps          # Skip automatic dependency installation"
    echo "  sudo $0                 # Run with sudo for automatic dependency installation"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            BUILD_TYPE="$2"
            shift 2
            ;;
        -d|--dir)
            BUILD_DIR="$2"
            shift 2
            ;;
        -p|--prefix)
            INSTALL_PREFIX="$2"
            shift 2
            ;;
        -c|--clean)
            CLEAN_BUILD=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -s|--skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate build type
if [[ "$BUILD_TYPE" != "Debug" && "$BUILD_TYPE" != "Release" ]]; then
    print_error "Invalid build type: $BUILD_TYPE. Must be Debug or Release."
    exit 1
fi

print_info "Starting FaceAlgorithm build process..."
print_info "Build type: $BUILD_TYPE"
print_info "Build directory: $BUILD_DIR"
print_info "Install prefix: $INSTALL_PREFIX"

# Detect package manager
detect_package_manager() {
    if command -v apt &> /dev/null; then
        PACKAGE_MANAGER="apt"
        UPDATE_CMD="sudo apt update"
        INSTALL_CMD="sudo apt install -y"
    elif command -v dnf &> /dev/null; then
        PACKAGE_MANAGER="dnf"
        UPDATE_CMD="sudo dnf update -y"
        INSTALL_CMD="sudo dnf install -y"
    elif command -v yum &> /dev/null; then
        PACKAGE_MANAGER="yum"
        UPDATE_CMD="sudo yum update -y"
        INSTALL_CMD="sudo yum install -y"
    elif command -v pacman &> /dev/null; then
        PACKAGE_MANAGER="pacman"
        UPDATE_CMD="sudo pacman -Sy"
        INSTALL_CMD="sudo pacman -S --noconfirm"
    elif command -v zypper &> /dev/null; then
        PACKAGE_MANAGER="zypper"
        UPDATE_CMD="sudo zypper refresh"
        INSTALL_CMD="sudo zypper install -y"
    else
        print_error "Unsupported package manager. Please install dependencies manually."
        exit 1
    fi
    
    print_info "Detected package manager: $PACKAGE_MANAGER"
}

# Install dependencies automatically
install_dependencies() {
    print_info "Installing required dependencies..."
    
    # Check if we have sudo access
    if ! sudo -n true 2>/dev/null; then
        print_error "This script requires sudo access to install dependencies."
        print_info "Please run: sudo $0"
        print_info "Or install dependencies manually and run with --skip-deps flag."
        exit 1
    fi
    
    # Update package lists
    print_info "Updating package lists..."
    eval $UPDATE_CMD
    
    # Install basic build tools
    print_info "Installing build tools..."
    if [[ "$PACKAGE_MANAGER" == "apt" ]]; then
        eval $INSTALL_CMD "cmake build-essential pkg-config git"
        eval $INSTALL_CMD "libopencv-dev libgtk-3-dev libgdk-pixbuf2.0-dev"
        eval $INSTALL_CMD "libopenblas-dev"
    elif [[ "$PACKAGE_MANAGER" == "dnf" || "$PACKAGE_MANAGER" == "yum" ]]; then
        eval $INSTALL_CMD "cmake gcc-c++ pkgconfig git"
        eval $INSTALL_CMD "opencv-devel gtk3-devel gdk-pixbuf2-devel"
        eval $INSTALL_CMD "openblas-devel"
    elif [[ "$PACKAGE_MANAGER" == "pacman" ]]; then
        eval $INSTALL_CMD "cmake base-devel pkgconfig git"
        eval $INSTALL_CMD "opencv gtk3 gdk-pixbuf2"
        eval $INSTALL_CMD "openblas"
    elif [[ "$PACKAGE_MANAGER" == "zypper" ]]; then
        eval $INSTALL_CMD "cmake gcc-c++ pkg-config git"
        eval $INSTALL_CMD "opencv-devel gtk3-devel gdk-pixbuf2-devel"
        eval $INSTALL_CMD "openblas-devel"
    fi
    
    print_success "Dependencies installation completed."
}

# Check if required tools are available
check_dependencies() {
    print_info "Checking dependencies..."
    
    local missing_deps=()
    
    # Check for basic tools
    if ! command -v cmake &> /dev/null; then
        missing_deps+=("cmake")
    fi
    
    if ! command -v pkg-config &> /dev/null; then
        missing_deps+=("pkg-config")
    fi
    
    # Check for OpenCV
    if ! pkg-config --exists opencv4 && ! pkg-config --exists opencv; then
        missing_deps+=("opencv")
    fi
    
    # Check for GTK3
    if ! pkg-config --exists gtk+-3.0; then
        missing_deps+=("gtk3")
    fi
    
    # Check for OpenBLAS (optional)
    if ! pkg-config --exists openblas; then
        print_warning "OpenBLAS not found via pkg-config. Will try to use system libraries."
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        if [ "$SKIP_DEPS" = true ]; then
            print_error "Missing dependencies: ${missing_deps[*]}"
            print_error "Please install dependencies manually or run without --skip-deps flag."
            exit 1
        else
            print_warning "Missing dependencies: ${missing_deps[*]}"
            print_info "This script can automatically install missing dependencies."
            print_info "The following packages will be installed:"
            print_info "  - Build tools (cmake, gcc, pkg-config)"
            print_info "  - OpenCV development libraries"
            print_info "  - GTK3 development libraries"
            print_info "  - OpenBLAS development libraries"
            echo ""
            read -p "Do you want to proceed with automatic installation? (y/N): " -n 1 -r
            echo ""
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                detect_package_manager
                install_dependencies
                
                # Re-check dependencies
                print_info "Re-checking dependencies after installation..."
                check_dependencies
            else
                print_error "Dependency installation cancelled."
                print_info "Please install dependencies manually or run with --skip-deps flag."
                exit 1
            fi
        fi
    else
        print_success "All dependencies are available."
    fi
}

# Clean build directory if requested
clean_build() {
    if [ "$CLEAN_BUILD" = true ]; then
        print_info "Cleaning build directory: $BUILD_DIR"
        if [ -d "$BUILD_DIR" ]; then
            rm -rf "$BUILD_DIR"
            print_success "Build directory cleaned."
        fi
    fi
}

# Create build directory
create_build_dir() {
    print_info "Creating build directory: $BUILD_DIR"
    mkdir -p "$SCRIPT_DIR/$BUILD_DIR"
    print_success "Build directory created."
}

# Configure with CMake
configure_cmake() {
    print_info "Configuring with CMake..."
    
    cd "$SCRIPT_DIR/$BUILD_DIR" || {
        print_error "Failed to change to build directory: $SCRIPT_DIR/$BUILD_DIR"
        exit 1
    }
    
    CMAKE_ARGS=(
        -DCMAKE_BUILD_TYPE="$BUILD_TYPE"
        -DCMAKE_INSTALL_PREFIX="$INSTALL_PREFIX"
    )
    
    if [ "$VERBOSE" = true ]; then
        CMAKE_ARGS+=(-DCMAKE_VERBOSE_MAKEFILE=ON)
    fi
    
    cmake "${CMAKE_ARGS[@]}" ..
    
    if [ $? -eq 0 ]; then
        print_success "CMake configuration completed."
        # Return to project root directory
        cd "$SCRIPT_DIR"
    else
        print_error "CMake configuration failed."
        exit 1
    fi
}

# Build the project
build_project() {
    print_info "Building project..."
    
    local BUILD_PATH="$SCRIPT_DIR/$BUILD_DIR"
    if [ ! -d "$BUILD_PATH" ]; then
        print_error "Build directory $BUILD_PATH does not exist!"
        exit 1
    fi
    
    cd "$BUILD_PATH" || {
        print_error "Failed to change to build directory: $BUILD_PATH"
        exit 1
    }
    
    if [ "$VERBOSE" = true ]; then
        make VERBOSE=1 -j$(nproc)
    else
        make -j$(nproc)
    fi
    
    if [ $? -eq 0 ]; then
        print_success "Build completed successfully."
    else
        print_error "Build failed."
        exit 1
    fi
}

# Install the project
install_project() {
    print_info "Installing project to $INSTALL_PREFIX..."
    
    if [ ! -d "$BUILD_DIR" ]; then
        print_error "Build directory $BUILD_DIR does not exist!"
        exit 1
    fi
    
    cd "$BUILD_DIR"
    sudo make install
    
    if [ $? -eq 0 ]; then
        print_success "Installation completed successfully."
    else
        print_error "Installation failed."
        exit 1
    fi
}

# Main execution
main() {
    check_dependencies
    clean_build
    create_build_dir
    configure_cmake
    build_project
    
    print_info "Build process completed successfully!"
    print_info "Executable location: $BUILD_DIR/face_recognition_engine"
    print_info "To install: sudo make -C $BUILD_DIR install"
}

# Run main function
main
