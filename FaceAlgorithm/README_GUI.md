# Face Recognition GUI Application

A graphical user interface for the Face Recognition Engine, built with GTK3 and OpenCV.

## Features

### 🖥️ **GUI Interface**
- **Image Selection**: Browse and select query images for recognition
- **Gallery Management**: Select directory containing gallery images
- **Real-time Processing**: Background processing with progress indication
- **Results Display**: Clear presentation of recognition results
- **Error Handling**: User-friendly error messages and status updates

### 🎯 **Core Functionality**
- **Face Detection**: Automatic face detection in query images
- **Feature Extraction**: Advanced facial feature analysis
- **Gallery Matching**: Compare against registered gallery images
- **Recognition Results**: ID, confidence score, and face position
- **Multi-threaded Processing**: Non-blocking UI during recognition

## Prerequisites

### Required Dependencies
- **GTK3** (version 3.0+)
- **OpenCV** (version 4.0+)
- **CMake** (version 3.16+)
- **C++ Compiler** (GCC 7+ or Clang 5+)

### Installation on Ubuntu/Debian
```bash
sudo apt update
sudo apt install libgtk-3-dev libgdk-pixbuf2.0-dev cmake build-essential
sudo apt install libopencv-dev
```

### Installation on CentOS/RHEL/Fedora
```bash
# For CentOS/RHEL 8+
sudo dnf install gtk3-devel gdk-pixbuf2-devel cmake gcc-c++
sudo dnf install opencv-devel

# For older CentOS/RHEL
sudo yum install gtk3-devel gdk-pixbuf2-devel cmake gcc-c++
sudo yum install opencv-devel
```

## Building the GUI Application

### Method 1: Using Makefile (Recommended)
```bash
# Build GUI application
make gui

# Or build everything
make all
```

### Method 2: Direct CMake
```bash
# Create build directory
mkdir build && cd build

# Configure with GTK3 support
cmake -DBUILD_GUI=ON ..

# Build
make -j$(nproc)
```

### Method 3: Using Build Script
```bash
# Build with GUI support
./build.sh -t Release
```

## Running the GUI Application

### Quick Start
```bash
# Run the GUI launcher
./run_gui.sh
```

### Manual Execution
```bash
# Set library path
export LD_LIBRARY_PATH="./vaengine/install/lib:$LD_LIBRARY_PATH"

# Run GUI application
./build/face_recognition_gui
```

## GUI Usage Guide

### 1. **Select Query Image**
- Click "Browse" next to "Query Image"
- Choose an image file (PNG, JPG, JPEG, BMP)
- The image will be displayed in the preview area

### 2. **Select Gallery Directory**
- Click "Browse" next to "Gallery Directory"
- Choose a folder containing gallery images
- Supported formats: JPG, JPEG, PNG, BMP

### 3. **Start Recognition**
- Click "Start Recognition" button
- Progress bar will show processing status
- Results will appear in the text area below

### 4. **View Results**
The recognition results include:
- **ID**: Identified person ID (-1 if no match)
- **Score**: Confidence score (0.0 to 1.0)
- **Result Code**: Processing status code
- **Face Position**: Bounding box coordinates (x, y, width, height)

## Application Structure

```
FaceAlgorithm/
├── source/
│   ├── main.cpp          # Console application
│   └── main_gui.cpp      # GUI application
├── include/
│   ├── vaengine/         # Face recognition headers
│   ├── rknn_api.h        # Mock RKNN API
│   └── faiss/           # Mock FAISS headers
├── build/
│   ├── face_recognition_engine    # Console executable
│   └── face_recognition_gui       # GUI executable
└── run_gui.sh           # GUI launcher script
```

## Troubleshooting

### Common Issues

1. **Qt6 not found**
   ```bash
   # Install Qt6 development packages
   sudo apt install qt6-base-dev qt6-tools-dev
   # or
   sudo dnf install qt6-qtbase-devel qt6-qttools-devel
   ```

2. **Library not found at runtime**
   ```bash
   # Set library path
   export LD_LIBRARY_PATH="./vaengine/install/lib:$LD_LIBRARY_PATH"
   ```

3. **GUI application won't start**
   ```bash
   # Check if Qt6 is properly installed
   pkg-config --modversion Qt6Core
   ```

4. **Build fails with Qt errors**
   ```bash
   # Build without GUI support
   cmake -DBUILD_GUI=OFF ..
   make
   ```

### Debug Mode
```bash
# Build in debug mode for troubleshooting
make debug
```

## Advanced Configuration

### Custom Qt Installation
If Qt6 is installed in a non-standard location:
```bash
cmake -DQt6_DIR=/path/to/qt6/lib/cmake/Qt6 ..
```

### Disable GUI Support
To build only the console application:
```bash
cmake -DBUILD_GUI=OFF ..
make
```

## Performance Tips

1. **Image Size**: Use reasonably sized images (1024x768 or smaller)
2. **Gallery Size**: Keep gallery directories under 1000 images for best performance
3. **Memory**: Ensure sufficient RAM for large gallery processing
4. **Threading**: The GUI uses background processing to keep the interface responsive

## Support

For issues related to:
- **Face Recognition Engine**: Check the main documentation
- **GUI Interface**: Verify Qt6 installation and dependencies
- **Build System**: Use `make help` for available options
- **Runtime Errors**: Check library paths and permissions
