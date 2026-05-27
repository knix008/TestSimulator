#pragma once
#include <stdint.h>
#include <stdbool.h>

#define MIDI_MAX_TRACKS       256
#define MIDI_MAX_TEMPO_EVENTS 4096

typedef struct {
    int      pitch;
    int      velocity;
    int      channel;
    int      track_index;
    uint32_t start_tick;
    uint32_t end_tick;
    double   start_sec;
    double   end_sec;
} MidiNote;

typedef struct {
    uint32_t tick;
    uint32_t tempo_us;
} TempoEvent;

typedef struct {
    char      name[256];
    int       channel;
    int       instrument;
    MidiNote *notes;
    int       note_count;
} MidiTrack;

typedef struct {
    int        type;
    int        ticks_per_qn;
    MidiTrack  tracks[MIDI_MAX_TRACKS];
    int        track_count;
    TempoEvent tempo_map[MIDI_MAX_TEMPO_EVENTS];
    int        tempo_count;
    MidiNote  *all_notes;
    int        total_notes;
    double     total_seconds;
    int        pitch_min;
    int        pitch_max;
    char       filepath[1024];
} MidiFile;

MidiFile *midi_parse(const char *filepath);
void      midi_free(MidiFile *mf);

double   midi_tick_to_seconds(const MidiFile *mf, uint32_t tick);
uint32_t midi_seconds_to_tick(const MidiFile *mf, double seconds);
