# VNC Server (Linux, GTK3) — C/C++ build
#
#   make deps    # install development packages (Debian/Ubuntu)
#   make         # build ./vncserver-gtk
#   make run     # run the GUI application
#   make clean

PROJECT   := vncserver
BUILD_DIR := build
TARGET    := $(PROJECT)

CXX        ?= g++
PKG_CONFIG ?= pkg-config

# --- pkg-config flags (empty if package missing until `make deps`) ---
GTK_CFLAGS  := $(shell $(PKG_CONFIG) --cflags gtk+-3.0 2>/dev/null)
GTK_LIBS    := $(shell $(PKG_CONFIG) --libs gtk+-3.0 2>/dev/null)
VNC_CFLAGS  := $(shell $(PKG_CONFIG) --cflags libvncserver 2>/dev/null)
VNC_LIBS    := $(shell $(PKG_CONFIG) --libs libvncserver 2>/dev/null)
X11_CFLAGS  := $(shell $(PKG_CONFIG) --cflags x11 2>/dev/null)
X11_LIBS    := $(shell $(PKG_CONFIG) --libs x11 2>/dev/null)
XTST_LIBS   := $(shell $(PKG_CONFIG) --libs xtst 2>/dev/null)
XEXT_LIBS   := -lXext
XCOMPOSITE_LIBS := -lXcomposite
XDAMAGE_LIBS    := -lXdamage
GST_CFLAGS  := $(shell $(PKG_CONFIG) --cflags gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0 2>/dev/null)
GST_LIBS    := $(shell $(PKG_CONFIG) --libs gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0 2>/dev/null)

CXXFLAGS := -std=c++17 -Wall -Wextra -Werror -O2 -pthread \
            -Iinclude $(GTK_CFLAGS) $(VNC_CFLAGS) $(X11_CFLAGS) $(GST_CFLAGS) $(CPPFLAGS)
LDFLAGS  := -pthread $(GTK_LIBS) $(VNC_LIBS) $(X11_LIBS) $(XEXT_LIBS) $(XCOMPOSITE_LIBS) \
            $(XDAMAGE_LIBS) $(GST_LIBS) $(XTST_LIBS) $(LDFLAGS_EXTRA)

SRCS     := src/main.cpp src/gui_gtk.cpp src/vnc_core.cpp src/capture_gstreamer.cpp \
            src/window_picker.cpp
OBJS     := $(SRCS:src/%.cpp=$(BUILD_DIR)/%.o)
N_OBJS   := $(words $(OBJS))

# Per-translation-unit summary (MODULE_DESC_<stem>)
MODULE_DESC_main     := Application entry point (no GTK)
MODULE_DESC_gui_gtk  := GTK3 GUI — window, controls, server start/stop
MODULE_DESC_vnc_core := VNC core — libvncserver, X11 capture, remote input
MODULE_DESC_capture_gstreamer := GStreamer / portal full-desktop capture
MODULE_DESC_window_picker := X11 window list and picker dialog

.PHONY: all deps deps-list clean run check-deps banner done compile

# $(call step, title)
define step
	@printf "\n========================================\n"
	@printf "  %s\n" "$(1)"
	@printf "========================================\n"
endef

# $(call detail, message)
define detail
	@printf "  → %s\n" "$(1)"
endef

all: banner check-deps compile $(TARGET) done

# Show the compilation banner once, then build all object files.
compile: | $(BUILD_DIR)
	$(call step,[2/4] Compiling ($(N_OBJS) source files))
	@$(MAKE) $(MAKEFLAGS) --no-print-directory $(OBJS)

banner:
	$(call step,Build: $(PROJECT))
	$(call detail,Sources: $(SRCS))

done:
	$(call step,[4/4] Build finished)
	$(call detail,Binary: $(TARGET))

check-deps:
	$(call step,[1/4] Checking dependencies)
	$(call detail,Required: gtk+-3.0 libvncserver x11 xtst)
	@$(PKG_CONFIG) --exists gtk+-3.0 libvncserver x11 xtst gstreamer-1.0 gstreamer-app-1.0 gstreamer-video-1.0 || \
		(printf "  → ERROR: missing packages. Run: make deps\n\n"; exit 1)
	$(call detail,OK — all required packages found.)

# Final binary in project root; object files in $(BUILD_DIR)/
$(TARGET): $(OBJS) | $(BUILD_DIR)
	$(call step,[3/4] Linking executable)
	$(call detail,Target: $@)
	$(call detail,Objects: $(OBJS))
	@$(CXX) $(OBJS) -o $@ $(LDFLAGS)
	$(call detail,Link complete.)

$(BUILD_DIR)/main.o: src/main.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/gui_gtk.o: src/gui_gtk.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/vnc_core.o: src/vnc_core.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/capture_gstreamer.o: src/capture_gstreamer.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/window_picker.o: src/window_picker.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR):
	@mkdir -p $@

# Debian / Ubuntu development packages
APT_PACKAGES := \
	build-essential \
	pkg-config \
	libgtk-3-dev \
	libvncserver-dev \
	libx11-dev \
	libxcomposite-dev \
	libxtst-dev \
	gstreamer1.0-tools \
	gstreamer1.0-plugins-base \
	gstreamer1.0-plugins-good \
	libgstreamer1.0-dev \
	libgstreamer-plugins-base1.0-dev

deps-list:
	$(call step,Dependency package list)
	$(call detail,$(APT_PACKAGES))

deps:
	$(call step,Installing development packages)
	@if command -v apt-get >/dev/null 2>&1; then \
		printf "  → Package manager: apt-get\n"; \
		printf "  → Packages: $(APT_PACKAGES)\n"; \
		sudo apt-get update && sudo apt-get install -y $(APT_PACKAGES); \
	elif command -v dnf >/dev/null 2>&1; then \
		printf "  → Package manager: dnf\n"; \
		sudo dnf install -y gcc-c++ make pkg-config gtk3-devel libvncserver-devel libX11-devel libXcomposite-devel libXtst-devel gstreamer1-devel gstreamer1-plugins-base-devel; \
	elif command -v pacman >/dev/null 2>&1; then \
		printf "  → Package manager: pacman\n"; \
		sudo pacman -S --needed --noconfirm base-devel pkg-config gtk3 libvncserver libxtst; \
	else \
		printf "  → ERROR: unsupported package manager\n"; \
		printf "  → Install manually: $(APT_PACKAGES)\n"; \
		exit 1; \
	fi
	$(call step,Package installation finished)
	$(call detail,Next: make)

run: $(TARGET)
	$(call step,Running $(PROJECT))
	$(call detail,Command: ./$(TARGET))
	@./$(TARGET)

clean:
	$(call step,Cleaning build artifacts)
	$(call detail,Removing: $(BUILD_DIR)/ and $(TARGET))
	@rm -rf $(BUILD_DIR)
	@rm -f $(TARGET)
	$(call detail,Done.)
