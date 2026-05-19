#pragma once

#include <stdint.h>
#include <stdbool.h>

/* RFB Protocol Versions */
#define RFB_VERSION_3_3  "RFB 003.003\n"
#define RFB_VERSION_3_7  "RFB 003.007\n"
#define RFB_VERSION_3_8  "RFB 003.008\n"
#define RFB_VERSION_LEN  12

/* Security Types */
#define RFB_SECURITY_INVALID  0
#define RFB_SECURITY_NONE     1
#define RFB_SECURITY_VNC_AUTH 2

/* Security Result */
#define RFB_AUTH_OK   0
#define RFB_AUTH_FAIL 1

/* Client -> Server message types */
#define RFB_MSG_C2S_SET_PIXEL_FORMAT       0
#define RFB_MSG_C2S_SET_ENCODINGS          2
#define RFB_MSG_C2S_FRAMEBUFFER_UPDATE_REQ 3
#define RFB_MSG_C2S_KEY_EVENT              4
#define RFB_MSG_C2S_POINTER_EVENT          5
#define RFB_MSG_C2S_CLIENT_CUT_TEXT        6

/* Server -> Client message types */
#define RFB_MSG_S2C_FRAMEBUFFER_UPDATE     0
#define RFB_MSG_S2C_SET_COLOUR_MAP         1
#define RFB_MSG_S2C_BELL                   2
#define RFB_MSG_S2C_SERVER_CUT_TEXT        3

/* Encodings */
#define RFB_ENCODING_RAW       0
#define RFB_ENCODING_COPYRECT  1
#define RFB_ENCODING_RRE       2
#define RFB_ENCODING_HEXTILE   5
#define RFB_ENCODING_ZLIB      6
#define RFB_ENCODING_TIGHT     7
#define RFB_ENCODING_ZRLE      16

/* Pseudo-encodings */
#define RFB_PSEUDO_DESKTOP_SIZE  ((int32_t)-223)
#define RFB_PSEUDO_CURSOR        ((int32_t)-239)
#define RFB_PSEUDO_LAST_RECT     ((int32_t)-224)

/* Hextile sub-encoding bitmask */
#define HEXTILE_RAW               1
#define HEXTILE_BG_SPECIFIED      2
#define HEXTILE_FG_SPECIFIED      4
#define HEXTILE_ANY_SUBRECTS      8
#define HEXTILE_SUBRECTS_COLOURED 16

/* Default VNC port */
#define VNC_DEFAULT_PORT 5900

/* Scale modes */
typedef enum {
    VNC_SCALE_NONE = 0,
    VNC_SCALE_FIT  = 1,
    VNC_SCALE_FILL = 2,
} VncScaleMode;

/* Pixel format (packed, network byte order) */
typedef struct __attribute__((packed)) {
    uint8_t  bits_per_pixel;
    uint8_t  depth;
    uint8_t  big_endian_flag;
    uint8_t  true_colour_flag;
    uint16_t red_max;
    uint16_t green_max;
    uint16_t blue_max;
    uint8_t  red_shift;
    uint8_t  green_shift;
    uint8_t  blue_shift;
    uint8_t  padding[3];
} RfbPixelFormat;

/* Rectangle header (packed, network byte order) */
typedef struct __attribute__((packed)) {
    uint16_t x;
    uint16_t y;
    uint16_t width;
    uint16_t height;
    int32_t  encoding;
} RfbRectHeader;
