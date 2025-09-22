# FaceAlgorithm Build Instructions

This document provides instructions for building the FaceAlgorithm project using CMake.

## Prerequisites

### Required Dependencies
- **CMake** (version 3.16 or higher)
- **C++ Compiler** (GCC 7+ or Clang 5+)
- **OpenCV** (version 4.0 or higher)
- **OpenBLAS** (for optimized linear algebra operations)
- **pkg-config** (for dependency management)

### Installation on Ubuntu/Debian
```bash
sudo apt update
sudo apt install cmake build-essential pkg-config
sudo apt install libopencv-dev libopenblas-dev
```

### Installation on CentOS/RHEL/Fedora
```bash
# For CentOS/RHEL 8+
sudo dnf install cmake gcc-c++ pkgconfig
sudo dnf install opencv-devel openblas-devel

# For older CentOS/RHEL
sudo yum install cmake gcc-c++ pkgconfig
sudo yum install opencv-devel openblas-devel
```

## Build Methods

### Method 1: Using the Build Script (Recommended)
The easiest way to build the project is using the provided build script:

```bash
# Build in Release mode (default)
./build.sh

# Build in Debug mode
./build.sh -t Debug

# Clean build
./build.sh -c

# Verbose output
./build.sh -v

# Custom build directory
./build.sh -d my_build_dir

# Show all options
./build.sh --help
```

### Method 2: Using Makefile
A simple Makefile wrapper is provided for convenience:

```bash
# Build in Release mode
make

# Build in Debug mode
make debug

# Clean build directory
make clean

# Build and install
make install

# Show help
make help
```

### Method 3: Direct CMake Usage
For advanced users who want full control:

```bash
# Create build directory
mkdir build && cd build

# Configure
cmake -DCMAKE_BUILD_TYPE=Release ..

# Build
make -j$(nproc)

# Install (optional)
sudo make install
```

## Build Options

### Build Types
- **Release**: Optimized build for production use (default)
- **Debug**: Debug build with symbols and no optimization

### CMake Variables
You can customize the build using CMake variables:

```bash
cmake -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/usr/local \
      -DCMAKE_VERBOSE_MAKEFILE=ON \
      ..
```

## Installation

### System-wide Installation
```bash
# Build and install
sudo make install

# Or using the build script
sudo ./build.sh && sudo make -C build install
```

### Uninstallation
```bash
sudo make -C build uninstall
```

## Project Structure

```
FaceAlgorithm/
├── CMakeLists.txt          # Main CMake configuration
├── build.sh               # Build script
├── Makefile               # Simple Makefile wrapper
├── README_BUILD.md        # This file
└── vaengine/
    ├── CMakeLists.txt     # VAEngine library configuration
    ├── main.cpp           # Main executable source
    ├── vaengine/          # VAEngine library headers
    └── install/           # Pre-built libraries
        ├── bin/           # Pre-built binaries
        └── lib/           # Pre-built shared libraries
```

## Troubleshooting

### Common Issues

1. **OpenCV not found**
   ```bash
   # Install OpenCV development packages
   sudo apt install libopencv-dev
   # or
   sudo dnf install opencv-devel
   ```

2. **OpenBLAS not found**
   ```bash
   # Install OpenBLAS development packages
   sudo apt install libopenblas-dev
   # or
   sudo dnf install openblas-devel
   ```

3. **Permission denied during installation**
   ```bash
   # Make sure to use sudo for system-wide installation
   sudo make install
   ```

4. **Library not found at runtime**
   ```bash
   # Update library cache
   sudo ldconfig
   ```

### Debug Build Issues
If you encounter issues with the debug build:

```bash
# Clean and rebuild
make clean
make debug

# Or with verbose output
./build.sh -t Debug -c -v
```

### Custom Installation Path
To install to a custom location:

```bash
./build.sh -p /opt/facealgorithm
sudo make -C build install
```

## Development

### Adding New Source Files
1. Add source files to the appropriate `CMakeLists.txt`
2. Update the library target if needed
3. Rebuild the project

### Modifying Build Configuration
Edit the `CMakeLists.txt` files to modify:
- Compiler flags
- Include directories
- Library dependencies
- Installation rules

## Support

For build-related issues:
1. Check the prerequisites are installed
2. Try a clean build: `make clean && make`
3. Use verbose output: `./build.sh -v`
4. Check CMake configuration: `cmake -LA build/`
