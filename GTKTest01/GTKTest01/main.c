#include <gtk/gtk.h>

static void activate(GtkApplication* app,
	gpointer user_data) {

	//Declare
	GtkWidget* window;

	//Initialize
	window = gtk_application_window_new(app);
	gtk_window_set_title(GTK_WINDOW(window), "ExampleOnWindows");
	gtk_window_set_default_size(GTK_WINDOW(window), 200, 200);

	//Show
	gtk_widget_show_all(window);
}

int main(int argc, char** argv) {
	GtkApplication* app;
	int status;

	app = gtk_application_new("org.gtk.example",
		G_APPLICATION_FLAGS_NONE);

	//Connect the Function activate to gsignal "activate"
	g_signal_connect(app, "activate", G_CALLBACK(activate), NULL);

	//Run
	status = g_application_run(G_APPLICATION(app), argc, argv);

	//Destruct
	g_object_unref(app);

	//Return
	return status;
}