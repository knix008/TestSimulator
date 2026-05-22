#include "input_dialog.h"

gboolean input_dialog_run(GtkWindow *parent,
                          const char *title,
                          const char *label,
                          const char *default_text,
                          char **out_text) {
    GtkWidget *dialog = gtk_dialog_new_with_buttons(
        title, parent, GTK_DIALOG_MODAL,
        "_취소", GTK_RESPONSE_CANCEL,
        "_확인", GTK_RESPONSE_OK,
        NULL);
    gtk_window_set_default_size(GTK_WINDOW(dialog), 420, 140);
    gtk_dialog_set_default_response(GTK_DIALOG(dialog), GTK_RESPONSE_OK);

    GtkWidget *content = gtk_dialog_get_content_area(GTK_DIALOG(dialog));
    gtk_container_set_border_width(GTK_CONTAINER(content), 16);

    GtkWidget *lbl = gtk_label_new(label);
    gtk_widget_set_halign(lbl, GTK_ALIGN_START);
    gtk_box_pack_start(GTK_BOX(content), lbl, FALSE, FALSE, 0);

    GtkWidget *entry = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(entry), default_text ? default_text : "");
    gtk_entry_set_activates_default(GTK_ENTRY(entry), TRUE);
    gtk_box_pack_start(GTK_BOX(content), entry, FALSE, FALSE, 8);

    gtk_widget_show_all(dialog);
    gboolean ok = FALSE;
    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_OK) {
        const char *text = gtk_entry_get_text(GTK_ENTRY(entry));
        if (text && *text) {
            *out_text = g_strdup(text);
            ok = TRUE;
        }
    }
    gtk_widget_destroy(dialog);
    return ok;
}
