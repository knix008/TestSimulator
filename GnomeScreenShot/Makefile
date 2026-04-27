# Enhanced Screenshot - Makefile

CC = gcc
CFLAGS = -Wall -Wextra -g `pkg-config --cflags gtk+-3.0 cairo x11`
LDFLAGS = `pkg-config --libs gtk+-3.0 cairo x11` -lm

SRCDIR = src
OBJDIR = obj
BINDIR = .

TARGET = $(BINDIR)/enhanced-screenshot

SOURCES = $(wildcard $(SRCDIR)/*.c)
OBJECTS = $(patsubst $(SRCDIR)/%.c,$(OBJDIR)/%.o,$(SOURCES))

# Detect Linux distribution
DISTRO := $(shell if [ -f /etc/os-release ]; then . /etc/os-release; echo $$ID; else echo "unknown"; fi)

.PHONY: all clean install deps install-deps check-deps help run debug

all: $(TARGET)

$(TARGET): $(OBJECTS) | $(BINDIR)
	$(CC) $(OBJECTS) -o $@ $(LDFLAGS)
	@echo "Build complete! Run with: ./enhanced-screenshot"

$(OBJDIR)/%.o: $(SRCDIR)/%.c | $(OBJDIR)
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJDIR):
	mkdir -p $(OBJDIR)

$(BINDIR):
	mkdir -p $(BINDIR)

clean:
	rm -rf $(OBJDIR) $(TARGET)
	@echo "Cleaned build files"

install: $(TARGET)
	install -D $(TARGET) $(DESTDIR)/usr/local/bin/enhanced-screenshot
	@echo "Installed to /usr/local/bin/enhanced-screenshot"

# Check if dependencies are installed
check-deps:
	@echo "Checking dependencies..."
	@command -v pkg-config >/dev/null 2>&1 || { echo "pkg-config is not installed"; exit 1; }
	@pkg-config --exists gtk+-3.0 || { echo "GTK+ 3.0 is not installed"; exit 1; }
	@pkg-config --exists cairo || { echo "Cairo is not installed"; exit 1; }
	@pkg-config --exists x11 || { echo "X11 is not installed"; exit 1; }
	@echo "All dependencies are installed"

# Install dependencies based on distribution
deps: install-deps

install-deps:
	@echo "Detected distribution: $(DISTRO)"
	@if [ "$(DISTRO)" = "ubuntu" ] || [ "$(DISTRO)" = "debian" ] || [ "$(DISTRO)" = "linuxmint" ]; then \
		echo "Installing dependencies for Debian/Ubuntu..."; \
		sudo apt-get update && sudo apt-get install -y \
			build-essential \
			pkg-config \
			libgtk-3-dev \
			libcairo2-dev \
			libx11-dev; \
	elif [ "$(DISTRO)" = "fedora" ] || [ "$(DISTRO)" = "rhel" ] || [ "$(DISTRO)" = "centos" ]; then \
		echo "Installing dependencies for Fedora/RHEL..."; \
		sudo dnf install -y \
			gcc \
			make \
			pkg-config \
			gtk3-devel \
			cairo-devel \
			libX11-devel; \
	elif [ "$(DISTRO)" = "arch" ] || [ "$(DISTRO)" = "manjaro" ]; then \
		echo "Installing dependencies for Arch Linux..."; \
		sudo pacman -S --needed --noconfirm \
			base-devel \
			pkg-config \
			gtk3 \
			cairo \
			libx11; \
	elif [ "$(DISTRO)" = "opensuse" ] || [ "$(DISTRO)" = "sles" ]; then \
		echo "Installing dependencies for openSUSE..."; \
		sudo zypper install -y \
			gcc \
			make \
			pkg-config \
			gtk3-devel \
			cairo-devel \
			libX11-devel; \
	else \
		echo "Unknown distribution: $(DISTRO)"; \
		echo "Please install the following packages manually:"; \
		echo "  - GTK+ 3.0 development files"; \
		echo "  - Cairo development files"; \
		echo "  - X11 development files"; \
		echo "  - pkg-config"; \
		echo "  - C compiler (gcc)"; \
		exit 1; \
	fi
	@echo ""
	@echo "Dependencies installed successfully!"
	@echo "Now run 'make' to build the application."

# Run the application
run: $(TARGET)
	@./run.sh

# Run in debug mode
debug: $(TARGET)
	@./debug.sh

help:
	@echo "Enhanced Screenshot - Build System"
	@echo ""
	@echo "Usage:"
	@echo "  make               - Build the application"
	@echo "  make run           - Build and run the application"
	@echo "  make debug         - Run in debug mode with verbose output"
	@echo "  make deps          - Install dependencies (auto-detects distro)"
	@echo "  make check-deps    - Check if dependencies are installed"
	@echo "  make clean         - Remove build files"
	@echo "  make install       - Install to /usr/local/bin"
	@echo "  make help          - Show this help message"
	@echo ""
	@echo "Dependencies:"
	@echo "  - GTK+ 3.0"
	@echo "  - Cairo"
	@echo "  - X11"
	@echo "  - pkg-config"
	@echo "  - C compiler (gcc)"
	@echo ""
	@echo "Supported distributions:"
	@echo "  - Ubuntu/Debian/Linux Mint"
	@echo "  - Fedora/RHEL/CentOS"
	@echo "  - Arch Linux/Manjaro"
	@echo "  - openSUSE/SLES"
	@echo ""
	@echo "Quick start:"
	@echo "  1. make deps       # Install dependencies"
	@echo "  2. make run        # Build and run"
	@echo ""
	@echo "Or simply run:"
	@echo "  ./run.sh           # Automatic build and run"
