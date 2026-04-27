#ifndef SCREENSHOT_H
#define SCREENSHOT_H

#include <gtk/gtk.h>

typedef enum {
    SCREENSHOT_FULL_SCREEN,
    SCREENSHOT_WINDOW,
    SCREENSHOT_AREA
} ScreenshotType;

GdkPixbuf* capture_screenshot(ScreenshotType type);
GdkPixbuf* capture_screenshot_with_delay(ScreenshotType type, int delay_seconds);

#endif /* SCREENSHOT_H */
