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
else
  WHISPER_CFLAGS  := -I$(WHISPER_INSTALL)/include
endif
WHISPER_LDFLAGS := -L$(WHISPER_INSTALL)/lib \
  -Wl,--start-group -lwhisper -lggml-cpu -lggml-base -lggml -Wl,--end-group -lgomp -lm

CFLAGS   := -O2 -Wall -std=c11   -I$(PARENT) $(WHISPER_CFLAGS)
CXXFLAGS := -O2 -Wall -std=c++17 -I$(PARENT) $(WHISPER_CFLAGS)
LDFLAGS  := $(WHISPER_LDFLAGS) -lpthread -lstdc++

RUN_ENV  :=

MODEL_DIR := $(HOME)/.local/share/sttgtk/models
ifeq ($(OS),Darwin)
  MODEL_DIR := $(HOME)/Library/Application\ Support/sttgtk/models
endif

SRCS  := test_stt.c $(PARENT)/stt_core.cpp
OBJS  := test_stt.o stt_core.o

.PHONY: all build test run run-all clean

all: build

build: $(APP) test_filter

test_stt.o: test_stt.c
	@echo "  [컴파일]  $<"
	@$(CC) $(CFLAGS) -c $< -o $@

stt_core.o: $(PARENT)/stt_core.cpp
	@echo "  [컴파일]  $<"
	@$(CXX) $(CXXFLAGS) -c $< -o $@

$(APP): $(OBJS)
	@echo "  [링크]    $(APP)"
	@$(CXX) $(OBJS) -o $@ $(LDFLAGS)
	@echo "  [완료]    ./$(APP)"

test_filter: test_filter.cpp
	@echo "  [컴파일]  test_filter.cpp"
	@$(CXX) -std=c++17 -O2 -Wall $< -o $@
	@echo "  [완료]    ./test_filter"

test: build
	@bash run_tests.sh

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
	@echo "  [삭제]  오브젝트 파일 및 바이너리..."
	@rm -f $(OBJS) $(APP) test_filter
	@echo "  [완료]"
