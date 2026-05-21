#ifndef MAIN_WINDOW_H
#define MAIN_WINDOW_H

#include <gtk/gtk.h>

#define FTP_MAIN_WINDOW_TYPE (ftp_main_window_get_type())
G_DECLARE_FINAL_TYPE(FtpMainWindow, ftp_main_window, FTP, MAIN_WINDOW, GtkApplicationWindow)

FtpMainWindow *ftp_main_window_new(GtkApplication *app);

#endif /* MAIN_WINDOW_H */
