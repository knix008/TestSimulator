#include "gui_utils.h"

// ── CSS ────────────────────────────────────────────────────────────────────

static constexpr const char* kCss = R"(
  * { color: #e0e0e0; font-size: 12px; }

  window { background-color: #141414; }

  frame {
    background-color: #1c1c1c;
    border: 1px solid #2e2e2e;
    border-radius: 4px;
    padding: 2px;
  }
  frame > label { font-weight: 600; font-size: 11px; color: #808080; padding: 0 4px; }

  label  { color: #d8d8d8; }

  entry {
    background-color: #242424;
    color: #f0f0f0;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    padding: 3px 6px;
    min-height: 0;
  }
  entry:focus { border-color: #4a90d9; box-shadow: none; }

  spinbutton            { background-color: #242424; border: 1px solid #3c3c3c; border-radius: 3px; }
  spinbutton entry      { background-color: #242424; color: #f0f0f0; border: none; padding: 2px 4px; }
  spinbutton button     { background-color: #303030; color: #d8d8d8; border: none; min-height: 0; padding: 0 3px; }
  spinbutton button:hover { background-color: #3a3a3a; }

  combobox button       { background-color: #242424; border: 1px solid #3c3c3c; border-radius: 3px; color: #f0f0f0; padding: 3px 6px; }
  combobox button:hover { background-color: #303030; }

  checkbutton { padding: 1px 0; }
  checkbutton label { color: #d8d8d8; }
  check { min-width: 14px; min-height: 14px; }

  button { background-color: #303030; color: #d8d8d8;
           border: 1px solid #3c3c3c; border-radius: 3px; padding: 3px 8px; }
  button:hover { background-color: #3a3a3a; }

  scale trough    { background-color: #242424; border-radius: 2px; min-height: 4px; }
  scale highlight { background-color: #1565c0; border-radius: 2px; }
  scale slider    { min-width: 12px; min-height: 12px; background-color: #5c9fd4;
                    border-radius: 6px; border: none; }
  scale slider:hover { background-color: #74b3e0; }

  scale marks mark indicator {
    min-height: 4px;
    min-width:  1px;
    background-color: #505050;
  }

  scale marks mark label {
    font-family: monospace;
    font-size:   10px;
    min-width:   24px;
    color:       #707070;
  }

  scrolledwindow { background-color: #161616; border: 1px solid #2e2e2e; border-radius: 3px; }
  textview       { background-color: #161616; color: #cccccc; }
  textview text  { background-color: #161616; color: #cccccc; }
  textview selection, textview text selection {
    background-color: #264f78; color: #ffffff; }

  .value-label   { color: #f0f0f0; }
  .hint-label    { color: #707070; font-size: 11px; }
  .elapsed-label { color: #81c784; font-weight: bold;
                   font-size: 14px; font-family: monospace; }

  label.status-text           { font-weight: bold; font-size: 12px; }
  label.status-text.stopped   { color: #ef9a9a; }
  label.status-text.recording { color: #81c784; }

  .btn-record { min-height: 28px; min-width: 140px;
                font-weight: bold; font-size: 12px; border: none; border-radius: 3px; }
  .btn-record.start { background-color: #b71c1c; color: #ffffff; }
  .btn-record.start:hover { background-color: #c62828; }
  .btn-record.stop  { background-color: #1b5e20; color: #ffffff; }
  .btn-record.stop:hover  { background-color: #2e7d32; }

  .form-grid { margin: 2px 6px 6px 6px; }
  .log-view, .log-view text { background-color: #161616; color: #cccccc; font-size: 11px; }
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
    gtk_widget_set_margin_bottom(frame, 2);
    return frame;
}

void gui_attach_row(GtkGrid* grid, int row, const char* label_text, GtkWidget* field) {
    GtkWidget* lbl = gtk_label_new(label_text);
    gtk_label_set_xalign(GTK_LABEL(lbl), 1.0f);
    gtk_widget_set_margin_end(lbl, 6);
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
