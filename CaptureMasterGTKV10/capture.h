#ifndef CAPTURE_H
#define CAPTURE_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

/**
 * Capture Module - Platform-specific screen capture functionality
 * 
 * This module provides screen capture operations for different platforms.
 * Implementation details are platform-specific but the API is consistent.
 */

// Capture modes
typedef enum {
    CAPTURE_MODE_FULLSCREEN,
    CAPTURE_MODE_AREA,
    CAPTURE_MODE_WINDOW
} CaptureMode;

// Image formats
typedef enum {
    IMAGE_FORMAT_PNG,
    IMAGE_FORMAT_JPEG
} ImageFormat;

// Capture area structure
typedef struct {
    int x;
    int y;
    int width;
    int height;
} CaptureArea;

// Image data structure
typedef struct {
    uint8_t *data;
    int width;
    int height;
    int channels;  // 3 for RGB, 4 for RGBA
    size_t size;
} ImageData;

// Capture operations
bool capture_init(void);
void capture_cleanup(void);

// Main capture functions
ImageData* capture_fullscreen(void);
ImageData* capture_area(const CaptureArea *area);
ImageData* capture_window(void);

// Image operations
bool image_save(const ImageData *img, const char *filepath, ImageFormat format);
void image_free(ImageData *img);
bool image_to_clipboard(const ImageData *img);

// Platform detection
const char* capture_get_platform(void);
bool capture_is_supported(void);

// Error handling
const char* capture_get_last_error(void);

#endif // CAPTURE_H
