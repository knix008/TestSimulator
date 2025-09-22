# FaceAlgorithm Makefile
# Simple wrapper around CMake for easier building

.PHONY: all clean debug release no-deps install uninstall help gui console

# Default target
all: release

# Build targets
debug:
	@echo "Building in Debug mode..."
	@./build.sh -t Debug -c

release:
	@echo "Building in Release mode..."
	@./build.sh -t Release

# Build without auto-installing dependencies
no-deps:
	@echo "Building without auto-installing dependencies..."
	@./build.sh --skip-deps

# Clean build
clean:
	@echo "Cleaning build directory..."
	@rm -rf build/
	@echo "Build directory cleaned."

# Install
install: release
	@echo "Installing FaceAlgorithm..."
	@sudo make -C build install

# Uninstall
uninstall:
	@echo "Uninstalling FaceAlgorithm..."
	@sudo make -C build uninstall || echo "Nothing to uninstall"

# GUI targets
gui:
	@echo "Building GUI application..."
	@./build.sh -t Release
	@echo "GUI application built. Run with: ./run_gui.sh"

console:
	@echo "Building console application..."
	@./build.sh -t Release
	@echo "Console application built. Run with: ./build/face_recognition_engine"

# Help
help:
	@echo "FaceAlgorithm Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  all      - Build in Release mode (default)"
	@echo "  debug    - Build in Debug mode"
	@echo "  release  - Build in Release mode"
	@echo "  no-deps  - Build without auto-installing dependencies"
	@echo "  gui      - Build and run GUI application"
	@echo "  console  - Build and run console application"
	@echo "  clean    - Clean build directory"
	@echo "  install  - Build and install"
	@echo "  uninstall- Uninstall the project"
	@echo "  help     - Show this help message"
	@echo ""
	@echo "For more options, use ./build.sh directly:"
	@echo "  ./build.sh --help"
