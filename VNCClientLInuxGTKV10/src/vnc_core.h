#pragma once

/*
 * vnc_core – pure POSIX C VNC/RFB client.
 * No GLib, no GTK.  Dependencies: libgcrypt, pthreads, POSIX sockets.
 *
 * Callbacks are invoked from the VNC worker thread.
 * The caller (e.g. a GLib adapter) is responsible for marshalling
 * them back to the UI thread if needed.
 */

#include <stdint.h>
#include <stdbool.h>
#include "vnc_types.h"

typedef struct VncCore VncCore;

/* ------------------------------------------------------------------ callbacks
 * All callbacks are called from the VNC worker thread, NOT the main thread.
 * Do not touch GTK/GDK from inside them directly. */

typedef void (*VncCoreCb_Connected)   (VncCore *core, void *userdata);
typedef void (*VncCoreCb_Disconnected)(VncCore *core, const char *reason, void *userdata);
typedef void (*VncCoreCb_Update)      (VncCore *core, int x, int y, int w, int h, void *userdata);
typedef void (*VncCoreCb_Resized)     (VncCore *core, int w, int h, void *userdata);
typedef void (*VncCoreCb_Bell)        (VncCore *core, void *userdata);
typedef void (*VncCoreCb_CutText)     (VncCore *core, const char *text, void *userdata);

typedef struct {
    VncCoreCb_Connected    connected;
    VncCoreCb_Disconnected disconnected;
    VncCoreCb_Update       update;
    VncCoreCb_Resized      resized;
    VncCoreCb_Bell         bell;
    VncCoreCb_CutText      cut_text;
    void                  *userdata;
} VncCoreCbs;

/* ------------------------------------------------------------------ lifecycle */

VncCore *vnc_core_new(void);
void     vnc_core_free(VncCore *core);

/* Set callbacks (must be done before vnc_core_connect). */
void     vnc_core_set_callbacks(VncCore *core, const VncCoreCbs *cbs);

/* Connect asynchronously – spawns a worker thread. */
bool     vnc_core_connect(VncCore   *core,
                          const char *host,
                          int         port,
                          const char *password,
                          bool        shared,
                          bool        view_only);

void     vnc_core_disconnect(VncCore *core);
bool     vnc_core_is_connected(const VncCore *core);
void     vnc_core_request_refresh(VncCore *core);
double   vnc_core_get_nonblack_ratio(VncCore *core);

/* ------------------------------------------------------------------ desktop */

int         vnc_core_get_width      (const VncCore *core);
int         vnc_core_get_height     (const VncCore *core);
const char *vnc_core_get_desktop_name(const VncCore *core);

/* ------------------------------------------------------------------ framebuffer
 * Lock the framebuffer before reading pixels; unlock afterwards.
 * The buffer is 32bpp, layout 0x00RRGGBB (Cairo RGB24 compatible). */

const uint32_t *vnc_core_lock_fb  (VncCore *core);
void            vnc_core_unlock_fb(VncCore *core);

/* ------------------------------------------------------------------ input
 * Safe to call from any thread once connected. */

void vnc_core_send_key     (VncCore *core, uint32_t keysym, bool down);
void vnc_core_send_pointer (VncCore *core, int x, int y, uint8_t buttons);
void vnc_core_send_cut_text(VncCore *core, const char *text);
