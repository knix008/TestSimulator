/*
 * Image editor functionality
 * Simple editing tools for screenshots
 */

#include "editor.h"
#include <cairo.h>
#include <math.h>

typedef struct {
    GtkWidget *window;
    GtkWidget *drawing_area;
    GdkPixbuf *pixbuf;
    cairo_surface_t *surface;
    EditorState state;
    
    // For drawing
    gboolean is_drawing;
    double start_x, start_y;
    double end_x, end_y;
} EditorData;

static gboolean on_draw(GtkWidget *widget, cairo_t *cr, gpointer user_data);
static gboolean on_button_press(GtkWidget *widget, GdkEventButton *event, gpointer user_data);
static gboolean on_button_release(GtkWidget *widget, GdkEventButton *event, gpointer user_data);
static gboolean on_motion_notify(GtkWidget *widget, GdkEventMotion *event, gpointer user_data);
static void on_tool_changed(GtkWidget *button, gpointer user_data);
static void on_color_set(GtkColorButton *button, gpointer user_data);
static void on_save_edited(GtkWidget *button, gpointer user_data);

void open_editor_window(GdkPixbuf *pixbuf, GtkWindow *parent) {
    EditorData *ed_data = g_new0(EditorData, 1);
    
    // Create editor window
    GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(window), "스크린샷 편집");
    gtk_window_set_default_size(GTK_WINDOW(window), 800, 600);
    gtk_window_set_transient_for(GTK_WINDOW(window), parent);
    ed_data->window = window;
    
    // Create main vbox
    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 5);
    gtk_container_add(GTK_CONTAINER(window), vbox);
    
    // Create toolbar
    GtkWidget *toolbar = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 5);
    gtk_box_pack_start(GTK_BOX(vbox), toolbar, FALSE, FALSE, 5);
    
    // Tool buttons
    GtkWidget *btn_rectangle = gtk_radio_button_new_with_label(NULL, "사각형");
    GtkWidget *btn_arrow = gtk_radio_button_new_with_label_from_widget(
        GTK_RADIO_BUTTON(btn_rectangle), "화살표");
    GtkWidget *btn_text = gtk_radio_button_new_with_label_from_widget(
        GTK_RADIO_BUTTON(btn_rectangle), "텍스트");
    
    gtk_box_pack_start(GTK_BOX(toolbar), btn_rectangle, FALSE, FALSE, 5);
    gtk_box_pack_start(GTK_BOX(toolbar), btn_arrow, FALSE, FALSE, 5);
    gtk_box_pack_start(GTK_BOX(toolbar), btn_text, FALSE, FALSE, 5);
    
    // Color chooser
    GtkWidget *color_button = gtk_color_button_new();
    GdkRGBA red = {1.0, 0.0, 0.0, 1.0};
    gtk_color_chooser_set_rgba(GTK_COLOR_CHOOSER(color_button), &red);
    gtk_box_pack_start(GTK_BOX(toolbar), color_button, FALSE, FALSE, 5);
    
    // Save button
    GtkWidget *btn_save = gtk_button_new_with_label("저장");
    gtk_box_pack_end(GTK_BOX(toolbar), btn_save, FALSE, FALSE, 5);
    
    // Create drawing area
    GtkWidget *drawing_area = gtk_drawing_area_new();
    gtk_widget_set_size_request(drawing_area, 
                                 gdk_pixbuf_get_width(pixbuf),
                                 gdk_pixbuf_get_height(pixbuf));
    gtk_widget_add_events(drawing_area, 
                          GDK_BUTTON_PRESS_MASK | 
                          GDK_BUTTON_RELEASE_MASK |
                          GDK_POINTER_MOTION_MASK);
    
    GtkWidget *scrolled = gtk_scrolled_window_new(NULL, NULL);
    gtk_container_add(GTK_CONTAINER(scrolled), drawing_area);
    gtk_box_pack_start(GTK_BOX(vbox), scrolled, TRUE, TRUE, 0);
    
    ed_data->drawing_area = drawing_area;
    ed_data->pixbuf = gdk_pixbuf_copy(pixbuf);
    
    // Create cairo surface from pixbuf
    int width = gdk_pixbuf_get_width(pixbuf);
    int height = gdk_pixbuf_get_height(pixbuf);
    ed_data->surface = cairo_image_surface_create(CAIRO_FORMAT_ARGB32, width, height);
    
    cairo_t *cr = cairo_create(ed_data->surface);
    gdk_cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
    cairo_paint(cr);
    cairo_destroy(cr);
    
    // Initialize state
    ed_data->state.current_tool = TOOL_RECTANGLE;
    ed_data->state.draw_color = red;
    ed_data->state.line_width = 3;
    ed_data->is_drawing = FALSE;
    
    // Connect signals
    g_signal_connect(drawing_area, "draw", G_CALLBACK(on_draw), ed_data);
    g_signal_connect(drawing_area, "button-press-event", G_CALLBACK(on_button_press), ed_data);
    g_signal_connect(drawing_area, "button-release-event", G_CALLBACK(on_button_release), ed_data);
    g_signal_connect(drawing_area, "motion-notify-event", G_CALLBACK(on_motion_notify), ed_data);
    
    g_signal_connect(btn_rectangle, "toggled", G_CALLBACK(on_tool_changed), ed_data);
    g_signal_connect(btn_arrow, "toggled", G_CALLBACK(on_tool_changed), ed_data);
    g_signal_connect(btn_text, "toggled", G_CALLBACK(on_tool_changed), ed_data);
    g_signal_connect(color_button, "color-set", G_CALLBACK(on_color_set), ed_data);
    g_signal_connect(btn_save, "clicked", G_CALLBACK(on_save_edited), ed_data);
    
    // Store tool type in button data
    g_object_set_data(G_OBJECT(btn_rectangle), "tool", GINT_TO_POINTER(TOOL_RECTANGLE));
    g_object_set_data(G_OBJECT(btn_arrow), "tool", GINT_TO_POINTER(TOOL_ARROW));
    g_object_set_data(G_OBJECT(btn_text), "tool", GINT_TO_POINTER(TOOL_TEXT));
    
    gtk_widget_show_all(window);
}

static gboolean on_draw(GtkWidget *widget, cairo_t *cr, gpointer user_data) {
    (void)widget;
    EditorData *ed_data = (EditorData*)user_data;
    
    // Draw the image
    cairo_set_source_surface(cr, ed_data->surface, 0, 0);
    cairo_paint(cr);
    
    // Draw temporary shape while drawing
    if (ed_data->is_drawing) {
        cairo_set_source_rgba(cr, 
                             ed_data->state.draw_color.red,
                             ed_data->state.draw_color.green,
                             ed_data->state.draw_color.blue,
                             ed_data->state.draw_color.alpha);
        cairo_set_line_width(cr, ed_data->state.line_width);
        
        if (ed_data->state.current_tool == TOOL_RECTANGLE) {
            double x = MIN(ed_data->start_x, ed_data->end_x);
            double y = MIN(ed_data->start_y, ed_data->end_y);
            double w = fabs(ed_data->end_x - ed_data->start_x);
            double h = fabs(ed_data->end_y - ed_data->start_y);
            
            cairo_rectangle(cr, x, y, w, h);
            cairo_stroke(cr);
        } else if (ed_data->state.current_tool == TOOL_ARROW) {
            cairo_move_to(cr, ed_data->start_x, ed_data->start_y);
            cairo_line_to(cr, ed_data->end_x, ed_data->end_y);
            cairo_stroke(cr);
            
            // Draw arrowhead
            double angle = atan2(ed_data->end_y - ed_data->start_y, 
                                ed_data->end_x - ed_data->start_x);
            double arrow_size = 15.0;
            
            cairo_move_to(cr, ed_data->end_x, ed_data->end_y);
            cairo_line_to(cr, 
                         ed_data->end_x - arrow_size * cos(angle - G_PI / 6),
                         ed_data->end_y - arrow_size * sin(angle - G_PI / 6));
            cairo_move_to(cr, ed_data->end_x, ed_data->end_y);
            cairo_line_to(cr,
                         ed_data->end_x - arrow_size * cos(angle + G_PI / 6),
                         ed_data->end_y - arrow_size * sin(angle + G_PI / 6));
            cairo_stroke(cr);
        }
    }
    
    return FALSE;
}

static gboolean on_button_press(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
    (void)widget;
    EditorData *ed_data = (EditorData*)user_data;
    
    if (event->button == 1) { // Left click
        ed_data->is_drawing = TRUE;
        ed_data->start_x = event->x;
        ed_data->start_y = event->y;
        ed_data->end_x = event->x;
        ed_data->end_y = event->y;
    }
    
    return TRUE;
}

static gboolean on_button_release(GtkWidget *widget, GdkEventButton *event, gpointer user_data) {
    EditorData *ed_data = (EditorData*)user_data;
    
    if (event->button == 1 && ed_data->is_drawing) {
        ed_data->is_drawing = FALSE;
        
        // Draw permanently on the surface
        cairo_t *cr = cairo_create(ed_data->surface);
        cairo_set_source_rgba(cr,
                             ed_data->state.draw_color.red,
                             ed_data->state.draw_color.green,
                             ed_data->state.draw_color.blue,
                             ed_data->state.draw_color.alpha);
        cairo_set_line_width(cr, ed_data->state.line_width);
        
        if (ed_data->state.current_tool == TOOL_RECTANGLE) {
            double x = MIN(ed_data->start_x, ed_data->end_x);
            double y = MIN(ed_data->start_y, ed_data->end_y);
            double w = fabs(ed_data->end_x - ed_data->start_x);
            double h = fabs(ed_data->end_y - ed_data->start_y);
            
            cairo_rectangle(cr, x, y, w, h);
            cairo_stroke(cr);
        } else if (ed_data->state.current_tool == TOOL_ARROW) {
            cairo_move_to(cr, ed_data->start_x, ed_data->start_y);
            cairo_line_to(cr, ed_data->end_x, ed_data->end_y);
            cairo_stroke(cr);
            
            double angle = atan2(ed_data->end_y - ed_data->start_y,
                                ed_data->end_x - ed_data->start_x);
            double arrow_size = 15.0;
            
            cairo_move_to(cr, ed_data->end_x, ed_data->end_y);
            cairo_line_to(cr,
                         ed_data->end_x - arrow_size * cos(angle - G_PI / 6),
                         ed_data->end_y - arrow_size * sin(angle - G_PI / 6));
            cairo_move_to(cr, ed_data->end_x, ed_data->end_y);
            cairo_line_to(cr,
                         ed_data->end_x - arrow_size * cos(angle + G_PI / 6),
                         ed_data->end_y - arrow_size * sin(angle + G_PI / 6));
            cairo_stroke(cr);
        }
        
        cairo_destroy(cr);
        gtk_widget_queue_draw(widget);
    }
    
    return TRUE;
}

static gboolean on_motion_notify(GtkWidget *widget, GdkEventMotion *event, gpointer user_data) {
    EditorData *ed_data = (EditorData*)user_data;
    
    if (ed_data->is_drawing) {
        ed_data->end_x = event->x;
        ed_data->end_y = event->y;
        gtk_widget_queue_draw(widget);
    }
    
    return TRUE;
}

static void on_tool_changed(GtkWidget *button, gpointer user_data) {
    EditorData *ed_data = (EditorData*)user_data;
    
    if (gtk_toggle_button_get_active(GTK_TOGGLE_BUTTON(button))) {
        EditorTool tool = GPOINTER_TO_INT(g_object_get_data(G_OBJECT(button), "tool"));
        ed_data->state.current_tool = tool;
    }
}

static void on_color_set(GtkColorButton *button, gpointer user_data) {
    EditorData *ed_data = (EditorData*)user_data;
    gtk_color_chooser_get_rgba(GTK_COLOR_CHOOSER(button), &ed_data->state.draw_color);
}

static void on_save_edited(GtkWidget *button, gpointer user_data) {
    (void)button;
    EditorData *ed_data = (EditorData*)user_data;
    
    // Convert surface to pixbuf
    int width = cairo_image_surface_get_width(ed_data->surface);
    int height = cairo_image_surface_get_height(ed_data->surface);
    unsigned char *data = cairo_image_surface_get_data(ed_data->surface);
    int stride = cairo_image_surface_get_stride(ed_data->surface);
    
    GdkPixbuf *edited_pixbuf = gdk_pixbuf_new(GDK_COLORSPACE_RGB, TRUE, 8, width, height);
    unsigned char *pixels = gdk_pixbuf_get_pixels(edited_pixbuf);
    int pixbuf_stride = gdk_pixbuf_get_rowstride(edited_pixbuf);
    
    // Convert ARGB to RGBA
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            unsigned char *src = data + y * stride + x * 4;
            unsigned char *dst = pixels + y * pixbuf_stride + x * 4;
            
            dst[0] = src[2]; // R
            dst[1] = src[1]; // G
            dst[2] = src[0]; // B
            dst[3] = src[3]; // A
        }
    }
    
    // Save file dialog
    GtkWidget *dialog = gtk_file_chooser_dialog_new("편집된 스크린샷 저장",
                                                     GTK_WINDOW(ed_data->window),
                                                     GTK_FILE_CHOOSER_ACTION_SAVE,
                                                     "_취소", GTK_RESPONSE_CANCEL,
                                                     "_저장", GTK_RESPONSE_ACCEPT,
                                                     NULL);
    
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dialog), TRUE);
    
    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        char *filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
        
        GError *error = NULL;
        if (!gdk_pixbuf_save(edited_pixbuf, filename, "png", &error, NULL)) {
            g_warning("Failed to save: %s", error->message);
            g_error_free(error);
        } else {
            g_print("편집된 스크린샷 저장 완료: %s\n", filename);
        }
        
        g_free(filename);
    }
    
    gtk_widget_destroy(dialog);
    g_object_unref(edited_pixbuf);
}
