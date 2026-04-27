#ifndef UI_H
#define UI_H

#include <gtk/gtk.h>
#include "capture.h"  // For ImageData type

/**
 * UI Module - GTK-dependent user interface components
 * 
 * This module handles all GTK-specific UI operations including:
 * - Main window creation and management
 * - Button and widget handling
 * - Event callbacks
 * - Dialog boxes
 */

// UI Context structure
typedef struct {
    GtkWidget *window;
    GtkWidget *capture_full_btn;
    GtkWidget *capture_area_btn;
    GtkWidget *capture_window_btn;
    GtkWidget *save_btn;
    GtkWidget *status_label;
    GtkWidget *delay_combo;
    GtkWidget *format_combo;
    GtkWidget *preview_image;
    GtkWidget *preview_frame;
    GtkWidget *preview_scrolled;
    GdkPixbuf *current_pixbuf;
    ImageData *current_image;
} UIContext;

// UI Initialization and cleanup
UIContext* ui_init(int argc, char *argv[]);
void ui_cleanup(UIContext *ctx);

// Main UI operations
void ui_show(UIContext *ctx);
void ui_run(UIContext *ctx);

// Status updates
void ui_update_status(UIContext *ctx, const char *message);
void ui_show_error(UIContext *ctx, const char *error_message);
void ui_show_success(UIContext *ctx, const char *success_message);

// Dialog boxes
gboolean ui_show_confirm_dialog(UIContext *ctx, const char *message);

// Widget helpers
int ui_get_delay_seconds(UIContext *ctx);
const char* ui_get_format(UIContext *ctx);

#endif // UI_H
