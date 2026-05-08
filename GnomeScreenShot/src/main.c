/*
 * main.c - Enhanced Screenshot application
 * Based on GNOME Screenshot (gnome-screenshot 41)
 */

#include <gtk/gtk.h>
#include <gdk/gdkx.h>
#include <cairo.h>
#include <stdlib.h>
#include <time.h>
#include "screenshot.h"
#include "screenshot-area-selection.h"
#include "autosave.h"
#include "editor.h"
#include "utils.h"

typedef struct {
    GtkWidget      *window;
    GtkWidget      *image_display;
    GdkPixbuf      *pixbuf;
    gboolean        auto_save_enabled;
    char           *save_directory;
    ScreenshotMode  mode;
    gboolean        include_pointer;
    gboolean        include_border;
    /* Delay (seconds) before capture – matches gnome-screenshot option */
    gint            delay;
} AppData;

/* ---- forward declarations ----------------------------------------------- */
static void on_activate                 (GtkApplication *app, gpointer user_data);
static void on_take_screenshot_clicked  (GtkWidget *button, gpointer user_data);
static void on_edit_clicked             (GtkWidget *button, gpointer user_data);
static void on_save_clicked             (GtkWidget *button, gpointer user_data);
static void on_auto_save_toggled        (GtkToggleButton *button, gpointer user_data);
static void on_mode_changed             (GtkToggleButton *button, gpointer user_data);
static void on_include_pointer_toggled  (GtkToggleButton *button, gpointer user_data);
static void on_include_border_toggled   (GtkToggleButton *button, gpointer user_data);

/* ---- area-selection callback -------------------------------------------- */

typedef struct {
    AppData *app_data;
    gint     delay;
} AreaCaptureCtx;

static void
on_area_selected (GdkRectangle *rect, gpointer user_data)
{
    AreaCaptureCtx *ctx      = (AreaCaptureCtx *)user_data;
    AppData        *app_data = ctx->app_data;

    if (rect == NULL) {
        /* Cancelled – just restore the window */
        gtk_widget_show (app_data->window);
        gtk_window_present (GTK_WINDOW (app_data->window));
        g_free (ctx);
        return;
    }

    if (ctx->delay > 0)
        g_usleep ((gulong)ctx->delay * 1000000UL);

    if (app_data->pixbuf)
        g_object_unref (app_data->pixbuf);

    app_data->pixbuf = screenshot_get_pixbuf (SCREENSHOT_MODE_AREA,
                                               NULL, rect,
                                               app_data->include_pointer,
                                               FALSE);
    if (app_data->pixbuf) {
        g_print ("Area capture: Updating image display with %dx%d pixbuf\n",
                gdk_pixbuf_get_width (app_data->pixbuf),
                gdk_pixbuf_get_height (app_data->pixbuf));
        
        gtk_image_set_from_pixbuf (GTK_IMAGE (app_data->image_display),
                                   app_data->pixbuf);
        
        /* Force widget redraw */
        gtk_widget_queue_draw (app_data->image_display);
        
        if (app_data->auto_save_enabled) {
            char *filename = generate_auto_save_filename (app_data->save_directory);
            if (save_screenshot (app_data->pixbuf, filename))
                g_print ("자동 저장 완료: %s\n", filename);
            g_free (filename);
        }
    } else {
        g_warning ("Area capture failed - pixbuf is NULL");
    }

    gtk_widget_show (app_data->window);
    gtk_window_present (GTK_WINDOW (app_data->window));
    g_free (ctx);
}

/* ---- screenshot trigger ------------------------------------------------- */

static gboolean
do_capture (gpointer user_data)
{
    AppData *app_data = (AppData *)user_data;

    if (app_data->pixbuf)
        g_object_unref (app_data->pixbuf);

    /* Capture using X11 backend */
    app_data->pixbuf = screenshot_get_pixbuf (app_data->mode,
                                               NULL, NULL,
                                               app_data->include_pointer,
                                               app_data->include_border);

    if (app_data->pixbuf) {
        g_print ("Updating image display with %dx%d pixbuf\n",
                gdk_pixbuf_get_width (app_data->pixbuf),
                gdk_pixbuf_get_height (app_data->pixbuf));
        
        gtk_image_set_from_pixbuf (GTK_IMAGE (app_data->image_display),
                                   app_data->pixbuf);
        
        /* Force widget redraw */
        gtk_widget_queue_draw (app_data->image_display);
        
        if (app_data->auto_save_enabled) {
            char *filename = generate_auto_save_filename (app_data->save_directory);
            if (save_screenshot (app_data->pixbuf, filename))
                g_print ("자동 저장 완료: %s\n", filename);
            g_free (filename);
        }
    } else {
        g_warning ("Failed to capture screenshot - pixbuf is NULL");
    }

    /* Restore window visibility */
    gtk_widget_show (app_data->window);
    gtk_window_present (GTK_WINDOW (app_data->window));
    gtk_window_set_keep_above (GTK_WINDOW (app_data->window), TRUE);
    gtk_window_set_keep_above (GTK_WINDOW (app_data->window), FALSE);
    return G_SOURCE_REMOVE;
}

static void
on_take_screenshot_clicked (GtkWidget *button, gpointer user_data)
{
    (void)button;
    AppData *app_data = (AppData *)user_data;
    GdkDisplay *display = gdk_display_get_default ();
    
    /* Always hide window before capture (using X11 backend) */
    gtk_widget_hide (app_data->window);
    gdk_display_flush (display);
    gdk_display_sync  (display);
    g_usleep (200000); /* 200ms for window to be hidden */

    if (app_data->mode == SCREENSHOT_MODE_AREA) {
        /* Use our area selection UI */
        AreaCaptureCtx *ctx = g_new0 (AreaCaptureCtx, 1);
        ctx->app_data = app_data;
        ctx->delay    = app_data->delay;
        screenshot_select_area_async (on_area_selected, ctx);
        /* window is shown again inside the callback */
        return;
    }

    if (app_data->delay > 0) {
        g_timeout_add_seconds (app_data->delay, do_capture, app_data);
    } else {
        do_capture (app_data);
    }
}

/* ---- remaining signal handlers ------------------------------------------ */

static void
on_auto_save_toggled (GtkToggleButton *button, gpointer user_data)
{
    AppData *app_data = (AppData *)user_data;
    app_data->auto_save_enabled = gtk_toggle_button_get_active (button);
}

static void
on_mode_changed (GtkToggleButton *button, gpointer user_data)
{
    AppData *app_data = (AppData *)user_data;
    
    if (!gtk_toggle_button_get_active (button))
        return;
    
    /* Get the mode from button data */
    app_data->mode = GPOINTER_TO_INT (g_object_get_data (G_OBJECT (button), "mode"));
}

static void
on_include_pointer_toggled (GtkToggleButton *button, gpointer user_data)
{
    AppData *app_data = (AppData *)user_data;
    app_data->include_pointer = gtk_toggle_button_get_active (button);
}

static void
on_include_border_toggled (GtkToggleButton *button, gpointer user_data)
{
    AppData *app_data = (AppData *)user_data;
    app_data->include_border = gtk_toggle_button_get_active (button);
}

static void
on_edit_clicked (GtkWidget *button, gpointer user_data)
{
    (void)button;
    AppData *app_data = (AppData *)user_data;

    if (app_data->pixbuf == NULL) {
        show_info_dialog (GTK_WINDOW (app_data->window),
                          "먼저 스크린샷을 캡처하세요.");
        return;
    }
    open_editor_window (app_data->pixbuf, GTK_WINDOW (app_data->window));
}

static void
on_save_clicked (GtkWidget *button, gpointer user_data)
{
    (void)button;
    AppData *app_data = (AppData *)user_data;

    if (app_data->pixbuf == NULL) {
        show_info_dialog (GTK_WINDOW (app_data->window),
                          "저장할 스크린샷이 없습니다.");
        return;
    }

    GtkWidget *dialog =
        gtk_file_chooser_dialog_new ("스크린샷 저장",
                                     GTK_WINDOW (app_data->window),
                                     GTK_FILE_CHOOSER_ACTION_SAVE,
                                     "_취소", GTK_RESPONSE_CANCEL,
                                     "_저장", GTK_RESPONSE_ACCEPT,
                                     NULL);

    gtk_file_chooser_set_do_overwrite_confirmation (GTK_FILE_CHOOSER (dialog), TRUE);

    char *default_filename = generate_auto_save_filename (app_data->save_directory);
    gtk_file_chooser_set_filename (GTK_FILE_CHOOSER (dialog), default_filename);
    g_free (default_filename);

    if (gtk_dialog_run (GTK_DIALOG (dialog)) == GTK_RESPONSE_ACCEPT) {
        char *filename = gtk_file_chooser_get_filename (GTK_FILE_CHOOSER (dialog));
        if (save_screenshot (app_data->pixbuf, filename))
            g_print ("저장 완료: %s\n", filename);
        g_free (filename);
    }

    gtk_widget_destroy (dialog);
}

/* ---- UI construction ---------------------------------------------------- */

static void
on_activate (GtkApplication *app, gpointer user_data)
{
    (void)user_data;

    AppData   *app_data = g_new0 (AppData, 1);
    GtkWidget *window, *vbox, *hbox_top, *hbox_modes, *hbox_opts;
    GtkWidget *btn_screenshot, *btn_edit, *btn_save;
    GtkWidget *radio_fullscreen, *radio_window, *radio_area;
    GtkWidget *check_auto_save, *check_pointer, *check_border;
    GtkWidget *scrolled_window, *image_display;
    GtkWidget *mode_box;

    /* Defaults matching gnome-screenshot */
    app_data->mode            = SCREENSHOT_MODE_FULL_SCREEN;
    app_data->include_pointer = TRUE;
    app_data->include_border  = TRUE;
    app_data->delay           = 0;
    app_data->save_directory  = get_default_save_directory ();

    /* Main window */
    window = gtk_application_window_new (app);
    gtk_window_set_title        (GTK_WINDOW (window), "Enhanced Screenshot");
    gtk_window_set_default_size (GTK_WINDOW (window), 800, 600);
    app_data->window = window;

    vbox = gtk_box_new (GTK_ORIENTATION_VERTICAL, 5);
    gtk_container_add (GTK_CONTAINER (window), vbox);

    /* ---- top button row with icons ------------------------------------- */
    hbox_top = gtk_box_new (GTK_ORIENTATION_HORIZONTAL, 5);
    gtk_box_pack_start (GTK_BOX (vbox), hbox_top, FALSE, FALSE, 5);

    /* Icon buttons */
    btn_screenshot = gtk_button_new_from_icon_name ("camera-photo-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_button_set_label (GTK_BUTTON (btn_screenshot), "캡처");
    gtk_button_set_always_show_image (GTK_BUTTON (btn_screenshot), TRUE);
    
    btn_edit = gtk_button_new_from_icon_name ("document-edit-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_button_set_label (GTK_BUTTON (btn_edit), "편집");
    gtk_button_set_always_show_image (GTK_BUTTON (btn_edit), TRUE);
    
    btn_save = gtk_button_new_from_icon_name ("document-save-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_button_set_label (GTK_BUTTON (btn_save), "저장");
    gtk_button_set_always_show_image (GTK_BUTTON (btn_save), TRUE);

    gtk_box_pack_start (GTK_BOX (hbox_top), btn_screenshot, FALSE, FALSE, 5);
    gtk_box_pack_start (GTK_BOX (hbox_top), btn_edit,       FALSE, FALSE, 5);
    gtk_box_pack_start (GTK_BOX (hbox_top), btn_save,       FALSE, FALSE, 5);

    /* ---- mode selection with radio buttons ----------------------------- */
    hbox_modes = gtk_box_new (GTK_ORIENTATION_HORIZONTAL, 5);
    gtk_box_pack_start (GTK_BOX (vbox), hbox_modes, FALSE, FALSE, 5);
    
    GtkWidget *mode_label = gtk_label_new ("캡처 모드:");
    gtk_box_pack_start (GTK_BOX (hbox_modes), mode_label, FALSE, FALSE, 5);
    
    /* Radio buttons with icons */
    radio_fullscreen = gtk_radio_button_new (NULL);
    mode_box = gtk_box_new (GTK_ORIENTATION_HORIZONTAL, 5);
    GtkWidget *icon_full = gtk_image_new_from_icon_name ("view-fullscreen-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_box_pack_start (GTK_BOX (mode_box), icon_full, FALSE, FALSE, 0);
    gtk_box_pack_start (GTK_BOX (mode_box), gtk_label_new ("전체 화면"), FALSE, FALSE, 0);
    gtk_container_add (GTK_CONTAINER (radio_fullscreen), mode_box);
    g_object_set_data (G_OBJECT (radio_fullscreen), "mode", GINT_TO_POINTER (SCREENSHOT_MODE_FULL_SCREEN));
    
    radio_window = gtk_radio_button_new_from_widget (GTK_RADIO_BUTTON (radio_fullscreen));
    mode_box = gtk_box_new (GTK_ORIENTATION_HORIZONTAL, 5);
    GtkWidget *icon_win = gtk_image_new_from_icon_name ("window-new-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_box_pack_start (GTK_BOX (mode_box), icon_win, FALSE, FALSE, 0);
    gtk_box_pack_start (GTK_BOX (mode_box), gtk_label_new ("현재 창"), FALSE, FALSE, 0);
    gtk_container_add (GTK_CONTAINER (radio_window), mode_box);
    g_object_set_data (G_OBJECT (radio_window), "mode", GINT_TO_POINTER (SCREENSHOT_MODE_WINDOW));
    
    radio_area = gtk_radio_button_new_from_widget (GTK_RADIO_BUTTON (radio_fullscreen));
    mode_box = gtk_box_new (GTK_ORIENTATION_HORIZONTAL, 5);
    GtkWidget *icon_area = gtk_image_new_from_icon_name ("edit-select-symbolic", GTK_ICON_SIZE_BUTTON);
    gtk_box_pack_start (GTK_BOX (mode_box), icon_area, FALSE, FALSE, 0);
    gtk_box_pack_start (GTK_BOX (mode_box), gtk_label_new ("영역 선택"), FALSE, FALSE, 0);
    gtk_container_add (GTK_CONTAINER (radio_area), mode_box);
    g_object_set_data (G_OBJECT (radio_area), "mode", GINT_TO_POINTER (SCREENSHOT_MODE_AREA));
    
    gtk_toggle_button_set_active (GTK_TOGGLE_BUTTON (radio_fullscreen), TRUE);
    
    gtk_box_pack_start (GTK_BOX (hbox_modes), radio_fullscreen, FALSE, FALSE, 5);
    gtk_box_pack_start (GTK_BOX (hbox_modes), radio_window, FALSE, FALSE, 5);
    gtk_box_pack_start (GTK_BOX (hbox_modes), radio_area, FALSE, FALSE, 5);

    /* ---- options row ---------------------------------------------------- */
    hbox_opts = gtk_box_new (GTK_ORIENTATION_HORIZONTAL, 10);
    gtk_box_pack_start (GTK_BOX (vbox), hbox_opts, FALSE, FALSE, 0);

    /* Options matching gnome-screenshot checkboxes */
    check_pointer  = gtk_check_button_new_with_label ("마우스 포인터 포함");
    check_border   = gtk_check_button_new_with_label ("창 테두리 포함");
    check_auto_save = gtk_check_button_new_with_label ("자동 저장");

    gtk_toggle_button_set_active (GTK_TOGGLE_BUTTON (check_pointer),  TRUE);
    gtk_toggle_button_set_active (GTK_TOGGLE_BUTTON (check_border),   TRUE);
    gtk_toggle_button_set_active (GTK_TOGGLE_BUTTON (check_auto_save), FALSE);

    gtk_box_pack_start (GTK_BOX (hbox_opts), check_pointer,   FALSE, FALSE, 5);
    gtk_box_pack_start (GTK_BOX (hbox_opts), check_border,    FALSE, FALSE, 5);
    gtk_box_pack_start (GTK_BOX (hbox_opts), check_auto_save, FALSE, FALSE, 5);

    /* ---- image display -------------------------------------------------- */
    scrolled_window = gtk_scrolled_window_new (NULL, NULL);
    gtk_scrolled_window_set_policy (GTK_SCROLLED_WINDOW (scrolled_window),
                                    GTK_POLICY_AUTOMATIC,
                                    GTK_POLICY_AUTOMATIC);
    gtk_box_pack_start (GTK_BOX (vbox), scrolled_window, TRUE, TRUE, 0);

    image_display = gtk_image_new ();
    gtk_container_add (GTK_CONTAINER (scrolled_window), image_display);
    app_data->image_display = image_display;

    /* ---- connect signals ------------------------------------------------ */
    g_signal_connect (btn_screenshot, "clicked", G_CALLBACK (on_take_screenshot_clicked), app_data);
    g_signal_connect (btn_edit,       "clicked", G_CALLBACK (on_edit_clicked),            app_data);
    g_signal_connect (btn_save,       "clicked", G_CALLBACK (on_save_clicked),            app_data);
    g_signal_connect (radio_fullscreen, "toggled", G_CALLBACK (on_mode_changed),          app_data);
    g_signal_connect (radio_window,     "toggled", G_CALLBACK (on_mode_changed),          app_data);
    g_signal_connect (radio_area,       "toggled", G_CALLBACK (on_mode_changed),          app_data);
    g_signal_connect (check_auto_save, "toggled", G_CALLBACK (on_auto_save_toggled),      app_data);
    g_signal_connect (check_pointer,   "toggled", G_CALLBACK (on_include_pointer_toggled), app_data);
    g_signal_connect (check_border,    "toggled", G_CALLBACK (on_include_border_toggled),  app_data);

    gtk_widget_show_all (window);
}

/* ---- entry point -------------------------------------------------------- */

int
main (int argc, char *argv[])
{
    GtkApplication *app;
    int             status;

    app = gtk_application_new ("org.custom.Screenshot",
                                G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect (app, "activate", G_CALLBACK (on_activate), NULL);
    status = g_application_run (G_APPLICATION (app), argc, argv);
    g_object_unref (app);

    return status;
}
