/**
 * CaptureMaster - UI Module
 * GTK-dependent user interface components
 * 
 * This file contains all GTK-specific code, making it easy to
 * port to other UI frameworks if needed.
 */

#include "ui.h"
#include "capture.h"
#include "utils.h"
#include <math.h>
#include <stdlib.h>
#include <string.h>

// Global callback data structure
typedef struct {
    UIContext *ui_ctx;
    CaptureMode mode;
} CallbackData;

// Forward declarations of callback functions
static void on_capture_fullscreen_clicked(GtkWidget *widget, gpointer data);
static void on_capture_area_clicked(GtkWidget *widget, gpointer data);
static void on_capture_window_clicked(GtkWidget *widget, gpointer data);
static void on_save_clicked(GtkWidget *widget, gpointer data);
static void on_window_destroy(GtkWidget *widget, gpointer data);
static void on_about_clicked(GtkWidget *widget, gpointer data);

// Helper to display captured image
static void display_captured_image(UIContext *ctx, ImageData *img);

typedef struct {
    GtkWidget *window;
    GMainLoop *loop;
    gboolean selecting;
    gboolean accepted;
    double start_x;
    double start_y;
    double cur_x;
    double cur_y;
    CaptureArea area;
} AreaSelectionState;

static gboolean area_overlay_on_draw(GtkWidget *widget, cairo_t *cr, gpointer data);
static gboolean area_overlay_on_button_press(GtkWidget *widget, GdkEventButton *event, gpointer data);
static gboolean area_overlay_on_motion(GtkWidget *widget, GdkEventMotion *event, gpointer data);
static gboolean area_overlay_on_button_release(GtkWidget *widget, GdkEventButton *event, gpointer data);
static gboolean area_overlay_on_key_press(GtkWidget *widget, GdkEventKey *event, gpointer data);
static gboolean select_area_interactively(UIContext *ctx, CaptureArea *out_area);
static void hide_main_window_for_capture(UIContext *ctx);
static void restore_main_window_after_capture(UIContext *ctx);

// GdkPixbufDestroyNotify wrapper for g_free
static void pixbuf_data_free(guchar *pixels, gpointer data) {
    (void)data;
    g_free(pixels);
}

static gboolean area_overlay_on_draw(GtkWidget *widget, cairo_t *cr, gpointer data) {
    (void)widget;
    AreaSelectionState *s = (AreaSelectionState*)data;

    cairo_set_source_rgba(cr, 0.0, 0.0, 0.0, 0.35);
    cairo_paint(cr);

    if (!s->selecting)
        return FALSE;

    double x = MIN(s->start_x, s->cur_x);
    double y = MIN(s->start_y, s->cur_y);
    double w = fabs(s->cur_x - s->start_x);
    double h = fabs(s->cur_y - s->start_y);

    cairo_set_operator(cr, CAIRO_OPERATOR_CLEAR);
    cairo_rectangle(cr, x, y, w, h);
    cairo_fill(cr);

    cairo_set_operator(cr, CAIRO_OPERATOR_OVER);
    cairo_set_source_rgba(cr, 0.2, 0.6, 1.0, 0.95);
    cairo_set_line_width(cr, 2.0);
    cairo_rectangle(cr, x, y, w, h);
    cairo_stroke(cr);

    return FALSE;
}

static gboolean area_overlay_on_button_press(GtkWidget *widget, GdkEventButton *event, gpointer data) {
    (void)widget;
    AreaSelectionState *s = (AreaSelectionState*)data;
    if (event->button != 1)
        return FALSE;

    s->selecting = TRUE;
    s->start_x = s->cur_x = event->x;
    s->start_y = s->cur_y = event->y;
    gtk_widget_queue_draw(s->window);
    return TRUE;
}

static gboolean area_overlay_on_motion(GtkWidget *widget, GdkEventMotion *event, gpointer data) {
    (void)widget;
    AreaSelectionState *s = (AreaSelectionState*)data;
    if (!s->selecting)
        return FALSE;

    s->cur_x = event->x;
    s->cur_y = event->y;
    gtk_widget_queue_draw(s->window);
    return TRUE;
}

static gboolean area_overlay_on_button_release(GtkWidget *widget, GdkEventButton *event, gpointer data) {
    (void)widget;
    AreaSelectionState *s = (AreaSelectionState*)data;
    if (event->button != 1 || !s->selecting)
        return FALSE;

    s->cur_x = event->x;
    s->cur_y = event->y;

    int x = (int)MIN(s->start_x, s->cur_x);
    int y = (int)MIN(s->start_y, s->cur_y);
    int w = (int)fabs(s->cur_x - s->start_x);
    int h = (int)fabs(s->cur_y - s->start_y);

    s->selecting = FALSE;
    if (w >= 2 && h >= 2) {
        s->area.x = x;
        s->area.y = y;
        s->area.width = w;
        s->area.height = h;
        s->accepted = TRUE;
    }

    g_main_loop_quit(s->loop);
    return TRUE;
}

static gboolean area_overlay_on_key_press(GtkWidget *widget, GdkEventKey *event, gpointer data) {
    (void)widget;
    AreaSelectionState *s = (AreaSelectionState*)data;
    if (event->keyval == GDK_KEY_Escape) {
        s->accepted = FALSE;
        g_main_loop_quit(s->loop);
        return TRUE;
    }
    return FALSE;
}

static gboolean select_area_interactively(UIContext *ctx, CaptureArea *out_area) {
    if (!ctx || !out_area)
        return FALSE;

    AreaSelectionState s;
    memset(&s, 0, sizeof(s));
    s.loop = g_main_loop_new(NULL, FALSE);

    s.window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_decorated(GTK_WINDOW(s.window), FALSE);
    gtk_window_fullscreen(GTK_WINDOW(s.window));
    gtk_window_set_keep_above(GTK_WINDOW(s.window), TRUE);
    gtk_window_set_skip_taskbar_hint(GTK_WINDOW(s.window), TRUE);
    gtk_window_set_skip_pager_hint(GTK_WINDOW(s.window), TRUE);
    gtk_widget_set_app_paintable(s.window, TRUE);
    gtk_widget_add_events(s.window,
                          GDK_BUTTON_PRESS_MASK |
                          GDK_BUTTON_RELEASE_MASK |
                          GDK_POINTER_MOTION_MASK |
                          GDK_KEY_PRESS_MASK);

    g_signal_connect(s.window, "draw", G_CALLBACK(area_overlay_on_draw), &s);
    g_signal_connect(s.window, "button-press-event", G_CALLBACK(area_overlay_on_button_press), &s);
    g_signal_connect(s.window, "motion-notify-event", G_CALLBACK(area_overlay_on_motion), &s);
    g_signal_connect(s.window, "button-release-event", G_CALLBACK(area_overlay_on_button_release), &s);
    g_signal_connect(s.window, "key-press-event", G_CALLBACK(area_overlay_on_key_press), &s);

    gtk_widget_show_all(s.window);
    gtk_widget_grab_focus(s.window);

    g_main_loop_run(s.loop);

    gtk_widget_destroy(s.window);
    g_main_loop_unref(s.loop);

    if (!s.accepted)
        return FALSE;

    *out_area = s.area;
    return TRUE;
}

static void hide_main_window_for_capture(UIContext *ctx) {
    if (!ctx || !ctx->window)
        return;
    gtk_window_iconify(GTK_WINDOW(ctx->window));
    while (gtk_events_pending()) {
        gtk_main_iteration();
    }
    utils_sleep_ms(200);
}

static void restore_main_window_after_capture(UIContext *ctx) {
    if (!ctx || !ctx->window)
        return;
    gtk_window_deiconify(GTK_WINDOW(ctx->window));
    while (gtk_events_pending()) {
        gtk_main_iteration();
    }
    /* Brief keep-above pulse helps reliably raise after portal dialogs. */
    gtk_window_set_keep_above(GTK_WINDOW(ctx->window), TRUE);
    gtk_window_present(GTK_WINDOW(ctx->window));
    while (gtk_events_pending()) {
        gtk_main_iteration();
    }
    gtk_window_set_keep_above(GTK_WINDOW(ctx->window), FALSE);
}

// Initialize UI context
UIContext* ui_init(int argc, char *argv[]) {
    gtk_init(&argc, &argv);
    
    UIContext *ctx = (UIContext*)utils_malloc(sizeof(UIContext));
    if (!ctx) {
        return NULL;
    }
    
    // Create main window
    ctx->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(ctx->window), "CaptureMaster GTK");
    gtk_window_set_default_size(GTK_WINDOW(ctx->window), 900, 800);
    gtk_window_set_position(GTK_WINDOW(ctx->window), GTK_WIN_POS_CENTER);
    gtk_container_set_border_width(GTK_CONTAINER(ctx->window), 0);
    
    // Set window icon - try multiple formats/paths
    GError *icon_error = NULL;
    const char *icon_paths[] = {
        "daemon_hammer.jpg",
        "./daemon_hammer.jpg",
        "daemon_hammer.png",
        "./daemon_hammer.png",
        "daemon_hammer.ico",
        "./daemon_hammer.ico",
        NULL
    };
    
    gboolean icon_loaded = FALSE;
    for (int i = 0; icon_paths[i] != NULL && !icon_loaded; i++) {
        icon_error = NULL;
        if (gtk_window_set_icon_from_file(GTK_WINDOW(ctx->window), 
                                          icon_paths[i], 
                                          &icon_error)) {
            utils_log("INFO", "Icon loaded successfully from: %s", icon_paths[i]);
            icon_loaded = TRUE;
        } else if (icon_error) {
            g_error_free(icon_error);
        }
    }
    
    if (!icon_loaded) {
        utils_log("WARNING", "Failed to load icon from any path");
    }
    
    // Initialize pixbuf storage
    ctx->current_pixbuf = NULL;
    ctx->current_image = NULL;
    
    // Create main container (vertical paned - top: controls, bottom: preview)
    GtkWidget *paned = gtk_paned_new(GTK_ORIENTATION_VERTICAL);
    gtk_container_add(GTK_CONTAINER(ctx->window), paned);

    // Top panel - Controls
    GtkWidget *left_vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_container_set_border_width(GTK_CONTAINER(left_vbox), 10);
    gtk_paned_pack1(GTK_PANED(paned), left_vbox, FALSE, FALSE);
    
    // Title label
    GtkWidget *title_label = gtk_label_new(NULL);
    gtk_label_set_markup(GTK_LABEL(title_label), 
                         "<span size='x-large' weight='bold'>CaptureMaster</span>");
    gtk_box_pack_start(GTK_BOX(left_vbox), title_label, FALSE, FALSE, 10);
    
    // Separator
    GtkWidget *separator1 = gtk_separator_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_box_pack_start(GTK_BOX(left_vbox), separator1, FALSE, FALSE, 5);
    
    // Capture mode frame
    GtkWidget *mode_frame = gtk_frame_new("캡처 모드");
    gtk_box_pack_start(GTK_BOX(left_vbox), mode_frame, FALSE, FALSE, 5);
    
    GtkWidget *mode_hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 5);
    gtk_container_set_border_width(GTK_CONTAINER(mode_hbox), 10);
    gtk_container_add(GTK_CONTAINER(mode_frame), mode_hbox);
    
    // Capture buttons - horizontal layout
    ctx->capture_full_btn = gtk_button_new_with_label("🖥️\n전체화면");
    ctx->capture_area_btn = gtk_button_new_with_label("✂️\n영역선택");
    ctx->capture_window_btn = gtk_button_new_with_label("🪟\n창캡처");
    
    gtk_box_pack_start(GTK_BOX(mode_hbox), ctx->capture_full_btn, TRUE, TRUE, 5);
    gtk_box_pack_start(GTK_BOX(mode_hbox), ctx->capture_area_btn, TRUE, TRUE, 5);
    gtk_box_pack_start(GTK_BOX(mode_hbox), ctx->capture_window_btn, TRUE, TRUE, 5);
    
    // Settings frame
    GtkWidget *settings_frame = gtk_frame_new("설정");
    gtk_box_pack_start(GTK_BOX(left_vbox), settings_frame, FALSE, FALSE, 5);
    
    GtkWidget *settings_grid = gtk_grid_new();
    gtk_grid_set_row_spacing(GTK_GRID(settings_grid), 10);
    gtk_grid_set_column_spacing(GTK_GRID(settings_grid), 10);
    gtk_container_set_border_width(GTK_CONTAINER(settings_grid), 10);
    gtk_container_add(GTK_CONTAINER(settings_frame), settings_grid);
    
    // Delay combo
    GtkWidget *delay_label = gtk_label_new("지연 시간:");
    gtk_widget_set_halign(delay_label, GTK_ALIGN_START);
    ctx->delay_combo = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(ctx->delay_combo), "없음");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(ctx->delay_combo), "3초");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(ctx->delay_combo), "5초");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(ctx->delay_combo), "10초");
    gtk_combo_box_set_active(GTK_COMBO_BOX(ctx->delay_combo), 0);
    
    gtk_grid_attach(GTK_GRID(settings_grid), delay_label, 0, 0, 1, 1);
    gtk_grid_attach(GTK_GRID(settings_grid), ctx->delay_combo, 1, 0, 1, 1);
    
    // Format combo
    GtkWidget *format_label = gtk_label_new("저장 형식:");
    gtk_widget_set_halign(format_label, GTK_ALIGN_START);
    ctx->format_combo = gtk_combo_box_text_new();
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(ctx->format_combo), "PNG");
    gtk_combo_box_text_append_text(GTK_COMBO_BOX_TEXT(ctx->format_combo), "JPEG");
    gtk_combo_box_set_active(GTK_COMBO_BOX(ctx->format_combo), 0);
    
    gtk_grid_attach(GTK_GRID(settings_grid), format_label, 0, 1, 1, 1);
    gtk_grid_attach(GTK_GRID(settings_grid), ctx->format_combo, 1, 1, 1, 1);
    
    // Save button
    ctx->save_btn = gtk_button_new_with_label("💾 다른 이름으로 저장");
    gtk_widget_set_sensitive(ctx->save_btn, FALSE);  // Initially disabled
    gtk_box_pack_start(GTK_BOX(left_vbox), ctx->save_btn, FALSE, FALSE, 10);
    
    // Status bar
    GtkWidget *separator2 = gtk_separator_new(GTK_ORIENTATION_HORIZONTAL);
    gtk_box_pack_start(GTK_BOX(left_vbox), separator2, FALSE, FALSE, 5);
    
    ctx->status_label = gtk_label_new("준비됨");
    gtk_widget_set_halign(ctx->status_label, GTK_ALIGN_START);
    gtk_box_pack_start(GTK_BOX(left_vbox), ctx->status_label, FALSE, FALSE, 5);
    
    // About button at bottom
    GtkWidget *about_btn = gtk_button_new_with_label("정보");
    gtk_box_pack_end(GTK_BOX(left_vbox), about_btn, FALSE, FALSE, 0);
    
    // Bottom panel - Preview
    GtkWidget *right_vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 5);
    gtk_paned_pack2(GTK_PANED(paned), right_vbox, TRUE, TRUE);
    
    // Preview frame
    ctx->preview_frame = gtk_frame_new("미리보기");
    gtk_box_pack_start(GTK_BOX(right_vbox), ctx->preview_frame, TRUE, TRUE, 0);
    
    // Scrolled window for preview
    ctx->preview_scrolled = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(ctx->preview_scrolled),
                                   GTK_POLICY_AUTOMATIC,
                                   GTK_POLICY_AUTOMATIC);
    gtk_container_add(GTK_CONTAINER(ctx->preview_frame), ctx->preview_scrolled);
    
    // Preview image
    ctx->preview_image = gtk_image_new();
    gtk_widget_set_halign(ctx->preview_image, GTK_ALIGN_CENTER);
    gtk_widget_set_valign(ctx->preview_image, GTK_ALIGN_CENTER);
    gtk_widget_set_hexpand(ctx->preview_image, TRUE);
    gtk_widget_set_vexpand(ctx->preview_image, TRUE);
    gtk_container_add(GTK_CONTAINER(ctx->preview_scrolled), ctx->preview_image);
    
    // Set paned position (top panel height)
    gtk_paned_set_position(GTK_PANED(paned), 260);
    
    // Connect signals
    CallbackData *fullscreen_data = utils_malloc(sizeof(CallbackData));
    fullscreen_data->ui_ctx = ctx;
    fullscreen_data->mode = CAPTURE_MODE_FULLSCREEN;
    
    CallbackData *area_data = utils_malloc(sizeof(CallbackData));
    area_data->ui_ctx = ctx;
    area_data->mode = CAPTURE_MODE_AREA;
    
    CallbackData *window_data = utils_malloc(sizeof(CallbackData));
    window_data->ui_ctx = ctx;
    window_data->mode = CAPTURE_MODE_WINDOW;
    
    g_signal_connect(ctx->capture_full_btn, "clicked", 
                     G_CALLBACK(on_capture_fullscreen_clicked), fullscreen_data);
    g_signal_connect(ctx->capture_area_btn, "clicked", 
                     G_CALLBACK(on_capture_area_clicked), area_data);
    g_signal_connect(ctx->capture_window_btn, "clicked", 
                     G_CALLBACK(on_capture_window_clicked), window_data);
    g_signal_connect(ctx->save_btn, "clicked", 
                     G_CALLBACK(on_save_clicked), ctx);
    g_signal_connect(about_btn, "clicked", 
                     G_CALLBACK(on_about_clicked), ctx);
    g_signal_connect(ctx->window, "destroy", 
                     G_CALLBACK(on_window_destroy), NULL);
    
    return ctx;
}

// Cleanup UI context
void ui_cleanup(UIContext *ctx) {
    if (ctx) {
        if (ctx->current_pixbuf) {
            g_object_unref(ctx->current_pixbuf);
        }
        if (ctx->current_image) {
            image_free(ctx->current_image);
        }
        utils_free(ctx);
    }
}

// Show main window
void ui_show(UIContext *ctx) {
    if (ctx && ctx->window) {
        gtk_widget_show_all(ctx->window);
    }
}

// Run main loop
void ui_run(UIContext *ctx) {
    if (ctx) {
        gtk_main();
    }
}

// Update status message
void ui_update_status(UIContext *ctx, const char *message) {
    if (ctx && ctx->status_label && message) {
        gtk_label_set_text(GTK_LABEL(ctx->status_label), message);
    }
}

// Show error dialog
void ui_show_error(UIContext *ctx, const char *error_message) {
    GtkWidget *dialog = gtk_message_dialog_new(
        GTK_WINDOW(ctx->window),
        GTK_DIALOG_MODAL,
        GTK_MESSAGE_ERROR,
        GTK_BUTTONS_OK,
        "%s", error_message
    );
    gtk_dialog_run(GTK_DIALOG(dialog));
    gtk_widget_destroy(dialog);
}

// Show success dialog
void ui_show_success(UIContext *ctx, const char *success_message) {
    GtkWidget *dialog = gtk_message_dialog_new(
        GTK_WINDOW(ctx->window),
        GTK_DIALOG_MODAL,
        GTK_MESSAGE_INFO,
        GTK_BUTTONS_OK,
        "%s", success_message
    );
    gtk_dialog_run(GTK_DIALOG(dialog));
    gtk_widget_destroy(dialog);
}

// Show confirmation dialog
gboolean ui_show_confirm_dialog(UIContext *ctx, const char *message) {
    GtkWidget *dialog = gtk_message_dialog_new(
        GTK_WINDOW(ctx->window),
        GTK_DIALOG_MODAL,
        GTK_MESSAGE_QUESTION,
        GTK_BUTTONS_YES_NO,
        "%s", message
    );
    
    gint result = gtk_dialog_run(GTK_DIALOG(dialog));
    gtk_widget_destroy(dialog);
    
    return (result == GTK_RESPONSE_YES);
}

// Get delay seconds
int ui_get_delay_seconds(UIContext *ctx) {
    if (!ctx || !ctx->delay_combo) {
        return 0;
    }
    
    int active = gtk_combo_box_get_active(GTK_COMBO_BOX(ctx->delay_combo));
    switch (active) {
        case 1: return 3;
        case 2: return 5;
        case 3: return 10;
        default: return 0;
    }
}

// Get format
const char* ui_get_format(UIContext *ctx) {
    if (!ctx || !ctx->format_combo) {
        return "png";
    }
    
    int active = gtk_combo_box_get_active(GTK_COMBO_BOX(ctx->format_combo));
    return (active == 1) ? "jpg" : "png";
}

// Display captured image in preview
static void display_captured_image(UIContext *ctx, ImageData *img) {
    if (!ctx || !img || !img->data) {
        utils_log_error("display_captured_image: Invalid parameters");
        return;
    }
    
    utils_log_info("Displaying captured image: %dx%d, %d channels, %zu bytes",
                   img->width, img->height, img->channels, img->size);
    
    // Free previous image
    if (ctx->current_pixbuf) {
        g_object_unref(ctx->current_pixbuf);
        ctx->current_pixbuf = NULL;
    }
    if (ctx->current_image) {
        image_free(ctx->current_image);
        ctx->current_image = NULL;
    }
    
    // Store the image
    ctx->current_image = img;
    
    // Create a copy of the image data for GdkPixbuf
    // This is safer than sharing the data pointer
    guchar *pixbuf_data = (guchar*)g_malloc(img->size);
    if (!pixbuf_data) {
        utils_log_error("Failed to allocate memory for pixbuf data");
        return;
    }
    memcpy(pixbuf_data, img->data, img->size);
    
    // Create pixbuf from copied image data
    ctx->current_pixbuf = gdk_pixbuf_new_from_data(
        pixbuf_data,
        GDK_COLORSPACE_RGB,
        img->channels == 4,  // has_alpha
        8,                   // bits_per_sample
        img->width,
        img->height,
        img->width * img->channels,  // rowstride
        pixbuf_data_free,  // destroy_fn - free the copied data
        NULL               // destroy_fn_data
    );
    
    if (!ctx->current_pixbuf) {
        utils_log_error("Failed to create pixbuf from image data");
        g_free(pixbuf_data);
        return;
    }
    
    utils_log_info("Pixbuf created successfully");
    
    // Scale down for preview if too large (max 800x600)
    int max_width = 800;
    int max_height = 600;
    int preview_width = img->width;
    int preview_height = img->height;
    
    if (preview_width > max_width || preview_height > max_height) {
        double scale = 1.0;
        double scale_w = (double)max_width / preview_width;
        double scale_h = (double)max_height / preview_height;
        scale = (scale_w < scale_h) ? scale_w : scale_h;
        
        preview_width = (int)(preview_width * scale);
        preview_height = (int)(preview_height * scale);
        
        utils_log_info("Scaling preview to %dx%d (scale: %.2f)", 
                       preview_width, preview_height, scale);
        
        GdkPixbuf *scaled = gdk_pixbuf_scale_simple(ctx->current_pixbuf,
                                                    preview_width,
                                                    preview_height,
                                                    GDK_INTERP_BILINEAR);
        if (scaled) {
            gtk_image_set_from_pixbuf(GTK_IMAGE(ctx->preview_image), scaled);
            g_object_unref(scaled);
            utils_log_info("Scaled preview image set successfully");
        } else {
            utils_log_error("Failed to scale pixbuf");
        }
    } else {
        gtk_image_set_from_pixbuf(GTK_IMAGE(ctx->preview_image), ctx->current_pixbuf);
        utils_log_info("Full-size preview image set successfully");
    }
    
    // Make sure the preview widgets are visible
    gtk_widget_show_all(ctx->preview_scrolled);
    
    // Enable save button
    gtk_widget_set_sensitive(ctx->save_btn, TRUE);
    
    utils_log_info("Display captured image completed");
}

// Callback: Capture fullscreen
static void on_capture_fullscreen_clicked(GtkWidget *widget, gpointer data) {
    (void)widget;
    CallbackData *cb_data = (CallbackData*)data;
    UIContext *ctx = cb_data->ui_ctx;
    
    ui_update_status(ctx, "전체 화면 캡처 중...");
    
    int delay = ui_get_delay_seconds(ctx);
    if (delay > 0) {
        char msg[64];
        snprintf(msg, sizeof(msg), "%d초 후 캡처합니다...", delay);
        ui_update_status(ctx, msg);
        
        // Process events during delay
        for (int i = delay; i > 0; i--) {
            snprintf(msg, sizeof(msg), "%d초 후 캡처합니다...", i);
            ui_update_status(ctx, msg);
            utils_sleep_ms(1000);
            while (gtk_events_pending()) {
                gtk_main_iteration();
            }
        }
    }
    
    hide_main_window_for_capture(ctx);

    ImageData *img = capture_fullscreen();

    restore_main_window_after_capture(ctx);
    if (!img) {
        ui_show_error(ctx, capture_get_last_error());
        ui_update_status(ctx, "캡처 실패");
        return;
    }
    
    // Display in preview
    display_captured_image(ctx, img);
    
    char msg[128];
    snprintf(msg, sizeof(msg), "캡처 완료: %dx%d", img->width, img->height);
    ui_update_status(ctx, msg);
}

// Callback: Capture area
static void on_capture_area_clicked(GtkWidget *widget, gpointer data) {
    (void)widget;
    CallbackData *cb_data = (CallbackData*)data;
    UIContext *ctx = cb_data->ui_ctx;
    
    ui_update_status(ctx, "영역 캡처 준비 중...");

    int delay = ui_get_delay_seconds(ctx);
    if (delay > 0) {
        char msg[64];
        for (int i = delay; i > 0; i--) {
            snprintf(msg, sizeof(msg), "%d초 후 영역 선택...", i);
            ui_update_status(ctx, msg);
            utils_sleep_ms(1000);
            while (gtk_events_pending()) gtk_main_iteration();
        }
    }

    hide_main_window_for_capture(ctx);

    CaptureArea area;
    ui_update_status(ctx, "마우스로 영역을 드래그하세요 (ESC 취소)");
    gboolean selected = select_area_interactively(ctx, &area);

    if (!selected) {
        restore_main_window_after_capture(ctx);
        ui_update_status(ctx, "영역 선택이 취소되었습니다");
        return;
    }

    ImageData *img = capture_area(&area);
    if (!img) {
        restore_main_window_after_capture(ctx);
        ui_show_error(ctx, capture_get_last_error());
        ui_update_status(ctx, "캡처 실패");
        return;
    }

    restore_main_window_after_capture(ctx);
    
    display_captured_image(ctx, img);
    
    char msg[128];
    snprintf(msg, sizeof(msg), "영역 캡처 완료: %dx%d", img->width, img->height);
    ui_update_status(ctx, msg);
}

// Callback: Capture window
static void on_capture_window_clicked(GtkWidget *widget, gpointer data) {
    (void)widget;
    CallbackData *cb_data = (CallbackData*)data;
    UIContext *ctx = cb_data->ui_ctx;
    
    ui_update_status(ctx, "창 캡처 중...");
    
    int delay = ui_get_delay_seconds(ctx);
    if (delay > 0) {
        utils_sleep_ms(delay * 1000);
    }
    
    hide_main_window_for_capture(ctx);

    ui_update_status(ctx, "캡처할 창을 선택하세요...");
    ImageData *img = capture_window();
    if (!img) {
        restore_main_window_after_capture(ctx);
        ui_show_error(ctx, capture_get_last_error());
        ui_update_status(ctx, "캡처 실패");
        return;
    }

    restore_main_window_after_capture(ctx);
    
    display_captured_image(ctx, img);
    
    char msg[128];
    snprintf(msg, sizeof(msg), "창 캡처 완료: %dx%d", img->width, img->height);
    ui_update_status(ctx, msg);
}

// Callback: Save
static void on_save_clicked(GtkWidget *widget, gpointer data) {
    (void)widget;
    UIContext *ctx = (UIContext*)data;
    
    if (!ctx->current_image) {
        ui_show_error(ctx, "저장할 이미지가 없습니다");
        return;
    }
    
    // Generate default filename
    char *default_filename = utils_generate_filename("screenshot", ui_get_format(ctx));
    
    // Show save dialog
    GtkWidget *dialog = gtk_file_chooser_dialog_new(
        "다른 이름으로 저장",
        GTK_WINDOW(ctx->window),
        GTK_FILE_CHOOSER_ACTION_SAVE,
        "_취소", GTK_RESPONSE_CANCEL,
        "_저장", GTK_RESPONSE_ACCEPT,
        NULL
    );
    
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dialog), TRUE);
    gtk_file_chooser_set_current_name(GTK_FILE_CHOOSER(dialog), default_filename);
    
    // Add file filters
    GtkFileFilter *filter_png = gtk_file_filter_new();
    gtk_file_filter_set_name(filter_png, "PNG 이미지 (*.png)");
    gtk_file_filter_add_pattern(filter_png, "*.png");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), filter_png);
    
    GtkFileFilter *filter_jpg = gtk_file_filter_new();
    gtk_file_filter_set_name(filter_jpg, "JPEG 이미지 (*.jpg, *.jpeg)");
    gtk_file_filter_add_pattern(filter_jpg, "*.jpg");
    gtk_file_filter_add_pattern(filter_jpg, "*.jpeg");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), filter_jpg);
    
    GtkFileFilter *filter_all = gtk_file_filter_new();
    gtk_file_filter_set_name(filter_all, "모든 파일 (*.*)");
    gtk_file_filter_add_pattern(filter_all, "*");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), filter_all);
    
    gint result = gtk_dialog_run(GTK_DIALOG(dialog));
    
    if (result == GTK_RESPONSE_ACCEPT) {
        char *filepath = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
        
        // Determine format from extension
        const char *ext = utils_get_extension(filepath);
        ImageFormat format = IMAGE_FORMAT_PNG;
        if (ext && (strcmp(ext, "jpg") == 0 || strcmp(ext, "jpeg") == 0)) {
            format = IMAGE_FORMAT_JPEG;
        }
        
        if (image_save(ctx->current_image, filepath, format)) {
            char msg[512];
            snprintf(msg, sizeof(msg), "저장 완료: %s", filepath);
            ui_show_success(ctx, msg);
            ui_update_status(ctx, "저장 완료");
        } else {
            ui_show_error(ctx, "저장 실패");
            ui_update_status(ctx, "저장 실패");
        }
        
        g_free(filepath);
    }
    
    gtk_widget_destroy(dialog);
    free(default_filename);
}

// Callback: About dialog
static void on_about_clicked(GtkWidget *widget, gpointer data) {
    (void)widget;
    UIContext *ctx = (UIContext*)data;
    
    GtkWidget *dialog = gtk_about_dialog_new();
    gtk_about_dialog_set_program_name(GTK_ABOUT_DIALOG(dialog), "CaptureMaster");
    gtk_about_dialog_set_version(GTK_ABOUT_DIALOG(dialog), "1.0.0");
    gtk_about_dialog_set_comments(GTK_ABOUT_DIALOG(dialog), 
                                  "크로스 플랫폼 스크린 캡처 도구\nLinux 및 macOS 지원");
    gtk_about_dialog_set_website(GTK_ABOUT_DIALOG(dialog), 
                                 "https://blog.naver.com/knix009");
    
    gtk_window_set_transient_for(GTK_WINDOW(dialog), GTK_WINDOW(ctx->window));
    gtk_dialog_run(GTK_DIALOG(dialog));
    gtk_widget_destroy(dialog);
}

// Callback: Window destroy
static void on_window_destroy(GtkWidget *widget, gpointer data) {
    (void)widget;
    (void)data;
    gtk_main_quit();
}
