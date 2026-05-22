#include "gui_utils.h"

// ── CSS ────────────────────────────────────────────────────────────────────

static constexpr const char* kCss = R"(
  * { color: #e0e0e0; }

  window { background-color: #121212; }

  frame {
    background-color: #1e1e1e;
    border: 1px solid #3a3a3a;
    border-radius: 6px;
    padding: 4px;
  }
  frame > label { font-weight: bold; color: #9e9e9e; }

  label  { color: #e0e0e0; }

  entry {
    background-color: #2b2b2b;
    color: #f5f5f5;
    border: 1px solid #4a4a4a;
    padding: 5px 8px;
  }
  entry:focus { border-color: #5c9fd4; box-shadow: none; }

  spinbutton            { background-color: #2b2b2b; border: 1px solid #4a4a4a; }
  spinbutton entry      { background-color: #2b2b2b; color: #f5f5f5; border: none; }
  spinbutton button     { background-color: #383838; color: #e0e0e0; border: none; }
  spinbutton button:hover { background-color: #454545; }

  combobox button       { background-color: #2b2b2b; border: 1px solid #4a4a4a; color: #f5f5f5; }
  combobox button:hover { background-color: #383838; }

  checkbutton label { color: #e0e0e0; }

  button { background-color: #383838; color: #e0e0e0;
           border: 1px solid #4a4a4a; padding: 4px 10px; }
  button:hover { background-color: #454545; }

  scale trough      { background-color: #2b2b2b; }
  scale highlight   { background-color: #1565c0; }

  /* Mark tick lines: uniform 6 px height, centred on the slider track */
  scale marks mark indicator {
    min-height: 6px;
    min-width:  1px;
    background-color: #666666;
  }

  /* Mark labels: monospace + fixed min-width so every label aligns */
  scale marks mark label {
    font-family: monospace;
    font-size:   80%;
    min-width:   28px;
    color:       #9e9e9e;
  }

  scrolledwindow { background-color: #181818; border: 1px solid #3a3a3a; }
  textview       { background-color: #181818; color: #d4d4d4; }
  textview text  { background-color: #181818; color: #d4d4d4; }
  textview selection, textview text selection {
    background-color: #264f78; color: #ffffff; }

  .value-label   { color: #f5f5f5; }
  .hint-label    { color: #888888; font-size: 90%; }
  .elapsed-label { color: #81c784; font-weight: bold;
                   font-size: 130%; font-family: monospace; }

  label.status-text           { font-weight: bold; font-size: 110%; }
  label.status-text.stopped   { color: #ef9a9a; }
  label.status-text.recording { color: #81c784; }

  .btn-record { min-height: 36px; min-width: 180px;
                font-weight: bold; border: none; }
  .btn-record.start { background-color: #b71c1c; color: #ffffff; }
  .btn-record.start:hover { background-color: #c62828; }
  .btn-record.stop  { background-color: #1b5e20; color: #ffffff; }
  .btn-record.stop:hover  { background-color: #2e7d32; }

  .form-grid { margin: 4px 8px 8px 8px; }
  .log-view, .log-view text { background-color: #181818; color: #d4d4d4; }
)";

// ── Public API ─────────────────────────────────────────────────────────────

void gui_apply_css() {
    GtkSettings* settings = gtk_settings_get_default();
    g_object_set(settings, "gtk-application-prefer-dark-theme", TRUE, nullptr);

    GtkCssProvider* provider = gtk_css_provider_new();
    gtk_css_provider_load_from_data(provider, kCss, -1, nullptr);
    gtk_style_context_add_provider_for_screen(
        gdk_screen_get_default(),
        GTK_STYLE_PROVIDER(provider),
        GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
    g_object_unref(provider);
}

GtkWidget* gui_make_frame(const char* title, GtkWidget* child) {
    GtkWidget* frame = gtk_frame_new(title);
    gtk_frame_set_shadow_type(GTK_FRAME(frame), GTK_SHADOW_ETCHED_IN);
    gtk_container_add(GTK_CONTAINER(frame), child);
    gtk_widget_set_margin_bottom(frame, 4);
    return frame;
}

void gui_attach_row(GtkGrid* grid, int row, const char* label_text, GtkWidget* field) {
    GtkWidget* lbl = gtk_label_new(label_text);
    gtk_label_set_xalign(GTK_LABEL(lbl), 1.0f);
    gtk_widget_set_margin_end(lbl, 10);
    gtk_widget_set_valign(lbl, GTK_ALIGN_CENTER);
    gtk_grid_attach(grid, lbl, 0, row, 1, 1);
    if (field) {
        gtk_widget_set_hexpand(field, TRUE);
        gtk_widget_set_valign(field, GTK_ALIGN_CENTER);
        gtk_grid_attach(grid, field, 1, row, 1, 1);
    }
}

void gui_add_scale_marks(GtkScale* scale, const double* values, const char* const* labels, int n) {
    for (int i = 0; i < n; ++i) {
        gtk_scale_add_mark(scale, values[i], GTK_POS_BOTTOM, labels ? labels[i] : nullptr);
    }
}

void gui_show_result_dialog(GtkWindow* parent,
                            const std::string& title,
                            const std::string& message,
                            const std::string& detail_text,
                            bool is_error) {
    GtkWindow* dlg_parent = nullptr;
    if (parent && GTK_IS_WINDOW(parent)) {
        if (GTK_IS_WIDGET(parent)) {
            gtk_widget_show_all(GTK_WIDGET(parent));
            gtk_window_present(parent);
        }
        dlg_parent = parent;
    }

    GtkMessageType msg_type = is_error ? GTK_MESSAGE_ERROR : GTK_MESSAGE_INFO;
    GtkWidget* dlg = gtk_message_dialog_new(
        dlg_parent,
        static_cast<GtkDialogFlags>(GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT),
        msg_type,
        GTK_BUTTONS_CLOSE,
        "%s", message.c_str());
    gtk_window_set_title(GTK_WINDOW(dlg), title.c_str());

    if (!detail_text.empty()) {
        GtkWidget* content = gtk_dialog_get_content_area(GTK_DIALOG(dlg));

        GtkWidget* lbl_detail = gtk_label_new(is_error ? "오류 내용 (드래그하여 복사):" : "상세 정보:");
        gtk_label_set_xalign(GTK_LABEL(lbl_detail), 0.0f);
        gtk_widget_set_margin_top(lbl_detail, 8);
        gtk_widget_set_margin_start(lbl_detail, 8);
        gtk_box_pack_start(GTK_BOX(content), lbl_detail, FALSE, FALSE, 0);

        GtkWidget* scrolled = gtk_scrolled_window_new(nullptr, nullptr);
        gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scrolled),
                                       GTK_POLICY_AUTOMATIC, GTK_POLICY_AUTOMATIC);
        gtk_widget_set_size_request(scrolled, 460, 100);
        gtk_widget_set_margin_start(scrolled, 8);
        gtk_widget_set_margin_end(scrolled, 8);
        gtk_widget_set_margin_bottom(scrolled, 8);

        GtkWidget* text_view = gtk_text_view_new();
        gtk_text_view_set_editable(GTK_TEXT_VIEW(text_view), FALSE);
        gtk_text_view_set_monospace(GTK_TEXT_VIEW(text_view), TRUE);
        gtk_text_view_set_wrap_mode(GTK_TEXT_VIEW(text_view), GTK_WRAP_WORD_CHAR);
        gtk_text_view_set_left_margin(GTK_TEXT_VIEW(text_view), 6);
        gtk_text_view_set_right_margin(GTK_TEXT_VIEW(text_view), 6);
        gtk_text_view_set_top_margin(GTK_TEXT_VIEW(text_view), 4);
        gtk_text_view_set_bottom_margin(GTK_TEXT_VIEW(text_view), 4);
        gtk_style_context_add_class(gtk_widget_get_style_context(text_view), "log-view");

        GtkTextBuffer* buf = gtk_text_view_get_buffer(GTK_TEXT_VIEW(text_view));
        gtk_text_buffer_set_text(buf, detail_text.c_str(), -1);

        gtk_container_add(GTK_CONTAINER(scrolled), text_view);
        gtk_box_pack_start(GTK_BOX(content), scrolled, TRUE, TRUE, 0);
    }

    gtk_widget_show_all(dlg);
    gtk_dialog_run(GTK_DIALOG(dlg));
    gtk_widget_destroy(dlg);
}
