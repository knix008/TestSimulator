#pragma once

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int  index;
    char name[256];       /* human-readable display name */
    char pa_source[256];  /* PulseAudio source name (Linux); empty on macOS */
} AudioDevice;

typedef struct {
    AudioDevice *devices;
    int          count;
} AudioDeviceList;

AudioDeviceList *audio_enumerate_devices(void);
void             audio_device_list_free(AudioDeviceList *list);

/* Called from PortAudio's high-priority callback thread.
   Must be fast and non-blocking. */
typedef void (*audio_frame_cb_t)(const float *frames, int n_frames, void *userdata);

typedef struct AudioCapture AudioCapture;

/* device_index : PortAudio device index, or -1 for default.
   pa_source    : PulseAudio source name to pre-select (Linux).  NULL/empty = keep current. */
AudioCapture *audio_capture_new(int         device_index,
                                const char *pa_source,
                                audio_frame_cb_t cb,
                                void       *userdata);
void          audio_capture_free(AudioCapture *cap);
int           audio_capture_start(AudioCapture *cap);
void          audio_capture_stop(AudioCapture *cap);

#ifdef __cplusplus
}
#endif
