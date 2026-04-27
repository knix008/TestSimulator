/*
 * Enhanced Screenshot - gnome-screenshot with auto-save and editing
 * Based on GNOME Screenshot
 */

#include <gtk/gtk.h>
#include <gdk/gdkx.h>
#include <cairo.h>
#include <stdlib.h>
#include <time.h>
#include "screenshot.h"
#include "autosave.h"
#include "editor.h"
#include "utils.h"

typedef struct {
    GtkWidget *window;
    GtkWidget *image_display;
    GdkPixbuf *pixbuf;
    gboolean auto_save_enabled;
    char *save_directory;
} AppData;

static void on_activate(GtkApplication *app, gpointer user_data);
static void on_take_screenshot_clicked(GtkWidget *button, gpointer user_data);
static void on_edit_clicked(GtkWidget *button, gpointer user_data);
static void on_save_clicked(GtkWidget *button, gpointer user_data);
static void on_auto_save_toggled(GtkToggleButton *button, gpointer user_data);

int main(int argc, char *argv[]) {
    GtkApplication *app;
    int status;

    app = gtk_application_new("org.custom.enhanced-screenshot", G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(app, "activate", G_CALLBACK(on_activate), NULL);
    status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);

    return status;
}

static void on_activate(GtkApplication *app, gpointer user_data) {
    (void)user_data;
    GtkWidget *window;
    GtkWidget *vbox;
    GtkWidget *hbox_buttons;
    GtkWidget *btn_screenshot;
    GtkWidget *btn_edit;
    GtkWidget *btn_save;
    GtkWidget *scrolled_window;
    GtkWidget *image_display;
    GtkWidget *check_auto_save;
    
    AppData *app_data = g_new0(AppData, 1);

    // Create main window
    window = gtk_application_window_new(app);
    gtk_window_set_title(GTK_WINDOW(window), "Enhanced Screenshot");
    gtk_window_set_default_size(GTK_WINDOW(window), 800, 600);
    app_data->window = window;

    // Create main vertical box
    vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 5);
    gtk_container_add(GTK_CONTAINER(window), vbox);

    // Create button box
    hbox_buttons = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 5);
    gtk_box_pack_start(GTK_BOX(vbox), hbox_buttons, FALSE, FALSE, 5);

    // Create buttons
    btn_screenshot = gtk_button_new_with_label("스크린샷 캡처");
    btn_edit = gtk_button_new_with_label("편집");
    btn_save = gtk_button_new_with_label("저장");
    check_auto_save = gtk_check_button_new_with_label("자동 저장");
    
    gtk_box_pack_start(GTK_BOX(hbox_buttons), btn_screenshot, FALSE, FALSE, 5);
    gtk_box_pack_start(GTK_BOX(hbox_buttons), btn_edit, FALSE, FALSE, 5);
    gtk_box_pack_start(GTK_BOX(hbox_buttons), btn_save, FALSE, FALSE, 5);
    gtk_box_pack_start(GTK_BOX(hbox_buttons), check_auto_save, FALSE, FALSE, 5);

    // Create scrolled window for image
    scrolled_window = gtk_scrolled_window_new(NULL, NULL);
    gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scrolled_window),
                                    GTK_POLICY_AUTOMATIC,
                                    GTK_POLICY_AUTOMATIC);
    gtk_box_pack_start(GTK_BOX(vbox), scrolled_window, TRUE, TRUE, 0);

    // Create image display
    image_display = gtk_image_new();
    gtk_container_add(GTK_CONTAINER(scrolled_window), image_display);
    app_data->image_display = image_display;

    // Initialize app data
    app_data->pixbuf = NULL;
    app_data->auto_save_enabled = FALSE;
    app_data->save_directory = get_default_save_directory();

    // Connect signals
    g_signal_connect(btn_screenshot, "clicked", G_CALLBACK(on_take_screenshot_clicked), app_data);
    g_signal_connect(btn_edit, "clicked", G_CALLBACK(on_edit_clicked), app_data);
    g_signal_connect(btn_save, "clicked", G_CALLBACK(on_save_clicked), app_data);
    g_signal_connect(check_auto_save, "toggled", G_CALLBACK(on_auto_save_toggled), app_data);

    gtk_widget_show_all(window);
}

static void on_auto_save_toggled(GtkToggleButton *button, gpointer user_data) {
    AppData *app_data = (AppData*)user_data;
    app_data->auto_save_enabled = gtk_toggle_button_get_active(button);
}

static void on_take_screenshot_clicked(GtkWidget *button, gpointer user_data) {
    (void)button;
    AppData *app_data = (AppData*)user_data;
    
    // Hide window before taking screenshot
    gtk_widget_hide(app_data->window);
    
    // Wait a bit for window to hide
    g_usleep(200000); // 200ms
    
    // Take screenshot
    if (app_data->pixbuf != NULL) {
        g_object_unref(app_data->pixbuf);
    }
    
    app_data->pixbuf = capture_screenshot(SCREENSHOT_FULL_SCREEN);
    
    if (app_data->pixbuf != NULL) {
        gtk_image_set_from_pixbuf(GTK_IMAGE(app_data->image_display), app_data->pixbuf);
        
        // Auto-save if enabled
        if (app_data->auto_save_enabled) {
            char *filename = generate_auto_save_filename(app_data->save_directory);
            if (save_screenshot(app_data->pixbuf, filename)) {
                g_print("자동 저장 완료: %s\n", filename);
            }
            g_free(filename);
        }
    }
    
    // Show window again
    gtk_widget_show(app_data->window);
}

static void on_edit_clicked(GtkWidget *button, gpointer user_data) {
    (void)button;
    AppData *app_data = (AppData*)user_data;
    
    if (app_data->pixbuf == NULL) {
        GtkWidget *dialog = gtk_message_dialog_new(GTK_WINDOW(app_data->window),
                                                    GTK_DIALOG_DESTROY_WITH_PARENT,
                                                    GTK_MESSAGE_WARNING,
                                                    GTK_BUTTONS_OK,
                                                    "먼저 스크린샷을 캡처하세요.");
        gtk_dialog_run(GTK_DIALOG(dialog));
        gtk_widget_destroy(dialog);
        return;
    }
    
    // Open editor window
    open_editor_window(app_data->pixbuf, GTK_WINDOW(app_data->window));
}

static void on_save_clicked(GtkWidget *button, gpointer user_data) {
    (void)button;
    AppData *app_data = (AppData*)user_data;
    
    if (app_data->pixbuf == NULL) {
        GtkWidget *dialog = gtk_message_dialog_new(GTK_WINDOW(app_data->window),
                                                    GTK_DIALOG_DESTROY_WITH_PARENT,
                                                    GTK_MESSAGE_WARNING,
                                                    GTK_BUTTONS_OK,
                                                    "저장할 스크린샷이 없습니다.");
        gtk_dialog_run(GTK_DIALOG(dialog));
        gtk_widget_destroy(dialog);
        return;
    }
    
    // Open save dialog
    GtkWidget *dialog = gtk_file_chooser_dialog_new("스크린샷 저장",
                                                     GTK_WINDOW(app_data->window),
                                                     GTK_FILE_CHOOSER_ACTION_SAVE,
                                                     "_취소", GTK_RESPONSE_CANCEL,
                                                     "_저장", GTK_RESPONSE_ACCEPT,
                                                     NULL);
    
    gtk_file_chooser_set_do_overwrite_confirmation(GTK_FILE_CHOOSER(dialog), TRUE);
    
    char *default_filename = generate_auto_save_filename(app_data->save_directory);
    gtk_file_chooser_set_filename(GTK_FILE_CHOOSER(dialog), default_filename);
    g_free(default_filename);
    
    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_ACCEPT) {
        char *filename = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(dialog));
        if (save_screenshot(app_data->pixbuf, filename)) {
            g_print("저장 완료: %s\n", filename);
        }
        g_free(filename);
    }
    
    gtk_widget_destroy(dialog);
}
