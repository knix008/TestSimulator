#pragma once
#include <gtk/gtk.h>
#include <string>

// Apply dark CSS theme and GTK dark-mode preference.
void gui_apply_css();

// Create a labeled GTK frame wrapping child.
GtkWidget* gui_make_frame(const char* title, GtkWidget* child);

// Attach a right-aligned label + field widget to a GtkGrid row.
void gui_attach_row(GtkGrid* grid, int row, const char* label_text, GtkWidget* field);

// Add numeric marks to a GtkScale.
void gui_add_scale_marks(GtkScale* scale, const double* values, const char* const* labels, int n);

// Show a result dialog after recording. detail_text is shown in a copyable text view.
// is_error=true → error icon; false → info icon.
void gui_show_result_dialog(GtkWindow* parent,
                            const std::string& title,
                            const std::string& message,
                            const std::string& detail_text,
                            bool is_error);
