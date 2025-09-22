#include <gtk/gtk.h>
#include <glib.h>
#include <gdk-pixbuf/gdk-pixbuf.h>
#include <stdio.h>
#include <string.h>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <string>

#include "opencv2/opencv.hpp"
#include "vaengine/vaengine.h"

// Global variables
GtkWidget *window;
GtkWidget *query_image_widget;
GtkWidget *query_path_entry;
GtkWidget *gallery_path_entry;
GtkWidget *result_text;
GtkWidget *progress_bar;
GtkWidget *recognize_button;
GtkWidget *status_label;

// Threading variables
std::mutex worker_mutex;
std::condition_variable worker_cv;
std::queue<std::string> worker_queue;
bool worker_running = false;
std::thread worker_thread;

// Worker thread function
void recognition_worker() {
    while (worker_running) {
        std::unique_lock<std::mutex> lock(worker_mutex);
        worker_cv.wait(lock, []{ return !worker_queue.empty() || !worker_running; });
        
        if (!worker_running) break;
        
        std::string query_path = worker_queue.front();
        worker_queue.pop();
        lock.unlock();
        
        try {
            // Initialize engine
            FaceRecognitionEngine engine;
            if (!engine.Initialize()) {
                g_idle_add([](gpointer data) -> gboolean {
                    (void)data;
                    gtk_label_set_text(GTK_LABEL(status_label), "Error: Failed to initialize engine");
                    gtk_widget_set_sensitive(recognize_button, TRUE);
                    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(progress_bar), 0.0);
                    return FALSE;
                }, NULL);
                continue;
            }
            
            // Update progress
            g_idle_add([](gpointer data) -> gboolean {
                (void)data;
                gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(progress_bar), 0.3);
                return FALSE;
            }, NULL);
            
            // Load query image
            cv::Mat queryImage = cv::imread(query_path);
            if (queryImage.empty()) {
                g_idle_add([](gpointer data) -> gboolean {
                    (void)data;
                    gtk_label_set_text(GTK_LABEL(status_label), "Error: Failed to load query image");
                    gtk_widget_set_sensitive(recognize_button, TRUE);
                    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(progress_bar), 0.0);
                    return FALSE;
                }, NULL);
                continue;
            }
            
            // Update progress
            g_idle_add([](gpointer data) -> gboolean {
                (void)data;
                gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(progress_bar), 0.6);
                return FALSE;
            }, NULL);
            
            // Perform recognition
            FaceRecognitionEngine::RecognitionResult result = 
                engine.Identify(queryImage.data, queryImage.cols, queryImage.rows);
            
            // Update progress
            g_idle_add([](gpointer data) -> gboolean {
                (void)data;
                gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(progress_bar), 1.0);
                return FALSE;
            }, NULL);
            
            // Format result
            char result_text[512];
            snprintf(result_text, sizeof(result_text),
                "Recognition Result:\n"
                "ID: %d\n"
                "Score: %.4f\n"
                "Result Code: %d\n"
                "Face Position: (%d, %d, %d, %d)",
                result.id, result.score, result.rcode,
                result.x, result.y, result.w, result.h);
            
            // Update UI in main thread
            g_idle_add([](gpointer data) -> gboolean {
                char *result_text = (char*)data;
                gtk_text_buffer_set_text(gtk_text_view_get_buffer(GTK_TEXT_VIEW(result_text)), 
                                      result_text, -1);
                gtk_label_set_text(GTK_LABEL(status_label), "Recognition completed");
                gtk_widget_set_sensitive(recognize_button, TRUE);
                gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(progress_bar), 0.0);
                g_free(result_text);
                return FALSE;
            }, g_strdup(result_text));
            
        } catch (const std::exception &e) {
            g_idle_add([](gpointer data) -> gboolean {
                char *error_msg = (char*)data;
                gtk_label_set_text(GTK_LABEL(status_label), error_msg);
                gtk_widget_set_sensitive(recognize_button, TRUE);
                gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(progress_bar), 0.0);
                g_free(error_msg);
                return FALSE;
            }, g_strdup_printf("Error: %s", e.what()));
        }
    }
}

// Callback functions
void on_select_query_image(GtkWidget *widget, gpointer data) {
    (void)widget; (void)data;
    GtkWidget *dialog = gtk_file_chooser_dialog_new("Select Query Image",
                                                    GTK_WINDOW(window),
                                                    GTK_FILE_CHOOSER_ACTION_OPEN,
                                                    "Cancel", GTK_RESPONSE_CANCEL,
                                                    "Open", GTK_RESPONSE_ACCEPT,
                                                    NULL);
    
    GtkFileFilter *filter = gtk_file_filter_new();
    gtk_file_filter_set_name(filter, "Image Files");
    gtk_file_filter_add_pattern(filter, "*.png");
    gtk_file_filter_add_pattern(filter, "*.jpg");
    gtk_file_filter_add_pattern(filter, "*.jpeg");
    gtk_file_filter_add_pattern(filter, "*.bmp");
    gtk_file_chooser_add_filter(GTK_FILE_CHOOSER(dialog), filter);
    
    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        char *filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
        gtk_entry_set_text(GTK_ENTRY(query_path_entry), filename);
        
        // Load and display image
        GdkPixbuf *pixbuf = gdk_pixbuf_new_from_file(filename, NULL);
        if (pixbuf) {
            GdkPixbuf *scaled = gdk_pixbuf_scale_simple(pixbuf, 300, 200, GDK_INTERP_BILINEAR);
            gtk_image_set_from_pixbuf(GTK_IMAGE(query_image_widget), scaled);
            g_object_unref(pixbuf);
            g_object_unref(scaled);
        }
        g_free(filename);
    }
    gtk_widget_destroy(dialog);
}

void on_select_gallery_directory(GtkWidget *widget, gpointer data) {
    (void)widget; (void)data;
    GtkWidget *dialog = gtk_file_chooser_dialog_new("Select Gallery Directory",
                                                    GTK_WINDOW(window),
                                                    GTK_FILE_CHOOSER_ACTION_SELECT_FOLDER,
                                                    "Cancel", GTK_RESPONSE_CANCEL,
                                                    "Select", GTK_RESPONSE_ACCEPT,
                                                    NULL);
    
    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        char *filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
        gtk_entry_set_text(GTK_ENTRY(gallery_path_entry), filename);
        g_free(filename);
    }
    gtk_widget_destroy(dialog);
}

void on_recognize(GtkWidget *widget, gpointer data) {
    (void)widget; (void)data;
    const char *query_path = gtk_entry_get_text(GTK_ENTRY(query_path_entry));
    const char *gallery_path = gtk_entry_get_text(GTK_ENTRY(gallery_path_entry));
    
    if (strlen(query_path) == 0) {
        gtk_label_set_text(GTK_LABEL(status_label), "Please select a query image");
        return;
    }
    
    if (strlen(gallery_path) == 0) {
        gtk_label_set_text(GTK_LABEL(status_label), "Please select a gallery directory");
        return;
    }
    
    // Disable button and start processing
    gtk_widget_set_sensitive(recognize_button, FALSE);
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(progress_bar), 0.1);
    gtk_label_set_text(GTK_LABEL(status_label), "Processing...");
    
    // Queue work for worker thread
    {
        std::lock_guard<std::mutex> lock(worker_mutex);
        worker_queue.push(std::string(query_path));
    }
    worker_cv.notify_one();
}

void on_destroy(GtkWidget *widget, gpointer data) {
    (void)widget; (void)data;
    // Stop worker thread
    worker_running = false;
    worker_cv.notify_all();
    if (worker_thread.joinable()) {
        worker_thread.join();
    }
    gtk_main_quit();
}

// Create the GUI
GtkWidget* create_main_window() {
    // Main window
    window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(window), "Face Recognition GUI");
    gtk_window_set_default_size(GTK_WINDOW(window), 800, 600);
    gtk_window_set_resizable(GTK_WINDOW(window), TRUE);
    g_signal_connect(window, "destroy", G_CALLBACK(on_destroy), NULL);
    
    // Main container
    GtkWidget *main_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 10);
    gtk_container_add(GTK_CONTAINER(window), main_box);
    
    // Left panel - Controls
    GtkWidget *left_panel = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_box_pack_start(GTK_BOX(main_box), left_panel, FALSE, FALSE, 0);
    gtk_widget_set_size_request(left_panel, 300, -1);
    
    // Control frame
    GtkWidget *control_frame = gtk_frame_new("Controls");
    gtk_box_pack_start(GTK_BOX(left_panel), control_frame, TRUE, TRUE, 0);
    
    GtkWidget *control_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_container_add(GTK_CONTAINER(control_frame), control_box);
    gtk_container_set_border_width(GTK_CONTAINER(control_box), 10);
    
    // Query image selection
    GtkWidget *query_label = gtk_label_new("Query Image:");
    gtk_box_pack_start(GTK_BOX(control_box), query_label, FALSE, FALSE, 0);
    
    GtkWidget *query_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 5);
    gtk_box_pack_start(GTK_BOX(control_box), query_box, FALSE, FALSE, 0);
    
    query_path_entry = gtk_entry_new();
    gtk_editable_set_editable(GTK_EDITABLE(query_path_entry), FALSE);
    gtk_box_pack_start(GTK_BOX(query_box), query_path_entry, TRUE, TRUE, 0);
    
    GtkWidget *query_button = gtk_button_new_with_label("Browse");
    gtk_box_pack_start(GTK_BOX(query_box), query_button, FALSE, FALSE, 0);
    g_signal_connect(query_button, "clicked", G_CALLBACK(on_select_query_image), NULL);
    
    // Gallery directory selection
    GtkWidget *gallery_label = gtk_label_new("Gallery Directory:");
    gtk_box_pack_start(GTK_BOX(control_box), gallery_label, FALSE, FALSE, 0);
    
    GtkWidget *gallery_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 5);
    gtk_box_pack_start(GTK_BOX(control_box), gallery_box, FALSE, FALSE, 0);
    
    gallery_path_entry = gtk_entry_new();
    gtk_editable_set_editable(GTK_EDITABLE(gallery_path_entry), FALSE);
    gtk_box_pack_start(GTK_BOX(gallery_box), gallery_path_entry, TRUE, TRUE, 0);
    
    GtkWidget *gallery_button = gtk_button_new_with_label("Browse");
    gtk_box_pack_start(GTK_BOX(gallery_box), gallery_button, FALSE, FALSE, 0);
    g_signal_connect(gallery_button, "clicked", G_CALLBACK(on_select_gallery_directory), NULL);
    
    // Recognize button
    recognize_button = gtk_button_new_with_label("Start Recognition");
    gtk_box_pack_start(GTK_BOX(control_box), recognize_button, FALSE, FALSE, 0);
    g_signal_connect(recognize_button, "clicked", G_CALLBACK(on_recognize), NULL);
    
    // Progress bar
    progress_bar = gtk_progress_bar_new();
    gtk_progress_bar_set_fraction(GTK_PROGRESS_BAR(progress_bar), 0.0);
    gtk_box_pack_start(GTK_BOX(control_box), progress_bar, FALSE, FALSE, 0);
    
    // Status label
    status_label = gtk_label_new("Ready");
    gtk_box_pack_start(GTK_BOX(control_box), status_label, FALSE, FALSE, 0);
    
    // Right panel - Results
    GtkWidget *right_panel = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    gtk_box_pack_start(GTK_BOX(main_box), right_panel, TRUE, TRUE, 0);
    
    // Image display
    GtkWidget *image_frame = gtk_frame_new("Query Image");
    gtk_box_pack_start(GTK_BOX(right_panel), image_frame, FALSE, FALSE, 0);
    gtk_widget_set_size_request(image_frame, 400, 200);
    
    query_image_widget = gtk_image_new();
    gtk_container_add(GTK_CONTAINER(image_frame), query_image_widget);
    
    // Result text
    GtkWidget *result_frame = gtk_frame_new("Recognition Result");
    gtk_box_pack_start(GTK_BOX(right_panel), result_frame, TRUE, TRUE, 0);
    
    GtkWidget *scrolled_window = gtk_scrolled_window_new(NULL, NULL);
    gtk_container_add(GTK_CONTAINER(result_frame), scrolled_window);
    
    result_text = gtk_text_view_new();
    gtk_text_view_set_editable(GTK_TEXT_VIEW(result_text), FALSE);
    gtk_container_add(GTK_CONTAINER(scrolled_window), result_text);
    
    return window;
}

int main(int argc, char *argv[]) {
    gtk_init(&argc, &argv);
    
    // Start worker thread
    worker_running = true;
    worker_thread = std::thread(recognition_worker);
    
    // Create and show window
    create_main_window();
    gtk_widget_show_all(window);
    
    gtk_main();
    
    return 0;
}
