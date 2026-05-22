# Screen Recorder (Linux, GTK3) — C++17
#
#   make deps    # install development packages (Debian/Ubuntu)
#   make         # build ./screenrecorder
#   make run     # run the application
#   make clean   # remove build artifacts

PROJECT   := screencam
BUILD_DIR := build
TARGET    := $(PROJECT)

CXX        ?= g++
PKG_CONFIG ?= pkg-config

GTK_CFLAGS  := $(shell $(PKG_CONFIG) --cflags gtk+-3.0 2>/dev/null)
GTK_LIBS    := $(shell $(PKG_CONFIG) --libs   gtk+-3.0 2>/dev/null)
X11_CFLAGS  := $(shell $(PKG_CONFIG) --cflags x11 2>/dev/null)
X11_LIBS    := $(shell $(PKG_CONFIG) --libs   x11 2>/dev/null)
GIO_CFLAGS  := $(shell $(PKG_CONFIG) --cflags gio-unix-2.0 2>/dev/null)
GIO_LIBS    := $(shell $(PKG_CONFIG) --libs   gio-unix-2.0 2>/dev/null)
GST_CFLAGS  := $(shell $(PKG_CONFIG) --cflags gstreamer-1.0 gstreamer-video-1.0 2>/dev/null)
GST_LIBS    := $(shell $(PKG_CONFIG) --libs   gstreamer-1.0 gstreamer-video-1.0 2>/dev/null)

CXXFLAGS := -std=c++17 -Wall -Wextra -Werror -O2 -pthread \
            -Iinclude $(GTK_CFLAGS) $(X11_CFLAGS) $(GIO_CFLAGS) $(GST_CFLAGS) $(CPPFLAGS)
LDFLAGS  := -pthread $(GTK_LIBS) $(X11_LIBS) $(GIO_LIBS) $(GST_LIBS) $(LDFLAGS_EXTRA)

SRCS := src/main.cpp \
        src/gui_gtk.cpp \
        src/gui_utils.cpp \
        src/audio.cpp \
        src/capture.cpp \
        src/recorder.cpp \
        src/window_picker.cpp
OBJS    := $(SRCS:src/%.cpp=$(BUILD_DIR)/%.o)
N_OBJS  := $(words $(OBJS))

.PHONY: all deps deps-list clean run check-deps banner done compile

define step
	@printf "\n========================================\n"
	@printf "  %s\n" "$(1)"
	@printf "========================================\n"
endef

define detail
	@printf "  → %s\n" "$(1)"
endef

all: banner check-deps compile $(TARGET) done

compile: | $(BUILD_DIR)
	$(call step,[2/4] Compiling ($(N_OBJS) source files))
	@$(MAKE) $(MAKEFLAGS) --no-print-directory $(OBJS)

banner:
	$(call step,Build: $(PROJECT))
	$(call detail,Sources: $(SRCS))

done:
	$(call step,[4/4] Build finished)
	$(call detail,Binary: ./$(TARGET))

check-deps:
	$(call step,[1/4] Checking dependencies)
	$(call detail,Required: gtk+-3.0 x11 gio-unix-2.0 gstreamer-1.0 gstreamer-video-1.0)
	@$(PKG_CONFIG) --exists gtk+-3.0 x11 gio-unix-2.0 gstreamer-1.0 gstreamer-video-1.0 || \
		(printf "  → ERROR: missing packages. Run: make deps\n\n"; exit 1)
	$(call detail,OK — all required packages found.)

$(TARGET): $(OBJS) | $(BUILD_DIR)
	$(call step,[3/4] Linking executable)
	$(call detail,Target: $@)
	@$(CXX) $(OBJS) -o $@ $(LDFLAGS)
	$(call detail,Link complete.)

$(BUILD_DIR)/main.o: src/main.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/gui_gtk.o: src/gui_gtk.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/gui_utils.o: src/gui_utils.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/audio.o: src/audio.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/capture.o: src/capture.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/recorder.o: src/recorder.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR)/window_picker.o: src/window_picker.cpp | $(BUILD_DIR)
	@printf "  [CC] %s\n" "$<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR):
	@mkdir -p $@

# Debian / Ubuntu development + GStreamer codec packages
APT_PACKAGES := \
	build-essential \
	pkg-config \
	libgtk-3-dev \
	libx11-dev \
	libglib2.0-dev \
	gstreamer1.0-tools \
	gstreamer1.0-plugins-base \
	gstreamer1.0-plugins-good \
	gstreamer1.0-plugins-bad \
	gstreamer1.0-plugins-ugly \
	gstreamer1.0-pipewire \
	libgstreamer1.0-dev \
	libgstreamer-plugins-base1.0-dev

deps-list:
	$(call step,Dependency package list)
	$(call detail,$(APT_PACKAGES))

deps:
	$(call step,Installing development packages)
	@if command -v apt-get >/dev/null 2>&1; then \
		printf "  → Package manager: apt-get\n"; \
		sudo apt-get update && sudo apt-get install -y $(APT_PACKAGES); \
	elif command -v dnf >/dev/null 2>&1; then \
		printf "  → Package manager: dnf\n"; \
		sudo dnf install -y gcc-c++ make pkg-config gtk3-devel libX11-devel glib2-devel \
		    gstreamer1-devel gstreamer1-plugins-base-devel \
		    gstreamer1-plugins-good gstreamer1-plugins-bad-free gstreamer1-plugins-ugly-free; \
	elif command -v pacman >/dev/null 2>&1; then \
		printf "  → Package manager: pacman\n"; \
		sudo pacman -S --needed --noconfirm base-devel pkg-config gtk3 libx11 glib2 \
		    gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly; \
	else \
		printf "  → ERROR: unsupported package manager\n"; \
		exit 1; \
	fi
	$(call step,Package installation finished)
	$(call detail,Next: make)

run: $(TARGET)
	$(call step,Running $(PROJECT))
	@./$(TARGET)

clean:
	$(call step,Cleaning build artifacts)
	$(call detail,Removing: $(BUILD_DIR)/ and $(TARGET))
	@rm -rf $(BUILD_DIR)
	@rm -f $(TARGET)
	$(call detail,Done.)
