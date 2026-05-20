/*
 * vnc_client.c – GLib adapter for VncCore.
 *
 * Wraps the pure-C VncCore and marshals callbacks from the VNC worker thread
 * to the GLib main loop via g_idle_add(), so GTK widgets can be safely updated.
 *
 * Dependencies: glib-2.0 (NOT gtk).
 */

#include "vnc_client.h"
#include "vnc_core.h"
#include <string.h>

/* ------------------------------------------------------------------ struct (must come first) */

struct _VncClient {
    VncCore *core;
    gboolean destroying;
    GMutex   sources_mutex;
    GList   *idle_sources;

    VncConnectedCb    connected_cb;    gpointer connected_data;
    VncDisconnectedCb disconnected_cb; gpointer disconnected_data;
    VncUpdateCb       update_cb;       gpointer update_data;
    VncResizedCb      resized_cb;      gpointer resized_data;
    VncBellCb         bell_cb;         gpointer bell_data;
    VncCutTextCb      cut_text_cb;     gpointer cut_text_data;
};

/* ------------------------------------------------------------------ idle payloads */

typedef struct { VncClient *c; guint source_id; }    IdleSimple;
typedef struct { VncClient *c; guint source_id; gchar *msg; } IdleDiscon;
typedef struct { VncClient *c; guint source_id; gint x,y,w,h; } IdleUpdate;
typedef struct { VncClient *c; guint source_id; gint width, height; } IdleResize;
typedef struct { VncClient *c; guint source_id; gchar *text; } IdleCut;

/* ------------------------------------------------------------------ source tracking */

static void untrack_idle_source(VncClient *c, guint source_id) {
    if (!c || source_id == 0) return;

    g_mutex_lock(&c->sources_mutex);
    c->idle_sources = g_list_remove(c->idle_sources, GUINT_TO_POINTER(source_id));
    g_mutex_unlock(&c->sources_mutex);
}

static void cancel_idle_sources(VncClient *c) {
    if (!c) return;

    g_mutex_lock(&c->sources_mutex);
    GList *sources = c->idle_sources;
    c->idle_sources = NULL;
    g_mutex_unlock(&c->sources_mutex);

    for (GList *l = sources; l; l = l->next)
        g_source_remove(GPOINTER_TO_UINT(l->data));
    g_list_free(sources);
}

static gboolean queue_idle_source(VncClient *c,
                                  GSourceFunc callback,
                                  gpointer    data,
                                  guint      *source_id) {
    if (!c) return FALSE;

    g_mutex_lock(&c->sources_mutex);
    if (c->destroying) {
        g_mutex_unlock(&c->sources_mutex);
        return FALSE;
    }

    guint id = g_idle_add(callback, data);
    if (source_id)
        *source_id = id;
    c->idle_sources = g_list_prepend(c->idle_sources, GUINT_TO_POINTER(id));
    g_mutex_unlock(&c->sources_mutex);
    return TRUE;
}

/* ------------------------------------------------------------------ idle callbacks (main thread) */

static gboolean idle_connected(gpointer ud) {
    IdleSimple *d = ud;
    untrack_idle_source(d->c, d->source_id);
    if (!d->c->destroying && d->c->connected_cb)
        d->c->connected_cb(d->c, d->c->connected_data);
    g_free(d);
    return G_SOURCE_REMOVE;
}

static gboolean idle_disconnected(gpointer ud) {
    IdleDiscon *d = ud;
    untrack_idle_source(d->c, d->source_id);
    if (!d->c->destroying && d->c->disconnected_cb)
        d->c->disconnected_cb(d->c, d->msg, d->c->disconnected_data);
    g_free(d->msg); g_free(d);
    return G_SOURCE_REMOVE;
}

static gboolean idle_update(gpointer ud) {
    IdleUpdate *d = ud;
    untrack_idle_source(d->c, d->source_id);
    if (!d->c->destroying && d->c->update_cb)
        d->c->update_cb(d->c, d->x, d->y, d->w, d->h, d->c->update_data);
    g_free(d);
    return G_SOURCE_REMOVE;
}

static gboolean idle_resize(gpointer ud) {
    IdleResize *d = ud;
    untrack_idle_source(d->c, d->source_id);
    if (!d->c->destroying && d->c->resized_cb)
        d->c->resized_cb(d->c, d->width, d->height, d->c->resized_data);
    g_free(d);
    return G_SOURCE_REMOVE;
}

static gboolean idle_bell(gpointer ud) {
    IdleSimple *d = ud;
    untrack_idle_source(d->c, d->source_id);
    if (!d->c->destroying && d->c->bell_cb)
        d->c->bell_cb(d->c, d->c->bell_data);
    g_free(d);
    return G_SOURCE_REMOVE;
}

static gboolean idle_cut_text(gpointer ud) {
    IdleCut *d = ud;
    untrack_idle_source(d->c, d->source_id);
    if (!d->c->destroying && d->c->cut_text_cb)
        d->c->cut_text_cb(d->c, d->text, d->c->cut_text_data);
    g_free(d->text); g_free(d);
    return G_SOURCE_REMOVE;
}

/* ------------------------------------------------------------------ VncCore callbacks (VNC thread) */

static void core_connected(VncCore *core, void *ud) {
    (void)core;
    VncClient *c = ud;

    IdleSimple *d = g_new0(IdleSimple, 1);
    d->c = c;
    if (!queue_idle_source(c, idle_connected, d, &d->source_id))
        g_free(d);
}

static void core_disconnected(VncCore *core, const char *reason, void *ud) {
    (void)core;
    VncClient *c = ud;

    IdleDiscon *d = g_new0(IdleDiscon, 1);
    d->c = c; d->msg = g_strdup(reason);
    if (!queue_idle_source(c, idle_disconnected, d, &d->source_id)) {
        g_free(d->msg);
        g_free(d);
    }
}

static void core_update(VncCore *core, int x, int y, int w, int h, void *ud) {
    (void)core;
    VncClient *c = ud;

    IdleUpdate *d = g_new0(IdleUpdate, 1);
    d->c = c; d->x = x; d->y = y; d->w = w; d->h = h;
    if (!queue_idle_source(c, idle_update, d, &d->source_id))
        g_free(d);
}

static void core_resized(VncCore *core, int w, int h, void *ud) {
    (void)core;
    VncClient *c = ud;

    IdleResize *d = g_new0(IdleResize, 1);
    d->c = c; d->width = w; d->height = h;
    if (!queue_idle_source(c, idle_resize, d, &d->source_id))
        g_free(d);
}

static void core_bell(VncCore *core, void *ud) {
    (void)core;
    VncClient *c = ud;

    IdleSimple *d = g_new0(IdleSimple, 1);
    d->c = c;
    if (!queue_idle_source(c, idle_bell, d, &d->source_id))
        g_free(d);
}

static void core_cut_text(VncCore *core, const char *text, void *ud) {
    (void)core;
    VncClient *c = ud;

    IdleCut *d = g_new0(IdleCut, 1);
    d->c = c; d->text = g_strdup(text);
    if (!queue_idle_source(c, idle_cut_text, d, &d->source_id)) {
        g_free(d->text);
        g_free(d);
    }
}

/* ------------------------------------------------------------------ public API */

VncClient *vnc_client_new(void) {
    VncClient *c = g_new0(VncClient, 1);
    g_mutex_init(&c->sources_mutex);
    c->core = vnc_core_new();

    VncCoreCbs cbs = {
        .connected    = core_connected,
        .disconnected = core_disconnected,
        .update       = core_update,
        .resized      = core_resized,
        .bell         = core_bell,
        .cut_text     = core_cut_text,
        .userdata     = c,
    };
    vnc_core_set_callbacks(c->core, &cbs);
    return c;
}

void vnc_client_free(VncClient *c) {
    if (!c) return;

    g_mutex_lock(&c->sources_mutex);
    c->destroying = TRUE;
    c->connected_cb = NULL;    c->connected_data = NULL;
    c->disconnected_cb = NULL; c->disconnected_data = NULL;
    c->update_cb = NULL;       c->update_data = NULL;
    c->resized_cb = NULL;      c->resized_data = NULL;
    c->bell_cb = NULL;         c->bell_data = NULL;
    c->cut_text_cb = NULL;     c->cut_text_data = NULL;
    g_mutex_unlock(&c->sources_mutex);

    vnc_core_free(c->core);
    cancel_idle_sources(c);
    g_mutex_clear(&c->sources_mutex);
    g_free(c);
}

gboolean vnc_client_connect(VncClient *c, const gchar *host, gint port,
                             const gchar *password, gboolean shared,
                             gboolean view_only, GError **error) {
    if (vnc_core_is_connected(c->core)) {
        g_set_error_literal(error, G_IO_CHANNEL_ERROR, 0, "already connected");
        return FALSE;
    }
    if (!vnc_core_connect(c->core, host, port, password,
                          shared != FALSE, view_only != FALSE)) {
        g_set_error_literal(error, G_IO_CHANNEL_ERROR, 0,
                            "failed to start connection thread");
        return FALSE;
    }
    return TRUE;
}

void     vnc_client_disconnect   (VncClient *c) { if (c) vnc_core_disconnect(c->core); }
gboolean vnc_client_is_connected (VncClient *c) { return c && vnc_core_is_connected(c->core); }
void     vnc_client_request_refresh(VncClient *c) { if (c) vnc_core_request_refresh(c->core); }
gdouble  vnc_client_get_nonblack_ratio(VncClient *c) {
    return c ? vnc_core_get_nonblack_ratio(c->core) : 0.0;
}

gint vnc_client_get_width (VncClient *c) { return c ? vnc_core_get_width(c->core)  : 0; }
gint vnc_client_get_height(VncClient *c) { return c ? vnc_core_get_height(c->core) : 0; }
const gchar *vnc_client_get_desktop_name(VncClient *c) {
    return c ? vnc_core_get_desktop_name(c->core) : NULL;
}

const uint32_t *vnc_client_lock_fb  (VncClient *c) { return vnc_core_lock_fb(c->core); }
void            vnc_client_unlock_fb(VncClient *c) { vnc_core_unlock_fb(c->core); }

void vnc_client_send_key_event(VncClient *c, uint32_t keysym, gboolean down) {
    if (c) vnc_core_send_key(c->core, keysym, down != FALSE);
}

void vnc_client_send_pointer_event(VncClient *c, gint x, gint y, uint8_t buttons) {
    if (c) vnc_core_send_pointer(c->core, x, y, buttons);
}

void vnc_client_send_cut_text(VncClient *c, const gchar *text) {
    if (c) vnc_core_send_cut_text(c->core, text);
}

void vnc_client_set_connected_cb   (VncClient *c, VncConnectedCb    cb, gpointer d)
    { c->connected_cb    = cb; c->connected_data    = d; }
void vnc_client_set_disconnected_cb(VncClient *c, VncDisconnectedCb cb, gpointer d)
    { c->disconnected_cb = cb; c->disconnected_data = d; }
void vnc_client_set_update_cb      (VncClient *c, VncUpdateCb       cb, gpointer d)
    { c->update_cb       = cb; c->update_data       = d; }
void vnc_client_set_resized_cb     (VncClient *c, VncResizedCb      cb, gpointer d)
    { c->resized_cb      = cb; c->resized_data      = d; }
void vnc_client_set_bell_cb        (VncClient *c, VncBellCb         cb, gpointer d)
    { c->bell_cb         = cb; c->bell_data         = d; }
void vnc_client_set_cut_text_cb    (VncClient *c, VncCutTextCb      cb, gpointer d)
    { c->cut_text_cb     = cb; c->cut_text_data     = d; }
