# CaptureMaster - Cross-platform GTK Screen Capture Tool
# Supports Linux and macOS

# Compiler settings
CC = gcc
CFLAGS = -Wall -Wextra -O2 -std=c11
TARGET = capturemaster

# Detect OS
UNAME_S := $(shell uname -s)

# GTK3 configuration
ifeq ($(UNAME_S),Linux)
    GTK_CFLAGS = $(shell pkg-config --cflags gtk+-3.0 libpipewire-0.3)
    GTK_LIBS   = $(shell pkg-config --libs   gtk+-3.0 libpipewire-0.3)
    PLATFORM   = linux
endif

ifeq ($(UNAME_S),Darwin)
    GTK_CFLAGS = $(shell pkg-config --cflags gtk+-3.0)
    GTK_LIBS = $(shell pkg-config --libs gtk+-3.0) \
               -framework CoreGraphics \
               -framework CoreFoundation
    PLATFORM = macos
endif

# Source files
SOURCES = main.c ui.c capture.c utils.c
OBJECTS = $(SOURCES:.c=.o)
HEADERS = ui.h capture.h utils.h

# Build rules
all: $(TARGET)

$(TARGET): $(OBJECTS)
	@echo "[ LD ] $(TARGET)"
	@$(CC) $(OBJECTS) -o $(TARGET) $(GTK_LIBS)
	@echo "Build complete for $(PLATFORM)"

%.o: %.c $(HEADERS)
	@echo "[ CC ] $<"
	@$(CC) $(CFLAGS) $(GTK_CFLAGS) -c $< -o $@

# Installation rules
install-deps:
	@echo "Installing dependencies for $(PLATFORM)..."
ifeq ($(UNAME_S),Linux)
	@echo "Checking for package manager..."
	@if command -v apt-get > /dev/null; then \
		echo "Using apt-get..."; \
		sudo apt-get update; \
		sudo apt-get install -y libgtk-3-dev build-essential pkg-config; \
	elif command -v dnf > /dev/null; then \
		echo "Using dnf..."; \
		sudo dnf install -y gtk3-devel gcc make pkg-config; \
	elif command -v pacman > /dev/null; then \
		echo "Using pacman..."; \
		sudo pacman -S --needed gtk3 base-devel pkg-config; \
	else \
		echo "Unknown package manager. Please install GTK3 development libraries manually."; \
		exit 1; \
	fi
endif
ifeq ($(UNAME_S),Darwin)
	@if command -v brew > /dev/null; then \
		echo "Using Homebrew..."; \
		brew install gtk+3 pkg-config; \
	else \
		echo "Homebrew not found. Please install it from https://brew.sh/"; \
		exit 1; \
	fi
endif
	@echo "Dependencies installed successfully!"

# Check dependencies
check-deps:
	@echo "Checking dependencies..."
	@command -v pkg-config > /dev/null || (echo "pkg-config not found" && exit 1)
	@pkg-config --exists gtk+-3.0 || (echo "GTK3 not found. Run 'make install-deps'" && exit 1)
	@echo "All dependencies satisfied!"

# Clean build artifacts
clean:
	@echo "[ CLEAN ] Removing build artifacts..."
	@rm -f $(OBJECTS) $(TARGET)
	@echo "Clean complete"

# Clean everything including build directory
distclean: clean
	@echo "[ CLEAN ] Removing all generated files..."
	@rm -rf build/ .deps/
	@echo "Distribution clean complete"

# Run the application
run: $(TARGET)
	@echo "[ RUN ] $(TARGET)"
	@./$(TARGET)

# Development helpers
debug: CFLAGS += -g -DDEBUG
debug: clean all

# Show build information
info:
	@echo "========================================"
	@echo "  CaptureMaster Build Configuration"
	@echo "========================================"
	@echo "Platform:  $(PLATFORM)"
	@echo "Compiler:  $(CC)"
	@echo "CFLAGS:    $(CFLAGS)"
	@echo "GTK_FLAGS: $(GTK_CFLAGS)"
	@echo "LIBS:      $(GTK_LIBS)"
	@echo "Sources:   $(SOURCES)"
	@echo "Target:    $(TARGET)"
	@echo "========================================"

.PHONY: all clean distclean run install-deps check-deps debug info
