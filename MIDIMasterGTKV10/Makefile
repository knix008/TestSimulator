# MIDIMaster GTK V10 — Verovio sheet music + FluidSynth playback
#
#   make          # auto-install deps, build Verovio if needed, compile
#   make setup    # same as make
#   make run
#
#   MIDIMaster_AUTO_INSTALL=0 make   # disable automatic package install

CC          = gcc
CXX         = g++
CFLAGS      = -Wall -Wextra -O2 -std=c11
TARGET      = midimaster
APP_NAME    = MIDI Master GTK V10
BUILDDIR    = build
UNAME_S     := $(shell uname -s)

ifeq ($(UNAME_S),Darwin)
  PLATFORM = macos
else
  PLATFORM = linux
endif

SOUNDFONT_SRC = ../MIDIMasterWinV10/MIDIMasterWinV10/SoundFonts/TimGM6mb.sf2
SOUNDFONT_DST = SoundFonts/TimGM6mb.sf2

ICON_DST = daemon_hammer.ico
ICON_SRC = ../TTSWinV10/daemon_hammer.ico \
           ../VNCServerWinV10/VNCServer/daemon_hammer.ico \
           ../CompareMasterWinV10/CompareMasterWinV10.App/daemon_hammer.ico

PKGS = gtk+-3.0 gdk-pixbuf-2.0 librsvg-2.0 fluidsynth sndfile glib-2.0 cairo pangocairo

ifeq ($(UNAME_S),Darwin)
  BREW_PREFIX := $(shell brew --prefix 2>/dev/null || echo /usr/local)
  export PKG_CONFIG_PATH := \
      $(BREW_PREFIX)/lib/pkgconfig:\
      $(BREW_PREFIX)/opt/gtk+3/lib/pkgconfig:\
      $(BREW_PREFIX)/opt/gdk-pixbuf/lib/pkgconfig:\
      $(BREW_PREFIX)/opt/fluid-synth/lib/pkgconfig:\
      $(BREW_PREFIX)/opt/libsndfile/lib/pkgconfig:\
      $(BREW_PREFIX)/opt/librsvg/lib/pkgconfig:\
      $(BREW_PREFIX)/opt/cairo/lib/pkgconfig:\
      $(PKG_CONFIG_PATH)
endif

GTK_CFLAGS = $(shell pkg-config --cflags $(PKGS))
GTK_LIBS   = $(shell pkg-config --libs $(PKGS))

INCLUDES = -Iinclude

# Optional MP3 export
MP3_LDLIBS := $(shell pkg-config --exists lame 2>/dev/null && echo -lmp3lame || true)
ifneq ($(MP3_LDLIBS),)
  CFLAGS += -DHAVE_LAME
endif

CFLAGS += $(GTK_CFLAGS) $(INCLUDES)
LDFLAGS = $(GTK_LIBS) $(MP3_LDLIBS) -lm

CORE_SOURCES = source/main.c \
               source/midi_file.c \
               source/midi_player.c \
               source/audio_export.c \
               source/general_midi.c \
               source/score_verovio.c \
               source/paths.c

GTK_SOURCES = source/gtk/svg_raster.c \
              source/gtk/app_icon.c \
              source/gtk/score_view.c \
              source/gtk/main_window.c

SOURCES = $(CORE_SOURCES) $(GTK_SOURCES)

OBJECTS = $(patsubst source/%.c,$(BUILDDIR)/%.o,$(SOURCES))

# Plain `make` runs the full pipeline (deps check → install if needed → build).
.DEFAULT_GOAL := all

.PHONY: all setup _assert-deps install-deps check-deps \
        soundfont appicon run test-export install-desktop clean distclean info help

# 1) check-deps (install-deps on failure)  2) SoundFont  3) link midimaster
all: _assert-deps soundfont appicon $(TARGET)
	@echo ""
	@echo "==> Build complete: ./$(TARGET)   (run: make run)"

setup: all

help:
	@echo "MIDIMaster GTK V10"
	@echo "  make              Check deps, install if missing, build (default)"
	@echo "  make setup        Same as make"
	@echo "  make install-deps Install all system + Python dependencies"
	@echo "  make check-deps   Verify dependencies only"
	@echo "  make run          Run ./$(TARGET)"
	@echo "  make test-export  Test WAV/MP3 export"
	@echo "  make clean        Remove build artifacts"
	@echo "  make distclean    Also remove Verovio build"
	@echo "  MIDIMaster_AUTO_INSTALL=0 make   Disable auto install on build"

_assert-deps:
	@chmod +x scripts/check-deps.sh scripts/install-deps.sh scripts/build-verovio.sh 2>/dev/null || true
	@if bash scripts/check-deps.sh >/dev/null 2>&1; then \
	    :; \
	else \
	    if [ "$${MIDIMaster_AUTO_INSTALL:-1}" = "1" ]; then \
	        echo ""; \
	        echo "  ==> Missing dependencies — running 'make install-deps' (sudo may prompt)..."; \
	        echo ""; \
	        $(MAKE) --no-print-directory install-deps || exit 1; \
	    else \
	        echo ""; \
	        echo "  MIDIMaster_AUTO_INSTALL=0 — run: make install-deps"; \
	        bash scripts/check-deps.sh || exit 1; \
	    fi; \
	fi

install-deps:
	@chmod +x scripts/install-deps.sh scripts/check-deps.sh
	@bash scripts/install-deps.sh

check-deps:
	@chmod +x scripts/check-deps.sh
	@bash scripts/check-deps.sh

soundfont: $(SOUNDFONT_DST)

$(SOUNDFONT_DST):
	@mkdir -p SoundFonts
	@if [ -f "$(SOUNDFONT_SRC)" ]; then \
	    cp -f "$(SOUNDFONT_SRC)" "$@"; \
	    echo "[ SF ] $@"; \
	else \
	    echo "  [!] SoundFont not found: $(SOUNDFONT_SRC)"; \
	    echo "      Place TimGM6mb.sf2 in SoundFonts/"; \
	    exit 1; \
	fi

appicon: $(ICON_DST)

$(ICON_DST):
	@if [ -f "$(ICON_DST)" ]; then \
	    :; \
	else \
	    for s in $(ICON_SRC); do \
	        if [ -f "$$s" ]; then \
	            ln -sf "$$s" "$(ICON_DST)"; \
	            echo "[ICON] $(ICON_DST) -> $$s"; \
	            exit 0; \
	        fi; \
	    done; \
	    echo "  [!] $(ICON_DST) not found (About dialog / window icon)"; \
	    echo "      ln -sf ../TTSWinV10/daemon_hammer.ico $(ICON_DST)"; \
	fi

$(TARGET): $(OBJECTS) | soundfont appicon
	@echo "[ LD ] $(TARGET)"
	@$(CC) $(OBJECTS) -o $(TARGET) $(LDFLAGS)

$(BUILDDIR)/%.o: source/%.c include/*.h include/gtk/*.h | $(BUILDDIR)
	@mkdir -p $(dir $@)
	@echo "[ CC ] $<"
	@$(CC) $(CFLAGS) -c $< -o $@

$(BUILDDIR):
	@mkdir -p $(BUILDDIR)

run: $(TARGET)
	@./$(TARGET)

# Verify WAV/MP3 export (uses sample.mid from MidiSheetMusic if present)
TEST_MIDI ?= ../MidiSheetMusic(v2.6)/MidiSheetMusic/MidiSheetMusic-2.6-win-src(Revised)/sample.mid
test-export: $(TARGET) $(SOUNDFONT_DST)
	@$(CC) -Wall -O2 $(CFLAGS) -Iinclude \
	    -o test_audio_export tests/test_audio_export.c \
	    source/audio_export.c source/paths.c \
	    $(shell pkg-config --libs glib-2.0 fluidsynth) $(MP3_LDLIBS) -lm
	@./test_audio_export "$(TEST_MIDI)"
	@file /tmp/midimaster_test.wav /tmp/midimaster_test.mp3
	@rm -f test_audio_export

install-desktop: $(TARGET)
ifeq ($(UNAME_S),Linux)
	@mkdir -p "$$HOME/.local/share/applications"
	@sed "s|@EXEC@|$(CURDIR)/$(TARGET)|g" midimaster.desktop > "$$HOME/.local/share/applications/midimaster.desktop"
	@chmod +x "$$HOME/.local/share/applications/midimaster.desktop"
	@echo "Installed desktop entry."
endif

clean:
	@rm -rf $(BUILDDIR) $(TARGET)

distclean: clean

info:
	@echo "Platform:   $(PLATFORM)"
	@echo "SoundFont:  $(SOUNDFONT_DST)"
	@echo "MP3:        $(if $(MP3_LDLIBS),enabled,disabled — install libmp3lame-dev)"
