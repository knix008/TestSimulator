#include "about_dialog.h"

#include "app_icon.h"

#define ABOUT_APP_NAME "Command Center V1.0"
#define ABOUT_VERSION  "1.0"
#define ABOUT_DESC     "Linux / macOS용 듀얼 패널 파일 관리자"
#define ABOUT_COPYRIGHT "Copyleft © Knix008"

void about_dialog_show(GtkWindow *parent) {
    GtkWidget *dlg = gtk_dialog_new_with_buttons(
        "프로그램 정보",
        parent,
        GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
        "_닫기",
        GTK_RESPONSE_CLOSE,
        NULL);
    gtk_window_set_default_size(GTK_WINDOW(dlg), 440, -1);
    gtk_window_set_resizable(GTK_WINDOW(dlg), FALSE);

    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(dlg));
    GtkWidget *hbox = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 16);
    gtk_container_set_border_width(GTK_CONTAINER(hbox), 16);

    GtkWidget *image = gtk_image_new();
    GdkPixbuf *icon = app_icon_load_pixbuf(128);
    if (icon) {
        gtk_image_set_from_pixbuf(GTK_IMAGE(image), icon);
        g_object_unref(icon);
    }
    gtk_widget_set_halign(image, GTK_ALIGN_CENTER);
    gtk_widget_set_valign(image, GTK_ALIGN_START);
    gtk_box_pack_start(GTK_BOX(hbox), image, FALSE, FALSE, 0);

    GtkWidget *vbox = gtk_box_new(GTK_ORIENTATION_VERTICAL, 8);
    gtk_widget_set_valign(vbox, GTK_ALIGN_CENTER);

    GtkWidget *title = gtk_label_new(NULL);
    gtk_label_set_markup(GTK_LABEL(title),
        "<span size='large' weight='bold'>" ABOUT_APP_NAME "</span>");
    gtk_label_set_xalign(GTK_LABEL(title), 0.0);
    gtk_label_set_selectable(GTK_LABEL(title), TRUE);
    gtk_box_pack_start(GTK_BOX(vbox), title, FALSE, FALSE, 0);

    GtkWidget *version = gtk_label_new(NULL);
    gtk_label_set_markup(GTK_LABEL(version),
        "<b>버전</b>  " ABOUT_VERSION);
    gtk_label_set_xalign(GTK_LABEL(version), 0.0);
    gtk_box_pack_start(GTK_BOX(vbox), version, FALSE, FALSE, 0);

    GtkWidget *desc = gtk_label_new(ABOUT_DESC);
    gtk_label_set_xalign(GTK_LABEL(desc), 0.0);
    gtk_label_set_line_wrap(GTK_LABEL(desc), TRUE);
    gtk_label_set_max_width_chars(GTK_LABEL(desc), 32);
    gtk_box_pack_start(GTK_BOX(vbox), desc, FALSE, FALSE, 0);

    GtkWidget *copy = gtk_label_new(ABOUT_COPYRIGHT);
    gtk_label_set_xalign(GTK_LABEL(copy), 0.0);
    gtk_widget_set_margin_top(copy, 8);
    gtk_box_pack_start(GTK_BOX(vbox), copy, FALSE, FALSE, 0);

    gtk_box_pack_start(GTK_BOX(hbox), vbox, TRUE, TRUE, 0);
    gtk_box_pack_start(GTK_BOX(content), hbox, TRUE, TRUE, 0);
    gtk_widget_show_all(hbox);

    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}
