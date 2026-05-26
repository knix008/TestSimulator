#include "midi_file.h"

#include <errno.h>
#include <stdio.h>
#include <string.h>

static guint32 read_be32(const unsigned char *p)
{
    return ((guint32)p[0] << 24) | ((guint32)p[1] << 16) | ((guint32)p[2] << 8) | p[3];
}

static guint16 read_be16(const unsigned char *p)
{
    return (guint16)(((guint16)p[0] << 8) | p[1]);
}

static double ticks_to_sec(gint64 tick, int division, int tempo_us)
{
    if (division <= 0)
        return 0.0;
    return (double)tick * (double)tempo_us / (1000000.0 * (double)division);
}

gboolean midi_file_load(const char *path, MidiFileInfo *info, GError **err)
{
    FILE *f;
    unsigned char hdr[10];
    int format, ntrks, division;
    gint64 max_tick = 0;
    int note_count = 0;
    int tempo = 500000;

    g_return_val_if_fail(path && info, FALSE);
    memset(info, 0, sizeof *info);

    f = fopen(path, "rb");
    if (!f) {
        g_set_error(err, G_FILE_ERROR, g_file_error_from_errno(errno),
                    "Cannot open MIDI file: %s", path);
        return FALSE;
    }

    {
        unsigned char sig[4];
        if (fread(sig, 1, 4, f) != 4) {
            fclose(f);
            g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Cannot read file");
            return FALSE;
        }
        if (memcmp(sig, "MThd", 4) == 0) {
            if (fseek(f, 4, SEEK_SET) != 0) { /* after MThd */
                fclose(f);
                g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Cannot seek file");
                return FALSE;
            }
        } else if (memcmp(sig, "RIFF", 4) == 0) {
            unsigned char riff[8];
            if (fread(riff, 1, 8, f) != 8) {
                fclose(f);
                g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Truncated RIFF header");
                return FALSE;
            }
            if (memcmp(riff + 4, "RMID", 4) != 0) {
                fclose(f);
                g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                                    "RIFF container is not RMID MIDI");
                return FALSE;
            }
            if (fread(sig, 1, 4, f) != 4 || memcmp(sig, "MThd", 4) != 0) {
                fclose(f);
                g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                                    "RIFF RMID does not contain MThd");
                return FALSE;
            }
        } else {
            fclose(f);
            g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Not a valid MIDI file");
            return FALSE;
        }
    }

    if (fread(hdr, 1, 10, f) != 10) {
        fclose(f);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Truncated MIDI header");
        return FALSE;
    }

    {
        guint32 chunk_len = read_be32(hdr);
        if (chunk_len != 6) {
            fclose(f);
            g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                        "Invalid MThd chunk length (%u, expected 6)", chunk_len);
            return FALSE;
        }
    }

    format = (int)read_be16(hdr + 4);
    ntrks = (int)read_be16(hdr + 6);
    division = (int)read_be16(hdr + 8);

    if (format < 0 || format > 2) {
        fclose(f);
        g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                    "Unknown MIDI format type %d", format);
        return FALSE;
    }
    if (ntrks < 1) {
        fclose(f);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "MIDI has no tracks");
        return FALSE;
    }
    if (division & 0x8000) {
        fclose(f);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                            "SMPTE timing not supported");
        return FALSE;
    }
    if (division == 0) {
        fclose(f);
        g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                            "Invalid MIDI ticks per quarter note");
        return FALSE;
    }

    for (int t = 0; t < ntrks; t++) {
        unsigned char th[8];
        if (fread(th, 1, 8, f) != 8 || memcmp(th, "MTrk", 4) != 0) {
            fclose(f);
            g_set_error(err, G_FILE_ERROR, G_FILE_ERROR_FAILED,
                        "Invalid track header at track %d", t + 1);
            return FALSE;
        }
        guint32 len = read_be32(th + 4);
        unsigned char *buf = g_malloc(len);
        if (!buf) {
            fclose(f);
            g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Out of memory");
            return FALSE;
        }
        if (fread(buf, 1, len, f) != len) {
            g_free(buf);
            fclose(f);
            g_set_error_literal(err, G_FILE_ERROR, G_FILE_ERROR_FAILED, "Truncated track");
            return FALSE;
        }

        guint32 pos = 0;
        gint64 abs_tick = 0;
        int running = 0;

        while (pos < len) {
            guint32 delta = 0;
            unsigned char b;
            do {
                if (pos >= len)
                    break;
                b = buf[pos++];
                delta = (delta << 7) | (b & 0x7f);
            } while (b & 0x80);
            abs_tick += delta;
            if (abs_tick > max_tick)
                max_tick = abs_tick;

            if (pos >= len)
                break;

            unsigned char status = buf[pos];
            if (status < 0x80) {
                if (running == 0)
                    break;
                status = (unsigned char)running;
            } else {
                pos++;
                if (status < 0xf0)
                    running = (int)status;
            }

            if (status == 0xff) {
                if (pos >= len)
                    break;
                unsigned char meta = buf[pos++];
                guint32 mlen = 0;
                do {
                    if (pos >= len)
                        break;
                    b = buf[pos++];
                    mlen = (mlen << 7) | (b & 0x7f);
                } while (b & 0x80);
                if (meta == 0x51 && mlen == 3 && pos + 2 < len) {
                    tempo = (buf[pos] << 16) | (buf[pos + 1] << 8) | buf[pos + 2];
                }
                if (pos + mlen > len)
                    break;
                pos += mlen;
            } else if (status == 0xf0 || status == 0xf7) {
                guint32 slen = 0;
                do {
                    if (pos >= len)
                        break;
                    b = buf[pos++];
                    slen = (slen << 7) | (b & 0x7f);
                } while (b & 0x80);
                if (pos + slen > len)
                    break;
                pos += slen;
            } else {
                int cmd = status & 0xf0;
                int param_len = (cmd == 0xc0 || cmd == 0xd0) ? 1 : 2;
                if (cmd == 0x90 && pos + 1 < len && buf[pos + 1] > 0)
                    note_count++;
                if (pos + param_len > len)
                    break;
                pos += param_len;
            }
        }
        g_free(buf);
    }
    fclose(f);

    info->path = g_strdup(path);
    info->display_name = g_path_get_basename(path);
    info->format = format;
    info->num_tracks = ntrks;
    info->note_count = note_count;
    info->duration_sec = ticks_to_sec(max_tick, division, tempo);
    if (info->duration_sec < 0.01)
        info->duration_sec = 0.01;
    return TRUE;
}

void midi_file_info_clear(MidiFileInfo *info)
{
    if (!info)
        return;
    g_free(info->path);
    g_free(info->display_name);
    memset(info, 0, sizeof *info);
}
