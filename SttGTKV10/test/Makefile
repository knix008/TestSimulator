SHELL := /bin/bash

OS      := $(shell uname -s)
APP     := test_stt

CC      ?= gcc
CXX     ?= g++

PARENT          := $(abspath ..)
WHISPER_INSTALL := $(PARENT)/third_party/install
WHISPER_PC_PATH := $(WHISPER_INSTALL)/lib/pkgconfig

WHISPER_PC_OK := $(shell PKG_CONFIG_PATH=$(WHISPER_PC_PATH) pkg-config --exists whisper 2>/dev/null && echo yes)

ifeq ($(WHISPER_PC_OK),yes)
  WHISPER_CFLAGS  := $(shell PKG_CONFIG_PATH=$(WHISPER_PC_PATH) pkg-config --cflags whisper)
  WHISPER_LDFLAGS := $(shell PKG_CONFIG_PATH=$(WHISPER_PC_PATH) pkg-config --libs   whisper)
else
  WHISPER_CFLAGS  := -I$(WHISPER_INSTALL)/include
  WHISPER_LDFLAGS := -L$(WHISPER_INSTALL)/lib -lwhisper
endif

CFLAGS   := -O2 -Wall -std=c11   -I$(PARENT) $(WHISPER_CFLAGS)
CXXFLAGS := -O2 -Wall -std=c++17 -I$(PARENT) $(WHISPER_CFLAGS)
LDFLAGS  := $(WHISPER_LDFLAGS) -lpthread -lstdc++ -lm

ifeq ($(OS),Linux)
  LDFLAGS += -Wl,-rpath,$(abspath $(WHISPER_INSTALL)/lib)
  RUN_ENV := LD_LIBRARY_PATH=$(abspath $(WHISPER_INSTALL)/lib):$$LD_LIBRARY_PATH
else ifeq ($(OS),Darwin)
  RUN_ENV := DYLD_LIBRARY_PATH=$(abspath $(WHISPER_INSTALL)/lib):$$DYLD_LIBRARY_PATH
endif

MODEL_DIR := $(HOME)/.local/share/sttgtk/models
ifeq ($(OS),Darwin)
  MODEL_DIR := $(HOME)/Library/Application\ Support/sttgtk/models
endif

SRCS  := test_stt.c $(PARENT)/stt_core.cpp
OBJS  := test_stt.o stt_core.o

.PHONY: all build run run-all clean

all: build

build: $(APP)

test_stt.o: test_stt.c
	$(CC) $(CFLAGS) -c $< -o $@

stt_core.o: $(PARENT)/stt_core.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

$(APP): $(OBJS)
	$(CXX) $(OBJS) -o $@ $(LDFLAGS)

run: build
	@model=$(MODEL_DIR)/ggml-tiny.bin; \
	wav=ko_test_1.wav; \
	echo "========================================"; \
	echo "Test audio: $$wav"; \
	echo "Model:      $$model"; \
	echo "========================================"; \
	$(RUN_ENV) ./$(APP) "$$model" "$$wav"

run-all: build
	@for model in tiny base small; do \
		mpath=$(MODEL_DIR)/ggml-$$model.bin; \
		[ -f "$$mpath" ] || { echo "Skipping $$model (not downloaded)"; continue; }; \
		echo ""; \
		echo "══════════════════════════════════════════"; \
		echo " Model: $$model"; \
		echo "══════════════════════════════════════════"; \
		for i in 1 2 3; do \
			wav=ko_test_$$i.wav; \
			[ -f "$$wav" ] || continue; \
			echo ""; \
			echo "── Audio $$i ──────────────────────────────"; \
			$(RUN_ENV) ./$(APP) "$$mpath" "$$wav"; \
		done; \
	done

clean:
	rm -f $(OBJS) $(APP)
