#ifndef GST_HELPER_H
#define GST_HELPER_H

#include <gtk/gtk.h>
#include <gst/gst.h>

G_BEGIN_DECLS

GtkWidget* create_gst_video_widget(void);
void gst_play_youtube_url(GtkWidget *video_widget, const gchar *url, GtkWidget *status_label);
void gst_pause_playback(void);
void gst_stop_playback(void);

G_END_DECLS

#endif /* GST_HELPER_H */
