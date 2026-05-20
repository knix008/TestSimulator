#pragma once

#include <glib.h>
#include <stdint.h>
#include <stdbool.h>
#include "vnc_types.h"

typedef struct _VncClient VncClient;

/* ------------------------------------------------------------------ callbacks */

typedef void (*VncConnectedCb)   (VncClient *client, gpointer data);
typedef void (*VncDisconnectedCb)(VncClient *client, const gchar *reason, gpointer data);
typedef void (*VncUpdateCb)      (VncClient *client, gint x, gint y, gint w, gint h, gpointer data);
typedef void (*VncResizedCb)     (VncClient *client, gint width, gint height, gpointer data);
typedef void (*VncBellCb)        (VncClient *client, gpointer data);
typedef void (*VncCutTextCb)     (VncClient *client, const gchar *text, gpointer data);

/* ------------------------------------------------------------------ lifecycle */

VncClient  *vnc_client_new(void);
void        vnc_client_free(VncClient *client);

/* Asynchronously connect (spawns worker thread). Returns FALSE if already connected. */
gboolean    vnc_client_connect(VncClient     *client,
                               const gchar   *host,
                               gint           port,
                               const gchar   *password,
                               gboolean       shared,
                               gboolean       view_only,
                               GError       **error);

void        vnc_client_disconnect(VncClient *client);
gboolean    vnc_client_is_connected(VncClient *client);
void        vnc_client_request_refresh(VncClient *client);
gdouble     vnc_client_get_nonblack_ratio(VncClient *client);

/* ------------------------------------------------------------------ desktop info */

gint        vnc_client_get_width(VncClient *client);
gint        vnc_client_get_height(VncClient *client);
const gchar *vnc_client_get_desktop_name(VncClient *client);

/* ------------------------------------------------------------------ framebuffer */

/* Lock framebuffer and return a pointer to it (32bpp RGB24). Must call unlock. */
const uint32_t *vnc_client_lock_fb(VncClient *client);
void            vnc_client_unlock_fb(VncClient *client);

/* ------------------------------------------------------------------ input */

void vnc_client_send_key_event    (VncClient *client, uint32_t keysym, gboolean down);
void vnc_client_send_pointer_event(VncClient *client, gint x, gint y, uint8_t buttons);
void vnc_client_send_cut_text     (VncClient *client, const gchar *text);

/* ------------------------------------------------------------------ callbacks */

void vnc_client_set_connected_cb   (VncClient *client, VncConnectedCb    cb, gpointer data);
void vnc_client_set_disconnected_cb(VncClient *client, VncDisconnectedCb cb, gpointer data);
void vnc_client_set_update_cb      (VncClient *client, VncUpdateCb       cb, gpointer data);
void vnc_client_set_resized_cb     (VncClient *client, VncResizedCb      cb, gpointer data);
void vnc_client_set_bell_cb        (VncClient *client, VncBellCb         cb, gpointer data);
void vnc_client_set_cut_text_cb    (VncClient *client, VncCutTextCb      cb, gpointer data);
