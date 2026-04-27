/**
 * CaptureMaster GTK v1.0
 * Main Application Entry Point
 * 
 * Cross-platform screen capture tool for Linux and macOS
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ui.h"
#include "capture.h"
#include "utils.h"

// Application version
#define APP_VERSION "1.0.0"
#define APP_NAME "CaptureMaster GTK"

// Print usage information
static void print_usage(const char *program_name) {
    printf("%s v%s\n", APP_NAME, APP_VERSION);
    printf("Usage: %s [OPTIONS]\n\n", program_name);
    printf("Options:\n");
    printf("  -h, --help              Show this help message\n");
    printf("  -v, --version           Show version information\n");
    printf("  --fullscreen FILE       Capture fullscreen and save to FILE\n");
    printf("  --area FILE             Capture area and save to FILE\n");
    printf("  --window FILE           Capture window and save to FILE\n");
    printf("\n");
    printf("Examples:\n");
    printf("  %s                      Launch GUI\n", program_name);
    printf("  %s --fullscreen out.png Capture fullscreen to out.png\n", program_name);
    printf("\n");
}

// Print version information
static void print_version(void) {
    printf("%s v%s\n", APP_NAME, APP_VERSION);
    printf("Platform: %s\n", capture_get_platform());
    printf("Built: %s %s\n", __DATE__, __TIME__);
}

// Command-line capture mode (no GUI)
static int cli_capture(CaptureMode mode, const char *output_file) {
    utils_log_info("Starting CLI capture mode: %d", mode);
    
    if (!capture_init()) {
        utils_log_error("Failed to initialize capture: %s", capture_get_last_error());
        return EXIT_FAILURE;
    }
    
    ImageData *img = NULL;
    
    switch (mode) {
        case CAPTURE_MODE_FULLSCREEN:
            utils_log_info("Capturing fullscreen...");
            img = capture_fullscreen();
            break;
            
        case CAPTURE_MODE_AREA:
            utils_log_info("Capturing area...");
            // For CLI mode, we'll capture fullscreen as area selection needs GUI
            img = capture_fullscreen();
            break;
            
        case CAPTURE_MODE_WINDOW:
            utils_log_info("Capturing window...");
            img = capture_window();
            break;
    }
    
    if (!img) {
        utils_log_error("Capture failed: %s", capture_get_last_error());
        capture_cleanup();
        return EXIT_FAILURE;
    }
    
    utils_log_info("Captured image: %dx%d", img->width, img->height);
    
    // Determine format from extension
    ImageFormat format = IMAGE_FORMAT_PNG;
    const char *ext = utils_get_extension(output_file);
    if (ext && (strcmp(ext, "jpg") == 0 || strcmp(ext, "jpeg") == 0)) {
        format = IMAGE_FORMAT_JPEG;
    }
    
    if (!image_save(img, output_file, format)) {
        utils_log_error("Failed to save image: %s", capture_get_last_error());
        image_free(img);
        capture_cleanup();
        return EXIT_FAILURE;
    }
    
    utils_log_info("Image saved to: %s", output_file);
    printf("Screenshot saved to: %s\n", output_file);
    
    image_free(img);
    capture_cleanup();
    
    return EXIT_SUCCESS;
}

int main(int argc, char *argv[]) {
    // Parse command-line arguments
    if (argc > 1) {
        if (strcmp(argv[1], "-h") == 0 || strcmp(argv[1], "--help") == 0) {
            print_usage(argv[0]);
            return EXIT_SUCCESS;
        }
        
        if (strcmp(argv[1], "-v") == 0 || strcmp(argv[1], "--version") == 0) {
            print_version();
            return EXIT_SUCCESS;
        }
        
        if (strcmp(argv[1], "--fullscreen") == 0 && argc > 2) {
            return cli_capture(CAPTURE_MODE_FULLSCREEN, argv[2]);
        }
        
        if (strcmp(argv[1], "--area") == 0 && argc > 2) {
            return cli_capture(CAPTURE_MODE_AREA, argv[2]);
        }
        
        if (strcmp(argv[1], "--window") == 0 && argc > 2) {
            return cli_capture(CAPTURE_MODE_WINDOW, argv[2]);
        }
        
        fprintf(stderr, "Unknown option: %s\n", argv[1]);
        print_usage(argv[0]);
        return EXIT_FAILURE;
    }
    
    // GUI mode
    utils_log_info("Starting %s v%s", APP_NAME, APP_VERSION);
    utils_log_info("Platform: %s", capture_get_platform());
    
    // Check if capture is supported on this platform
    if (!capture_is_supported()) {
        fprintf(stderr, "Error: Screen capture not supported on this platform\n");
        return EXIT_FAILURE;
    }
    
    // Initialize capture system
    if (!capture_init()) {
        fprintf(stderr, "Error: Failed to initialize capture system: %s\n", 
                capture_get_last_error());
        return EXIT_FAILURE;
    }
    
    // Initialize UI
    UIContext *ui_ctx = ui_init(argc, argv);
    if (!ui_ctx) {
        fprintf(stderr, "Error: Failed to initialize UI\n");
        capture_cleanup();
        return EXIT_FAILURE;
    }
    
    // Show main window
    ui_show(ui_ctx);
    
    // Run main loop
    ui_run(ui_ctx);
    
    // Cleanup
    utils_log_info("Shutting down...");
    ui_cleanup(ui_ctx);
    capture_cleanup();
    
    utils_log_info("Application terminated successfully");
    return EXIT_SUCCESS;
}
