# Makefile for RTSP Server with GTK and GStreamer

CC = gcc
TARGET = rtsp-server
SOURCES = main.c rtsp_server.c gui.c
HEADERS = rtsp_server.h gui.h
OBJECTS = $(SOURCES:.c=.o)

# GTK3 및 GStreamer 플래그
CFLAGS = `pkg-config --cflags gtk+-3.0 gstreamer-1.0 gstreamer-rtsp-server-1.0 gstreamer-video-1.0`
LIBS = `pkg-config --libs gtk+-3.0 gstreamer-1.0 gstreamer-rtsp-server-1.0 gstreamer-video-1.0`

# 추가 컴파일 옵션
CFLAGS += -Wall -O2

# Windows 리소스 파일
RESOURCE_RC = app_resource.rc
RESOURCE_OBJ = app_resource.o

all: $(TARGET)

# Windows용 빌드 (리소스 포함)
ifeq ($(OS),Windows_NT)
$(TARGET): $(OBJECTS) $(RESOURCE_OBJ)
	$(CC) $(CFLAGS) -o $(TARGET) $(OBJECTS) $(RESOURCE_OBJ) $(LIBS) -mwindows
else
$(TARGET): $(OBJECTS)
	$(CC) $(CFLAGS) -o $(TARGET) $(OBJECTS) $(LIBS)
endif

# Windows 리소스 컴파일
$(RESOURCE_OBJ): $(RESOURCE_RC)
	windres $(RESOURCE_RC) -O coff -o $(RESOURCE_OBJ)

%.o: %.c $(HEADERS)
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(TARGET) $(TARGET).exe $(OBJECTS) $(RESOURCE_OBJ)

run: $(TARGET)
	./$(TARGET)

.PHONY: all clean run
