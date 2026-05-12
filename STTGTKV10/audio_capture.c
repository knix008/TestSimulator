#include "audio_capture.h"

#include <portaudio.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define SAMPLE_RATE     16000
#define FRAMES_PER_BUF  512

/* ── stderr suppression ─────────────────────────────────────────────────
   PortAudio's ALSA backend prints many harmless "Unknown PCM" warnings
   during Pa_Initialize().  We redirect stderr to /dev/null around it.     */

static void stderr_mute(int *saved) {
    fflush(stderr);
    *saved = dup(STDERR_FILENO);
    int n = open("/dev/null", O_WRONLY);
    if (n >= 0) { dup2(n, STDERR_FILENO); close(n); }
}

static void stderr_unmute(int saved) {
    fflush(stderr);
    if (saved >= 0) { dup2(saved, STDERR_FILENO); close(saved); }
}

/* ── PortAudio callback ──────────────────────────────────────────────── */

struct AudioCapture {
    PaStream        *stream;
    audio_frame_cb_t cb;
    void            *userdata;
    int              device_index;
    char             pa_source[256];
};

static int pa_callback(const void *input, void *output,
                       unsigned long n_frames,
                       const PaStreamCallbackTimeInfo *time_info,
                       PaStreamCallbackFlags flags, void *userdata) {
    (void)output; (void)time_info; (void)flags;
    AudioCapture *cap = (AudioCapture *)userdata;
    if (cap->cb && input)
        cap->cb((const float *)input, (int)n_frames, cap->userdata);
    return paContinue;
}

/* ── Device enumeration ──────────────────────────────────────────────── */

#ifdef __linux__
/*
 * On Linux (PipeWire/PulseAudio) PortAudio's ALSA backend segfaults when
 * probing virtual PCM devices that PipeWire exposes.  Use pactl instead.
 *
 * pactl output (parsed with awk):
 *   <pa_source_name>\t<human description>
 */
AudioDeviceList *audio_enumerate_devices(void) {
    AudioDeviceList *list = calloc(1, sizeof(AudioDeviceList));
    list->devices = calloc(64, sizeof(AudioDevice));

    /* Single awk pass: extract Name + Description, skip monitors */
    FILE *fp = popen(
        "pactl list sources 2>/dev/null | "
        "awk '"
          "/^Source #/ { if (n && d && n !~ /monitor/) print n\"\\t\"d; n=\"\"; d=\"\" } "
          "/^[[:space:]]*Name:/        { n=$2 } "
          "/^[[:space:]]*Description:/ { sub(/.*Description: /,\"\"); d=$0 } "
          "END { if (n && d && n !~ /monitor/) print n\"\\t\"d }'",
        "r");

    if (fp) {
        char line[1024];
        while (fgets(line, sizeof(line), fp) && list->count < 63) {
            char *tab = strchr(line, '\t');
            if (!tab) continue;
            *tab = '\0';

            AudioDevice *dev = &list->devices[list->count];
            dev->index = list->count;
            /* line and tab+1 are null-terminated; truncate safely */
            line[sizeof(dev->pa_source) - 1] = '\0';
            (tab + 1)[sizeof(dev->name) - 1] = '\0';
            memcpy(dev->pa_source, line,    strlen(line) + 1);
            memcpy(dev->name,      tab + 1, strlen(tab + 1) + 1);

            /* Trim trailing newline from display name */
            size_t nl = strlen(dev->name);
            while (nl > 0 && (dev->name[nl-1] == '\n' || dev->name[nl-1] == '\r'))
                dev->name[--nl] = '\0';

            list->count++;
        }
        pclose(fp);
    }
    return list;
}

#else   /* macOS: use PortAudio enumeration (no ALSA issues) */

AudioDeviceList *audio_enumerate_devices(void) {
    int saved;
    stderr_mute(&saved);
    PaError err = Pa_Initialize();
    stderr_unmute(saved);

    AudioDeviceList *list = calloc(1, sizeof(AudioDeviceList));
    if (err != paNoError) {
        fprintf(stderr, "[audio] Pa_Initialize: %s\n", Pa_GetErrorText(err));
        list->devices = calloc(1, sizeof(AudioDevice));
        return list;
    }

    int n = Pa_GetDeviceCount();
    list->devices = calloc((n > 0 ? n : 1) + 1, sizeof(AudioDevice));

    for (int i = 0; i < n; i++) {
        const PaDeviceInfo *info = Pa_GetDeviceInfo(i);
        if (info && info->maxInputChannels > 0) {
            AudioDevice *dev = &list->devices[list->count];
            dev->index = i;
            strncpy(dev->name, info->name, sizeof(dev->name) - 1);
            list->count++;
        }
    }
    Pa_Terminate();
    return list;
}

#endif /* __linux__ */

void audio_device_list_free(AudioDeviceList *list) {
    if (!list) return;
    free(list->devices);
    free(list);
}

/* ── AudioCapture ────────────────────────────────────────────────────── */

AudioCapture *audio_capture_new(int         device_index,
                                const char *pa_source,
                                audio_frame_cb_t cb,
                                void       *userdata) {
    AudioCapture *cap = calloc(1, sizeof(AudioCapture));
    cap->device_index = device_index;
    cap->cb           = cb;
    cap->userdata     = userdata;
    if (pa_source)
        strncpy(cap->pa_source, pa_source, sizeof(cap->pa_source) - 1);
    return cap;
}

void audio_capture_free(AudioCapture *cap) {
    if (!cap) return;
    if (cap->stream) {
        Pa_StopStream(cap->stream);
        Pa_CloseStream(cap->stream);
        Pa_Terminate();
    }
    free(cap);
}

int audio_capture_start(AudioCapture *cap) {
#ifdef __linux__
    /* Pre-select the PulseAudio source so the PortAudio default routes to it */
    if (cap->pa_source[0] != '\0') {
        char cmd[512];
        snprintf(cmd, sizeof(cmd),
                 "pactl set-default-source '%s' 2>/dev/null", cap->pa_source);
        int _rc = system(cmd); (void)_rc;
    }
#endif

    int saved;
    stderr_mute(&saved);
    PaError init_err = Pa_Initialize();
    stderr_unmute(saved);

    if (init_err != paNoError) {
        fprintf(stderr, "[audio] Pa_Initialize: %s\n", Pa_GetErrorText(init_err));
        return -1;
    }

#ifdef __linux__
    /* On Linux always use the default device (follows PulseAudio default source) */
    int dev = Pa_GetDefaultInputDevice();
#else
    int dev = (cap->device_index < 0) ? Pa_GetDefaultInputDevice()
                                       : cap->device_index;
#endif

    if (dev == paNoDevice) {
        fprintf(stderr, "[audio] no input device available\n");
        Pa_Terminate();
        return -1;
    }

    const PaDeviceInfo *dev_info = Pa_GetDeviceInfo(dev);
    if (!dev_info) {
        fprintf(stderr, "[audio] Pa_GetDeviceInfo returned NULL\n");
        Pa_Terminate();
        return -1;
    }

    PaStreamParameters params = {0};
    params.device                    = dev;
    params.channelCount              = 1;
    params.sampleFormat              = paFloat32;
    params.suggestedLatency          = dev_info->defaultLowInputLatency;
    params.hostApiSpecificStreamInfo = NULL;

    PaError err = Pa_OpenStream(&cap->stream, &params, NULL,
                                SAMPLE_RATE, FRAMES_PER_BUF,
                                paClipOff, pa_callback, cap);
    if (err != paNoError) {
        fprintf(stderr, "[audio] Pa_OpenStream: %s\n", Pa_GetErrorText(err));
        Pa_Terminate();
        return -1;
    }

    err = Pa_StartStream(cap->stream);
    if (err != paNoError) {
        fprintf(stderr, "[audio] Pa_StartStream: %s\n", Pa_GetErrorText(err));
        Pa_CloseStream(cap->stream);
        cap->stream = NULL;
        Pa_Terminate();
        return -1;
    }
    return 0;
}

void audio_capture_stop(AudioCapture *cap) {
    if (!cap || !cap->stream) return;
    Pa_StopStream(cap->stream);
    Pa_CloseStream(cap->stream);
    cap->stream = NULL;
    Pa_Terminate();
}
