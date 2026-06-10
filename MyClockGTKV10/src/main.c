#include <gtk/gtk.h>
#include <glib.h>
#include <stdlib.h>
#include <string.h>
#include "app_state.h"
#include "main_window.h"
#include "models/settings.h"
#include "services/timer_service.h"
#include "services/stopwatch_service.h"

static AppState g_app;

static void on_activate(GtkApplication *app, gpointer user_data)
{
    AppState *state = (AppState *)user_data;
    state->app = app;

    /* Load persisted settings */
    settings_load(&state->settings);

    /* Initialise timer services */
    for (int i = 0; i < MAX_TIMERS; i++) {
        timer_service_init(&state->timers[i]);
        if (i < state->settings.timer_count) {
            const TimerDto *d = &state->settings.timers[i];
            timer_service_set(&state->timers[i],
                              d->hours, d->minutes, d->seconds, d->label);
        } else {
            timer_service_set(&state->timers[i], 0, 5, 0, "");
        }
    }

    /* Ensure at least one timer slot */
    if (state->settings.timer_count == 0) {
        state->settings.timer_count = 1;
        state->settings.timers[0].hours   = 0;
        state->settings.timers[0].minutes = 5;
        state->settings.timers[0].seconds = 0;
    }

    /* Alarm fire-tracking table */
    state->fired_alarms = g_hash_table_new_full(g_str_hash, g_str_equal,
                                                g_free, NULL);

    /* Build main window */
    GtkWidget *win = main_window_new(state);
    gtk_window_present(GTK_WINDOW(win));
}

int main(int argc, char **argv)
{
    memset(&g_app, 0, sizeof(g_app));

    GtkApplication *app = gtk_application_new("io.github.myclock",
                                              G_APPLICATION_DEFAULT_FLAGS);
    g_signal_connect(app, "activate", G_CALLBACK(on_activate), &g_app);

    int status = g_application_run(G_APPLICATION(app), argc, argv);
    g_object_unref(app);
    return status;
}
