#define _GNU_SOURCE
/*
 * vnc_core.c – Pure POSIX C VNC/RFB client implementation.
 * Dependencies: libgcrypt, pthreads, POSIX sockets.  No GLib, no GTK.
 */

#include "vnc_core.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stdarg.h>
#include <errno.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netdb.h>
#include <arpa/inet.h>
#include <pthread.h>
#include <gcrypt.h>

/* ------------------------------------------------------------------ I/O */

static ssize_t read_exact(int fd, void *buf, size_t len) {
    size_t done = 0;
    while (done < len) {
        ssize_t n = recv(fd, (char*)buf + done, len - done, 0);
        if (n <= 0) return -1;
        done += (size_t)n;
    }
    return (ssize_t)done;
}

static ssize_t write_exact(int fd, const void *buf, size_t len) {
    size_t done = 0;
    while (done < len) {
        ssize_t n = send(fd, (const char*)buf + done, len - done, MSG_NOSIGNAL);
        if (n <= 0) return -1;
        done += (size_t)n;
    }
    return (ssize_t)done;
}

/* ------------------------------------------------------------------ byte helpers */

static inline uint16_t u16be(const uint8_t *p)
    { return (uint16_t)(p[0]<<8 | p[1]); }
static inline uint32_t u32be(const uint8_t *p)
    { return (uint32_t)((unsigned)p[0]<<24|(unsigned)p[1]<<16|(unsigned)p[2]<<8|p[3]); }
static inline int32_t  s32be(const uint8_t *p)
    { return (int32_t)u32be(p); }

static inline void put_u8 (uint8_t *p, uint8_t  v) { p[0]=v; }
static inline void put_u16(uint8_t *p, uint16_t v) { p[0]=(v>>8)&0xFF; p[1]=v&0xFF; }
static inline void put_u32(uint8_t *p, uint32_t v) {
    p[0]=(v>>24)&0xFF; p[1]=(v>>16)&0xFF; p[2]=(v>>8)&0xFF; p[3]=v&0xFF; }
static inline void put_s32(uint8_t *p, int32_t  v) { put_u32(p,(uint32_t)v); }

/* ------------------------------------------------------------------ DES auth */

static void des_reverse_key_bits(uint8_t *key8) {
    for (int i = 0; i < 8; i++) {
        uint8_t b = key8[i];
        b = (uint8_t)((b&0x01)<<7|(b&0x02)<<5|(b&0x04)<<3|(b&0x08)<<1|
                      (b&0x10)>>1|(b&0x20)>>3|(b&0x40)>>5|(b&0x80)>>7);
        key8[i] = b;
    }
}

static bool vnc_des_respond(int fd, const char *password) {
    uint8_t challenge[16];
    if (read_exact(fd, challenge, 16) != 16) return false;

    uint8_t key[8] = {0};
    if (password) {
        size_t plen = strlen(password);
        memcpy(key, password, plen < 8 ? plen : 8);
    }
    des_reverse_key_bits(key);

    uint8_t response[16];
    gcry_cipher_hd_t h;
    gcry_cipher_open(&h, GCRY_CIPHER_DES, GCRY_CIPHER_MODE_ECB, 0);
    gcry_cipher_setkey(h, key, 8);
    gcry_cipher_encrypt(h, response,   8, challenge,   8);
    gcry_cipher_encrypt(h, response+8, 8, challenge+8, 8);
    gcry_cipher_close(h);

    return write_exact(fd, response, 16) == 16;
}

/* ------------------------------------------------------------------ struct */

struct VncCore {
    int             fd;
    volatile bool   connected;
    bool            view_only;

    int             width;
    int             height;
    char           *desktop_name;

    uint32_t       *framebuffer;   /* 32bpp, 0x00RRGGBB */
    pthread_mutex_t fb_mutex;
    pthread_mutex_t io_mutex;

    pthread_t       thread;
    bool            thread_running;
    volatile bool   stop_requested;

    char           *host;
    int             port;
    char           *password;
    bool            shared;

    VncCoreCbs      cbs;
    char            last_error[512];
};

static void set_last_error(VncCore *c, const char *fmt, ...) {
    if (!c) return;
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(c->last_error, sizeof(c->last_error), fmt, ap);
    va_end(ap);
}

static const char *last_error_or(VncCore *c, const char *fallback) {
    return (c && c->last_error[0] != '\0') ? c->last_error : fallback;
}

/* ------------------------------------------------------------------ framebuffer helpers */

static inline void fb_set(VncCore *c, int x, int y, uint32_t pixel) {
    if (x >= 0 && x < c->width && y >= 0 && y < c->height)
        c->framebuffer[y * c->width + x] = pixel;
}

static inline uint32_t fb_get(VncCore *c, int x, int y) {
    if (x >= 0 && x < c->width && y >= 0 && y < c->height)
        return c->framebuffer[y * c->width + x];
    return 0;
}

/* Read one pixel from the socket (server uses 32bpp little-endian 0x00RRGGBB). */
static uint32_t read_pixel(int fd) {
    uint8_t buf[4];
    if (read_exact(fd, buf, 4) != 4) return 0;
    return (uint32_t)(buf[0] | (unsigned)buf[1]<<8 | (unsigned)buf[2]<<16);
}

/* ------------------------------------------------------------------ encodings */

static bool decode_raw(VncCore *c, int x, int y, int w, int h) {
    for (int py = y; py < y+h; py++)
        for (int px = x; px < x+w; px++)
            fb_set(c, px, py, read_pixel(c->fd));
    return true;
}

static bool decode_copyrect(VncCore *c, int x, int y, int w, int h) {
    uint8_t buf[4];
    if (read_exact(c->fd, buf, 4) != 4) return false;
    int sx = (int)u16be(buf), sy = (int)u16be(buf+2);
    if (sy < y || (sy == y && sx < x)) {
        for (int py = h-1; py >= 0; py--)
            for (int px = w-1; px >= 0; px--)
                fb_set(c, x+px, y+py, fb_get(c, sx+px, sy+py));
    } else {
        for (int py = 0; py < h; py++)
            for (int px = 0; px < w; px++)
                fb_set(c, x+px, y+py, fb_get(c, sx+px, sy+py));
    }
    return true;
}

static bool decode_rre(VncCore *c, int x, int y, int w, int h) {
    uint8_t hdr[8];
    if (read_exact(c->fd, hdr, 8) != 8) return false;
    uint32_t n  = u32be(hdr);
    uint32_t bg = (uint32_t)(hdr[4] | (unsigned)hdr[5]<<8 | (unsigned)hdr[6]<<16);

    for (int py = y; py < y+h; py++)
        for (int px = x; px < x+w; px++)
            fb_set(c, px, py, bg);

    for (uint32_t i = 0; i < n; i++) {
        uint8_t sub[12];
        if (read_exact(c->fd, sub, 12) != 12) return false;
        uint32_t col = (uint32_t)(sub[0] | (unsigned)sub[1]<<8 | (unsigned)sub[2]<<16);
        int sx = x + (int)u16be(sub+4);
        int sy = y + (int)u16be(sub+6);
        int sw =     (int)u16be(sub+8);
        int sh =     (int)u16be(sub+10);
        for (int py = sy; py < sy+sh; py++)
            for (int px = sx; px < sx+sw; px++)
                fb_set(c, px, py, col);
    }
    return true;
}

static bool decode_hextile(VncCore *c, int x, int y, int w, int h) {
    uint32_t bg = 0, fg = 0;
    for (int ty = y; ty < y+h; ty += 16) {
        for (int tx = x; tx < x+w; tx += 16) {
            int tw = (x+w - tx < 16) ? (x+w - tx) : 16;
            int th = (y+h - ty < 16) ? (y+h - ty) : 16;
            uint8_t sub;
            if (read_exact(c->fd, &sub, 1) != 1) return false;

            if (sub & HEXTILE_RAW) {
                for (int py = ty; py < ty+th; py++)
                    for (int px = tx; px < tx+tw; px++)
                        fb_set(c, px, py, read_pixel(c->fd));
                continue;
            }

            if (sub & HEXTILE_BG_SPECIFIED) bg = read_pixel(c->fd);
            for (int py = ty; py < ty+th; py++)
                for (int px = tx; px < tx+tw; px++)
                    fb_set(c, px, py, bg);

            if (sub & HEXTILE_FG_SPECIFIED) fg = read_pixel(c->fd);

            if (sub & HEXTILE_ANY_SUBRECTS) {
                uint8_t ns;
                if (read_exact(c->fd, &ns, 1) != 1) return false;
                for (uint8_t i = 0; i < ns; i++) {
                    uint32_t col = fg;
                    if (sub & HEXTILE_SUBRECTS_COLOURED) col = read_pixel(c->fd);
                    uint8_t xy, wh;
                    if (read_exact(c->fd, &xy, 1) != 1) return false;
                    if (read_exact(c->fd, &wh, 1) != 1) return false;
                    int sx = tx + ((xy>>4)&0x0F);
                    int sy = ty + (xy&0x0F);
                    int sw = ((wh>>4)&0x0F) + 1;
                    int sh = (wh&0x0F) + 1;
                    for (int py = sy; py < sy+sh; py++)
                        for (int px = sx; px < sx+sw; px++)
                            fb_set(c, px, py, col);
                }
            }
        }
    }
    return true;
}

/* ------------------------------------------------------------------ protocol requests */

static bool send_framebuffer_update_request(VncCore *c, bool incremental) {
    if (!c || c->fd < 0 || c->width <= 0 || c->height <= 0) return false;

    uint8_t msg[10];
    put_u8 (msg,   RFB_MSG_C2S_FRAMEBUFFER_UPDATE_REQ);
    put_u8 (msg+1, incremental ? 1 : 0);
    put_u16(msg+2, 0); put_u16(msg+4, 0);
    put_u16(msg+6, (uint16_t)c->width);
    put_u16(msg+8, (uint16_t)c->height);

    pthread_mutex_lock(&c->io_mutex);
    bool ok = write_exact(c->fd, msg, 10) == 10;
    pthread_mutex_unlock(&c->io_mutex);
    return ok;
}

static bool send_set_pixel_format(VncCore *c) {
    uint8_t msg[20];
    memset(msg, 0, 20);
    put_u8(msg, RFB_MSG_C2S_SET_PIXEL_FORMAT);
    /* 3 bytes padding, then 16-byte PixelFormat */
    msg[4]  = 32;  /* bpp  */
    msg[5]  = 24;  /* depth */
    msg[6]  = 0;   /* little-endian */
    msg[7]  = 1;   /* true-colour */
    put_u16(msg+8,  255); put_u16(msg+10, 255); put_u16(msg+12, 255);
    msg[14] = 16;  /* red-shift   */
    msg[15] = 8;   /* green-shift */
    msg[16] = 0;   /* blue-shift  */
    pthread_mutex_lock(&c->io_mutex);
    bool ok = write_exact(c->fd, msg, 20) == 20;
    pthread_mutex_unlock(&c->io_mutex);
    return ok;
}

static bool send_set_encodings(VncCore *c) {
    int32_t encs[] = {
        RFB_ENCODING_RAW,
        RFB_PSEUDO_DESKTOP_SIZE,
    };
    int n = (int)(sizeof(encs)/sizeof(encs[0]));
    uint8_t hdr[4];
    put_u8(hdr, RFB_MSG_C2S_SET_ENCODINGS); put_u8(hdr+1, 0);
    put_u16(hdr+2, (uint16_t)n);
    pthread_mutex_lock(&c->io_mutex);
    if (write_exact(c->fd, hdr, 4) != 4) {
        pthread_mutex_unlock(&c->io_mutex);
        return false;
    }
    for (int i = 0; i < n; i++) {
        uint8_t eb[4]; put_s32(eb, encs[i]);
        if (write_exact(c->fd, eb, 4) != 4) {
            pthread_mutex_unlock(&c->io_mutex);
            return false;
        }
    }
    pthread_mutex_unlock(&c->io_mutex);
    return true;
}

/* ------------------------------------------------------------------ message loop */

static bool process_framebuffer_update(VncCore *c) {
    uint8_t hdr[3];
    if (read_exact(c->fd, hdr, 3) != 3) {
        set_last_error(c, "Connection lost while reading framebuffer update header");
        return false;
    }
    uint16_t n_rects = u16be(hdr+1);
    fprintf(stderr, "vnc_core: framebuffer update, rectangles=%u\n", n_rects);

    for (uint16_t i = 0; i < n_rects; i++) {
        uint8_t rhdr[12];
        if (read_exact(c->fd, rhdr, 12) != 12) {
            set_last_error(c, "Connection lost while reading framebuffer rectangle");
            return false;
        }
        int rx = (int)u16be(rhdr);
        int ry = (int)u16be(rhdr+2);
        int rw = (int)u16be(rhdr+4);
        int rh = (int)u16be(rhdr+6);
        int32_t enc = s32be(rhdr+8);
        fprintf(stderr, "vnc_core: rect %u/%u x=%d y=%d w=%d h=%d enc=%d\n",
                (unsigned)i + 1, (unsigned)n_rects, rx, ry, rw, rh, enc);

        if (enc == RFB_PSEUDO_LAST_RECT)
            break;

        if (enc == RFB_PSEUDO_DESKTOP_SIZE) {
            pthread_mutex_lock(&c->fb_mutex);
            c->width  = rw; c->height = rh;
            c->framebuffer = realloc(c->framebuffer, (size_t)(rw * rh * 4));
            memset(c->framebuffer, 0, (size_t)(rw * rh * 4));
            pthread_mutex_unlock(&c->fb_mutex);
            if (c->cbs.resized) c->cbs.resized(c, rw, rh, c->cbs.userdata);
            continue;
        }

        if (rw <= 0 || rh <= 0) continue;

        pthread_mutex_lock(&c->fb_mutex);
        bool ok = true;
        switch (enc) {
        case RFB_ENCODING_RAW:      ok = decode_raw     (c, rx, ry, rw, rh); break;
        case RFB_ENCODING_COPYRECT: ok = decode_copyrect(c, rx, ry, rw, rh); break;
        case RFB_ENCODING_RRE:      ok = decode_rre     (c, rx, ry, rw, rh); break;
        case RFB_ENCODING_HEXTILE:  ok = decode_hextile (c, rx, ry, rw, rh); break;
        default:
            fprintf(stderr, "vnc_core: unknown encoding %d\n", enc);
            set_last_error(c, "Unsupported VNC framebuffer encoding: %d", enc);
            ok = false; break;
        }
        pthread_mutex_unlock(&c->fb_mutex);

        if (!ok) {
            if (c->last_error[0] == '\0')
                set_last_error(c, "Connection lost while decoding framebuffer update");
            return false;
        }
        if (c->cbs.update) c->cbs.update(c, rx, ry, rw, rh, c->cbs.userdata);
    }
    return true;
}

/* ------------------------------------------------------------------ handshake */

static bool do_handshake(VncCore *c) {
    char ver[RFB_VERSION_LEN + 1];
    if (read_exact(c->fd, ver, RFB_VERSION_LEN) != RFB_VERSION_LEN) {
        set_last_error(c, "Server closed the connection before sending RFB version");
        return false;
    }
    ver[RFB_VERSION_LEN] = '\0';

    int smaj = 0, smin = 0;
    if (sscanf(ver, "RFB %03d.%03d\n", &smaj, &smin) != 2) {
        set_last_error(c, "Invalid RFB version from server: %.12s", ver);
        return false;
    }
    bool rfb38 = (smaj > 3 || (smaj == 3 && smin >= 8));
    bool rfb37 = (smaj > 3 || (smaj == 3 && smin >= 7));

    const char *cv = rfb38 ? RFB_VERSION_3_8 : rfb37 ? RFB_VERSION_3_7 : RFB_VERSION_3_3;
    if (write_exact(c->fd, cv, RFB_VERSION_LEN) != RFB_VERSION_LEN) {
        set_last_error(c, "Failed to send RFB version to server");
        return false;
    }

    uint8_t chosen = RFB_SECURITY_NONE;
    if (rfb37) {
        uint8_t n;
        if (read_exact(c->fd, &n, 1) != 1) {
            set_last_error(c, "Server closed the connection before security negotiation");
            return false;
        }
        if (n == 0) {
            uint8_t rl[4];
            if (read_exact(c->fd, rl, 4) != 4) {
                set_last_error(c, "Server refused the connection");
                return false;
            }
            uint32_t rlen = u32be(rl);
            char *reason = calloc(rlen + 1, 1);
            if (read_exact(c->fd, reason, rlen) != (ssize_t)rlen) {
                free(reason);
                set_last_error(c, "Server refused the connection");
                return false;
            }
            fprintf(stderr, "vnc_core: server refused: %s\n", reason);
            set_last_error(c, "Server refused the connection: %s", reason);
            free(reason);
            return false;
        }
        uint8_t *types = malloc(n);
        if (read_exact(c->fd, types, n) != n) {
            free(types);
            set_last_error(c, "Server closed the connection while listing security types");
            return false;
        }
        chosen = RFB_SECURITY_INVALID;
        for (uint8_t k = 0; k < n; k++)
            if (types[k] == RFB_SECURITY_NONE) { chosen = RFB_SECURITY_NONE; break; }
        for (uint8_t k = 0; k < n; k++)
            if (chosen == RFB_SECURITY_INVALID && types[k] == RFB_SECURITY_VNC_AUTH) {
                chosen = RFB_SECURITY_VNC_AUTH;
                break;
            }
        free(types);
        if (chosen == RFB_SECURITY_INVALID) {
            set_last_error(c, "Server does not offer a supported security type");
            return false;
        }
        if (write_exact(c->fd, &chosen, 1) != 1) {
            set_last_error(c, "Failed to send selected security type");
            return false;
        }
    } else {
        uint8_t sb[4];
        if (read_exact(c->fd, sb, 4) != 4) {
            set_last_error(c, "Server closed the connection before security negotiation");
            return false;
        }
        chosen = (uint8_t)u32be(sb);
        if (chosen != RFB_SECURITY_NONE && chosen != RFB_SECURITY_VNC_AUTH) {
            set_last_error(c, "Server selected unsupported security type: %u", chosen);
            return false;
        }
    }

    if (chosen == RFB_SECURITY_VNC_AUTH) {
        if (!vnc_des_respond(c->fd, c->password)) {
            set_last_error(c, "Failed to complete VNC password challenge");
            return false;
        }
    }

    if (rfb37 || chosen != RFB_SECURITY_NONE) {
        uint8_t res[4];
        if (read_exact(c->fd, res, 4) != 4) {
            set_last_error(c, "Server closed the connection before authentication result");
            return false;
        }
        if (u32be(res) != RFB_AUTH_OK) {
            if (rfb37) {
                uint8_t rl[4];
                if (read_exact(c->fd, rl, 4) != 4) {
                    set_last_error(c, "Authentication failed");
                    return false;
                }
                uint32_t rlen = u32be(rl);
                char *reason = calloc(rlen + 1, 1);
                if (read_exact(c->fd, reason, rlen) != (ssize_t)rlen) {
                    free(reason);
                    set_last_error(c, "Authentication failed");
                    return false;
                }
                fprintf(stderr, "vnc_core: auth failed: %s\n", reason);
                set_last_error(c, "Authentication failed: %s", reason);
                free(reason);
            } else {
                set_last_error(c, "Authentication failed");
            }
            return false;
        }
    }

    uint8_t shared_flag = c->shared ? 1 : 0;
    if (write_exact(c->fd, &shared_flag, 1) != 1) {
        set_last_error(c, "Failed to send ClientInit");
        return false;
    }

    uint8_t sinit[24];
    if (read_exact(c->fd, sinit, 24) != 24) {
        set_last_error(c, "Server closed the connection before ServerInit");
        return false;
    }
    int w = (int)u16be(sinit);
    int h = (int)u16be(sinit+2);
    uint32_t name_len = u32be(sinit+20);
    if (w <= 0 || h <= 0) {
        set_last_error(c, "Server sent an invalid desktop size: %d x %d", w, h);
        return false;
    }

    pthread_mutex_lock(&c->fb_mutex);
    c->width = w; c->height = h;
    free(c->framebuffer);
    c->framebuffer = calloc((size_t)(w * h), 4);
    pthread_mutex_unlock(&c->fb_mutex);

    free(c->desktop_name);
    c->desktop_name = calloc(name_len + 1, 1);
    if (read_exact(c->fd, c->desktop_name, name_len) != (ssize_t)name_len) {
        set_last_error(c, "Server closed the connection while sending desktop name");
        return false;
    }

    if (!send_set_pixel_format(c)) {
        set_last_error(c, "Failed to send pixel format to server");
        return false;
    }
    if (!send_set_encodings(c)) {
        set_last_error(c, "Failed to send supported encodings to server");
        return false;
    }
    return true;
}

/* ------------------------------------------------------------------ worker thread */

static void *vnc_thread(void *ud) {
    VncCore *c = ud;
    c->last_error[0] = '\0';

    struct addrinfo hints = {0}, *res = NULL;
    hints.ai_family   = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;

    char port_str[16];
    snprintf(port_str, sizeof(port_str), "%d", c->port);

    int gai = getaddrinfo(c->host, port_str, &hints, &res);
    if (gai != 0) {
        set_last_error(c, "DNS resolution failed for %s: %s",
                       c->host, gai_strerror(gai));
        if (c->cbs.disconnected)
            c->cbs.disconnected(c, c->last_error, c->cbs.userdata);
        return NULL;
    }

    c->fd = socket(res->ai_family, SOCK_STREAM, 0);
    if (c->fd < 0 || connect(c->fd, res->ai_addr, res->ai_addrlen) != 0) {
        int saved_errno = errno;
        freeaddrinfo(res);
        if (c->fd >= 0) { close(c->fd); c->fd = -1; }
        set_last_error(c, "Cannot connect to %s:%d: %s",
                       c->host, c->port, strerror(saved_errno));
        if (c->cbs.disconnected)
            c->cbs.disconnected(c, c->last_error, c->cbs.userdata);
        return NULL;
    }
    freeaddrinfo(res);

    if (!do_handshake(c)) {
        close(c->fd); c->fd = -1;
        if (c->cbs.disconnected)
            c->cbs.disconnected(c,
                last_error_or(c, "Handshake / authentication failed"),
                c->cbs.userdata);
        return NULL;
    }

    c->connected = true;
    if (c->cbs.connected) c->cbs.connected(c, c->cbs.userdata);

    if (!send_framebuffer_update_request(c, false)) {
        set_last_error(c, "Failed to request initial framebuffer update");
        goto done;
    }

    while (!c->stop_requested) {
        uint8_t msg_type;
        if (read_exact(c->fd, &msg_type, 1) != 1) {
            if (!c->stop_requested)
                set_last_error(c, "Connection lost while waiting for server message");
            break;
        }

        switch (msg_type) {
        case RFB_MSG_S2C_FRAMEBUFFER_UPDATE:
            if (!process_framebuffer_update(c)) goto done;
            if (!send_framebuffer_update_request(c, true)) {
                set_last_error(c, "Failed to request next framebuffer update");
                goto done;
            }
            break;

        case RFB_MSG_S2C_SET_COLOUR_MAP: {
            uint8_t hdr[5];
            if (read_exact(c->fd, hdr, 5) != 5) {
                set_last_error(c, "Connection lost while reading colour map");
                goto done;
            }
            uint16_t nc = u16be(hdr+3);
            uint8_t *buf = malloc((size_t)nc * 6);
            if (read_exact(c->fd, buf, (size_t)nc * 6) != (ssize_t)((size_t)nc * 6)) {
                free(buf);
                set_last_error(c, "Connection lost while reading colour map");
                goto done;
            }
            free(buf);
            break;
        }

        case RFB_MSG_S2C_BELL:
            if (c->cbs.bell) c->cbs.bell(c, c->cbs.userdata);
            break;

        case RFB_MSG_S2C_SERVER_CUT_TEXT: {
            uint8_t hdr[7];
            if (read_exact(c->fd, hdr, 7) != 7) {
                set_last_error(c, "Connection lost while reading server clipboard");
                goto done;
            }
            uint32_t len = u32be(hdr+3);
            char *text = calloc(len + 1, 1);
            if (read_exact(c->fd, text, len) != (ssize_t)len) {
                free(text);
                set_last_error(c, "Connection lost while reading server clipboard");
                goto done;
            }
            if (c->cbs.cut_text) c->cbs.cut_text(c, text, c->cbs.userdata);
            free(text);
            break;
        }

        default:
            fprintf(stderr, "vnc_core: unknown server message %d\n", msg_type);
            set_last_error(c, "Unsupported VNC server message type: %u", msg_type);
            goto done;
        }
    }

done:
    if (c->fd >= 0) { close(c->fd); c->fd = -1; }
    c->connected = false;
    if (c->cbs.disconnected)
        c->cbs.disconnected(c,
            c->stop_requested ? "disconnected" : last_error_or(c, "connection lost"),
            c->cbs.userdata);
    return NULL;
}

/* ------------------------------------------------------------------ public API */

VncCore *vnc_core_new(void) {
    VncCore *c = calloc(1, sizeof(VncCore));
    c->fd = -1;
    pthread_mutex_init(&c->fb_mutex, NULL);
    pthread_mutex_init(&c->io_mutex, NULL);
    return c;
}

void vnc_core_free(VncCore *c) {
    if (!c) return;
    vnc_core_disconnect(c);
    if (c->thread_running) { pthread_join(c->thread, NULL); c->thread_running = false; }
    pthread_mutex_destroy(&c->io_mutex);
    pthread_mutex_destroy(&c->fb_mutex);
    free(c->framebuffer);
    free(c->desktop_name);
    free(c->host);
    free(c->password);
    free(c);
}

void vnc_core_set_callbacks(VncCore *c, const VncCoreCbs *cbs) {
    c->cbs = *cbs;
}

bool vnc_core_connect(VncCore *c, const char *host, int port,
                      const char *password, bool shared, bool view_only) {
    if (c->connected) return false;
    if (c->thread_running) { pthread_join(c->thread, NULL); c->thread_running = false; }

    free(c->host);     c->host     = strdup(host);
    free(c->password); c->password = strdup(password ? password : "");
    c->port           = port;
    c->shared         = shared;
    c->view_only      = view_only;
    c->stop_requested = false;

    if (pthread_create(&c->thread, NULL, vnc_thread, c) != 0) return false;
    c->thread_running = true;
    return true;
}

void vnc_core_disconnect(VncCore *c) {
    if (!c) return;
    c->stop_requested = true;
    if (c->fd >= 0) shutdown(c->fd, SHUT_RDWR);
}

bool        vnc_core_is_connected  (const VncCore *c) { return c && c->connected; }
void        vnc_core_request_refresh(VncCore *c) {
    if (!c || !c->connected) return;
    if (!send_framebuffer_update_request(c, false))
        set_last_error(c, "Failed to request framebuffer refresh");
}
double      vnc_core_get_nonblack_ratio(VncCore *c) {
    if (!c || !c->framebuffer || c->width <= 0 || c->height <= 0) return 0.0;

    int samples = 0;
    int nonblack = 0;

    pthread_mutex_lock(&c->fb_mutex);
    int step_y = c->height / 40;
    int step_x = c->width / 40;
    if (step_y < 1) step_y = 1;
    if (step_x < 1) step_x = 1;

    for (int y = 0; y < c->height; y += step_y) {
        for (int x = 0; x < c->width; x += step_x) {
            uint32_t p = c->framebuffer[y * c->width + x];
            uint8_t r = (uint8_t)((p >> 16) & 0xff);
            uint8_t g = (uint8_t)((p >> 8) & 0xff);
            uint8_t b = (uint8_t)(p & 0xff);
            if (r > 8 || g > 8 || b > 8)
                nonblack++;
            samples++;
        }
    }
    pthread_mutex_unlock(&c->fb_mutex);

    return samples > 0 ? (double)nonblack / (double)samples : 0.0;
}
int         vnc_core_get_width     (const VncCore *c) { return c ? c->width  : 0; }
int         vnc_core_get_height    (const VncCore *c) { return c ? c->height : 0; }
const char *vnc_core_get_desktop_name(const VncCore *c) { return c ? c->desktop_name : NULL; }

const uint32_t *vnc_core_lock_fb(VncCore *c) {
    pthread_mutex_lock(&c->fb_mutex);
    return c->framebuffer;
}

void vnc_core_unlock_fb(VncCore *c) {
    pthread_mutex_unlock(&c->fb_mutex);
}

void vnc_core_send_key(VncCore *c, uint32_t keysym, bool down) {
    if (!c || !c->connected || c->view_only) return;
    uint8_t msg[8];
    put_u8(msg,   RFB_MSG_C2S_KEY_EVENT);
    put_u8(msg+1, down ? 1 : 0);
    put_u16(msg+2, 0);
    put_u32(msg+4, keysym);
    pthread_mutex_lock(&c->io_mutex);
    write_exact(c->fd, msg, 8);
    pthread_mutex_unlock(&c->io_mutex);
}

void vnc_core_send_pointer(VncCore *c, int x, int y, uint8_t buttons) {
    if (!c || !c->connected || c->view_only) return;
    uint8_t msg[6];
    put_u8(msg,   RFB_MSG_C2S_POINTER_EVENT);
    put_u8(msg+1, buttons);
    put_u16(msg+2, (uint16_t)x);
    put_u16(msg+4, (uint16_t)y);
    pthread_mutex_lock(&c->io_mutex);
    write_exact(c->fd, msg, 6);
    pthread_mutex_unlock(&c->io_mutex);
}

void vnc_core_send_cut_text(VncCore *c, const char *text) {
    if (!c || !c->connected || !text) return;
    uint32_t len = (uint32_t)strlen(text);
    uint8_t hdr[8];
    put_u8(hdr, RFB_MSG_C2S_CLIENT_CUT_TEXT);
    hdr[1]=hdr[2]=hdr[3]=0;
    put_u32(hdr+4, len);
    pthread_mutex_lock(&c->io_mutex);
    if (write_exact(c->fd, hdr, 8) == 8)
        write_exact(c->fd, text, len);
    pthread_mutex_unlock(&c->io_mutex);
}
