#pragma once
#include "tts_engine.h"

/* Piper TTS engine — drives the `piper` or `piper-tts` CLI binary.
   init() returns false if no piper binary is found in PATH.

   Models (.onnx + .onnx.json pairs) are discovered at startup from:
     ~/.local/share/piper/
     ~/.config/piper/
     /usr/share/piper/
     ./models/

   Korean model:  ko_KR-kss-medium.onnx  (see download_ko_model.sh)

   Speed parameter maps to piper's --length_scale:
     175 WPM  →  1.0 (normal)
     350 WPM  →  0.5 (2× faster)
      88 WPM  →  2.0 (2× slower) */
TTSEngine *tts_piper_new(void);
