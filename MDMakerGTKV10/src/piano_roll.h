#pragma once
#include <gtk/gtk.h>
#include "midi_parser.h"

typedef struct PianoRoll PianoRoll;

PianoRoll  *piano_roll_new     (void);
void        piano_roll_free    (PianoRoll *pr);

GtkWidget  *piano_roll_widget  (PianoRoll *pr);

void        piano_roll_set_file    (PianoRoll *pr, const MidiFile *mf);
void        piano_roll_set_position(PianoRoll *pr, double seconds);
void        piano_roll_reset       (PianoRoll *pr);
